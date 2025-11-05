/**
 * Quality Agent Types
 * Defines interfaces for code quality analysis and SARIF output
 */

import { z } from 'zod';

// ============================================================================
// Core Types
// ============================================================================

export interface QualityTaskData {
  scope: string[];
  context: {
    repo_root: string;
    commit_hash?: string;
    branch?: string;
    pr_number?: number;
  };
  output: string;
  config?: QualityAgentConfig;
}

export interface QualityAnalysisResult {
  taskId: string;
  timestamp: string;
  duration: number;
  summary: QualitySummary;
  findings: QualityFinding[];
  metrics: QualityMetrics;
  sarifReport: any; // SARIF 2.1.0 format
  performance: {
    eslintDuration?: number;
    ruffDuration?: number;
    totalDuration: number;
  };
}

export interface QualitySummary {
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  fixableIssues: number;
  filesAnalyzed: number;
}

export interface QualityMetrics {
  maintainabilityIndex: number;
  technicalDebt: number;
  codeComplexity: {
    average: number;
    max: number;
    total: number;
  };
  duplication: {
    percentage: number;
    duplicatedLines: number;
    totalLines: number;
  };
  testCoverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

// ============================================================================
// Finding Types
// ============================================================================

export interface QualityFinding {
  id: string;
  ruleId: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: QualityCategory;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  source: 'eslint' | 'ruff' | 'custom';
  fixable: boolean;
  suggestion?: string;
  effortEstimate?: 'low' | 'medium' | 'high';
  codeContext?: string;
}

export type QualityCategory =
  | 'syntax'
  | 'error-prone'
  | 'complexity'
  | 'style'
  | 'performance'
  | 'security'
  | 'best-practices'
  | 'documentation';

// ============================================================================
// Configuration Types
// ============================================================================

export interface QualityAgentConfig {
  eslint: {
    enabled: boolean;
    configFile?: string;
    extends?: string[];
    rules?: Record<string, any>;
    timeout: number;
    maxMemory: number;
  };
  ruff: {
    enabled: boolean;
    select: string[];
    exclude: string[];
    lineLength: number;
    timeout: number;
    maxMemory: number;
  };
  thresholds: {
    maxErrors: number;
    maxWarnings: number;
    maxComplexity: number;
    minMaintainabilityIndex: number;
    maxDuplicationPercentage: number;
  };
  output: {
    format: 'sarif' | 'json' | 'console';
    includeCodeContext: boolean;
    groupByFile: boolean;
  };
}

// ============================================================================
// Tool Integration Types
// ============================================================================

export interface ESLintResult {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

export interface ESLintMessage {
  ruleId: string;
  severity: number;
  message: string;
  line: number;
  column: number;
  nodeType?: string;
  messageId?: string;
  endLine?: number;
  endColumn?: number;
  fix?: {
    range: [number, number];
    text: string;
  };
}

export interface RuffResult {
  filePath: string;
  violations: RuffViolation[];
  statistics: {
    errors: number;
    warnings: number;
    info: number;
    fixable: number;
  };
}

export interface RuffViolation {
  kind: string;
  code: string;
  message: string;
  span: {
    start: number;
    end: number;
  };
  level: 'error' | 'warning' | 'info';
  fix?: {
    message: string;
    edits: Array<{
      content: string;
      location: {
        start_line: number;
        start_column: number;
        end_line: number;
        end_column: number;
      };
    }>;
  };
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const QualityTaskDataSchema = z.object({
  scope: z.array(z.string()),
  context: z.object({
    repo_root: z.string(),
    commit_hash: z.string().optional(),
    branch: z.string().optional(),
    pr_number: z.number().optional(),
  }),
  output: z.string(),
  config: z.any().optional(),
});

export const QualityFindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  category: z.string(),
  filePath: z.string(),
  line: z.number(),
  column: z.number(),
  endLine: z.number().optional(),
  endColumn: z.number().optional(),
  source: z.enum(['eslint', 'ruff', 'custom']),
  fixable: z.boolean(),
  suggestion: z.string().optional(),
  effortEstimate: z.enum(['low', 'medium', 'high']).optional(),
  codeContext: z.string().optional(),
});

export const QualityAgentConfigSchema = z.object({
  eslint: z.object({
    enabled: z.boolean(),
    configFile: z.string().optional(),
    extends: z.array(z.string()).optional(),
    rules: z.record(z.any()).optional(),
    timeout: z.number(),
    maxMemory: z.number(),
  }),
  ruff: z.object({
    enabled: z.boolean(),
    select: z.array(z.string()),
    exclude: z.array(z.string()),
    lineLength: z.number(),
    timeout: z.number(),
    maxMemory: z.number(),
  }),
  thresholds: z.object({
    maxErrors: z.number(),
    maxWarnings: z.number(),
    maxComplexity: z.number(),
    minMaintainabilityIndex: z.number(),
    maxDuplicationPercentage: z.number(),
  }),
  output: z.object({
    format: z.enum(['sarif', 'json', 'console']),
    includeCodeContext: z.boolean(),
    groupByFile: z.boolean(),
  }),
});

// ============================================================================
// Export Types
// ============================================================================

export type {
  QualityTaskData as IQualityTaskData,
  QualityAnalysisResult as IQualityAnalysisResult,
  QualityFinding as IQualityFinding,
  QualityAgentConfig as IQualityAgentConfig,
  ESLintResult as IESLintResult,
  RuffResult as IRuffResult,
};