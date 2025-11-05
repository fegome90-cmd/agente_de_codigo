/**
 * Simple logging utility for Observability Agent
 * Winston-based logging with file rotation
 */

import winston from 'winston';
import 'winston-daily-rotate-file';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info: any) => {
    const { level, message, timestamp, stack, ...meta } = info as any;
    const log: any = {
      timestamp,
      level,
      agent: 'observability',
      message,
      ...meta,
    };
    if (stack) log.stack = stack;
    return JSON.stringify(log);
  })
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, agent }) => {
    return `[${timestamp}] [${agent}] ${level}: ${message}`;
  })
);

// Create the logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    agent: 'observability',
    version: '1.0.0'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
    }),

    // File transport with rotation
    new winston.transports.DailyRotateFile({
      filename: 'obs/logs/observability-agent-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info'
    }),

    // Error file transport
    new winston.transports.DailyRotateFile({
      filename: 'obs/logs/observability-agent-error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error'
    })
  ],

  // Handle exceptions
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: 'obs/logs/observability-agent-exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d'
    })
  ],

  // Handle rejections
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: 'obs/logs/observability-agent-rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
});

// Export helper methods
export const logHelpers = {
  // Structured logging for metrics
  metric: (name: string, value: number, labels?: Record<string, any>) => {
    logger.info('metric_emitted', {
      event_type: 'metric',
      metric_name: name,
      metric_value: value,
      labels: labels || {}
    });
  },

  // Structured logging for alerts
  alert: (severity: 'info' | 'warning' | 'critical', message: string, details?: Record<string, any>) => {
    logger.warn('alert_triggered', {
      event_type: 'alert',
      alert_severity: severity,
      alert_message: message,
      alert_details: details || {}
    });
  },

  // Structured logging for health checks
  health: (component: string, status: 'healthy' | 'degraded' | 'critical', details?: Record<string, any>) => {
    logger.info('health_check', {
      event_type: 'health_check',
      component,
      health_status: status,
      health_details: details || {}
    });
  },

  // Structured logging for trace data
  trace: (operation: string, duration: number, status: 'success' | 'error', attributes?: Record<string, any>) => {
    logger.info('trace_completed', {
      event_type: 'trace',
      operation_name: operation,
      duration_ms: duration,
      trace_status: status,
      attributes: attributes || {}
    });
  },

  // Performance logging
  performance: (operation: string, duration: number, memoryUsage?: any, cpuUsage?: any) => {
    logger.info('performance_metrics', {
      event_type: 'performance',
      operation_name: operation,
      duration_ms: duration,
      memory_usage: memoryUsage,
      cpu_usage: cpuUsage
    });
  },

  // Agent status logging
  agentStatus: (agentName: string, status: string, metrics?: Record<string, any>) => {
    logger.info('agent_status_update', {
      event_type: 'agent_status',
      agent_name: agentName,
      agent_status: status,
      agent_metrics: metrics || {}
    });
  }
};

// Add child logger for different contexts
export const createChildLogger = (context: string) => {
  return logger.child({ context });
};

export default logger;
