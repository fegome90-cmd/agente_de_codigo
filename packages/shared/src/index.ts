/**
 * Shared types, interfaces, and utilities for Pit Crew multi-agent system
 * F1 Pit Stop Architecture - Centralized type definitions
 */

// Export all types
export * from "./types/agent-events.js";
export * from "./types/observability.js";
export * from "./types/file-system.js";
export * from "./types/hybrid-workflow.js";
export * from "./tool-registry/tool-registry.js";

// Import specific types for internal use
import type { AgentEvent } from "./types/agent-events.js";

// Re-export commonly used combinations
export type {
  AgentEvent,
  AgentTask,
  GitEvent,
  SkillManifest,
  AgentHealth,
  ManualReviewTrigger,
} from "./types/agent-events.js";

// Export schemas for validation
export { ManualReviewTriggerSchema } from "./types/agent-events.js";

export type {
  TraceContext,
  AgentPerformanceMetrics,
  SystemHealthMetrics,
  Alert,
} from "./types/observability.js";

export type {
  SARIFReport,
  QualityReport,
  ArchitectureReport,
  DocumentationReport,
  PRReviewReport,
  MemTechL2,
  MemTechL3,
} from "./types/file-system.js";

export type {
  GenAISpanAttributes,
  Metric,
  Dashboard,
  LogEntry,
  CostMetrics,
  QualityGatesKPI,
} from "./types/observability.js";

export type { Artifact } from "./types/file-system.js";

// Utility functions for common operations
export class AgentUtils {
  /**
   * Generate a unique run ID in the format r-xxxx
   */
  static generateRunId(): string {
    const chars = "0123456789abcdef";
    let result = "r-";
    for (let i = 0; i < 4; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * Generate a timestamp in ISO 8601 format
   */
  static now(): string {
    return new Date().toISOString();
  }

  /**
   * Calculate the priority for skill routing based on file changes
   */
  static calculateRoutingPriority(
    filesChanged: number,
    locChanged: number,
  ): string[] {
    const agents: string[] = ["quality", "pr_reviewer"]; // Always active

    // Security triggers
    if (filesChanged > 0) {
      const hasSecurityFiles = filesChanged > 0; // Would check actual file patterns
      if (hasSecurityFiles) {
        agents.push("security");
      }
    }

    // Architecture triggers
    if (locChanged > 500 || filesChanged >= 10) {
      agents.push("architecture");
    }

    // Documentation triggers
    if (filesChanged > 0) {
      const hasDocFiles = filesChanged > 0; // Would check actual file patterns
      if (hasDocFiles) {
        agents.push("documentation");
      }
    }

    return agents;
  }

  /**
   * Determine agent status based on KPIs
   */
  static determineAgentStatus(kpis: {
    latency_ms: number;
    tokens: number;
    target_latency_p95?: number;
    target_tokens_per_op?: number;
  }): "healthy" | "degraded" | "unhealthy" {
    if (!kpis.target_latency_p95 || !kpis.target_tokens_per_op) {
      return "degraded";
    }

    const latencyRatio = kpis.latency_ms / kpis.target_latency_p95;
    const tokenRatio = kpis.tokens / kpis.target_tokens_per_op;

    if (latencyRatio > 2.0 || tokenRatio > 2.0) {
      return "unhealthy";
    } else if (latencyRatio > 1.5 || tokenRatio > 1.5) {
      return "degraded";
    }

    return "healthy";
  }

  /**
   * Calculate cost based on token usage
   */
  static calculateCost(tokens: number, model: string): number {
    // Simplified cost calculation - would use actual pricing
    const costPerToken = {
      "claude-sonnet-4-5-20250929": 0.015 / 1000,
      "glm-4.6": 0.002 / 1000,
      "claude-3-haiku-20240307": 0.00025 / 1000,
    };

    const rate =
      costPerToken[model as keyof typeof costPerToken] || 0.01 / 1000;
    return tokens * rate;
  }

  /**
   * Validate that an agent event has required fields
   */
  static validateAgentEvent(event: any): event is AgentEvent {
    return (
      typeof event === "object" &&
      typeof event.ts === "string" &&
      typeof event.agent === "string" &&
      typeof event.run_id === "string" &&
      typeof event.repo === "string" &&
      Array.isArray(event.scope) &&
      typeof event.status === "string"
    );
  }

  /**
   * Create a file path for artifacts in /obs structure
   */
  static createArtifactPath(
    agent: string,
    runId: string,
    type: string,
  ): string {
    const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return `../../obs/reports/${agent}-${runId}-${timestamp}.${type}`;
  }

  /**
   * Check if an agent should be activated based on git changes
   */
  static shouldActivateAgent(
    agent: string,
    files: string[],
    patterns: { pattern: string; description?: string }[],
  ): boolean {
    // Always activate for some agents
    if (["quality", "pr_reviewer"].includes(agent)) {
      return true;
    }

    // Check pattern matching for other agents
    for (const file of files) {
      for (const pattern of patterns) {
        // Simple pattern matching - would use proper glob matching
        if (
          file.includes(pattern.pattern.replace("**/", "").replace("*.", ""))
        ) {
          return true;
        }
      }
    }

    return false;
  }
}

// Constants for the system
export const CONSTANTS = {
  // Agent timeouts (milliseconds)
  AGENT_TIMEOUTS: {
    security: 60000, // 1 minute
    quality: 45000, // 45 seconds
    architecture: 90000, // 1.5 minutes
    documentation: 30000, // 30 seconds
    pr_reviewer: 15000, // 15 seconds
    observability: 10000, // 10 seconds
  },

  // File paths
  PATHS: {
    OBS_ROOT: "../../obs",
    REPORTS_DIR: "../../obs/reports",
    ARTIFACTS_DIR: "../../obs/artifacts",
    MEMORY_L2_DIR: "../../obs/memory/L2",
    MEMORY_L3_DIR: "../../obs/memory/L3",
    LOGS_DIR: "./logs",
  },

  // KPI targets
  KPI_TARGETS: {
    TARGET_LATENCY_P95_MS: 30000, // 30 seconds total
    TARGET_TOKENS_PER_OP: 30000, // 30K tokens total
    TARGET_COST_PER_REVIEW_USD: 0.5, // 50 cents
    TARGET_ACCURACY: 0.85, // 85% accuracy
    TARGET_RECALL: 0.9, // 90% recall
  },

  // Circuit breaker defaults
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 5,
    TIMEOUT_MS: 60000,
    HALF_OPEN_REQUESTS: 2,
    MONITORING_PERIOD_MS: 10000,
  },

  // Model selection preferences
  MODEL_ROUTING: {
    SECURITY: "claude-sonnet-4-5-20250929",
    ARCHITECTURE: "claude-sonnet-4-5-20250929",
    DOCUMENTATION: "claude-sonnet-4-5-20250929",
    QUALITY: "glm-4.6",
    PR_REVIEWER: "claude-sonnet-4-5-20250929",
    OBSERVABILITY: "glm-4.6",
  },
} as const;

export default AgentUtils;
