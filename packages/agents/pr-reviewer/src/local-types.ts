/**
 * Simplified local types to replace @pit-crew/shared dependencies
 * Minimal implementation for PR Reviewer Agent functionality
 */

// Basic report interfaces that would normally come from @pit-crew/shared
export interface SARIFReport {
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
      };
    };
    results: Array<{
      level: 'error' | 'warning' | 'note' | 'none';
      ruleId: string;
      message: {
        text: string;
      };
      locations?: Array<{
        physicalLocation: {
          artifactLocation: {
            uri: string;
          };
          region?: {
            startLine?: number;
          };
        };
      }>;
    }>;
  }>;
}

export interface QualityReport {
  findings: Array<{
    severity: 'error' | 'warning' | 'info';
    rule: string;
    message: string;
    file: string;
    line?: number;
    column?: number;
    suggestion?: string;
  }>;
  metrics: {
    total_issues: number;
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface ArchitectureReport {
  analysis: {
    layers: Array<{
      name: string;
      violations: Array<{
        type: string;
        severity: 'error' | 'warning' | 'info';
        description: string;
        file: string;
        line?: number;
      }>;
    }>;
    dry_violations: Array<{
      duplicated_code: string;
      files: string[];
      lines: number[];
    }>;
  };
  metrics: {
    total_violations: number;
    layering_violations: number;
    dry_violations: number;
  };
}

export interface DocumentationReport {
  api_validation: {
    validation_errors: Array<{
      severity: 'error' | 'warning' | 'info';
      error: string;
      file: string;
      line?: number;
    }>;
    breaking_changes: Array<{
      type: string;
      description: string;
      impact: string;
      file?: string;
    }>;
  };
  coverage: {
    apis_documented: number;
    total_apis: number;
    coverage_percentage: number;
  };
}

export interface PRReviewReport {
  run_id: string;
  timestamp: string;
  agent: string;
  pr_metadata: PRMetadata;
  synthesis: {
    overall_score: number;
    decision: 'approve' | 'request_changes' | 'needs_work';
    summary: string;
    critical_issues: AgentFinding[];
    medium_issues: AgentFinding[];
    info_items: Array<{
      agent: string;
      type: string;
      description: string;
      positive_note: boolean;
    }>;
  };
  checklist: Array<{
    item: string;
    completed: boolean;
    priority: 'critical' | 'high' | 'medium' | 'low';
    assignee?: string;
    due_date?: string;
  }>;
  metrics: {
    security_findings: number;
    quality_issues: number;
    architecture_violations: number;
    documentation_gaps: number;
    total_tokens_used: number;
    analysis_duration_ms: number;
  };
  recommendations: Array<{
    category: string;
    priority: 'immediate' | 'short_term' | 'long_term';
    description: string;
    estimated_effort: string;
  }>;
}

export interface PRMetadata {
  number: number;
  title: string;
  description: string;
  author: string;
  base_branch: string;
  head_branch: string;
  changed_files: number;
  lines_added: number;
  lines_removed: number;
  commit_hash?: string;
  diff?: string;
}

export interface AgentFinding {
  agent: 'security' | 'quality' | 'architecture' | 'documentation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  file?: string;
  line?: number;
  column?: number;
  fix_suggestion?: string;
  suggestion?: string;
  confidence?: number;
}