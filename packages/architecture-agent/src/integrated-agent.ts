/**
 * Integrated Architecture Agent - Complete System Integration
 * Orchestrates all analysis components and provides comprehensive architectural insights
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from './utils/logger.js';
import { LayeringAnalyzer } from './layering-analyzer.js';
import { DRYAnalyzer } from './dry-analyzer.js';
import { CoverageAnalyzer } from './coverage-analyzer.js';
import { SeverityClassifier } from './severity-classifier.js';
import { RefactorSuggester } from './refactor-suggester.js';
import { SymbolExtractor } from './symbol-extractor.js';
import type {
  ArchitectureTaskData,
  Finding,
  LayeringViolation,
  DRYViolation,
  TestCoverageGap,
  ArchitectureAnalysis,
  ArchitectureReport,
  SeverityClassification,
  RefactorRecommendation,
  ArchitectureFinding
} from './types.js';

/**
 * Architecture Agent Configuration
 */
export interface ArchitectureAgentConfig {
  analysis: {
    includeLayering: boolean;
    includeDRY: boolean;
    includeCoverage: boolean;
    includeSeverity: boolean;
    includeRefactoring: boolean;
  };
  thresholds: {
    layeringSeverity: 'low' | 'medium' | 'high' | 'critical';
    drySimilarity: number;
    coverageThreshold: number;
    maxFindings: number;
  };
  output: {
    format: 'json' | 'markdown' | 'html' | 'sarif';
    includeRecommendations: boolean;
    includeCodeExamples: boolean;
    groupBySeverity: boolean;
  };
  performance: {
    enableCaching: boolean;
    parallelAnalysis: boolean;
    maxFilesPerBatch: number;
  };
}

/**
 * Complete Analysis Results
 */
export interface CompleteAnalysisResults {
  taskId: string;
  timestamp: string;
  config: ArchitectureAgentConfig;
  analysis: ArchitectureAnalysis;
  severityClassifications: SeverityClassification[];
  refactorRecommendations: RefactorRecommendation[];
  summary: AnalysisSummary;
  performance: PerformanceMetrics;
}

/**
 * Analysis Summary
 */
export interface AnalysisSummary {
  totalFindings: number;
  findingsByType: Record<string, number>;
  findingsBySeverity: Record<string, number>;
  overallRiskScore: number;
  qualityScore: number;
  estimatedEffort: {
    hours: number;
    teamSize: number;
    complexity: 'low' | 'medium' | 'high';
  };
  priorityRecommendations: string[];
  criticalIssues: string[];
}

/**
 * Performance Metrics
 */
export interface PerformanceMetrics {
  totalDuration: number;
  componentDurations: Record<string, number>;
  filesAnalyzed: number;
  linesAnalyzed: number;
  memoryUsage: {
    peak: number;
    average: number;
  };
}

/**
 * Integrated Architecture Agent Class
 */
export class IntegratedArchitectureAgent {
  private config: ArchitectureAgentConfig;
  private layeringAnalyzer: LayeringAnalyzer;
  private dryAnalyzer: DRYAnalyzer;
  private coverageAnalyzer: CoverageAnalyzer;
  private severityClassifier: SeverityClassifier;
  private refactorSuggester: RefactorSuggester;

  constructor(config?: Partial<ArchitectureAgentConfig>) {
    this.config = this.mergeConfig(config);

    // Initialize analyzers
    const symbolExtractor = new SymbolExtractor();
    this.layeringAnalyzer = new LayeringAnalyzer(symbolExtractor);
    this.dryAnalyzer = new DRYAnalyzer();
    this.coverageAnalyzer = new CoverageAnalyzer();
    this.severityClassifier = new SeverityClassifier({
      criticality: 'production',
      teamSize: 5,
      deadlinePressure: 'medium',
      techDebtTolerance: 'low',
      businessStage: 'growth',
      architecturalComplexity: 'moderate'
    });
    this.refactorSuggester = new RefactorSuggester();

    logger.info('🏗️ Integrated Architecture Agent initialized', {
      agent: 'architecture-agent',
      version: '1.0.0',
      config: this.config
    });
  }

  /**
   * Run complete architectural analysis
   */
  async analyze(taskData: ArchitectureTaskData): Promise<CompleteAnalysisResults> {
    const taskId = randomUUID();
    const startTime = Date.now();

    logger.info(`🔍 Starting complete architectural analysis - Task: ${taskId}`, {
      agent: 'architecture-agent',
      version: '1.0.0',
      taskId,
      files: taskData.scope.length
    });

    const startTimeMs = performance.now();

    // Initialize results object
    const results: CompleteAnalysisResults = {
      taskId,
      timestamp: new Date().toISOString(),
      config: this.config,
      analysis: {
        filesAnalyzed: 0,
        languages: [],
        symbolsFound: 0,
        importsFound: 0,
        layeringViolations: [],
        dryViolations: [],
        coverageGaps: [],
        metrics: {
          complexity: { average: 0, max: 0, hotspots: [] },
          coupling: { average: 0, max: 0, tightlyCoupled: [] },
          cohesion: { average: 0, low: [] }
        }
      },
      severityClassifications: [],
      refactorRecommendations: [],
      summary: {
        totalFindings: 0,
        findingsByType: {},
        findingsBySeverity: {},
        overallRiskScore: 0,
        qualityScore: 0,
        estimatedEffort: { hours: 0, teamSize: 1, complexity: 'medium' },
        priorityRecommendations: [],
        criticalIssues: []
      },
      performance: {
        totalDuration: 0,
        componentDurations: {},
        filesAnalyzed: 0,
        linesAnalyzed: 0,
        memoryUsage: { peak: 0, average: 0 }
      }
    };

    try {
      // Phase 1: Layering Analysis
      if (this.config.analysis.includeLayering) {
        const layeringStart = performance.now();
        const layeringViolations = await this.layeringAnalyzer.analyzeLayering(
          taskData.context.repoRoot,
          taskData.scope
        );
        results.analysis.layeringViolations = layeringViolations;
        results.performance.componentDurations.layering = performance.now() - layeringStart;

        logger.info(`✅ Layering analysis complete: ${layeringViolations.length} violations found`, {
          taskId,
          duration: results.performance.componentDurations.layering
        });
      }

      // Phase 2: DRY Analysis
      if (this.config.analysis.includeDRY) {
        const dryStart = performance.now();
        const dryViolations = await this.dryAnalyzer.analyzeDRYViolations(taskData);
        results.analysis.dryViolations = dryViolations.slice(0, this.config.thresholds.maxFindings);
        results.performance.componentDurations.dry = performance.now() - dryStart;

        logger.info(`✅ DRY analysis complete: ${results.analysis.dryViolations.length} violations found`, {
          taskId,
          duration: results.performance.componentDurations.dry
        });
      }

      // Phase 3: Coverage Analysis
      if (this.config.analysis.includeCoverage) {
        const coverageStart = performance.now();
        const coverageAnalysis = await this.coverageAnalyzer.analyzeCoverage(taskData);
        // Convert TestCoverageGap[] to CoverageGap[] by mapping required properties
        results.analysis.coverageGaps = coverageAnalysis.criticalGaps.slice(0, this.config.thresholds.maxFindings).map(gap => ({
          ruleId: 'COVERAGE_GAP' as const,
          message: gap.message,
          severity: gap.severity,
          filePath: gap.filePath,
          line: gap.line,
          column: gap.column,
          category: 'coverage' as const,
          architecturalImpact: 'medium' as const,
          refactorEffort: gap.estimatedEffort,
          uncoveredFunction: {
            name: gap.functionName || '',
            file: gap.filePath,
            line: gap.line,
            complexity: 1, // Default complexity
            parameters: 0, // Default parameters
            type: 'function' as const,
            priority: 'high' as const,
            reason: 'Not covered by tests'
          },
          suggestedTest: gap.suggestedTests[0] || 'Add unit tests',
          estimatedEffort: gap.estimatedEffort
        }));
        results.performance.componentDurations.coverage = performance.now() - coverageStart;

        logger.info(`✅ Coverage analysis complete: ${results.analysis.coverageGaps.length} gaps found`, {
          taskId,
          duration: results.performance.componentDurations.coverage
        });
      }

      // Phase 4: Aggregate all findings
      const allFindings = this.aggregateFindings(results);

      // Phase 5: Severity Classification
      if (this.config.analysis.includeSeverity) {
        const severityStart = performance.now();
        results.severityClassifications = this.severityClassifier.classifyAll(allFindings) as any;
        results.performance.componentDurations.severity = performance.now() - severityStart;

        logger.info(`✅ Severity classification complete: ${results.severityClassifications.length} classifications`, {
          taskId,
          duration: results.performance.componentDurations.severity
        });
      }

      // Phase 6: Refactoring Recommendations
      if (this.config.analysis.includeRefactoring) {
        const refactorStart = performance.now();
        results.refactorRecommendations = await this.generateRefactoringSuggestions(allFindings, taskData);
        results.performance.componentDurations.refactoring = performance.now() - refactorStart;

        logger.info(`✅ Refactoring suggestions complete: ${results.refactorRecommendations.length} recommendations`, {
          taskId,
          duration: results.performance.componentDurations.refactoring
        });
      }

      // Phase 7: Generate Summary
      results.summary = this.generateAnalysisSummary(results);

      // Phase 8: Calculate Performance Metrics
      results.performance = this.calculatePerformanceMetrics(results, startTimeMs);

      // Phase 9: Generate Report
      if (taskData.output) {
        await this.generateReport(results, taskData.output);
      }

      const totalDuration = performance.now() - startTimeMs;
      logger.info(`🎉 Complete architectural analysis finished - Task: ${taskId}`, {
        taskId,
        totalDuration,
        totalFindings: results.summary.totalFindings,
        riskScore: results.summary.overallRiskScore,
        qualityScore: results.summary.qualityScore
      });

      return results;

    } catch (error) {
      logger.error(`❌ Analysis failed - Task: ${taskId}`, {
        taskId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Aggregate all findings from different analyzers
   */
  private aggregateFindings(results: CompleteAnalysisResults): Finding[] {
    const allFindings: Finding[] = [];

    // Add layering violations
    allFindings.push(...results.analysis.layeringViolations);

    // Add DRY violations
    allFindings.push(...results.analysis.dryViolations);

    // Add coverage gaps
    allFindings.push(...results.analysis.coverageGaps);

    // Limit findings if configured
    if (this.config.thresholds.maxFindings > 0) {
      return allFindings.slice(0, this.config.thresholds.maxFindings);
    }

    return allFindings;
  }

  /**
   * Generate refactoring suggestions using the suggester
   */
  private async generateRefactoringSuggestions(
    findings: Finding[],
    taskData: ArchitectureTaskData
  ): Promise<RefactorRecommendation[]> {
    const context = {
      violations: findings,
      projectInfo: {
        name: 'Project Analysis',
        language: ['javascript', 'typescript', 'python'],
        architecture: 'unknown' as const,
        size: 'medium' as const
      },
      codeContext: {
        filePath: '',
        sourceCode: '',
        imports: [],
        exports: [],
        dependencies: []
      },
      preferences: {
        maxSuggestions: 10,
        includeCodeExamples: this.config.output.includeCodeExamples,
        effortEstimation: true,
        riskAssessment: true
      }
    };

    return await this.refactorSuggester.generateSuggestions(context);
  }

  /**
   * Generate comprehensive analysis summary
   */
  private generateAnalysisSummary(results: CompleteAnalysisResults): AnalysisSummary {
    const allFindings = this.aggregateFindings(results);

    // Count findings by type
    const findingsByType: Record<string, number> = {};
    allFindings.forEach(finding => {
      findingsByType[finding.ruleId] = (findingsByType[finding.ruleId] || 0) + 1;
    });

    // Count findings by severity
    const findingsBySeverity: Record<string, number> = {};
    results.severityClassifications.forEach(classification => {
      findingsBySeverity[classification.severity] = (findingsBySeverity[classification.severity] || 0) + 1;
    });

    // Calculate risk score (0-100)
    const severityWeights: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    let totalRiskScore = 0;
    let maxPossibleScore = 0;

    Object.entries(findingsBySeverity).forEach(([severity, count]) => {
      const weight = severityWeights[severity] || 1;
      totalRiskScore += count * weight;
      maxPossibleScore += count * 4; // Max weight is 4 for critical
    });

    const overallRiskScore = maxPossibleScore > 0 ? Math.round((totalRiskScore / maxPossibleScore) * 100) : 0;

    // Calculate quality score (inverse of risk score)
    const qualityScore = Math.max(0, 100 - overallRiskScore);

    // Estimate effort based on severity and type
    const effortHours = this.calculateEffortEstimate(allFindings, results.severityClassifications);

    // Identify critical issues
    const criticalIssues = allFindings
      .filter(f => f.severity === 'critical' || f.severity === 'high')
      .map(f => `${f.ruleId}: ${f.message} (${f.filePath}:${f.line})`)
      .slice(0, 5);

    // Generate priority recommendations
    const priorityRecommendations = this.generatePriorityRecommendations(results);

    return {
      totalFindings: allFindings.length,
      findingsByType,
      findingsBySeverity,
      overallRiskScore,
      qualityScore,
      estimatedEffort: effortHours,
      priorityRecommendations,
      criticalIssues
    };
  }

  /**
   * Calculate effort estimate for fixing findings
   */
  private calculateEffortEstimate(
    findings: Finding[],
    classifications: SeverityClassification[]
  ): { hours: number; teamSize: number; complexity: 'low' | 'medium' | 'high' } {
    let totalHours = 0;
    let complexityPoints = 0;

    classifications.forEach(classification => {
      totalHours += classification.effortEstimate.hours;

      // Add complexity points
      switch (classification.effortEstimate.complexity) {
        case 'high':
          complexityPoints += 3;
          break;
        case 'medium':
          complexityPoints += 2;
          break;
        case 'low':
          complexityPoints += 1;
          break;
      }
    });

    // Determine overall complexity
    let complexity: 'low' | 'medium' | 'high' = 'medium';
    const avgComplexity = complexityPoints / classifications.length;

    if (avgComplexity >= 2.5) {
      complexity = 'high';
    } else if (avgComplexity <= 1.5) {
      complexity = 'low';
    }

    // Estimate team size based on total effort
    let teamSize = 1;
    if (totalHours > 40) {
      teamSize = Math.min(4, Math.ceil(totalHours / 20));
    } else if (totalHours > 20) {
      teamSize = 2;
    }

    return {
      hours: Math.round(totalHours),
      teamSize,
      complexity
    };
  }

  /**
   * Generate priority recommendations
   */
  private generatePriorityRecommendations(results: CompleteAnalysisResults): string[] {
    const recommendations: string[] = [];

    // Risk-based recommendations
    if (results.summary.overallRiskScore > 70) {
      recommendations.push('Critical: Address high-risk architectural violations immediately');
    }

    // Layering recommendations
    if (results.analysis.layeringViolations.length > 5) {
      recommendations.push('Priority: Review and fix layering violations to improve architectural integrity');
    }

    // DRY recommendations
    if (results.analysis.dryViolations.length > 10) {
      recommendations.push('Important: Refactor duplicated code to improve maintainability');
    }

    // Coverage recommendations
    if (results.analysis.coverageGaps.length > 5) {
      recommendations.push('Quality: Improve test coverage for critical functions');
    }

    // Quality score recommendations
    if (results.summary.qualityScore < 60) {
      recommendations.push('Strategic: Implement comprehensive quality improvement plan');
    }

    // Effort-based recommendations
    if (results.summary.estimatedEffort.hours > 40) {
      recommendations.push('Planning: Break down fixes into manageable iterations');
    }

    return recommendations.slice(0, 5); // Limit to top 5 recommendations
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    results: CompleteAnalysisResults,
    startTimeMs: number
  ): PerformanceMetrics {
    const totalDuration = performance.now() - startTimeMs;

    return {
      totalDuration: Math.round(totalDuration),
      componentDurations: results.performance.componentDurations,
      filesAnalyzed: results.analysis.filesAnalyzed,
      linesAnalyzed: 0, // TODO: Calculate from AST parsing
      memoryUsage: {
        peak: 0, // TODO: Implement memory tracking
        average: 0
      }
    };
  }

  /**
   * Generate comprehensive report
   */
  private async generateReport(results: CompleteAnalysisResults, outputPath: string): Promise<void> {
    const allFindings = this.aggregateFindings(results);

    const report: ArchitectureReport = {
      version: '1.0.0',
      runId: results.taskId,
      timestamp: results.timestamp,
      agent: 'architecture',
      analysis: results.analysis,
      summary: {
        totalFindings: results.summary.totalFindings,
        severityBreakdown: results.summary.findingsBySeverity,
        categoryBreakdown: results.summary.findingsByType,
        architecturalImpact: {
          high: allFindings.filter(f => f.architecturalImpact === 'high').length,
          medium: allFindings.filter(f => f.architecturalImpact === 'medium').length,
          low: allFindings.filter(f => f.architecturalImpact === 'low').length
        }
      },
      findings: allFindings as ArchitectureFinding[],
      recommendations: results.refactorRecommendations,
      metrics: {
        analysisDuration: results.performance.totalDuration,
        filesProcessed: results.performance.filesAnalyzed,
        linesOfCode: results.performance.linesAnalyzed,
        complexityMetrics: {
          averageComplexity: results.analysis.metrics.complexity.average,
          maxComplexity: results.analysis.metrics.complexity.max,
          totalHotspots: results.analysis.metrics.complexity.hotspots.length
        }
      }
    };

    // Write report based on format
    switch (this.config.output.format) {
      case 'json':
        writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
        break;
      case 'markdown':
        const markdown = this.generateMarkdownReport(results);
        writeFileSync(outputPath, markdown, 'utf8');
        break;
      case 'sarif':
        const sarif = this.generateSARIFReport(results);
        writeFileSync(outputPath, JSON.stringify(sarif, null, 2), 'utf8');
        break;
      default:
        writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
    }

    logger.info(`📄 Report generated: ${outputPath}`, {
      taskId: results.taskId,
      format: this.config.output.format,
      findings: results.summary.totalFindings
    });
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(results: CompleteAnalysisResults): string {
    const { summary } = results;

    let markdown = `# Architecture Analysis Report\n\n`;
    markdown += `**Generated:** ${results.timestamp}\n`;
    markdown += `**Task ID:** ${results.taskId}\n\n`;

    // Executive Summary
    markdown += `## Executive Summary\n\n`;
    markdown += `- **Total Findings:** ${summary.totalFindings}\n`;
    markdown += `- **Risk Score:** ${summary.overallRiskScore}/100\n`;
    markdown += `- **Quality Score:** ${summary.qualityScore}/100\n`;
    markdown += `- **Estimated Effort:** ${summary.estimatedEffort.hours} hours\n\n`;

    // Critical Issues
    if (summary.criticalIssues.length > 0) {
      markdown += `## Critical Issues\n\n`;
      summary.criticalIssues.forEach((issue, index) => {
        markdown += `${index + 1}. ${issue}\n`;
      });
      markdown += `\n`;
    }

    // Findings by Type
    markdown += `## Findings by Type\n\n`;
    Object.entries(summary.findingsByType).forEach(([type, count]) => {
      markdown += `- **${type}:** ${count}\n`;
    });
    markdown += `\n`;

    // Priority Recommendations
    if (summary.priorityRecommendations.length > 0) {
      markdown += `## Priority Recommendations\n\n`;
      summary.priorityRecommendations.forEach((rec, index) => {
        markdown += `${index + 1}. ${rec}\n`;
      });
      markdown += `\n`;
    }

    return markdown;
  }

  /**
   * Generate SARIF report
   */
  private generateSARIFReport(results: CompleteAnalysisResults): any {
    // SARIF format implementation
    const allFindings = this.aggregateFindings(results);

    return {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [{
        tool: {
          driver: {
            name: 'architecture-agent',
            version: '1.0.0',
            informationUri: 'https://github.com/pit-crew/architecture-agent'
          }
        },
        results: allFindings.map(finding => ({
          ruleId: finding.ruleId,
          level: this.mapSeverityToSARIFLevel(finding.severity),
          message: {
            text: finding.message
          },
          locations: [{
            physicalLocation: {
              artifactLocation: {
                uri: finding.filePath
              },
              region: {
                startLine: finding.line,
                startColumn: finding.column
              }
            }
          }]
        }))
      }]
    };
  }

  /**
   * Map severity to SARIF level
   */
  private mapSeverityToSARIFLevel(severity: string): 'error' | 'warning' | 'note' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
      default:
        return 'note';
    }
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(config?: Partial<ArchitectureAgentConfig>): ArchitectureAgentConfig {
    return {
      analysis: {
        includeLayering: true,
        includeDRY: true,
        includeCoverage: true,
        includeSeverity: true,
        includeRefactoring: true,
        ...config?.analysis
      },
      thresholds: {
        layeringSeverity: 'medium',
        drySimilarity: 0.8,
        coverageThreshold: 80,
        maxFindings: 100,
        ...config?.thresholds
      },
      output: {
        format: 'json',
        includeRecommendations: true,
        includeCodeExamples: true,
        groupBySeverity: true,
        ...config?.output
      },
      performance: {
        enableCaching: true,
        parallelAnalysis: false,
        maxFilesPerBatch: 50,
        ...config?.performance
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ArchitectureAgentConfig>): void {
    this.config = this.mergeConfig(newConfig);
    logger.debug('🔧 Integrated Architecture Agent configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): ArchitectureAgentConfig {
    return { ...this.config };
  }

  /**
   * Get agent status and statistics
   */
  getStatus(): {
    version: string;
    components: string[];
    uptime: number;
    ready: boolean;
  } {
    return {
      version: '1.0.0',
      components: [
        'LayeringAnalyzer',
        'DRYAnalyzer',
        'CoverageAnalyzer',
        'SeverityClassifier',
        'RefactorSuggester'
      ],
      uptime: process.uptime(),
      ready: true
    };
  }
}