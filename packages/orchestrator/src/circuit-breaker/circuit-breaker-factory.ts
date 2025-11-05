/**
 * Circuit Breaker Factory
 *
 * Provides pre-configured circuit breakers for different use cases
 * within the Pit Crew multi-agent system
 *
 * @author Pit Crew v2.0.0
 * @since 2025-11-03
 */

import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerRegistry } from './circuit-breaker.js';

/**
 * Predefined circuit breaker configurations
 */
export const CIRCUIT_BREAKER_CONFIGS = {
  // Configuration for LLM API calls (more tolerant)
  llm_api: {
    failureThreshold: 3,
    timeout: 30000,      // 30 seconds
    successThreshold: 2,
    monitoringPeriod: 60000, // 1 minute
    maxRetries: 2,
    retryDelay: 1000,    // 1 second
    retryBackoffMultiplier: 2,
    maxRetryDelay: 10000, // 10 seconds
    fallbackEnabled: true,
    fallbackTimeout: 15000, // 15 seconds
    metricsEnabled: true,
    loggingEnabled: true
  } as CircuitBreakerConfig,

  // Configuration for agent IPC communication (less tolerant)
  agent_communication: {
    failureThreshold: 5,
    timeout: 10000,      // 10 seconds
    successThreshold: 3,
    monitoringPeriod: 30000, // 30 seconds
    maxRetries: 3,
    retryDelay: 500,     // 0.5 seconds
    retryBackoffMultiplier: 1.5,
    maxRetryDelay: 5000,  // 5 seconds
    fallbackEnabled: true,
    fallbackTimeout: 3000, // 3 seconds
    metricsEnabled: true,
    loggingEnabled: true
  } as CircuitBreakerConfig,

  // Configuration for external tool calls (Semgrep, Gitleaks, etc.)
  external_tools: {
    failureThreshold: 4,
    timeout: 60000,      // 1 minute
    successThreshold: 2,
    monitoringPeriod: 120000, // 2 minutes
    maxRetries: 1,       // External tools often don't benefit from retries
    retryDelay: 2000,    // 2 seconds
    retryBackoffMultiplier: 2,
    maxRetryDelay: 10000, // 10 seconds
    fallbackEnabled: true,
    fallbackTimeout: 20000, // 20 seconds
    metricsEnabled: true,
    loggingEnabled: true
  } as CircuitBreakerConfig,

  // Configuration for database operations
  database: {
    failureThreshold: 5,
    timeout: 5000,       // 5 seconds
    successThreshold: 3,
    monitoringPeriod: 30000, // 30 seconds
    maxRetries: 3,
    retryDelay: 200,     // 0.2 seconds
    retryBackoffMultiplier: 2,
    maxRetryDelay: 2000, // 2 seconds
    fallbackEnabled: false, // Database operations usually don't have fallbacks
    fallbackTimeout: 1000,
    metricsEnabled: true,
    loggingEnabled: true
  } as CircuitBreakerConfig,

  // Configuration for file system operations
  filesystem: {
    failureThreshold: 3,
    timeout: 3000,       // 3 seconds
    successThreshold: 2,
    monitoringPeriod: 15000, // 15 seconds
    maxRetries: 2,
    retryDelay: 100,     // 0.1 seconds
    retryBackoffMultiplier: 2,
    maxRetryDelay: 1000, // 1 second
    fallbackEnabled: true,
    fallbackTimeout: 2000, // 2 seconds
    metricsEnabled: true,
    loggingEnabled: false // File system operations can be noisy
  } as CircuitBreakerConfig,

  // Configuration for HTTP requests to external services
  http_requests: {
    failureThreshold: 4,
    timeout: 15000,      // 15 seconds
    successThreshold: 2,
    monitoringPeriod: 45000, // 45 seconds
    maxRetries: 2,
    retryDelay: 1000,    // 1 second
    retryBackoffMultiplier: 2,
    maxRetryDelay: 8000,  // 8 seconds
    fallbackEnabled: true,
    fallbackTimeout: 5000, // 5 seconds
    metricsEnabled: true,
    loggingEnabled: true
  } as CircuitBreakerConfig
} as const;

/**
 * Circuit breaker factory class
 */
export class CircuitBreakerFactory {
  private static registry = CircuitBreakerRegistry.getInstance();

  /**
   * Create or get a circuit breaker for LLM API calls
   */
  static createLLMBreaker(name: string, customConfig?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const config = { ...CIRCUIT_BREAKER_CONFIGS.llm_api, ...customConfig };
    return this.registry.getOrCreate(`llm_${name}`, config);
  }

  /**
   * Create or get a circuit breaker for agent communication
   */
  static createAgentCommunicationBreaker(name: string, customConfig?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const config = { ...CIRCUIT_BREAKER_CONFIGS.agent_communication, ...customConfig };
    return this.registry.getOrCreate(`agent_${name}`, config);
  }

  /**
   * Create or get a circuit breaker for external tool calls
   */
  static createExternalToolBreaker(name: string, customConfig?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const config = { ...CIRCUIT_BREAKER_CONFIGS.external_tools, ...customConfig };
    return this.registry.getOrCreate(`tool_${name}`, config);
  }

  /**
   * Create or get a circuit breaker for database operations
   */
  static createDatabaseBreaker(name: string, customConfig?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const config = { ...CIRCUIT_BREAKER_CONFIGS.database, ...customConfig };
    return this.registry.getOrCreate(`db_${name}`, config);
  }

  /**
   * Create or get a circuit breaker for file system operations
   */
  static createFileSystemBreaker(name: string, customConfig?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const config = { ...CIRCUIT_BREAKER_CONFIGS.filesystem, ...customConfig };
    return this.registry.getOrCreate(`fs_${name}`, config);
  }

  /**
   * Create or get a circuit breaker for HTTP requests
   */
  static createHTTPRequestBreaker(name: string, customConfig?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const config = { ...CIRCUIT_BREAKER_CONFIGS.http_requests, ...customConfig };
    return this.registry.getOrCreate(`http_${name}`, config);
  }

  /**
   * Create a circuit breaker with custom configuration
   */
  static createCustomBreaker(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    return this.registry.getOrCreate(name, config);
  }

  /**
   * Get existing circuit breaker
   */
  static getBreaker(name: string): CircuitBreaker | undefined {
    return this.registry.get(name);
  }

  /**
   * Get all circuit breakers
   */
  static getAllBreakers(): Map<string, CircuitBreaker> {
    return this.registry.getAll();
  }

  /**
   * Get metrics for all circuit breakers
   */
  static getAllMetrics(): Record<string, any> {
    return this.registry.getAllMetrics();
  }

  /**
   * Get health summary for all circuit breakers
   */
  static getHealthSummary(): any {
    return this.registry.getHealthSummary();
  }

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    this.registry.resetAll();
  }

  /**
   * Remove circuit breaker
   */
  static removeBreaker(name: string): boolean {
    return this.registry.remove(name);
  }

  /**
   * Create circuit breakers for all agents in the system
   */
  static createAgentCircuitBreakers(agentNames: string[]): Record<string, CircuitBreaker> {
    const breakers: Record<string, CircuitBreaker> = {};

    agentNames.forEach(agentName => {
      // Create communication breaker for each agent
      breakers[`${agentName}_communication`] = this.createAgentCommunicationBreaker(agentName);

      // Create tool execution breaker for each agent
      breakers[`${agentName}_tools`] = this.createExternalToolBreaker(`${agentName}_tools`);
    });

    return breakers;
  }

  /**
   * Create circuit breakers for common system components
   */
  static createSystemCircuitBreakers(): Record<string, CircuitBreaker> {
    const breakers: Record<string, CircuitBreaker> = {
      // LLM circuit breakers
      'claude_api': this.createLLMBreaker('claude'),
      'glm_api': this.createLLMBreaker('glm'),

      // Database circuit breakers
      'redis_connection': this.createDatabaseBreaker('redis'),
      'postgres_connection': this.createDatabaseBreaker('postgres'),

      // File system circuit breakers
      'config_file_read': this.createFileSystemBreaker('config_read'),
      'report_file_write': this.createFileSystemBreaker('report_write'),

      // HTTP circuit breakers
      'github_api': this.createHTTPRequestBreaker('github'),
      'observability_api': this.createHTTPRequestBreaker('observability')
    };

    return breakers;
  }
}

/**
 * Utility functions for common circuit breaker patterns
 */
export class CircuitBreakerUtils {
  /**
   * Execute an LLM call with circuit breaker protection
   */
  static async executeLLMCall<T>(
    breakerName: string,
    llmCall: () => Promise<T>,
    fallbackCall?: (error: Error) => Promise<T>,
    customConfig?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const breaker = CircuitBreakerFactory.createLLMBreaker(breakerName, customConfig);
    return breaker.execute(llmCall, fallbackCall);
  }

  /**
   * Execute agent communication with circuit breaker protection
   */
  static async executeAgentCommunication<T>(
    agentName: string,
    communication: () => Promise<T>,
    fallbackCall?: (error: Error) => Promise<T>,
    customConfig?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const breaker = CircuitBreakerFactory.createAgentCommunicationBreaker(agentName, customConfig);
    return breaker.execute(communication, fallbackCall);
  }

  /**
   * Execute external tool with circuit breaker protection
   */
  static async executeExternalTool<T>(
    toolName: string,
    toolExecution: () => Promise<T>,
    fallbackCall?: (error: Error) => Promise<T>,
    customConfig?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const breaker = CircuitBreakerFactory.createExternalToolBreaker(toolName, customConfig);
    return breaker.execute(toolExecution, fallbackCall);
  }

  /**
   * Create a composite fallback that tries multiple fallback strategies
   */
  static createCompositeFallback<T>(fallbacks: Array<(error: Error) => Promise<T>>): (error: Error) => Promise<T> {
    return async (error: Error): Promise<T> => {
      for (let i = 0; i < fallbacks.length; i++) {
        try {
          return await fallbacks[i](error);
        } catch (fallbackError) {
          // If this is the last fallback, throw the error
          if (i === fallbacks.length - 1) {
            throw new Error(
              `All fallbacks failed. Original: ${error.message}, Last fallback: ${(fallbackError as Error).message}`
            );
          }
          // Otherwise, continue to next fallback
          continue;
        }
      }
      throw error; // Should never reach here
    };
  }

  /**
   * Create a cached fallback that returns cached results when available
   */
  static createCachedFallback<T>(
    cache: Map<string, { result: T; timestamp: number }>,
    cacheKey: string,
    maxAge: number = 300000 // 5 minutes default
  ): (error: Error) => Promise<T> {
    return async (error: Error): Promise<T> => {
      const cached = cache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp) < maxAge) {
        return cached.result;
      }

      throw new Error(`No valid cache entry for key: ${cacheKey}`);
    };
  }

  /**
   * Create a default result fallback
   */
  static createDefaultFallback<T>(defaultResult: T): (error: Error) => Promise<T> {
    return async (error: Error): Promise<T> => {
      return defaultResult;
    };
  }

  /**
   * Wait for circuit breaker to become healthy
   */
  static async waitForHealthyBreaker(
    breakerName: string,
    timeout: number = 60000 // 1 minute default
  ): Promise<void> {
    const breaker = CircuitBreakerFactory.getBreaker(breakerName);

    if (!breaker) {
      throw new Error(`Circuit breaker '${breakerName}' not found`);
    }

    const startTime = Date.now();

    while (breaker.isOpen() && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (breaker.isOpen()) {
      throw new Error(`Circuit breaker '${breakerName}' did not become healthy within ${timeout}ms`);
    }
  }

  /**
   * Get circuit breaker health check result
   */
  static getHealthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    summary: any;
    details: Record<string, any>;
    recommendations: string[];
  } {
    const summary = CircuitBreakerFactory.getHealthSummary();
    const metrics = CircuitBreakerFactory.getAllMetrics();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];

    // Determine overall health
    if (summary.unhealthy > 0) {
      status = 'unhealthy';
      recommendations.push(`${summary.unhealthy} circuit breaker(s) are OPEN and need attention`);
    } else if (summary.halfOpen > 0) {
      status = 'degraded';
      recommendations.push(`${summary.halfOpen} circuit breaker(s) are HALF_OPEN and testing recovery`);
    }

    // Check for high failure rates
    Object.entries(metrics).forEach(([name, metric]) => {
      if (metric.failureRate > 50) {
        status = status === 'healthy' ? 'degraded' : status;
        recommendations.push(`Circuit breaker '${name}' has high failure rate: ${metric.failureRate.toFixed(1)}%`);
      }
    });

    // Check for low uptime
    Object.entries(metrics).forEach(([name, metric]) => {
      if (metric.uptimePercentage < 90) {
        status = status === 'healthy' ? 'degraded' : status;
        recommendations.push(`Circuit breaker '${name}' has low uptime: ${metric.uptimePercentage.toFixed(1)}%`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('All circuit breakers are operating normally');
    }

    return {
      status,
      summary,
      details: metrics,
      recommendations
    };
  }
}
