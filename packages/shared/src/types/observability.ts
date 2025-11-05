/**
 * Observability and monitoring types for Pit Crew system
 * Based on OpenTelemetry integration plan
 */

import { z } from 'zod';

// Trace and span types
export const TraceContextSchema = z.object({
  trace_id: z.string().length(32), // Hex string
  span_id: z.string().length(16), // Hex string
  parent_span_id: z.string().length(16).optional(),
  sampled: z.boolean(),
});

export type TraceContext = z.infer<typeof TraceContextSchema>;

// OpenTelemetry semantic conventions for GenAI
export const GenAISpanAttributesSchema = z.object({
  'gen_ai.request.model': z.string(),
  'gen_ai.request.temperature': z.number().optional(),
  'gen_ai.request.max_tokens': z.number().optional(),
  'gen_ai.request.top_p': z.number().optional(),
  'gen_ai.request.top_k': z.number().optional(),
  'gen_ai.response.id': z.string().optional(),
  'gen_ai.response.model': z.string().optional(),
  'gen_ai.response.finish_reason': z.enum(['stop', 'length', 'content_filter', 'tool_calls', 'function_call']).optional(),
  'gen_ai.usage.input_tokens': z.number().optional(),
  'gen_ai.usage.output_tokens': z.number().optional(),
  'gen_ai.usage.total_tokens': z.number().optional(),
  'gen_ai.system': z.string(), // e.g., "anthropic", "openai"
  'gen_ai.client.name': z.string().optional(),
  'gen_ai.client.version': z.string().optional(),
});

export type GenAISpanAttributes = z.infer<typeof GenAISpanAttributesSchema>;

// Metrics definitions
export const MetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.string(), // ISO 8601
  labels: z.record(z.string()).optional(),
  trace_id: z.string().optional(),
});

export type Metric = z.infer<typeof MetricSchema>;

// Performance metrics specific to agents
export const AgentPerformanceMetricsSchema = z.object({
  agent: z.string(),
  task_id: z.string(),
  metrics: z.object({
    latency_ms: z.number(),
    tokens_used: z.number(),
    cost_usd: z.number(),
    memory_peak_mb: z.number(),
    cpu_time_ms: z.number(),
    io_operations: z.number(),
    network_requests: z.number(),
  }),
  quality_metrics: z.object({
    findings_count: z.number(),
    severity_breakdown: z.record(z.number()),
    confidence_score: z.number().optional(),
    accuracy_score: z.number().optional(),
  }).optional(),
});

export type AgentPerformanceMetrics = z.infer<typeof AgentPerformanceMetricsSchema>;

// System health metrics
export const SystemHealthMetricsSchema = z.object({
  timestamp: z.string(),
  system: z.object({
    cpu_usage_percent: z.number(),
    memory_usage_mb: z.number(),
    disk_usage_mb: z.number(),
    network_io_bytes: z.object({
      read: z.number(),
      write: z.number(),
    }),
  }),
  processes: z.object({
    total: z.number(),
    active: z.number(),
    failed: z.number(),
  }),
  agents: z.object({
    healthy: z.number(),
    degraded: z.number(),
    unhealthy: z.number(),
  }),
  queues: z.object({
    pending_tasks: z.number(),
    processing_tasks: z.number(),
    completed_tasks: z.number(),
  }),
});

export type SystemHealthMetrics = z.infer<typeof SystemHealthMetricsSchema>;

// Alert definitions
export const AlertSchema = z.object({
  id: z.string(),
  name: z.string(),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  status: z.enum(['firing', 'resolved']),
  message: z.string(),
  details: z.record(z.any()).optional(),
  timestamp: z.string(),
  trace_id: z.string().optional(),
  labels: z.record(z.string()).optional(),
});

export type Alert = z.infer<typeof AlertSchema>;

// Dashboard panel definitions
export const DashboardPanelSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['graph', 'stat', 'table', 'heatmap']),
  metrics: z.array(z.string()),
  visualization: z.object({
    chart_type: z.enum(['line', 'bar', 'pie', 'area', 'scatter']).optional(),
    time_range: z.string().optional(), // e.g., "1h", "24h", "7d"
    aggregation: z.enum(['avg', 'sum', 'max', 'min', 'count']).optional(),
    group_by: z.array(z.string()).optional(),
  }),
  alerts: z.array(z.string()).optional(), // Metric names to monitor
});

export type DashboardPanel = z.infer<typeof DashboardPanelSchema>;

// Dashboard configuration
export const DashboardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  panels: z.array(DashboardPanelSchema),
  time_range: z.string().default('1h'),
  refresh_interval: z.number().default(5000), // ms
  tags: z.array(z.string()).optional(),
});

export type Dashboard = z.infer<typeof DashboardSchema>;

// Log entry structure
export const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  component: z.string(),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

// Cost tracking
export const CostMetricsSchema = z.object({
  timestamp: z.string(),
  agent: z.string(),
  task_id: z.string(),
  model: z.string(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cost_per_token: z.number(),
  total_cost_usd: z.number(),
  currency: z.string().default('USD'),
});

export type CostMetrics = z.infer<typeof CostMetricsSchema>;

// Quality gates KPIs
export const QualityGatesKPISchema = z.object({
  timestamp: z.string(),
  repo: z.string(),
  commit: z.string(),
  kpis: z.object({
    zero_errors_left_behind: z.boolean(),
    adherence: z.number(), // % of quality gates passed
    mean_fix_latency: z.number(), // minutes
    llm_efficiency: z.number(), // tokens per analysis
    cost_optimization: z.number(), // target vs actual ratio
    test_coverage: z.number().optional(),
    code_duplication: z.number().optional(),
    technical_debt_ratio: z.number().optional(),
  }),
  thresholds: z.record(z.number()),
  status: z.enum(['pass', 'fail', 'warning']),
});

export type QualityGatesKPI = z.infer<typeof QualityGatesKPISchema>;