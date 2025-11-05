/**
 * Simple logger implementation to replace winston
 * Minimal logging functionality for PR Reviewer Agent
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class SimpleLogger {
  private level: LogLevel;
  private service: string;

  constructor(service: string, level: LogLevel = LogLevel.INFO) {
    this.service = service;
    this.level = level;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ` ${args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ')}` : '';
    return `[${timestamp}] [${level}] [${this.service}] ${message}${argsStr}`;
  }

  error(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message, ...args));
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, ...args));
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message, ...args));
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message, ...args));
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Create a default logger instance
export const logger = new SimpleLogger('pr-reviewer-agent', LogLevel.INFO);