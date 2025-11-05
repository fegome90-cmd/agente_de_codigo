/**
 * Observability and monitoring types for Pit Crew system
 * Based on OpenTelemetry integration plan
 */
import { z } from 'zod';
export declare const TraceContextSchema: z.ZodObject<{
    trace_id: z.ZodString;
    span_id: z.ZodString;
    parent_span_id: z.ZodOptional<z.ZodString>;
    sampled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    trace_id: string;
    span_id: string;
    sampled: boolean;
    parent_span_id?: string | undefined;
}, {
    trace_id: string;
    span_id: string;
    sampled: boolean;
    parent_span_id?: string | undefined;
}>;
export type TraceContext = z.infer<typeof TraceContextSchema>;
export declare const GenAISpanAttributesSchema: z.ZodObject<{
    'gen_ai.request.model': z.ZodString;
    'gen_ai.request.temperature': z.ZodOptional<z.ZodNumber>;
    'gen_ai.request.max_tokens': z.ZodOptional<z.ZodNumber>;
    'gen_ai.request.top_p': z.ZodOptional<z.ZodNumber>;
    'gen_ai.request.top_k': z.ZodOptional<z.ZodNumber>;
    'gen_ai.response.id': z.ZodOptional<z.ZodString>;
    'gen_ai.response.model': z.ZodOptional<z.ZodString>;
    'gen_ai.response.finish_reason': z.ZodOptional<z.ZodEnum<["stop", "length", "content_filter", "tool_calls", "function_call"]>>;
    'gen_ai.usage.input_tokens': z.ZodOptional<z.ZodNumber>;
    'gen_ai.usage.output_tokens': z.ZodOptional<z.ZodNumber>;
    'gen_ai.usage.total_tokens': z.ZodOptional<z.ZodNumber>;
    'gen_ai.system': z.ZodString;
    'gen_ai.client.name': z.ZodOptional<z.ZodString>;
    'gen_ai.client.version': z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    'gen_ai.request.model': string;
    'gen_ai.system': string;
    'gen_ai.request.temperature'?: number | undefined;
    'gen_ai.request.max_tokens'?: number | undefined;
    'gen_ai.request.top_p'?: number | undefined;
    'gen_ai.request.top_k'?: number | undefined;
    'gen_ai.response.id'?: string | undefined;
    'gen_ai.response.model'?: string | undefined;
    'gen_ai.response.finish_reason'?: "length" | "stop" | "content_filter" | "tool_calls" | "function_call" | undefined;
    'gen_ai.usage.input_tokens'?: number | undefined;
    'gen_ai.usage.output_tokens'?: number | undefined;
    'gen_ai.usage.total_tokens'?: number | undefined;
    'gen_ai.client.name'?: string | undefined;
    'gen_ai.client.version'?: string | undefined;
}, {
    'gen_ai.request.model': string;
    'gen_ai.system': string;
    'gen_ai.request.temperature'?: number | undefined;
    'gen_ai.request.max_tokens'?: number | undefined;
    'gen_ai.request.top_p'?: number | undefined;
    'gen_ai.request.top_k'?: number | undefined;
    'gen_ai.response.id'?: string | undefined;
    'gen_ai.response.model'?: string | undefined;
    'gen_ai.response.finish_reason'?: "length" | "stop" | "content_filter" | "tool_calls" | "function_call" | undefined;
    'gen_ai.usage.input_tokens'?: number | undefined;
    'gen_ai.usage.output_tokens'?: number | undefined;
    'gen_ai.usage.total_tokens'?: number | undefined;
    'gen_ai.client.name'?: string | undefined;
    'gen_ai.client.version'?: string | undefined;
}>;
export type GenAISpanAttributes = z.infer<typeof GenAISpanAttributesSchema>;
export declare const MetricSchema: z.ZodObject<{
    name: z.ZodString;
    value: z.ZodNumber;
    unit: z.ZodString;
    timestamp: z.ZodString;
    labels: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    trace_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    value: number;
    timestamp: string;
    name: string;
    unit: string;
    trace_id?: string | undefined;
    labels?: Record<string, string> | undefined;
}, {
    value: number;
    timestamp: string;
    name: string;
    unit: string;
    trace_id?: string | undefined;
    labels?: Record<string, string> | undefined;
}>;
export type Metric = z.infer<typeof MetricSchema>;
export declare const AgentPerformanceMetricsSchema: z.ZodObject<{
    agent: z.ZodString;
    task_id: z.ZodString;
    metrics: z.ZodObject<{
        latency_ms: z.ZodNumber;
        tokens_used: z.ZodNumber;
        cost_usd: z.ZodNumber;
        memory_peak_mb: z.ZodNumber;
        cpu_time_ms: z.ZodNumber;
        io_operations: z.ZodNumber;
        network_requests: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        latency_ms: number;
        tokens_used: number;
        cost_usd: number;
        memory_peak_mb: number;
        cpu_time_ms: number;
        io_operations: number;
        network_requests: number;
    }, {
        latency_ms: number;
        tokens_used: number;
        cost_usd: number;
        memory_peak_mb: number;
        cpu_time_ms: number;
        io_operations: number;
        network_requests: number;
    }>;
    quality_metrics: z.ZodOptional<z.ZodObject<{
        findings_count: z.ZodNumber;
        severity_breakdown: z.ZodRecord<z.ZodString, z.ZodNumber>;
        confidence_score: z.ZodOptional<z.ZodNumber>;
        accuracy_score: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        findings_count: number;
        severity_breakdown: Record<string, number>;
        confidence_score?: number | undefined;
        accuracy_score?: number | undefined;
    }, {
        findings_count: number;
        severity_breakdown: Record<string, number>;
        confidence_score?: number | undefined;
        accuracy_score?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    agent: string;
    task_id: string;
    metrics: {
        latency_ms: number;
        tokens_used: number;
        cost_usd: number;
        memory_peak_mb: number;
        cpu_time_ms: number;
        io_operations: number;
        network_requests: number;
    };
    quality_metrics?: {
        findings_count: number;
        severity_breakdown: Record<string, number>;
        confidence_score?: number | undefined;
        accuracy_score?: number | undefined;
    } | undefined;
}, {
    agent: string;
    task_id: string;
    metrics: {
        latency_ms: number;
        tokens_used: number;
        cost_usd: number;
        memory_peak_mb: number;
        cpu_time_ms: number;
        io_operations: number;
        network_requests: number;
    };
    quality_metrics?: {
        findings_count: number;
        severity_breakdown: Record<string, number>;
        confidence_score?: number | undefined;
        accuracy_score?: number | undefined;
    } | undefined;
}>;
export type AgentPerformanceMetrics = z.infer<typeof AgentPerformanceMetricsSchema>;
export declare const SystemHealthMetricsSchema: z.ZodObject<{
    timestamp: z.ZodString;
    system: z.ZodObject<{
        cpu_usage_percent: z.ZodNumber;
        memory_usage_mb: z.ZodNumber;
        disk_usage_mb: z.ZodNumber;
        network_io_bytes: z.ZodObject<{
            read: z.ZodNumber;
            write: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            read: number;
            write: number;
        }, {
            read: number;
            write: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        memory_usage_mb: number;
        cpu_usage_percent: number;
        disk_usage_mb: number;
        network_io_bytes: {
            read: number;
            write: number;
        };
    }, {
        memory_usage_mb: number;
        cpu_usage_percent: number;
        disk_usage_mb: number;
        network_io_bytes: {
            read: number;
            write: number;
        };
    }>;
    processes: z.ZodObject<{
        total: z.ZodNumber;
        active: z.ZodNumber;
        failed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        failed: number;
        total: number;
        active: number;
    }, {
        failed: number;
        total: number;
        active: number;
    }>;
    agents: z.ZodObject<{
        healthy: z.ZodNumber;
        degraded: z.ZodNumber;
        unhealthy: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        healthy: number;
        degraded: number;
        unhealthy: number;
    }, {
        healthy: number;
        degraded: number;
        unhealthy: number;
    }>;
    queues: z.ZodObject<{
        pending_tasks: z.ZodNumber;
        processing_tasks: z.ZodNumber;
        completed_tasks: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        completed_tasks: number;
        pending_tasks: number;
        processing_tasks: number;
    }, {
        completed_tasks: number;
        pending_tasks: number;
        processing_tasks: number;
    }>;
}, "strip", z.ZodTypeAny, {
    timestamp: string;
    system: {
        memory_usage_mb: number;
        cpu_usage_percent: number;
        disk_usage_mb: number;
        network_io_bytes: {
            read: number;
            write: number;
        };
    };
    processes: {
        failed: number;
        total: number;
        active: number;
    };
    agents: {
        healthy: number;
        degraded: number;
        unhealthy: number;
    };
    queues: {
        completed_tasks: number;
        pending_tasks: number;
        processing_tasks: number;
    };
}, {
    timestamp: string;
    system: {
        memory_usage_mb: number;
        cpu_usage_percent: number;
        disk_usage_mb: number;
        network_io_bytes: {
            read: number;
            write: number;
        };
    };
    processes: {
        failed: number;
        total: number;
        active: number;
    };
    agents: {
        healthy: number;
        degraded: number;
        unhealthy: number;
    };
    queues: {
        completed_tasks: number;
        pending_tasks: number;
        processing_tasks: number;
    };
}>;
export type SystemHealthMetrics = z.infer<typeof SystemHealthMetricsSchema>;
export declare const AlertSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    severity: z.ZodEnum<["info", "warning", "error", "critical"]>;
    status: z.ZodEnum<["firing", "resolved"]>;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timestamp: z.ZodString;
    trace_id: z.ZodOptional<z.ZodString>;
    labels: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "firing" | "resolved";
    message: string;
    timestamp: string;
    name: string;
    id: string;
    severity: "error" | "info" | "warning" | "critical";
    trace_id?: string | undefined;
    labels?: Record<string, string> | undefined;
    details?: Record<string, any> | undefined;
}, {
    status: "firing" | "resolved";
    message: string;
    timestamp: string;
    name: string;
    id: string;
    severity: "error" | "info" | "warning" | "critical";
    trace_id?: string | undefined;
    labels?: Record<string, string> | undefined;
    details?: Record<string, any> | undefined;
}>;
export type Alert = z.infer<typeof AlertSchema>;
export declare const DashboardPanelSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    type: z.ZodEnum<["graph", "stat", "table", "heatmap"]>;
    metrics: z.ZodArray<z.ZodString, "many">;
    visualization: z.ZodObject<{
        chart_type: z.ZodOptional<z.ZodEnum<["line", "bar", "pie", "area", "scatter"]>>;
        time_range: z.ZodOptional<z.ZodString>;
        aggregation: z.ZodOptional<z.ZodEnum<["avg", "sum", "max", "min", "count"]>>;
        group_by: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
        time_range?: string | undefined;
        aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
        group_by?: string[] | undefined;
    }, {
        chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
        time_range?: string | undefined;
        aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
        group_by?: string[] | undefined;
    }>;
    alerts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "graph" | "stat" | "table" | "heatmap";
    metrics: string[];
    id: string;
    title: string;
    visualization: {
        chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
        time_range?: string | undefined;
        aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
        group_by?: string[] | undefined;
    };
    alerts?: string[] | undefined;
}, {
    type: "graph" | "stat" | "table" | "heatmap";
    metrics: string[];
    id: string;
    title: string;
    visualization: {
        chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
        time_range?: string | undefined;
        aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
        group_by?: string[] | undefined;
    };
    alerts?: string[] | undefined;
}>;
export type DashboardPanel = z.infer<typeof DashboardPanelSchema>;
export declare const DashboardSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    panels: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        type: z.ZodEnum<["graph", "stat", "table", "heatmap"]>;
        metrics: z.ZodArray<z.ZodString, "many">;
        visualization: z.ZodObject<{
            chart_type: z.ZodOptional<z.ZodEnum<["line", "bar", "pie", "area", "scatter"]>>;
            time_range: z.ZodOptional<z.ZodString>;
            aggregation: z.ZodOptional<z.ZodEnum<["avg", "sum", "max", "min", "count"]>>;
            group_by: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
            time_range?: string | undefined;
            aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
            group_by?: string[] | undefined;
        }, {
            chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
            time_range?: string | undefined;
            aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
            group_by?: string[] | undefined;
        }>;
        alerts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "graph" | "stat" | "table" | "heatmap";
        metrics: string[];
        id: string;
        title: string;
        visualization: {
            chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
            time_range?: string | undefined;
            aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
            group_by?: string[] | undefined;
        };
        alerts?: string[] | undefined;
    }, {
        type: "graph" | "stat" | "table" | "heatmap";
        metrics: string[];
        id: string;
        title: string;
        visualization: {
            chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
            time_range?: string | undefined;
            aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
            group_by?: string[] | undefined;
        };
        alerts?: string[] | undefined;
    }>, "many">;
    time_range: z.ZodDefault<z.ZodString>;
    refresh_interval: z.ZodDefault<z.ZodNumber>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    time_range: string;
    panels: {
        type: "graph" | "stat" | "table" | "heatmap";
        metrics: string[];
        id: string;
        title: string;
        visualization: {
            chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
            time_range?: string | undefined;
            aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
            group_by?: string[] | undefined;
        };
        alerts?: string[] | undefined;
    }[];
    refresh_interval: number;
    description?: string | undefined;
    tags?: string[] | undefined;
}, {
    name: string;
    id: string;
    panels: {
        type: "graph" | "stat" | "table" | "heatmap";
        metrics: string[];
        id: string;
        title: string;
        visualization: {
            chart_type?: "line" | "bar" | "pie" | "area" | "scatter" | undefined;
            time_range?: string | undefined;
            aggregation?: "avg" | "sum" | "max" | "min" | "count" | undefined;
            group_by?: string[] | undefined;
        };
        alerts?: string[] | undefined;
    }[];
    description?: string | undefined;
    time_range?: string | undefined;
    refresh_interval?: number | undefined;
    tags?: string[] | undefined;
}>;
export type Dashboard = z.infer<typeof DashboardSchema>;
export declare const LogEntrySchema: z.ZodObject<{
    timestamp: z.ZodString;
    level: z.ZodEnum<["debug", "info", "warn", "error"]>;
    message: z.ZodString;
    component: z.ZodString;
    trace_id: z.ZodOptional<z.ZodString>;
    span_id: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        message: z.ZodString;
        stack: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        name: string;
        stack?: string | undefined;
    }, {
        message: string;
        name: string;
        stack?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    timestamp: string;
    level: "error" | "info" | "debug" | "warn";
    component: string;
    error?: {
        message: string;
        name: string;
        stack?: string | undefined;
    } | undefined;
    trace_id?: string | undefined;
    span_id?: string | undefined;
    metadata?: Record<string, any> | undefined;
}, {
    message: string;
    timestamp: string;
    level: "error" | "info" | "debug" | "warn";
    component: string;
    error?: {
        message: string;
        name: string;
        stack?: string | undefined;
    } | undefined;
    trace_id?: string | undefined;
    span_id?: string | undefined;
    metadata?: Record<string, any> | undefined;
}>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export declare const CostMetricsSchema: z.ZodObject<{
    timestamp: z.ZodString;
    agent: z.ZodString;
    task_id: z.ZodString;
    model: z.ZodString;
    input_tokens: z.ZodNumber;
    output_tokens: z.ZodNumber;
    cost_per_token: z.ZodNumber;
    total_cost_usd: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    agent: string;
    task_id: string;
    timestamp: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_per_token: number;
    total_cost_usd: number;
    currency: string;
}, {
    agent: string;
    task_id: string;
    timestamp: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_per_token: number;
    total_cost_usd: number;
    currency?: string | undefined;
}>;
export type CostMetrics = z.infer<typeof CostMetricsSchema>;
export declare const QualityGatesKPISchema: z.ZodObject<{
    timestamp: z.ZodString;
    repo: z.ZodString;
    commit: z.ZodString;
    kpis: z.ZodObject<{
        zero_errors_left_behind: z.ZodBoolean;
        adherence: z.ZodNumber;
        mean_fix_latency: z.ZodNumber;
        llm_efficiency: z.ZodNumber;
        cost_optimization: z.ZodNumber;
        test_coverage: z.ZodOptional<z.ZodNumber>;
        code_duplication: z.ZodOptional<z.ZodNumber>;
        technical_debt_ratio: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        zero_errors_left_behind: boolean;
        adherence: number;
        mean_fix_latency: number;
        llm_efficiency: number;
        cost_optimization: number;
        test_coverage?: number | undefined;
        code_duplication?: number | undefined;
        technical_debt_ratio?: number | undefined;
    }, {
        zero_errors_left_behind: boolean;
        adherence: number;
        mean_fix_latency: number;
        llm_efficiency: number;
        cost_optimization: number;
        test_coverage?: number | undefined;
        code_duplication?: number | undefined;
        technical_debt_ratio?: number | undefined;
    }>;
    thresholds: z.ZodRecord<z.ZodString, z.ZodNumber>;
    status: z.ZodEnum<["pass", "fail", "warning"]>;
}, "strip", z.ZodTypeAny, {
    status: "warning" | "pass" | "fail";
    repo: string;
    kpis: {
        zero_errors_left_behind: boolean;
        adherence: number;
        mean_fix_latency: number;
        llm_efficiency: number;
        cost_optimization: number;
        test_coverage?: number | undefined;
        code_duplication?: number | undefined;
        technical_debt_ratio?: number | undefined;
    };
    commit: string;
    timestamp: string;
    thresholds: Record<string, number>;
}, {
    status: "warning" | "pass" | "fail";
    repo: string;
    kpis: {
        zero_errors_left_behind: boolean;
        adherence: number;
        mean_fix_latency: number;
        llm_efficiency: number;
        cost_optimization: number;
        test_coverage?: number | undefined;
        code_duplication?: number | undefined;
        technical_debt_ratio?: number | undefined;
    };
    commit: string;
    timestamp: string;
    thresholds: Record<string, number>;
}>;
export type QualityGatesKPI = z.infer<typeof QualityGatesKPISchema>;
//# sourceMappingURL=observability.d.ts.map