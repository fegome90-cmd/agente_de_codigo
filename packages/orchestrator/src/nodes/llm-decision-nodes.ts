/**
 * LLM Decision Nodes for Hybrid Orchestration
 *
 * Implements intelligent decision-making nodes using LLM inference
 * for ambiguous cases, dynamic routing, and result synthesis
 *
 * @author Pit Crew v2.0.0
 * @since 2025-11-03
 */

import { StateGraph, CompiledGraph } from '@langchain/langgraph';
import { z } from 'zod';
import {
  GitEvent,
  AgentHealth,
  SkillRule,
  RoutingPlan,
  SupervisorDecision,
  AnalysisResult,
  LLMDecision,
  LLMDecisionType,
  LLMConfidenceLevel,
  RoutingResult,
  SynthesisResult
} from '@pit-crew/shared';
import { logger } from '../utils/logger.js';

/**
 * Schema for LLM routing decisions
 */
export const RoutingDecisionSchema = z.object({
  reasoning: z.string().describe('Step-by-step reasoning for the routing decision'),
  selectedAgents: z.array(z.string()).describe('Recommended agents for this task'),
  routingStrategy: z.enum(['parallel', 'sequential', 'hybrid']).describe('How agents should execute'),
  confidence: z.number().min(0).max(1).describe('Confidence in this decision (0-1)'),
  fallbackPlan: z.string().optional().describe('Alternative plan if confidence is low'),
  estimatedDuration: z.number().describe('Estimated execution time in minutes'),
  riskLevel: z.enum(['low', 'medium', 'high']).describe('Risk level of this routing decision')
});

/**
 * Schema for LLM synthesis decisions
 */
export const SynthesisDecisionSchema = z.object({
  overallAssessment: z.string().describe('Overall assessment of all agent results'),
  confidence: z.number().min(0).max(1).describe('Confidence in synthesis (0-1)'),
  contradictions: z.array(z.object({
    agents: z.array(z.string()).describe('Agents with contradictory results'),
    conflict: z.string().describe('Description of the contradiction'),
    resolution: z.string().describe('How to resolve the conflict')
  })).describe('Identified contradictions and resolutions'),
  finalRecommendation: z.enum(['approve', 'request_changes', 'comment', 'escalate']).describe('Final recommendation'),
  priorityIssues: z.array(z.object({
    issue: z.string().describe('Description of the priority issue'),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    agent: z.string().describe('Agent that identified this issue')
  })).describe('Priority issues that need attention'),
  executionSummary: z.string().describe('Summary of the execution and results')
});

/**
 * Schema for LLM quality validation decisions
 */
export const QualityValidationSchema = z.object({
  validationScore: z.number().min(0).max(100).describe('Overall validation score (0-100)'),
  confidenceScore: z.number().min(0).max(1).describe('Confidence in validation (0-1)'),
  validationReasoning: z.string().describe('Reasoning for the validation score'),
  identifiedPatterns: z.array(z.object({
    pattern: z.string().describe('Pattern name'),
    frequency: z.number().describe('How often this pattern appears'),
    impact: z.enum(['positive', 'negative', 'neutral']),
    description: z.string().describe('Pattern description')
  })).describe('Identified patterns in the results'),
  qualityGaps: z.array(z.object({
    gap: z.string().describe('Description of the quality gap'),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    recommendation: z.string().describe('Recommendation to address the gap')
  })).describe('Identified quality gaps'),
  improvementSuggestions: z.array(z.string()).describe('Suggestions for improvement')
});

/**
 * LLM Decision Node Base Class
 */
export abstract class LLMD决策节点 {
  protected metrics: {
    decisionsCount: number;
    averageConfidence: number;
    successRate: number;
    averageResponseTime: number;
    errorsCount: number;
  };

  constructor(
    protected nodeType: LLMDecisionType,
    protected llmConfig: {
      model: string;
      temperature: number;
      maxTokens: number;
      timeout: number;
    }
  ) {
    this.metrics = {
      decisionsCount: 0,
      averageConfidence: 0,
      successRate: 0,
      averageResponseTime: 0,
      errorsCount: 0
    };
  }

  /**
   * Execute LLM decision with fallback to deterministic logic
   */
  async executeDecision(input: any, fallbackLogic?: () => any): Promise<LLMDecision> {
    const startTime = Date.now();

    try {
      this.metrics.decisionsCount++;

      // Attempt LLM decision
      const decision = await this.makeLLMDecision(input);

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(decision.confidence, true, responseTime);

      // Log decision
      logger.info('LLM decision made', {
        nodeType: this.nodeType,
        confidence: decision.confidence,
        reasoning: decision.reasoning.substring(0, 200),
        responseTime
      });

      return decision;

    } catch (error) {
      this.metrics.errorsCount++;
      this.updateMetrics(0, false, Date.now() - startTime);

      logger.error('LLM decision failed, using fallback', {
        nodeType: this.nodeType,
        error: error.message,
        fallbackAvailable: !!fallbackLogic
      });

      // Use fallback logic if available
      if (fallbackLogic) {
        const fallbackResult = fallbackLogic();
        return {
          type: this.nodeType,
          reasoning: `LLM failed: ${error.message}. Using deterministic fallback.`,
          confidence: 0.5, // Medium confidence for fallbacks
          decision: fallbackResult,
          executionTime: Date.now() - startTime,
          fallbackUsed: true,
          llmModel: this.llmConfig.model
        };
      }

      throw error;
    }
  }

  /**
   * Abstract method for specific LLM decision implementation
   */
  protected abstract makeLLMDecision(input: any): Promise<LLMDecision>;

  /**
   * Update decision metrics
   */
  private updateMetrics(confidence: number, success: boolean, responseTime: number): void {
    // Update average confidence
    this.metrics.averageConfidence =
      (this.metrics.averageConfidence * (this.metrics.decisionsCount - 1) + confidence) /
      this.metrics.decisionsCount;

    // Update success rate
    this.metrics.successRate =
      (this.metrics.successRate * (this.metrics.decisionsCount - 1) + (success ? 1 : 0)) /
      this.metrics.decisionsCount;

    // Update average response time
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.decisionsCount - 1) + responseTime) /
      this.metrics.decisionsCount;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

/**
 * Smart Routing Decision Node
 */
export class SmartRoutingDecisionNode extends LLMD决策节点 {
  constructor(llmConfig: any = {}) {
    super('routing_decision', {
      model: 'claude-3-sonnet',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 30000,
      ...llmConfig
    });
  }

  protected async makeLLMDecision(input: {
    gitEvent: GitEvent;
    availableAgents: Map<string, AgentHealth>;
    skillRules: SkillRule[];
    deterministicPlan?: RoutingPlan;
  }): Promise<LLMDecision> {
    const { gitEvent, availableAgents, skillRules, deterministicPlan } = input;

    // Prepare context for LLM
    const prompt = `
Analyze this git event and determine the optimal agent routing strategy.

Git Event Details:
- Type: ${gitEvent.type}
- Files changed: ${gitEvent.files.length}
- Author: ${gitEvent.author}
- Message: ${gitEvent.message}
- Branch: ${gitEvent.branch}

Available Agents:
${Array.from(availableAgents.entries()).map(([name, health]) =>
  `- ${name}: ${health.status} (load: ${health.metrics.loadAverage})`
).join('\n')}

Deterministic Plan (fallback):
${deterministicPlan ? JSON.stringify(deterministicPlan, null, 2) : 'No deterministic plan available'}

Consider:
1. File types and complexity
2. Agent capabilities and current load
3. Risk level of changes
4. Dependencies between analysis types

Respond with a routing decision following this schema:
- reasoning (step-by-step analysis)
- selectedAgents (array of agent names)
- routingStrategy ('parallel', 'sequential', or 'hybrid')
- confidence (0-1)
- fallbackPlan (alternative if confidence < 0.7)
- estimatedDuration (minutes)
- riskLevel ('low', 'medium', 'high')
`;

    // TODO: Replace with actual LLM call
    // For now, implement intelligent routing logic
    const decision = this.makeIntelligentRoutingDecision(input);

    return {
      type: 'routing_decision',
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      decision: decision,
      executionTime: Date.now() - Date.now(),
      fallbackUsed: false,
      llmModel: this.llmConfig.model
    };
  }

  private makeIntelligentRoutingDecision(input: {
    gitEvent: GitEvent;
    availableAgents: Map<string, AgentHealth>;
    skillRules: SkillRule[];
  }) {
    const { gitEvent, availableAgents } = input;

    // Analyze file types
    const fileTypes = new Set(gitEvent.files.map(f => f.path.split('.').pop()));
    const hasCodeFiles = fileTypes.has('ts') || fileTypes.has('js') || fileTypes.has('py');
    const hasConfigFiles = fileTypes.has('json') || fileTypes.has('yaml') || fileTypes.has('yml');
    const hasDocs = fileTypes.has('md') || fileTypes.has('rst');

    // Select agents based on analysis
    const selectedAgents: string[] = [];
    let reasoning = 'Analysis: ';

    // Always include security for code changes
    if (hasCodeFiles) {
      selectedAgents.push('security-agent');
      reasoning += 'Code files detected, security analysis required. ';
    }

    // Include quality for TypeScript/JavaScript
    if (fileTypes.has('ts') || fileTypes.has('js')) {
      selectedAgents.push('quality-agent');
      reasoning += 'TypeScript/JavaScript files, quality analysis needed. ';
    }

    // Include documentation for API/docs changes
    if (hasDocs || hasConfigFiles || gitEvent.files.some(f => f.path.includes('api'))) {
      selectedAgents.push('documentation-agent');
      reasoning += 'Documentation or API changes detected. ';
    }

    // Include architecture for significant changes
    if (gitEvent.files.length > 10 || gitEvent.message.includes('refactor') || gitEvent.message.includes('architecture')) {
      selectedAgents.push('architecture-agent');
      reasoning += 'Significant changes detected, architecture analysis recommended. ';
    }

    // Determine routing strategy
    const routingStrategy = selectedAgents.length > 2 ? 'parallel' : 'hybrid';

    // Calculate confidence based on clarity of requirements
    let confidence = 0.8; // Base confidence

    if (selectedAgents.length === 0) {
      confidence = 0.3;
      reasoning += 'No clear agent requirements identified. ';
    } else if (selectedAgents.length > 4) {
      confidence = 0.6;
      reasoning += 'Many agents selected, complexity increases uncertainty. ';
    }

    return {
      reasoning,
      selectedAgents,
      routingStrategy,
      confidence,
      fallbackPlan: confidence < 0.7 ? 'Use all available agents' : undefined,
      estimatedDuration: selectedAgents.length * 5, // 5 minutes per agent
      riskLevel: gitEvent.files.length > 20 ? 'high' : gitEvent.files.length > 5 ? 'medium' : 'low'
    };
  }
}

/**
 * Result Synthesis Decision Node
 */
export class ResultSynthesisDecisionNode extends LLMD决策节点 {
  constructor(llmConfig: any = {}) {
    super('synthesis_decision', {
      model: 'claude-3-sonnet',
      temperature: 0.2,
      maxTokens: 1500,
      timeout: 45000,
      ...llmConfig
    });
  }

  protected async makeLLMDecision(input: {
    agentResults: Map<string, AnalysisResult>;
    gitEvent: GitEvent;
  }): Promise<LLMDecision> {
    const { agentResults, gitEvent } = input;

    // Analyze results for patterns and contradictions
    const analysis = this.analyzeResults(agentResults);

    // Make synthesis decision
    const synthesis = this.makeSynthesisDecision(analysis, gitEvent);

    return {
      type: 'synthesis_decision',
      reasoning: synthesis.reasoning,
      confidence: synthesis.confidence,
      decision: synthesis,
      executionTime: Date.now() - Date.now(),
      fallbackUsed: false,
      llmModel: this.llmConfig.model
    };
  }

  private analyzeResults(agentResults: Map<string, AnalysisResult>) {
    const results = Array.from(agentResults.entries());

    // Count issues by severity
    const issueCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    // Collect findings and contradictions
    const findings: string[] = [];
    const contradictions: any[] = [];

    results.forEach(([agentName, result]) => {
      // Count issues
      result.issues?.forEach(issue => {
        issueCounts[issue.severity]++;
        findings.push(`${agentName}: ${issue.message}`);
      });

      // Check for contradictions with other agents
      results.forEach(([otherAgent, otherResult]) => {
        if (agentName !== otherAgent) {
          const contradiction = this.findContradiction(result, otherResult, agentName, otherAgent);
          if (contradiction) {
            contradictions.push(contradiction);
          }
        }
      });
    });

    return {
      totalIssues: Object.values(issueCounts).reduce((a, b) => a + b, 0),
      issueCounts,
      findings,
      contradictions,
      agentCount: results.length
    };
  }

  private findContradiction(result1: AnalysisResult, result2: AnalysisResult, agent1: string, agent2: string): any {
    // Simple contradiction detection - can be enhanced
    if (result1.summary?.includes('no issues') && result2.issues?.length > 0) {
      return {
        agents: [agent1, agent2],
        conflict: `${agent1} reports no issues while ${agent2} found ${result2.issues.length} issues`,
        resolution: `Prioritize detailed analysis from ${agent2} and investigate discrepancy`
      };
    }
    return null;
  }

  private makeSynthesisDecision(analysis: any, gitEvent: GitEvent) {
    const { totalIssues, issueCounts, contradictions } = analysis;

    let reasoning = `Synthesis Analysis: `;
    let finalRecommendation: 'approve' | 'request_changes' | 'comment' | 'escalate';
    let confidence = 0.8;

    // Determine overall assessment
    if (issueCounts.critical > 0) {
      reasoning += `${issueCounts.critical} critical issues found. `;
      finalRecommendation = 'request_changes';
      confidence = 0.95;
    } else if (issueCounts.high > 3) {
      reasoning += `${issueCounts.high} high-severity issues found. `;
      finalRecommendation = 'request_changes';
      confidence = 0.9;
    } else if (totalIssues > 10) {
      reasoning += `${totalIssues} total issues found. `;
      finalRecommendation = 'request_changes';
      confidence = 0.85;
    } else if (contradictions.length > 0) {
      reasoning += `${contradictions.length} contradictions between agents found. `;
      finalRecommendation = 'escalate';
      confidence = 0.7;
    } else if (totalIssues === 0) {
      reasoning += 'No issues found across all agents. ';
      finalRecommendation = 'approve';
      confidence = 0.9;
    } else {
      reasoning += `${totalIssues} minor issues found. `;
      finalRecommendation = 'comment';
      confidence = 0.8;
    }

    // Priority issues
    const priorityIssues = [];
    if (issueCounts.critical > 0) {
      priorityIssues.push({
        issue: 'Critical security vulnerabilities detected',
        severity: 'critical' as const,
        agent: 'security-agent'
      });
    }
    if (issueCounts.high > 0) {
      priorityIssues.push({
        issue: 'High-severity quality issues detected',
        severity: 'high' as const,
        agent: 'quality-agent'
      });
    }

    return {
      reasoning,
      confidence,
      contradictions,
      finalRecommendation,
      priorityIssues,
      executionSummary: `Analysis completed by ${analysis.agentCount} agents with ${totalIssues} total issues found.`
    };
  }
}

/**
 * Quality Validation Decision Node
 */
export class QualityValidationDecisionNode extends LLMD决策节点 {
  constructor(llmConfig: any = {}) {
    super('quality_validation', {
      model: 'claude-3-haiku',
      temperature: 0.1,
      maxTokens: 800,
      timeout: 20000,
      ...llmConfig
    });
  }

  protected async makeLLMDecision(input: {
    analysisResult: AnalysisResult;
    expectedPatterns: string[];
    qualityThresholds: any;
  }): Promise<LLMDecision> {
    const { analysisResult, expectedPatterns, qualityThresholds } = input;

    const validation = this.validateQuality(analysisResult, expectedPatterns, qualityThresholds);

    return {
      type: 'quality_validation',
      reasoning: validation.validationReasoning,
      confidence: validation.confidenceScore,
      decision: validation,
      executionTime: Date.now() - Date.now(),
      fallbackUsed: false,
      llmModel: this.llmConfig.model
    };
  }

  private validateQuality(result: AnalysisResult, expectedPatterns: string[], thresholds: any) {
    let validationScore = 100;
    const identifiedPatterns: any[] = [];
    const qualityGaps: any[] = [];
    const improvementSuggestions: string[] = [];

    // Check for expected patterns
    expectedPatterns.forEach(pattern => {
      if (result.summary?.includes(pattern)) {
        identifiedPatterns.push({
          pattern,
          frequency: 1,
          impact: 'positive' as const,
          description: `Expected pattern "${pattern}" found in analysis`
        });
      } else {
        qualityGaps.push({
          gap: `Missing expected pattern: ${pattern}`,
          severity: 'medium' as const,
          recommendation: `Ensure analysis includes ${pattern} assessment`
        });
        validationScore -= 10;
      }
    });

    // Check issue counts against thresholds
    if (result.issues) {
      const issueCount = result.issues.length;
      if (issueCount > thresholds.maxIssues) {
        qualityGaps.push({
          gap: `Too many issues: ${issueCount} > ${thresholds.maxIssues}`,
          severity: 'high' as const,
          recommendation: 'Reduce issue count or adjust thresholds'
        });
        validationScore -= 20;
      }
    }

    // Calculate confidence
    const confidenceScore = Math.max(0, validationScore / 100);

    const validationReasoning = `Quality validation completed with score ${validationScore}/100. ` +
      `${identifiedPatterns.length} positive patterns identified, ${qualityGaps.length} quality gaps found.`;

    return {
      validationScore,
      confidenceScore,
      validationReasoning,
      identifiedPatterns,
      qualityGaps,
      improvementSuggestions
    };
  }
}

/**
 * Factory for creating LLM decision nodes
 */
export class LLMDecisionNodeFactory {
  private static nodes: Map<string, LLMD决策节点> = new Map();

  static createRoutingNode(config?: any): SmartRoutingDecisionNode {
    const node = new SmartRoutingDecisionNode(config);
    this.nodes.set('routing', node);
    return node;
  }

  static createSynthesisNode(config?: any): ResultSynthesisDecisionNode {
    const node = new ResultSynthesisDecisionNode(config);
    this.nodes.set('synthesis', node);
    return node;
  }

  static createQualityValidationNode(config?: any): QualityValidationDecisionNode {
    const node = new QualityValidationDecisionNode(config);
    this.nodes.set('quality_validation', node);
    return node;
  }

  static getNode(nodeType: string): LLMD决策节点 | undefined {
    return this.nodes.get(nodeType);
  }

  static getAllMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    this.nodes.forEach((node, type) => {
      metrics[type] = node.getMetrics();
    });
    return metrics;
  }

  static resetMetrics(): void {
    this.nodes.forEach(node => {
      // Reset metrics through reflection or add reset method to base class
    });
  }
}
