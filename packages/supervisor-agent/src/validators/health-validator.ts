/**
 * Health Validator for Supervisor Agent
 * Validates agent health status and availability
 */

import { z } from 'zod';
import winston from 'winston';
import { AgentHealth, AgentStatus } from '@pit-crew/shared';

/**
 * Configuration for health validation
 */
export const HealthValidationConfigSchema = z.object({
  minimumHealthyAgents: z.number().min(1).default(2),
  maxResponseTime: z.number().positive().default(5000), // 5 seconds
  requiredAgents: z.array(z.string()).default(['quality', 'security']),
  circuitBreakerThreshold: z.number().min(1).default(3),
});

export type HealthValidationConfig = z.infer<typeof HealthValidationConfigSchema>;

/**
 * Health validation result
 */
export interface HealthValidationResult {
  valid: boolean;
  healthyAgents: string[];
  unhealthyAgents: string[];
  warnings: string[];
  criticalIssues: string[];
  recommendations: string[];
}

/**
 * Health Validator
 * Validates the health of available agents and provides recommendations
 */
export class HealthValidator {
  private logger: winston.Logger;
  private config: HealthValidationConfig;

  constructor(config: Partial<HealthValidationConfig> = {}) {
    this.config = HealthValidationConfigSchema.parse(config);
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.prettyPrint()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: './logs/supervisor-health.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Filter healthy agents from available agents
   */
  async filterHealthy(agents: Map<string, AgentHealth>): Promise<string[]> {
    this.logger.info('Validating agent health', {
      totalAgents: agents.size,
      config: this.config,
    });

    const result = await this.validateAgentHealth(agents);

    if (result.valid) {
      this.logger.info('Health validation passed', {
        healthyAgents: result.healthyAgents.length,
        warnings: result.warnings.length,
      });
      return result.healthyAgents;
    } else {
      this.logger.warn('Health validation failed', {
        healthyAgents: result.healthyAgents.length,
        criticalIssues: result.criticalIssues,
      });
      return result.healthyAgents; // Still return healthy agents even with critical issues
    }
  }

  /**
   * Validate the health of all available agents
   */
  private async validateAgentHealth(agents: Map<string, AgentHealth>): Promise<HealthValidationResult> {
    const healthyAgents: string[] = [];
    const unhealthyAgents: string[] = [];
    const warnings: string[] = [];
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    // Check each agent
    for (const [agentName, health] of agents.entries()) {
      const agentHealth = this.validateSingleAgent(agentName, health);

      if (agentHealth.isHealthy) {
        healthyAgents.push(agentName);
      } else {
        unhealthyAgents.push(agentName);
        criticalIssues.push(...agentHealth.criticalIssues);
      }

      warnings.push(...agentHealth.warnings);
      recommendations.push(...agentHealth.recommendations);
    }

    // Check minimum healthy agents
    if (healthyAgents.length < this.config.minimumHealthyAgents) {
      criticalIssues.push(
        `Insufficient healthy agents: ${healthyAgents.length}/${this.config.minimumHealthyAgents} required`
      );
    }

    // Check required agents
    for (const requiredAgent of this.config.requiredAgents) {
      if (!healthyAgents.includes(requiredAgent)) {
        criticalIssues.push(`Required agent '${requiredAgent}' is not healthy or available`);
      }
    }

    // Generate recommendations
    if (unhealthyAgents.length > 0) {
      recommendations.push(`Restart unhealthy agents: ${unhealthyAgents.join(', ')}`);
    }

    if (healthyAgents.length < this.config.minimumHealthyAgents) {
      recommendations.push('Check agent processes and restart if needed');
    }

    const result: HealthValidationResult = {
      valid: criticalIssues.length === 0,
      healthyAgents,
      unhealthyAgents,
      warnings,
      criticalIssues,
      recommendations,
    };

    this.logger.info('Health validation completed', {
      valid: result.valid,
      healthyCount: result.healthyAgents.length,
      unhealthyCount: result.unhealthyAgents.length,
      warningCount: warnings.length,
      criticalCount: criticalIssues.length,
    });

    return result;
  }

  /**
   * Validate a single agent's health
   */
  private validateSingleAgent(agentName: string, health: AgentHealth): {
    isHealthy: boolean;
    criticalIssues: string[];
    warnings: string[];
    recommendations: string[];
  } {
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check status
    if (health.status !== AgentStatus.HEALTHY) {
      criticalIssues.push(`Agent '${agentName}' status is ${health.status}`);
    }

    // Check response time
    const responseTime = (health as any).responseTime || health.average_latency_ms;
    if (responseTime && responseTime > this.config.maxResponseTime) {
      warnings.push(`Agent '${agentName}' response time is slow: ${responseTime}ms`);
      recommendations.push(`Consider optimizing agent '${agentName}' performance`);
    }

    // Check last heartbeat
    const lastHeartbeat = (health as any).lastHeartbeat || health.last_heartbeat;
    if (lastHeartbeat) {
      const timeSinceLastHeartbeat = Date.now() - new Date(lastHeartbeat).getTime();
      const maxHeartbeatAge = this.config.maxResponseTime * 2;

      if (timeSinceLastHeartbeat > maxHeartbeatAge) {
        criticalIssues.push(`Agent '${agentName}' last heartbeat was too long ago: ${timeSinceLastHeartbeat}ms`);
      }
    }

    // Check error rate
    const errorRate = (health as any).errorRate;
    if (errorRate && errorRate > 0.1) { // 10% error rate
      warnings.push(`Agent '${agentName}' has high error rate: ${(errorRate * 100).toFixed(1)}%`);
      recommendations.push(`Review agent '${agentName}' logs for errors`);
    }

    // Check uptime
    const uptime = (health as any).uptime || health.uptime_ms;
    if (uptime && uptime < 60000) { // Less than 1 minute
      warnings.push(`Agent '${agentName}' has low uptime: ${uptime}ms`);
    }

    // Check if agent is using fallback mode
    const usingFallback = (health as any).usingFallback;
    if (usingFallback) {
      warnings.push(`Agent '${agentName}' is operating in fallback mode`);
    }

    // Check memory usage if available
    const memoryUsage = (health as any).memoryUsage || health.memory_usage_mb;
    if (memoryUsage && memoryUsage > 150 * 1024 * 1024) { // 150MB
      warnings.push(`Agent '${agentName}' memory usage is high: ${(memoryUsage / 1024 / 1024).toFixed(1)}MB`);
      recommendations.push(`Monitor agent '${agentName}' for memory leaks`);
    }

    return {
      isHealthy: criticalIssues.length === 0,
      criticalIssues,
      warnings,
      recommendations,
    };
  }

  /**
   * Get health validation configuration
   */
  getConfig(): HealthValidationConfig {
    return { ...this.config };
  }

  /**
   * Update health validation configuration
   */
  updateConfig(config: Partial<HealthValidationConfig>): void {
    this.config = HealthValidationConfigSchema.parse({ ...this.config, ...config });
    this.logger.info('Health validation config updated', { config: this.config });
  }
}
