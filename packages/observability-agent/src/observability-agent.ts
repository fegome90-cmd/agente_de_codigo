/**
 * Main Observability Agent
 * Integrates metrics collection, tracing, alerting, and health monitoring
 */

import { ObservabilitySocketClient } from "./socket-client.js";
import { AgentCapabilities } from "./types.js";
import MetricsCollector from "./metrics-collector.js";
import TraceManager from "./trace-manager.js";
import AlertingSystem from "./alerting-system.js";
import { logger, logHelpers } from "./simple-logger.js";
import cron from "node-cron";
import { createServer } from "http";

export class ObservabilityAgent extends ObservabilitySocketClient {
  private metricsCollector: MetricsCollector;
  private traceManager: TraceManager;
  private alertingSystem: AlertingSystem;
  private healthCheckJob?: cron.ScheduledTask;
  private metricsServer?: any;
  private serviceRunning = false;
  private healthCheckInterval: number = 30000; // 30 seconds

  constructor(socketPath: string, agentName: string = "observability") {
    super(socketPath, agentName);

    this.metricsCollector = new MetricsCollector();
    this.traceManager = new TraceManager("pit-crew-observability");
    this.alertingSystem = new AlertingSystem();

    this.setupEventHandlers();
    this.registerAgents();
  }

  /**
   * Get agent capabilities
   */
  protected override getCapabilities(): AgentCapabilities {
    return {
      supportsMetrics: true,
      supportsTracing: true,
      supportsAlerting: true,
      supportsDashboards: true,
      tools: [
        "prometheus-metrics",
        "opentelemetry-tracing",
        "alerting-system",
        "health-monitoring",
        "metrics-server",
        "performance-analysis",
      ],
      metrics: [
        "agent_latency",
        "agent_throughput",
        "agent_error_rate",
        "system_memory_usage",
        "system_cpu_usage",
        "alerts_triggered",
        "traces_completed",
        "health_status",
      ],
      features: [
        "real-time-monitoring",
        "distributed-tracing",
        "prometheus-integration",
        "grafana-dashboards",
        "alert-management",
        "health-checks",
        "performance-analysis",
        "metrics-exposition",
      ],
    };
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Alert events
    this.alertingSystem.on("alert_triggered", (alert) => {
      this.sendAlert(alert.severity, alert.message, {
        alert_id: alert.id,
        source: alert.source,
      });
    });

    this.alertingSystem.on("alert_resolved", (alert) => {
      this.sendAlert("info", `Alert resolved: ${alert.message}`, {
        alert_id: alert.id,
        resolved: true,
      });
    });

    // Health check events
    this.on("agent_health_status", (data) => {
      this.handleAgentHealthStatus(data);
    });

    // Metric events
    this.on("metric_data", (data) => {
      this.handleMetricData(data);
    });

    // Task events
    this.on("task_completed", (data) => {
      this.handleTaskCompletion(data);
    });

    logger.info("Event handlers configured");
  }

  /**
   * Register known agents
   */
  private registerAgents(): void {
    const knownAgents = [
      { name: "security", type: "security" },
      { name: "quality", type: "quality" },
      { name: "documentation", type: "documentation" },
      { name: "pr_reviewer", type: "meta-agent" },
      { name: "architecture", type: "architecture" },
    ];

    knownAgents.forEach((agent) => {
      this.metricsCollector.registerAgent(agent.name, agent.type);
    });

    logger.info(`Registered ${knownAgents.length} known agents for monitoring`);
  }

  /**
   * Start the observability agent
   */
  override async start(): Promise<void> {
    if (this.serviceRunning) {
      logger.warn("Observability agent already running");
      return;
    }

    this.serviceRunning = true;
    logger.info("Starting Observability Agent...");

    try {
      // Start base socket client
      await super.start();

      // Start metrics collection
      this.metricsCollector.startCollection(10000); // 10 seconds

      // Start health check cron job
      this.startHealthChecks();

      // Start metrics HTTP server
      this.startMetricsServer();

      // Send initial health status
      this.sendHealthStatus("started", {
        agents_registered: 5,
        health_check_interval: this.healthCheckInterval,
      });

      logger.info("Observability Agent started successfully");
    } catch (error) {
      logger.error("Failed to start Observability Agent", {
        error: (error as Error).message,
      });
      this.serviceRunning = false;
      throw error;
    }
  }

  /**
   * Stop the observability agent
   */
  override async stop(): Promise<void> {
    if (!this.serviceRunning) return;

    this.serviceRunning = false;
    logger.info("Stopping Observability Agent...");

    try {
      // Stop health check job
      if (this.healthCheckJob) {
        this.healthCheckJob.stop();
        (this.healthCheckJob as any) = undefined;
      }

      // Stop metrics server
      if (this.metricsServer) {
        this.metricsServer.close();
        this.metricsServer = undefined;
      }

      // Stop metrics collection
      this.metricsCollector.stopCollection();

      // Shutdown trace manager
      await this.traceManager.shutdown();

      // Stop base socket client
      super.stop();

      this.sendHealthStatus("stopped", {});

      logger.info("Observability Agent stopped");
    } catch (error) {
      logger.error("Error stopping Observability Agent", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    // Cron job for regular health checks
    this.healthCheckJob = cron.schedule(
      "*/30 * * * * *",
      async () => {
        await this.performSystemHealthCheck();
      },
      {
        scheduled: false,
      },
    );

    this.healthCheckJob.start();
    logger.info("Health check cron job started (every 30 seconds)");
  }

  /**
   * Start metrics HTTP server
   */
  private startMetricsServer(): void {
    try {
      this.metricsServer = createServer(async (req, res) => {
        if (req.url === "/metrics") {
          res.setHeader("Content-Type", "text/plain");
          const metrics = await this.metricsCollector.exportMetrics();
          res.end(metrics);
        } else if (req.url === "/health") {
          res.setHeader("Content-Type", "application/json");
          const health = await this.getSystemHealth();
          res.end(JSON.stringify(health, null, 2));
        } else if (req.url === "/alerts") {
          res.setHeader("Content-Type", "application/json");
          const alerts = this.alertingSystem.getActiveAlerts();
          res.end(JSON.stringify(alerts, null, 2));
        } else {
          res.statusCode = 404;
          res.end("Not Found");
        }
      });

      this.metricsServer.listen(9090, () => {
        logger.info("Metrics server started on port 9090");
        logger.info("Metrics endpoint: http://localhost:9090/metrics");
        logger.info("Health endpoint: http://localhost:9090/health");
        logger.info("Alerts endpoint: http://localhost:9090/alerts");
      });
    } catch (error) {
      logger.error("Failed to start metrics server", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Perform system health check
   */
  private async performSystemHealthCheck(): Promise<void> {
    try {
      const health = await this.getSystemHealth();

      // Record health metrics
      logHelpers.health("system", health.overall_status, {
        total_agents: health.total_agents,
        healthy_agents: health.healthy_agents,
        degraded_agents: health.degraded_agents,
        critical_agents: health.critical_agents,
      });

      // Trigger alerts based on health status
      if (health.overall_status === "critical") {
        this.alertingSystem.triggerManualAlert(
          "critical",
          `System health is critical: ${health.critical_agents} agents in critical state`,
          "health_check",
          health,
        );
      } else if (health.overall_status === "degraded") {
        this.alertingSystem.triggerManualAlert(
          "warning",
          `System health is degraded: ${health.degraded_agents} agents in degraded state`,
          "health_check",
          health,
        );
      }
    } catch (error) {
      logger.error("Failed to perform system health check", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get comprehensive system health
   */
  async getSystemHealth(): Promise<any> {
    const agentMetrics = this.metricsCollector.getAllAgentMetrics();
    const activeAlerts = this.alertingSystem.getActiveAlerts();
    const alertStats = this.alertingSystem.getAlertStatistics();
    const activeSpans = this.traceManager.getActiveSpans();

    // Calculate health status
    const healthyAgents = agentMetrics.filter(
      (a) => a.status === "idle" || a.status === "busy",
    ).length;
    const degradedAgents = agentMetrics.filter(
      (a) => a.status === "degraded",
    ).length;
    const criticalAgents = agentMetrics.filter(
      (a) => a.status === "error" || a.status === "stopped",
    ).length;
    const totalAgents = agentMetrics.length;

    let overallStatus: "healthy" | "degraded" | "critical" = "healthy";
    if (criticalAgents > 0) {
      overallStatus = "critical";
    } else if (
      degradedAgents > 0 ||
      activeAlerts.some((a) => a.severity === "critical")
    ) {
      overallStatus = "degraded";
    }

    return {
      overall_status: overallStatus,
      timestamp: new Date().toISOString(),
      total_agents: totalAgents,
      active_agents: agentMetrics.filter((a) => a.status !== "stopped").length,
      healthy_agents: healthyAgents,
      degraded_agents: degradedAgents,
      critical_agents: criticalAgents,
      total_memory_usage_mb: agentMetrics.reduce(
        (sum, a) => sum + a.memory_usage_mb,
        0,
      ),
      total_cpu_usage_percent:
        totalAgents > 0
          ? agentMetrics.reduce((sum, a) => sum + a.cpu_usage_percent, 0) /
            totalAgents
          : 0,
      recent_alerts: activeAlerts.slice(0, 5),
      alert_statistics: alertStats,
      active_traces: activeSpans.length,
      metrics_collector_status: "operational",
      trace_manager_status: "operational",
      alerting_system_status: "operational",
    };
  }

  /**
   * Handle incoming task
   */
  override async handleTask(taskId: string, taskData: any): Promise<void> {
    const startTime = Date.now();

    try {
      await this.traceManager.traceOperation(
        "observability_task",
        this.getAgentName(),
        async (span) => {
          span.setAttribute("task.id", taskId);
          span.setAttribute("task.type", taskData.type || "unknown");
          if (taskData.agent_name) {
            span.setAttribute("task.target_agent", taskData.agent_name);
          }

          let result;

          switch (taskData.type) {
            case "collect_metrics":
              result = await this.handleCollectMetrics(taskData);
              break;
            case "health_check":
              result = await this.handleHealthCheck(taskData);
              break;
            case "trace_operation":
              result = await this.handleTraceOperation(taskData);
              break;
            case "trigger_alert":
              result = await this.handleTriggerAlert(taskData);
              break;
            case "get_system_status":
              result = await this.handleGetSystemStatus(taskData);
              break;
            default:
              throw new Error(`Unknown task type: ${taskData.type}`);
          }

          span.setAttribute("task.result", "success");
          return result;
        },
      );

      const duration = Date.now() - startTime;
      this.sendTaskResponse(
        taskId,
        "done",
        {
          task_completed: true,
          duration_ms: duration,
          task_type: taskData.type,
        },
        duration,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.sendTaskResponse(
        taskId,
        "failed",
        {
          error: (error as Error).message,
          task_type: taskData.type,
        },
        duration,
      );
    }
  }

  /**
   * Handle metrics collection task
   */
  private async handleCollectMetrics(taskData: any): Promise<any> {
    const { agent_name, include_traces = false } = taskData;

    let metrics;
    if (agent_name) {
      metrics = this.metricsCollector.getAgentMetrics(agent_name);
      if (!metrics) {
        throw new Error(`Agent not found: ${agent_name}`);
      }
    } else {
      metrics = this.metricsCollector.getAllAgentMetrics();
    }

    const result: any = {
      agent_metrics: metrics,
      collection_timestamp: new Date().toISOString(),
    };

    if (include_traces) {
      result.active_traces = this.traceManager.getActiveSpans();
    }

    return result;
  }

  /**
   * Handle health check task
   */
  private async handleHealthCheck(taskData: any): Promise<any> {
    const { component, agent_name } = taskData;

    if (component === "alerting_system") {
      return await this.alertingSystem.healthCheck();
    } else if (agent_name) {
      const metrics = this.metricsCollector.getAgentMetrics(agent_name);
      if (!metrics) {
        throw new Error(`Agent not found: ${agent_name}`);
      }
      return {
        component: agent_name,
        status: metrics.status === "error" ? "critical" : "healthy",
        timestamp: new Date().toISOString(),
        details: metrics,
      };
    } else {
      return await this.getSystemHealth();
    }
  }

  /**
   * Handle trace operation task
   */
  private async handleTraceOperation(taskData: any): Promise<any> {
    const {
      operation_name,
      agent_name,
      duration_ms = 1000,
      status = "success",
    } = taskData;

    const traceId = this.traceManager.startSpan(operation_name, agent_name);

    // Simulate operation duration
    await new Promise((resolve) => setTimeout(resolve, duration_ms));

    this.traceManager.endSpan(traceId, status as any);

    return {
      trace_id: traceId,
      operation_name,
      agent_name,
      duration_ms,
      status,
    };
  }

  /**
   * Handle trigger alert task
   */
  private async handleTriggerAlert(taskData: any): Promise<any> {
    const { severity, message, source = "manual", details } = taskData;

    const alertId = this.alertingSystem.triggerManualAlert(
      severity,
      message,
      source,
      details,
    );

    return {
      alert_id: alertId,
      severity,
      message,
      triggered_at: new Date().toISOString(),
    };
  }

  /**
   * Handle get system status task
   */
  private async handleGetSystemStatus(taskData: any): Promise<any> {
    return await this.getSystemHealth();
  }

  /**
   * Handle agent health status updates
   */
  private handleAgentHealthStatus(data: any): void {
    const { agent_name, status, metrics } = data;

    if (agent_name && metrics) {
      this.metricsCollector.updateAgentMetrics(agent_name, metrics);
    }

    // Check for alert conditions
    const currentMetrics = this.metricsCollector.getAgentMetrics(agent_name);
    if (currentMetrics) {
      this.evaluateAlertRulesForAgent(agent_name, currentMetrics);
    }
  }

  /**
   * Handle metric data
   */
  private handleMetricData(data: any): void {
    const { metric_name, value, labels } = data;

    // Record the metric
    logHelpers.metric(metric_name, value, labels);
  }

  /**
   * Handle task completion events
   */
  private handleTaskCompletion(data: any): void {
    const {
      agent_name,
      duration_ms,
      status = "success",
      task_type = "task",
    } = data;

    if (agent_name) {
      this.metricsCollector.recordTaskCompletion(
        agent_name,
        duration_ms,
        status,
        task_type,
      );
    }
  }

  /**
   * Evaluate alert rules for specific agent
   */
  private evaluateAlertRulesForAgent(agentName: string, metrics: any): void {
    const metricValues: Record<string, number> = {
      agent_latency: metrics.latency_p95_ms,
      agent_error_rate: metrics.error_rate_percent,
      agent_memory_usage: metrics.memory_usage_mb,
      agent_cpu_usage: metrics.cpu_usage_percent,
      agent_active_tasks: metrics.active_tasks,
      agent_uptime: Date.now() - new Date(metrics.last_activity).getTime(),
    };

    const labels = { agent_name: agentName };
    this.alertingSystem.evaluateRules(metricValues, labels);
  }

  /**
   * Get metrics collector instance
   */
  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Get trace manager instance
   */
  getTraceManager(): TraceManager {
    return this.traceManager;
  }

  /**
   * Get alerting system instance
   */
  getAlertingSystem(): AlertingSystem {
    return this.alertingSystem;
  }
}
