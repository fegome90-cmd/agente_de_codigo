/**
 * Hybrid Workflow Types for Pit-Crew Multi-Agent System
 * F1 Pit Stop Architecture - Workflow orchestration types
 */

/**
 * Task status enumeration
 */
export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled"
}

/**
 * Workflow node types
 */
export type WorkflowNodeType =
  | "initialization"
  | "routing"
  | "execution"
  | "completion"
  | "security_analysis"
  | "quality_analysis"
  | "documentation_analysis"
  | "architecture_analysis";

/**
 * Agent types in the system
 */
export type AgentType =
  | "security"
  | "quality"
  | "documentation"
  | "architecture"
  | "pr_reviewer"
  | "observability";

/**
 * Git event information
 */
export interface GitEvent {
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
  }>;
  commit: {
    hash: string;
    message: string;
    author: string;
  };
  branch: string;
  timestamp: number;
}

/**
 * Agent health information
 */
export interface AgentHealth {
  status: "healthy" | "degraded" | "unhealthy";
  lastCheck: number;
  responseTime: number;
  errorRate: number;
}

/**
 * Hybrid workflow state
 */
export interface HybridWorkflowState {
  // Workflow identification
  workflowId: string;
  runId: string;

  // Git context
  gitEvent: GitEvent;

  // Workflow control
  currentPhase: WorkflowNodeType;
  status: TaskStatus;

  // Agent management
  availableAgents: Map<string, AgentHealth>;
  selectedAgents: AgentType[];

  // Task management
  agentTasks: Array<{
    id: string;
    agentName: AgentType;
    taskType: string;
    scope: string[];
    status: TaskStatus;
    priority: string;
    dependencies: string[];
    createdAt: number;
    timeout: number;
    result?: any;
    error?: string;
  }>;

  // Timing and metrics
  startTime: number;
  endTime?: number;
  duration?: number;

  // Results and outputs
  results: Map<string, any>;
  errors: string[];

  // Configuration
  config: {
    maxConcurrentAgents: number;
    timeoutMs: number;
    retryAttempts: number;
    enableFallbacks: boolean;
  };
}

/**
 * Routing plan for agent selection
 */
export interface RoutingPlan {
  selectedAgents: Array<{
    agent: AgentType;
    priority: number;
    estimatedDuration: number;
    dependencies: string[];
  }>;
  executionOrder: string[];
  totalEstimatedDuration: number;
}

/**
 * Workflow metrics
 */
export interface WorkflowMetrics {
  totalDuration: number;
  agentExecutionTimes: Map<string, number>;
  successRate: number;
  errorCount: number;
  resourceUsage: {
    memory: number;
    cpu: number;
    tokens: number;
  };
}

// Export TaskStatus as default for backwards compatibility
export default TaskStatus;
