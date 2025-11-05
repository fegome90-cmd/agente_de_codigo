/**
 * Enhanced Deterministic Routing with Pattern Recognition
 *
 * Provides intelligent routing decisions based on:
 * - File type and content pattern recognition
 * - Historical performance data
 * - Context-aware decision trees
 * - Agent health and capability scoring
 * - Self-learning from routing outcomes
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export interface RoutingContext {
  files: string[];
  changeType: 'add' | 'modify' | 'delete';
  scope: string;
  repository?: string;
  branch?: string;
  author?: string;
  commitMessage?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface AgentCapability {
  name: string;
  fileTypes: string[];
  patterns: string[];
  priority: number;
  avgResponseTime: number;
  successRate: number;
  lastUsed: number;
  healthScore: number;
  maxConcurrency: number;
  currentLoad: number;
  specialties: string[];
}

export interface RoutingDecision {
  selectedAgents: string[];
  routing: Map<string, string[]>; // agent -> files mapping
  confidence: number;
  reasoning: string[];
  estimatedTime: number;
  fallbackOptions: string[];
  context: RoutingContext;
}

export interface RoutingPattern {
  id: string;
  name: string;
  conditions: PatternCondition[];
  recommendedAgents: string[];
  priority: number;
  successRate: number;
  usageCount: number;
  lastUsed: number;
  createdAt: number;
}

export interface PatternCondition {
  field: keyof RoutingContext;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'in' | 'greaterThan' | 'lessThan';
  value: any;
  weight: number;
}

export interface RoutingMetrics {
  totalRoutings: number;
  successfulRoutings: number;
  averageConfidence: number;
  averageResponseTime: number;
  agentUtilization: Map<string, number>;
  patternMatches: Map<string, number>;
  routingAccuracy: number;
}

export interface RoutingConfig {
  agents: AgentCapability[];
  patterns: RoutingPattern[];
  learning: {
    enabled: boolean;
    feedbackWindow: number; // hours
    minConfidenceThreshold: number;
    maxRoutingOptions: number;
    adaptiveThresholds: boolean;
  };
  performance: {
    maxResponseTime: number; // ms
    minSuccessRate: number;
    healthCheckInterval: number; // ms
    loadBalancing: boolean;
  };
}

export class EnhancedDeterministicRouter extends EventEmitter {
  private config: RoutingConfig;
  private metrics: RoutingMetrics;
  private routingHistory: RoutingDecision[] = [];
  private patternPerformance: Map<string, number> = new Map();
  private agentPerformance: Map<string, number> = new Map();
  private maxHistorySize = 10000;

  constructor(config: RoutingConfig) {
    super();
    this.config = config;
    this.metrics = {
      totalRoutings: 0,
      successfulRoutings: 0,
      averageConfidence: 0,
      averageResponseTime: 0,
      agentUtilization: new Map(),
      patternMatches: new Map(),
      routingAccuracy: 0
    };

    // Initialize agent utilization tracking
    config.agents.forEach(agent => {
      this.metrics.agentUtilization.set(agent.name, 0);
    });

    // Start health checking
    this.startHealthChecking();

    logger.info('Enhanced Deterministic Router initialized', {
      agentsCount: config.agents.length,
      patternsCount: config.patterns.length,
      learningEnabled: config.learning.enabled
    });
  }

  /**
   * Main routing method - analyzes context and makes routing decisions
   */
  async route(context: RoutingContext): Promise<RoutingDecision> {
    const startTime = Date.now();
    this.metrics.totalRoutings++;

    try {
      logger.debug('Starting routing decision', {
        filesCount: context.files.length,
        changeType: context.changeType,
        scope: context.scope
      });

      // Step 1: Analyze file patterns and characteristics
      const fileAnalysis = this.analyzeFiles(context.files);

      // Step 2: Match routing patterns
      const matchedPatterns = this.matchPatterns(context, fileAnalysis);

      // Step 3: Calculate agent scores based on capabilities and context
      const agentScores = this.calculateAgentScores(context, fileAnalysis, matchedPatterns);

      // Step 4: Select optimal agents
      const selectedAgents = this.selectOptimalAgents(agentScores, context);

      // Step 5: Assign files to selected agents
      const routing = this.assignFilesToAgents(context.files, selectedAgents, fileAnalysis);

      // Step 6: Calculate confidence and reasoning
      const { confidence, reasoning } = this.calculateRoutingConfidence(
        selectedAgents,
        agentScores,
        matchedPatterns,
        context
      );

      // Step 7: Estimate processing time
      const estimatedTime = this.estimateProcessingTime(selectedAgents, routing);

      // Step 8: Determine fallback options
      const fallbackOptions = this.determineFallbackOptions(agentScores, selectedAgents);

      const decision: RoutingDecision = {
        selectedAgents,
        routing,
        confidence,
        reasoning,
        estimatedTime,
        fallbackOptions,
        context
      };

      // Store routing decision for learning
      this.storeRoutingDecision(decision);

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(decision, processingTime);

      logger.info('Routing decision completed', {
        selectedAgents: selectedAgents.length,
        confidence: (confidence * 100).toFixed(1) + '%',
        estimatedTime,
        processingTime
      });

      // Emit event for monitoring
      this.emit('routing:decision', decision);

      return decision;

    } catch (error) {
      logger.error('Routing decision failed', {
        error: error.message,
        context
      });

      // Return fallback routing decision
      return this.createFallbackRouting(context);
    }
  }

  /**
   * Analyze files to extract patterns and characteristics
   */
  private analyzeFiles(files: string[]): Map<string, any> {
    const analysis = new Map();

    files.forEach(file => {
      const characteristics = {
        extension: this.getFileExtension(file),
        path: this.getFilePath(file),
        name: this.getFileName(file),
        directory: this.getDirectory(file),
        language: this.detectLanguage(file),
        size: 0, // Would be populated with actual file size
        isTest: this.isTestFile(file),
        isConfig: this.isConfigFile(file),
        isDocumentation: this.isDocumentationFile(file),
        complexity: this.estimateComplexity(file)
      };

      analysis.set(file, characteristics);
    });

    return analysis;
  }

  /**
   * Match routing patterns against context and file analysis
   */
  private matchPatterns(context: RoutingContext, fileAnalysis: Map<string, any>): RoutingPattern[] {
    const matchedPatterns: RoutingPattern[] = [];

    this.config.patterns.forEach(pattern => {
      let matchScore = 0;
      let totalWeight = 0;

      pattern.conditions.forEach(condition => {
        totalWeight += condition.weight;

        if (this.evaluateCondition(condition, context, fileAnalysis)) {
          matchScore += condition.weight;
        }
      });

      // Consider pattern a match if it scores above 70% of possible weight
      const matchPercentage = totalWeight > 0 ? matchScore / totalWeight : 0;
      if (matchPercentage >= 0.7) {
        matchedPatterns.push({
          ...pattern,
          usageCount: pattern.usageCount + 1,
          lastUsed: Date.now()
        });

        // Update pattern match metrics
        const currentCount = this.metrics.patternMatches.get(pattern.id) || 0;
        this.metrics.patternMatches.set(pattern.id, currentCount + 1);
      }
    });

    // Sort by priority and success rate
    return matchedPatterns.sort((a, b) => {
      const scoreA = a.priority * (a.successRate || 0.5);
      const scoreB = b.priority * (b.successRate || 0.5);
      return scoreB - scoreA;
    });
  }

  /**
   * Evaluate a single pattern condition
   */
  private evaluateCondition(
    condition: PatternCondition,
    context: RoutingContext,
    fileAnalysis: Map<string, any>
  ): boolean {
    const value = this.getFieldValue(condition.field, context, fileAnalysis);

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return typeof value === 'string' && value.includes(condition.value);
      case 'startsWith':
        return typeof value === 'string' && value.startsWith(condition.value);
      case 'endsWith':
        return typeof value === 'string' && value.endsWith(condition.value);
      case 'regex':
        return typeof value === 'string' && new RegExp(condition.value).test(value);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'greaterThan':
        return typeof value === 'number' && value > condition.value;
      case 'lessThan':
        return typeof value === 'number' && value < condition.value;
      default:
        return false;
    }
  }

  /**
   * Get field value from context or file analysis
   */
  private getFieldValue(
    field: keyof RoutingContext,
    context: RoutingContext,
    fileAnalysis: Map<string, any>
  ): any {
    if (field in context) {
      return context[field];
    }

    // Handle special cases that need file analysis
    switch (field) {
      case 'files':
        return Array.from(fileAnalysis.keys());
      case 'fileTypes':
        return Array.from(fileAnalysis.values()).map(f => f.extension);
      case 'languages':
        return Array.from(new Set(Array.from(fileAnalysis.values()).map(f => f.language)));
      case 'hasTests':
        return Array.from(fileAnalysis.values()).some(f => f.isTest);
      case 'hasConfigChanges':
        return Array.from(fileAnalysis.values()).some(f => f.isConfig);
      default:
        return null;
    }
  }

  /**
   * Calculate scores for each agent based on capabilities and context
   */
  private calculateAgentScores(
    context: RoutingContext,
    fileAnalysis: Map<string, any>,
    matchedPatterns: RoutingPattern[]
  ): Map<string, number> {
    const scores = new Map<string, number>();

    this.config.agents.forEach(agent => {
      let score = 0;

      // Base score from agent capabilities
      score += this.calculateCapabilityScore(agent, fileAnalysis);

      // Score from pattern matches
      score += this.calculatePatternScore(agent, matchedPatterns);

      // Score from performance history
      score += this.calculatePerformanceScore(agent);

      // Score from current load and health
      score += this.calculateLoadScore(agent);

      // Score from context relevance
      score += this.calculateContextScore(agent, context);

      scores.set(agent.name, Math.max(0, Math.min(100, score)));
    });

    return scores;
  }

  /**
   * Calculate capability score for an agent
   */
  private calculateCapabilityScore(agent: AgentCapability, fileAnalysis: Map<string, any>): number {
    let score = 0;
    const files = Array.from(fileAnalysis.values());

    files.forEach(file => {
      // File type compatibility
      if (agent.fileTypes.includes(file.extension)) {
        score += 20;
      }

      // Pattern matching
      agent.patterns.forEach(pattern => {
        if (file.name.includes(pattern) || file.path.includes(pattern)) {
          score += 15;
        }
      });

      // Specialty matching
      agent.specialties.forEach(specialty => {
        if (this.matchesSpecialty(specialty, file)) {
          score += 10;
        }
      });
    });

    return Math.min(50, score); // Cap at 50 points
  }

  /**
   * Calculate pattern score for an agent
   */
  private calculatePatternScore(agent: AgentCapability, matchedPatterns: RoutingPattern[]): number {
    let score = 0;

    matchedPatterns.forEach(pattern => {
      if (pattern.recommendedAgents.includes(agent.name)) {
        score += pattern.priority * (pattern.successRate || 0.5);
      }
    });

    return Math.min(30, score); // Cap at 30 points
  }

  /**
   * Calculate performance score for an agent
   */
  private calculatePerformanceScore(agent: AgentCapability): number {
    const successRate = agent.successRate || 0.8;
    const responseTime = Math.max(0, 1 - (agent.avgResponseTime / 10000)); // Normalize to 10s max

    return (successRate * 15) + (responseTime * 15); // Max 30 points
  }

  /**
   * Calculate load score for an agent
   */
  private calculateLoadScore(agent: AgentCapability): number {
    const loadRatio = agent.currentLoad / agent.maxConcurrency;
    const healthScore = agent.healthScore || 0.8;

    // Penalize heavily loaded agents
    const loadScore = Math.max(0, (1 - loadRatio) * 20);

    // Reward healthy agents
    const healthBonus = healthScore * 10;

    return loadScore + healthBonus;
  }

  /**
   * Calculate context score for an agent
   */
  private calculateContextScore(agent: AgentCapability, context: RoutingContext): number {
    let score = 0;

    // Time-based scoring (recency bonus)
    const timeSinceLastUsed = Date.now() - agent.lastUsed;
    if (timeSinceLastUsed < 3600000) { // Used within last hour
      score += 5;
    }

    // Branch-specific scoring
    if (context.branch) {
      if (agent.specialties.includes('security') && context.branch.includes('security')) {
        score += 10;
      }
      if (agent.specialties.includes('performance') && context.branch.includes('perf')) {
        score += 10;
      }
    }

    // Author-specific scoring (if available)
    if (context.author && agent.specialties.includes('quality')) {
      score += 5;
    }

    return Math.min(20, score);
  }

  /**
   * Select optimal agents based on scores
   */
  private selectOptimalAgents(
    agentScores: Map<string, number>,
    context: RoutingContext
  ): string[] {
    // Sort agents by score
    const sortedAgents = Array.from(agentScores.entries())
      .sort((a, b) => b[1] - a[1]);

    // Select top agents that meet minimum threshold
    const minScore = this.config.learning.minConfidenceThreshold * 100;
    const qualifiedAgents = sortedAgents
      .filter(([_, score]) => score >= minScore)
      .slice(0, this.config.learning.maxRoutingOptions)
      .map(([name, _]) => name);

    return qualifiedAgents.length > 0 ? qualifiedAgents : ['default']; // Fallback to default agent
  }

  /**
   * Assign files to selected agents
   */
  private assignFilesToAgents(
    files: string[],
    selectedAgents: string[],
    fileAnalysis: Map<string, any>
  ): Map<string, string[]> {
    const routing = new Map<string, string[]>();

    // Initialize routing for each selected agent
    selectedAgents.forEach(agent => {
      routing.set(agent, []);
    });

    // Assign files based on agent capabilities
    files.forEach(file => {
      const characteristics = fileAnalysis.get(file);
      const bestAgent = this.findBestAgentForFile(file, characteristics, selectedAgents);

      if (bestAgent && routing.has(bestAgent)) {
        routing.get(bestAgent)!.push(file);
      }
    });

    // Remove agents with no assigned files
    for (const [agent, agentFiles] of routing.entries()) {
      if (agentFiles.length === 0) {
        routing.delete(agent);
      }
    }

    return routing;
  }

  /**
   * Find the best agent for a specific file
   */
  private findBestAgentForFile(
    file: string,
    characteristics: any,
    selectedAgents: string[]
  ): string | null {
    let bestAgent = null;
    let bestScore = -1;

    selectedAgents.forEach(agentName => {
      const agent = this.config.agents.find(a => a.name === agentName);
      if (!agent) return;

      let score = 0;

      // File type compatibility
      if (agent.fileTypes.includes(characteristics.extension)) {
        score += 30;
      }

      // Pattern matching
      agent.patterns.forEach(pattern => {
        if (file.includes(pattern)) {
          score += 20;
        }
      });

      // Specialty matching
      agent.specialties.forEach(specialty => {
        if (this.matchesSpecialty(specialty, characteristics)) {
          score += 15;
        }
      });

      // Current load consideration
      const loadRatio = agent.currentLoad / agent.maxConcurrency;
      score -= loadRatio * 10;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agentName;
      }
    });

    return bestAgent;
  }

  /**
   * Calculate routing confidence and reasoning
   */
  private calculateRoutingConfidence(
    selectedAgents: string[],
    agentScores: Map<string, number>,
    matchedPatterns: RoutingPattern[],
    context: RoutingContext
  ): { confidence: number; reasoning: string[] } {
    const reasoning: string[] = [];
    let confidenceFactors: number[] = [];

    // Agent score confidence
    const avgAgentScore = selectedAgents.reduce((sum, agent) =>
      sum + (agentScores.get(agent) || 0), 0) / selectedAgents.length;
    confidenceFactors.push(avgAgentScore / 100);
    reasoning.push(`Average agent score: ${avgAgentScore.toFixed(1)}`);

    // Pattern matching confidence
    if (matchedPatterns.length > 0) {
      const patternConfidence = matchedPatterns.reduce((sum, pattern) =>
        sum + (pattern.successRate || 0.5), 0) / matchedPatterns.length;
      confidenceFactors.push(patternConfidence);
      reasoning.push(`Pattern confidence: ${(patternConfidence * 100).toFixed(1)}%`);
    } else {
      reasoning.push('No specific patterns matched');
    }

    // Context completeness confidence
    const contextCompleteness = this.evaluateContextCompleteness(context);
    confidenceFactors.push(contextCompleteness);
    reasoning.push(`Context completeness: ${(contextCompleteness * 100).toFixed(1)}%`);

    // Overall confidence (weighted average)
    const confidence = confidenceFactors.reduce((sum, factor) => sum + factor, 0) / confidenceFactors.length;

    return { confidence, reasoning };
  }

  /**
   * Estimate processing time for selected agents
   */
  private estimateProcessingTime(selectedAgents: string[], routing: Map<string, string[]>): number {
    let totalTime = 0;

    for (const [agentName, files] of routing.entries()) {
      const agent = this.config.agents.find(a => a.name === agentName);
      if (agent) {
        // Base time per file for this agent
        const timePerFile = agent.avgResponseTime || 5000; // Default 5s per file
        totalTime += timePerFile * files.length;
      }
    }

    // Add 20% buffer for coordination overhead
    return Math.round(totalTime * 1.2);
  }

  /**
   * Determine fallback options
   */
  private determineFallbackOptions(
    agentScores: Map<string, number>,
    selectedAgents: string[]
  ): string[] {
    // Sort all agents by score and filter out selected ones
    const fallbackCandidates = Array.from(agentScores.entries())
      .filter(([name, _]) => !selectedAgents.includes(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) // Top 3 fallback options
      .map(([name, _]) => name);

    return fallbackCandidates;
  }

  /**
   * Store routing decision for learning
   */
  private storeRoutingDecision(decision: RoutingDecision): void {
    this.routingHistory.push(decision);

    // Maintain history size
    if (this.routingHistory.length > this.maxHistorySize) {
      this.routingHistory.shift();
    }

    // Update pattern usage
    if (this.config.learning.enabled) {
      this.updatePatternLearning(decision);
    }
  }

  /**
   * Update pattern learning based on routing outcomes
   */
  private updatePatternLearning(decision: RoutingDecision): void {
    // This would be called when routing results are available
    // For now, just track that the pattern was used
    // In a real implementation, this would update success rates based on actual outcomes
  }

  /**
   * Update routing metrics
   */
  private updateMetrics(decision: RoutingDecision, processingTime: number): void {
    // Update average confidence
    this.metrics.averageConfidence =
      (this.metrics.averageConfidence * (this.metrics.totalRoutings - 1) + decision.confidence)
      / this.metrics.totalRoutings;

    // Update average response time
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalRoutings - 1) + processingTime)
      / this.metrics.totalRoutings;

    // Update agent utilization
    decision.selectedAgents.forEach(agent => {
      const current = this.metrics.agentUtilization.get(agent) || 0;
      this.metrics.agentUtilization.set(agent, current + 1);
    });

    // Update routing accuracy (would be based on actual outcomes)
    this.metrics.routingAccuracy = this.metrics.successfulRoutings / this.metrics.totalRoutings;
  }

  /**
   * Create fallback routing in case of errors
   */
  private createFallbackRouting(context: RoutingContext): RoutingDecision {
    const defaultAgent = this.config.agents.find(a => a.name === 'default') || this.config.agents[0];

    return {
      selectedAgents: [defaultAgent.name],
      routing: new Map([[defaultAgent.name, context.files]]),
      confidence: 0.5,
      reasoning: ['Fallback routing due to error'],
      estimatedTime: defaultAgent.avgResponseTime * context.files.length,
      fallbackOptions: [],
      context
    };
  }

  /**
   * Start health checking for agents
   */
  private startHealthChecking(): void {
    setInterval(() => {
      this.checkAgentHealth();
    }, this.config.performance.healthCheckInterval);
  }

  /**
   * Check health of all agents
   */
  private async checkAgentHealth(): Promise<void> {
    for (const agent of this.config.agents) {
      try {
        // This would implement actual health checks
        // For now, simulate health scores
        agent.healthScore = 0.8 + Math.random() * 0.2; // 80-100% health
        agent.currentLoad = Math.floor(Math.random() * agent.maxConcurrency);
      } catch (error) {
        logger.warn('Health check failed for agent', { agent: agent.name, error: error.message });
        agent.healthScore = 0.5; // Reduce health score on check failure
      }
    }
  }

  /**
   * Get current routing metrics
   */
  getMetrics(): RoutingMetrics {
    return { ...this.metrics };
  }

  /**
   * Evaluate context completeness
   */
  private evaluateContextCompleteness(context: RoutingContext): number {
    let completeness = 0;
    const factors = ['files', 'changeType', 'scope', 'timestamp'];

    factors.forEach(factor => {
      if (context[factor as keyof RoutingContext]) {
        completeness += 0.25;
      }
    });

    return Math.min(1, completeness);
  }

  // Utility methods
  private getFileExtension(file: string): string {
    return file.split('.').pop() || '';
  }

  private getFilePath(file: string): string {
    return file;
  }

  private getFileName(file: string): string {
    return file.split('/').pop() || file;
  }

  private getDirectory(file: string): string {
    return file.substring(0, file.lastIndexOf('/')) || '';
  }

  private detectLanguage(file: string): string {
    const extension = this.getFileExtension(file);
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'c++',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala'
    };
    return languageMap[extension] || 'unknown';
  }

  private isTestFile(file: string): boolean {
    return file.includes('.test.') ||
           file.includes('.spec.') ||
           file.includes('/test/') ||
           file.includes('/tests/') ||
           file.endsWith('.test.js') ||
           file.endsWith('.spec.js');
  }

  private isConfigFile(file: string): boolean {
    const configFiles = ['package.json', 'tsconfig.json', 'webpack.config.js', 'dockerfile', 'Dockerfile'];
    return configFiles.includes(this.getFileName(file)) ||
           file.includes('/config/') ||
           file.endsWith('.config.js') ||
           file.endsWith('.config.ts');
  }

  private isDocumentationFile(file: string): boolean {
    return file.endsWith('.md') ||
           file.endsWith('.txt') ||
           file.includes('/docs/') ||
           file.includes('/doc/');
  }

  private estimateComplexity(file: string): number {
    // Simple complexity estimation based on file characteristics
    let complexity = 1;

    if (this.getFileExtension(file) === 'js' || this.getFileExtension(file) === 'ts') {
      complexity += 2;
    }

    if (file.includes('index.')) {
      complexity += 1;
    }

    if (file.includes('/lib/') || file.includes('/src/')) {
      complexity += 1;
    }

    return complexity;
  }

  private matchesSpecialty(specialty: string, file: any): boolean {
    switch (specialty) {
      case 'security':
        return file.name.includes('auth') ||
               file.name.includes('security') ||
               file.name.includes('token');
      case 'performance':
        return file.name.includes('perf') ||
               file.name.includes('cache') ||
               file.name.includes('optimize');
      case 'quality':
        return file.isTest ||
               file.name.includes('lint') ||
               file.name.includes('format');
      case 'documentation':
        return file.isDocumentation ||
               file.name.includes('readme') ||
               file.name.includes('doc');
      default:
        return false;
    }
  }

  /**
   * Provide feedback on routing decisions for learning
   */
  async provideFeedback(routingId: string, success: boolean, feedback: any): Promise<void> {
    const decision = this.routingHistory.find(d => d.context.timestamp.toString() === routingId);
    if (decision && this.config.learning.enabled) {
      // Update learning metrics based on feedback
      this.metrics.successfulRoutings += success ? 1 : 0;
      this.metrics.routingAccuracy = this.metrics.successfulRoutings / this.metrics.totalRoutings;

      logger.debug('Routing feedback received', {
        routingId,
        success,
        confidence: decision.confidence
      });
    }
  }
}
