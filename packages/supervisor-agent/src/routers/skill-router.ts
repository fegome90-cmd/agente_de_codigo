/**
 * Skill Router for Supervisor Agent
 * Routes tasks based on agent skills and git event characteristics
 */

import { z } from 'zod';
import winston from 'winston';
import { GitEvent, SkillRule, AgentUtils } from '@pit-crew/shared';
import { RoutingPlan, RoutingValidationResult } from '../validators/routing-validator.js';

/**
 * Skill routing configuration
 */
export const SkillRoutingConfigSchema = z.object({
  defaultAgents: z.array(z.string()).default(['quality', 'security']),
  securitySensitivePatterns: z.array(z.string()).default([
    'package.json',
    'requirements.txt',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Gemfile',
    'pom.xml',
    'build.gradle',
    'Dockerfile',
    'docker-compose',
    '.env',
    'config',
    'secret',
    'password',
    'token',
    'auth',
    'credential',
  ]),
  apiChangePatterns: z.array(z.string()).default([
    'openapi',
    'swagger',
    'api',
    'endpoint',
    'route',
    'controller',
    'service',
  ]),
  architectureChangeThresholds: z.object({
    locChanged: z.number().default(500),
    filesCount: z.number().default(20),
  }),
});

export type SkillRoutingConfig = z.infer<typeof SkillRoutingConfigSchema>;

/**
 * Skill Router
 * Calculates optimal routing based on agent skills and task characteristics
 */
export class SkillRouter {
  private logger: winston.Logger;
  private config: SkillRoutingConfig;

  constructor(config: Partial<SkillRoutingConfig> = {}) {
    this.config = SkillRoutingConfigSchema.parse(config);
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
          filename: './logs/supervisor-skill-router.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Calculate routing plan based on git event and available agents
   */
  calculateRouting(
    gitEvent: GitEvent,
    availableAgents: string[],
    skillRules: SkillRule[]
  ): RoutingPlan {
    this.logger.info('Calculating skill-based routing', {
      repo: gitEvent.repo,
      files: gitEvent.files.length,
      locChanged: gitEvent.loc_changed,
      availableAgents,
    });

    // Start with default agents
    let selectedAgents = [...this.config.defaultAgents];

    // Filter default agents to only include available ones
    selectedAgents = selectedAgents.filter(agent => availableAgents.includes(agent));

    // Add specialized agents based on analysis
    const additionalAgents = this.analyzeChangeType(gitEvent, availableAgents);
    selectedAgents.push(...additionalAgents);

    // Remove duplicates
    selectedAgents = [...new Set(selectedAgents)];

    // Apply skill rules
    const ruleBasedAgents = this.applySkillRules(gitEvent, availableAgents, skillRules);
    selectedAgents.push(...ruleBasedAgents);

    // Remove duplicates again after rule application
    selectedAgents = [...new Set(selectedAgents)];

    // Filter to only available agents
    selectedAgents = selectedAgents.filter(agent => availableAgents.includes(agent));

    // Generate reasoning
    const reasoning = this.generateRoutingReasoning(gitEvent, selectedAgents, additionalAgents, ruleBasedAgents);

    // Calculate priority
    const priority = this.calculateRoutingPriority(gitEvent, selectedAgents);

    // Estimate duration and cost
    const estimatedDuration = this.estimateDuration(selectedAgents);
    const estimatedCost = this.estimateCost(selectedAgents, gitEvent);

    const plan: RoutingPlan = {
      agents: selectedAgents,
      reasoning,
      priority,
      estimatedDuration,
      estimatedCost,
      warnings: this.generateWarnings(selectedAgents, gitEvent),
    };

    this.logger.info('Skill routing calculated', {
      selectedAgents,
      priority,
      estimatedDuration,
      estimatedCost,
      agentCount: selectedAgents.length,
    });

    return plan;
  }

  /**
   * Analyze change type to determine required agents
   */
  private analyzeChangeType(gitEvent: GitEvent, availableAgents: string[]): string[] {
    const additionalAgents: string[] = [];

    // Check for security-sensitive changes
    if (this.hasSecuritySensitiveChanges(gitEvent) && availableAgents.includes('security')) {
      additionalAgents.push('security');
    }

    // Check for API changes
    if (this.hasApiChanges(gitEvent) && availableAgents.includes('documentation')) {
      additionalAgents.push('documentation');
    }

    // Check for architectural changes
    if (this.hasArchitecturalChanges(gitEvent) && availableAgents.includes('architecture')) {
      additionalAgents.push('architecture');
    }

    // Check for documentation changes
    if (this.hasDocumentationChanges(gitEvent) && availableAgents.includes('documentation')) {
      additionalAgents.push('documentation');
    }

    // Check for configuration changes
    if (this.hasConfigurationChanges(gitEvent) && availableAgents.includes('quality')) {
      additionalAgents.push('quality');
    }

    return additionalAgents;
  }

  /**
   * Apply skill rules to determine agents
   */
  private applySkillRules(
    gitEvent: GitEvent,
    availableAgents: string[],
    skillRules: SkillRule[]
  ): string[] {
    const ruleBasedAgents: string[] = [];

    for (const rule of skillRules) {
      if (this.evaluateRuleCondition(rule.condition, gitEvent)) {
        for (const agent of rule.activate) {
          if (availableAgents.includes(agent) && !ruleBasedAgents.includes(agent)) {
            ruleBasedAgents.push(agent);
          }
        }
      }
    }

    // Sort by priority (higher priority first)
    return ruleBasedAgents.sort((a, b) => {
      const aRule = skillRules.find(rule => rule.activate.includes(a));
      const bRule = skillRules.find(rule => rule.activate.includes(b));

      const aPriority = aRule?.priority || 0;
      const bPriority = bRule?.priority || 0;

      return bPriority - aPriority;
    });
  }

  /**
   * Evaluate rule condition
   */
  private evaluateRuleCondition(condition: string, gitEvent: GitEvent): boolean {
    // Simple rule evaluation - in a real implementation, this could be more sophisticated
    try {
      // Replace variables in condition
      const evalCondition = condition
        .replace(/loc_changed/g, gitEvent.loc_changed.toString())
        .replace(/files_changed/g, gitEvent.files.length.toString())
        .replace(/lockfile_changed/g, this.hasLockfileChanges(gitEvent).toString())
        .replace(/openapi_changed/g, this.hasApiChanges(gitEvent).toString())
        .replace(/always/g, 'true');

      // Evaluate the condition (careful with eval in production)
      return eval(evalCondition);
    } catch (error) {
      this.logger.warn('Failed to evaluate rule condition', {
        condition,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Generate routing reasoning
   */
  private generateRoutingReasoning(
    gitEvent: GitEvent,
    selectedAgents: string[],
    additionalAgents: string[],
    ruleBasedAgents: string[]
  ): string {
    const reasoningParts: string[] = [];

    reasoningParts.push(
      `Selected ${selectedAgents.length} agents for analysis of ${gitEvent.files.length} files with ${gitEvent.loc_changed} LOC changed.`
    );

    // Add reasoning for default agents
    const defaultReasoning = this.config.defaultAgents
      .filter(agent => selectedAgents.includes(agent))
      .map(agent => `${agent} (default analysis)`);

    if (defaultReasoning.length > 0) {
      reasoningParts.push(`Default agents: ${defaultReasoning.join(', ')}.`);
    }

    // Add reasoning for additional agents
    if (additionalAgents.length > 0) {
      const additionalReasoning = additionalAgents.map(agent => {
        if (agent === 'security') return 'security (security-sensitive changes detected)';
        if (agent === 'documentation') return 'documentation (API changes detected)';
        if (agent === 'architecture') return 'architecture (large changes detected)';
        return `${agent} (specialized analysis)`;
      });
      reasoningParts.push(`Additional agents: ${additionalReasoning.join(', ')}.`);
    }

    // Add reasoning for rule-based agents
    if (ruleBasedAgents.length > 0) {
      reasoningParts.push(`Rule-based agents: ${ruleBasedAgents.join(', ')} (activated by skill rules).`);
    }

    return reasoningParts.join(' ');
  }

  /**
   * Calculate routing priority
   */
  private calculateRoutingPriority(gitEvent: GitEvent, selectedAgents: string[]): number {
    let priority = 5; // Base priority

    // Increase priority for large changes
    if (gitEvent.loc_changed > this.config.architectureChangeThresholds.locChanged) {
      priority += 2;
    }

    if (gitEvent.files.length > this.config.architectureChangeThresholds.filesCount) {
      priority += 1;
    }

    // Increase priority for critical agents
    if (selectedAgents.includes('security')) {
      priority += 1;
    }

    if (selectedAgents.includes('architecture')) {
      priority += 1;
    }

    // Decrease priority for small changes
    if (gitEvent.loc_changed < 10 && gitEvent.files.length < 5) {
      priority -= 1;
    }

    // Ensure priority is within bounds
    return Math.max(1, Math.min(10, priority));
  }

  /**
   * Estimate execution duration
   */
  private estimateDuration(selectedAgents: string[]): number {
    const agentDurations: Record<string, number> = {
      security: 8000,    // 8 seconds
      quality: 5000,     // 5 seconds
      architecture: 12000, // 12 seconds
      documentation: 3000, // 3 seconds
      pr_reviewer: 4000,   // 4 seconds
      observability: 2000, // 2 seconds
    };

    const totalDuration = selectedAgents.reduce((sum, agent) => {
      return sum + (agentDurations[agent] || 5000); // Default 5 seconds for unknown agents
    }, 0);

    // Add some overhead for coordination
    return totalDuration + 2000;
  }

  /**
   * Estimate execution cost
   */
  private estimateCost(selectedAgents: string[], gitEvent: GitEvent): number {
    const baseCostPerAgent = 0.02; // $0.02 per agent
    const complexityMultiplier = Math.min(2.0, 1 + (gitEvent.loc_changed / 1000));

    return selectedAgents.length * baseCostPerAgent * complexityMultiplier;
  }

  /**
   * Generate warnings for routing plan
   */
  private generateWarnings(selectedAgents: string[], gitEvent: GitEvent): string[] {
    const warnings: string[] = [];

    // Warn if no security agent for security-sensitive changes
    if (this.hasSecuritySensitiveChanges(gitEvent) && !selectedAgents.includes('security')) {
      warnings.push('Security agent not included for security-sensitive changes');
    }

    // Warn if no architecture agent for large changes
    if (this.hasArchitecturalChanges(gitEvent) && !selectedAgents.includes('architecture')) {
      warnings.push('Architecture agent not included for large changes');
    }

    // Warn if no documentation agent for API changes
    if (this.hasApiChanges(gitEvent) && !selectedAgents.includes('documentation')) {
      warnings.push('Documentation agent not included for API changes');
    }

    // Warn if too many agents
    if (selectedAgents.length > 5) {
      warnings.push(`High agent count (${selectedAgents.length}) may impact performance`);
    }

    return warnings;
  }

  /**
   * Check for security-sensitive changes
   */
  private hasSecuritySensitiveChanges(gitEvent: GitEvent): boolean {
    const securityPatterns = this.config.securitySensitivePatterns.map(pattern =>
      new RegExp(pattern, 'i')
    );

    return gitEvent.files.some(file =>
      securityPatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Check for API changes
   */
  private hasApiChanges(gitEvent: GitEvent): boolean {
    const apiPatterns = this.config.apiChangePatterns.map(pattern =>
      new RegExp(pattern, 'i')
    );

    return gitEvent.files.some(file =>
      apiPatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Check for architectural changes
   */
  private hasArchitecturalChanges(gitEvent: GitEvent): boolean {
    return (
      gitEvent.loc_changed > this.config.architectureChangeThresholds.locChanged ||
      gitEvent.files.length > this.config.architectureChangeThresholds.filesCount
    );
  }

  /**
   * Check for documentation changes
   */
  private hasDocumentationChanges(gitEvent: GitEvent): boolean {
    const docPatterns = [/\.md$/, /\.rst$/, /readme/i, /docs?\//i, /CHANGELOG/i];

    return gitEvent.files.some(file =>
      docPatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Check for configuration changes
   */
  private hasConfigurationChanges(gitEvent: GitEvent): boolean {
    const configPatterns = [
      /\..*rc$/,
      /config/i,
      /\.json$/,
      /\.yaml$/,
      /\.yml$/,
      /\.toml$/,
      /\.ini$/,
      /\.env/,
    ];

    return gitEvent.files.some(file =>
      configPatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Check for lockfile changes
   */
  private hasLockfileChanges(gitEvent: GitEvent): boolean {
    const lockfilePatterns = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /requirements\.txt$/,
      /Pipfile\.lock$/,
      /Gemfile\.lock$/,
    ];

    return gitEvent.files.some(file =>
      lockfilePatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Get skill routing configuration
   */
  getConfig(): SkillRoutingConfig {
    return { ...this.config };
  }

  /**
   * Update skill routing configuration
   */
  updateConfig(config: Partial<SkillRoutingConfig>): void {
    this.config = SkillRoutingConfigSchema.parse({ ...this.config, ...config });
    this.logger.info('Skill routing config updated', { config: this.config });
  }
}
