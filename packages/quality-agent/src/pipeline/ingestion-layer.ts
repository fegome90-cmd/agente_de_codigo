/**
 * SARIF Ingestion Layer - Capa 1: Ingesta
 *
 * Validates and normalizes SARIF reports from multiple agents.
 * Provides schema compliance checking and data normalization.
 *
 * @author Agente de Código - FASE 2
 * @since 2025-11-03
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';

// ============================================================================
// SARIF Schema Validation
// ============================================================================

const SARIFArtifactLocationSchema = z.object({
  uri: z.string(),
  uriBaseId: z.string().optional(),
});

const SARIFRegionSchema = z.object({
  startLine: z.number().optional(),
  startColumn: z.number().optional(),
  endLine: z.number().optional(),
  endColumn: z.number().optional(),
  byteOffset: z.number().optional(),
  byteLength: z.number().optional(),
  charOffset: z.number().optional(),
  charLength: z.number().optional(),
});

const SARIFPhysicalLocationSchema = z.object({
  artifactLocation: SARIFArtifactLocationSchema,
  region: SARIFRegionSchema.optional(),
  contextRegion: SARIFRegionSchema.optional(),
});

const SARIFLocationSchema = z.object({
  physicalLocation: SARIFPhysicalLocationSchema.optional(),
  logicalLocations: z.array(z.any()).optional(),
  fullyQualifiedLogicalName: z.string().optional(),
  decoratedName: z.string().optional(),
  properties: z.record(z.any()).optional(),
});

const SARIFMessageSchema = z.object({
  text: z.string(),
  markdown: z.string().optional(),
  id: z.string().optional(),
  arguments: z.array(z.string()).optional(),
});

const SARIFFixSchema = z.object({
  description: SARIFMessageSchema,
  artifactChanges: z.array(z.object({
    artifactLocation: SARIFArtifactLocationSchema,
    replacements: z.array(z.object({
      deletedRegion: SARIFRegionSchema,
      insertedContent: z.string().optional(),
    })),
  })),
});

const SARIFCodeFlowSchema = z.object({
  threadFlows: z.array(z.object({
    locations: z.array(z.object({
      location: z.object({
        physicalLocation: SARIFPhysicalLocationSchema.optional(),
        logicalLocations: z.array(z.any()).optional(),
        message: SARIFMessageSchema.optional(),
        properties: z.record(z.any()).optional(),
      }),
      state: z.record(z.any()).optional(),
      nestingLevel: z.number().optional(),
      executions: z.array(z.any()).optional(),
    })),
  })),
});

const SARIFResultSchema = z.object({
  ruleId: z.string(),
  ruleIndex: z.number().optional(),
  level: z.enum(['error', 'warning', 'note', 'none']),
  message: SARIFMessageSchema,
  locations: z.array(SARIFLocationSchema).optional(),
  partialFingerprints: z.record(z.string()).optional(),
  fingerprint: z.string().optional(),
  baselineState: z.enum(['new', 'unchanged', 'updated', 'absent']).optional(),
  propagatedSeverity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  rank: z.number().optional(),
  analysisTarget: SARIFArtifactLocationSchema.optional(),
  stationery: z.string().optional(),
  degreeOfAccuracy: z.enum(['unknown', 'high', 'medium', 'low']).optional(),
  webRequest: z.any().optional(),
  webResponse: z.any().optional(),
  kind: z.string().optional(),
  ifThreadedFlow: z.boolean().optional(),
  fix: SARIFFixSchema.optional(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: z.record(z.any()).optional(),
});

const SARIFRuleSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  shortDescription: SARIFMessageSchema.optional(),
  fullDescription: SARIFMessageSchema.optional(),
  helpUri: z.string().optional(),
  help: z.object({
    text: z.string().optional(),
    markdown: z.string().optional(),
  }).optional(),
  defaultConfiguration: z.object({
    level: z.enum(['error', 'warning', 'note', 'none']).optional(),
    enabled: z.boolean().optional(),
    rank: z.number().optional(),
    parameters: z.record(z.any()).optional(),
  }).optional(),
  relationships: z.array(z.any()).optional(),
  properties: z.record(z.any()).optional(),
});

const SARIFToolComponentSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  versionFormat: z.enum(['semver', 'build', 'majorMinorPatch']).optional(),
  semanticVersion: z.string().optional(),
  locale: z.string().optional(),
  downloadUri: z.string().optional(),
  informationUri: z.string().optional(),
  check: z.array(z.any()).optional(),
  driver: SARIFRuleSchema.optional(),
  rules: z.array(SARIFRuleSchema).optional(),
  taxonomies: z.array(z.any()).optional(),
  supportedTaxonomies: z.array(z.any()).optional(),
  language: z.string().optional(),
  properties: z.record(z.any()).optional(),
});

const SARIFToolSchema = z.object({
  driver: SARIFToolComponentSchema,
  extension: z.array(SARIFToolComponentSchema).optional(),
});

const SARIFArtifactSchema = z.object({
  location: SARIFArtifactLocationSchema,
  parentIndex: z.number().optional(),
  offset: z.number().optional(),
  length: z.number().optional(),
  roles: z.array(z.enum([
    'analysisTarget',
    'attachment',
    'responseFile',
    'resultFile',
    'standardStream',
    'tracedFile',
    'translationMetadata',
    'unmodified',
    'modified',
    'added',
    'deleted',
    'renamed',
    'inserted',
    'deleted',
  ])),
  mimeType: z.string().optional(),
  contents: z.object({
    text: z.string().optional(),
    binary: z.string().optional(),
  }).optional(),
  encoding: z.string().optional(),
  sourceLanguage: z.string().optional(),
  properties: z.record(z.any()).optional(),
});

const SARIFInvocationSchema = z.object({
  commandLine: z.string().optional(),
  commandLineArguments: z.array(z.string()).optional(),
  startTimeUtc: z.string().optional(),
  endTimeUtc: z.string().optional(),
  machine: z.string().optional(),
  account: z.string().optional(),
  processId: z.number().optional(),
  executableLocation: SARIFArtifactLocationSchema.optional(),
  workingDirectory: SARIFArtifactLocationSchema.optional(),
  environmentVariables: z.record(z.string()).optional(),
  stdin: SARIFArtifactLocationSchema.optional(),
  stdout: SARIFArtifactLocationSchema.optional(),
  stderr: SARIFArtifactLocationSchema.optional(),
  stdoutStderr: SARIFArtifactLocationSchema.optional(),
  exitCode: z.number().optional(),
  exitCodeDescription: z.string().optional(),
  exitCodeSymbolicName: z.string().optional(),
  processStartDeadline: z.string().optional(),
  executionSuccessful: z.boolean(),
  failureLevels: z.array(z.string()).optional(),
  outputConsumed: z.array(SARIFArtifactLocationSchema).optional(),
  properties: z.record(z.any()).optional(),
});

const SARIFRunSchema = z.object({
  tool: SARIFToolSchema,
  artifactLocations: z.array(SARIFArtifactLocationSchema).optional(),
  automations: z.array(z.any()).optional(),
  baselineFingerprint: z.string().optional(),
  columnKind: z.enum(['utf16CodeUnits', 'unicodeCodePoints']).optional(),
  conversion: z.any().optional(),
  id: z.string().optional(),
  language: z.string().optional(),
  logicalLocations: z.array(z.any()).optional(),
  newlineSequences: z.array(z.string()).optional(),
  originalUriBaseIds: z.record(SARIFArtifactLocationSchema).optional(),
  policies: z.array(z.any()).optional(),
  properties: z.record(z.any()).optional(),
  redactionTokens: z.array(z.string()).optional(),
  results: z.array(SARIFResultSchema).optional(),
  specialLocations: z.any().optional(),
  taxonomies: z.array(z.any()).optional(),
  invocations: z.array(SARIFInvocationSchema).optional(),
  artifacts: z.array(SARIFArtifactSchema).optional(),
  threadFlowLocations: z.array(z.any()).optional(),
  codeFlows: z.array(SARIFCodeFlowSchema).optional(),
});

const SARIFSchema = z.object({
  $schema: z.string().optional(),
  version: z.enum(['2.1.0', '2.0.0', '1.0.0']),
  schemas: z.array(z.string()).optional(),
  runs: z.array(SARIFRunSchema),
  inlineExternalProperties: z.array(z.any()).optional(),
  properties: z.record(z.any()).optional(),
});

// ============================================================================
// Normalized SARIF Types
// ============================================================================

export interface NormalizedFinding {
  id: string;
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  level: 'error' | 'warning' | 'note';
  message: string;
  messageMarkdown?: string;
  filePath: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  sourceAgent: string;
  toolName: string;
  toolVersion?: string;
  fixable: boolean;
  fixAvailable: boolean;
  properties: Record<string, any>;
}

export interface NormalizedRule {
  id: string;
  name?: string;
  description?: string;
  helpUri?: string;
  defaultLevel: 'error' | 'warning' | 'note';
  enabled: boolean;
  properties: Record<string, any>;
  toolName: string;
  toolVersion?: string;
}

export interface NormalizedArtifact {
  uri: string;
  roles: string[];
  mimeType?: string;
  length?: number;
  properties: Record<string, any>;
}

export interface NormalizedRun {
  toolName: string;
  toolVersion?: string;
  results: NormalizedFinding[];
  rules: NormalizedRule[];
  artifacts: NormalizedArtifact[];
  invocation: {
    startTime?: string;
    endTime?: string;
    successful: boolean;
    exitCode?: number;
    properties: Record<string, any>;
  };
  properties: Record<string, any>;
}

export interface IngestionResult {
  isValid: boolean;
  schemaVersion: string;
  runs: NormalizedRun[];
  summary: {
    totalRuns: number;
    totalFindings: number;
    totalRules: number;
    totalArtifacts: number;
    severityBreakdown: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    agentBreakdown: Record<string, number>;
    toolBreakdown: Record<string, {
      count: number;
      version?: string;
    }>;
  };
  errors: string[];
  warnings: string[];
  metadata: {
    validationTime: number;
    processedAt: string;
    sourceFiles: string[];
  };
}

// ============================================================================
// Ingestion Layer Implementation
// ============================================================================

export class SARIFIngestionLayer {
  private validationSchema = SARIFSchema;
  private maxFileSize = 10 * 1024 * 1024; // 10MB
  private maxResults = 10000; // Max findings per run

  /**
   * Validate and normalize a SARIF report
   */
  async ingest(sarifData: string, sourceFiles: string[] = []): Promise<IngestionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse JSON
      let sarif: any;
      try {
        sarif = JSON.parse(sarifData);
      } catch (e) {
        return {
          isValid: false,
          schemaVersion: 'unknown',
          runs: [],
          summary: this.createEmptySummary(),
          errors: [`Invalid JSON: ${(e as Error).message}`],
          warnings,
          metadata: {
            validationTime: Date.now() - startTime,
            processedAt: new Date().toISOString(),
            sourceFiles,
          },
        };
      }

      // Validate schema
      try {
        this.validationSchema.parse(sarif);
      } catch (e) {
        const validationErrors = (e as z.ZodError).errors.map(
          err => `${err.path.join('.')}: ${err.message}`
        );
        return {
          isValid: false,
          schemaVersion: sarif.version || 'unknown',
          runs: [],
          summary: this.createEmptySummary(),
          errors: validationErrors,
          warnings,
          metadata: {
            validationTime: Date.now() - startTime,
            processedAt: new Date().toISOString(),
            sourceFiles,
          },
        };
      }

      // Normalize runs
      const runs: NormalizedRun[] = [];
      const agentBreakdown: Record<string, number> = {};
      const toolBreakdown: Record<string, { count: number; version?: string }> = {};

      for (const run of sarif.runs) {
        const normalizedRun = this.normalizeRun(run);
        runs.push(normalizedRun);

        // Update breakdowns
        agentBreakdown[normalizedRun.toolName] =
          (agentBreakdown[normalizedRun.toolName] || 0) + normalizedRun.results.length;

        const toolKey = `${normalizedRun.toolName}${normalizedRun.toolVersion || ''}`;
        toolBreakdown[toolKey] = {
          count: (toolBreakdown[toolKey]?.count || 0) + normalizedRun.results.length,
          version: normalizedRun.toolVersion,
        };
      }

      // Calculate summary
      const summary = {
        totalRuns: runs.length,
        totalFindings: runs.reduce((sum, r) => sum + r.results.length, 0),
        totalRules: runs.reduce((sum, r) => sum + r.rules.length, 0),
        totalArtifacts: runs.reduce((sum, r) => sum + r.artifacts.length, 0),
        severityBreakdown: this.calculateSeverityBreakdown(runs),
        agentBreakdown,
        toolBreakdown,
      };

      // Check for warnings
      if (sarifData.length > this.maxFileSize) {
        warnings.push(`SARIF report size (${sarifData.length} bytes) exceeds recommended limit (${this.maxFileSize} bytes)`);
      }

      const totalResults = runs.reduce((sum, r) => sum + r.results.length, 0);
      if (totalResults > this.maxResults) {
        warnings.push(`Total findings (${totalResults}) exceed recommended limit (${this.maxResults})`);
      }

      logger.info('SARIF ingestion completed', {
        isValid: true,
        totalRuns: runs.length,
        totalFindings: summary.totalFindings,
        validationTime: Date.now() - startTime,
      });

      return {
        isValid: true,
        schemaVersion: sarif.version,
        runs,
        summary,
        errors,
        warnings,
        metadata: {
          validationTime: Date.now() - startTime,
          processedAt: new Date().toISOString(),
          sourceFiles,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('SARIF ingestion failed', { error: errorMessage });

      return {
        isValid: false,
        schemaVersion: 'unknown',
        runs: [],
        summary: this.createEmptySummary(),
        errors: [errorMessage],
        warnings,
        metadata: {
          validationTime: Date.now() - startTime,
          processedAt: new Date().toISOString(),
          sourceFiles,
        },
      };
    }
  }

  /**
   * Normalize a SARIF run
   */
  private normalizeRun(run: any): NormalizedRun {
    const toolName = run.tool?.driver?.name || 'unknown';
    const toolVersion = run.tool?.driver?.version;

    // Normalize results
    const results: NormalizedFinding[] = [];
    if (run.results) {
      for (let i = 0; i < run.results.length; i++) {
        if (i >= this.maxResults) {
          break; // Limit results
        }
        results.push(this.normalizeFinding(run.results[i], toolName, toolVersion));
      }
    }

    // Normalize rules
    const rules: NormalizedRule[] = [];
    if (run.tool?.driver?.rules) {
      for (const rule of run.tool.driver.rules) {
        rules.push(this.normalizeRule(rule, toolName, toolVersion));
      }
    }

    // Normalize artifacts
    const artifacts: NormalizedArtifact[] = [];
    if (run.artifacts) {
      for (const artifact of run.artifacts) {
        artifacts.push(this.normalizeArtifact(artifact));
      }
    }

    // Parse invocation
    const invocation = run.invocations?.[0] || {
      executionSuccessful: true,
      properties: {},
    };

    return {
      toolName,
      toolVersion,
      results,
      rules,
      artifacts,
      invocation: {
        startTime: invocation.startTimeUtc,
        endTime: invocation.endTimeUtc,
        successful: invocation.executionSuccessful,
        exitCode: invocation.exitCode,
        properties: invocation.properties || {},
      },
      properties: run.properties || {},
    };
  }

  /**
   * Normalize a SARIF finding
   */
  private normalizeFinding(result: any, toolName: string, toolVersion?: string): NormalizedFinding {
    const location = result.locations?.[0]?.physicalLocation;
    const artifactUri = location?.artifactLocation?.uri || 'unknown';
    const region = location?.region || {};

    return {
      id: this.generateFindingId(result, artifactUri, region.startLine || 1),
      ruleId: result.ruleId || 'unknown',
      severity: this.mapSeverityToNormalized(result.level),
      level: result.level,
      message: result.message?.text || 'No message',
      messageMarkdown: result.message?.markdown,
      filePath: artifactUri,
      line: region.startLine,
      column: region.startColumn,
      endLine: region.endLine,
      endColumn: region.endColumn,
      sourceAgent: toolName,
      toolName,
      toolVersion,
      fixable: !!result.fix,
      fixAvailable: !!result.fix,
      properties: result.properties || {},
    };
  }

  /**
   * Normalize a SARIF rule
   */
  private normalizeRule(rule: any, toolName: string, toolVersion?: string): NormalizedRule {
    return {
      id: rule.id,
      name: rule.name,
      description: rule.fullDescription?.text || rule.shortDescription?.text,
      helpUri: rule.helpUri,
      defaultLevel: rule.defaultConfiguration?.level || 'warning',
      enabled: rule.defaultConfiguration?.enabled !== false,
      properties: rule.properties || {},
      toolName,
      toolVersion,
    };
  }

  /**
   * Normalize a SARIF artifact
   */
  private normalizeArtifact(artifact: any): NormalizedArtifact {
    return {
      uri: artifact.location?.uri || 'unknown',
      roles: artifact.roles || [],
      mimeType: artifact.mimeType,
      length: artifact.length,
      properties: artifact.properties || {},
    };
  }

  /**
   * Calculate severity breakdown
   */
  private calculateSeverityBreakdown(runs: NormalizedRun[]): {
    critical: number;
    high: number;
    medium: number;
    low: number;
  } {
    const breakdown = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const run of runs) {
      for (const finding of run.results) {
        breakdown[finding.severity]++;
      }
    }

    return breakdown;
  }

  /**
   * Map SARIF severity levels to normalized levels
   */
  private mapSeverityToNormalized(level: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (level) {
      case 'error':
        return 'critical';
      case 'warning':
        return 'high';
      case 'note':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Generate a consistent finding ID
   */
  private generateFindingId(result: any, filePath: string, line?: number): string {
    const source = `${result.ruleId || 'unknown'}:${filePath}:${line || 0}`;
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
      const char = source.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Create empty summary
   */
  private createEmptySummary() {
    return {
      totalRuns: 0,
      totalFindings: 0,
      totalRules: 0,
      totalArtifacts: 0,
      severityBreakdown: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      agentBreakdown: {},
      toolBreakdown: {},
    };
  }
}
