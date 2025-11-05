/**
 * Priority Router for Supervisor Agent
 * Routes tasks based on agent priorities and availability
 */

import { z } from 'zod';
import winston from 'winston';
import { GitEvent, AgentHealth, AgentStatus } from '@pit-crew/shared';
import { RoutingPlan } from '../validators/routing-validator.js';

/**
 * Priority routing configuration
 */
export const PriorityRoutingConfigSchema = z.object({
  agentPriorities: z.record(z.number()).default({
    security: 10,
    architecture: 9,
    quality: 8,
    documentation: 7,
    pr_reviewer: 6,
    observability: 5,
  }),
  maxConcurrentAgents: z.number().min(1).max(10).default(5),
  fallbackAgents: z.array(z.string()).default(['quality']),
  preferredAgentOrder: z.array(z.string()).default([
    'security',
    'architecture',
    'quality',
    'documentation',
    'pr_reviewer',
    'observability',
  ]),
  healthWeight: z.number().min(0).max(1).default(0.3),
  loadWeight: z.number().min(0).max(1).default(0.2),
});

export type PriorityRoutingConfig = z.infer<typeof PriorityRoutingConfigSchema>;

/**
 * Priority routing result
 */
export interface PriorityRoutingResult {
  plan: RoutingPlan;
  prioritizedAgents: string[];
  rejectedAgents: string[];
  fallbackReasons: Record<string, string>;
}

/**
 * Priority Router
 * Optimizes agent selection based on priorities, health, and load
 */
export class PriorityRouter {
  private logger: winston.Logger;
  private config: PriorityRoutingConfig;

  constructor(config: Partial<PriorityRoutingConfig> = {}) {
    this.config = PriorityRoutingConfigSchema.parse(config);
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
          filename: './logs/supervisor-priority-router.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Optimize routing plan based on agent priorities and health
   */
  optimizeRouting(
    plan: RoutingPlan,
    agentHealth: Map<string, AgentHealth>,
    gitEvent: GitEvent
  ): PriorityRoutingResult {
    this.logger.info('Optimizing routing based on priorities', {
      originalAgents: plan.agents,
      availableAgents: Array.from(agentHealth.keys()),
      priorities: this.config.agentPriorities,
    });

    const availableHealthyAgents = this.getAvailableHealthyAgents(agentHealth);
    const rejectedAgents: string[] = [];
    const fallbackReasons: Record<string, string> = {};

    // Score each agent
    const agentScores = this.scoreAgents(plan.agents, agentHealth, gitEvent);

    // Sort agents by score (descending)
    const prioritizedAgents = Object.entries(agentScores)
      .sort(([, a], [, b]) => b.score - a.score)
      .map(([agent]) => agent);

    // Apply concurrent agent limit
    const finalAgents = prioritizedAgents.slice(0, this.config.maxConcurrentAgents);

    // Identify rejected agents
    for (const agent of plan.agents) {
      if (!finalAgents.includes(agent)) {
        rejectedAgents.push(agent);

        if (!availableHealthyAgents.includes(agent)) {
          fallbackReasons[agent] = 'Agent not healthy or unavailable';
        } else if (!finalAgents.includes(agent)) {
          fallbackReasons[agent] = 'Exceeded concurrent agent limit or lower priority';
        }
      }
    }

    // Add fallback agents if needed
    const finalPlanWithFallback = this.addFallbackAgentsIfNeeded(
      finalAgents,
      availableHealthyAgents,
      plan,
      gitEvent
    );

    const result: PriorityRoutingResult = {
      plan: finalPlanWithFallback,
      prioritizedAgents: finalPlanWithFallback.agents,
      rejectedAgents,
      fallbackReasons,
    };

    this.logger.info('Priority routing completed', {
      finalAgents: finalPlanWithFallback.agents,
      rejectedCount: rejectedAgents.length,
      hasFallbacks: finalPlanWithFallback.agents.some(agent => !plan.agents.includes(agent)),
    });

    return result;
  }

  /**
   * Get available healthy agents
   */
  private getAvailableHealthyAgents(agentHealth: Map<string, AgentHealth>): string[] {
    return Array.from(agentHealth.entries())
      .filter(([, health]) => health.status === AgentStatus.HEALTHY)
      .map(([agent]) => agent);
  }

  /**
   * Score agents based on multiple factors
   */
  private scoreAgents(
    agents: string[],
    agentHealth: Map<string, AgentHealth>,
    gitEvent: GitEvent
  ): Record<string, { score: number; factors: Record<string, number> }> {
    const scores: Record<string, { score: number; factors: Record<string, number> }> = {};

    for (const agent of agents) {
      const factors = this.calculateAgentFactors(agent, agentHealth, gitEvent);
      const score = this.calculateTotalScore(factors);

      scores[agent] = {
        score,
        factors,
      };
    }

    return scores;
  }

  /**
   * Calculate scoring factors for an agent
   */
  private calculateAgentFactors(
    agent: string,
    agentHealth: Map<string, AgentHealth>,
    gitEvent: GitEvent
  ): Record<string, number> {
    const factors: Record<string, number> = {};

    // Priority factor (0-100)
    factors.priority = this.config.agentPriorities[agent] || 5;
    factors.priority = (factors.priority / 10) * 100;

    // Health factor (0-100)
    factors.health = this.calculateHealthFactor(agent, agentHealth);

    // Load factor (0-100)
    factors.load = this.calculateLoadFactor(agent, agentHealth);

    // Context relevance factor (0-100)
    factors.context = this.calculateContextRelevance(agent, gitEvent);

    // Availability factor (0-100)
    factors.availability = this.calculateAvailabilityFactor(agent, agentHealth);

    return factors;
  }

  /**
   * Calculate health factor for an agent
   */
  private calculateHealthFactor(agent: string, agentHealth: Map<string, AgentHealth>): number {
    const health = agentHealth.get(agent);

    if (!health || health.status !== AgentStatus.HEALTHY) {
      return 0;
    }

    let healthScore = 100;

    // Reduce score based on response time
    if (health.responseTime && health.responseTime > 5000) {
      healthScore -= Math.min(50, (health.responseTime - 5000) / 100);
    }

    // Reduce score based on error rate
    if (health.errorRate && health.errorRate > 0) {
      healthScore -= Math.min(30, health.errorRate * 100);
    }

    // Reduce score based on memory usage
    if (health.memoryUsage && health.memoryUsage > 100 * 1024 * 1024) { // 100MB
      healthScore -= Math.min(20, (health.memoryUsage - 100 * 1024 * 1024) / (1024 * 1024));
    }

    // Reduce score if using fallback mode
    if (health.usingFallback) {
      healthScore -= 40;
    }

    return Math.max(0, healthScore);
  }

  /**
   * Calculate load factor for an agent
   */
  private calculateLoadFactor(agent: string, agentHealth: Map<string, AgentHealth>): number {
    const health = agentHealth.get(agent);

    if (!health) {
      return 0;
    }

    let loadScore = 100;

    // Reduce score based on active tasks
    if (health.activeTasks && health.activeTasks > 0) {
      loadScore -= Math.min(50, health.activeTasks * 10);
    }

    // Reduce score based on recent failures
    if (health.recentFailures && health.recentFailures > 0) {
      loadScore -= Math.min(30, health.recentFailures * 15);
    }

    return Math.max(0, loadScore);
  }

  /**
   * Calculate context relevance factor for an agent
   */
  private calculateContextRelevance(agent: string, gitEvent: GitEvent): number {
    let relevanceScore = 50; // Base score

    // Security agent relevance
    if (agent === 'security') {
      const securityPatterns = [
        /package\.json/,
        /requirements\.txt/,
        /yarn\.lock/,
        /pnpm-lock\.yaml/,
        /\.env/,
        /secret/i,
        /auth/i,
        /password/i,
      ];

      if (gitEvent.files.some(file => securityPatterns.some(pattern => pattern.test(file)))) {
        relevanceScore += 50;
      }
    }

    // Architecture agent relevance
    if (agent === 'architecture') {
      if (gitEvent.loc_changed > 500 || gitEvent.files.length > 20) {
        relevanceScore += 50;
      }
    }

    // Documentation agent relevance
    if (agent === 'documentation') {
      const docPatterns = [/openapi/i, /swagger/i, /api/i, /\.md$/, /docs?\//i];

      if (gitEvent.files.some(file => docPatterns.some(pattern => pattern.test(file)))) {
        relevanceScore += 50;
      }
    }

    // Quality agent relevance
    if (agent === 'quality') {
      // Quality agent is generally relevant for most changes
      relevanceScore += 30;
    }

    return Math.min(100, relevanceScore);
  }

  /**
   * Calculate availability factor for an agent
   */
  private calculateAvailabilityFactor(agent: string, agentHealth: Map<string, AgentHealth>): number {
    const health = agentHealth.get(agent);

    if (!health) {
      return 0;
    }

    let availabilityScore = 100;

    // Reduce score if last heartbeat was too long ago
    if (health.lastHeartbeat) {
      const timeSinceLastHeartbeat = Date.now() - new Date(health.lastHeartbeat).getTime();
      const maxHeartbeatAge = 30000; // 30 seconds

      if (timeSinceLastHeartbeat > maxHeartbeatAge) {
        availabilityScore -= Math.min(100, (timeSinceLastHeartbeat - maxHeartbeatAge) / 1000);
      }
    }

    // Reduce score if uptime is low
    if (health.uptime && health.uptime < 60000) { // Less than 1 minute
      availabilityScore -= 50;
    }

    return Math.max(0, availabilityScore);
  }

  /**
   * Calculate total score from factors
   */
  private calculateTotalScore(factors: Record<string, number>): number {
    const weights = {
      priority: 0.3,
      health: this.config.healthWeight,
      load: this.config.loadWeight,
      context: 0.3,
      availability: 0.1,
    };

    // Normalize weights to sum to 1
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const normalizedWeights = Object.fromEntries(
      Object.entries(weights).map(([key, weight]) => [key, weight / totalWeight])
    );

    let totalScore = 0;
    for (const [factor, value] of Object.entries(factors)) {
      const weight = normalizedWeights[factor];
      totalScore += value * weight;
    }

    return Math.round(totalScore);
  }

  /**
   * Add fallback agents if needed
   */
  private addFallbackAgentsIfNeeded(
    finalAgents: string[],
    availableHealthyAgents: string[],
    originalPlan: RoutingPlan,
    gitEvent: GitEvent
  ): RoutingPlan {
    // If we have at least one essential agent, we're good
    const essentialAgents = ['quality', 'security'];
    const hasEssentialAgent = finalAgents.some(agent => essentialAgents.includes(agent));

    if (hasEssentialAgent) {
      return originalPlan;
    }

    // Add fallback agents
    const fallbackAgentsToAdd = this.config.fallbackAgents
      .filter(agent => availableHealthyAgents.includes(agent))
      .filter(agent => !finalAgents.includes(agent))
      .slice(0, 2); // Limit fallbacks

    if (fallbackAgentsToAdd.length === 0) {
      this.logger.warn('No fallback agents available');
      return originalPlan;
    }

    const updatedPlan: RoutingPlan = {
      ...originalPlan,
      agents: [...finalAgents, ...fallbackAgentsToAdd],
      reasoning: `${originalPlan.reasoning} Added fallback agents: ${fallbackAgentsToAdd.join(', ')} due to unavailability of preferred agents.`,
      warnings: [
        ...originalPlan.warnings,
        `Using fallback agents: ${fallbackAgentsToAdd.join(', ')}`,
      ],
    };

    this.logger.info('Added fallback agents to routing plan', {
      fallbackAgents: fallbackAgentsToAdd,
      finalCount: updatedPlan.agents.length,
    });

    return updatedPlan;
  }

  /**
   * Get priority routing configuration
   */
  getConfig(): PriorityRoutingConfig {
    return { ...this.config };
  }

  /**
   * Update priority routing configuration
   */
  updateConfig(config: Partial<PriorityRoutingConfig>): void {
    this.config = PriorityRoutingConfigSchema.parse({ ...this.config, ...config });
    this.logger.info('Priority routing config updated', { config: this.config });
  }

  /**
   * Get agent priority for a specific agent
   */
  getAgentPriority(agent: string): number {
    return this.config.agentPriorities[agent] || 5;
  }

  /**
   * Set agent priority
   */
  setAgentPriority(agent: string, priority: number): void {
    this.config.agentPriorities[agent] = Math.max(1, Math.min(10, priority));
    this.logger.info('Agent priority updated', { agent, priority });
  }
}
