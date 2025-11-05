/**
 * Shared types, interfaces, and utilities for Pit Crew multi-agent system
 * F1 Pit Stop Architecture - Centralized type definitions
 */
export * from './types/agent-events';
export * from './types/observability';
export * from './types/file-system';
import type { AgentEvent } from './types/agent-events';
export type { AgentEvent, AgentTask, GitEvent, SkillManifest, AgentHealth, } from './types/agent-events';
export type { TraceContext, AgentPerformanceMetrics, SystemHealthMetrics, Alert, } from './types/observability';
export type { SARIFReport, QualityReport, ArchitectureReport, DocumentationReport, PRReviewReport, MemTechL2, MemTechL3, } from './types/file-system';
export type { GenAISpanAttributes, Metric, Dashboard, LogEntry, CostMetrics, QualityGatesKPI, } from './types/observability';
export type { Artifact, } from './types/file-system';
export declare class AgentUtils {
    /**
     * Generate a unique run ID in the format r-xxxx
     */
    static generateRunId(): string;
    /**
     * Generate a timestamp in ISO 8601 format
     */
    static now(): string;
    /**
     * Calculate the priority for skill routing based on file changes
     */
    static calculateRoutingPriority(filesChanged: number, locChanged: number): string[];
    /**
     * Determine agent status based on KPIs
     */
    static determineAgentStatus(kpis: {
        latency_ms: number;
        tokens: number;
        target_latency_p95?: number;
        target_tokens_per_op?: number;
    }): 'healthy' | 'degraded' | 'unhealthy';
    /**
     * Calculate cost based on token usage
     */
    static calculateCost(tokens: number, model: string): number;
    /**
     * Validate that an agent event has required fields
     */
    static validateAgentEvent(event: any): event is AgentEvent;
    /**
     * Create a file path for artifacts in /obs structure
     */
    static createArtifactPath(agent: string, runId: string, type: string): string;
    /**
     * Check if an agent should be activated based on git changes
     */
    static shouldActivateAgent(agent: string, files: string[], patterns: {
        pattern: string;
        description?: string;
    }[]): boolean;
}
export declare const CONSTANTS: {
    readonly AGENT_TIMEOUTS: {
        readonly security: 60000;
        readonly quality: 45000;
        readonly architecture: 90000;
        readonly documentation: 30000;
        readonly pr_reviewer: 15000;
        readonly observability: 10000;
    };
    readonly PATHS: {
        readonly OBS_ROOT: "../../obs";
        readonly REPORTS_DIR: "../../obs/reports";
        readonly ARTIFACTS_DIR: "../../obs/artifacts";
        readonly MEMORY_L2_DIR: "../../obs/memory/L2";
        readonly MEMORY_L3_DIR: "../../obs/memory/L3";
        readonly LOGS_DIR: "./logs";
    };
    readonly KPI_TARGETS: {
        readonly TARGET_LATENCY_P95_MS: 30000;
        readonly TARGET_TOKENS_PER_OP: 30000;
        readonly TARGET_COST_PER_REVIEW_USD: 0.5;
        readonly TARGET_ACCURACY: 0.85;
        readonly TARGET_RECALL: 0.9;
    };
    readonly CIRCUIT_BREAKER: {
        readonly FAILURE_THRESHOLD: 5;
        readonly TIMEOUT_MS: 60000;
        readonly HALF_OPEN_REQUESTS: 2;
        readonly MONITORING_PERIOD_MS: 10000;
    };
    readonly MODEL_ROUTING: {
        readonly SECURITY: "claude-sonnet-4-5-20250929";
        readonly ARCHITECTURE: "claude-sonnet-4-5-20250929";
        readonly DOCUMENTATION: "claude-sonnet-4-5-20250929";
        readonly QUALITY: "glm-4.6";
        readonly PR_REVIEWER: "claude-sonnet-4-5-20250929";
        readonly OBSERVABILITY: "glm-4.6";
    };
};
export default AgentUtils;
//# sourceMappingURL=index.d.ts.map