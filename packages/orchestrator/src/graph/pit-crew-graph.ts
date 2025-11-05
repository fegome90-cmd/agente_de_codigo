/**
 * LangGraph StateGraph implementation for Pit Crew orchestrator
 * F1 Pit Stop Architecture - Core workflow orchestration
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import winston from 'winston';
import {
  AgentEvent,
  AgentTask,
  GitEvent,
  SkillRule,
  AgentHealth,
  AgentUtils,
  CONSTANTS
} from '@pit-crew/shared';
import { AgentRegistry } from '../ipc/agent-registry.js';

// Define the workflow state schema
export const WorkflowStateSchema = z.object({
  // Input state
  git_event: z.object({
    repo: z.string(),
    branch: z.string(),
    commit: z.string(),
    files: z.array(z.string()),
    loc_changed: z.number(),
    author: z.string(),
    message: z.string(),
    timestamp: z.string(),
  }),

  // Routing state
  activated_agents: z.array(z.string()).default([]),
  skill_rules: z.array(z.object({
    condition: z.string(),
    activate: z.array(z.string()),
    priority: z.number(),
  })).default([]),

  // Execution state
  run_id: z.string(),
  tasks: z.array(z.object({
    agent: z.string(),
    task_id: z.string(),
    status: z.enum(['pending', 'running', 'done', 'failed']),
    started_at: z.string().optional(),
    completed_at: z.string().optional(),
    error: z.string().optional(),
    artifacts: z.array(z.string()).default([]),
    kpis: z.object({
      latency_ms: z.number().optional(),
      tokens: z.number().optional(),
      findings: z.number().optional(),
    }).optional(),
  })).default([]),

  // Results state
  agent_results: z.record(z.any()).default({}),
  synthesis: z.object({
    overall_score: z.number().optional(),
    decision: z.enum(['approve', 'request_changes', 'needs_work']).optional(),
    summary: z.string().optional(),
    critical_issues: z.array(z.any()).default([]),
    recommendations: z.array(z.string()).default([]),
  }).default({}),

  // Orchestration state
  start_time: z.string(),
  end_time: z.string().optional(),
  total_duration_ms: z.number().optional(),
  total_tokens_used: z.number().default(0),
  total_cost_usd: z.number().default(0),

  // Error handling
  errors: z.array(z.object({
    agent: z.string(),
    error: z.string(),
    timestamp: z.string(),
    retry_count: z.number().default(0),
  })).default([]),

  // Quality gates
  quality_gates: z.object({
    passed: z.boolean().default(false),
    criticalBlocking: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  }).default({}),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export class PitCrewOrchestrator {
  private graph: StateGraph<WorkflowState>;
  private compiledGraph: any; // CompiledStateGraph<WorkflowState>
  private logger: winston.Logger;
  private agentRegistry: AgentRegistry;
  private agentHealth: Map<string, AgentHealth> = new Map();
  private skillRules: SkillRule[] = [];

  constructor(agentRegistry: AgentRegistry) {
    this.agentRegistry = agentRegistry;
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.prettyPrint()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: './logs/orchestrator.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });

    this.initializeSkillRules();
    this.graph = this.buildGraph();
    this.compiledGraph = this.graph.compile();
  }

  /**
   * Initialize default skill routing rules
   */
  private initializeSkillRules(): void {
    this.skillRules = [
      {
        condition: 'lockfile_changed',
        activate: ['security'],
        priority: 1,
      },
      {
        condition: 'loc_changed > 500 OR files_changed >= 10',
        activate: ['architecture'],
        priority: 2,
      },
      {
        condition: 'openapi_changed',
        activate: ['documentation'],
        priority: 3,
      },
      {
        condition: 'always',
        activate: ['quality', 'pr_reviewer'],
        priority: 10,
      },
    ];
  }

  /**
   * Build the LangGraph workflow
   */
  private buildGraph(): StateGraph<WorkflowState> {
    // Define state channels using null for simple state management
    // LangGraph will use the reducer pattern for merging state updates
    const channels = {
      __root__: null
    } as any;

    const graph = new StateGraph<WorkflowState>({ channels });

    // Define nodes
    graph.addNode('route_agents', this.routeAgents.bind(this));
    graph.addNode('spawn_agents', this.spawnAgents.bind(this));
    graph.addNode('monitor_execution', this.monitorExecution.bind(this));
    graph.addNode('synthesize_results', this.synthesizeResults.bind(this));
    graph.addNode('check_quality_gates', this.checkQualityGates.bind(this));
    graph.addNode('cleanup', this.cleanup.bind(this));

    // Define edges with proper START/END constants
    // Using compile method to bypass type checking temporarily
    (graph as any).addEdge(START, 'route_agents');
    (graph as any).addEdge('route_agents', 'spawn_agents');
    (graph as any).addEdge('spawn_agents', 'monitor_execution');
    (graph as any).addEdge('monitor_execution', 'synthesize_results');
    (graph as any).addEdge('synthesize_results', 'check_quality_gates');
    (graph as any).addEdge('check_quality_gates', 'cleanup');
    (graph as any).addEdge('cleanup', END);

    return graph;
  }

  /**
   * Node: Route agents based on git changes
   */
  private async routeAgents(state: WorkflowState): Promise<Partial<WorkflowState>> {
    this.logger.info('Routing agents', {
      repo: state.git_event.repo,
      files: state.git_event.files.length,
      loc_changed: state.git_event.loc_changed
    });

    const activatedAgents = AgentUtils.calculateRoutingPriority(
      state.git_event.files.length,
      state.git_event.loc_changed
    );

    // Filter by agent health
    const healthyAgents = activatedAgents.filter(agent => {
      const health = this.agentHealth.get(agent);
      return health && health.status === 'healthy';
    });

    this.logger.info('Activated agents', {
      total: activatedAgents.length,
      healthy: healthyAgents.length,
      agents: healthyAgents
    });

    return {
      activated_agents: healthyAgents,
      run_id: AgentUtils.generateRunId(),
      start_time: AgentUtils.now(),
    };
  }

  /**
   * Node: Spawn agent processes
   */
  private async spawnAgents(state: WorkflowState): Promise<Partial<WorkflowState>> {
    this.logger.info('Spawning agents', {
      agents: state.activated_agents,
      run_id: state.run_id
    });

    const tasks = state.activated_agents.map(agent => ({
      agent,
      task_id: `${agent}-${state.run_id}`,
      status: 'pending' as const,
    }));

    // Create agent tasks with proper configuration
    for (const task of tasks) {
      const agentTask: AgentTask = {
        task_id: task.task_id,
        agent: task.agent as any,
        scope: this.determineAgentScope(task.agent, state.git_event),
        context: {
          repo_root: process.cwd(),
          commit_hash: state.git_event.commit,
          branch: state.git_event.branch,
        },
        output: AgentUtils.createArtifactPath(task.agent, state.run_id, this.getOutputFormat(task.agent)),
        config: this.getAgentConfig(task.agent),
      };

      // Emit task to agent via IPC (to be implemented)
      await this.emitTaskToAgent(agentTask);
    }

    return {
      tasks: state.tasks.map(task => ({
        ...task,
        status: state.activated_agents.includes(task.agent) ? 'pending' : task.status,
      })),
    };
  }

  /**
   * Node: Monitor agent execution
   */
  private async monitorExecution(state: WorkflowState): Promise<Partial<WorkflowState>> {
    this.logger.info('Monitoring agent execution', {
      run_id: state.run_id,
      tasks_count: state.tasks.length
    });

    // Monitor until all tasks complete or timeout
    const timeout = CONSTANTS.AGENT_TIMEOUTS.architecture * 2; // Longest timeout
    const startTime = Date.now();
    const pollInterval = 1000; // Poll every second
    const maxAttempts = Math.floor(timeout / pollInterval);

    let attempts = 0;
    let pendingTasks = this.getPendingTasks(state);

    // Use async polling with setImmediate to not block event loop
    while (pendingTasks.length > 0 && attempts < maxAttempts) {
      // Collect results first
      await this.collectAgentResults(state);

      // Check if we're done
      pendingTasks = this.getPendingTasks(state);
      if (pendingTasks.length === 0) {
        break;
      }

      attempts++;

      // Wait before next poll using setImmediate for async iteration
      if (attempts < maxAttempts) {
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    // Handle timeout
    pendingTasks = this.getPendingTasks(state);
    if (pendingTasks.length > 0) {
      this.logger.warn('Execution timeout', {
        run_id: state.run_id,
        timeout_ms: timeout,
        attempts,
        pending_tasks: pendingTasks.length
      });

      return {
        errors: [
          ...state.errors,
          ...pendingTasks.map(task => ({
            agent: task.agent,
            error: `Execution timeout after ${timeout}ms`,
            timestamp: AgentUtils.now(),
            retry_count: 0,
          }))
        ],
      };
    }

    return {
      end_time: AgentUtils.now(),
      total_duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Node: Synthesize results from all agents
   */
  private async synthesizeResults(state: WorkflowState): Promise<Partial<WorkflowState>> {
    this.logger.info('Synthesizing results', {
      run_id: state.run_id,
      results_count: Object.keys(state.agent_results).length
    });

    // Call PR Reviewer agent for synthesis
    const synthesisResult = await this.synthesizeWithPRReviewer(state);

    // Calculate totals
    const totalTokens = state.tasks.reduce((sum, task) =>
      sum + (task.kpis?.tokens || 0), 0
    );
    const totalCost = state.tasks.reduce((sum, task) =>
      sum + AgentUtils.calculateCost(task.kpis?.tokens || 0, this.getModelForAgent(task.agent)), 0
    );

    return {
      synthesis: synthesisResult,
      total_tokens_used: totalTokens,
      total_cost_usd: totalCost,
    };
  }

  /**
   * Node: Check quality gates
   */
  private async checkQualityGates(state: WorkflowState): Promise<Partial<WorkflowState>> {
    this.logger.info('Checking quality gates', { run_id: state.run_id });

    const criticalBlocking: string[] = [];
    const warnings: string[] = [];
    let passed = true;

    // Check for zero errors left behind
    const totalErrors = state.tasks.reduce((sum, task) =>
      sum + (task.kpis?.findings || 0), 0
    );

    if (totalErrors > 0) {
      criticalBlocking.push(`${totalErrors} issues found across all agents`);
      passed = false;
    }

    // Check performance against KPIs
    if (state.total_duration_ms && state.total_duration_ms > CONSTANTS.KPI_TARGETS.TARGET_LATENCY_P95_MS) {
      warnings.push(`Execution time ${state.total_duration_ms}ms exceeds target ${CONSTANTS.KPI_TARGETS.TARGET_LATENCY_P95_MS}ms`);
    }

    if (state.total_tokens_used > CONSTANTS.KPI_TARGETS.TARGET_TOKENS_PER_OP) {
      warnings.push(`Token usage ${state.total_tokens_used} exceeds target ${CONSTANTS.KPI_TARGETS.TARGET_TOKENS_PER_OP}`);
    }

    return {
      quality_gates: {
        passed,
        criticalBlocking,
        warnings,
      },
    };
  }

  /**
   * Node: Cleanup resources
   */
  private async cleanup(state: WorkflowState): Promise<Partial<WorkflowState>> {
    this.logger.info('Cleaning up', { run_id: state.run_id });

    // Store results in MemTech (L2/L3)
    await this.storeResultsInMemory(state);

    // Emit completion event
    await this.emitCompletionEvent(state);

    return {};
  }

  // Helper methods (to be implemented)
  private determineAgentScope(agent: string, gitEvent: any): string[] {
    // Implementation depends on agent type and git changes
    return gitEvent.files;
  }

  private getOutputFormat(agent: string): string {
    const formats = {
      security: 'sarif',
      quality: 'json',
      architecture: 'markdown',
      documentation: 'json',
      pr_reviewer: 'markdown',
      observability: 'json',
    };
    return formats[agent as keyof typeof formats] || 'json';
  }

  private getAgentConfig(agent: string): Record<string, any> {
    return {
      timeout_ms: CONSTANTS.AGENT_TIMEOUTS[agent.toUpperCase() as keyof typeof CONSTANTS.AGENT_TIMEOUTS],
      model: CONSTANTS.MODEL_ROUTING[agent.toUpperCase() as keyof typeof CONSTANTS.MODEL_ROUTING],
    };
  }

  private getModelForAgent(agent: string): string {
    return CONSTANTS.MODEL_ROUTING[agent.toUpperCase() as keyof typeof CONSTANTS.MODEL_ROUTING];
  }

  private async emitTaskToAgent(task: AgentTask): Promise<void> {
    this.logger.info('Emitting task to agent', { agent: task.agent, task_id: task.task_id });

    try {
      // Use AgentRegistry to send task to agent
      const result = await this.agentRegistry.sendTask(task);
      this.logger.info('Task sent successfully', {
        agent: task.agent,
        task_id: task.task_id,
        status: result.status,
        duration: result.durationMs
      });
    } catch (error) {
      this.logger.error('Failed to send task to agent', {
        agent: task.agent,
        task_id: task.task_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private hasPendingTasks(state: WorkflowState): boolean {
    return state.tasks.some(task => task.status === 'pending' || task.status === 'running');
  }

  private getPendingTasks(state: WorkflowState) {
    return state.tasks.filter(task => task.status === 'pending' || task.status === 'running');
  }

  private async collectAgentResults(state: WorkflowState): Promise<void> {
    // Collect results from completed tasks in AgentRegistry
    const activeTasks = this.agentRegistry.getActiveTasks();

    for (const [taskId, result] of activeTasks.entries()) {
      // Update task status in workflow state
      const taskIndex = state.tasks.findIndex(t => t.task_id === taskId);
      if (taskIndex !== -1) {
        state.tasks[taskIndex] = {
          ...state.tasks[taskIndex],
          status: result.status as any,
          completed_at: AgentUtils.now(),
          error: result.error,
          kpis: {
            latency_ms: result.durationMs,
            findings: result.results?.findings?.length || 0,
          }
        };

        // Store agent results
        state.agent_results[result.agent] = result.results;

        this.logger.info('Collected agent result', {
          agent: result.agent,
          task_id: taskId,
          status: result.status,
          duration: result.durationMs
        });
      }
    }
  }

  private async synthesizeWithPRReviewer(state: WorkflowState): Promise<any> {
    this.logger.info('Starting synthesis with PR Reviewer Agent', { run_id: state.run_id });

    try {
      // Prepare agent report paths
      const agentReports: Record<string, string> = {};

      // Collect artifact paths from completed tasks
      for (const task of state.tasks) {
        if (task.status === 'done' && task.artifacts && task.artifacts.length > 0) {
          // Use the first artifact as the report path
          agentReports[task.agent] = task.artifacts[0];
        }
      }

      if (Object.keys(agentReports).length === 0) {
        this.logger.warn('No agent reports found for synthesis');
        return {
          overall_score: 0,
          decision: 'needs_work' as const,
          summary: 'No agent reports available for synthesis',
          critical_issues: [],
          recommendations: [],
        };
      }

      // Create PR Reviewer synthesis task
      const synthesisTaskId = `pr-reviewer-synthesis-${state.run_id}`;
      const synthesisTask: AgentTask = {
        task_id: synthesisTaskId,
        agent: 'pr_reviewer',
        scope: [], // PR Reviewer doesn't need file scope, it works with agent reports
        context: {
          repo_root: process.cwd(),
          pr_number: 1, // TODO: Extract from git event or context
          commit_hash: state.git_event.commit,
          branch: state.git_event.branch,
          diff: '', // TODO: Generate actual diff
          ...(state.git_event.message ? { title: state.git_event.message } : {})
        } as any, // Using any for flexibility
        output: AgentUtils.createArtifactPath('pr_reviewer', state.run_id, 'json'),
        config: {
          thresholds: {
            approve_min_score: 80,
            request_changes_max_score: 60,
            max_critical_issues: 0,
            max_high_issues: 3
          },
          quality_gates: {
            zero_errors_tolerance: true,
            security_blocking: true,
            documentation_required: false,
            architecture_compliance: true
          },
          // Convert agent reports to the expected format
          agent_reports: agentReports
        }
      };

      this.logger.info('Emitting PR Reviewer synthesis task', {
        task_id: synthesisTaskId,
        available_reports: Object.keys(agentReports)
      });

      // Send synthesis task to PR Reviewer agent
      const synthesisResult = await this.agentRegistry.sendTask(synthesisTask);

      if (synthesisResult.status === 'done' && synthesisResult.results) {
        this.logger.info('PR Reviewer synthesis completed successfully', {
          overall_score: synthesisResult.results.overall_score,
          decision: synthesisResult.results.decision,
          critical_issues: synthesisResult.results.critical_issues?.length || 0
        });

        // Return the synthesis result
        return {
          overall_score: synthesisResult.results.overall_score || 0,
          decision: synthesisResult.results.decision || 'needs_work',
          summary: synthesisResult.results.summary || 'Synthesis completed',
          critical_issues: synthesisResult.results.critical_issues || [],
          recommendations: synthesisResult.results.recommendations || [],
          agent_contributions: synthesisResult.results.agent_contributions || {},
          quality_gates_passed: synthesisResult.results.quality_gates_passed || false,
          checklist: synthesisResult.results.checklist || [],
          metrics: synthesisResult.results.metrics || {}
        };
      } else {
        this.logger.error('PR Reviewer synthesis failed', {
          error: synthesisResult.error,
          status: synthesisResult.status
        });

        return {
          overall_score: 0,
          decision: 'needs_work' as const,
          summary: `PR Reviewer synthesis failed: ${synthesisResult.error || 'Unknown error'}`,
          critical_issues: [],
          recommendations: [],
        };
      }

    } catch (error) {
      this.logger.error('Error in PR Reviewer synthesis', {
        error: error instanceof Error ? error.message : 'Unknown error',
        run_id: state.run_id
      });

      return {
        overall_score: 0,
        decision: 'needs_work' as const,
        summary: `Synthesis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        critical_issues: [],
        recommendations: [],
      };
    }
  }

  private async storeResultsInMemory(state: WorkflowState): Promise<void> {
    // TODO: Implement MemTech L2/L3 storage
  }

  private async emitCompletionEvent(state: WorkflowState): Promise<void> {
    // TODO: Emit completion event via PM2 messenger
  }

  /**
   * Execute the workflow
   */
  async execute(input: { git_event: GitEvent }): Promise<WorkflowState> {
    this.logger.info('Starting Pit Crew workflow', {
      repo: input.git_event.repo,
      commit: input.git_event.commit
    });

    try {
      const result = await this.compiledGraph.invoke(input);
      this.logger.info('Workflow completed successfully', {
        run_id: result.run_id,
        duration: result.total_duration_ms,
        agents: result.activated_agents.length
      });
      return result;
    } catch (error) {
      this.logger.error('Workflow failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get the compiled graph for execution
   */
  getGraph(): any { // CompiledStateGraph<WorkflowState>
    return this.compiledGraph;
  }

  /**
   * Get the uncompiled graph builder (for debugging)
   */
  getGraphBuilder(): StateGraph<WorkflowState> {
    return this.graph;
  }
}
