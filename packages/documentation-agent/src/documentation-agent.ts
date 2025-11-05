/**
 * Documentation Agent
 * Analyzes OpenAPI specifications, detects breaking changes, and generates changelogs
 */

import { DocumentationSocketClient } from './socket-client.js';
import {
  DocumentationConfig,
  DocumentationFinding,
  DocumentationTaskData,
  DocumentationResult,
  AgentCapabilities,
  OpenAPIDocument,
  SemVerRecommendation,
  Changelog
} from './types.js';
import { OpenAPIParser } from './openapi-parser.js';
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
  defaultMeta: { service: 'documentation-agent' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new DailyRotateFile({
      filename: '/tmp/pit-crew-documentation-agent-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

export class DocumentationAgent extends DocumentationSocketClient {
  private config: DocumentationConfig;
  private openAPIParser: OpenAPIParser;
  private findings: DocumentationFinding[] = [];

  constructor(socketPath: string) {
    super(socketPath, 'documentation');
    this.config = this.createDefaultConfig();
    this.openAPIParser = new OpenAPIParser(this.config.maxFileSizeMb);
  }

  /**
   * Get agent capabilities
   */
  protected getCapabilities(): AgentCapabilities {
    return {
      supportsHeartbeat: true,
      supportsTasks: true,
      supportsEvents: true,
      tools: [
        '@apidevtools/swagger-parser',
        'semver',
        'simple-git',
        'openapi-validator',
        'changelog-generator'
      ],
      languages: ['json', 'yaml', 'typescript', 'javascript'],
      features: [
        'openapi-validation',
        'breaking-change-detection',
        'semver-analysis',
        'changelog-generation',
        'api-documentation-review'
      ]
    };
  }

  /**
   * Handle documentation analysis task
   */
  async handleTask(taskId: string, taskData: DocumentationTaskData): Promise<void> {
    logger.info(`Starting documentation analysis task: ${taskId}`);

    const startTime = Date.now();

    try {
      // Parse task configuration
      const scope = taskData.scope || [];
      const context = taskData.context || {};
      const outputFile = taskData.output || '';
      const taskConfig = taskData.config || {};

      // Update configuration with task-specific settings
      this.updateConfig(taskConfig);

      // Filter scope to OpenAPI files
      const openAPIFiles = await this.filterOpenAPIFiles(scope);

      if (openAPIFiles.length === 0) {
        logger.warning('No OpenAPI files found in scope');
        this.sendTaskResponse(taskId, 'done', {
          findings_count: 0,
          message: 'No OpenAPI files found for analysis',
          tools_used: []
        });
        return;
      }

      logger.info(`Found ${openAPIFiles.length} OpenAPI files to analyze`);

      // Run documentation analysis
      const results = await this.runDocumentationAnalysis(openAPIFiles, context);

      // Generate structured report
      const report = this.generateDocumentationReport(taskId, scope, context, results);

      // Save results to output file
      if (outputFile) {
        await this.saveResults(report, outputFile);
        logger.info(`Results saved to: ${outputFile}`);
      }

      // Send response
      const durationMs = Date.now() - startTime;
      this.sendTaskResponse(taskId, 'done', {
        findings_count: this.findings.length,
        severity_breakdown: this.getSeverityBreakdown(),
        category_breakdown: this.getCategoryBreakdown(),
        tools_used: results.toolsUsed,
        output_file: outputFile,
        openapi_files_analyzed: openAPIFiles.length,
        semver_recommendation: results.semverRecommendation,
        changelog_generated: !!results.changelog,
        analysis_summary: results.analysisSummary
      }, durationMs);

      logger.info(`Documentation analysis completed: ${this.findings.length} findings`);

    } catch (error) {
      logger.error(`Documentation analysis failed:`, error);
      const durationMs = Date.now() - startTime;
      this.sendTaskResponse(taskId, 'failed', {
        error: (error as Error).message,
        error_type: (error as Error).constructor.name
      }, durationMs);
    }
  }

  /**
   * Run comprehensive documentation analysis
   */
  private async runDocumentationAnalysis(
    openAPIFiles: string[],
    context: any
  ): Promise<{
    findings: DocumentationFinding[];
    toolsUsed: string[];
    openAPIDocs: { old?: OpenAPIDocument; new?: OpenAPIDocument };
    semverRecommendation?: SemVerRecommendation;
    changelog?: Changelog;
    analysisSummary: string;
  }> {
    const toolsUsed = new Set<string>();
    const findings: DocumentationFinding[] = [];
    let oldDoc: OpenAPIDocument | undefined;
    let newDoc: OpenAPIDocument | undefined;
    let semverRecommendation: SemVerRecommendation | undefined;
    let changelog: Changelog | undefined;

    // Analyze each OpenAPI file
    for (const filePath of openAPIFiles) {
      logger.info(`Analyzing OpenAPI file: ${filePath}`);

      // Parse and validate current document
      const { document, validationErrors } = await this.openAPIParser.parseDocument(filePath);
      findings.push(...validationErrors);
      toolsUsed.add('@apidevtools/swagger-parser');

      if (openAPIFiles.length === 1) {
        newDoc = document;

        // Try to find previous version for comparison
        if (context.baseCommit) {
          try {
            const oldFilePath = await this.getPreviousVersion(filePath, context.baseCommit);
            if (oldFilePath) {
              const { document: oldDocument } = await this.openAPIParser.parseDocument(oldFilePath);
              oldDoc = oldDocument;

              // Compare documents and detect changes
              const comparisonFindings = this.openAPIParser.compareDocuments(oldDoc, newDoc, filePath);
              findings.push(...comparisonFindings);
              toolsUsed.add('document-comparison');

              // Generate semver recommendation
              semverRecommendation = this.generateSemVerRecommendation(oldDoc, newDoc, findings);
              toolsUsed.add('semver-analysis');

              // Generate changelog
              changelog = await this.generateChangelog(oldDoc, newDoc, findings, context);
              toolsUsed.add('changelog-generation');
            }
          } catch (error) {
            logger.warn(`Failed to compare with previous version: ${(error as Error).message}`);
          }
        }
      }
    }

    // Store findings
    this.findings = findings;

    // Generate analysis summary
    const analysisSummary = this.generateAnalysisSummary(findings, toolsUsed);

    return {
      findings,
      toolsUsed: Array.from(toolsUsed),
      openAPIDocs: { old: oldDoc || undefined, new: newDoc || undefined },
      semverRecommendation,
      changelog,
      analysisSummary
    };
  }

  /**
   * Filter files to only OpenAPI specifications
   */
  private async filterOpenAPIFiles(scope: string[]): Promise<string[]> {
    const openAPIFiles: string[] = [];
    const repoRoot = process.cwd();

    for (const filePattern of scope) {
      let absolutePath = filePattern;

      // Convert relative patterns to absolute paths
      if (!filePattern.startsWith('/')) {
        absolutePath = join(repoRoot, filePattern);
      }

      try {
        const stats = await fs.stat(absolutePath);

        if (stats.isFile()) {
          if (OpenAPIParser.isOpenAPIFile(absolutePath)) {
            openAPIFiles.push(absolutePath);
          }
        } else if (stats.isDirectory()) {
          // Recursively find OpenAPI files
          const dirFiles = await this.findOpenAPIFilesInDirectory(absolutePath);
          openAPIFiles.push(...dirFiles);
        }
      } catch (error) {
        logger.warn(`Failed to access ${absolutePath}: ${(error as Error).message}`);
      }
    }

    return [...new Set(openAPIFiles)]; // Remove duplicates
  }

  /**
   * Find OpenAPI files in a directory recursively
   */
  private async findOpenAPIFilesInDirectory(dirPath: string): Promise<string[]> {
    const openAPIFiles: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isFile() && OpenAPIParser.isOpenAPIFile(fullPath)) {
          openAPIFiles.push(fullPath);
        } else if (entry.isDirectory()) {
          // Skip common non-relevant directories
          if (!['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(entry.name)) {
            const subFiles = await this.findOpenAPIFilesInDirectory(fullPath);
            openAPIFiles.push(...subFiles);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to read directory ${dirPath}: ${(error as Error).message}`);
    }

    return openAPIFiles;
  }

  /**
   * Get previous version of a file from git
   */
  private async getPreviousVersion(filePath: string, baseCommit: string): Promise<string | null> {
    try {
      // This would integrate with git to get the previous version
      // For now, return null (can be implemented with simple-git)
      logger.info(`Getting previous version of ${filePath} from commit ${baseCommit}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get previous version: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Generate semantic versioning recommendation
   */
  private generateSemVerRecommendation(
    oldDoc: OpenAPIDocument,
    newDoc: OpenAPIDocument,
    findings: DocumentationFinding[]
  ): SemVerRecommendation | undefined {
    if (!this.config.semverAnalysis.autoRecommend) {
      return undefined;
    }

    const breakingChanges = findings.filter(f =>
      f.category === 'breaking-change' && f.severity === 'error'
    ).length;

    const deprecations = findings.filter(f =>
      f.category === 'deprecation'
    ).length;

    const additions = findings.filter(f =>
      f.changeType === 'added'
    ).length;

    const currentVersion = oldDoc?.version || '1.0.0';

    // Simple semver logic (can be enhanced with semver library)
    let recommendedVersion = currentVersion;
    let reason = '';

    if (breakingChanges > 0) {
      // Major version bump
      const versionParts = currentVersion.split('.').map(Number);
      versionParts[0] = (versionParts[0] || 1) + 1;
      versionParts[1] = 0;
      versionParts[2] = 0;
      recommendedVersion = versionParts.join('.');
      reason = `${breakingChanges} breaking changes detected`;
    } else if (deprecations > 0 || additions > 0) {
      // Minor version bump
      const versionParts = currentVersion.split('.').map(Number);
      versionParts[1] = (versionParts[1] || 0) + 1;
      versionParts[2] = 0;
      recommendedVersion = versionParts.join('.');
      reason = `${deprecations} deprecations and ${additions} additions detected`;
    } else {
      // Patch version bump
      const versionParts = currentVersion.split('.').map(Number);
      versionParts[2] = (versionParts[2] || 0) + 1;
      recommendedVersion = versionParts.join('.');
      reason = 'Minor improvements and bug fixes';
    }

    return {
      current: currentVersion,
      recommended: recommendedVersion,
      reason,
      breakingChanges,
      deprecations,
      additions,
      confidence: this.calculateRecommendationConfidence(findings)
    };
  }

  /**
   * Generate changelog
   */
  private async generateChangelog(
    oldDoc: OpenAPIDocument,
    newDoc: OpenAPIDocument,
    findings: DocumentationFinding[],
    context: any
  ): Promise<Changelog | undefined> {
    // This would integrate with git and LLM for intelligent changelog generation
    // For now, return a basic changelog structure
    const entries = [];

    for (const finding of findings) {
      if (finding.changeType) {
        let entryType: 'added' | 'removed' | 'changed' | 'deprecated';

        if (finding.changeType === 'added') {
          entryType = 'added';
        } else if (finding.changeType === 'removed') {
          entryType = 'removed';
        } else if (finding.category === 'deprecation') {
          entryType = 'deprecated';
        } else {
          entryType = 'changed';
        }

        entries.push({
          type: entryType,
          message: finding.message,
          scope: finding.metadata?.path || 'API',
          breaking: finding.category === 'breaking-change'
        });
      }
    }

    return {
      version: newDoc.version || 'unspecified',
      date: new Date().toISOString().split('T')[0],
      description: `Changes from ${oldDoc.version || 'previous'} to ${newDoc.version || 'current'}`,
      entries,
      summary: {
        total: entries.length,
        breaking: entries.filter(e => e.breaking).length,
        added: entries.filter(e => e.type === 'added').length,
        changed: entries.filter(e => e.type === 'changed').length,
        deprecated: entries.filter(e => e.type === 'deprecated').length,
        removed: entries.filter(e => e.type === 'removed').length,
        fixed: 0,
        security: 0
      }
    };
  }

  /**
   * Calculate confidence score for recommendations
   */
  private calculateRecommendationConfidence(findings: DocumentationFinding[]): number {
    // Simple confidence calculation based on finding consistency
    const totalFindings = findings.length;
    const breakingChanges = findings.filter(f => f.category === 'breaking-change').length;

    if (totalFindings === 0) return 1.0;
    if (breakingChanges > 0) return 0.9;

    return 0.8;
  }

  /**
   * Generate analysis summary
   */
  private generateAnalysisSummary(findings: DocumentationFinding[], toolsUsed: Set<string>): string {
    const severityBreakdown = this.getSeverityBreakdown();
    const categoryBreakdown = this.getCategoryBreakdown();

    const summary = (
      `Documentation analysis completed using ${Array.from(toolsUsed).join(', ')}.\n` +
      `Found ${findings.length} issues: ` +
      `${severityBreakdown.error} critical, ` +
      `${severityBreakdown.warning} warnings, ` +
      `${severityBreakdown.info} info.\n` +
      `Category breakdown: ` +
      `${categoryBreakdown['breaking-change'] || 0} breaking changes, ` +
      `${categoryBreakdown.deprecation || 0} deprecations, ` +
      `${categoryBreakdown.validation || 0} validation errors.`
    );

    return summary;
  }

  /**
   * Generate structured documentation report
   */
  private generateDocumentationReport(
    taskId: string,
    scope: string[],
    context: any,
    results: any
  ): DocumentationResult {
    return {
      task: {
        id: taskId,
        startTime: Date.now(),
        endTime: Date.now(),
        durationMs: 0 // Will be set by caller
      },
      analysis: {
        filesAnalyzed: scope.length,
        findingsCount: this.findings.length,
        toolsUsed: results.toolsUsed,
        breakingChangesCount: this.findings.filter(f => f.category === 'breaking-change').length,
        deprecationsCount: this.findings.filter(f => f.category === 'deprecation').length
      },
      summary: {
        totalFindings: this.findings.length,
        severityBreakdown: this.getSeverityBreakdown(),
        categoryBreakdown: this.getCategoryBreakdown(),
        semverRecommendation: results.semverRecommendation
      },
      findings: this.findings,
      changelog: results.changelog,
      openApiDocs: results.openAPIDocs,
      analysisSummary: results.analysisSummary
    };
  }

  /**
   * Save results to output file
   */
  private async saveResults(results: DocumentationResult, outputFile: string): Promise<void> {
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
   * Get breakdown of findings by severity
   */
  private getSeverityBreakdown(): Record<string, number> {
    const breakdown = { error: 0, warning: 0, info: 0 };

    for (const finding of this.findings) {
      if (finding.severity in breakdown) {
        breakdown[finding.severity]++;
      }
    }

    return breakdown;
  }

  /**
   * Get breakdown of findings by category
   */
  private getCategoryBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};

    for (const finding of this.findings) {
      breakdown[finding.category] = (breakdown[finding.category] || 0) + 1;
    }

    return breakdown;
  }

  /**
   * Update configuration with task-specific settings
   */
  private updateConfig(taskConfig: Partial<DocumentationConfig>): void {
    this.config = {
      ...this.config,
      ...taskConfig,
      breakingChangeThresholds: {
        ...this.config.breakingChangeThresholds,
        ...taskConfig.breakingChangeThresholds
      },
      semverAnalysis: {
        ...this.config.semverAnalysis,
        ...taskConfig.semverAnalysis
      },
      changelogGeneration: {
        ...this.config.changelogGeneration,
        ...taskConfig.changelogGeneration
      }
    };
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): DocumentationConfig {
    return {
      timeoutSeconds: 60,
      maxFileSizeMb: 10,
      breakingChangeThresholds: {
        critical: 0,
        high: 2,
        medium: 5
      },
      semverAnalysis: {
        autoRecommend: true,
        considerBreakingChanges: true,
        considerDeprecations: true
      },
      changelogGeneration: {
        includeSummary: true,
        includeBreakingChanges: true,
        includeDeprecations: true,
        groupByType: true
      },
      outputFormat: 'json'
    };
  }
}