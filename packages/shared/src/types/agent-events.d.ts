/**
 * Core types for agent events and communication
 * Based on F1 Pit Stop architecture plan
 */
import { z } from 'zod';
export declare const AgentEventSchema: z.ZodObject<{
    ts: z.ZodString;
    agent: z.ZodEnum<["security", "quality", "documentation", "architecture", "pr_reviewer", "observability"]>;
    run_id: z.ZodString;
    repo: z.ZodString;
    scope: z.ZodArray<z.ZodString, "many">;
    status: z.ZodEnum<["pending", "running", "done", "failed"]>;
    artifacts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    kpis: z.ZodOptional<z.ZodObject<{
        latency_ms: z.ZodNumber;
        tokens: z.ZodNumber;
        findings: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        latency_ms: number;
        tokens: number;
        findings?: number | undefined;
    }, {
        latency_ms: number;
        tokens: number;
        findings?: number | undefined;
    }>>;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ts: string;
    agent: "security" | "quality" | "documentation" | "architecture" | "pr_reviewer" | "observability";
    status: "pending" | "running" | "done" | "failed";
    run_id: string;
    repo: string;
    scope: string[];
    artifacts?: string[] | undefined;
    kpis?: {
        latency_ms: number;
        tokens: number;
        findings?: number | undefined;
    } | undefined;
    error?: string | undefined;
}, {
    ts: string;
    agent: "security" | "quality" | "documentation" | "architecture" | "pr_reviewer" | "observability";
    status: "pending" | "running" | "done" | "failed";
    run_id: string;
    repo: string;
    scope: string[];
    artifacts?: string[] | undefined;
    kpis?: {
        latency_ms: number;
        tokens: number;
        findings?: number | undefined;
    } | undefined;
    error?: string | undefined;
}>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export declare const AgentTaskSchema: z.ZodObject<{
    task_id: z.ZodString;
    agent: z.ZodEnum<["security", "quality", "documentation", "architecture", "pr_reviewer", "observability"]>;
    scope: z.ZodArray<z.ZodString, "many">;
    context: z.ZodObject<{
        repo_root: z.ZodString;
        diff: z.ZodOptional<z.ZodString>;
        commit_hash: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
        pr_number: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        repo_root: string;
        diff?: string | undefined;
        commit_hash?: string | undefined;
        branch?: string | undefined;
        pr_number?: number | undefined;
    }, {
        repo_root: string;
        diff?: string | undefined;
        commit_hash?: string | undefined;
        branch?: string | undefined;
        pr_number?: number | undefined;
    }>;
    output: z.ZodString;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    agent: "security" | "quality" | "documentation" | "architecture" | "pr_reviewer" | "observability";
    scope: string[];
    task_id: string;
    context: {
        repo_root: string;
        diff?: string | undefined;
        commit_hash?: string | undefined;
        branch?: string | undefined;
        pr_number?: number | undefined;
    };
    output: string;
    config?: Record<string, any> | undefined;
}, {
    agent: "security" | "quality" | "documentation" | "architecture" | "pr_reviewer" | "observability";
    scope: string[];
    task_id: string;
    context: {
        repo_root: string;
        diff?: string | undefined;
        commit_hash?: string | undefined;
        branch?: string | undefined;
        pr_number?: number | undefined;
    };
    output: string;
    config?: Record<string, any> | undefined;
}>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export declare const SkillRuleSchema: z.ZodObject<{
    condition: z.ZodString;
    activate: z.ZodArray<z.ZodEnum<["security", "quality", "documentation", "architecture", "pr_reviewer"]>, "many">;
    priority: z.ZodDefault<z.ZodNumber>;
    conditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    condition: string;
    activate: ("security" | "quality" | "documentation" | "architecture" | "pr_reviewer")[];
    priority: number;
    conditions?: string[] | undefined;
}, {
    condition: string;
    activate: ("security" | "quality" | "documentation" | "architecture" | "pr_reviewer")[];
    priority?: number | undefined;
    conditions?: string[] | undefined;
}>;
export type SkillRule = z.infer<typeof SkillRuleSchema>;
export declare const GitEventSchema: z.ZodObject<{
    event: z.ZodLiteral<"task.completed">;
    repo: z.ZodString;
    branch: z.ZodString;
    commit: z.ZodString;
    files: z.ZodArray<z.ZodString, "many">;
    loc_changed: z.ZodNumber;
    timestamp: z.ZodString;
    author: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    repo: string;
    branch: string;
    event: "task.completed";
    commit: string;
    files: string[];
    loc_changed: number;
    timestamp: string;
    author: string;
}, {
    message: string;
    repo: string;
    branch: string;
    event: "task.completed";
    commit: string;
    files: string[];
    loc_changed: number;
    timestamp: string;
    author: string;
}>;
export type GitEvent = z.infer<typeof GitEventSchema>;
export declare const SkillManifestSchema: z.ZodObject<{
    agent: z.ZodString;
    version: z.ZodString;
    capabilities: z.ZodArray<z.ZodString, "many">;
    triggers: z.ZodObject<{
        auto: z.ZodArray<z.ZodObject<{
            pattern: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            pattern: string;
            description?: string | undefined;
        }, {
            pattern: string;
            description?: string | undefined;
        }>, "many">;
        explicit: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        auto: {
            pattern: string;
            description?: string | undefined;
        }[];
        explicit: boolean;
    }, {
        auto: {
            pattern: string;
            description?: string | undefined;
        }[];
        explicit?: boolean | undefined;
    }>;
    kpis: z.ZodObject<{
        target_latency_p95: z.ZodNumber;
        target_tokens_per_op: z.ZodNumber;
        expected_recall: z.ZodOptional<z.ZodNumber>;
        expected_precision: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        target_latency_p95: number;
        target_tokens_per_op: number;
        expected_recall?: number | undefined;
        expected_precision?: number | undefined;
    }, {
        target_latency_p95: number;
        target_tokens_per_op: number;
        expected_recall?: number | undefined;
        expected_precision?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    agent: string;
    kpis: {
        target_latency_p95: number;
        target_tokens_per_op: number;
        expected_recall?: number | undefined;
        expected_precision?: number | undefined;
    };
    version: string;
    capabilities: string[];
    triggers: {
        auto: {
            pattern: string;
            description?: string | undefined;
        }[];
        explicit: boolean;
    };
}, {
    agent: string;
    kpis: {
        target_latency_p95: number;
        target_tokens_per_op: number;
        expected_recall?: number | undefined;
        expected_precision?: number | undefined;
    };
    version: string;
    capabilities: string[];
    triggers: {
        auto: {
            pattern: string;
            description?: string | undefined;
        }[];
        explicit?: boolean | undefined;
    };
}>;
export type SkillManifest = z.infer<typeof SkillManifestSchema>;
export declare const CircuitBreakerStateSchema: z.ZodEnum<["closed", "open", "half_open"]>;
export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;
export declare const CircuitBreakerConfigSchema: z.ZodObject<{
    failure_threshold: z.ZodDefault<z.ZodNumber>;
    timeout_ms: z.ZodDefault<z.ZodNumber>;
    half_open_requests: z.ZodDefault<z.ZodNumber>;
    monitoring_period_ms: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    failure_threshold: number;
    timeout_ms: number;
    half_open_requests: number;
    monitoring_period_ms: number;
}, {
    failure_threshold?: number | undefined;
    timeout_ms?: number | undefined;
    half_open_requests?: number | undefined;
    monitoring_period_ms?: number | undefined;
}>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export declare const AgentHealthSchema: z.ZodObject<{
    agent: z.ZodString;
    status: z.ZodEnum<["healthy", "degraded", "unhealthy"]>;
    last_heartbeat: z.ZodString;
    uptime_ms: z.ZodNumber;
    memory_usage_mb: z.ZodNumber;
    cpu_usage_percent: z.ZodNumber;
    active_tasks: z.ZodNumber;
    completed_tasks: z.ZodNumber;
    failed_tasks: z.ZodNumber;
    average_latency_ms: z.ZodNumber;
    circuit_breaker_state: z.ZodEnum<["closed", "open", "half_open"]>;
}, "strip", z.ZodTypeAny, {
    agent: string;
    status: "healthy" | "degraded" | "unhealthy";
    last_heartbeat: string;
    uptime_ms: number;
    memory_usage_mb: number;
    cpu_usage_percent: number;
    active_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    average_latency_ms: number;
    circuit_breaker_state: "closed" | "open" | "half_open";
}, {
    agent: string;
    status: "healthy" | "degraded" | "unhealthy";
    last_heartbeat: string;
    uptime_ms: number;
    memory_usage_mb: number;
    cpu_usage_percent: number;
    active_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    average_latency_ms: number;
    circuit_breaker_state: "closed" | "open" | "half_open";
}>;
export type AgentHealth = z.infer<typeof AgentHealthSchema>;
//# sourceMappingURL=agent-events.d.ts.map