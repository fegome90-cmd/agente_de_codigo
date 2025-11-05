/**
 * PR Reviewer Agent - Meta-agent for synthesizing findings from other agents
 * Combines security, quality, architecture, and documentation analysis results
 * to provide comprehensive PR reviews with actionable recommendations
 */

import { PRReviewerSocketClient } from './socket-client.js';
import {
  SynthesisConfig,
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
} from '@pit-crew/shared';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pr-reviewer-agent' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new DailyRotateFile({
      filename: '/tmp/pit-crew-pr-reviewer-agent-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

export class PRReviewerAgent extends PRReviewerSocketClient {
  private config: SynthesisConfig;
  private synthesisStartTime: number = 0;

  constructor(socketPath: string) {
    super(socketPath, 'pr_reviewer');
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
        'quality-gates',
        'markdown-generator',
        'report-builder',
        'recommendation-system',
        'checklist-generator'
      ],
      languages: ['typescript', 'javascript', 'python', 'json', 'yaml', 'markdown'],
      features: [
        'multi-agent-synthesis',
        'scoring-algorithm',
        'decision-engine',
        'quality-gates-validation',
        'markdown-report-generation',
        'recommendation-system',
        'checklist-generation',
        'agent-contribution-tracking'
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
      const taskConfig = taskData.config || {};

      // Update configuration with task-specific settings
      this.updateConfig(taskConfig);

      logger.info(`Loading agent reports for synthesis`);

      // Load agent reports
      const agentReports = await this.loadAgentReports(taskData.agent_reports);

      if (!this.hasValidReports(agentReports)) {
        logger.warning('No valid agent reports found for synthesis');
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

      // Validate quality gates
      const qualityGateResult = this.validateQualityGates(synthesisResult);

      // Generate structured report
      const prReviewReport = this.generatePRReviewReport(
        taskId,
        prMetadata,
        synthesisResult,
        qualityGateResult
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
        quality_gates_passed: qualityGateResult.passed,
        agent_contributions: synthesisResult.agent_contributions,
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
        const qualityRaw = JSON.parse(qualityData);
        // Transform to match expected QualityReport interface
        reports.quality = qualityRaw as any;
        logger.info(`Loaded quality report: ${reportPaths.quality_report_path}`);
      }

      // Load architecture report
      if (reportPaths.architecture_report_path) {
        const architectureData = await fs.readFile(reportPaths.architecture_report_path, 'utf-8');
        const architectureRaw = JSON.parse(architectureData);
        // Transform to match expected ArchitectureReport interface
        reports.architecture = architectureRaw as any;
        logger.info(`Loaded architecture report: ${reportPaths.architecture_report_path}`);
      }

      // Load documentation report
      if (reportPaths.documentation_report_path) {
        const documentationData = await fs.readFile(reportPaths.documentation_report_path, 'utf-8');
        const documentationRaw = JSON.parse(documentationData);
        // Transform to match expected DocumentationReport interface
        reports.documentation = documentationRaw as any;
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

    // Calculate agent contributions
    const agentContributions = this.calculateAgentContributions(agentReports, allFindings);

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
      agent_contributions: agentContributions
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
            file: result.locations[0]?.physicalLocation.artifactLocation.uri,
            line: result.locations[0]?.physicalLocation.region.startLine,
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
          column: finding.column,
          fix_suggestion: finding.suggestion,
          confidence: 0.8
        });
      }
    }

    // Extract architecture findings
    if (reports.architecture) {
      // From layers violations
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

      // From DRY violations
      for (const violation of reports.architecture.analysis.dry_violations) {
        findings.push({
          agent: 'architecture',
          severity: 'medium',
          type: 'dry-violation',
          description: `Code duplication detected: ${violation.duplicated_code}`,
          fix_suggestion: 'Extract common code to shared function or module',
          confidence: 0.9
        });
      }
    }

    // Extract documentation findings
    if (reports.documentation) {
      // From API validation errors
      for (const error of reports.documentation.api_validation.validation_errors) {
        findings.push({
          agent: 'documentation',
          severity: this.mapDocumentationSeverity(error.severity),
          type: 'api-validation-error',
          description: error.error,
          file: error.file,
          line: error.line,
          fix_suggestion: 'Fix OpenAPI specification to comply with schema',
          confidence: 0.95
        });
      }

      // From breaking changes
      for (const change of reports.documentation.api_validation.breaking_changes) {
        findings.push({
          agent: 'documentation',
          severity: 'high',
          type: 'breaking-change',
          description: change.description,
          fix_suggestion: `Review breaking change: ${change.impact}`,
          confidence: 0.9
        });
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
   * Map documentation severity to our severity levels
   */
  private mapDocumentationSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'error': return 'high';
      case 'warning': return 'medium';
      default: return 'low';
    }
  }

  /**
   * Generate security fix suggestion
   */
  private generateSecurityFixSuggestion(result: any): string {
    // This would use LLM to generate contextual fix suggestions
    // For now, provide basic suggestions based on rule ID
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

    // Calculate documentation score
    const documentationFindings = findings.filter(f => f.agent === 'documentation');
    for (const finding of documentationFindings) {
      const penalty = this.config.scoring[`${finding.severity}_weight` as keyof typeof this.config.scoring] * 4;
      documentationScore = Math.max(0, documentationScore - penalty);
    }

    // Calculate overall score (weighted average)
    const weights = { security: 0.35, quality: 0.30, architecture: 0.20, documentation: 0.15 };
    const overallScore = Math.round(
      securityScore * weights.security +
      qualityScore * weights.quality +
      architectureScore * weights.architecture +
      documentationScore * weights.documentation
    );

    return {
      security_score: securityScore,
      quality_score: qualityScore,
      architecture_score: architectureScore,
      documentation_score: documentationScore,
      overall_score: overallScore,
      penalty_points: 0, // Could be calculated based on violations
      bonus_points: 0    // Could be calculated based on good practices
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

    const agentBreakdown = {
      security: findings.filter(f => f.agent === 'security').length,
      quality: findings.filter(f => f.agent === 'quality').length,
      architecture: findings.filter(f => f.agent === 'architecture').length,
      documentation: findings.filter(f => f.agent === 'documentation').length
    };

    return (
      `PR Review completed for #${prMetadata.number}: "${prMetadata.title}".\n\n` +
      `**Overall Score: ${scoring.overall_score}/100**\n\n` +
      `**Issues Found:** ${findings.length} total\n` +
      `- Critical: ${criticalCount}\n` +
      `- High: ${highCount}\n` +
      `- Medium: ${mediumCount}\n` +
      `- Low: ${lowCount}\n\n` +
      `**Agent Contributions:**\n` +
      `- Security: ${agentBreakdown.security} issues\n` +
      `- Quality: ${agentBreakdown.quality} issues\n` +
      `- Architecture: ${agentBreakdown.architecture} issues\n` +
      `- Documentation: ${agentBreakdown.documentation} issues\n\n` +
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
        assignee: prMetadata.author,
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Tomorrow
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

    // Add architecture checklist items
    const architectureFindings = findings.filter(f => f.agent === 'architecture');
    if (architectureFindings.length > 0) {
      checklist.push({
        item: `Resolve ${architectureFindings.length} architecture violation(s)`,
        completed: false,
        priority: 'medium',
        assignee: prMetadata.author
      });
    }

    // Add documentation checklist items
    const documentationFindings = findings.filter(f => f.agent === 'documentation');
    if (documentationFindings.length > 0) {
      checklist.push({
        item: `Update documentation for ${documentationFindings.length} issue(s)`,
        completed: false,
        priority: documentationFindings.some(f => f.severity === 'high') ? 'high' : 'low',
        assignee: prMetadata.author
      });
    }

    // Add general checklist items
    checklist.push(
      {
        item: 'Review and test all changes',
        completed: false,
        priority: 'high',
        assignee: prMetadata.author
      },
      {
        item: 'Update documentation if needed',
        completed: false,
        priority: 'medium',
        assignee: prMetadata.author
      },
      {
        item: 'Ensure CI/CD passes',
        completed: false,
        priority: 'critical',
        assignee: prMetadata.author
      }
    );

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

    // Quality recommendations
    const highQualityFindings = findings.filter(f => f.agent === 'quality' && f.severity === 'high');
    if (highQualityFindings.length > 0) {
      recommendations.push({
        category: 'Code Quality',
        priority: 'immediate',
        description: `Refactor code to address ${highQualityFindings.length} high-priority quality issues`,
        estimated_effort: `${highQualityFindings.length} hours`
      });
    }

    // Architecture recommendations
    const architectureFindings = findings.filter(f => f.agent === 'architecture');
    if (architectureFindings.length > 0) {
      recommendations.push({
        category: 'Architecture',
        priority: 'short_term',
        description: `Review and fix ${architectureFindings.length} architecture violations for better maintainability`,
        estimated_effort: `${architectureFindings.length * 0.5} hours`
      });
    }

    // Documentation recommendations
    const documentationFindings = findings.filter(f => f.agent === 'documentation');
    if (documentationFindings.length > 0) {
      recommendations.push({
        category: 'Documentation',
        priority: 'short_term',
        description: `Update documentation to resolve ${documentationFindings.length} documentation issues`,
        estimated_effort: `${documentationFindings.length * 0.25} hours`
      });
    }

    // Overall improvement recommendations
    if (scoring.overall_score < 80) {
      recommendations.push({
        category: 'Overall Quality',
        priority: 'long_term',
        description: 'Consider establishing better code review practices and automated testing to improve overall code quality',
        estimated_effort: '1 week'
      });
    }

    return recommendations;
  }

  /**
   * Calculate agent contributions
   */
  private calculateAgentContributions(reports: AgentReports, findings: AgentFinding[]): Record<string, any> {
    const contributions: Record<string, any> = {};

    // Security contributions
    if (reports.security) {
      const securityFindings = findings.filter(f => f.agent === 'security');
      const severityBreakdown = this.getSeverityBreakdown(securityFindings);
      contributions.security = {
        findings_count: securityFindings.length,
        severity_breakdown: severityBreakdown,
        top_issues: securityFindings.slice(0, 3).map(f => f.description),
        score_contribution: this.calculateScoreContribution('security', severityBreakdown)
      };
    }

    // Quality contributions
    if (reports.quality) {
      const qualityFindings = findings.filter(f => f.agent === 'quality');
      const severityBreakdown = this.getSeverityBreakdown(qualityFindings);
      contributions.quality = {
        findings_count: qualityFindings.length,
        severity_breakdown: severityBreakdown,
        top_issues: qualityFindings.slice(0, 3).map(f => f.description),
        score_contribution: this.calculateScoreContribution('quality', severityBreakdown)
      };
    }

    // Architecture contributions
    if (reports.architecture) {
      const architectureFindings = findings.filter(f => f.agent === 'architecture');
      const severityBreakdown = this.getSeverityBreakdown(architectureFindings);
      contributions.architecture = {
        findings_count: architectureFindings.length,
        severity_breakdown: severityBreakdown,
        top_issues: architectureFindings.slice(0, 3).map(f => f.description),
        score_contribution: this.calculateScoreContribution('architecture', severityBreakdown)
      };
    }

    // Documentation contributions
    if (reports.documentation) {
      const documentationFindings = findings.filter(f => f.agent === 'documentation');
      const severityBreakdown = this.getSeverityBreakdown(documentationFindings);
      contributions.documentation = {
        findings_count: documentationFindings.length,
        severity_breakdown: severityBreakdown,
        top_issues: documentationFindings.slice(0, 3).map(f => f.description),
        score_contribution: this.calculateScoreContribution('documentation', severityBreakdown)
      };
    }

    return contributions;
  }

  /**
   * Get severity breakdown for findings
   */
  private getSeverityBreakdown(findings: AgentFinding[]): Record<string, number> {
    const breakdown = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const finding of findings) {
      breakdown[finding.severity]++;
    }

    return breakdown;
  }

  /**
   * Calculate score contribution for an agent
   */
  private calculateScoreContribution(agent: string, severityBreakdown: Record<string, number>): number {
    const weights = { critical: 20, high: 10, medium: 5, low: 1 };

    let penalty = 0;
    penalty += severityBreakdown.critical * weights.critical;
    penalty += severityBreakdown.high * weights.high;
    penalty += severityBreakdown.medium * weights.medium;
    penalty += severityBreakdown.low * weights.low;

    return Math.max(0, 100 - penalty);
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
      total_tokens_used: 0, // Would be calculated from LLM usage
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

    const qualityFindings = findings.filter(f => f.agent === 'quality');
    if (qualityFindings.length <= 2) {
      infoItems.push({
        agent: 'quality',
        type: 'good-code-quality',
        description: 'Good code quality with minimal issues',
        positive_note: true
      });
    }

    const architectureFindings = findings.filter(f => f.agent === 'architecture');
    if (architectureFindings.length === 0) {
      infoItems.push({
        agent: 'architecture',
        type: 'good-architecture',
        description: 'No architecture violations detected',
        positive_note: true
      });
    }

    const documentationFindings = findings.filter(f => f.agent === 'documentation');
    if (documentationFindings.length === 0) {
      infoItems.push({
        agent: 'documentation',
        type: 'good-documentation',
        description: 'Documentation is complete and accurate',
        positive_note: true
      });
    }

    return infoItems;
  }

  /**
   * Validate quality gates
   */
  private validateQualityGates(synthesisResult: SynthesisResult): QualityGateResult {
    const criticalBlocking: string[] = [];
    const warnings: string[] = [];
    let passed = true;

    // Zero errors tolerance
    if (this.config.quality_gates.zero_errors_tolerance) {
      const totalCritical = synthesisResult.critical_issues.length;
      if (totalCritical > 0) {
        criticalBlocking.push(`${totalCritical} critical issues found`);
        passed = false;
      }
    }

    // Security blocking
    if (this.config.quality_gates.security_blocking) {
      const securityIssues = synthesisResult.metrics.security_findings;
      if (securityIssues > 0) {
        criticalBlocking.push(`${securityIssues} security issues must be resolved`);
        passed = false;
      }
    }

    // Architecture compliance
    if (this.config.quality_gates.architecture_compliance) {
      const architectureViolations = synthesisResult.metrics.architecture_violations;
      if (architectureViolations > 5) {
        warnings.push(`High number of architecture violations: ${architectureViolations}`);
      }
    }

    // Documentation required
    if (this.config.quality_gates.documentation_required) {
      const documentationGaps = synthesisResult.metrics.documentation_gaps;
      if (documentationGaps > 0) {
        warnings.push(`${documentationGaps} documentation issues should be addressed`);
      }
    }

    return {
      passed,
      critical_blocking: criticalBlocking,
      warnings,
      gate_details: {
        zero_errors_left: synthesisResult.critical_issues.length === 0,
        security_gate: synthesisResult.metrics.security_findings === 0,
        quality_gate: synthesisResult.metrics.quality_issues <= 5,
        architecture_gate: synthesisResult.metrics.architecture_violations <= 3,
        documentation_gate: synthesisResult.metrics.documentation_gaps <= 2
      }
    };
  }

  /**
   * Generate structured PR Review Report
   */
  private generatePRReviewReport(
    taskId: string,
    prMetadata: PRMetadata,
    synthesisResult: SynthesisResult,
    qualityGateResult: QualityGateResult
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
        critical_issues: synthesisResult.critical_issues as any,
        medium_issues: synthesisResult.medium_issues as any,
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

    // Medium Issues
    if (report.synthesis.medium_issues.length > 0) {
      sections.push('## ⚠️ Medium Priority Issues');
      for (const issue of report.synthesis.medium_issues) {
        sections.push(`### ${issue.type}`);
        sections.push(`**Agent:** ${issue.agent}`);
        sections.push(`**File:** ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
        sections.push(`**Description:** ${issue.description}`);
        if (issue.suggestion) {
          sections.push(`**Suggestion:** ${issue.suggestion}`);
        }
        sections.push('');
      }
    }

    // Positive Notes
    const positiveNotes = report.synthesis.info_items.filter(item => item.positive_note);
    if (positiveNotes.length > 0) {
      sections.push('## ✅ Positive Notes');
      for (const note of positiveNotes) {
        sections.push(`- **${note.agent}:** ${note.description}`);
      }
      sections.push('');
    }

    // Checklist
    if (report.checklist.length > 0) {
      sections.push('## Checklist');
      for (const item of report.checklist) {
        const priority = this.formatPriority(item.priority);
        const status = item.completed ? '✅' : '⏳';
        sections.push(`${status} ${priority} **${item.item}**`);
        if (item.assignee) {
          sections.push(`   - *Assignee:* ${item.assignee}`);
        }
        if (item.due_date) {
          sections.push(`   - *Due:* ${item.due_date}`);
        }
      }
      sections.push('');
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      sections.push('## Recommendations');
      for (const rec of report.recommendations) {
        sections.push(`### ${rec.category} (${this.formatPriority(rec.priority)})`);
        sections.push(rec.description);
        sections.push(`**Estimated Effort:** ${rec.estimated_effort}`);
        sections.push('');
      }
    }

    // Metrics
    sections.push('## Metrics');
    sections.push(`- **Security Findings:** ${report.metrics.security_findings}`);
    sections.push(`- **Quality Issues:** ${report.metrics.quality_issues}`);
    sections.push(`- **Architecture Violations:** ${report.metrics.architecture_violations}`);
    sections.push(`- **Documentation Gaps:** ${report.metrics.documentation_gaps}`);
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
   * Format priority for display
   */
  private formatPriority(priority: string): string {
    switch (priority) {
      case 'critical': return '🔴 Critical';
      case 'high': return '🟠 High';
      case 'medium': return '🟡 Medium';
      case 'low': return '🟢 Low';
      case 'immediate': return '🔴 Immediate';
      case 'short_term': return '🟡 Short-term';
      case 'long_term': return '🟢 Long-term';
      default: return priority;
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
   * Update configuration with task-specific settings
   */
  private updateConfig(taskConfig: Partial<SynthesisConfig>): void {
    this.config = {
      ...this.config,
      ...taskConfig,
      scoring: {
        ...this.config.scoring,
        ...taskConfig.scoring
      },
      thresholds: {
        ...this.config.thresholds,
        ...taskConfig.thresholds
      },
      quality_gates: {
        ...this.config.quality_gates,
        ...taskConfig.quality_gates
      },
      output: {
        ...this.config.output,
        ...taskConfig.output
      }
    };
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): SynthesisConfig {
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
      },
      quality_gates: {
        zero_errors_tolerance: true,
        security_blocking: true,
        documentation_required: false,
        architecture_compliance: true
      },
      output: {
        include_agent_details: true,
        include_recommendations: true,
        include_checklist: true,
        markdown_format: true
      }
    };
  }
}