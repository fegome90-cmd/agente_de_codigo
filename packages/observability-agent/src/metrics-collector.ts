/**
 * Prometheus Metrics Collection System
 * Collects and exports metrics from all agents in the system
 */

import {
  register,
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Summary,
} from "prom-client";
import { logger, logHelpers } from "./simple-logger.js";
import { AgentMetrics, MetricData } from "./types.js";

export class MetricsCollector {
  private agentMetrics: Map<string, AgentMetrics> = new Map();
  private metricDefinitions: Map<string, any> = new Map();
  private readonly metricNameMap: Record<string, string> = {
    // AgentMetrics -> defined metric names
    throughput_per_minute: "agent_throughput",
    error_rate_percent: "agent_error_rate",
    memory_usage_mb: "agent_memory_usage",
    cpu_usage_percent: "agent_cpu_usage",
    active_tasks: "agent_active_tasks",
    total_tasks_completed: "agent_tasks_completed",
  };
  private collectionInterval?: NodeJS.Timeout;

  constructor() {
    this.initializeDefaultMetrics();
    this.setupProcessMetrics();
  }

  /**
   * Initialize default metrics
   */
  private initializeDefaultMetrics(): void {
    // Collect default Node.js metrics
    collectDefaultMetrics({
      register,
      prefix: "pit_crew_",
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      eventLoopMonitoringPrecision: 10,
    });

    // Custom application metrics
    this.defineMetrics();
  }

  /**
   * Define custom metrics for the system
   */
  private defineMetrics(): void {
    // Agent-specific metrics
    this.defineMetric(
      "agent_latency",
      "histogram",
      "Agent operation latency in milliseconds",
      ["agent_name", "operation"],
      [0.1, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    );

    this.defineMetric(
      "agent_throughput",
      "gauge",
      "Agent throughput (operations per minute)",
      ["agent_name"],
    );

    this.defineMetric(
      "agent_error_rate",
      "gauge",
      "Agent error rate as percentage",
      ["agent_name"],
    );

    this.defineMetric(
      "agent_tasks_completed",
      "counter",
      "Total number of tasks completed by agent",
      ["agent_name", "status"],
    );

    this.defineMetric(
      "agent_memory_usage",
      "gauge",
      "Agent memory usage in MB",
      ["agent_name"],
    );

    this.defineMetric(
      "agent_cpu_usage",
      "gauge",
      "Agent CPU usage percentage",
      ["agent_name"],
    );

    this.defineMetric(
      "agent_active_tasks",
      "gauge",
      "Number of currently active tasks",
      ["agent_name"],
    );

    this.defineMetric("agent_uptime", "gauge", "Agent uptime in seconds", [
      "agent_name",
    ]);

    // System-wide metrics
    this.defineMetric(
      "system_total_agents",
      "gauge",
      "Total number of agents in system",
    );
    this.defineMetric(
      "system_healthy_agents",
      "gauge",
      "Number of healthy agents",
    );
    this.defineMetric(
      "system_degraded_agents",
      "gauge",
      "Number of degraded agents",
    );
    this.defineMetric(
      "system_critical_agents",
      "gauge",
      "Number of critical agents",
    );

    this.defineMetric(
      "system_memory_usage",
      "gauge",
      "Total system memory usage in MB",
    );
    this.defineMetric(
      "system_cpu_usage",
      "gauge",
      "Total system CPU usage percentage",
    );

    // Task processing metrics
    this.defineMetric(
      "task_processing_duration",
      "histogram",
      "Time spent processing tasks",
      ["agent_name", "task_type"],
      [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    );

    this.defineMetric(
      "tasks_completed_total",
      "counter",
      "Total tasks completed",
      ["agent_name", "status"],
    );

    this.defineMetric("tasks_failed_total", "counter", "Total tasks failed", [
      "agent_name",
      "error_type",
    ]);

    // Alert metrics
    this.defineMetric(
      "alerts_triggered_total",
      "counter",
      "Total alerts triggered",
      ["severity", "source", "component"],
    );

    this.defineMetric(
      "alerts_active",
      "gauge",
      "Number of currently active alerts",
      ["severity"],
    );

    this.defineMetric(
      "alerts_resolved_total",
      "counter",
      "Total alerts resolved",
      ["severity"],
    );

    logHelpers.metric("metrics_defined_total", this.metricDefinitions.size, {
      metric_type: "custom",
    });
  }

  /**
   * Define a new metric
   */
  private defineMetric(
    name: string,
    type: "counter" | "gauge" | "histogram" | "summary",
    help: string,
    labelNames: string[] = [],
    buckets?: number[],
  ): void {
    let metric;

    const fullName = `pit_crew_${name}`;
    const labels = labelNames && labelNames.length > 0 ? { labelNames } : {};

    switch (type) {
      case "counter":
        metric = new Counter({ name: fullName, help, ...labels });
        break;
      case "gauge":
        metric = new Gauge({ name: fullName, help, ...labels });
        break;
      case "histogram":
        metric = new Histogram({
          name: fullName,
          help,
          buckets: buckets || [0.1, 1, 5, 10],
          ...labels,
        });
        break;
      case "summary":
        metric = new Summary({ name: fullName, help, ...labels });
        break;
      default:
        throw new Error(`Unknown metric type: ${type}`);
    }

    this.metricDefinitions.set(name, metric);
  }

  /**
   * Setup process-specific metrics
   */
  private setupProcessMetrics(): void {
    // Node.js event loop lag
    let lastCheck = Date.now();
    const eventLoopLag = new Gauge({
      name: "pit_crew_event_loop_lag_milliseconds",
      help: "Event loop lag in milliseconds",
    });

    setInterval(() => {
      const now = Date.now();
      const lag = now - lastCheck - 100;
      lastCheck = now;
      eventLoopLag.set(lag);
    }, 100);

    // Process uptime
    const processUptime = new Gauge({
      name: "pit_crew_process_uptime_seconds",
      help: "Process uptime in seconds",
    });
    setInterval(() => {
      processUptime.set(process.uptime());
    }, 1000);

    // Memory usage
    const memoryUsage = new Gauge({
      name: "pit_crew_process_memory_bytes",
      help: "Process memory usage in bytes",
      labelNames: ["type"],
    });

    setInterval(() => {
      const memUsage = process.memoryUsage();
      Object.entries(memUsage).forEach(([type, bytes]) => {
        memoryUsage.labels({ type }).set(bytes);
      });
    }, 5000);
  }

  /**
   * Register an agent in the metrics system
   */
  registerAgent(agentName: string, agentType: string): void {
    const metrics: AgentMetrics = {
      agent_name: agentName,
      status: "idle",
      latency_p50_ms: 0,
      latency_p95_ms: 0,
      latency_p99_ms: 0,
      throughput_per_minute: 0,
      error_rate_percent: 0,
      memory_usage_mb: 0,
      cpu_usage_percent: 0,
      last_activity: new Date().toISOString(),
      active_tasks: 0,
      total_tasks_completed: 0,
    };

    this.agentMetrics.set(agentName, metrics);

    // Set initial values
    this.updateAgentMetric(agentName, "total_tasks_completed", 0);
    this.updateAgentMetric(agentName, "active_tasks", 0);
    this.updateAgentMetric(agentName, "memory_usage_mb", 0);
    this.updateAgentMetric(agentName, "cpu_usage_percent", 0);

    logHelpers.agentStatus(agentName, "registered", { agent_type: agentType });
    logger.info(`Agent registered for metrics: ${agentName}`);
  }

  /**
   * Update agent metrics
   */
  updateAgentMetrics(agentName: string, updates: Partial<AgentMetrics>): void {
    const current = this.agentMetrics.get(agentName);
    if (!current) {
      logger.warn(
        `Attempted to update metrics for unknown agent: ${agentName}`,
      );
      return;
    }

    const updated = {
      ...current,
      ...updates,
      last_activity: new Date().toISOString(),
    };
    this.agentMetrics.set(agentName, updated);

    // Update Prometheus metrics
    Object.entries(updates).forEach(([key, value]) => {
      this.updateAgentMetric(agentName, key, value);
    });

    // Log significant changes
    if (updates.status && updates.status !== current.status) {
      logHelpers.agentStatus(agentName, updates.status, {
        previous_status: current.status,
      });
    }
  }

  /**
   * Update a specific agent metric
   */
  private updateAgentMetric(
    agentName: string,
    metricName: string,
    value: any,
  ): void {
    const internalName = this.metricNameMap[metricName] || metricName;
    const metricDef = this.metricDefinitions.get(internalName);
    if (!metricDef) return;

    const labels = { agent_name: agentName };

    if (typeof value === "number") {
      if (internalName.includes("_total") || metricName.includes("total")) {
        // Counter metric
        if (typeof metricDef.inc === "function") {
          metricDef.inc(labels);
        }
      } else {
        // Gauge metric
        if (labels && metricDef.labelNames && metricDef.labelNames.length > 0) {
          metricDef.set(labels, value);
        } else {
          metricDef.set(value);
        }
      }
    }
  }

  /**
   * Record agent latency
   */
  recordAgentLatency(
    agentName: string,
    durationMs: number,
    operation: string = "task",
  ): void {
    const latencyMetric = this.metricDefinitions.get(
      "agent_latency",
    ) as Histogram;
    if (latencyMetric) {
      latencyMetric
        .labels({ agent_name: agentName, operation })
        .observe(durationMs);
    }

    // Update agent metrics
    const agent = this.agentMetrics.get(agentName);
    if (agent) {
      // Simple latency tracking (could be enhanced with proper percentile calculation)
      if (agent.latency_p50_ms === 0 || durationMs < agent.latency_p50_ms) {
        this.updateAgentMetrics(agentName, { latency_p50_ms: durationMs });
      }
    }

    logHelpers.performance("agent_latency", durationMs, {
      agent_name: agentName,
      operation,
    });
  }

  /**
   * Record task completion
   */
  recordTaskCompletion(
    agentName: string,
    durationMs: number,
    status: "success" | "error" = "success",
    taskType: string = "task",
  ): void {
    // Update task processing metrics
    const durationMetric = this.metricDefinitions.get(
      "task_processing_duration",
    ) as Histogram;
    if (durationMetric) {
      durationMetric
        .labels({ agent_name: agentName, task_type: taskType })
        .observe(durationMs);
    }

    // Update completion metrics
    const tasksMetric = this.metricDefinitions.get(
      "tasks_completed_total",
    ) as Counter;
    if (tasksMetric) {
      tasksMetric.labels({ agent_name: agentName, status }).inc();
    }

    // Update agent metrics
    const agent = this.agentMetrics.get(agentName);
    if (agent) {
      const completed = agent.total_tasks_completed + 1;
      const now = Date.now();
      const timeDiff =
        (now - new Date(agent.last_activity).getTime()) / 1000 / 60; // minutes
      const throughput = timeDiff > 0 ? 1 / timeDiff : 0;

      this.updateAgentMetrics(agentName, {
        total_tasks_completed: completed,
        throughput_per_minute: throughput,
        status: "idle",
      });
    }

    logHelpers.performance("task_completion", durationMs, {
      agent_name: agentName,
      status,
      task_type: taskType,
    });
  }

  /**
   * Record task failure
   */
  recordTaskFailure(
    agentName: string,
    errorType: string,
    durationMs?: number,
  ): void {
    // Update failure metrics
    const failedMetric = this.metricDefinitions.get(
      "tasks_failed_total",
    ) as Counter;
    if (failedMetric) {
      failedMetric
        .labels({ agent_name: agentName, error_type: errorType })
        .inc();
    }

    // Update error rate
    const agent = this.agentMetrics.get(agentName);
    if (agent) {
      const total = agent.total_tasks_completed;
      const errorRate = total > 0 ? (1 / total) * 100 : 100;
      this.updateAgentMetrics(agentName, { error_rate_percent: errorRate });
    }

    logger.warn("Task failure recorded", {
      agent_name: agentName,
      error_type: errorType,
      duration_ms: durationMs,
    });
  }

  /**
   * Record alert
   */
  recordAlert(
    severity: "info" | "warning" | "critical",
    source: string,
    component: string,
    message: string,
  ): void {
    const alertMetric = this.metricDefinitions.get(
      "alerts_triggered_total",
    ) as Counter;
    if (alertMetric) {
      alertMetric.labels({ severity, source, component }).inc();
    }

    logHelpers.alert(severity, message, { source, component });
  }

  /**
   * Start metrics collection
   */
  startCollection(intervalMs: number = 10000): void {
    if (this.collectionInterval) {
      logger.warn("Metrics collection already started");
      return;
    }

    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);

    logger.info(`Started metrics collection with ${intervalMs}ms interval`);
  }

  /**
   * Stop metrics collection
   */
  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      (this.collectionInterval as any) = undefined;
      logger.info("Stopped metrics collection");
    }
  }

  /**
   * Collect system-wide metrics
   */
  private collectSystemMetrics(): void {
    try {
      const agents = Array.from(this.agentMetrics.values());

      // Calculate system totals
      const healthy = agents.filter(
        (a) => a.status === "idle" || a.status === "busy",
      ).length;
      const degraded = agents.filter((a) => a.status === "degraded").length;
      const critical = agents.filter(
        (a) => a.status === "error" || a.status === "stopped",
      ).length;

      // Update system metrics
      const totalAgents = this.metricDefinitions.get(
        "system_total_agents",
      ) as Gauge;
      const healthyAgents = this.metricDefinitions.get(
        "system_healthy_agents",
      ) as Gauge;
      const degradedAgents = this.metricDefinitions.get(
        "system_degraded_agents",
      ) as Gauge;
      const criticalAgents = this.metricDefinitions.get(
        "system_critical_agents",
      ) as Gauge;

      totalAgents.set(agents.length);
      healthyAgents.set(healthy);
      degradedAgents.set(degraded);
      criticalAgents.set(critical);

      // Calculate system resource usage
      const totalMemory = agents.reduce(
        (sum, agent) => sum + agent.memory_usage_mb,
        0,
      );
      const avgCpu =
        agents.length > 0
          ? agents.reduce((sum, agent) => sum + agent.cpu_usage_percent, 0) /
            agents.length
          : 0;

      const systemMemory = this.metricDefinitions.get(
        "system_memory_usage",
      ) as Gauge;
      const systemCpu = this.metricDefinitions.get("system_cpu_usage") as Gauge;

      systemMemory.set(totalMemory);
      systemCpu.set(avgCpu);

      logHelpers.metric("system_health_check", 1, {
        total_agents: agents.length,
        healthy_agents: healthy,
        degraded_agents: degraded,
        critical_agents: critical,
        total_memory_mb: totalMemory,
        avg_cpu_percent: avgCpu,
      });
    } catch (error) {
      logger.error("Failed to collect system metrics", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get current metrics for an agent
   */
  getAgentMetrics(agentName: string): AgentMetrics | undefined {
    return this.agentMetrics.get(agentName);
  }

  /**
   * Get all agent metrics
   */
  getAllAgentMetrics(): AgentMetrics[] {
    return Array.from(this.agentMetrics.values());
  }

  /**
   * Get Prometheus registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Export metrics as string
   */
  async exportMetrics(): Promise<string> {
    try {
      return await register.metrics();
    } catch (error) {
      logger.error("Failed to export metrics", {
        error: (error as Error).message,
      });
      return "";
    }
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    register.clear();
    this.initializeDefaultMetrics();
    this.agentMetrics.clear();
    logger.info("All metrics reset");
  }
}

export default MetricsCollector;
