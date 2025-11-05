/**
 * Enhanced Monitoring Dashboard System
 *
 * Provides real-time monitoring dashboards with:
 * - Real-time metrics collection and visualization
 * - Agent health and performance monitoring
 * - System resource utilization tracking
 * - Alerting with intelligent severity classification
 * - Historical data analysis and trend detection
 * - Customizable dashboard layouts
 */

import { EventEmitter } from 'events';
import { RedisCacheService } from '../caching/redis-cache-service.js';
import { logger } from '../utils/logger.js';

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  unit: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  tags: Record<string, string>;
  aggregation: 'sum' | 'average' | 'min' | 'max' | 'latest';
  thresholds?: {
    warning: number;
    critical: number;
  };
}

export interface MetricValue {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  refreshInterval: number; // ms
  panels: PanelConfig[];
  layout: {
    rows: number;
    columns: number;
  };
  timeRange: {
    from: string; // e.g., 'now-1h'
    to: string;   // e.g., 'now'
  };
}

export interface PanelConfig {
  id: string;
  title: string;
  type: 'metric' | 'chart' | 'table' | 'gauge' | 'status';
  position: {
    row: number;
    column: number;
    width: number;
    height: number;
  };
  metrics: string[];
  visualization: {
    chartType?: 'line' | 'bar' | 'pie' | 'area';
    colors?: string[];
    yAxisLabel?: string;
    showLegend?: boolean;
  };
  alerts?: AlertConfig[];
}

export interface AlertConfig {
  id: string;
  name: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  condition: {
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte';
    threshold: number;
    duration?: number; // ms
  };
  actions: AlertAction[];
  enabled: boolean;
}

export interface AlertAction {
  type: 'webhook' | 'email' | 'log' | 'dashboard';
  config: Record<string, any>;
}

export interface MonitoringConfig {
  redis: {
    keyPrefix: string;
    retention: number; // hours
  };
  metrics: {
    collectionInterval: number; // ms
    batchSize: number;
    compressionEnabled: boolean;
  };
  dashboards: DashboardConfig[];
  alerts: {
    enabled: boolean;
    evaluationInterval: number; // ms
    notificationCooldown: number; // ms
  };
  performance: {
    maxMetricsInMemory: number;
    aggregationWindow: number; // ms
  };
}

export interface SystemMetrics {
  timestamp: number;
  agents: AgentMetrics;
  llm: LLMMetrics;
  cache: CacheMetrics;
  ipc: IPCMetrics;
  system: SystemResourceMetrics;
  custom: Record<string, MetricValue>;
}

export interface AgentMetrics {
  total: number;
  active: number;
  healthy: number;
  unhealthy: number;
  responseTime: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    successRate: number;
    errorRate: number;
  };
  resourceUsage: {
    memory: number;
    cpu: number;
    disk: number;
  };
}

export interface LLMMetrics {
  requestsPerSecond: number;
  averageResponseTime: number;
  cacheHitRate: number;
  tokenUsage: {
    inputTokensPerSecond: number;
    outputTokensPerSecond: number;
    totalTokens: number;
  };
  costs: {
    costPerRequest: number;
    totalCost: number;
    costPerToken: number;
  };
  errors: {
    errorRate: number;
    timeoutRate: number;
    rateLimitRate: number;
  };
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  evictionRate: number;
  memoryUsage: number;
  keyCount: number;
  averageGetTime: number;
  averageSetTime: number;
}

export interface IPCMetrics {
  activeConnections: number;
  totalConnections: number;
  messagesPerSecond: number;
  averageLatency: number;
  connectionErrors: number;
  reconnections: number;
  throughput: number;
}

export interface SystemResourceMetrics {
  memory: {
    used: number;
    total: number;
    usage: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  disk: {
    used: number;
    total: number;
    usage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
}

export interface AlertStatus {
  id: string;
  state: 'ok' | 'warning' | 'critical';
  lastEvaluation: number;
  message: string;
  evaluationCount: number;
  firstTriggered: number;
  lastResolved?: number;
}

export class EnhancedMonitoringDashboard extends EventEmitter {
  private config: MonitoringConfig;
  private cache: RedisCacheService;
  private metrics: Map<string, MetricDefinition> = new Map();
  private metricValues: Map<string, MetricValue[]> = new Map();
  private alerts: Map<string, AlertConfig> = new Map();
  private alertStatuses: Map<string, AlertStatus> = new Map();
  private collectionInterval?: NodeJS.Timeout;
  private alertEvaluationInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(config: MonitoringConfig, cache: RedisCacheService) {
    super();
    this.config = config;
    this.cache = cache;

    this.initializeMetrics();
    this.initializeAlerts();
    this.startMetricsCollection();
    this.startAlertEvaluation();

    logger.info('Enhanced Monitoring Dashboard initialized', {
      dashboardsCount: config.dashboards.length,
      metricsCount: this.metrics.size,
      alertsCount: this.alerts.size,
      collectionInterval: config.metrics.collectionInterval
    });
  }

  /**
   * Initialize metric definitions
   */
  private initializeMetrics(): void {
    // System metrics
    this.registerMetric({
      id: 'system.memory.usage',
      name: 'Memory Usage',
      description: 'System memory usage percentage',
      unit: '%',
      type: 'gauge',
      tags: { component: 'system' },
      aggregation: 'latest',
      thresholds: { warning: 80, critical: 95 }
    });

    this.registerMetric({
      id: 'system.cpu.usage',
      name: 'CPU Usage',
      description: 'System CPU usage percentage',
      unit: '%',
      type: 'gauge',
      tags: { component: 'system' },
      aggregation: 'latest',
      thresholds: { warning: 70, critical: 90 }
    });

    // Agent metrics
    this.registerMetric({
      id: 'agents.active.count',
      name: 'Active Agents',
      description: 'Number of currently active agents',
      unit: 'count',
      type: 'gauge',
      tags: { component: 'agents' },
      aggregation: 'latest'
    });

    this.registerMetric({
      id: 'agents.response.time',
      name: 'Agent Response Time',
      description: 'Average response time for agents',
      unit: 'ms',
      type: 'histogram',
      tags: { component: 'agents' },
      aggregation: 'average',
      thresholds: { warning: 5000, critical: 10000 }
    });

    this.registerMetric({
      id: 'agents.throughput',
      name: 'Agent Throughput',
      description: 'Requests per second processed by agents',
      unit: 'req/s',
      type: 'counter',
      tags: { component: 'agents' },
      aggregation: 'sum'
    });

    // LLM metrics
    this.registerMetric({
      id: 'llm.requests.rate',
      name: 'LLM Request Rate',
      description: 'LLM API requests per second',
      unit: 'req/s',
      type: 'counter',
      tags: { component: 'llm' },
      aggregation: 'sum'
    });

    this.registerMetric({
      id: 'llm.response.time',
      name: 'LLM Response Time',
      description: 'Average LLM API response time',
      unit: 'ms',
      type: 'histogram',
      tags: { component: 'llm' },
      aggregation: 'average',
      thresholds: { warning: 2000, critical: 5000 }
    });

    this.registerMetric({
      id: 'llm.cache.hit.rate',
      name: 'LLM Cache Hit Rate',
      description: 'LLM cache hit rate percentage',
      unit: '%',
      type: 'gauge',
      tags: { component: 'llm' },
      aggregation: 'latest',
      thresholds: { warning: 50, critical: 30 }
    });

    // Cache metrics
    this.registerMetric({
      id: 'cache.hit.rate',
      name: 'Cache Hit Rate',
      description: 'Redis cache hit rate',
      unit: '%',
      type: 'gauge',
      tags: { component: 'cache' },
      aggregation: 'latest',
      thresholds: { warning: 70, critical: 50 }
    });

    // IPC metrics
    this.registerMetric({
      id: 'ipc.connections.active',
      name: 'Active IPC Connections',
      description: 'Number of active IPC connections',
      unit: 'count',
      type: 'gauge',
      tags: { component: 'ipc' },
      aggregation: 'latest'
    });

    this.registerMetric({
      id: 'ipc.messages.rate',
      name: 'IPC Message Rate',
      description: 'IPC messages per second',
      unit: 'msg/s',
      type: 'counter',
      tags: { component: 'ipc' },
      aggregation: 'sum'
    });
  }

  /**
   * Initialize alerts from configuration
   */
  private initializeAlerts(): void {
    // Default alerts for critical metrics
    this.registerAlert({
      id: 'high.memory.usage',
      name: 'High Memory Usage',
      description: 'System memory usage is critically high',
      severity: 'critical',
      condition: {
        metric: 'system.memory.usage',
        operator: 'gt',
        threshold: 90,
        duration: 300000 // 5 minutes
      },
      actions: [
        { type: 'log', config: { level: 'error' } },
        { type: 'dashboard', config: { highlight: 'system' } }
      ],
      enabled: true
    });

    this.registerAlert({
      id: 'high.cpu.usage',
      name: 'High CPU Usage',
      description: 'System CPU usage is critically high',
      severity: 'warning',
      condition: {
        metric: 'system.cpu.usage',
        operator: 'gt',
        threshold: 80,
        duration: 300000 // 5 minutes
      },
      actions: [
        { type: 'log', config: { level: 'warn' } }
      ],
      enabled: true
    });

    this.registerAlert({
      id: 'slow.agent.response',
      name: 'Slow Agent Response',
      description: 'Agent response times are degraded',
      severity: 'warning',
      condition: {
        metric: 'agents.response.time',
        operator: 'gt',
        threshold: 5000,
        duration: 120000 // 2 minutes
      },
      actions: [
        { type: 'log', config: { level: 'warn' } }
      ],
      enabled: true
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.collectionInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.collectMetrics();
      }
    }, this.config.metrics.collectionInterval);
  }

  /**
   * Start alert evaluation
   */
  private startAlertEvaluation(): void {
    if (!this.config.alerts.enabled) return;

    this.alertEvaluationInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.evaluateAlerts();
      }
    }, this.config.alerts.evaluationInterval);
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = Date.now();
      const systemMetrics = await this.gatherSystemMetrics(timestamp);

      // Store metrics in memory and cache
      for (const [metricId, value] of Object.entries(systemMetrics.custom)) {
        await this.recordMetric(metricId, value.value, timestamp, value.labels);
      }

      // Store aggregated system metrics
      await this.recordMetric('system.memory.usage', systemMetrics.system.memory.usage, timestamp);
      await this.recordMetric('system.cpu.usage', systemMetrics.system.cpu.usage, timestamp);
      await this.recordMetric('agents.active.count', systemMetrics.agents.active, timestamp);
      await this.recordMetric('agents.response.time', systemMetrics.agents.responseTime.avg, timestamp);
      await this.recordMetric('agents.throughput', systemMetrics.agents.throughput.requestsPerSecond, timestamp);
      await this.recordMetric('llm.requests.rate', systemMetrics.llm.requestsPerSecond, timestamp);
      await this.recordMetric('llm.response.time', systemMetrics.llm.averageResponseTime, timestamp);
      await this.recordMetric('llm.cache.hit.rate', systemMetrics.llm.cacheHitRate, timestamp);
      await this.recordMetric('cache.hit.rate', systemMetrics.cache.hitRate, timestamp);
      await this.recordMetric('ipc.connections.active', systemMetrics.ipc.activeConnections, timestamp);
      await this.recordMetric('ipc.messages.rate', systemMetrics.ipc.messagesPerSecond, timestamp);

      // Emit metrics event for dashboard updates
      this.emit('metrics:collected', systemMetrics);

      // Cleanup old metric values
      this.cleanupOldMetrics();

    } catch (error) {
      logger.error('Failed to collect metrics', { error: error.message });
    }
  }

  /**
   * Gather system metrics from various sources
   */
  private async gatherSystemMetrics(timestamp: number): Promise<SystemMetrics> {
    // This would gather real metrics from system monitors, agents, etc.
    // For now, return mock data that simulates realistic values

    return {
      timestamp,
      agents: {
        total: 5,
        active: 4,
        healthy: 4,
        unhealthy: 1,
        responseTime: {
          avg: 1200 + Math.random() * 800,
          p50: 1000,
          p95: 2500,
          p99: 4000
        },
        throughput: {
          requestsPerSecond: 15 + Math.random() * 10,
          successRate: 0.95 + Math.random() * 0.04,
          errorRate: 0.01 + Math.random() * 0.04
        },
        resourceUsage: {
          memory: 150 + Math.random() * 100,
          cpu: 5 + Math.random() * 10,
          disk: 500 + Math.random() * 200
        }
      },
      llm: {
        requestsPerSecond: 2 + Math.random() * 3,
        averageResponseTime: 800 + Math.random() * 400,
        cacheHitRate: 0.7 + Math.random() * 0.2,
        tokenUsage: {
          inputTokensPerSecond: 100 + Math.random() * 50,
          outputTokensPerSecond: 200 + Math.random() * 100,
          totalTokens: 50000 + Math.random() * 10000
        },
        costs: {
          costPerRequest: 0.002 + Math.random() * 0.001,
          totalCost: 50 + Math.random() * 20,
          costPerToken: 0.000001
        },
        errors: {
          errorRate: 0.01 + Math.random() * 0.02,
          timeoutRate: 0.005 + Math.random() * 0.01,
          rateLimitRate: 0.001 + Math.random() * 0.002
        }
      },
      cache: {
        hitRate: 0.8 + Math.random() * 0.15,
        missRate: 0.2 - Math.random() * 0.15,
        evictionRate: 0.01 + Math.random() * 0.02,
        memoryUsage: 50 + Math.random() * 30,
        keyCount: 1000 + Math.random() * 500,
        averageGetTime: 5 + Math.random() * 3,
        averageSetTime: 8 + Math.random() * 4
      },
      ipc: {
        activeConnections: 8 + Math.floor(Math.random() * 4),
        totalConnections: 12,
        messagesPerSecond: 50 + Math.random() * 30,
        averageLatency: 20 + Math.random() * 10,
        connectionErrors: Math.floor(Math.random() * 2),
        reconnections: Math.floor(Math.random() * 3),
        throughput: 45 + Math.random() * 25
      },
      system: {
        memory: {
          used: 4000 + Math.random() * 2000,
          total: 8000,
          usage: 0.5 + Math.random() * 0.25
        },
        cpu: {
          usage: 0.2 + Math.random() * 0.3,
          loadAverage: [0.5, 0.6, 0.7]
        },
        disk: {
          used: 100000 + Math.random() * 50000,
          total: 200000,
          usage: 0.5 + Math.random() * 0.25
        },
        network: {
          bytesIn: 1000 + Math.random() * 500,
          bytesOut: 800 + Math.random() * 400,
          packetsIn: 100 + Math.random() * 50,
          packetsOut: 80 + Math.random() * 40
        }
      },
      custom: {}
    };
  }

  /**
   * Record a metric value
   */
  async recordMetric(
    metricId: string,
    value: number,
    timestamp?: number,
    labels?: Record<string, string>
  ): Promise<void> {
    const metric = this.metrics.get(metricId);
    if (!metric) {
      logger.warn('Unknown metric recorded', { metricId });
      return;
    }

    const metricValue: MetricValue = {
      timestamp: timestamp || Date.now(),
      value,
      labels
    };

    // Store in memory
    if (!this.metricValues.has(metricId)) {
      this.metricValues.set(metricId, []);
    }

    const values = this.metricValues.get(metricId)!;
    values.push(metricValue);

    // Store in cache for persistence
    try {
      const cacheKey = `${this.config.redis.keyPrefix}:metric:${metricId}`;
      await this.cache.set(cacheKey, metricValue, {
        source: 'monitoring',
        metricId,
        timestamp: metricValue.timestamp
      });
    } catch (error) {
      logger.warn('Failed to cache metric value', {
        metricId,
        error: error.message
      });
    }

    // Emit metric event
    this.emit('metric:recorded', { metricId, value: metricValue });
  }

  /**
   * Evaluate all alerts
   */
  private async evaluateAlerts(): Promise<void> {
    for (const [alertId, alert] of this.alerts.entries()) {
      if (!alert.enabled) continue;

      try {
        await this.evaluateAlert(alert);
      } catch (error) {
        logger.error('Failed to evaluate alert', {
          alertId,
          error: error.message
        });
      }
    }
  }

  /**
   * Evaluate a single alert
   */
  private async evaluateAlert(alert: AlertConfig): Promise<void> {
    const currentValue = await this.getLatestMetricValue(alert.condition.metric);
    if (currentValue === null) return;

    const isTriggered = this.evaluateCondition(currentValue, alert.condition);
    const now = Date.now();
    let alertStatus = this.alertStatuses.get(alert.id);

    if (!alertStatus) {
      alertStatus = {
        id: alert.id,
        state: 'ok',
        lastEvaluation: now,
        message: '',
        evaluationCount: 0,
        firstTriggered: 0
      };
      this.alertStatuses.set(alert.id, alertStatus);
    }

    alertStatus.lastEvaluation = now;
    alertStatus.evaluationCount++;

    const wasTriggered = alertStatus.state !== 'ok';

    if (isTriggered && !wasTriggered) {
      // Alert just triggered
      alertStatus.state = alert.severity;
      alertStatus.firstTriggered = now;
      alertStatus.message = `${alert.name}: ${alert.description} (Current: ${currentValue}, Threshold: ${alert.condition.threshold})`;

      // Check duration condition
      if (alert.condition.duration) {
        setTimeout(async () => {
          const stillTriggered = await this.getLatestMetricValue(alert.condition.metric);
          if (stillTriggered !== null && this.evaluateCondition(stillTriggered, alert.condition)) {
            await this.executeAlertActions(alert, alertStatus);
          } else {
            // Condition resolved before duration
            alertStatus.state = 'ok';
            alertStatus.lastResolved = now;
          }
        }, alert.condition.duration);
      } else {
        await this.executeAlertActions(alert, alertStatus);
      }

    } else if (!isTriggered && wasTriggered) {
      // Alert resolved
      alertStatus.state = 'ok';
      alertStatus.lastResolved = now;
      alertStatus.message = `${alert.name} resolved`;

      this.emit('alert:resolved', { alert, status: alertStatus });
    }

    // Emit status update
    this.emit('alert:evaluated', { alert, status: alertStatus });
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(value: number, condition: AlertConfig['condition']): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.threshold;
      case 'lt': return value < condition.threshold;
      case 'eq': return value === condition.threshold;
      case 'ne': return value !== condition.threshold;
      case 'gte': return value >= condition.threshold;
      case 'lte': return value <= condition.threshold;
      default: return false;
    }
  }

  /**
   * Execute alert actions
   */
  private async executeAlertActions(alert: AlertConfig, status: AlertStatus): Promise<void> {
    for (const action of alert.actions) {
      try {
        await this.executeAlertAction(action, alert, status);
      } catch (error) {
        logger.error('Failed to execute alert action', {
          alertId: alert.id,
          actionType: action.type,
          error: error.message
        });
      }
    }

    this.emit('alert:triggered', { alert, status });
  }

  /**
   * Execute a single alert action
   */
  private async executeAlertAction(
    action: AlertAction,
    alert: AlertConfig,
    status: AlertStatus
  ): Promise<void> {
    switch (action.type) {
      case 'log':
        const level = action.config.level || 'info';
        logger[level]('Alert triggered', {
          alertId: alert.id,
          severity: alert.severity,
          message: status.message,
          state: status.state
        });
        break;

      case 'dashboard':
        this.emit('alert:dashboard', {
          alertId: alert.id,
          highlight: action.config.highlight,
          severity: alert.severity,
          message: status.message
        });
        break;

      case 'webhook':
        // This would implement webhook notification
        logger.info('Webhook alert triggered', {
          alertId: alert.id,
          webhookUrl: action.config.url
        });
        break;

      case 'email':
        // This would implement email notification
        logger.info('Email alert triggered', {
          alertId: alert.id,
          recipients: action.config.recipients
        });
        break;
    }
  }

  /**
   * Get latest metric value
   */
  private async getLatestMetricValue(metricId: string): Promise<number | null> {
    const values = this.metricValues.get(metricId);
    if (values && values.length > 0) {
      return values[values.length - 1].value;
    }

    // Try to get from cache
    try {
      const cacheKey = `${this.config.redis.keyPrefix}:metric:${metricId}`;
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached.value;
      }
    } catch (error) {
      logger.warn('Failed to get metric from cache', {
        metricId,
        error: error.message
      });
    }

    return null;
  }

  /**
   * Clean up old metric values
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - (this.config.performance.aggregationWindow);

    for (const [metricId, values] of this.metricValues.entries()) {
      const filteredValues = values.filter(v => v.timestamp >= cutoffTime);

      if (filteredValues.length !== values.length) {
        this.metricValues.set(metricId, filteredValues);
      }
    }

    // Ensure we don't exceed memory limits
    const totalValues = Array.from(this.metricValues.values())
      .reduce((sum, values) => sum + values.length, 0);

    if (totalValues > this.config.performance.maxMetricsInMemory) {
      // Remove oldest values across all metrics
      const valuesToRemove = totalValues - this.config.performance.maxMetricsInMemory;

      for (const values of this.metricValues.values()) {
        if (valuesToRemove <= 0) break;
        const removeCount = Math.min(valuesToRemove, values.length);
        values.splice(0, removeCount);
      }
    }
  }

  /**
   * Register a new metric definition
   */
  registerMetric(definition: MetricDefinition): void {
    this.metrics.set(definition.id, definition);
    logger.debug('Metric registered', { metricId: definition.id });
  }

  /**
   * Register a new alert
   */
  registerAlert(alert: AlertConfig): void {
    this.alerts.set(alert.id, alert);
    logger.debug('Alert registered', { alertId: alert.id });
  }

  /**
   * Get dashboard data for rendering
   */
  async getDashboardData(dashboardId: string): Promise<any> {
    const dashboard = this.config.dashboards.find(d => d.id === dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const panelData: any = {};

    for (const panel of dashboard.panels) {
      panelData[panel.id] = await this.getPanelData(panel);
    }

    return {
      dashboard,
      panels: panelData,
      alerts: Array.from(this.alertStatuses.values()),
      timestamp: Date.now()
    };
  }

  /**
   * Get data for a specific panel
   */
  private async getPanelData(panel: PanelConfig): Promise<any> {
    const data: any = {
      metrics: {}
    };

    for (const metricId of panel.metrics) {
      const values = this.metricValues.get(metricId) || [];
      data.metrics[metricId] = {
        values,
        latest: values.length > 0 ? values[values.length - 1] : null,
        definition: this.metrics.get(metricId)
      };
    }

    return data;
  }

  /**
   * Get all current metrics
   */
  getMetrics(): Map<string, MetricDefinition> {
    return new Map(this.metrics);
  }

  /**
   * Get all alert statuses
   */
  getAlertStatuses(): Map<string, AlertStatus> {
    return new Map(this.alertStatuses);
  }

  /**
   * Get system overview
   */
  async getSystemOverview(): Promise<{
    agents: AgentMetrics;
    llm: LLMMetrics;
    cache: CacheMetrics;
    ipc: IPCMetrics;
    system: SystemResourceMetrics;
    alerts: { active: number; warning: number; critical: number };
  }> {
    const systemMetrics = await this.gatherSystemMetrics(Date.now());

    const alertCounts = Array.from(this.alertStatuses.values()).reduce(
      (counts, status) => {
        if (status.state !== 'ok') {
          counts.active++;
          if (status.state === 'warning') counts.warning++;
          if (status.state === 'critical') counts.critical++;
        }
        return counts;
      },
      { active: 0, warning: 0, critical: 0 }
    );

    return {
      agents: systemMetrics.agents,
      llm: systemMetrics.llm,
      cache: systemMetrics.cache,
      ipc: systemMetrics.ipc,
      system: systemMetrics.system,
      alerts: alertCounts
    };
  }

  /**
   * Gracefully shutdown the monitoring system
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    logger.info('Shutting down Enhanced Monitoring Dashboard');

    // Clear intervals
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    if (this.alertEvaluationInterval) {
      clearInterval(this.alertEvaluationInterval);
    }

    // Clear metrics from memory
    this.metricValues.clear();

    logger.info('Enhanced Monitoring Dashboard shutdown complete');
  }
}
