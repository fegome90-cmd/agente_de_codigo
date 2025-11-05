/**
 * Documentation Agent Types
 * Type definitions for OpenAPI analysis, breaking changes, and changelog generation
 */

export interface DocumentationConfig {
  timeoutSeconds: number;
  maxFileSizeMb: number;
  breakingChangeThresholds: {
    critical: number;      // 0 critical changes allowed
    high: number;          // Max high severity breaking changes
    medium: number;        // Max medium severity breaking changes
  };
  semverAnalysis: {
    autoRecommend: boolean;
    considerBreakingChanges: boolean;
    considerDeprecations: boolean;
  };
  changelogGeneration: {
    includeSummary: boolean;
    includeBreakingChanges: boolean;
    includeDeprecations: boolean;
    groupByType: boolean;
  };
  outputFormat: 'json' | 'sarif' | 'markdown';
}

export interface DocumentationFinding {
  ruleId: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  filePath: string;
  lineNumber?: number;
  columnNumber?: number;
  category: 'breaking-change' | 'deprecation' | 'api-change' | 'validation' | 'quality';
  changeType?: 'added' | 'removed' | 'modified' | 'deprecated';
  oldVersion?: string;
  newVersion?: string;
  metadata?: Record<string, any>;
}

export interface OpenAPIDocument {
  version: string;
  title: string;
  paths: Record<string, any>;
  components: Record<string, any>;
  info: Record<string, any>;
  servers?: Array<{url: string; description?: string}>;
  security?: any;
  tags?: Array<{name: string; description?: string}>;
}

export interface BreakingChange {
  ruleId: string;
  type: 'breaking' | 'deprecation' | 'addition' | 'removal';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  path: string;
  operation?: string;
  oldValue?: any;
  newValue?: any;
  suggestion?: string;
}

export interface SemVerRecommendation {
  current: string;
  recommended: string;
  reason: string;
  breakingChanges: number;
  deprecations: number;
  additions: number;
  confidence: number; // 0-1
}

export interface ChangelogEntry {
  type: 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security';
  message: string;
  scope?: string;
  breaking?: boolean;
  pullRequests?: string[];
  issues?: string[];
}

export interface Changelog {
  version: string;
  date: string;
  description?: string;
  entries: ChangelogEntry[];
  summary: {
    total: number;
    breaking: number;
    added: number;
    changed: number;
    deprecated: number;
    removed: number;
    fixed: number;
    security: number;
  };
}

export interface DocumentationTaskData {
  scope: string[];
  context: {
    repoRoot: string;
    commitHash: string;
    branch: string;
    baseCommit?: string;
    targetCommit?: string;
  };
  output: string;
  config?: Partial<DocumentationConfig>;
}

export interface DocumentationResult {
  task: {
    id: string;
    startTime: number;
    endTime: number;
    durationMs: number;
  };
  analysis: {
    filesAnalyzed: number;
    findingsCount: number;
    toolsUsed: string[];
    breakingChangesCount: number;
    deprecationsCount: number;
  };
  summary: {
    totalFindings: number;
    severityBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    semverRecommendation?: SemVerRecommendation;
  };
  findings: DocumentationFinding[];
  changelog?: Changelog;
  openApiDocs?: {
    old?: OpenAPIDocument;
    new?: OpenAPIDocument;
  };
  analysisSummary: string;
}

export interface IPCMessage {
  id: string;
  type: 'task' | 'event' | 'heartbeat' | 'ping' | 'pong';
  agent?: string;
  timestamp: string;
  data?: Record<string, any>;
}

export interface AgentCapabilities {
  supportsHeartbeat: boolean;
  supportsTasks: boolean;
  supportsEvents: boolean;
  tools: string[];
  languages: string[];
  features: string[];
}

export interface GitDiff {
  commitHash: string;
  author: string;
  date: string;
  message: string;
  files: Array<{
    path: string;
    changeType: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
  }>;
}