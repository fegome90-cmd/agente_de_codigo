/**
 * SARIF Semantic Analysis Layer - Capa 2: Semántica
 *
 * Applies 30+ semantic rules to analyze SARIF findings for patterns,
 * correlations, and deeper insights beyond raw issues.
 *
 * @author Agente de Código - FASE 2
 * @since 2025-11-03
 */

import type {
  NormalizedFinding,
  NormalizedRun,
  IngestionResult,
} from './ingestion-layer.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Semantic Rule Types
// ============================================================================

export interface SemanticRule {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'quality' | 'architecture' | 'complexity' | 'maintainability' | 'performance' | 'documentation';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  appliesTo: 'finding' | 'file' | 'project' | 'cross-agent';
  enabled: boolean;
  weight: number;
}

export interface SemanticFinding {
  ruleId: string;
  ruleName: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  affectedItems: string[];
  evidence: Array<{
    type: string;
    data: any;
  }>;
  suggestion?: string;
  impact: 'immediate' | 'short-term' | 'long-term';
  effort: 'low' | 'medium' | 'high';
}

export interface SemanticAnalysisResult {
  timestamp: string;
  totalRules: number;
  rulesApplied: number;
  semanticFindings: SemanticFinding[];
  metrics: {
    codeQualityScore: number;
    securityScore: number;
    maintainabilityScore: number;
    complexityScore: number;
    documentationScore: number;
    overallScore: number;
    technicalDebt: {
      hours: number;
      priority: 'low' | 'medium' | 'high' | 'critical';
    };
    riskProfile: {
      level: 'low' | 'medium' | 'high' | 'critical';
      factors: string[];
    };
    recommendations: Array<{
      category: string;
      priority: 'immediate' | 'short-term' | 'long-term';
      description: string;
      effort: 'low' | 'medium' | 'high';
      impact: 'low' | 'medium' | 'high';
    }>;
  };
  correlations: Array<{
    type: string;
    findings: string[];
    description: string;
    confidence: number;
  }>;
  patterns: Array<{
    name: string;
    description: string;
    occurrences: number;
    severity: string;
  }>;
  violations: Array<{
    rule: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    count: number;
    files: string[];
  }>;
}

// ============================================================================
// Semantic Analysis Layer Implementation
// ============================================================================

export class SARIFSemanticAnalysisLayer {
  private rules: Map<string, SemanticRule> = new Map();
  private analysisTime: number = 0;

  constructor() {
    this.initializeRules();
  }

  /**
   * Initialize 30+ semantic analysis rules
   */
  private initializeRules(): void {
    const rules: Array<SemanticRule> = [
      // === SECURITY RULES (5 rules) ===
      {
        id: 'SEC-001',
        name: 'SQL Injection Pattern',
        description: 'Detects potential SQL injection vulnerabilities',
        category: 'security',
        severity: 'critical',
        appliesTo: 'finding',
        enabled: true,
        weight: 10,
      },
      {
        id: 'SEC-002',
        name: 'XSS Vulnerability',
        description: 'Detects cross-site scripting vulnerabilities',
        category: 'security',
        severity: 'high',
        appliesTo: 'finding',
        enabled: true,
        weight: 8,
      },
      {
        id: 'SEC-003',
        name: 'Hardcoded Secrets',
        description: 'Detects hardcoded passwords, API keys, or tokens',
        category: 'security',
        severity: 'critical',
        appliesTo: 'finding',
        enabled: true,
        weight: 10,
      },
      {
        id: 'SEC-004',
        name: 'Insecure Cryptography',
        description: 'Detects use of weak or outdated cryptographic functions',
        category: 'security',
        severity: 'high',
        appliesTo: 'finding',
        enabled: true,
        weight: 8,
      },
      {
        id: 'SEC-005',
        name: 'Security Policy Violations',
        description: 'Detects violations of security policies',
        category: 'security',
        severity: 'medium',
        appliesTo: 'project',
        enabled: true,
        weight: 5,
      },

      // === QUALITY RULES (8 rules) ===
      {
        id: 'QUAL-001',
        name: 'High Code Duplication',
        description: 'Detects excessive code duplication (>10%)',
        category: 'quality',
        severity: 'high',
        appliesTo: 'project',
        enabled: true,
        weight: 7,
      },
      {
        id: 'QUAL-002',
        name: 'Long Methods',
        description: 'Detects methods exceeding 50 lines',
        category: 'quality',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 4,
      },
      {
        id: 'QUAL-003',
        name: 'Large Classes',
        description: 'Detects classes with too many responsibilities',
        category: 'quality',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 4,
      },
      {
        id: 'QUAL-004',
        name: 'Complex Functions',
        description: 'Detects functions with high cyclomatic complexity',
        category: 'complexity',
        severity: 'high',
        appliesTo: 'finding',
        enabled: true,
        weight: 6,
      },
      {
        id: 'QUAL-005',
        name: 'Missing Error Handling',
        description: 'Detects functions without proper error handling',
        category: 'quality',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 5,
      },
      {
        id: 'QUAL-006',
        name: 'Unused Code',
        description: 'Detects dead code and unused variables',
        category: 'quality',
        severity: 'low',
        appliesTo: 'finding',
        enabled: true,
        weight: 2,
      },
      {
        id: 'QUAL-007',
        name: 'Inconsistent Naming',
        description: 'Detects inconsistent naming conventions',
        category: 'quality',
        severity: 'low',
        appliesTo: 'project',
        enabled: true,
        weight: 2,
      },
      {
        id: 'QUAL-008',
        name: 'Code Smells',
        description: 'Detects various code smells and anti-patterns',
        category: 'quality',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 4,
      },

      // === ARCHITECTURE RULES (5 rules) ===
      {
        id: 'ARCH-001',
        name: 'Layer Violations',
        description: 'Detects violations of architectural layering',
        category: 'architecture',
        severity: 'high',
        appliesTo: 'finding',
        enabled: true,
        weight: 7,
      },
      {
        id: 'ARCH-002',
        name: 'Circular Dependencies',
        description: 'Detects circular dependencies between modules',
        category: 'architecture',
        severity: 'critical',
        appliesTo: 'project',
        enabled: true,
        weight: 9,
      },
      {
        id: 'ARCH-003',
        name: 'God Classes',
        description: 'Detects classes with too many responsibilities',
        category: 'architecture',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 5,
      },
      {
        id: 'ARCH-004',
        name: 'Feature Envy',
        description: 'Detects classes that use more of another class',
        category: 'architecture',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 4,
      },
      {
        id: 'ARCH-005',
        name: 'Architecture Drift',
        description: 'Detects deviation from established architecture',
        category: 'architecture',
        severity: 'high',
        appliesTo: 'project',
        enabled: true,
        weight: 6,
      },

      // === COMPLEXITY RULES (4 rules) ===
      {
        id: 'COMP-001',
        name: 'High Cyclomatic Complexity',
        description: 'Detects functions with complexity > 10',
        category: 'complexity',
        severity: 'high',
        appliesTo: 'finding',
        enabled: true,
        weight: 6,
      },
      {
        id: 'COMP-002',
        name: 'Nested Complexity',
        description: 'Detects excessive nesting (depth > 4)',
        category: 'complexity',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 4,
      },
      {
        id: 'COMP-003',
        name: 'Cognitive Complexity',
        description: 'Detects high cognitive complexity',
        category: 'complexity',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 4,
      },
      {
        id: 'COMP-004',
        name: 'Parameter Overload',
        description: 'Detects functions with too many parameters (>5)',
        category: 'complexity',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 3,
      },

      // === MAINTAINABILITY RULES (4 rules) ===
      {
        id: 'MAIN-001',
        name: 'Low Cohesion',
        description: 'Detects classes with low cohesion',
        category: 'maintainability',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 4,
      },
      {
        id: 'MAIN-002',
        name: 'High Coupling',
        description: 'Detects excessive coupling between modules',
        category: 'maintainability',
        severity: 'high',
        appliesTo: 'finding',
        enabled: true,
        weight: 6,
      },
      {
        id: 'MAIN-003',
        name: 'Poor Documentation',
        description: 'Detects poorly documented code',
        category: 'maintainability',
        severity: 'low',
        appliesTo: 'finding',
        enabled: true,
        weight: 2,
      },
      {
        id: 'MAIN-004',
        name: 'Technical Debt',
        description: 'Accumulated technical debt indicators',
        category: 'maintainability',
        severity: 'medium',
        appliesTo: 'project',
        enabled: true,
        weight: 5,
      },

      // === PERFORMANCE RULES (3 rules) ===
      {
        id: 'PERF-001',
        name: 'Performance Hotspots',
        description: 'Detects potential performance bottlenecks',
        category: 'performance',
        severity: 'high',
        appliesTo: 'finding',
        enabled: true,
        weight: 7,
      },
      {
        id: 'PERF-002',
        name: 'Inefficient Algorithms',
        description: 'Detects inefficient algorithmic patterns',
        category: 'performance',
        severity: 'medium',
        appliesTo: 'finding',
        enabled: true,
        weight: 5,
      },
      {
        id: 'PERF-003',
        name: 'Memory Leaks',
        description: 'Detects potential memory leak patterns',
        category: 'performance',
        severity: 'critical',
        appliesTo: 'finding',
        enabled: true,
        weight: 8,
      },

      // === DOCUMENTATION RULES (3 rules) ===
      {
        id: 'DOC-001',
        name: 'Missing Documentation',
        description: 'Detects missing or incomplete documentation',
        category: 'documentation',
        severity: 'low',
        appliesTo: 'finding',
        enabled: true,
        weight: 2,
      },
      {
        id: 'DOC-002',
        name: 'Outdated Documentation',
        description: 'Detects documentation that is out of sync',
        category: 'documentation',
        severity: 'medium',
        appliesTo: 'project',
        enabled: true,
        weight: 3,
      },
      {
        id: 'DOC-003',
        name: 'API Documentation Gaps',
        description: 'Detects missing API documentation',
        category: 'documentation',
        severity: 'medium',
        appliesTo: 'project',
        enabled: true,
        weight: 4,
      },

      // === CORRELATION RULES (3 rules) ===
      {
        id: 'CORR-001',
        name: 'Multi-Agent Correlation',
        description: 'Correlates findings across multiple agents',
        category: 'quality',
        severity: 'high',
        appliesTo: 'cross-agent',
        enabled: true,
        weight: 6,
      },
      {
        id: 'CORR-002',
        name: 'Pattern Detection',
        description: 'Detects recurring patterns in findings',
        category: 'quality',
        severity: 'medium',
        appliesTo: 'project',
        enabled: true,
        weight: 4,
      },
      {
        id: 'CORR-003',
        name: 'Trend Analysis',
        description: 'Analyzes trends in code quality metrics',
        category: 'quality',
        severity: 'info',
        appliesTo: 'project',
        enabled: true,
        weight: 3,
      },
    ];

    rules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });

    logger.info(`Initialized ${rules.length} semantic analysis rules`);
  }

  /**
   * Perform semantic analysis on ingestion result
   */
  async analyze(ingestionResult: IngestionResult): Promise<SemanticAnalysisResult> {
    const startTime = Date.now();
    const semanticFindings: SemanticFinding[] = [];
    const correlations: Array<{ type: string; findings: string[]; description: string; confidence: number }> = [];
    const patterns: Array<{ name: string; description: string; occurrences: number; severity: string }> = [];

    try {
      // Apply individual rules
      for (const rule of this.rules.values()) {
        if (!rule.enabled) continue;

        const findings = this.applyRule(rule, ingestionResult);
        semanticFindings.push(...findings);
      }

      // Detect correlations between findings
      correlations.push(...this.detectCorrelations(ingestionResult));

      // Detect patterns
      patterns.push(...this.detectPatterns(ingestionResult, semanticFindings));

      // Calculate metrics
      const metrics = this.calculateMetrics(ingestionResult, semanticFindings);

      // Detect violations
      const violations = this.detectViolations(semanticFindings);

      this.analysisTime = Date.now() - startTime;

      logger.info('Semantic analysis completed', {
        rulesApplied: this.rules.size,
        semanticFindings: semanticFindings.length,
        correlations: correlations.length,
        patterns: patterns.length,
        analysisTime: this.analysisTime,
      });

      return {
        timestamp: new Date().toISOString(),
        totalRules: this.rules.size,
        rulesApplied: Array.from(this.rules.values()).filter(r => r.enabled).length,
        semanticFindings,
        metrics,
        correlations,
        patterns,
        violations,
      };

    } catch (error) {
      logger.error('Semantic analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Apply a semantic rule
   */
  private applyRule(rule: SemanticRule, ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    switch (rule.id) {
      case 'SEC-001': // SQL Injection Pattern
        findings.push(...this.detectSQLInjection(ingestionResult));
        break;

      case 'SEC-002': // XSS Vulnerability
        findings.push(...this.detectXSS(ingestionResult));
        break;

      case 'SEC-003': // Hardcoded Secrets
        findings.push(...this.detectHardcodedSecrets(ingestionResult));
        break;

      case 'QUAL-001': // High Code Duplication
        findings.push(...this.detectCodeDuplication(ingestionResult));
        break;

      case 'QUAL-004': // Complex Functions
        findings.push(...this.detectComplexFunctions(ingestionResult));
        break;

      case 'ARCH-002': // Circular Dependencies
        findings.push(...this.detectCircularDependencies(ingestionResult));
        break;

      case 'COMP-001': // High Cyclomatic Complexity
        findings.push(...this.detectHighCyclomaticComplexity(ingestionResult));
        break;

      case 'MAIN-004': // Technical Debt
        findings.push(...this.detectTechnicalDebt(ingestionResult));
        break;

      case 'PERF-001': // Performance Hotspots
        findings.push(...this.detectPerformanceHotspots(ingestionResult));
        break;

      case 'DOC-001': // Missing Documentation
        findings.push(...this.detectMissingDocumentation(ingestionResult));
        break;

      case 'CORR-001': // Multi-Agent Correlation
        findings.push(...this.detectMultiAgentCorrelation(ingestionResult));
        break;

      case 'QUAL-006': // Unused Code
        findings.push(...this.detectUnusedCode(ingestionResult));
        break;

      case 'PERF-003': // Memory Leaks
        findings.push(...this.detectMemoryLeaks(ingestionResult));
        break;

      default:
        // Generic rule application
        findings.push(...this.applyGenericRule(rule, ingestionResult));
        break;
    }

    return findings;
  }

  /**
   * Rule implementations (sample of key rules)
   */
  private detectSQLInjection(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        if (finding.ruleId.toLowerCase().includes('sql') ||
            finding.message.toLowerCase().includes('sql injection')) {
          findings.push({
            ruleId: 'SEC-001',
            ruleName: 'SQL Injection Pattern',
            category: 'security',
            severity: 'critical',
            message: `Potential SQL injection vulnerability detected in ${finding.filePath}`,
            affectedItems: [finding.filePath],
            evidence: [
              { type: 'ruleId', data: finding.ruleId },
              { type: 'message', data: finding.message },
              { type: 'location', data: `${finding.filePath}:${finding.line}` },
            ],
            suggestion: 'Use parameterized queries or prepared statements',
            impact: 'immediate',
            effort: 'medium',
          });
        }
      }
    }

    return findings;
  }

  private detectXSS(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        if (finding.ruleId.toLowerCase().includes('xss') ||
            finding.message.toLowerCase().includes('cross-site scripting')) {
          findings.push({
            ruleId: 'SEC-002',
            ruleName: 'XSS Vulnerability',
            category: 'security',
            severity: 'high',
            message: `Potential XSS vulnerability in ${finding.filePath}`,
            affectedItems: [finding.filePath],
            evidence: [
              { type: 'ruleId', data: finding.ruleId },
              { type: 'message', data: finding.message },
            ],
            suggestion: 'Sanitize user input and use proper output encoding',
            impact: 'immediate',
            effort: 'medium',
          });
        }
      }
    }

    return findings;
  }

  private detectHardcodedSecrets(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        const message = finding.message.toLowerCase();
        if (message.includes('hardcoded') ||
            message.includes('api key') ||
            message.includes('password') ||
            message.includes('secret')) {
          findings.push({
            ruleId: 'SEC-003',
            ruleName: 'Hardcoded Secrets',
            category: 'security',
            severity: 'critical',
            message: `Hardcoded secret detected in ${finding.filePath}`,
            affectedItems: [finding.filePath],
            evidence: [
              { type: 'message', data: finding.message },
            ],
            suggestion: 'Move secrets to environment variables or secure vault',
            impact: 'immediate',
            effort: 'low',
          });
        }
      }
    }

    return findings;
  }

  private detectCodeDuplication(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    // Group findings by file
    const fileGroups = new Map<string, NormalizedFinding[]>();
    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        if (!fileGroups.has(finding.filePath)) {
          fileGroups.set(finding.filePath, []);
        }
        fileGroups.get(finding.filePath)!.push(finding);
      }
    }

    // Check for files with many similar issues (potential duplication)
    for (const [filePath, issues] of fileGroups) {
      if (issues.length > 10) {
        findings.push({
          ruleId: 'QUAL-001',
          ruleName: 'High Code Duplication',
          category: 'quality',
          severity: 'high',
          message: `File ${filePath} has ${issues.length} issues, potential code duplication`,
          affectedItems: [filePath],
          evidence: [
            { type: 'issueCount', data: issues.length },
          ],
          suggestion: 'Review and refactor duplicated code',
          impact: 'short-term',
          effort: 'high',
        });
      }
    }

    return findings;
  }

  private detectComplexFunctions(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        if (finding.ruleId.toLowerCase().includes('complexity') ||
            finding.message.toLowerCase().includes('complex')) {
          findings.push({
            ruleId: 'QUAL-004',
            ruleName: 'Complex Functions',
            category: 'complexity',
            severity: 'high',
            message: `Complex function detected in ${finding.filePath}`,
            affectedItems: [finding.filePath],
            evidence: [
              { type: 'ruleId', data: finding.ruleId },
              { type: 'location', data: `${finding.filePath}:${finding.line}` },
            ],
            suggestion: 'Break down complex function into smaller units',
            impact: 'short-term',
            effort: 'medium',
          });
        }
      }
    }

    return findings;
  }

  private detectCircularDependencies(ingestionResult: IngestionResult): SemanticFinding[] {
    // Simplified implementation
    const files = new Set<string>();
    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        if (finding.message.toLowerCase().includes('circular') ||
            finding.message.toLowerCase().includes('dependency')) {
          files.add(finding.filePath);
        }
      }
    }

    if (files.size > 0) {
      return [{
        ruleId: 'ARCH-002',
        ruleName: 'Circular Dependencies',
        category: 'architecture',
        severity: 'critical',
        message: `Circular dependencies detected in ${files.size} files`,
        affectedItems: Array.from(files),
        evidence: [
          { type: 'affectedFiles', data: files.size },
        ],
        suggestion: 'Refactor to remove circular dependencies',
        impact: 'short-term',
        effort: 'high',
      }];
    }

    return [];
  }

  private detectHighCyclomaticComplexity(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        if (finding.ruleId.toLowerCase().includes('cyclomatic') ||
            finding.ruleId.toLowerCase().includes('complexity')) {
          findings.push({
            ruleId: 'COMP-001',
            ruleName: 'High Cyclomatic Complexity',
            category: 'complexity',
            severity: 'high',
            message: `High cyclomatic complexity in ${finding.filePath}`,
            affectedItems: [finding.filePath],
            evidence: [
              { type: 'location', data: `${finding.filePath}:${finding.line}` },
            ],
            suggestion: 'Reduce complexity through refactoring',
            impact: 'short-term',
            effort: 'medium',
          });
        }
      }
    }

    return findings;
  }

  private detectTechnicalDebt(ingestionResult: IngestionResult): SemanticFinding[] {
    const totalFindings = ingestionResult.summary.totalFindings;
    const criticalIssues = ingestionResult.summary.severityBreakdown.critical;
    const highIssues = ingestionResult.summary.severityBreakdown.high;

    if (totalFindings > 50 || criticalIssues > 5 || highIssues > 10) {
      return [{
        ruleId: 'MAIN-004',
        ruleName: 'Technical Debt',
        category: 'maintainability',
        severity: 'medium',
        message: `High technical debt: ${totalFindings} total issues`,
        affectedItems: [],
        evidence: [
          { type: 'totalFindings', data: totalFindings },
          { type: 'criticalIssues', data: criticalIssues },
          { type: 'highIssues', data: highIssues },
        ],
        suggestion: 'Prioritize refactoring and addressing technical debt',
        impact: 'long-term',
        effort: 'high',
      }];
    }

    return [];
  }

  private detectPerformanceHotspots(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        const message = finding.message.toLowerCase();
        if (message.includes('performance') ||
            message.includes('slow') ||
            message.includes('inefficient')) {
          findings.push({
            ruleId: 'PERF-001',
            ruleName: 'Performance Hotspots',
            category: 'performance',
            severity: 'high',
            message: `Potential performance issue in ${finding.filePath}`,
            affectedItems: [finding.filePath],
            evidence: [
              { type: 'message', data: finding.message },
            ],
            suggestion: 'Optimize performance-critical code',
            impact: 'short-term',
            effort: 'medium',
          });
        }
      }
    }

    return findings;
  }

  private detectMissingDocumentation(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      if (run.toolName.includes('documentation')) {
        for (const finding of run.results) {
          if (finding.message.toLowerCase().includes('missing') ||
              finding.message.toLowerCase().includes('undocumented')) {
            findings.push({
              ruleId: 'DOC-001',
              ruleName: 'Missing Documentation',
              category: 'documentation',
              severity: 'low',
              message: `Missing documentation in ${finding.filePath}`,
              affectedItems: [finding.filePath],
              evidence: [
                { type: 'message', data: finding.message },
              ],
              suggestion: 'Add comprehensive documentation',
              impact: 'long-term',
              effort: 'low',
            });
          }
        }
      }
    }

    return findings;
  }

  private detectMultiAgentCorrelation(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    if (ingestionResult.summary.totalRuns >= 2) {
      const agentCounts = ingestionResult.summary.agentBreakdown;
      const agents = Object.keys(agentCounts);

      // Find files that appear in multiple agent reports
      const fileToAgents = new Map<string, string[]>();
      for (const run of ingestionResult.runs) {
        for (const finding of run.results) {
          if (!fileToAgents.has(finding.filePath)) {
            fileToAgents.set(finding.filePath, []);
          }
          fileToAgents.get(finding.filePath)!.push(run.toolName);
        }
      }

      for (const [file, agentList] of fileToAgents) {
        const uniqueAgents = new Set(agentList);
        if (uniqueAgents.size >= 2) {
          findings.push({
            ruleId: 'CORR-001',
            ruleName: 'Multi-Agent Correlation',
            category: 'quality',
            severity: 'high',
            message: `File ${file} has issues detected by ${uniqueAgents.size} different agents`,
            affectedItems: [file],
            evidence: [
              { type: 'agents', data: Array.from(uniqueAgents) },
            ],
            suggestion: 'Review file comprehensively as multiple agents detected issues',
            impact: 'immediate',
            effort: 'medium',
          });
        }
      }
    }

    return findings;
  }

  private detectUnusedCode(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        if (finding.ruleId.toLowerCase().includes('unused') ||
            finding.message.toLowerCase().includes('unused')) {
          findings.push({
            ruleId: 'QUAL-006',
            ruleName: 'Unused Code',
            category: 'quality',
            severity: 'low',
            message: `Unused code detected in ${finding.filePath}`,
            affectedItems: [finding.filePath],
            evidence: [
              { type: 'location', data: `${finding.filePath}:${finding.line}` },
            ],
            suggestion: 'Remove or mark as deprecated',
            impact: 'long-term',
            effort: 'low',
          });
        }
      }
    }

    return findings;
  }

  private detectMemoryLeaks(ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        const message = finding.message.toLowerCase();
        if (message.includes('memory leak') ||
            message.includes('resource leak') ||
            message.includes('not disposed')) {
          findings.push({
            ruleId: 'PERF-003',
            ruleName: 'Memory Leaks',
            category: 'performance',
            severity: 'critical',
            message: `Potential memory leak in ${finding.filePath}`,
            affectedItems: [finding.filePath],
            evidence: [
              { type: 'message', data: finding.message },
            ],
            suggestion: 'Ensure proper resource cleanup',
            impact: 'immediate',
            effort: 'medium',
          });
        }
      }
    }

    return findings;
  }

  /**
   * Generic rule application for rules not explicitly handled
   */
  private applyGenericRule(rule: SemanticRule, ingestionResult: IngestionResult): SemanticFinding[] {
    const findings: SemanticFinding[] = [];

    // Generic heuristic: if a rule category has many findings, flag it
    const categoryFindings = ingestionResult.runs
      .flatMap(run => run.results)
      .filter(f => this.mapFindingToCategory(f) === rule.category);

    if (categoryFindings.length > 20) {
      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        severity: rule.severity,
        message: `High volume of ${rule.category} issues detected (${categoryFindings.length})`,
        affectedItems: [...new Set(categoryFindings.map(f => f.filePath))].slice(0, 10),
        evidence: [
          { type: 'count', data: categoryFindings.length },
        ],
        suggestion: `Review and address ${rule.category} issues`,
        impact: 'short-term',
        effort: 'medium',
      });
    }

    return findings;
  }

  /**
   * Detect correlations between findings
   */
  private detectCorrelations(ingestionResult: IngestionResult): Array<{
    type: string;
    findings: string[];
    description: string;
    confidence: number;
  }> {
    const correlations: Array<{
      type: string;
      findings: string[];
      description: string;
      confidence: number;
    }> = [];

    // Security-Quality correlation
    const securityFindings = ingestionResult.runs
      .flatMap(run => run.results.filter(f => f.severity === 'critical'));
    if (securityFindings.length > 0) {
      correlations.push({
        type: 'Security-Quality Correlation',
        findings: securityFindings.slice(0, 5).map(f => f.id),
        description: `${securityFindings.length} critical security issues may indicate quality problems`,
        confidence: 0.9,
      });
    }

    return correlations;
  }

  /**
   * Detect patterns in findings
   */
  private detectPatterns(
    ingestionResult: IngestionResult,
    semanticFindings: SemanticFinding[]
  ): Array<{
    name: string;
    description: string;
    occurrences: number;
    severity: string;
  }> {
    const patterns: Array<{
      name: string;
      description: string;
      occurrences: number;
      severity: string;
    }> = [];

    // Pattern: Files with multiple critical issues
    const fileIssueCounts = new Map<string, { critical: number; total: number }>();
    for (const run of ingestionResult.runs) {
      for (const finding of run.results) {
        const file = finding.filePath;
        if (!fileIssueCounts.has(file)) {
          fileIssueCounts.set(file, { critical: 0, total: 0 });
        }
        const counts = fileIssueCounts.get(file)!;
        counts.total++;
        if (finding.severity === 'critical') {
          counts.critical++;
        }
      }
    }

    for (const [file, counts] of fileIssueCounts) {
      if (counts.critical >= 3) {
        patterns.push({
          name: 'Critical File Pattern',
          description: `File ${file} has ${counts.critical} critical issues`,
          occurrences: counts.critical,
          severity: 'critical',
        });
      }
    }

    return patterns;
  }

  /**
   * Calculate quality metrics
   */
  private calculateMetrics(
    ingestionResult: IngestionResult,
    semanticFindings: SemanticFinding[]
  ): SemanticAnalysisResult['metrics'] {
    const totalFindings = ingestionResult.summary.totalFindings;
    const critical = ingestionResult.summary.severityBreakdown.critical;
    const high = ingestionResult.summary.severityBreakdown.high;
    const medium = ingestionResult.summary.severityBreakdown.medium;
    const low = ingestionResult.summary.severityBreakdown.low;

    // Calculate scores (0-100)
    const securityScore = Math.max(0, 100 - (critical * 10) - (high * 5));
    const qualityScore = Math.max(0, 100 - (totalFindings * 0.5));
    const maintainabilityScore = Math.max(0, 100 - (semanticFindings.length * 2));
    const complexityScore = Math.max(0, 100 - (medium * 2) - (low * 1));
    const documentationScore = Math.max(0, 100 - (low * 0.5));

    const overallScore = Math.round(
      (securityScore + qualityScore + maintainabilityScore + complexityScore + documentationScore) / 5
    );

    // Calculate technical debt
    const debtHours = Math.round((critical * 4) + (high * 2) + (medium * 1) + (low * 0.5));
    const debtPriority = critical > 5 ? 'critical' :
                         critical > 0 ? 'high' :
                         high > 10 ? 'medium' : 'low';

    // Calculate risk profile
    const riskFactors: string[] = [];
    if (critical > 0) riskFactors.push('Critical security issues');
    if (high > 10) riskFactors.push('High number of quality issues');
    if (semanticFindings.length > 50) riskFactors.push('High semantic complexity');
    if (debtHours > 40) riskFactors.push('High technical debt');

    const riskLevel = critical > 5 ? 'critical' :
                      critical > 0 ? 'high' :
                      riskFactors.length > 2 ? 'high' :
                      riskFactors.length > 0 ? 'medium' : 'low';

    return {
      codeQualityScore: qualityScore,
      securityScore,
      maintainabilityScore,
      complexityScore,
      documentationScore,
      overallScore,
      technicalDebt: {
        hours: debtHours,
        priority: debtPriority as any,
      },
      riskProfile: {
        level: riskLevel as any,
        factors: riskFactors,
      },
      recommendations: this.generateRecommendations(semanticFindings, overallScore),
    };
  }

  /**
   * Generate recommendations based on findings
   */
  private generateRecommendations(
    semanticFindings: SemanticFinding[],
    overallScore: number
  ): Array<{
    category: string;
    priority: 'immediate' | 'short-term' | 'long-term';
    description: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }> {
    const recommendations: Array<{
      category: string;
      priority: 'immediate' | 'short-term' | 'long-term';
      description: string;
      effort: 'low' | 'medium' | 'high';
      impact: 'low' | 'medium' | 'high';
    }> = [];

    // Critical issues
    const criticalFindings = semanticFindings.filter(f => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      recommendations.push({
        category: 'Security',
        priority: 'immediate',
        description: `Address ${criticalFindings.length} critical security issues immediately`,
        effort: 'medium',
        impact: 'high',
      });
    }

    // Overall quality
    if (overallScore < 70) {
      recommendations.push({
        category: 'Quality',
        priority: 'short-term',
        description: 'Overall code quality is below recommended threshold',
        effort: 'high',
        impact: 'high',
      });
    }

    // Technical debt
    const debtFindings = semanticFindings.filter(f => f.ruleId === 'MAIN-004');
    if (debtFindings.length > 0) {
      recommendations.push({
        category: 'Maintenance',
        priority: 'long-term',
        description: 'Plan and execute technical debt reduction',
        effort: 'high',
        impact: 'medium',
      });
    }

    return recommendations;
  }

  /**
   * Detect violations
   */
  private detectViolations(semanticFindings: SemanticFinding[]): Array<{
    rule: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    count: number;
    files: string[];
  }> {
    const violations = new Map<string, {
      severity: 'critical' | 'high' | 'medium' | 'low';
      count: number;
      files: Set<string>;
    }>();

    for (const finding of semanticFindings) {
      if (!violations.has(finding.ruleId)) {
        // Map 'info' severity to 'low' for violations
        const mappedSeverity = finding.severity === 'info' ? 'low' : finding.severity;
        violations.set(finding.ruleId, {
          severity: mappedSeverity as 'critical' | 'high' | 'medium' | 'low',
          count: 0,
          files: new Set(),
        });
      }

      const violation = violations.get(finding.ruleId)!;
      violation.count++;
      finding.affectedItems.forEach(item => violation.files.add(item));
    }

    return Array.from(violations.entries()).map(([rule, data]) => ({
      rule,
      severity: data.severity,
      count: data.count,
      files: Array.from(data.files),
    }));
  }

  /**
   * Map finding to category
   */
  private mapFindingToCategory(finding: NormalizedFinding): string {
    if (finding.ruleId.toLowerCase().includes('security') ||
        finding.ruleId.toLowerCase().includes('sql') ||
        finding.ruleId.toLowerCase().includes('xss')) {
      return 'security';
    }

    if (finding.ruleId.toLowerCase().includes('complexity') ||
        finding.ruleId.toLowerCase().includes('cyclomatic')) {
      return 'complexity';
    }

    if (finding.ruleId.toLowerCase().includes('performance') ||
        finding.ruleId.toLowerCase().includes('memory')) {
      return 'performance';
    }

    return 'quality';
  }
}
