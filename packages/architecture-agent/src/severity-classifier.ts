/**
 * Severity Classification System
 * Classifies architectural violations by severity, impact, and priority
 */

import { logger } from './utils/logger.js';
import type {
  Finding,
  LayeringViolation,
  ImportBoundaryViolation,
  ArchitectureFinding,
  RefactorRecommendation
} from './types.js';

/**
 * Severity classification result
 */
export interface SeverityClassification {
  severity: 'critical' | 'high' | 'medium' | 'low';
  priority: number;
  urgency: 'immediate' | 'this-week' | 'this-sprint' | 'backlog';
  businessImpact: 'showstopper' | 'revenue-impacting' | 'technical-debt' | 'nice-to-have';
  riskLevel: 'extreme' | 'high' | 'moderate' | 'low';
  effortEstimate: {
    hours: number;
    teamSize: number;
    complexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  };
  reasoning: string[];
  recommendations: string[];
}

/**
 * Classification rule configuration
 */
export interface ClassificationRule {
  id: string;
  name: string;
  conditions: {
    violationType?: string[];
    architecturalImpact?: ('high' | 'medium' | 'low')[];
    refactorEffort?: ('low' | 'medium' | 'high')[];
    severity?: ('critical' | 'high' | 'medium' | 'low')[];
    filePatterns?: string[];
    customRules?: CustomRule[];
  };
  classification: Partial<SeverityClassification>;
  weight: number;
  enabled: boolean;
}

/**
 * Custom classification rule
 */
export interface CustomRule {
  property: string;
  operator: 'equals' | 'contains' | 'matches' | 'greater-than' | 'less-than';
  value: any;
  weight: number;
}

/**
 * Project context for severity assessment
 */
export interface ProjectContext {
  criticality: 'production' | 'staging' | 'development' | 'experimental';
  teamSize: number;
  deadlinePressure: 'high' | 'medium' | 'low';
  techDebtTolerance: 'low' | 'medium' | 'high';
  businessStage: 'startup' | 'growth' | 'mature' | 'enterprise';
  architecturalComplexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  dependencies: {
    internal: number;
    external: number;
    critical: number;
  };
}

/**
 * Severity Classifier
 */
export class SeverityClassifier {
  private rules: Map<string, ClassificationRule> = new Map();
  private defaultRules: ClassificationRule[] = [];
  private projectContext: ProjectContext;

  constructor(projectContext?: Partial<ProjectContext>) {
    this.projectContext = {
      criticality: 'production',
      teamSize: 5,
      deadlinePressure: 'medium',
      techDebtTolerance: 'medium',
      businessStage: 'growth',
      architecturalComplexity: 'moderate',
      dependencies: {
        internal: 10,
        external: 15,
        critical: 3
      },
      ...projectContext
    };

    this.initializeDefaultRules();
  }

  /**
   * Classify a finding by severity and impact
   */
  classify(finding: Finding): SeverityClassification {
    logger.debug(`Classifying finding: ${finding.ruleId} at ${finding.filePath}:${finding.line}`);

    const applicableRules = this.getApplicableRules(finding);
    const classifications = applicableRules.map(rule => this.applyRule(rule, finding));

    // Merge classifications using weighted scoring
    const merged = this.mergeClassifications(classifications);

    // Apply project context adjustments
    const contextAdjusted = this.applyProjectContext(merged, finding);

    // Add reasoning and recommendations
    const final = this.enrichClassification(contextAdjusted, finding);

    logger.debug(`Classification result: ${final.severity} (priority: ${final.priority})`);
    return final;
  }

  /**
   * Classify multiple findings and return sorted list
   */
  classifyAll(findings: Finding[]): SeverityClassification[] {
    const classifications = findings.map(finding => this.classify(finding));

    // Sort by priority (higher first) and then by severity
    return classifications.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Get rules that apply to a specific finding
   */
  private getApplicableRules(finding: Finding): ClassificationRule[] {
    const applicable: ClassificationRule[] = [];

    for (const rule of this.defaultRules) {
      if (!rule.enabled) continue;

      if (this.ruleMatches(rule, finding)) {
        applicable.push(rule);
      }
    }

    // Add custom rules from the rules map
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (this.ruleMatches(rule, finding)) {
        applicable.push(rule);
      }
    }

    // Sort by weight (higher weight = higher priority)
    return applicable.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Check if a rule matches a finding
   */
  private ruleMatches(rule: ClassificationRule, finding: Finding): boolean {
    const { conditions } = rule;

    // Check violation type
    if (conditions.violationType && !conditions.violationType.includes(finding.ruleId)) {
      return false;
    }

    // Check architectural impact
    if (conditions.architecturalImpact &&
        finding.architecturalImpact &&
        !conditions.architecturalImpact.includes(finding.architecturalImpact)) {
      return false;
    }

    // Check refactor effort
    if (conditions.refactorEffort &&
        finding.refactorEffort &&
        !conditions.refactorEffort.includes(finding.refactorEffort)) {
      return false;
    }

    // Check existing severity
    if (conditions.severity && !conditions.severity.includes(finding.severity)) {
      return false;
    }

    // Check file patterns
    if (conditions.filePatterns) {
      const matches = conditions.filePatterns.some(pattern =>
        this.pathMatchesPattern(finding.filePath, pattern)
      );
      if (!matches) return false;
    }

    // Check custom rules
    if (conditions.customRules) {
      for (const customRule of conditions.customRules) {
        if (!this.evaluateCustomRule(customRule, finding)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Apply a classification rule to a finding
   */
  private applyRule(rule: ClassificationRule, finding: Finding): SeverityClassification {
    const baseClassification: SeverityClassification = {
      severity: 'medium',
      priority: 50,
      urgency: 'this-sprint',
      businessImpact: 'technical-debt',
      riskLevel: 'moderate',
      effortEstimate: {
        hours: 8,
        teamSize: 1,
        complexity: 'moderate'
      },
      reasoning: [],
      recommendations: [],
      ...rule.classification
    };

    // Adjust severity based on rule weight
    baseClassification.priority += rule.weight;

    return baseClassification;
  }

  /**
   * Merge multiple classifications using weighted averaging
   */
  private mergeClassifications(classifications: SeverityClassification[]): SeverityClassification {
    if (classifications.length === 0) {
      return this.getDefaultClassification();
    }

    if (classifications.length === 1) {
      return classifications[0];
    }

    // Weighted average for numeric values
    const totalWeight = classifications.reduce((sum, c) => sum + c.priority, 0);
    const avgPriority = Math.round(classifications.reduce((sum, c) => sum + c.priority * c.priority, 0) / totalWeight);

    const avgHours = Math.round(classifications.reduce((sum, c) => sum + c.effortEstimate.hours * c.priority, 0) / totalWeight);
    const avgTeamSize = Math.round(classifications.reduce((sum, c) => sum + c.effortEstimate.teamSize * c.priority, 0) / totalWeight);

    // Find most common categorical values
    const severityCounts = this.countValues(classifications.map(c => c.severity));
    const urgencyCounts = this.countValues(classifications.map(c => c.urgency));
    const impactCounts = this.countValues(classifications.map(c => c.businessImpact));
    const riskCounts = this.countValues(classifications.map(c => c.riskLevel));
    const complexityCounts = this.countValues(classifications.map(c => c.effortEstimate.complexity));

    // Combine reasoning and recommendations
    const reasoning = [...new Set(classifications.flatMap(c => c.reasoning))];
    const recommendations = [...new Set(classifications.flatMap(c => c.recommendations))];

    return {
      severity: this.getMostCommonValue(severityCounts) as any,
      priority: avgPriority,
      urgency: this.getMostCommonValue(urgencyCounts) as any,
      businessImpact: this.getMostCommonValue(impactCounts) as any,
      riskLevel: this.getMostCommonValue(riskCounts) as any,
      effortEstimate: {
        hours: avgHours,
        teamSize: avgTeamSize,
        complexity: this.getMostCommonValue(complexityCounts) as any
      },
      reasoning,
      recommendations
    };
  }

  /**
   * Apply project context adjustments
   */
  private applyProjectContext(classification: SeverityClassification, finding: Finding): SeverityClassification {
    const adjusted = { ...classification };

    // Adjust based on project criticality
    if (this.projectContext.criticality === 'production') {
      adjusted.priority += 20;
      if (adjusted.severity === 'medium') adjusted.severity = 'high';
      if (adjusted.urgency === 'backlog') adjusted.urgency = 'this-sprint';
    }

    // Adjust based on team size
    if (this.projectContext.teamSize < 3) {
      adjusted.effortEstimate.hours *= 1.5;
      adjusted.priority += 10; // Small teams get priority boost
    }

    // Adjust based on deadline pressure
    if (this.projectContext.deadlinePressure === 'high') {
      adjusted.priority += 15;
      adjusted.effortEstimate.hours *= 0.8; // Under pressure, optimize for speed
    }

    // Adjust based on tech debt tolerance
    if (this.projectContext.techDebtTolerance === 'low') {
      adjusted.priority += 25;
      if (adjusted.severity === 'low') adjusted.severity = 'medium';
    }

    // Adjust based on business stage
    if (this.projectContext.businessStage === 'startup') {
      adjusted.effortEstimate.hours *= 0.7; // Move faster
      adjusted.priority += 10;
    }

    // Adjust based on architectural complexity
    if (this.projectContext.architecturalComplexity === 'very-complex') {
      adjusted.effortEstimate.hours *= 1.3;
      adjusted.riskLevel = this.increaseRiskLevel(adjusted.riskLevel) as any;
    }

    return adjusted;
  }

  /**
   * Enrich classification with reasoning and recommendations
   */
  private enrichClassification(classification: SeverityClassification, finding: Finding): SeverityClassification {
    const enriched = { ...classification };

    // Add reasoning based on finding properties
    const reasoning: string[] = [];

    if (finding.severity === 'critical') {
      reasoning.push('Critical violation detected - requires immediate attention');
    }

    if (finding.architecturalImpact === 'high') {
      reasoning.push('High architectural impact - affects system design and maintainability');
    }

    if (finding.refactorEffort === 'high') {
      reasoning.push('High refactor effort - requires significant planning and resources');
    }

    // Add specific reasoning based on violation type
    if (finding.ruleId === 'LAYERING_VIOLATION') {
      const layerViolation = finding as LayeringViolation;
      reasoning.push(`Layering violation: ${layerViolation.fromLayer} → ${layerViolation.toLayer}`);

      if (layerViolation.fromLayer === 'infrastructure' && layerViolation.toLayer === 'presentation') {
        reasoning.push('Dependency inversion violation - infrastructure should not depend on presentation');
        enriched.businessImpact = 'revenue-impacting';
      }
    }

    if (finding.ruleId === 'IMPORT_BOUNDARY_VIOLATION') {
      const importViolation = finding as ImportBoundaryViolation;
      reasoning.push(`Import boundary violation: ${importViolation.violationType}`);

      if (importViolation.violationType === 'external_dependency') {
        reasoning.push(`Forbidden external dependency: ${importViolation.importModule}`);
      }
    }

    // Add project context reasoning
    if (this.projectContext.criticality === 'production') {
      reasoning.push('Production environment - stability and reliability are paramount');
    }

    if (this.projectContext.deadlinePressure === 'high') {
      reasoning.push('High deadline pressure - consider impact on delivery timeline');
    }

    enriched.reasoning = reasoning;

    // Add recommendations
    const recommendations: string[] = [];

    if (classification.severity === 'critical') {
      recommendations.push('Address immediately - consider rollback if recently introduced');
      recommendations.push('Involve senior architects and team leads');
    }

    if (classification.urgency === 'immediate') {
      recommendations.push('Create hotfix or emergency deployment plan');
    }

    if (classification.effortEstimate.hours > 24) {
      recommendations.push('Break down into smaller, manageable tasks');
      recommendations.push('Consider temporary workarounds if blocking other work');
    }

    if (classification.riskLevel === 'extreme') {
      recommendations.push('Implement comprehensive testing before deployment');
      recommendations.push('Consider blue-green deployment strategy');
    }

    enriched.recommendations = recommendations;

    return enriched;
  }

  /**
   * Initialize default classification rules
   */
  private initializeDefaultRules(): void {
    this.defaultRules = [
      // Critical violations
      {
        id: 'critical-layering-violations',
        name: 'Critical Layering Violations',
        conditions: {
          violationType: ['LAYERING_VIOLATION'],
          architecturalImpact: ['high'],
          severity: ['critical']
        },
        classification: {
          severity: 'critical',
          priority: 90,
          urgency: 'immediate',
          businessImpact: 'revenue-impacting',
          riskLevel: 'extreme',
          effortEstimate: {
            hours: 16,
            teamSize: 2,
            complexity: 'complex'
          }
        },
        weight: 30,
        enabled: true
      },

      // High severity layer violations
      {
        id: 'high-severity-layering',
        name: 'High Severity Layering Violations',
        conditions: {
          violationType: ['LAYERING_VIOLATION'],
          architecturalImpact: ['high', 'medium'],
          severity: ['high']
        },
        classification: {
          severity: 'high',
          priority: 70,
          urgency: 'this-week',
          businessImpact: 'technical-debt',
          riskLevel: 'high',
          effortEstimate: {
            hours: 12,
            teamSize: 2,
            complexity: 'moderate'
          }
        },
        weight: 25,
        enabled: true
      },

      // Forbidden external dependencies
      {
        id: 'forbidden-external-deps',
        name: 'Forbidden External Dependencies',
        conditions: {
          violationType: ['IMPORT_BOUNDARY_VIOLATION'],
          customRules: [
            {
              property: 'violationType',
              operator: 'equals',
              value: 'external_dependency',
              weight: 20
            }
          ]
        },
        classification: {
          severity: 'high',
          priority: 60,
          urgency: 'this-sprint',
          businessImpact: 'technical-debt',
          riskLevel: 'moderate',
          effortEstimate: {
            hours: 8,
            teamSize: 1,
            complexity: 'moderate'
          }
        },
        weight: 20,
        enabled: true
      },

      // Critical file patterns
      {
        id: 'critical-files',
        name: 'Critical Files Violations',
        conditions: {
          filePatterns: ['src/core/**', 'src/domain/**', 'src/infrastructure/database/**']
        },
        classification: {
          severity: 'high',
          priority: 65,
          urgency: 'this-week',
          businessImpact: 'revenue-impacting',
          riskLevel: 'high',
          effortEstimate: {
            hours: 16,
            teamSize: 2,
            complexity: 'complex'
          }
        },
        weight: 25,
        enabled: true
      },

      // Medium severity violations
      {
        id: 'medium-severity',
        name: 'Medium Severity Violations',
        conditions: {
          architecturalImpact: ['medium'],
          severity: ['medium']
        },
        classification: {
          severity: 'medium',
          priority: 40,
          urgency: 'this-sprint',
          businessImpact: 'technical-debt',
          riskLevel: 'moderate',
          effortEstimate: {
            hours: 6,
            teamSize: 1,
            complexity: 'moderate'
          }
        },
        weight: 15,
        enabled: true
      },

      // Low severity violations
      {
        id: 'low-severity',
        name: 'Low Severity Violations',
        conditions: {
          architecturalImpact: ['low'],
          severity: ['low']
        },
        classification: {
          severity: 'low',
          priority: 20,
          urgency: 'backlog',
          businessImpact: 'nice-to-have',
          riskLevel: 'low',
          effortEstimate: {
            hours: 4,
            teamSize: 1,
            complexity: 'simple'
          }
        },
        weight: 10,
        enabled: true
      }
    ];

    logger.debug(`Initialized ${this.defaultRules.length} default classification rules`);
  }

  /**
   * Get default classification
   */
  private getDefaultClassification(): SeverityClassification {
    return {
      severity: 'medium',
      priority: 50,
      urgency: 'this-sprint',
      businessImpact: 'technical-debt',
      riskLevel: 'moderate',
      effortEstimate: {
        hours: 8,
        teamSize: 1,
        complexity: 'moderate'
      },
      reasoning: ['Default classification applied'],
      recommendations: ['Review and prioritize based on project context']
    };
  }

  /**
   * Evaluate custom rule
   */
  private evaluateCustomRule(rule: CustomRule, finding: Finding): boolean {
    const value = (finding as any)[rule.property];

    switch (rule.operator) {
      case 'equals':
        return value === rule.value;
      case 'contains':
        return typeof value === 'string' && value.includes(rule.value);
      case 'matches':
        return typeof value === 'string' && new RegExp(rule.value).test(value);
      case 'greater-than':
        return typeof value === 'number' && value > rule.value;
      case 'less-than':
        return typeof value === 'number' && value < rule.value;
      default:
        return false;
    }
  }

  /**
   * Check if path matches pattern
   */
  private pathMatchesPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*\*/g, '🔥DOUBLESTAR🔥')
      .replace(/\*/g, '[^/]*')
      .replace(/🔥DOUBLESTAR🔥/g, '.*')
      .replace(/\?/g, '[^/]');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * Count occurrences of values
   */
  private countValues(values: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const value of values) {
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get most common value from counts
   */
  private getMostCommonValue(counts: Record<string, number>): string {
    const entries = Object.entries(counts);
    if (entries.length === 0) return 'medium';

    const result = entries.reduce((max, [value, count]) =>
      count > max.count ? { value, count } : max,
      { value: 'medium', count: 0 }
    );

    return result.value;
  }

  /**
   * Increase risk level
   */
  private increaseRiskLevel(current: string): string {
    const levels = ['low', 'moderate', 'high', 'extreme'];
    const currentIndex = levels.indexOf(current);
    return levels[Math.min(currentIndex + 1, levels.length - 1)];
  }

  /**
   * Add custom classification rule
   */
  addRule(rule: ClassificationRule): void {
    this.rules.set(rule.id, rule);
    logger.debug(`Added custom classification rule: ${rule.name}`);
  }

  /**
   * Remove classification rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    logger.debug(`Removed classification rule: ${ruleId}`);
  }

  /**
   * Get classification statistics
   */
  getStatistics(classifications: SeverityClassification[]): {
    total: number;
    bySeverity: Record<string, number>;
    byUrgency: Record<string, number>;
    byImpact: Record<string, number>;
    avgPriority: number;
    totalHours: number;
  } {
    const stats = {
      total: classifications.length,
      bySeverity: {} as Record<string, number>,
      byUrgency: {} as Record<string, number>,
      byImpact: {} as Record<string, number>,
      avgPriority: 0,
      totalHours: 0
    };

    if (classifications.length === 0) return stats;

    for (const classification of classifications) {
      stats.bySeverity[classification.severity] = (stats.bySeverity[classification.severity] || 0) + 1;
      stats.byUrgency[classification.urgency] = (stats.byUrgency[classification.urgency] || 0) + 1;
      stats.byImpact[classification.businessImpact] = (stats.byImpact[classification.businessImpact] || 0) + 1;
      stats.totalHours += classification.effortEstimate.hours;
    }

    stats.avgPriority = Math.round(
      classifications.reduce((sum, c) => sum + c.priority, 0) / classifications.length
    );

    return stats;
  }

  /**
   * Update project context
   */
  updateProjectContext(context: Partial<ProjectContext>): void {
    this.projectContext = { ...this.projectContext, ...context };
    logger.info('Updated project context for severity classification');
  }

  /**
   * Get current project context
   */
  getProjectContext(): ProjectContext {
    return { ...this.projectContext };
  }
}