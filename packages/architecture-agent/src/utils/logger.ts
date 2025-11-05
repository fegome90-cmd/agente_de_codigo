/**
 * Logger utility for Architecture Agent
 * Provides structured logging with winston
 */

import winston from 'winston';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

// Ensure logs directory exists
const logsDir = './logs';
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Create logger instance
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let log = `${timestamp} [${level.toUpperCase()}] [ARCHITECTURE_AGENT]: ${message}`;

      // Add metadata if present
      if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
      }

      return log;
    })
  ),
  defaultMeta: {
    agent: 'architecture-agent',
    version: '1.0.0'
  },
  transports: [
    // File transport for logs
    new winston.transports.File({
      filename: join(logsDir, 'architecture-agent.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),

    // Error log file
    new winston.transports.File({
      filename: join(logsDir, 'architecture-agent-error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      tailable: true
    }),

    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let log = `${timestamp} [${level}] [ARCHITECTURE_AGENT]: ${message}`;

          // Add metadata if present and in development
          if (Object.keys(meta).length > 0 && process.env.NODE_ENV !== 'production') {
            log += ` ${JSON.stringify(meta, null, 2)}`;
          }

          return log;
        })
      )
    })
  ],

  // Exception handling
  exceptionHandlers: [
    new winston.transports.File({
      filename: join(logsDir, 'architecture-agent-exceptions.log')
    })
  ],

  // Rejection handling
  rejectionHandlers: [
    new winston.transports.File({
      filename: join(logsDir, 'architecture-agent-rejections.log')
    })
  ]
});

// Development vs production configuration
if (process.env.NODE_ENV === 'production') {
  logger.level = 'warn';
} else {
  logger.level = 'debug';
}

export default logger;