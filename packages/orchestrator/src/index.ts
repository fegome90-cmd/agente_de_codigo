#!/usr/bin/env node

/**
 * Pit Crew Orchestrator Main Entry Point
 * F1 Pit Stop Architecture - LangGraph-based multi-agent orchestration
 */

import dotenv from "dotenv";
import winston from "winston";
import PMX from "@pm2/io";
import { PitCrewOrchestrator } from "./graph/pit-crew-graph.js";
import { SocketServer } from "./ipc/socket-server.js";
import { AgentRegistry } from "./ipc/agent-registry.js";
import {
  GitEvent,
  AgentUtils,
  ManualReviewTriggerSchema,
} from "@pit-crew/shared";
import { HybridWorkflowBuilder } from "./nodes/hybrid-workflow-nodes.js";
import { IntelligentRouter } from "./routing/intelligent-router.js";
import { TwoManRuleIntegration } from "./two-man-rule/two-man-rule-integration.js";
import { CircuitBreakerFactory } from "./circuit-breaker/circuit-breaker-factory.js";
import * as path from "path";
import * as fs from "fs";
import chokidar from "chokidar";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length
        ? JSON.stringify(meta, null, 2)
        : "";
      return `${timestamp} [${level}]: ${message} ${metaStr}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "./logs/orchestrator.log",
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

class OrchestratorService {
  private orchestrator: PitCrewOrchestrator;
  private socketServer: SocketServer;
  private agentRegistry: AgentRegistry;
  private hybridWorkflowBuilder: HybridWorkflowBuilder;
  private intelligentRouter: IntelligentRouter;
  private twoManRuleIntegration: TwoManRuleIntegration;
  private pmx: any;

  constructor() {
    // Initialize socket server and agent registry
    const socketPath =
      process.env.SOCKET_PATH ||
      process.env.PIT_CREW_SOCKET_PATH ||
      "/tmp/pit-crew-orchestrator.sock";
    this.socketServer = new SocketServer(socketPath);
    this.agentRegistry = new AgentRegistry(this.socketServer);

    // Initialize hybrid components
    this.hybridWorkflowBuilder = new HybridWorkflowBuilder();
    this.intelligentRouter = new IntelligentRouter({
      enableLLMRouting: process.env.ENABLE_LLM_ROUTING !== "false",
      maxConcurrentAgents: parseInt(process.env.MAX_CONCURRENT_AGENTS || "5"),
      enableCaching: process.env.ENABLE_ROUTING_CACHE !== "false",
    });
    this.twoManRuleIntegration = new TwoManRuleIntegration({
      enableWorkflowApproval: process.env.ENABLE_WORKFLOW_APPROVAL === "true",
      enableAgentApproval: process.env.ENABLE_AGENT_APPROVAL === "true",
      autoApproveTestEnvironments: process.env.AUTO_APPROVE_TEST !== "false",
    });

    // Initialize orchestrator with agent registry
    this.orchestrator = new PitCrewOrchestrator(this.agentRegistry);

    // Initialize circuit breakers for system components
    this.initializeCircuitBreakers();

    this.setupPM2Metrics();
    this.setupGracefulShutdown();
  }

  /**
   * Initialize circuit breakers for system components
   */
  private initializeCircuitBreakers(): void {
    // Create circuit breakers for critical system components
    CircuitBreakerFactory.createSystemCircuitBreakers();

    // Create circuit breakers for agent communication
    const agentNames = [
      "security-agent",
      "quality-agent",
      "documentation-agent",
      "architecture-agent",
    ];
    CircuitBreakerFactory.createAgentCircuitBreakers(agentNames);

    logger.info(
      "Circuit breakers initialized for hybrid orchestration components",
    );
  }

  /**
   * Setup PM2 metrics and monitoring
   */
  private setupPM2Metrics(): void {
    this.pmx = PMX;
    this.pmx.init({
      http: true,
      metrics: {
        eventLoopDump: true,
      },
    });

    // Custom metrics
    const activeWorkflows = this.pmx.metric({
      name: "Active Workflows",
      id: "app/active_workflows",
    });

    const completedWorkflows = this.pmx.metric({
      name: "Completed Workflows",
      id: "app/completed_workflows",
    });

    const totalExecutionTime = this.pmx.metric({
      name: "Total Execution Time (ms)",
      id: "app/total_execution_time",
    });

    const errorRate = this.pmx.metric({
      name: "Error Rate (%)",
      id: "app/error_rate",
    });

    // Hybrid orchestration metrics
    const llmDecisions = this.pmx.metric({
      name: "LLM Decisions",
      id: "app/llm_decisions",
    });

    const circuitBreakerStatus = this.pmx.metric({
      name: "Circuit Breaker Status",
      id: "app/circuit_breaker_status",
    });

    const twoManRuleApprovals = this.pmx.metric({
      name: "Two-Man Rule Approvals",
      id: "app/two_man_rule_approvals",
    });

    // Actions
    this.pmx.action("get-status", (reply: any) => {
      reply({
        status: "running",
        uptime: process.uptime(),
        hybridComponents: {
          intelligentRouter: !!this.intelligentRouter,
          twoManRule: !!this.twoManRuleIntegration,
          hybridWorkflows: !!this.hybridWorkflowBuilder,
        },
      });
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Stop socket server
        await this.socketServer.stop();
        logger.info("Socket server stopped");

        // Cleanup agent registry
        this.agentRegistry.cleanup();
        logger.info("Agent registry cleaned up");

        // Wait for active workflows to complete or timeout
        await new Promise((resolve) => setTimeout(resolve, 5000));
        logger.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown", { error });
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  /**
   * Handle incoming git events
   */
  async handleGitEvent(gitEvent: GitEvent): Promise<void> {
    logger.info("Processing git event", {
      repo: gitEvent.repo,
      commit: gitEvent.commit,
      files: gitEvent.files.length,
      loc_changed: gitEvent.loc_changed,
    });

    try {
      const result = await this.orchestrator.execute({ git_event: gitEvent });

      logger.info("Workflow completed", {
        run_id: result.run_id,
        duration: result.total_duration_ms,
        agents: result.activated_agents.length,
        tokens_used: result.total_tokens_used,
        cost_usd: result.total_cost_usd,
        quality_gates_passed: result.quality_gates.passed,
      });

      // PM2 metrics temporarily disabled
      logger.info("Workflow completed - PM2 metrics disabled");
    } catch (error) {
      logger.error("Workflow failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        repo: gitEvent.repo,
        commit: gitEvent.commit,
      });

      logger.error("Workflow failed - PM2 metrics disabled");
      throw error;
    }
  }

  /**
   * Start the orchestrator service
   */
  async start(): Promise<void> {
    logger.info("Starting Pit Crew Orchestrator", {
      node_version: process.version,
      env: process.env.NODE_ENV,
      obs_path: process.env.OBS_PATH,
      socket_path: process.env.SOCKET_PATH,
      max_concurrent_agents: process.env.MAX_CONCURRENT_AGENTS,
    });

    // Validate environment
    this.validateEnvironment();

    // Start socket server
    await this.socketServer.start();
    logger.info("Socket server started", {
      socketPath: this.socketServer["socketPath"],
    });

    // Start listening for events
    this.startEventListeners();

    logger.info("Pit Crew Orchestrator started successfully");
  }

  /**
   * Validate environment variables
   */
  private validateEnvironment(): void {
    const requiredVars = ["OBS_PATH"];
    const missing = requiredVars.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`,
      );
    }

    // Create directories if they don't exist

    const obsPath = process.env.OBS_PATH || "./obs";
    const dirs = [
      path.join(obsPath, "reports"),
      path.join(obsPath, "artifacts"),
      path.join(obsPath, "memory", "L2"),
      path.join(obsPath, "memory", "L3"),
      "./logs",
    ];

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info("Created directory", { dir });
      }
    });
  }

  /**
   * Start event listeners for PM2 IPC and file system
   */
  private startEventListeners(): void {
    // PM2 IPC listener for daemon events
    if (process.send) {
      process.on("message", (msg: any) => {
        if (msg.type === "git_event") {
          this.handleGitEvent(msg.data);
        }
      });
    }

    // File system watcher for manual trigger files

    const triggerDir = path.join(process.env.OBS_PATH || "./obs", "triggers");
    if (!fs.existsSync(triggerDir)) {
      fs.mkdirSync(triggerDir, { recursive: true });
    }

    const watcher = chokidar.watch(path.join(triggerDir, "*.json"));

    watcher.on("add", async (filePath: string) => {
      try {
        const content = fs.readFileSync(filePath, "utf8");

        // CRITICAL: Parse and validate JSON with Zod schema
        let parsedJson: any;
        try {
          parsedJson = JSON.parse(content);
        } catch (parseError) {
          logger.error("Invalid JSON in trigger file", {
            filePath,
            error:
              parseError instanceof Error
                ? parseError.message
                : "Unknown error",
          });
          // Remove malicious or malformed file
          fs.unlinkSync(filePath);
          return;
        }

        // Validate against schema to prevent malicious input
        let validatedEvent: any;
        try {
          validatedEvent = ManualReviewTriggerSchema.parse(parsedJson);
        } catch (validationError) {
          logger.error("Trigger file validation failed", {
            filePath,
            error:
              validationError instanceof Error
                ? validationError.message
                : "Unknown error",
            issues: (validationError as any)?.issues || [],
          });
          // Remove invalid file
          fs.unlinkSync(filePath);
          return;
        }

        // Only process if validation succeeds
        if (validatedEvent.type === "manual_review") {
          logger.info("Manual review triggered", {
            filePath,
            scopeSize: validatedEvent.scope.length,
            agents: validatedEvent.options?.agents || "all",
          });

          // Process the validated git event
          await this.handleGitEvent(validatedEvent.git_event);
        }

        // Clean up trigger file
        fs.unlinkSync(filePath);
        logger.debug("Trigger file processed and cleaned up", { filePath });
      } catch (error) {
        logger.error("Error processing trigger file", {
          filePath,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Attempt to clean up even on error
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (cleanupError) {
          logger.error("Failed to clean up trigger file", {
            filePath,
            cleanupError:
              cleanupError instanceof Error
                ? cleanupError.message
                : "Unknown error",
          });
        }
      }
    });

    logger.info("Event listeners started");
  }
}

// Main execution
async function main() {
  const service = new OrchestratorService();

  try {
    await service.start();
  } catch (error) {
    logger.error("Failed to start orchestrator", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Export for testing
export { OrchestratorService };

// Run if called directly (ESM-safe check)
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch(console.error);
}
