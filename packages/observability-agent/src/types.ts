/**
 * Types and interfaces for Observability Agent
 * Monitoring, metrics, and alerting for multi-agent system
 */

export interface AgentMetrics {
  agent_name: string;
  status: "idle" | "busy" | "error" | "stopped" | "degraded";
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  throughput_per_minute: number;
  error_rate_percent: number;
  memory_usage_mb: number;
  cpu_usage_percent: number;
  last_activity: string;
  active_tasks: number;
  total_tasks_completed: number;
}

export interface SystemHealth {
  overall_status: "healthy" | "degraded" | "critical";
  timestamp: string;
  total_agents: number;
  active_agents: number;
  healthy_agents: number;
  degraded_agents: number;
  critical_agents: number;
  total_memory_usage_mb: number;
  total_cpu_usage_percent: number;
  recent_alerts: AlertEvent[];
}

export interface AlertEvent {
  id: string;
  timestamp: string;
  severity: "info" | "warning" | "critical";
  source: "agent" | "system" | "infrastructure" | "rule_evaluation";
  agent_name?: string;
  metric_name?: string;
  current_value: number;
  threshold_value: number;
  message: string;
  status: "active" | "acknowledged" | "resolved";
}

export interface MetricData {
  name: string;
  type: "counter" | "gauge" | "histogram" | "summary";
  value: number;
  labels?: Record<string, string | number>;
  timestamp: string;
}

export interface TraceData {
  trace_id: string;
  span_id: string;
  operation_name: string;
  agent_name: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  status: "success" | "error" | "timeout";
  attributes?: Record<string, any>;
}

export interface DashboardConfig {
  title: string;
  panels: PanelConfig[];
  refresh_interval: string;
  time_range: string;
}

export interface PanelConfig {
  title: string;
  type: "stat" | "graph" | "table" | "gauge";
  queries: PanelQuery[];
  visualization: PanelVisualization;
  alerts?: PanelAlert[];
}

export interface PanelQuery {
  expr: string;
  legend?: string;
  ref_id: string;
}

export interface PanelVisualization {
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  thresholds?: Threshold[];
  colors?: ColorConfig[];
}

export interface Threshold {
  value: number;
  color: string;
  op: "gt" | "lt" | "gte" | "lte" | "eq";
}

export interface ColorConfig {
  mode: "fixed" | "thresholds";
  color: string;
}

export interface PanelAlert {
  conditions: AlertCondition[];
  frequency: string;
  severity: "info" | "warning" | "critical";
  annotations: Record<string, string>;
}

export interface AlertCondition {
  metric: string;
  operator: "gt" | "lt" | "gte" | "lte" | "eq";
  threshold: number;
  for_duration: string;
}

export interface AgentCapabilities {
  supportsMetrics: boolean;
  supportsTracing: boolean;
  supportsAlerting: boolean;
  supportsDashboards: boolean;
  tools: string[];
  metrics: string[];
  features: string[];
}

export interface ObservabilityConfig {
  opentelemetry: {
    service_name: string;
    service_version: string;
    trace_exporter_url: string;
    metrics_exporter_url: string;
  };
  prometheus: {
    port: number;
    path: string;
    default_labels: Record<string, string>;
  };
  alerting: {
    enabled: boolean;
    webhook_url?: string;
    email_config?: {
      smtp_server: string;
      smtp_port: number;
      username: string;
      password: string;
      from_address: string;
      to_addresses: string[];
    };
    rules: AlertRule[];
  };
  dashboards: {
    grafana_url?: string;
    dashboard_path: string;
    auto_refresh_interval: string;
  };
  monitoring: {
    collection_interval: string;
    agent_health_check_interval: string;
    metrics_retention_days: number;
    trace_retention_days: number;
  };
}

export interface AlertRule {
  name: string;
  description: string;
  severity: "info" | "warning" | "critical";
  condition: AlertCondition[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
  duration: string;
}

export interface HealthCheckResult {
  component: string;
  status: "healthy" | "degraded" | "critical" | "unknown";
  timestamp: string;
  response_time_ms?: number;
  details?: string | Record<string, any>;
  error?: string;
}

export interface AgentRegistrationData {
  agent_name: string;
  agent_type: string;
  version: string;
  capabilities: AgentCapabilities;
  health_status: string;
  metrics_endpoint?: string;
  last_seen: string;
}
