/**
 * Alerting System
 * Manages alerts, notifications, and escalation policies
 */

import { EventEmitter } from "events";
import { logger, logHelpers } from "./simple-logger.js";
import { AlertEvent, AlertRule, HealthCheckResult } from "./types.js";

export class AlertingSystem extends EventEmitter {
  private activeAlerts: Map<string, AlertEvent> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private alertHistory: AlertEvent[] = [];
  private maxHistorySize = 1000;
  private notificationQueue: Array<{
    alert: AlertEvent;
    timestamp: Date;
    attempts: number;
    maxAttempts: number;
  }> = [];

  constructor() {
    super();
    this.initializeDefaultRules();
    this.startNotificationProcessor();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    // High latency rule
    this.addRule({
      name: "high_agent_latency",
      description: "Agent latency exceeds threshold",
      severity: "warning",
      condition: [
        {
          metric: "latency_p95_ms",
          operator: "gt",
          threshold: 10000,
          for_duration: "5m",
        },
      ],
      labels: { category: "performance", component: "agent" },
      annotations: {
        summary: "Agent {{$labels.agent_name}} has high latency",
        description:
          "Agent {{$labels.agent_name}} latency is {{$value}}ms, which is above the 10s threshold",
      },
      duration: "5m",
    });

    // High error rate rule
    this.addRule({
      name: "high_error_rate",
      description: "Agent error rate exceeds threshold",
      severity: "critical",
      condition: [
        {
          metric: "error_rate_percent",
          operator: "gt",
          threshold: 20,
          for_duration: "2m",
        },
      ],
      labels: { category: "reliability", component: "agent" },
      annotations: {
        summary: "Agent {{$labels.agent_name}} has high error rate",
        description:
          "Agent {{$labels.agent_name}} error rate is {{$value}}%, which is above the 20% threshold",
      },
      duration: "2m",
    });

    // Agent offline rule
    this.addRule({
      name: "agent_offline",
      description: "Agent has not reported activity recently",
      severity: "critical",
      condition: [
        {
          metric: "time_since_last_activity_ms",
          operator: "gt",
          threshold: 300000, // 5 minutes in ms
          for_duration: "1m",
        },
      ],
      labels: { category: "availability", component: "agent" },
      annotations: {
        summary: "Agent {{$labels.agent_name}} is offline",
        description:
          "Agent {{$labels.agent_name}} has not reported activity for {{$value}}ms",
      },
      duration: "1m",
    });

    // System memory usage rule
    this.addRule({
      name: "high_memory_usage",
      description: "System memory usage is high",
      severity: "warning",
      condition: [
        {
          metric: "memory_usage_percent",
          operator: "gt",
          threshold: 80,
          for_duration: "5m",
        },
      ],
      labels: { category: "performance", component: "system" },
      annotations: {
        summary: "System memory usage is high",
        description:
          "System memory usage is {{$value}}%, which is above the 80% threshold",
      },
      duration: "5m",
    });

    logger.info(`Initialized ${this.alertRules.size} default alert rules`);
  }

  /**
   * Add a new alert rule
   */
  addRule(rule: AlertRule): void {
    this.alertRules.set(rule.name, rule);
    logger.info("Added alert rule", {
      rule_name: rule.name,
      severity: rule.severity,
    });
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleName: string): boolean {
    const removed = this.alertRules.delete(ruleName);
    if (removed) {
      logger.info("Removed alert rule", { rule_name: ruleName });
    }
    return removed;
  }

  /**
   * Get all alert rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get a specific alert rule
   */
  getRule(ruleName: string): AlertRule | undefined {
    return this.alertRules.get(ruleName);
  }

  /**
   * Evaluate alert rules against metrics
   */
  evaluateRules(
    metrics: Record<string, number>,
    labels: Record<string, string> = {},
  ): void {
    for (const rule of this.alertRules.values()) {
      try {
        if (this.evaluateCondition(rule.condition, metrics)) {
          this.triggerAlert(rule, metrics, labels);
        } else {
          this.resolveAlertIfExists(rule, labels);
        }
      } catch (error) {
        logger.error("Error evaluating alert rule", {
          rule_name: rule.name,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    conditions: any[],
    metrics: Record<string, number>,
  ): boolean {
    return conditions.every((condition) => {
      const value = this.extractMetricValue(condition.metric, metrics);
      return this.compareValues(value, condition.operator, condition.threshold);
    });
  }

  /**
   * Extract metric value (supports basic metric path resolution)
   */
  private extractMetricValue(
    metricPath: string,
    metrics: Record<string, number>,
  ): number {
    // Support simple metric lookups and aggregations
    if (metricPath in metrics) {
      const value = metrics[metricPath];
      return value !== undefined ? value : 0;
    }

    // Support aggregation functions like sum(), avg(), max()
    const aggregationMatch = metricPath.match(/^(\w+)\((.*)\)$/);
    if (aggregationMatch) {
      const [, aggFunc, metricPattern] = aggregationMatch;
      const matchingMetrics = Object.keys(metrics)
        .filter((key) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - TypeScript incorrectly infers string | undefined due to noUncheckedIndexedAccess
          return key.includes(metricPattern);
        })
        .map((key) => metrics[key] as number);

      if (matchingMetrics.length === 0) return 0;

      switch (aggFunc) {
        case "sum":
          return matchingMetrics.reduce((a, b) => a + b, 0);
        case "avg":
          return (
            matchingMetrics.reduce((a, b) => a + b, 0) / matchingMetrics.length
          );
        case "max":
          return Math.max(...matchingMetrics);
        case "min":
          return Math.min(...matchingMetrics);
        default:
          return matchingMetrics[0]!;
      }
    }

    return 0;
  }

  /**
   * Compare values based on operator
   */
  private compareValues(
    value: number,
    operator: string,
    threshold: number,
  ): boolean {
    switch (operator) {
      case "gt":
        return value > threshold;
      case "gte":
        return value >= threshold;
      case "lt":
        return value < threshold;
      case "lte":
        return value <= threshold;
      case "eq":
        return value === threshold;
      case "ne":
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(
    rule: AlertRule,
    metrics: Record<string, number>,
    labels: Record<string, string>,
  ): void {
    const alertId = this.generateAlertId(rule.name, labels);

    // Check if alert already exists and is active
    if (this.activeAlerts.has(alertId)) {
      return; // Alert already active
    }

    const alertBase = {
      id: alertId,
      timestamp: new Date().toISOString(),
      severity: rule.severity,
      source: "rule_evaluation" as const,
      message: this.formatMessage(
        rule.annotations.summary || rule.name,
        labels,
        metrics,
      ),
      status: "active" as const,
      metric_name: rule.name,
      current_value: this.extractMetricValue(
        rule.condition[0]?.metric || "value",
        metrics,
      ),
      threshold_value: rule.condition[0]?.threshold || 0,
    };

    const alert: AlertEvent = {
      ...alertBase,
      ...(labels.agent_name !== undefined && { agent_name: labels.agent_name }),
    };

    // Store active alert
    this.activeAlerts.set(alertId, alert);
    this.addToHistory(alert);

    // Send notifications
    this.queueNotification(alert);

    // Emit event
    this.emit("alert_triggered", alert);
    logHelpers.alert(rule.severity, alert.message, {
      rule_name: rule.name,
      alert_id: alertId,
      labels,
      metrics,
    });

    logger.warn("Alert triggered", {
      alert_id: alertId,
      rule_name: rule.name,
      severity: rule.severity,
      message: alert.message,
    });
  }

  /**
   * Resolve an alert if it exists
   */
  private resolveAlertIfExists(
    rule: AlertRule,
    labels: Record<string, string>,
  ): void {
    const alertId = this.generateAlertId(rule.name, labels);
    const alert = this.activeAlerts.get(alertId);

    if (alert && alert.status === "active") {
      alert.status = "resolved";
      this.activeAlerts.delete(alertId);
      this.addToHistory(alert);

      this.emit("alert_resolved", alert);
      logger.info("Alert resolved", {
        alert_id: alertId,
        rule_name: rule.name,
      });
    }
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(
    ruleName: string,
    labels: Record<string, string>,
  ): string {
    const key = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");

    return `${ruleName}:${key}`;
  }

  /**
   * Format message with template variables
   */
  private formatMessage(
    template: string,
    labels: Record<string, string>,
    metrics: Record<string, number>,
  ): string {
    return template
      .replace(/\{\{\$labels\.(\w+)\}\}/g, (_, labelKey) => {
        const value = labels[labelKey];
        return value !== undefined ? value : "unknown";
      })
      .replace(
        /\{\{\$value\}\}/g,
        Object.values(metrics)[0]?.toString() || "unknown",
      )
      .replace(/\{\{\$(\w+)\}\}/g, (_, metricKey) => {
        const value = metrics[metricKey];
        return value !== undefined ? value.toString() : "unknown";
      });
  }

  /**
   * Add alert to history
   */
  private addToHistory(alert: AlertEvent): void {
    this.alertHistory.push(alert);

    // Trim history if too large
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Queue alert for notification
   */
  private queueNotification(alert: AlertEvent): void {
    this.notificationQueue.push({
      alert,
      timestamp: new Date(),
      attempts: 0,
      maxAttempts: 3,
    });
  }

  /**
   * Start notification processor
   */
  private startNotificationProcessor(): void {
    setInterval(() => {
      this.processNotificationQueue();
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process notification queue
   */
  private processNotificationQueue(): void {
    if (this.notificationQueue.length === 0) return;

    const notifications = [...this.notificationQueue];
    this.notificationQueue = [];

    for (const notification of notifications) {
      this.sendNotification(notification).catch((error) => {
        logger.error("Failed to send notification", {
          alert_id: notification.alert.id,
          error: error.message,
          attempts: notification.attempts,
        });

        // Re-queue if max attempts not reached
        if (notification.attempts < notification.maxAttempts) {
          notification.attempts++;
          notification.timestamp = new Date(
            Date.now() + Math.pow(2, notification.attempts) * 1000,
          ); // Exponential backoff
          this.notificationQueue.push(notification);
        }
      });
    }
  }

  /**
   * Send notification (placeholder implementation)
   */
  private async sendNotification(notification: {
    alert: AlertEvent;
    timestamp: Date;
    attempts: number;
    maxAttempts: number;
  }): Promise<void> {
    const { alert } = notification;

    // Log notification (in real implementation, this would send to webhook, email, etc.)
    logger.info("Sending alert notification", {
      alert_id: alert.id,
      severity: alert.severity,
      message: alert.message,
      attempts: notification.attempts,
    });

    // Emit event for external handlers
    this.emit("alert_notification", alert);

    // Simulate external notification delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Manually trigger an alert
   */
  triggerManualAlert(
    severity: "info" | "warning" | "critical",
    message: string,
    source: string = "manual",
    details?: any,
  ): string {
    const alertId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const alert: AlertEvent = {
      id: alertId,
      timestamp: new Date().toISOString(),
      severity,
      source,
      message,
      status: "active",
      ...details,
    };

    this.activeAlerts.set(alertId, alert);
    this.addToHistory(alert);
    this.queueNotification(alert);

    this.emit("alert_triggered", alert);
    logHelpers.alert(severity, message, details);

    return alertId;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = "acknowledged";
    this.addToHistory(alert);

    this.emit("alert_acknowledged", alert, acknowledgedBy);
    logger.info("Alert acknowledged", {
      alert_id: alertId,
      acknowledged_by: acknowledgedBy,
    });

    return true;
  }

  /**
   * Resolve an alert manually
   */
  resolveAlert(alertId: string, resolvedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = "resolved";
    this.activeAlerts.delete(alertId);
    this.addToHistory(alert);

    this.emit("alert_resolved", alert, resolvedBy);
    logger.info("Alert resolved manually", {
      alert_id: alertId,
      resolved_by: resolvedBy,
    });

    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values()).filter(
      (alert) => alert.status === "active",
    );
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: "info" | "warning" | "critical"): AlertEvent[] {
    return this.alertHistory.filter((alert) => alert.severity === severity);
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): AlertEvent[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics(): {
    active_alerts: number;
    total_alerts: number;
    critical_alerts: number;
    warning_alerts: number;
    info_alerts: number;
    resolved_alerts: number;
    acknowledged_alerts: number;
  } {
    const active = this.getActiveAlerts();
    const history = this.alertHistory;

    return {
      active_alerts: active.length,
      total_alerts: history.length,
      critical_alerts: history.filter((a) => a.severity === "critical").length,
      warning_alerts: history.filter((a) => a.severity === "warning").length,
      info_alerts: history.filter((a) => a.severity === "info").length,
      resolved_alerts: history.filter((a) => a.status === "resolved").length,
      acknowledged_alerts: history.filter((a) => a.status === "acknowledged")
        .length,
    };
  }

  /**
   * Health check for alerting system
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const activeAlerts = this.getActiveAlerts();
      const criticalAlerts = activeAlerts.filter(
        (a) => a.severity === "critical",
      );
      const rulesCount = this.alertRules.size;

      const responseTime = Date.now() - startTime;

      return {
        component: "alerting-system",
        status: criticalAlerts.length > 0 ? "critical" : "healthy",
        timestamp: new Date().toISOString(),
        response_time_ms: responseTime,
        details: {
          active_alerts: activeAlerts.length,
          critical_alerts: criticalAlerts.length,
          alert_rules: rulesCount,
          notification_queue_size: this.notificationQueue.length,
        },
      };
    } catch (error) {
      return {
        component: "alerting-system",
        status: "critical",
        timestamp: new Date().toISOString(),
        response_time_ms: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Clear all alerts (useful for testing)
   */
  clearAllAlerts(): void {
    this.activeAlerts.clear();
    this.notificationQueue = [];
    logger.info("All alerts cleared");
  }

  /**
   * Shutdown alerting system
   */
  shutdown(): void {
    this.clearAllAlerts();
    this.removeAllListeners();
    logger.info("Alerting system shutdown");
  }
}

export default AlertingSystem;
