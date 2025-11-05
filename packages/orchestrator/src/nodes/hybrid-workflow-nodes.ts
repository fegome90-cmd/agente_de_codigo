/**
 * Hybrid Workflow Nodes
 *
 * Combines deterministic flow with LLM-based decisions at strategic points
 * to create intelligent, adaptive orchestration workflows
 *
 * @author Pit Crew v2.0.0
 * @since 2025-11-03
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { z } from "zod";
import {
  GitEvent,
  AgentHealth,
  SkillRule,
  AgentTask,
  TaskStatus,
} from "@pit-crew/shared";
import {
  SmartRoutingDecisionNode,
  ResultSynthesisDecisionNode,
  QualityValidationDecisionNode,
  LLMDecisionNodeFactory,
} from "./llm-decision-nodes.js";
import { logger } from "../utils/logger.js";
import { EventEmitter } from "events";

/**
 * Hybrid workflow state schema
 */
export const HybridWorkflowStateSchema = z.object({
  // Core workflow data
  gitEvent: z.any().describe("Git event that triggered the workflow"),
  currentPhase: z
    .enum([
      "initialization",
      "routing",
      "execution",
      "synthesis",
      "validation",
      "completion",
    ])
    .describe("Current workflow phase"),
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .describe("Overall workflow status"),

  // Agent management
  availableAgents: z
    .map(z.string(), z.any())
    .describe("Available agents and their health"),
  selectedAgents: z
    .array(z.string())
    .describe("Agents selected for this workflow"),
  agentTasks: z.array(z.any()).describe("Tasks assigned to agents"),

  // Decision tracking
  routingDecision: z.any().optional().describe("LLM routing decision"),
  synthesisDecision: z.any().optional().describe("LLM synthesis decision"),
  validationDecision: z.any().optional().describe("LLM validation decision"),

  // Results and metrics
  agentResults: z.map(z.string(), z.any()).describe("Results from agents"),
  workflowMetrics: z
    .object({
      startTime: z.number(),
      endTime: z.number().optional(),
      totalDuration: z.number().optional(),
      llmDecisionsCount: z.number(),
      fallbacksUsed: z.number(),
    })
    .describe("Workflow execution metrics"),

  // Error handling
  errors: z
    .array(
      z.object({
        phase: z.string(),
        error: z.string(),
        timestamp: z.number(),
        retryCount: z.number(),
      }),
    )
    .describe("Workflow errors and retry attempts"),
});

/**
 * Hybrid Workflow Node Base Class
 */
export abstract class HybridWorkflowNode extends EventEmitter {
  protected nodeType: WorkflowNodeType;
  protected metrics: {
    executionsCount: number;
    successCount: number;
    averageDuration: number;
    errorsCount: number;
  };

  constructor(nodeType: WorkflowNodeType) {
    super();
    this.nodeType = nodeType;
    this.metrics = {
      executionsCount: 0,
      successCount: 0,
      averageDuration: 0,
      errorsCount: 0,
    };
  }

  /**
   * Execute the hybrid workflow node
   */
  async execute(state: HybridWorkflowState): Promise<HybridWorkflowState> {
    const startTime = Date.now();
    this.metrics.executionsCount++;

    try {
      logger.info(`Executing ${this.nodeType} node`, {
        workflowId: this.getWorkflowId(state),
        phase: state.currentPhase,
      });

      // Pre-execution validation
      await this.validateInput(state);

      // Execute node logic
      const updatedState = await this.executeNode(state);

      // Post-execution validation
      await this.validateOutput(updatedState);

      // Update metrics
      const duration = Date.now() - startTime;
      this.updateMetrics(true, duration);

      this.emit("nodeCompleted", {
        nodeType: this.nodeType,
        duration,
        success: true,
      });

      return updatedState;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);

      logger.error(`${this.nodeType} node failed`, {
        error: error.message,
        workflowId: this.getWorkflowId(state),
        duration,
      });

      // Add error to state
      state.errors.push({
        phase: state.currentPhase,
        error: error.message,
        timestamp: Date.now(),
        retryCount: 0,
      });

      this.emit("nodeFailed", {
        nodeType: this.nodeType,
        error: error.message,
        duration,
      });

      throw error;
    }
  }

  protected abstract executeNode(
    state: HybridWorkflowState,
  ): Promise<HybridWorkflowState>;

  protected abstract validateInput(state: HybridWorkflowState): Promise<void>;
  protected abstract validateOutput(state: HybridWorkflowState): Promise<void>;

  protected getWorkflowId(state: HybridWorkflowState): string {
    return `${state.gitEvent.type}-${state.gitEvent.commitHash}-${Date.now()}`;
  }

  private updateMetrics(success: boolean, duration: number): void {
    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.errorsCount++;
    }

    this.metrics.averageDuration =
      (this.metrics.averageDuration * (this.metrics.executionsCount - 1) +
        duration) /
      this.metrics.executionsCount;
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

/**
 * Initialization Node - Prepares workflow context and validates inputs
 */
export class InitializationNode extends HybridWorkflowNode {
  constructor() {
    super("initialization");
  }

  protected async validateInput(state: HybridWorkflowState): Promise<void> {
    if (!state.gitEvent) {
      throw new Error("Git event is required for workflow initialization");
    }

    if (!state.availableAgents || state.availableAgents.size === 0) {
      throw new Error("No available agents for workflow execution");
    }
  }

  protected async executeNode(
    state: HybridWorkflowState,
  ): Promise<HybridWorkflowState> {
    logger.info("Initializing hybrid workflow", {
      eventType: state.gitEvent.type,
      filesChanged: state.gitEvent.files.length,
      availableAgents: state.availableAgents.size,
    });

    // Initialize workflow metrics
    state.workflowMetrics = {
      startTime: Date.now(),
      llmDecisionsCount: 0,
      fallbacksUsed: 0,
    };

    // Set initial phase
    state.currentPhase = "initialization";
    state.status = "running";

    // Prepare agent health snapshot
    const agentHealthSnapshot = new Map<string, AgentHealth>();
    state.availableAgents.forEach((health, name) => {
      agentHealthSnapshot.set(name, { ...health });
    });

    // Initialize results map
    state.agentResults = new Map();

    logger.info("Workflow initialization completed", {
      workflowId: this.getWorkflowId(state),
    });

    return state;
  }

  protected async validateOutput(state: HybridWorkflowState): Promise<void> {
    if (!state.workflowMetrics.startTime) {
      throw new Error("Workflow metrics not properly initialized");
    }

    if (state.agentResults.size !== 0) {
      throw new Error("Agent results should be empty at initialization");
    }
  }
}

/**
 * Smart Routing Node - Uses LLM for intelligent agent selection
 */
export class SmartRoutingNode extends HybridWorkflowNode {
  private routingNode: SmartRoutingDecisionNode;

  constructor() {
    super("routing");
    this.routingNode = LLMDecisionNodeFactory.createRoutingNode();
  }

  protected async validateInput(state: HybridWorkflowState): Promise<void> {
    if (state.currentPhase !== "initialization") {
      throw new Error(
        "Smart routing can only be executed after initialization",
      );
    }

    if (!state.gitEvent || !state.availableAgents) {
      throw new Error(
        "Git event and available agents are required for routing",
      );
    }
  }

  protected async executeNode(
    state: HybridWorkflowState,
  ): Promise<HybridWorkflowState> {
    logger.info("Executing smart routing", {
      workflowId: this.getWorkflowId(state),
      eventType: state.gitEvent.type,
    });

    state.currentPhase = "routing";

    // Prepare deterministic routing plan as fallback
    const deterministicPlan = this.createDeterministicRoutingPlan(state);

    // Execute LLM routing decision with fallback
    const routingDecision = await this.routingNode.executeDecision(
      {
        gitEvent: state.gitEvent,
        availableAgents: state.availableAgents,
        skillRules: [], // TODO: Load skill rules from config
        deterministicPlan,
      },
      () => deterministicPlan, // Fallback logic
    );

    // Store routing decision
    state.routingDecision = routingDecision.decision;
    state.selectedAgents = routingDecision.decision.selectedAgents;

    // Update metrics
    if (routingDecision.fallbackUsed) {
      state.workflowMetrics.fallbacksUsed++;
    } else {
      state.workflowMetrics.llmDecisionsCount++;
    }

    // Create agent tasks based on routing decision
    state.agentTasks = this.createAgentTasks(
      state.selectedAgents,
      state.gitEvent,
      routingDecision.decision.routingStrategy,
    );

    logger.info("Smart routing completed", {
      workflowId: this.getWorkflowId(state),
      selectedAgents: state.selectedAgents,
      routingStrategy: routingDecision.decision.routingStrategy,
      confidence: routingDecision.confidence,
      fallbackUsed: routingDecision.fallbackUsed,
    });

    return state;
  }

  protected async validateOutput(state: HybridWorkflowState): Promise<void> {
    if (!state.selectedAgents || state.selectedAgents.length === 0) {
      throw new Error("No agents selected by routing decision");
    }

    if (!state.agentTasks || state.agentTasks.length === 0) {
      throw new Error("No agent tasks created");
    }

    if (!state.routingDecision) {
      throw new Error("Routing decision not stored");
    }
  }

  private createDeterministicRoutingPlan(
    state: HybridWorkflowState,
  ): RoutingPlan {
    const fileTypes = new Set(
      state.gitEvent.files.map((f: any) => f.path.split(".").pop()),
    );
    const selectedAgents: string[] = [];

    // Always include security agent for code changes
    if (fileTypes.has("ts") || fileTypes.has("js") || fileTypes.has("py")) {
      selectedAgents.push("security-agent");
    }

    // Include quality agent for TypeScript/JavaScript
    if (fileTypes.has("ts") || fileTypes.has("js")) {
      selectedAgents.push("quality-agent");
    }

    // Include documentation agent for docs or API changes
    if (
      fileTypes.has("md") ||
      state.gitEvent.files.some((f: any) => f.path.includes("api"))
    ) {
      selectedAgents.push("documentation-agent");
    }

    // Default to at least one agent if none selected
    if (selectedAgents.length === 0) {
      selectedAgents.push("quality-agent");
    }

    return {
      primaryAgent: selectedAgents[0],
      supportingAgents: selectedAgents.slice(1),
      routingStrategy: selectedAgents.length > 1 ? "parallel" : "sequential",
      estimatedDuration: selectedAgents.length * 5,
      confidence: 0.7,
      reasoning: "Deterministic fallback routing based on file types",
    };
  }

  private createAgentTasks(
    selectedAgents: string[],
    gitEvent: GitEvent,
    strategy: string,
  ): AgentTask[] {
    return selectedAgents.map((agentName, index) => ({
      id: `${agentName}-${Date.now()}-${index}`,
      agentName,
      taskType: "analysis",
      scope: gitEvent.files.map((f) => f.path),
      status: "pending" as TaskStatus,
      priority: "normal",
      dependencies:
        strategy === "sequential" && index > 0
          ? [selectedAgents[index - 1]]
          : [],
      createdAt: Date.now(),
      timeout: 300000, // 5 minutes
    }));
  }
}

/**
 * Agent Execution Node - Orchestrates parallel/sequential agent execution
 */
export class AgentExecutionNode extends HybridWorkflowNode {
  constructor() {
    super("execution");
  }

  protected async validateInput(state: HybridWorkflowState): Promise<void> {
    if (state.currentPhase !== "routing") {
      throw new Error("Agent execution can only be executed after routing");
    }

    if (!state.agentTasks || state.agentTasks.length === 0) {
      throw new Error("No agent tasks to execute");
    }
  }

  protected async executeNode(
    state: HybridWorkflowState,
  ): Promise<HybridWorkflowState> {
    logger.info("Starting agent execution", {
      workflowId: this.getWorkflowId(state),
      taskCount: state.agentTasks.length,
      routingStrategy: state.routingDecision.routingStrategy,
    });

    state.currentPhase = "execution";

    // Execute tasks based on routing strategy
    if (state.routingDecision.routingStrategy === "parallel") {
      await this.executeParallelTasks(state);
    } else if (state.routingDecision.routingStrategy === "sequential") {
      await this.executeSequentialTasks(state);
    } else {
      await this.executeHybridTasks(state);
    }

    // Validate all tasks completed
    const failedTasks = state.agentTasks.filter(
      (task) => task.status === "failed",
    );
    if (failedTasks.length > 0) {
      logger.warn("Some tasks failed during execution", {
        workflowId: this.getWorkflowId(state),
        failedTasks: failedTasks.length,
      });
    }

    logger.info("Agent execution completed", {
      workflowId: this.getWorkflowId(state),
      successfulTasks: state.agentTasks.filter((t) => t.status === "completed")
        .length,
      failedTasks: failedTasks.length,
    });

    return state;
  }

  protected async validateOutput(state: HybridWorkflowState): Promise<void> {
    if (state.agentResults.size === 0) {
      throw new Error("No agent results collected");
    }

    const incompleteTasks = state.agentTasks.filter(
      (task) => task.status === "pending" || task.status === "running",
    );

    if (incompleteTasks.length > 0) {
      throw new Error(`${incompleteTasks.length} tasks remain incomplete`);
    }
  }

  private async executeParallelTasks(
    state: HybridWorkflowState,
  ): Promise<void> {
    const promises = state.agentTasks.map((task) =>
      this.executeAgentTask(task, state),
    );
    await Promise.allSettled(promises);
  }

  private async executeSequentialTasks(
    state: HybridWorkflowState,
  ): Promise<void> {
    for (const task of state.agentTasks) {
      await this.executeAgentTask(task, state);

      // Check if task failed and should stop sequential execution
      if (task.status === "failed") {
        logger.warn("Sequential execution stopped due to task failure", {
          taskId: task.id,
          agentName: task.agentName,
        });
        break;
      }
    }
  }

  private async executeHybridTasks(state: HybridWorkflowState): Promise<void> {
    // Hybrid strategy: run independent tasks in parallel, dependent tasks sequentially
    const independentTasks = state.agentTasks.filter(
      (task) => task.dependencies.length === 0,
    );
    const dependentTasks = state.agentTasks.filter(
      (task) => task.dependencies.length > 0,
    );

    // Execute independent tasks in parallel
    await Promise.allSettled(
      independentTasks.map((task) => this.executeAgentTask(task, state)),
    );

    // Execute dependent tasks sequentially
    for (const task of dependentTasks) {
      await this.executeAgentTask(task, state);
    }
  }

  private async executeAgentTask(
    task: AgentTask,
    state: HybridWorkflowState,
  ): Promise<void> {
    task.status = "running";
    task.startedAt = Date.now();

    try {
      // TODO: Implement actual agent execution via IPC
      // For now, simulate agent execution
      const mockResult = await this.simulateAgentExecution(task);

      // Store result
      state.agentResults.set(task.agentName, mockResult);
      task.status = "completed";
      task.completedAt = Date.now();

      logger.debug("Agent task completed", {
        taskId: task.id,
        agentName: task.agentName,
        duration: task.completedAt - task.startedAt,
      });
    } catch (error) {
      task.status = "failed";
      task.error = error.message;
      task.completedAt = Date.now();

      logger.error("Agent task failed", {
        taskId: task.id,
        agentName: task.agentName,
        error: error.message,
      });
    }
  }

  private async simulateAgentExecution(
    task: AgentTask,
  ): Promise<AnalysisResult> {
    // Simulate variable execution time
    const executionTime = Math.random() * 2000 + 1000; // 1-3 seconds
    await new Promise((resolve) => setTimeout(resolve, executionTime));

    // Generate mock analysis result based on agent type
    const baseResult = {
      agentName: task.agentName,
      timestamp: Date.now(),
      duration: executionTime,
      status: "completed" as const,
      summary: `Mock analysis from ${task.agentName}`,
      issues: this.generateMockIssues(task.agentName),
      metrics: {
        filesAnalyzed: task.scope.length,
        linesOfCode: Math.floor(Math.random() * 1000) + 100,
        complexity: Math.floor(Math.random() * 10) + 1,
      },
    };

    return baseResult;
  }

  private generateMockIssues(agentName: string): any[] {
    const issueCount = Math.floor(Math.random() * 5);
    const issues = [];

    for (let i = 0; i < issueCount; i++) {
      const severities = ["critical", "high", "medium", "low"];
      const severity =
        severities[Math.floor(Math.random() * severities.length)];

      issues.push({
        id: `${agentName}-issue-${i}`,
        severity,
        message: `Mock ${severity} issue from ${agentName}`,
        file: `src/mock-file-${i}.ts`,
        line: Math.floor(Math.random() * 100) + 1,
        rule: `mock-${agentName}-rule`,
      });
    }

    return issues;
  }
}

/**
 * LLM Synthesis Node - Uses LLM for intelligent result synthesis
 */
export class LLMSynthesisNode extends HybridWorkflowNode {
  private synthesisNode: ResultSynthesisDecisionNode;

  constructor() {
    super("synthesis");
    this.synthesisNode = LLMDecisionNodeFactory.createSynthesisNode();
  }

  protected async validateInput(state: HybridWorkflowState): Promise<void> {
    if (state.currentPhase !== "execution") {
      throw new Error("Synthesis can only be executed after agent execution");
    }

    if (state.agentResults.size === 0) {
      throw new Error("No agent results to synthesize");
    }
  }

  protected async executeNode(
    state: HybridWorkflowState,
  ): Promise<HybridWorkflowState> {
    logger.info("Starting LLM synthesis", {
      workflowId: this.getWorkflowId(state),
      resultCount: state.agentResults.size,
    });

    state.currentPhase = "synthesis";

    // Execute LLM synthesis decision with fallback
    const synthesisDecision = await this.synthesisNode.executeDecision(
      {
        agentResults: state.agentResults,
        gitEvent: state.gitEvent,
      },
      () => this.createDeterministicSynthesis(state), // Fallback logic
    );

    // Store synthesis decision
    state.synthesisDecision = synthesisDecision.decision;

    // Update metrics
    if (synthesisDecision.fallbackUsed) {
      state.workflowMetrics.fallbacksUsed++;
    } else {
      state.workflowMetrics.llmDecisionsCount++;
    }

    logger.info("LLM synthesis completed", {
      workflowId: this.getWorkflowId(state),
      recommendation: synthesisDecision.decision.finalRecommendation,
      confidence: synthesisDecision.confidence,
      fallbackUsed: synthesisDecision.fallbackUsed,
    });

    return state;
  }

  protected async validateOutput(state: HybridWorkflowState): Promise<void> {
    if (!state.synthesisDecision) {
      throw new Error("Synthesis decision not stored");
    }
  }

  private createDeterministicSynthesis(state: HybridWorkflowState) {
    const totalIssues = Array.from(state.agentResults.values()).reduce(
      (total, result) => total + (result.issues?.length || 0),
      0,
    );

    const criticalIssues = Array.from(state.agentResults.values()).reduce(
      (total, result) =>
        total +
        (result.issues?.filter((i) => i.severity === "critical").length || 0),
      0,
    );

    let finalRecommendation:
      | "approve"
      | "request_changes"
      | "comment"
      | "escalate";

    if (criticalIssues > 0) {
      finalRecommendation = "request_changes";
    } else if (totalIssues > 10) {
      finalRecommendation = "request_changes";
    } else if (totalIssues > 0) {
      finalRecommendation = "comment";
    } else {
      finalRecommendation = "approve";
    }

    return {
      overallAssessment: `Deterministic synthesis found ${totalIssues} total issues`,
      confidence: 0.7,
      contradictions: [],
      finalRecommendation,
      priorityIssues: [],
      executionSummary: `Synthesis completed deterministically for ${state.agentResults.size} agent results`,
    };
  }
}

/**
 * Workflow Completion Node - Finalizes workflow and prepares output
 */
export class WorkflowCompletionNode extends HybridWorkflowNode {
  constructor() {
    super("completion");
  }

  protected async validateInput(state: HybridWorkflowState): Promise<void> {
    if (state.currentPhase !== "synthesis") {
      throw new Error("Completion can only be executed after synthesis");
    }

    if (!state.synthesisDecision) {
      throw new Error("Synthesis decision is required for workflow completion");
    }
  }

  protected async executeNode(
    state: HybridWorkflowState,
  ): Promise<HybridWorkflowState> {
    logger.info("Completing hybrid workflow", {
      workflowId: this.getWorkflowId(state),
      finalRecommendation: state.synthesisDecision.finalRecommendation,
    });

    state.currentPhase = "completion";
    state.status = "completed";

    // Finalize workflow metrics
    state.workflowMetrics.endTime = Date.now();
    state.workflowMetrics.totalDuration =
      state.workflowMetrics.endTime - state.workflowMetrics.startTime;

    // Create final workflow result
    const finalResult = {
      workflowId: this.getWorkflowId(state),
      gitEvent: state.gitEvent,
      finalRecommendation: state.synthesisDecision.finalRecommendation,
      confidence: state.synthesisDecision.confidence,
      agentResults: Object.fromEntries(state.agentResults),
      routingDecision: state.routingDecision,
      synthesisDecision: state.synthesisDecision,
      metrics: state.workflowMetrics,
      errors: state.errors,
      completedAt: Date.now(),
    };

    // Store final result in state for output
    (state as any).finalResult = finalResult;

    logger.info("Hybrid workflow completed successfully", {
      workflowId: this.getWorkflowId(state),
      totalDuration: state.workflowMetrics.totalDuration,
      llmDecisionsCount: state.workflowMetrics.llmDecisionsCount,
      fallbacksUsed: state.workflowMetrics.fallbacksUsed,
    });

    return state;
  }

  protected async validateOutput(state: HybridWorkflowState): Promise<void> {
    if (state.status !== "completed") {
      throw new Error("Workflow status should be completed");
    }

    if (!state.workflowMetrics.endTime) {
      throw new Error("Workflow end time not set");
    }

    if (!state.workflowMetrics.totalDuration) {
      throw new Error("Workflow total duration not calculated");
    }
  }
}

/**
 * Hybrid Workflow Builder - Constructs the complete workflow graph
 */
export class HybridWorkflowBuilder {
  private graph: StateGraph<HybridWorkflowState>;

  constructor() {
    this.graph = new StateGraph({
      stateSchema: HybridWorkflowStateSchema,
      channels: {},
    });
  }

  /**
   * Build the complete hybrid workflow
   */
  build(): CompiledGraph<HybridWorkflowState> {
    // Create workflow nodes
    const initializationNode = new InitializationNode();
    const routingNode = new SmartRoutingNode();
    const executionNode = new AgentExecutionNode();
    const synthesisNode = new LLMSynthesisNode();
    const completionNode = new WorkflowCompletionNode();

    // Add nodes to graph
    this.graph
      .addNode("initialization", (state) => initializationNode.execute(state))
      .addNode("routing", (state) => routingNode.execute(state))
      .addNode("execution", (state) => executionNode.execute(state))
      .addNode("synthesis", (state) => synthesisNode.execute(state))
      .addNode("completion", (state) => completionNode.execute(state));

    // Define workflow edges
    this.graph
      .addEdge(START, "initialization")
      .addEdge("initialization", "routing")
      .addEdge("routing", "execution")
      .addEdge("execution", "synthesis")
      .addEdge("synthesis", "completion")
      .addEdge("completion", END);

    // Compile the graph
    return this.graph.compile();
  }

  /**
   * Get workflow metrics from all nodes
   */
  getWorkflowMetrics(): Record<string, any> {
    return {
      llmDecisions: LLMDecisionNodeFactory.getAllMetrics(),
      workflowNodes: {
        initialization: new InitializationNode().getMetrics(),
        routing: new SmartRoutingNode().getMetrics(),
        execution: new AgentExecutionNode().getMetrics(),
        synthesis: new LLMSynthesisNode().getMetrics(),
        completion: new WorkflowCompletionNode().getMetrics(),
      },
    };
  }
}
