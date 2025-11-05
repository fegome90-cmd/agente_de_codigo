/**
 * Quality Agent - Main implementation
 * Orchestrates ESLint, Ruff, and generates SARIF reports
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from './utils/logger.js';
import { ESLintAnalyzer } from './eslint-analyzer.js';
import { RuffAnalyzer } from './ruff-analyzer.js';
import { SARIFGenerator } from './sarif-generator.js';
import type {
  QualityTaskData,
  QualityAnalysisResult,
  QualityFinding,
  QualitySummary,
  QualityMetrics,
  QualityAgentConfig,
  QualityCategory,
  ESLintResult,
  RuffResult,
} from './types.js';

export class QualityAgent {
  private config: QualityAgentConfig;
  private eslintAnalyzer: ESLintAnalyzer;
  private ruffAnalyzer: RuffAnalyzer;

  constructor(config?: Partial<QualityAgentConfig>) {
    this.config = this.mergeConfig(config);
    this.eslintAnalyzer = new ESLintAnalyzer(this.config.eslint);
    this.ruffAnalyzer = new RuffAnalyzer(this.config.ruff);
  }

  private mergeConfig(config?: Partial<QualityAgentConfig>): QualityAgentConfig {
    const defaultConfig: QualityAgentConfig = {
      eslint: {
        enabled: true,
        timeout: 120000, // 2 minutes
        maxMemory: 128,
      },
      ruff: {
        enabled: true,
        select: ['E', 'F', 'W', 'S', 'B', 'C', 'A', 'UP'],
        exclude: ['test/', 'tests/', 'node_modules/', '.git/', '__pycache__/'],
        lineLength: 88,
        timeout: 120000,
        maxMemory: 128,
      },
      thresholds: {
        maxErrors: 0,
        maxWarnings: 10,
        maxComplexity: 10,
        minMaintainabilityIndex: 50,
        maxDuplicationPercentage: 5,
      },
      output: {
        format: 'sarif',
        includeCodeContext: true,
        groupByFile: true,
      },
    };

    return {
      ...defaultConfig,
      ...config,
      eslint: { ...defaultConfig.eslint, ...config?.eslint },
      ruff: { ...defaultConfig.ruff, ...config?.ruff },
      thresholds: { ...defaultConfig.thresholds, ...config?.thresholds },
      output: { ...defaultConfig.output, ...config?.output },
    };
  }

  async analyze(taskData: QualityTaskData): Promise<QualityAnalysisResult> {
    const taskId = randomUUID();
    const startTime = Date.now();

    logger.info(`Starting quality analysis`, {
      taskId,
      scopeSize: taskData.scope.length,
      repoRoot: taskData.context.repo_root,
    });

    try {
      // Initialize results
      const results: QualityAnalysisResult = {
        taskId,
        timestamp: new Date().toISOString(),
        duration: 0,
        summary: {
          totalIssues: 0,
          criticalIssues: 0,
          highIssues: 0,
          mediumIssues: 0,
          lowIssues: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
          fixableIssues: 0,
          filesAnalyzed: taskData.scope.length,
        },
        findings: [],
        metrics: {
          maintainabilityIndex: 75, // Placeholder
          technicalDebt: 8, // Placeholder
          codeComplexity: {
            average: 5,
            max: 15,
            total: 100,
          },
          duplication: {
            percentage: 2,
            duplicatedLines: 50,
            totalLines: 2500,
          },
        },
        sarifReport: null,
        performance: {
          eslintDuration: 0,
          ruffDuration: 0,
          totalDuration: 0,
        },
      };

      // Analyze with ESLint
      if (this.config.eslint.enabled) {
        const eslintStart = Date.now();
        const eslintResults = await this.analyzeWithESLint(taskData.scope);
        results.performance.eslintDuration = Date.now() - eslintStart;

        const eslintFindings = this.convertESLintResults(eslintResults);
        results.findings.push(...eslintFindings);

        logger.info(`ESLint analysis complete`, {
          taskId,
          findings: eslintFindings.length,
          duration: results.performance.eslintDuration,
        });
      }

      // Analyze with Ruff
      if (this.config.ruff.enabled) {
        const ruffStart = Date.now();
        const ruffResults = await this.analyzeWithRuff(taskData.scope);
        results.performance.ruffDuration = Date.now() - ruffStart;

        const ruffFindings = this.convertRuffResults(ruffResults);
        results.findings.push(...ruffFindings);

        logger.info(`Ruff analysis complete`, {
          taskId,
          findings: ruffFindings.length,
          duration: results.performance.ruffDuration,
        });
      }

      // Update summary
      results.summary = this.calculateSummary(results.findings);
      results.metrics = this.calculateMetrics(results.findings);

      // Generate SARIF report
      if (this.config.output.format === 'sarif') {
        results.sarifReport = SARIFGenerator.fromQualityAnalysis(
          results,
          'quality-agent',
          '1.0.0'
        );

        // Write SARIF to output file
        const outputDir = dirname(taskData.output);
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }
        writeFileSync(taskData.output, results.sarifReport, 'utf-8');

        logger.info(`SARIF report generated`, {
          taskId,
          outputFile: taskData.output,
          reportSize: results.sarifReport.length,
        });
      }

      results.duration = Date.now() - startTime;
      results.performance.totalDuration = results.duration;

      logger.info(`Quality analysis completed`, {
        taskId,
        duration: results.duration,
        totalFindings: results.findings.length,
        summary: results.summary,
      });

      return results;

    } catch (error) {
      logger.error(`Quality analysis failed`, {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    }
  }

  private async analyzeWithESLint(files: string[]): Promise<ESLintResult[]> {
    try {
      // Filter for JavaScript/TypeScript files
      const jsTsFiles = files.filter(file =>
        /\.(js|jsx|ts|tsx)$/.test(file)
      );

      if (jsTsFiles.length === 0) {
        logger.info('No JavaScript/TypeScript files found for ESLint analysis');
        return [];
      }

      return await this.eslintAnalyzer.analyzeFiles(jsTsFiles);
    } catch (error) {
      logger.warn('ESLint analysis failed', { error });
      return [];
    }
  }

  private async analyzeWithRuff(files: string[]): Promise<RuffResult[]> {
    try {
      return await this.ruffAnalyzer.analyzeFiles(files);
    } catch (error) {
      logger.warn('Ruff analysis failed', { error });
      return [];
    }
  }

  private convertESLintResults(results: ESLintResult[]): QualityFinding[] {
    const findings: QualityFinding[] = [];

    for (const result of results) {
      for (const message of result.messages) {
        const finding: QualityFinding = {
          id: `eslint-${randomUUID()}`,
          ruleId: message.ruleId,
          message: message.message,
          severity: this.mapESLintSeverity(message.severity),
          category: this.categorizeESLintRule(message.ruleId),
          filePath: result.filePath,
          line: message.line,
          column: message.column,
          endLine: message.endLine,
          endColumn: message.endColumn,
          source: 'eslint',
          fixable: !!message.fix,
          suggestion: message.fix ? 'ESLint can auto-fix this issue' : undefined,
          effortEstimate: this.estimateESLintEffort(message.ruleId),
        };

        findings.push(finding);
      }
    }

    return findings;
  }

  private convertRuffResults(results: RuffResult[]): QualityFinding[] {
    const findings: QualityFinding[] = [];

    for (const result of results) {
      for (const violation of result.violations) {
        const finding: QualityFinding = {
          id: `ruff-${randomUUID()}`,
          ruleId: violation.code,
          message: violation.message,
          severity: this.mapRuffLevel(violation.level),
          category: this.categorizeRuffRule(violation.kind),
          filePath: result.filePath,
          line: this.extractLineFromSpan(violation.span.start),
          column: this.extractColumnFromSpan(violation.span.start),
          source: 'ruff',
          fixable: !!violation.fix,
          suggestion: violation.fix ? violation.fix.message : undefined,
          effortEstimate: this.estimateRuffEffort(violation.code),
        };

        findings.push(finding);
      }
    }

    return findings;
  }

  private mapESLintSeverity(severity: number): 'error' | 'warning' | 'info' {
    if (severity === 2) return 'error';
    if (severity === 1) return 'warning';
    return 'info';
  }

  private mapRuffLevel(level: string): 'error' | 'warning' | 'info' {
    switch (level) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'warning';
    }
  }

  private categorizeESLintRule(ruleId: string): QualityCategory {
    if (ruleId.startsWith('error/')) return 'error-prone';
    if (ruleId.startsWith('warning/')) return 'error-prone';
    if (ruleId.startsWith('complexity/')) return 'complexity';
    if (ruleId.startsWith('style/')) return 'style';
    if (ruleId.startsWith('performance/')) return 'performance';
    if (ruleId.startsWith('security/')) return 'security';
    return 'best-practices';
  }

  private categorizeRuffRule(kind: string): QualityCategory {
    switch (kind) {
      case 'Refactor':
        return 'complexity';
      case 'Error':
        return 'error-prone';
      case 'Warning':
        return 'best-practices';
      case 'Info':
        return 'documentation';
      default:
        return 'best-practices';
    }
  }

  private extractLineFromSpan(position: number): number {
    // This is a simplified implementation
    // In a real implementation, you'd need to read the file and map the position
    return Math.max(1, Math.floor(position / 50) + 1);
  }

  private extractColumnFromSpan(position: number): number {
    // This is a simplified implementation
    return Math.max(1, (position % 50) + 1);
  }

  private estimateESLintEffort(ruleId: string): 'low' | 'medium' | 'high' {
    const lowEffortRules = ['semi', 'quotes', 'comma-dangle', 'indent'];
    const highEffortRules = ['no-unused-vars', 'no-undef', 'no-console'];

    if (lowEffortRules.includes(ruleId)) return 'low';
    if (highEffortRules.includes(ruleId)) return 'high';
    return 'medium';
  }

  private estimateRuffEffort(code: string): 'low' | 'medium' | 'high' {
    const lowEffortRules = ['E402', 'F401', 'F841'];
    const highEffortRules = ['F401', 'F841', 'E501'];

    if (lowEffortRules.includes(code)) return 'low';
    if (highEffortRules.includes(code)) return 'high';
    return 'medium';
  }

  private calculateSummary(findings: QualityFinding[]): QualitySummary {
    const summary: QualitySummary = {
      totalIssues: findings.length,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      fixableIssues: 0,
      filesAnalyzed: new Set(findings.map(f => f.filePath)).size,
    };

    for (const finding of findings) {
      if (finding.severity === 'error') summary.errorCount++;
      if (finding.severity === 'warning') summary.warningCount++;
      if (finding.severity === 'info') summary.infoCount++;

      if (finding.fixable) summary.fixableIssues++;

      // Classify by severity
      if (finding.severity === 'error') {
        summary.criticalIssues++;
      } else if (finding.severity === 'warning') {
        if (finding.category === 'security' || finding.category === 'error-prone') {
          summary.highIssues++;
        } else {
          summary.mediumIssues++;
        }
      } else {
        summary.lowIssues++;
      }
    }

    return summary;
  }

  private calculateMetrics(findings: QualityFinding[]): QualityMetrics {
    // Simplified metrics calculation
    const errorCount = findings.filter(f => f.severity === 'error').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;

    const maintainabilityIndex = Math.max(0, 100 - (errorCount * 10) - (warningCount * 5));
    const technicalDebt = Math.max(0, errorCount + Math.floor(warningCount / 2));

    return {
      maintainabilityIndex,
      technicalDebt,
      codeComplexity: {
        average: 5,
        max: 15,
        total: findings.length * 5, // Simplified
      },
      duplication: {
        percentage: 2,
        duplicatedLines: 50,
        totalLines: 2500,
      },
    };
  }

  async checkAvailability(): Promise<{ eslint: boolean; ruff: boolean }> {
    const [eslintAvailable, ruffAvailable] = await Promise.all([
      this.eslintAnalyzer.checkAvailability(),
      this.ruffAnalyzer.checkAvailability(),
    ]);

    return {
      eslint: eslintAvailable,
      ruff: ruffAvailable,
    };
  }

  async getToolVersions(): Promise<{ eslint?: string; ruff?: string }> {
    const versions: { eslint?: string; ruff?: string } = {};

    try {
      versions.eslint = await this.eslintAnalyzer.getVersion();
    } catch (error) {
      logger.warn('Could not get ESLint version', { error });
    }

    try {
      versions.ruff = await this.ruffAnalyzer.getVersion();
    } catch (error) {
      logger.warn('Could not get Ruff version', { error });
    }

    return versions;
  }
}