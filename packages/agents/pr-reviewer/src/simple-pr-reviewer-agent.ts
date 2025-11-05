/**
 * Simplified PR Reviewer Agent - Minimal functional implementation
 * Meta-agent for synthesizing findings from other agents
 * Focused on compilation success and basic functionality
 */

import { PRReviewerSocketClient } from './socket-client.js';
import {
  AgentFinding,
  AgentReports,
  PRMetadata,
  PRReviewerTaskData,
  SynthesisResult,
  QualityGateResult,
  ScoringBreakdown,
  PRReviewerCapabilities
} from './types.js';
import {
  SARIFReport,
  QualityReport,
  ArchitectureReport,
  DocumentationReport,
  PRReviewReport
} from './local-types.js';
import { logger } from './simple-logger.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

// Simple configuration interface
interface SimpleSynthesisConfig {
  scoring: {
    critical_weight: number;
    high_weight: number;
    medium_weight: number;
    low_weight: number;
  };
  thresholds: {
    approve_min_score: number;
    request_changes_max_score: number;
    max_critical_issues: number;
    max_high_issues: number;
  };
}

export class SimplePRReviewerAgent extends PRReviewerSocketClient {
  private config: SimpleSynthesisConfig;
  private synthesisStartTime: number = 0;

  constructor(socketPath: string, agentName: string = 'pr_reviewer') {
    super(socketPath, agentName);
    this.config = this.createDefaultConfig();
  }

  /**
   * Get agent capabilities
   */
  protected getCapabilities(): PRReviewerCapabilities {
    return {
      supportsHeartbeat: true,
      supportsTasks: true,
      supportsEvents: true,
      tools: [
        'synthesis-engine',
        'scoring-algorithm',
        'markdown-generator'
      ],
      languages: ['typescript', 'javascript', 'python', 'json', 'yaml'],
      features: [
        'multi-agent-synthesis',
        'scoring-algorithm',
        'decision-engine',
        'markdown-report-generation'
      ]
    };
  }

  /**
   * Handle PR review synthesis task
   */
  async handleTask(taskId: string, taskData: PRReviewerTaskData): Promise<void> {
    logger.info(`Starting PR review synthesis task: ${taskId}`);
    this.synthesisStartTime = Date.now();

    try {
      // Parse task configuration
      const scope = taskData.scope || [];
      const context = taskData.context || {};
      const outputFile = taskData.output || '';

      logger.info(`Loading agent reports for synthesis`);

      // Load agent reports
      const agentReports = await this.loadAgentReports(taskData.agent_reports);

      if (!this.hasValidReports(agentReports)) {
        logger.warn('No valid agent reports found for synthesis');
        this.sendTaskResponse(taskId, 'done', {
          synthesis_completed: false,
          message: 'No valid agent reports found for synthesis',
          reports_loaded: this.getReportSummary(agentReports)
        });
        return;
      }

      // Extract PR metadata
      const prMetadata = this.extractPRMetadata(context);

      // Run synthesis analysis
      const synthesisResult = await this.runSynthesisAnalysis(
        agentReports,
        prMetadata,
        scope,
        context
      );

      // Generate structured report
      const prReviewReport = this.generatePRReviewReport(
        taskId,
        prMetadata,
        synthesisResult
      );

      // Generate markdown report
      const markdownReport = this.generateMarkdownReport(prReviewReport);

      // Save results to output file
      if (outputFile) {
        await this.saveResults({
          structured_report: prReviewReport,
          markdown_report: markdownReport
        }, outputFile);
        logger.info(`Results saved to: ${outputFile}`);
      }

      // Send response
      const durationMs = Date.now() - this.synthesisStartTime;
      this.sendTaskResponse(taskId, 'done', {
        synthesis_completed: true,
        overall_score: synthesisResult.overall_score,
        decision: synthesisResult.decision,
        critical_issues_count: synthesisResult.critical_issues.length,
        total_issues_count: this.getTotalIssuesCount(synthesisResult),
        reports_processed: this.getReportSummary(agentReports),
        output_file: outputFile,
        markdown_generated: !!markdownReport,
        analysis_summary: synthesisResult.summary
      }, durationMs);

      logger.info(`PR review synthesis completed: score=${synthesisResult.overall_score}, decision=${synthesisResult.decision}`);

    } catch (error) {
      logger.error(`PR review synthesis failed:`, error);
      const durationMs = Date.now() - this.synthesisStartTime;
      this.sendTaskResponse(taskId, 'failed', {
        error: (error as Error).message,
        error_type: (error as Error).constructor.name
      }, durationMs);
    }
  }

  /**
   * Load agent reports from file paths
   */
  private async loadAgentReports(reportPaths: {
    security_report_path?: string;
    quality_report_path?: string;
    architecture_report_path?: string;
    documentation_report_path?: string;
  }): Promise<AgentReports> {
    const reports: AgentReports = {};

    try {
      // Load security report (SARIF)
      if (reportPaths.security_report_path) {
        const securityData = await fs.readFile(reportPaths.security_report_path, 'utf-8');
        reports.security = JSON.parse(securityData) as SARIFReport;
        logger.info(`Loaded security report: ${reportPaths.security_report_path}`);
      }

      // Load quality report
      if (reportPaths.quality_report_path) {
        const qualityData = await fs.readFile(reportPaths.quality_report_path, 'utf-8');
        reports.quality = JSON.parse(qualityData) as QualityReport;
        logger.info(`Loaded quality report: ${reportPaths.quality_report_path}`);
      }

      // Load architecture report
      if (reportPaths.architecture_report_path) {
        const architectureData = await fs.readFile(reportPaths.architecture_report_path, 'utf-8');
        reports.architecture = JSON.parse(architectureData) as ArchitectureReport;
        logger.info(`Loaded architecture report: ${reportPaths.architecture_report_path}`);
      }

      // Load documentation report
      if (reportPaths.documentation_report_path) {
        const documentationData = await fs.readFile(reportPaths.documentation_report_path, 'utf-8');
        reports.documentation = JSON.parse(documentationData) as DocumentationReport;
        logger.info(`Loaded documentation report: ${reportPaths.documentation_report_path}`);
      }

    } catch (error) {
      logger.error(`Failed to load agent reports: ${(error as Error).message}`);
    }

    return reports;
  }

  /**
   * Check if we have valid reports to synthesize
   */
  private hasValidReports(reports: AgentReports): boolean {
    const reportCount = Object.values(reports).filter(report => report !== undefined).length;
    return reportCount > 0;
  }

  /**
   * Get summary of loaded reports
   */
  private getReportSummary(reports: AgentReports): Record<string, boolean> {
    return {
      security: !!reports.security,
      quality: !!reports.quality,
      architecture: !!reports.architecture,
      documentation: !!reports.documentation
    };
  }

  /**
   * Extract PR metadata from context
   */
  private extractPRMetadata(context: any): PRMetadata {
    return {
      number: context.pr_number || 0,
      title: context.pr_title || 'Unknown PR',
      description: context.pr_description || '',
      author: context.pr_author || 'Unknown',
      base_branch: context.base_branch || 'main',
      head_branch: context.head_branch || 'feature',
      changed_files: context.changed_files || 0,
      lines_added: context.lines_added || 0,
      lines_removed: context.lines_removed || 0,
      commit_hash: context.commit_hash,
      diff: context.diff
    };
  }

  /**
   * Run comprehensive synthesis analysis
   */
  private async runSynthesisAnalysis(
    agentReports: AgentReports,
    prMetadata: PRMetadata,
    scope: string[],
    context: any
  ): Promise<SynthesisResult> {
    logger.info('Running synthesis analysis');

    // Extract findings from all agents
    const allFindings = this.extractAllFindings(agentReports);

    // Calculate scores
    const scoring = this.calculateScores(agentReports, allFindings);

    // Make decision
    const decision = this.makeDecision(scoring, allFindings);

    // Generate summary
    const summary = this.generateSummary(prMetadata, scoring, allFindings);

    // Create checklist
    const checklist = this.generateChecklist(allFindings, prMetadata);

    // Generate recommendations
    const recommendations = this.generateRecommendations(allFindings, scoring);

    // Calculate metrics
    const metrics = this.calculateMetrics(agentReports, allFindings);

    return {
      overall_score: scoring.overall_score,
      decision,
      summary,
      critical_issues: allFindings.filter(f => f.severity === 'critical'),
      medium_issues: allFindings.filter(f => f.severity === 'medium'),
      info_items: this.generateInfoItems(agentReports, allFindings),
      checklist,
      metrics,
      recommendations,
      agent_contributions: this.calculateAgentContributions(agentReports, allFindings)
    };
  }

  /**
   * Extract findings from all agent reports
   */
  private extractAllFindings(reports: AgentReports): AgentFinding[] {
    const findings: AgentFinding[] = [];

    // Extract security findings
    if (reports.security) {
      for (const run of reports.security.runs) {
        for (const result of run.results) {
          const severity = this.mapSARIFSeverity(result.level);
          findings.push({
            agent: 'security',
            severity,
            type: result.ruleId,
            description: result.message.text,
            file: result.locations?.[0]?.physicalLocation.artifactLocation.uri,
            line: result.locations?.[0]?.physicalLocation.region?.startLine,
            fix_suggestion: this.generateSecurityFixSuggestion(result),
            confidence: 0.9
          });
        }
      }
    }

    // Extract quality findings
    if (reports.quality) {
      for (const finding of reports.quality.findings) {
        findings.push({
          agent: 'quality',
          severity: this.mapQualitySeverity(finding.severity),
          type: finding.rule,
          description: finding.message,
          file: finding.file,
          line: finding.line,
          fix_suggestion: finding.suggestion,
          confidence: 0.8
        });
      }
    }

    // Extract architecture findings
    if (reports.architecture) {
      for (const layer of reports.architecture.analysis.layers) {
        for (const violation of layer.violations) {
          findings.push({
            agent: 'architecture',
            severity: this.mapArchitectureSeverity(violation.severity),
            type: `layer-violation-${violation.type}`,
            description: violation.description,
            file: violation.file,
            line: violation.line,
            fix_suggestion: `Fix layering violation: ${violation.description}`,
            confidence: 0.85
          });
        }
      }
    }

    return findings;
  }

  /**
   * Map SARIF severity to our severity levels
   */
  private mapSARIFSeverity(sarifLevel: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (sarifLevel) {
      case 'error': return 'critical';
      case 'warning': return 'high';
      case 'note': return 'medium';
      case 'none': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Map quality severity to our severity levels
   */
  private mapQualitySeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'error': return 'critical';
      case 'warning': return 'high';
      case 'info': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Map architecture severity to our severity levels
   */
  private mapArchitectureSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'error': return 'high';
      case 'warning': return 'medium';
      case 'info': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Generate security fix suggestion
   */
  private generateSecurityFixSuggestion(result: any): string {
    if (result.ruleId?.includes('sql-injection')) {
      return 'Use parameterized queries or prepared statements to prevent SQL injection';
    }
    if (result.ruleId?.includes('xss')) {
      return 'Sanitize user input and use proper output encoding to prevent XSS';
    }
    if (result.ruleId?.includes('hardcoded-secret')) {
      return 'Move hardcoded secrets to environment variables or secure vault';
    }
    return 'Review and fix the identified security vulnerability';
  }

  /**
   * Calculate scores for each agent and overall
   */
  private calculateScores(reports: AgentReports, findings: AgentFinding[]): ScoringBreakdown {
    let securityScore = 100;
    let qualityScore = 100;
    let architectureScore = 100;
    let documentationScore = 100;

    // Calculate security score
    const securityFindings = findings.filter(f => f.agent === 'security');
    for (const finding of securityFindings) {
      const penalty = this.config.scoring[`${finding.severity}_weight` as keyof typeof this.config.scoring] * 10;
      securityScore = Math.max(0, securityScore - penalty);
    }

    // Calculate quality score
    const qualityFindings = findings.filter(f => f.agent === 'quality');
    for (const finding of qualityFindings) {
      const penalty = this.config.scoring[`${finding.severity}_weight` as keyof typeof this.config.scoring] * 8;
      qualityScore = Math.max(0, qualityScore - penalty);
    }

    // Calculate architecture score
    const architectureFindings = findings.filter(f => f.agent === 'architecture');
    for (const finding of architectureFindings) {
      const penalty = this.config.scoring[`${finding.severity}_weight` as keyof typeof this.config.scoring] * 6;
      architectureScore = Math.max(0, architectureScore - penalty);
    }

    // Calculate overall score (weighted average)
    const weights = { security: 0.4, quality: 0.3, architecture: 0.3 };
    const overallScore = Math.round(
      securityScore * weights.security +
      qualityScore * weights.quality +
      architectureScore * weights.architecture
    );

    return {
      security_score: securityScore,
      quality_score: qualityScore,
      architecture_score: architectureScore,
      documentation_score: documentationScore,
      overall_score: overallScore,
      penalty_points: 0,
      bonus_points: 0
    };
  }

  /**
   * Make approval/rejection decision based on scores and findings
   */
  private makeDecision(scoring: ScoringBreakdown, findings: AgentFinding[]): 'approve' | 'request_changes' | 'needs_work' {
    const criticalIssues = findings.filter(f => f.severity === 'critical').length;
    const highIssues = findings.filter(f => f.severity === 'high').length;

    // Check critical issues threshold
    if (criticalIssues > this.config.thresholds.max_critical_issues) {
      return 'request_changes';
    }

    // Check high issues threshold
    if (highIssues > this.config.thresholds.max_high_issues) {
      return 'request_changes';
    }

    // Check score thresholds
    if (scoring.overall_score >= this.config.thresholds.approve_min_score) {
      return 'approve';
    } else if (scoring.overall_score <= this.config.thresholds.request_changes_max_score) {
      return 'request_changes';
    } else {
      return 'needs_work';
    }
  }

  /**
   * Generate summary of the analysis
   */
  private generateSummary(prMetadata: PRMetadata, scoring: ScoringBreakdown, findings: AgentFinding[]): string {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const mediumCount = findings.filter(f => f.severity === 'medium').length;
    const lowCount = findings.filter(f => f.severity === 'low').length;

    return (
      `PR Review completed for #${prMetadata.number}: "${prMetadata.title}".\n\n` +
      `**Overall Score: ${scoring.overall_score}/100**\n\n` +
      `**Issues Found:** ${findings.length} total\n` +
      `- Critical: ${criticalCount}\n` +
      `- High: ${highCount}\n` +
      `- Medium: ${mediumCount}\n` +
      `- Low: ${lowCount}\n\n` +
      `**Recommendation:** ${this.getDecisionExplanation(scoring.overall_score, criticalCount, highCount)}`
    );
  }

  /**
   * Get decision explanation
   */
  private getDecisionExplanation(score: number, criticalCount: number, highCount: number): string {
    if (criticalCount > 0) {
      return `Request changes - ${criticalCount} critical issue(s) must be addressed`;
    }
    if (score >= 90) {
      return 'Approve - Excellent quality with minimal issues';
    } else if (score >= 80) {
      return 'Approve - Good quality with minor improvements suggested';
    } else if (score >= 70) {
      return 'Needs work - Address recommended improvements before merge';
    } else {
      return `Request changes - Score ${score}/100 requires significant improvements`;
    }
  }

  /**
   * Generate checklist for PR
   */
  private generateChecklist(findings: AgentFinding[], prMetadata: PRMetadata): Array<{
    item: string;
    completed: boolean;
    priority: 'critical' | 'high' | 'medium' | 'low';
    assignee?: string;
    due_date?: string;
  }> {
    const checklist: Array<{
      item: string;
      completed: boolean;
      priority: 'critical' | 'high' | 'medium' | 'low';
      assignee?: string;
      due_date?: string;
    }> = [];

    // Add security checklist items
    const securityFindings = findings.filter(f => f.agent === 'security');
    if (securityFindings.length > 0) {
      checklist.push({
        item: `Fix ${securityFindings.length} security issue(s)`,
        completed: false,
        priority: securityFindings.some(f => f.severity === 'critical') ? 'critical' : 'high',
        assignee: prMetadata.author
      });
    }

    // Add quality checklist items
    const qualityFindings = findings.filter(f => f.agent === 'quality');
    if (qualityFindings.length > 0) {
      checklist.push({
        item: `Address ${qualityFindings.length} code quality issue(s)`,
        completed: false,
        priority: qualityFindings.some(f => f.severity === 'critical') ? 'critical' : 'medium',
        assignee: prMetadata.author
      });
    }

    return checklist;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(findings: AgentFinding[], scoring: ScoringBreakdown): Array<{
    category: string;
    priority: 'immediate' | 'short_term' | 'long_term';
    description: string;
    estimated_effort: string;
  }> {
    const recommendations: Array<{
      category: string;
      priority: 'immediate' | 'short_term' | 'long_term';
      description: string;
      estimated_effort: string;
    }> = [];

    // Security recommendations
    const criticalSecurityFindings = findings.filter(f => f.agent === 'security' && f.severity === 'critical');
    if (criticalSecurityFindings.length > 0) {
      recommendations.push({
        category: 'Security',
        priority: 'immediate',
        description: `Address ${criticalSecurityFindings.length} critical security vulnerabilities before merging`,
        estimated_effort: `${criticalSecurityFindings.length * 2} hours`
      });
    }

    return recommendations;
  }

  /**
   * Calculate metrics
   */
  private calculateMetrics(reports: AgentReports, findings: AgentFinding[]): {
    security_findings: number;
    quality_issues: number;
    architecture_violations: number;
    documentation_gaps: number;
    total_tokens_used: number;
    analysis_duration_ms: number;
  } {
    return {
      security_findings: findings.filter(f => f.agent === 'security').length,
      quality_issues: findings.filter(f => f.agent === 'quality').length,
      architecture_violations: findings.filter(f => f.agent === 'architecture').length,
      documentation_gaps: findings.filter(f => f.agent === 'documentation').length,
      total_tokens_used: 0,
      analysis_duration_ms: Date.now() - this.synthesisStartTime
    };
  }

  /**
   * Generate info items (positive notes and observations)
   */
  private generateInfoItems(reports: AgentReports, findings: AgentFinding[]): Array<{
    agent: string;
    type: string;
    description: string;
    positive_note: boolean;
  }> {
    const infoItems: Array<{
      agent: string;
      type: string;
      description: string;
      positive_note: boolean;
    }> = [];

    // Add positive notes based on low issue counts
    const securityFindings = findings.filter(f => f.agent === 'security');
    if (securityFindings.length === 0) {
      infoItems.push({
        agent: 'security',
        type: 'no-security-issues',
        description: 'No security vulnerabilities detected',
        positive_note: true
      });
    }

    return infoItems;
  }

  /**
   * Calculate agent contributions
   */
  private calculateAgentContributions(reports: AgentReports, findings: AgentFinding[]): Record<string, any> {
    const contributions: Record<string, any> = {};

    // Security contributions
    if (reports.security) {
      const securityFindings = findings.filter(f => f.agent === 'security');
      contributions.security = {
        findings_count: securityFindings.length,
        top_issues: securityFindings.slice(0, 3).map(f => f.description)
      };
    }

    return contributions;
  }

  /**
   * Generate structured PR Review Report
   */
  private generatePRReviewReport(
    taskId: string,
    prMetadata: PRMetadata,
    synthesisResult: SynthesisResult
  ): PRReviewReport {
    return {
      run_id: taskId,
      timestamp: new Date().toISOString(),
      agent: 'pr_reviewer',
      pr_metadata: prMetadata,
      synthesis: {
        overall_score: synthesisResult.overall_score,
        decision: synthesisResult.decision,
        summary: synthesisResult.summary,
        critical_issues: synthesisResult.critical_issues,
        medium_issues: synthesisResult.medium_issues,
        info_items: synthesisResult.info_items
      },
      checklist: synthesisResult.checklist,
      metrics: synthesisResult.metrics,
      recommendations: synthesisResult.recommendations
    };
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(report: PRReviewReport): string {
    const sections = [];

    // Header
    sections.push(`# PR Review Report`);
    sections.push(`**PR #${report.pr_metadata.number}:** ${report.pr_metadata.title}`);
    sections.push(`**Author:** ${report.pr_metadata.author}`);
    sections.push(`**Overall Score:** ${report.synthesis.overall_score}/100`);
    sections.push(`**Decision:** ${this.formatDecision(report.synthesis.decision)}`);
    sections.push('');

    // Summary
    sections.push('## Summary');
    sections.push(report.synthesis.summary);
    sections.push('');

    // Critical Issues
    if (report.synthesis.critical_issues.length > 0) {
      sections.push('## 🚨 Critical Issues');
      for (const issue of report.synthesis.critical_issues) {
        sections.push(`### ${issue.type}`);
        sections.push(`**Agent:** ${issue.agent}`);
        sections.push(`**File:** ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
        sections.push(`**Description:** ${issue.description}`);
        if (issue.fix_suggestion) {
          sections.push(`**Fix Suggestion:** ${issue.fix_suggestion}`);
        }
        sections.push('');
      }
    }

    // Metrics
    sections.push('## Metrics');
    sections.push(`- **Security Findings:** ${report.metrics.security_findings}`);
    sections.push(`- **Quality Issues:** ${report.metrics.quality_issues}`);
    sections.push(`- **Architecture Violations:** ${report.metrics.architecture_violations}`);
    sections.push(`- **Analysis Duration:** ${report.metrics.analysis_duration_ms}ms`);
    sections.push('');

    return sections.join('\n');
  }

  /**
   * Format decision for display
   */
  private formatDecision(decision: string): string {
    switch (decision) {
      case 'approve': return '✅ Approve';
      case 'request_changes': return '🔄 Request Changes';
      case 'needs_work': return '⚠️ Needs Work';
      default: return decision;
    }
  }

  /**
   * Get total issues count
   */
  private getTotalIssuesCount(synthesisResult: SynthesisResult): number {
    return synthesisResult.critical_issues.length +
           synthesisResult.medium_issues.length +
           synthesisResult.info_items.length;
  }

  /**
   * Save results to output file
   */
  private async saveResults(results: {
    structured_report: PRReviewReport;
    markdown_report: string;
  }, outputFile: string): Promise<void> {
    try {
      await fs.mkdir(dirname(outputFile), { recursive: true });
      await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
      logger.info(`Results saved to ${outputFile}`);
    } catch (error) {
      logger.error(`Failed to save results: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): SimpleSynthesisConfig {
    return {
      scoring: {
        critical_weight: 4,
        high_weight: 3,
        medium_weight: 2,
        low_weight: 1
      },
      thresholds: {
        approve_min_score: 80,
        request_changes_max_score: 60,
        max_critical_issues: 0,
        max_high_issues: 3
      }
    };
  }
}