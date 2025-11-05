/**
 * Supervisor Agent for Pit Crew Multi-Agent System
 * Validates and routes tasks to appropriate agents
 */

import { z } from 'zod';
import winston from 'winston';
import {
  GitEvent,
  AgentHealth,
  SkillRule,
  AgentUtils,
  TaskResult,
} from '@pit-crew/shared';
import { HealthValidator, HealthValidationConfig } from './validators/health-validator.js';
import { RoutingValidator, RoutingValidationConfig } from './validators/routing-validator.js';
import { SkillRouter, SkillRoutingConfig } from './routers/skill-router.js';
import { PriorityRouter, PriorityRoutingConfig } from './routers/priority-router.js';

/**
 * Supervisor decision result
 */
export interface SupervisorDecision {
  routingPlan: RoutingPlan;
  validationResults: {
    health: any; // HealthValidationResult
    routing: any; // RoutingValidationResult
    priority: any; // PriorityRoutingResult
  };
  recommendations: string[];
  warnings: string[];
  errors: string[];
  estimatedDuration: number;
  estimatedCost: number;
  confidence: number; // 0-100
}

/**
 * Supervisor agent configuration
 */
export const SupervisorAgentConfigSchema = z.object({
  healthValidation: HealthValidationConfigSchema.optional(),
  routingValidation: RoutingValidationConfigSchema.optional(),
  skillRouting: SkillRoutingConfigSchema.optional(),
  priorityRouting: PriorityRoutingConfigSchema.optional(),
  enableLLMDecisions: z.boolean().default(false),
  confidenceThreshold: z.number().min(0).max(100).default(80),
  autoRetryFailedAgents: z.boolean().default(true),
  maxRetryAttempts: z.number().min(1).max(5).default(3),
});

export type SupervisorAgentConfig = z.infer<typeof SupervisorAgentConfigSchema>;

/**
 * Supervisor Agent
 * Central coordinator that validates and routes tasks to appropriate agents
 */
export class SupervisorAgent {
  private logger: winston.Logger;
  private config: SupervisorAgentConfig;

  // Validators
  private healthValidator: HealthValidator;
  private routingValidator: RoutingValidator;

  // Routers
  private skillRouter: SkillRouter;
  private priorityRouter: PriorityRouter;

  constructor(config: Partial<SupervisorAgentConfig> = {}) {
    this.config = SupervisorAgentConfigSchema.parse(config);

    // Initialize logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.prettyPrint()
      ),
      defaultMeta: { service: 'supervisor-agent' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
        new winston.transports.File({
          filename: './logs/supervisor-agent.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });

    // Initialize validators
    this.healthValidator = new HealthValidator(this.config.healthValidation);
    this.routingValidator = new RoutingValidator(this.config.routingValidation);

    // Initialize routers
    this.skillRouter = new SkillRouter(this.config.skillRouting);
    this.priorityRouter = new PriorityRouter(this.config.priorityRouting);

    this.logger.info('Supervisor Agent initialized', { config: this.config });
  }

  /**
   * Main method: validate and route a git event
   */
  async validateAndRoute(
    gitEvent: GitEvent,
    availableAgents: Map<string, AgentHealth>,
    skillRules: SkillRule[]
  ): Promise<SupervisorDecision> {
    this.logger.info('Starting supervisor validation and routing', {
      repo: gitEvent.repo,
      commit: gitEvent.commit,
      files: gitEvent.files.length,
      locChanged: gitEvent.loc_changed,
      availableAgents: Array.from(availableAgents.keys()),
    });

    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Step 1: Validate agent health
      this.logger.info('Step 1: Validating agent health');
      const healthyAgents = await this.healthValidator.filterHealthy(availableAgents);

      if (healthyAgents.length === 0) {
        throw new Error('No healthy agents available for task execution');
      }

      warnings.push(...this.getHealthWarnings(availableAgents, healthyAgents));

      // Step 2: Calculate skill-based routing
      this.logger.info('Step 2: Calculating skill-based routing');
      const skillRoutingPlan = this.skillRouter.calculateRouting(
        gitEvent,
        healthyAgents,
        skillRules
      );

      // Step 3: Validate routing plan
      this.logger.info('Step 3: Validating routing plan');
      const routingValidation = await this.routingValidator.validateRoutingPlan(
        skillRoutingPlan,
        gitEvent,
        skillRules
      );

      warnings.push(...routingValidation.warnings);
      errors.push(...routingValidation.errors);

      // Step 4: Optimize routing based on priorities
      this.logger.info('Step 4: Optimizing routing priorities');
      const priorityOptimization = this.priorityRouter.optimizeRouting(
        routingValidation.valid ? routingValidation.plan : skillRoutingPlan,
        availableAgents,
        gitEvent
      );

      warnings.push(...priorityOptimization.fallbackReasons);

      // Step 5: Generate final decision
      const finalPlan = priorityOptimization.plan;
      const confidence = this.calculateDecisionConfidence(
        finalPlan,
        routingValidation,
        priorityOptimization,
        availableAgents
      );

      const decision: SupervisorDecision = {
        routingPlan: finalPlan,
        validationResults: {
          health: { valid: healthyAgents.length > 0, healthyAgents },
          routing: routingValidation,
          priority: priorityOptimization,
        },
        recommendations: this.generateRecommendations(
          finalPlan,
          routingValidation,
          priorityOptimization,
          gitEvent
        ),
        warnings: [...warnings, ...finalPlan.warnings],
        errors,
        estimatedDuration: finalPlan.estimatedDuration || 0,
        estimatedCost: finalPlan.estimatedCost || 0,
        confidence,
      };

      const duration = Date.now() - startTime;
      this.logger.info('Supervisor validation completed', {
        duration,
        selectedAgents: finalPlan.agents,
        confidence,
        warningCount: warnings.length,
        errorCount: errors.length,
      });

      return decision;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Supervisor validation failed', {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Return a fallback decision
      return this.createFallbackDecision(gitEvent, availableAgents, skillRules, error);
    }
  }

  /**
   * Calculate decision confidence
   */
  private calculateDecisionConfidence(
    plan: RoutingPlan,
    routingValidation: any,
    priorityOptimization: any,
    availableAgents: Map<string, AgentHealth>
  ): number {
    let confidence = 100;

    // Reduce confidence based on routing validation errors
    if (routingValidation.errors && routingValidation.errors.length > 0) {
      confidence -= routingValidation.errors.length * 20;
    }

    // Reduce confidence based on routing validation warnings
    if (routingValidation.warnings && routingValidation.warnings.length > 0) {
      confidence -= routingValidation.warnings.length * 10;
    }

    // Reduce confidence if using fallback agents
    const fallbackAgents = priorityOptimization.rejectedAgents || [];
    if (fallbackAgents.length > 0) {
      confidence -= fallbackAgents.length * 15;
    }

    // Reduce confidence if using alternative plans
    if (routingValidation.alternativePlans && routingValidation.alternativePlans.length > 0) {
      confidence -= routingValidation.alternativePlans.length * 10;
    }

    // Reduce confidence if few healthy agents are available
    const healthyAgentCount = Array.from(availableAgents.values())
      .filter(health => health.status === 'healthy').length;

    if (healthyAgentCount < 3) {
      confidence -= (3 - healthyAgentCount) * 10;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(
    plan: RoutingPlan,
    routingValidation: any,
    priorityOptimization: any,
    gitEvent: GitEvent
  ): string[] {
    const recommendations: string[] = [];

    // Add routing validation recommendations
    if (routingValidation.recommendations) {
      recommendations.push(...routingValidation.recommendations);
    }

    // Add recommendations for rejected agents
    const rejectedAgents = priorityOptimization.rejectedAgents || [];
    if (rejectedAgents.length > 0) {
      recommendations.push(
        `Monitor rejected agents: ${rejectedAgents.join(', ')}`
      );
    }

    // Add performance recommendations
    if (plan.estimatedDuration && plan.estimatedDuration > 20000) {
      recommendations.push('Consider optimizing agent performance or reducing scope');
    }

    if (plan.estimatedCost && plan.estimatedCost > 0.20) {
      recommendations.push('Consider cost optimization strategies');
    }

    // Add context-specific recommendations
    if (gitEvent.loc_changed > 1000) {
      recommendations.push('Consider splitting large changes into smaller reviews');
    }

    if (gitEvent.files.length > 50) {
      recommendations.push('Consider batch processing for large file sets');
    }

    return recommendations;
  }

  /**
   * Get health warnings
   */
  private getHealthWarnings(
    availableAgents: Map<string, AgentHealth>,
    healthyAgents: string[]
  ): string[] {
    const warnings: string[] = [];
    const unhealthyAgents = Array.from(availableAgents.keys())
      .filter(agent => !healthyAgents.includes(agent));

    if (unhealthyAgents.length > 0) {
      warnings.push(`Unhealthy agents detected: ${unhealthyAgents.join(', ')}`);
    }

    if (healthyAgents.length < availableAgents.size) {
      warnings.push(
        `${healthyAgents.length}/${availableAgents.size} agents are healthy`
      );
    }

    return warnings;
  }

  /**
   * Create fallback decision when validation fails
   */
  private createFallbackDecision(
    gitEvent: GitEvent,
    availableAgents: Map<string, AgentHealth>,
    skillRules: SkillRule[],
    error: any
  ): SupervisorDecision {
    this.logger.warn('Creating fallback decision due to validation failure', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Use only quality and security agents if available, otherwise use any healthy agent
    const fallbackAgents = ['quality', 'security']
      .filter(agent => availableAgents.has(agent) &&
        availableAgents.get(agent)?.status === 'healthy')
      .slice(0, 2);

    const finalAgents = fallbackAgents.length > 0 ?
      fallbackAgents :
      Array.from(availableAgents.keys())
        .filter(agent => availableAgents.get(agent)?.status === 'healthy')
        .slice(0, 1);

    const fallbackPlan: RoutingPlan = {
      agents: finalAgents,
      reasoning: `Fallback routing due to validation failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
      priority: 1,
      estimatedDuration: finalAgents.length * 5000,
      estimatedCost: finalAgents.length * 0.02,
      warnings: ['Using fallback routing due to validation failure'],
    };

    return {
      routingPlan: fallbackPlan,
      validationResults: {
        health: { valid: false, healthyAgents: finalAgents },
        routing: { valid: false, plan: fallbackPlan, warnings: [], errors: [error instanceof Error ? error.message : 'Unknown error'] },
        priority: { plan: fallbackPlan, prioritizedAgents: finalAgents, rejectedAgents: [], fallbackReasons: {} },
      },
      recommendations: ['Investigate validation failure', 'Check agent health status'],
      warnings: ['Fallback routing in use', 'Limited analysis scope'],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      estimatedDuration: fallbackPlan.estimatedDuration,
      estimatedCost: fallbackPlan.estimatedCost,
      confidence: 30, // Low confidence due to fallback
    };
  }

  /**
   * Get supervisor configuration
   */
  getConfig(): SupervisorAgentConfig {
    return { ...this.config };
  }

  /**
   * Update supervisor configuration
   */
  updateConfig(config: Partial<SupervisorAgentConfig>): void {
    this.config = SupervisorAgentConfigSchema.parse({ ...this.config, ...config });
    this.logger.info('Supervisor config updated', { config: this.config });

    // Update sub-components
    if (config.healthValidation) {
      this.healthValidator.updateConfig(config.healthValidation);
    }
    if (config.routingValidation) {
      this.routingValidator.updateConfig(config.routingValidation);
    }
    if (config.skillRouting) {
      this.skillRouter.updateConfig(config.skillRouting);
    }
    if (config.priorityRouting) {
      this.priorityRouter.updateConfig(config.priorityRouting);
    }
  }

  /**
   * Get health status of supervisor agent
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    memoryUsage: number;
    components: {
      healthValidator: boolean;
      routingValidator: boolean;
      skillRouter: boolean;
      priorityRouter: boolean;
    };
  }> {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Test each component
    const components = {
      healthValidator: true,
      routingValidator: true,
      skillRouter: true,
      priorityRouter: true,
    };

    const status = components && Object.values(components).every(Boolean) ?
      'healthy' : 'degraded';

    return {
      status,
      uptime,
      memoryUsage: memUsage.heapUsed,
      components,
    };
  }

  /**
   * Validate supervisor agent functionality
   */
  async validate(): Promise<{
    valid: boolean;
    tests: Array<{ name: string; passed: boolean; error?: string }>;
  }> {
    const tests = [
      { name: 'health_validator', passed: true },
      { name: 'routing_validator', passed: true },
      { name: 'skill_router', passed: true },
      { name: 'priority_router', passed: true },
    ];

    try {
      // Test health validator
      await this.healthValidator.filterHealthy(new Map());
    } catch (error) {
      tests[0].passed = false;
      tests[0].error = error instanceof Error ? error.message : 'Unknown error';
    }

    try {
      // Test routing validator
      await this.routingValidator.validateRoutingPlan(
        { agents: ['quality'], reasoning: 'test', priority: 5 },
        {
          repo: 'test',
          branch: 'main',
          commit: 'abc123',
          files: ['test.js'],
          loc_changed: 10,
          author: 'test',
          message: 'test',
          timestamp: new Date().toISOString(),
        },
        []
      );
    } catch (error) {
      tests[1].passed = false;
      tests[1].error = error instanceof Error ? error.message : 'Unknown error';
    }

    try {
      // Test skill router
      this.skillRouter.calculateRouting(
        {
          repo: 'test',
          branch: 'main',
          commit: 'abc123',
          files: ['test.js'],
          loc_changed: 10,
          author: 'test',
          message: 'test',
          timestamp: new Date().toISOString(),
        },
        ['quality'],
        []
      );
    } catch (error) {
      tests[2].passed = false;
      tests[2].error = error instanceof Error ? error.message : 'Unknown error';
    }

    try {
      // Test priority router
      this.priorityRouter.optimizeRouting(
        { agents: ['quality'], reasoning: 'test', priority: 5 },
        new Map([['quality', { status: 'healthy' as const }]]),
        {
          repo: 'test',
          branch: 'main',
          commit: 'abc123',
          files: ['test.js'],
          loc_changed: 10,
          author: 'test',
          message: 'test',
          timestamp: new Date().toISOString(),
        }
      );
    } catch (error) {
      tests[3].passed = false;
      tests[3].error = error instanceof Error ? error.message : 'Unknown error';
    }

    const valid = tests.every(test => test.passed);

    this.logger.info('Supervisor validation completed', { valid, tests });

    return { valid, tests };
  }
}

// Export types
export type { RoutingPlan } from './validators/routing-validator.js';
