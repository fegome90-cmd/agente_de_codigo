/**
 * Routing Validator for Supervisor Agent
 * Validates routing plans and decisions
 */

import { z } from 'zod';
import winston from 'winston';
import { GitEvent, SkillRule, AgentUtils } from '@pit-crew/shared';

/**
 * Routing plan configuration
 */
export const RoutingPlanSchema = z.object({
  agents: z.array(z.string()),
  reasoning: z.string(),
  priority: z.number(),
  estimatedDuration: z.number().optional(),
  estimatedCost: z.number().optional(),
  warnings: z.array(z.string()).default([]),
});

export type RoutingPlan = z.infer<typeof RoutingPlanSchema>;

/**
 * Routing validation configuration
 */
export const RoutingValidationConfigSchema = z.object({
  maxAgentsPerTask: z.number().min(1).max(10).default(5),
  maxEstimatedDuration: z.number().positive().default(30000), // 30 seconds
  maxEstimatedCost: z.number().positive().default(1.0), // $1.00
  requiredAgentsForSecurity: z.array(z.string()).default(['security']),
  requiredAgentsForLargeChanges: z.array(z.string()).default(['architecture']),
  largeChangeThreshold: z.number().min(1).default(500), // LOC
  manyFilesThreshold: z.number().min(1).default(20), // files
});

export type RoutingValidationConfig = z.infer<typeof RoutingValidationConfigSchema>;

/**
 * Routing validation result
 */
export interface RoutingValidationResult {
  valid: boolean;
  plan: RoutingPlan;
  warnings: string[];
  errors: string[];
  recommendations: string[];
  alternativePlans?: RoutingPlan[];
}

/**
 * Routing Validator
 * Validates routing decisions and provides recommendations
 */
export class RoutingValidator {
  private logger: winston.Logger;
  private config: RoutingValidationConfig;

  constructor(config: Partial<RoutingValidationConfig> = {}) {
    this.config = RoutingValidationConfigSchema.parse(config);
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
          filename: './logs/supervisor-routing.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Validate a routing plan
   */
  async validateRoutingPlan(
    plan: RoutingPlan,
    gitEvent: GitEvent,
    skillRules: SkillRule[]
  ): Promise<RoutingValidationResult> {
    this.logger.info('Validating routing plan', {
      agents: plan.agents,
      reasoning: plan.reasoning,
      gitEvent: {
        repo: gitEvent.repo,
        files: gitEvent.files.length,
        locChanged: gitEvent.loc_changed,
      },
    });

    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Validate basic plan structure
    const basicValidation = this.validateBasicPlan(plan);
    warnings.push(...basicValidation.warnings);
    errors.push(...basicValidation.errors);

    // Validate against git event context
    const contextValidation = this.validateAgainstContext(plan, gitEvent);
    warnings.push(...contextValidation.warnings);
    errors.push(...contextValidation.errors);
    recommendations.push(...contextValidation.recommendations);

    // Validate agent selection
    const agentValidation = this.validateAgentSelection(plan, gitEvent, skillRules);
    warnings.push(...agentValidation.warnings);
    errors.push(...agentValidation.errors);
    recommendations.push(...agentValidation.recommendations);

    // Check for resource constraints
    const resourceValidation = this.validateResourceConstraints(plan);
    warnings.push(...resourceValidation.warnings);
    errors.push(...resourceValidation.errors);
    recommendations.push(...resourceValidation.recommendations);

    // Generate alternative plans if needed
    const alternativePlans = errors.length > 0 ?
      this.generateAlternativePlans(plan, gitEvent, skillRules) : [];

    const result: RoutingValidationResult = {
      valid: errors.length === 0,
      plan,
      warnings,
      errors,
      recommendations,
      alternativePlans,
    };

    this.logger.info('Routing validation completed', {
      valid: result.valid,
      agentCount: plan.agents.length,
      warningCount: warnings.length,
      errorCount: errors.length,
      hasAlternatives: alternativePlans.length > 0,
    });

    return result;
  }

  /**
   * Validate basic routing plan structure
   */
  private validateBasicPlan(plan: RoutingPlan): {
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check if plan has agents
    if (plan.agents.length === 0) {
      errors.push('Routing plan must include at least one agent');
    }

    // Check if plan has too many agents
    if (plan.agents.length > this.config.maxAgentsPerTask) {
      warnings.push(
        `Plan includes ${plan.agents.length} agents, which exceeds recommended maximum of ${this.config.maxAgentsPerTask}`
      );
    }

    // Check if plan has reasoning
    if (!plan.reasoning || plan.reasoning.trim().length === 0) {
      warnings.push('Routing plan lacks detailed reasoning');
    }

    // Check priority
    if (plan.priority < 1 || plan.priority > 10) {
      warnings.push('Routing plan priority should be between 1 and 10');
    }

    return { warnings, errors };
  }

  /**
   * Validate plan against git event context
   */
  private validateAgainstContext(plan: RoutingPlan, gitEvent: GitEvent): {
    warnings: string[];
    errors: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Check if security agent is included for security-sensitive changes
    const hasSecurityChanges = this.hasSecuritySensitiveChanges(gitEvent);
    if (hasSecurityChanges && !plan.agents.includes('security')) {
      errors.push('Security agent should be included for security-sensitive changes');
      recommendations.push('Add security agent to routing plan');
    }

    // Check if architecture agent is included for large changes
    const isLargeChange = gitEvent.loc_changed > this.config.largeChangeThreshold ||
                         gitEvent.files.length > this.config.manyFilesThreshold;

    if (isLargeChange && !plan.agents.includes('architecture')) {
      warnings.push('Architecture agent recommended for large changes');
      recommendations.push('Consider adding architecture agent for comprehensive review');
    }

    // Check if documentation agent is needed for API changes
    const hasApiChanges = this.hasApiChanges(gitEvent);
    if (hasApiChanges && !plan.agents.includes('documentation')) {
      warnings.push('Documentation agent recommended for API changes');
      recommendations.push('Add documentation agent to validate API specifications');
    }

    return { warnings, errors, recommendations };
  }

  /**
   * Validate agent selection
   */
  private validateAgentSelection(
    plan: RoutingPlan,
    gitEvent: GitEvent,
    skillRules: SkillRule[]
  ): {
    warnings: string[];
    errors: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Check if plan follows skill rules
    const expectedAgents = AgentUtils.calculateRoutingPriority(
      gitEvent.files.length,
      gitEvent.loc_changed
    );

    // Check for missing expected agents
    const missingAgents = expectedAgents.filter(agent => !plan.agents.includes(agent));
    if (missingAgents.length > 0) {
      warnings.push(`Plan is missing expected agents: ${missingAgents.join(', ')}`);
      recommendations.push(`Consider adding missing agents: ${missingAgents.join(', ')}`);
    }

    // Check for unexpected agents
    const unexpectedAgents = plan.agents.filter(agent => !expectedAgents.includes(agent));
    if (unexpectedAgents.length > 0) {
      warnings.push(`Plan includes unexpected agents: ${unexpectedAgents.join(', ')}`);
      recommendations.push(`Ensure unexpected agents are necessary: ${unexpectedAgents.join(', ')}`);
    }

    // Check for duplicate agents
    const duplicateAgents = plan.agents.filter((agent, index) => plan.agents.indexOf(agent) !== index);
    if (duplicateAgents.length > 0) {
      errors.push(`Plan contains duplicate agents: ${[...new Set(duplicateAgents)].join(', ')}`);
    }

    return { warnings, errors, recommendations };
  }

  /**
   * Validate resource constraints
   */
  private validateResourceConstraints(plan: RoutingPlan): {
    warnings: string[];
    errors: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Check estimated duration
    if (plan.estimatedDuration && plan.estimatedDuration > this.config.maxEstimatedDuration) {
      warnings.push(
        `Estimated duration ${plan.estimatedDuration}ms exceeds recommended maximum of ${this.config.maxEstimatedDuration}ms`
      );
      recommendations.push('Consider breaking down the task or optimizing agent performance');
    }

    // Check estimated cost
    if (plan.estimatedCost && plan.estimatedCost > this.config.maxEstimatedCost) {
      warnings.push(
        `Estimated cost $${plan.estimatedCost.toFixed(2)} exceeds recommended maximum of $${this.config.maxEstimatedCost.toFixed(2)}`
      );
      recommendations.push('Consider reducing agent count or optimizing agent usage');
    }

    return { warnings, errors, recommendations };
  }

  /**
   * Check if git event has security-sensitive changes
   */
  private hasSecuritySensitiveChanges(gitEvent: GitEvent): boolean {
    const securityPatterns = [
      /package\.json/,
      /requirements\.txt/,
      /yarn\.lock/,
      /pnpm-lock\.yaml/,
      /Gemfile/,
      /pom\.xml/,
      /build\.gradle/,
      /Dockerfile/,
      /docker-compose/,
      /\.env/,
      /config/,
      /secret/,
      /password/,
      /token/,
      /auth/,
      /credential/,
    ];

    return gitEvent.files.some(file =>
      securityPatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Check if git event has API changes
   */
  private hasApiChanges(gitEvent: GitEvent): boolean {
    const apiPatterns = [
      /openapi/i,
      /swagger/i,
      /api/,
      /endpoint/,
      /route/,
      /controller/,
      /service/,
      /\.json$/,
    ];

    return gitEvent.files.some(file =>
      apiPatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Generate alternative routing plans
   */
  private generateAlternativePlans(
    originalPlan: RoutingPlan,
    gitEvent: GitEvent,
    skillRules: SkillRule[]
  ): RoutingPlan[] {
    const alternatives: RoutingPlan[] = [];

    // Alternative 1: Minimal plan (just essential agents)
    const essentialAgents = ['quality', 'security'];
    if (!originalPlan.agents.includes('quality') || !originalPlan.agents.includes('security')) {
      alternatives.push({
        agents: essentialAgents,
        reasoning: 'Minimal essential analysis focusing on quality and security',
        priority: 1,
        estimatedDuration: 10000, // 10 seconds
        estimatedCost: 0.10,
        warnings: ['Limited analysis scope - may miss some issues'],
      });
    }

    // Alternative 2: Full comprehensive plan
    const fullAgents = ['quality', 'security', 'architecture', 'documentation'];
    if (originalPlan.agents.length < fullAgents.length) {
      alternatives.push({
        agents: fullAgents,
        reasoning: 'Comprehensive analysis with all available agents',
        priority: 10,
        estimatedDuration: 25000, // 25 seconds
        estimatedCost: 0.25,
        warnings: ['Longer execution time and higher cost'],
      });
    }

    // Alternative 3: Targeted plan based on changes
    const targetedAgents = AgentUtils.calculateRoutingPriority(
      gitEvent.files.length,
      gitEvent.loc_changed
    );

    if (JSON.stringify(targetedAgents) !== JSON.stringify(originalPlan.agents)) {
      alternatives.push({
        agents: targetedAgents,
        reasoning: 'Targeted analysis based on change characteristics',
        priority: 5,
        estimatedDuration: 15000, // 15 seconds
        estimatedCost: 0.15,
        warnings: [],
      });
    }

    return alternatives;
  }

  /**
   * Get routing validation configuration
   */
  getConfig(): RoutingValidationConfig {
    return { ...this.config };
  }

  /**
   * Update routing validation configuration
   */
  updateConfig(config: Partial<RoutingValidationConfig>): void {
    this.config = RoutingValidationConfigSchema.parse({ ...this.config, ...config });
    this.logger.info('Routing validation config updated', { config: this.config });
  }
}
