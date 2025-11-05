/**
 * Simplified Intelligent Router
 *
 * Basic implementation to fix compilation issues
 *
 * @author Pit Crew v2.0.0
 * @since 2025-11-03
 */

import {
  GitEvent,
  AgentHealth,
  SkillRule
} from '@pit-crew/shared';
import {
  SmartRoutingDecisionNode,
  LLMDecisionNodeFactory
} from '../nodes/llm-decision-nodes-simple.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

// Type definitions
interface IntelligentRouterConfig {
  preferParallelExecution: boolean;
  maxConcurrentAgents: number;
  minConfidenceThreshold: number;
  prioritizeHealthOverSpeed: boolean;
  loadBalancingEnabled: boolean;
  skillMatchingWeight: number;
  enableLLMRouting: boolean;
  llmRoutingThreshold: number;
  fallbackToDeterministic: boolean;
  enableCaching: boolean;
  cacheMaxAge: number;
  enableMetrics: boolean;
}

interface RoutingContext {
  gitEvent: GitEvent;
  availableAgents: Map<string, AgentHealth>;
  skillRules: SkillRule[];
  previousRouting?: any;
  systemMetrics: {
    totalLoad: number;
    healthyAgents: number;
    averageResponseTime: number;
  };
  workflowHistory?: {
    recentDecisions: any[];
    successRates: Map<string, number>;
  };
}

interface RoutingDecision {
  plan: {
    primaryAgent: string;
    supportingAgents: string[];
    routingStrategy: 'parallel' | 'sequential' | 'hybrid';
    estimatedDuration: number;
    confidence: number;
    reasoning: string;
    selectedAgents: string[];
  };
  confidence: number;
  reasoning: string;
  usedLLM: boolean;
  fallbackUsed: boolean;
  alternatives: any[];
  estimatedMetrics: {
    duration: number;
    cost: number;
    reliability: number;
  };
  metadata: {
    decisionTime: number;
    cacheHit: boolean;
    agentScores: Map<string, number>;
  };
}

/**
 * Simplified Intelligent Router implementation
 */
export class IntelligentRouter extends EventEmitter {
  private config: IntelligentRouterConfig;
  private routingCache: Map<string, { decision: RoutingDecision; timestamp: number }> = new Map();
  private routingHistory: RoutingDecision[] = [];
  private agentPerformanceCache: Map<string, { score: number; timestamp: number }> = new Map();

  constructor(config: Partial<IntelligentRouterConfig> = {}) {
    super();

    this.config = {
      preferParallelExecution: true,
      maxConcurrentAgents: 5,
      minConfidenceThreshold: 0.7,
      prioritizeHealthOverSpeed: true,
      loadBalancingEnabled: true,
      skillMatchingWeight: 0.7,
      enableLLMRouting: true,
      llmRoutingThreshold: 0.8,
      fallbackToDeterministic: true,
      enableCaching: true,
      cacheMaxAge: 300000, // 5 minutes
      enableMetrics: true,
      ...config
    };

    logger.info('Intelligent Router initialized', { config: this.config });
  }

  /**
   * Route a git event to optimal agents
   */
  async routeGitEvent(context: RoutingContext): Promise<RoutingDecision> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.config.enableCaching) {
        const cachedDecision = this.getCachedDecision(context);
        if (cachedDecision) {
          this.emit('routingCompleted', {
            type: 'cache_hit',
            decision: cachedDecision,
            duration: Date.now() - startTime
          });

          return {
            ...cachedDecision,
            metadata: {
              ...cachedDecision.metadata,
              cacheHit: true,
              decisionTime: Date.now() - startTime
            }
          };
        }
      }

      // Select routing strategy
      let decision: RoutingDecision;

      if (this.shouldUseLLMRouting(context)) {
        decision = await this.performLLMRouting(context);
      } else {
        decision = this.performDeterministicRouting(context);
      }

      // Cache the decision
      if (this.config.enableCaching) {
        this.cacheDecision(context, decision);
      }

      // Update history
      this.addToHistory(decision);

      const duration = Date.now() - startTime;

      this.emit('routingCompleted', {
        type: decision.usedLLM ? 'llm_routing' : 'deterministic_routing',
        decision,
        duration,
        confidence: decision.confidence
      });

      logger.info('Routing completed', {
        strategy: decision.usedLLM ? 'LLM' : 'Deterministic',
        selectedAgents: decision.plan.selectedAgents,
        confidence: decision.confidence,
        duration,
        cacheHit: decision.metadata.cacheHit
      });

      return decision;

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Routing failed', {
        error: (error as Error).message,
        duration,
        context: {
          eventType: context.gitEvent.type,
          availableAgents: context.availableAgents.size
        }
      });

      this.emit('routingFailed', {
        error: (error as Error).message,
        duration,
        context
      });

      // Fallback to simple deterministic routing
      return this.getEmergencyFallbackRouting(context);
    }
  }

  /**
   * Determine if LLM routing should be used
   */
  private shouldUseLLMRouting(context: RoutingContext): boolean {
    if (!this.config.enableLLMRouting) {
      return false;
    }

    const { gitEvent, availableAgents } = context;

    // Use LLM for complex scenarios
    if (gitEvent.files.length > 20) {
      return true;
    }

    // Use LLM for many agents
    if (availableAgents.size > 3) {
      return true;
    }

    return false;
  }

  /**
   * Perform LLM-based routing
   */
  private async performLLMRouting(context: RoutingContext): Promise<RoutingDecision> {
    const routingNode = LLMDecisionNodeFactory.createRoutingNode();

    try {
      const llmDecision = await routingNode.executeDecision({
        gitEvent: context.gitEvent,
        availableAgents: context.availableAgents,
        skillRules: context.skillRules,
        deterministicPlan: this.createDeterministicPlan(context)
      }, () => this.createDeterministicPlan(context)); // Fallback

      const plan = {
        primaryAgent: llmDecision.decision.selectedAgents[0],
        supportingAgents: llmDecision.decision.selectedAgents.slice(1),
        routingStrategy: llmDecision.decision.routingStrategy as 'parallel' | 'sequential' | 'hybrid',
        estimatedDuration: llmDecision.decision.estimatedDuration,
        confidence: llmDecision.confidence,
        reasoning: llmDecision.reasoning,
        selectedAgents: llmDecision.decision.selectedAgents
      };

      return {
        plan,
        confidence: llmDecision.confidence,
        reasoning: llmDecision.reasoning,
        usedLLM: true,
        fallbackUsed: llmDecision.fallbackUsed || false,
        alternatives: [this.createDeterministicPlan(context)],
        estimatedMetrics: this.calculateEstimatedMetrics(plan, context),
        metadata: {
          decisionTime: Date.now() - Date.now(),
          cacheHit: false,
          agentScores: this.scoreAgents(plan.selectedAgents, context)
        }
      };

    } catch (error) {
      logger.warn('LLM routing failed, using deterministic fallback', {
        error: (error as Error).message
      });

      const deterministicPlan = this.createDeterministicPlan(context);
      return {
        plan: deterministicPlan,
        confidence: 0.6, // Lower confidence for fallback
        reasoning: `LLM routing failed: ${(error as Error).message}. Using deterministic fallback.`,
        usedLLM: false,
        fallbackUsed: true,
        alternatives: [],
        estimatedMetrics: this.calculateEstimatedMetrics(deterministicPlan, context),
        metadata: {
          decisionTime: Date.now() - Date.now(),
          cacheHit: false,
          agentScores: new Map([[deterministicPlan.primaryAgent, 0.3]])
        }
      };
    }
  }

  /**
   * Perform deterministic routing
   */
  private performDeterministicRouting(context: RoutingContext): RoutingDecision {
    const plan = this.createDeterministicPlan(context);

    return {
      plan,
      confidence: 0.8, // High confidence for deterministic logic
      reasoning: 'Deterministic routing based on file types and agent capabilities',
      usedLLM: false,
      fallbackUsed: false,
      alternatives: [],
      estimatedMetrics: this.calculateEstimatedMetrics(plan, context),
      metadata: {
        decisionTime: Date.now() - Date.now(),
        cacheHit: false,
        agentScores: this.scoreAgents(plan.selectedAgents, context)
      }
    };
  }

  /**
   * Create deterministic routing plan
   */
  private createDeterministicPlan(context: RoutingContext): any {
    const { gitEvent, availableAgents } = context;
    const fileTypes = new Set(gitEvent.files.map(f => f.path.split('.').pop()));
    const selectedAgents: string[] = [];

    // Agent selection logic based on file types
    if (fileTypes.has('ts') || fileTypes.has('js') || fileTypes.has('py')) {
      if (availableAgents.has('security-agent')) {
        selectedAgents.push('security-agent');
      }
    }

    if (fileTypes.has('ts') || fileTypes.has('js')) {
      if (availableAgents.has('quality-agent')) {
        selectedAgents.push('quality-agent');
      }
    }

    if (fileTypes.has('md') || gitEvent.files.some(f => f.path.includes('api'))) {
      if (availableAgents.has('documentation-agent')) {
        selectedAgents.push('documentation-agent');
      }
    }

    // Ensure at least one agent is selected
    if (selectedAgents.length === 0) {
      const fallbackAgent = Array.from(availableAgents.keys())[0];
      if (fallbackAgent) {
        selectedAgents.push(fallbackAgent);
      }
    }

    // Filter by available healthy agents
    const healthyAgents = selectedAgents.filter(agent => {
      const health = availableAgents.get(agent);
      return health && health.status === 'healthy';
    });

    const finalAgents = healthyAgents.length > 0 ? healthyAgents : selectedAgents.slice(0, 1);

    return {
      primaryAgent: finalAgents[0] || 'quality-agent',
      supportingAgents: finalAgents.slice(1),
      routingStrategy: finalAgents.length > 2 ? 'parallel' : 'sequential',
      estimatedDuration: finalAgents.length * 5, // 5 minutes per agent
      confidence: 0.8,
      reasoning: 'Deterministic routing based on file analysis',
      selectedAgents: finalAgents
    };
  }

  /**
   * Score agents based on multiple criteria
   */
  private scoreAgents(agents: string[], context: RoutingContext): Map<string, number> {
    const scores = new Map<string, number>();

    agents.forEach(agentName => {
      const health = context.availableAgents.get(agentName);
      if (!health) {
        scores.set(agentName, 0);
        return;
      }

      let score = 0;

      // Health score (40% weight)
      const healthScore = health.status === 'healthy' ? 1 : 0.5;
      score += healthScore * 0.4;

      // Load score (30% weight) - lower load is better
      const loadScore = Math.max(0, 1 - (health.metrics?.loadAverage || 0));
      score += loadScore * 0.3;

      // Historical performance (20% weight)
      const performanceScore = this.getAgentPerformanceScore(agentName);
      score += performanceScore * 0.2;

      // Availability (10% weight)
      const availabilityScore = (health.metrics?.uptimePercentage || 100) / 100;
      score += availabilityScore * 0.1;

      scores.set(agentName, score);
    });

    return scores;
  }

  /**
   * Get agent performance score from cache or history
   */
  private getAgentPerformanceScore(agentName: string): number {
    const cached = this.agentPerformanceCache.get(agentName);

    if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minutes cache
      return cached.score;
    }

    // Calculate performance score from history
    const agentHistory = this.routingHistory.filter(decision =>
      decision.plan.selectedAgents.includes(agentName)
    );

    if (agentHistory.length === 0) {
      return 0.8; // Default score for agents with no history
    }

    const successRate = agentHistory.filter(decision =>
      decision.confidence > this.config.minConfidenceThreshold
    ).length / agentHistory.length;

    const score = Math.max(0.1, successRate);

    // Cache the score
    this.agentPerformanceCache.set(agentName, {
      score,
      timestamp: Date.now()
    });

    return score;
  }

  /**
   * Calculate estimated metrics for routing plan
   */
  private calculateEstimatedMetrics(plan: any, context: RoutingContext): {
    duration: number;
    cost: number;
    reliability: number;
  } {
    const agentCount = plan.selectedAgents.length;

    // Estimate duration based on strategy
    let duration = plan.estimatedDuration;
    if (plan.routingStrategy === 'parallel') {
      duration = Math.max(...plan.selectedAgents.map(() => 5)); // Parallel execution
    }

    // Estimate cost (simplified model)
    const cost = agentCount * 10; // $10 per agent execution

    // Estimate reliability based on agent health
    const healthyAgents = plan.selectedAgents.filter((agent: string) => {
      const health = context.availableAgents.get(agent);
      return health && health.status === 'healthy';
    }).length;

    const reliability = healthyAgents / agentCount;

    return { duration, cost, reliability };
  }

  /**
   * Cache routing decision
   */
  private cacheDecision(context: RoutingContext, decision: RoutingDecision): void {
    const cacheKey = this.generateCacheKey(context);
    this.routingCache.set(cacheKey, {
      decision,
      timestamp: Date.now()
    });

    // Clean old cache entries
    this.cleanCache();
  }

  /**
   * Get cached decision
   */
  private getCachedDecision(context: RoutingContext): RoutingDecision | null {
    const cacheKey = this.generateCacheKey(context);
    const cached = this.routingCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.config.cacheMaxAge) {
      return cached.decision;
    }

    return null;
  }

  /**
   * Generate cache key for routing context
   */
  private generateCacheKey(context: RoutingContext): string {
    const key = [
      context.gitEvent.type,
      context.gitEvent.files.length,
      context.gitEvent.branch,
      Array.from(context.availableAgents.keys()).sort().join(','),
      context.systemMetrics.totalLoad.toFixed(2)
    ].join('|');

    return Buffer.from(key).toString('base64');
  }

  /**
   * Clean old cache entries
   */
  private cleanCache(): void {
    const now = Date.now();

    for (const [key, value] of this.routingCache.entries()) {
      if (now - value.timestamp > this.config.cacheMaxAge) {
        this.routingCache.delete(key);
      }
    }
  }

  /**
   * Add decision to history
   */
  private addToHistory(decision: RoutingDecision): void {
    this.routingHistory.push(decision);

    // Keep only recent history
    if (this.routingHistory.length > 100) {
      this.routingHistory = this.routingHistory.slice(-100);
    }
  }

  /**
   * Emergency fallback routing
   */
  private getEmergencyFallbackRouting(context: RoutingContext): RoutingDecision {
    const availableAgentNames = Array.from(context.availableAgents.keys());
    const fallbackAgent = availableAgentNames[0] || 'quality-agent';

    const plan = {
      primaryAgent: fallbackAgent,
      supportingAgents: [],
      routingStrategy: 'sequential' as const,
      estimatedDuration: 5,
      confidence: 0.3, // Low confidence for emergency fallback
      reasoning: 'Emergency fallback routing due to system failure',
      selectedAgents: [fallbackAgent]
    };

    return {
      plan,
      confidence: 0.3,
      reasoning: 'Emergency fallback routing due to system failure',
      usedLLM: false,
      fallbackUsed: true,
      alternatives: [],
      estimatedMetrics: { duration: 5, cost: 10, reliability: 0.5 },
      metadata: {
        decisionTime: 0,
        cacheHit: false,
        agentScores: new Map([[fallbackAgent, 0.3]])
      }
    };
  }

  /**
   * Get router metrics
   */
  public getMetrics(): {
    totalRoutings: number;
    averageConfidence: number;
    llmUsageRate: number;
    cacheHitRate: number;
    averageDecisionTime: number;
    routingHistory: number;
  } {
    const totalRoutings = this.routingHistory.length;
    const llmRoutings = this.routingHistory.filter(d => d.usedLLM).length;
    const averageConfidence = totalRoutings > 0
      ? this.routingHistory.reduce((sum, d) => sum + d.confidence, 0) / totalRoutings
      : 0;

    const averageDecisionTime = totalRoutings > 0
      ? this.routingHistory.reduce((sum, d) => sum + d.metadata.decisionTime, 0) / totalRoutings
      : 0;

    return {
      totalRoutings,
      averageConfidence,
      llmUsageRate: totalRoutings > 0 ? (llmRoutings / totalRoutings) * 100 : 0,
      cacheHitRate: 0, // TODO: Track cache hits separately
      averageDecisionTime,
      routingHistory: this.routingHistory.length
    };
  }

  /**
   * Reset router state
   */
  public reset(): void {
    this.routingCache.clear();
    this.routingHistory = [];
    this.agentPerformanceCache.clear();

    logger.info('Intelligent Router reset completed');
  }

  /**
   * Destroy router and cleanup resources
   */
  public destroy(): void {
    this.removeAllListeners();
    this.reset();

    logger.info('Intelligent Router destroyed');
  }
}
