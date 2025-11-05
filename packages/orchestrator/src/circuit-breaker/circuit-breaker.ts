/**
 * Circuit Breaker Implementation
 *
 * Provides fault tolerance with configurable thresholds, retry policies,
 * and fallback strategies for agent communication and LLM calls
 *
 * @author Pit Crew v2.0.0
 * @since 2025-11-03
 */

import { EventEmitter } from "events";
import { z } from "zod";
import { logger } from "../utils/logger.js";

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = "closed", // Normal operation, requests pass through
  OPEN = "open", // Circuit is open, requests fail fast
  HALF_OPEN = "half-open", // Testing if service has recovered
}

/**
 * Circuit breaker configuration schema
 */
export const CircuitBreakerConfigSchema = z.object({
  // Failure thresholds
  failureThreshold: z
    .number()
    .min(1)
    .default(5)
    .describe("Number of failures before opening circuit"),
  timeout: z
    .number()
    .min(1000)
    .default(60000)
    .describe(
      "Time in milliseconds to wait before transitioning from OPEN to HALF_OPEN",
    ),

  // Success thresholds for recovery
  successThreshold: z
    .number()
    .min(1)
    .default(3)
    .describe("Number of consecutive successes required to close circuit"),
  monitoringPeriod: z
    .number()
    .min(1000)
    .default(10000)
    .describe("Time window for failure counting"),

  // Retry configuration
  maxRetries: z
    .number()
    .min(0)
    .default(3)
    .describe("Maximum number of retry attempts"),
  retryDelay: z
    .number()
    .min(100)
    .default(1000)
    .describe("Initial delay between retries in milliseconds"),
  retryBackoffMultiplier: z
    .number()
    .min(1)
    .default(2)
    .describe("Multiplier for exponential backoff"),
  maxRetryDelay: z
    .number()
    .min(1000)
    .default(30000)
    .describe("Maximum delay between retries"),

  // Fallback configuration
  fallbackEnabled: z
    .boolean()
    .default(true)
    .describe("Whether to enable fallback mechanisms"),
  fallbackTimeout: z
    .number()
    .min(1000)
    .default(5000)
    .describe("Timeout for fallback execution"),

  // Monitoring
  metricsEnabled: z
    .boolean()
    .default(true)
    .describe("Whether to collect detailed metrics"),
  loggingEnabled: z
    .boolean()
    .default(true)
    .describe("Whether to log circuit breaker events"),
});

export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  state: CircuitState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeouts: number;
  retries: number;
  fallbackCalls: number;
  averageResponseTime: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  stateChanges: number;
  uptimePercentage: number;
  failureRate: number;
}

/**
 * Retry options
 */
export interface RetryOptions {
  maxRetries?: number;
  delay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  retryCondition?: (error: Error) => boolean;
}

/**
 * Fallback function type
 */
export type FallbackFunction<T> = (error: Error, context?: any) => Promise<T>;

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private stateChangeCount: number = 0;

  // Configuration
  private config: CircuitBreakerConfig;

  // Metrics tracking
  private metrics: CircuitBreakerMetrics = {
    state: CircuitState.CLOSED,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    timeouts: 0,
    retries: 0,
    fallbackCalls: 0,
    averageResponseTime: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    stateChanges: 0,
    uptimePercentage: 0,
    failureRate: 0,
  };

  // Response time tracking for average calculation
  private responseTimes: number[] = [];
  private readonly maxResponseTimeSamples = 100;

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {},
  ) {
    super();
    this.config = CircuitBreakerConfigSchema.parse(config);

    logger.info(`Circuit breaker initialized`, {
      name: this.name,
      config: this.config,
    });
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallbackFn?: FallbackFunction<T>,
    retryOptions?: RetryOptions,
    context?: any,
  ): Promise<T> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Check if circuit is open
      if (this.state === CircuitState.OPEN) {
        if (this.shouldAttemptReset()) {
          this.transitionToHalfOpen();
        } else {
          throw new Error(`Circuit breaker '${this.name}' is OPEN`);
        }
      }

      // Execute with retry logic
      const result = await this.executeWithRetry(fn, retryOptions, context);

      // Record success
      this.recordSuccess(startTime);

      return result as T;
    } catch (error) {
      // Record failure
      this.recordFailure(error as Error, startTime);

      // Attempt fallback if available
      if (fallbackFn && this.config.fallbackEnabled) {
        return this.executeFallback(error as Error, fallbackFn, context);
      }

      throw error;
    }
  }

  /**
   * Execute function with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryOptions?: RetryOptions,
    context?: any,
  ): Promise<T> {
    const options = {
      maxRetries: this.config.maxRetries,
      delay: this.config.retryDelay,
      backoffMultiplier: this.config.retryBackoffMultiplier,
      maxDelay: this.config.maxRetryDelay,
      retryCondition: (error: Error) => true, // Retry on all errors by default
      ...retryOptions,
    };

    let lastError: Error;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.metrics.retries++;

          const delay = Math.min(
            options.delay * Math.pow(options.backoffMultiplier, attempt - 1),
            options.maxDelay,
          );

          logger.debug(`Retrying operation`, {
            circuitBreaker: this.name,
            attempt: attempt + 1,
            maxRetries: options.maxRetries,
            delay,
          });

          await this.sleep(delay);
        }

        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry this error
        if (
          attempt === options.maxRetries ||
          !options.retryCondition(lastError)
        ) {
          break;
        }

        logger.debug(`Operation failed, will retry`, {
          circuitBreaker: this.name,
          attempt: attempt + 1,
          error: lastError.message,
        });
      }
    }

    throw lastError!;
  }

  /**
   * Execute fallback function
   */
  private async executeFallback<T>(
    error: Error,
    fallbackFn: FallbackFunction<T>,
    context?: any,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      logger.debug(`Executing fallback`, {
        circuitBreaker: this.name,
        error: error.message,
      });

      const result = await Promise.race([
        fallbackFn(error, context),
        this.timeout(this.config.fallbackTimeout),
      ]);

      this.metrics.fallbackCalls++;

      const duration = Date.now() - startTime;
      logger.info(`Fallback executed successfully`, {
        circuitBreaker: this.name,
        duration,
      });

      return result as T;
    } catch (fallbackError) {
      const duration = Date.now() - startTime;

      logger.error(`Fallback execution failed`, {
        circuitBreaker: this.name,
        originalError: error.message,
        fallbackError: (fallbackError as Error).message,
        duration,
      });

      throw new Error(
        `Both primary operation and fallback failed. Primary: ${error.message}, Fallback: ${(fallbackError as Error).message}`,
      );
    }
  }

  /**
   * Record successful operation
   */
  private recordSuccess(startTime: number): void {
    const duration = Date.now() - startTime;
    this.updateResponseTime(duration);

    this.metrics.successfulRequests++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }

    this.updateMetrics();

    if (this.config.loggingEnabled) {
      logger.debug(`Operation completed successfully`, {
        circuitBreaker: this.name,
        state: this.state,
        duration,
        successCount: this.successCount,
        failureCount: this.failureCount,
      });
    }
  }

  /**
   * Record failed operation
   */
  private recordFailure(error: Error, startTime: number): void {
    const duration = Date.now() - startTime;
    this.updateResponseTime(duration);

    this.metrics.failedRequests++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.CLOSED) {
      this.failureCount++;

      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    }

    this.updateMetrics();

    if (this.config.loggingEnabled) {
      logger.warn(`Operation failed`, {
        circuitBreaker: this.name,
        state: this.state,
        error: error.message,
        duration,
        failureCount: this.failureCount,
      });
    }
  }

  /**
   * State transition methods
   */
  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.stateChangeCount++;

    logger.warn(`Circuit breaker OPENED`, {
      name: this.name,
      previousState,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
    });

    this.emit("stateChange", {
      name: this.name,
      from: previousState,
      to: CircuitState.OPEN,
      reason: `Failure threshold (${this.config.failureThreshold}) reached`,
    });
  }

  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.stateChangeCount++;

    logger.info(`Circuit breaker HALF_OPEN`, {
      name: this.name,
      previousState,
      timeout: this.config.timeout,
    });

    this.emit("stateChange", {
      name: this.name,
      from: previousState,
      to: CircuitState.HALF_OPEN,
      reason: `Timeout (${this.config.timeout}) elapsed, testing recovery`,
    });
  }

  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.stateChangeCount++;

    logger.info(`Circuit breaker CLOSED`, {
      name: this.name,
      previousState,
      successCount: this.successCount,
      threshold: this.config.successThreshold,
    });

    this.emit("stateChange", {
      name: this.name,
      from: previousState,
      to: CircuitState.CLOSED,
      reason: `Success threshold (${this.config.successThreshold}) reached`,
    });
  }

  /**
   * Check if circuit should attempt reset
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.timeout;
  }

  /**
   * Update response time tracking
   */
  private updateResponseTime(duration: number): void {
    this.responseTimes.push(duration);

    if (this.responseTimes.length > this.maxResponseTimeSamples) {
      this.responseTimes.shift();
    }

    this.metrics.averageResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) /
      this.responseTimes.length;
  }

  /**
   * Update calculated metrics
   */
  private updateMetrics(): void {
    this.metrics.state = this.state;
    this.metrics.stateChanges = this.stateChangeCount;
    this.metrics.lastFailureTime = this.lastFailureTime;
    this.metrics.lastSuccessTime = this.lastSuccessTime;

    // Calculate failure rate
    if (this.metrics.totalRequests > 0) {
      this.metrics.failureRate =
        (this.metrics.failedRequests / this.metrics.totalRequests) * 100;
    }

    // Calculate uptime percentage
    if (this.metrics.totalRequests > 0) {
      this.metrics.uptimePercentage =
        ((this.metrics.totalRequests - this.metrics.failedRequests) /
          this.metrics.totalRequests) *
        100;
    }
  }

  /**
   * Utility methods
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async timeout<T>(ms: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Fallback timeout")), ms);
    });
  }

  /**
   * Public API methods
   */

  public getState(): CircuitState {
    return this.state;
  }

  public getMetrics(): CircuitBreakerMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  public getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  public getName(): string {
    return this.name;
  }

  public isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  public isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  public isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }

  /**
   * Force circuit breaker state (for testing and maintenance)
   */
  public forceState(state: CircuitState): void {
    const previousState = this.state;
    this.state = state;
    this.stateChangeCount++;

    logger.info(`Circuit breaker state forced`, {
      name: this.name,
      previousState,
      newState: state,
    });

    this.emit("stateChange", {
      name: this.name,
      from: previousState,
      to: state,
      reason: "Manual state change",
    });
  }

  /**
   * Reset circuit breaker to closed state
   */
  public reset(): void {
    this.forceState(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.responseTimes = [];

    // Reset metrics
    this.metrics = {
      state: CircuitState.CLOSED,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      retries: 0,
      fallbackCalls: 0,
      averageResponseTime: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      stateChanges: 0,
      uptimePercentage: 0,
      failureRate: 0,
    };

    logger.info(`Circuit breaker reset`, {
      name: this.name,
    });
  }

  /**
   * Destroy circuit breaker and cleanup
   */
  public destroy(): void {
    this.removeAllListeners();
    logger.info(`Circuit breaker destroyed`, {
      name: this.name,
    });
  }
}

/**
 * Circuit Breaker Registry - Manages multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  public static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  /**
   * Create or get a circuit breaker
   */
  public getOrCreate(
    name: string,
    config?: CircuitBreakerConfig,
  ): CircuitBreaker {
    let circuitBreaker = this.circuitBreakers.get(name);

    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker(name, config);
      this.circuitBreakers.set(name, circuitBreaker);

      logger.info(`Circuit breaker created`, {
        name,
        config,
      });
    }

    return circuitBreaker;
  }

  /**
   * Get existing circuit breaker
   */
  public get(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  public getAll(): Map<string, CircuitBreaker> {
    return new Map(this.circuitBreakers);
  }

  /**
   * Remove circuit breaker
   */
  public remove(name: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(name);
    if (circuitBreaker) {
      circuitBreaker.destroy();
      this.circuitBreakers.delete(name);

      logger.info(`Circuit breaker removed`, {
        name,
      });

      return true;
    }
    return false;
  }

  /**
   * Get metrics for all circuit breakers
   */
  public getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};

    this.circuitBreakers.forEach((circuitBreaker, name) => {
      metrics[name] = circuitBreaker.getMetrics();
    });

    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  public resetAll(): void {
    this.circuitBreakers.forEach((circuitBreaker, name) => {
      circuitBreaker.reset();
    });

    logger.info(`All circuit breakers reset`);
  }

  /**
   * Get circuit breakers by state
   */
  public getByState(state: CircuitState): CircuitBreaker[] {
    return Array.from(this.circuitBreakers.values()).filter(
      (circuitBreaker) =>
        (circuitBreaker as CircuitBreaker).getState() === state,
    ) as CircuitBreaker[];
  }

  /**
   * Get health summary
   */
  public getHealthSummary(): {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
    healthy: number;
    unhealthy: number;
  } {
    const circuitBreakers = Array.from(
      this.circuitBreakers.values(),
    ) as CircuitBreaker[];

    return {
      total: circuitBreakers.length,
      closed: circuitBreakers.filter((cb) => cb.isClosed()).length,
      open: circuitBreakers.filter((cb) => cb.isOpen()).length,
      halfOpen: circuitBreakers.filter((cb) => cb.isHalfOpen()).length,
      healthy: circuitBreakers.filter((cb) => cb.isClosed() || cb.isHalfOpen())
        .length,
      unhealthy: circuitBreakers.filter((cb) => cb.isOpen()).length,
    };
  }

  /**
   * Destroy all circuit breakers
   */
  public destroyAll(): void {
    this.circuitBreakers.forEach((circuitBreaker, name) => {
      circuitBreaker.destroy();
    });

    this.circuitBreakers.clear();

    logger.info(`All circuit breakers destroyed`);
  }
}
