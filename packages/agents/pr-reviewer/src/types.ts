/**
 * Types and interfaces for PR Reviewer Agent
 * Meta-agent that synthesizes findings from other agents
 */

import {
  SARIFReport,
  QualityReport,
  ArchitectureReport,
  DocumentationReport,
  PRReviewReport,
  AgentFinding as LocalAgentFinding,
  PRMetadata as LocalPRMetadata
} from './local-types.js';

// Re-export types for external use
export type {
  SARIFReport,
  QualityReport,
  ArchitectureReport,
  DocumentationReport,
  PRReviewReport
} from './local-types.js';

// Use type aliases to avoid conflicts
export type AgentFinding = LocalAgentFinding;
export type PRMetadata = LocalPRMetadata;

export interface SynthesisConfig {
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
  quality_gates: {
    zero_errors_tolerance: boolean;
    security_blocking: boolean;
    documentation_required: boolean;
    architecture_compliance: boolean;
  };
  output: {
    include_agent_details: boolean;
    include_recommendations: boolean;
    include_checklist: boolean;
    markdown_format: boolean;
  };
}

export interface AgentReports {
  security?: SARIFReport;
  quality?: QualityReport;
  architecture?: ArchitectureReport;
  documentation?: DocumentationReport;
}

// PRMetadata is now imported from local-types

export interface PRReviewerTaskData {
  scope: string[];
  context: {
    repo_root: string;
    diff?: string;
    commit_hash?: string;
    branch?: string;
    pr_number?: number;
    pr_title?: string;
    pr_description?: string;
    pr_author?: string;
    base_branch?: string;
    head_branch?: string;
    changed_files?: number;
    lines_added?: number;
    lines_removed?: number;
    pr_metadata?: PRMetadata;
  };
  output?: string;
  config?: Partial<SynthesisConfig>;
  agent_reports: {
    security_report_path?: string;
    quality_report_path?: string;
    architecture_report_path?: string;
    documentation_report_path?: string;
  };
}

export interface SynthesisResult {
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
  agent_contributions: {
    [key: string]: {
      findings_count: number;
      severity_breakdown: Record<string, number>;
      top_issues: string[];
      score_contribution: number;
    };
  };
}

export interface PRReviewerCapabilities {
  supportsHeartbeat: boolean;
  supportsTasks: boolean;
  supportsEvents: boolean;
  tools: string[];
  languages: string[];
  features: string[];
}

export interface QualityGateResult {
  passed: boolean;
  critical_blocking: string[];
  warnings: string[];
  gate_details: {
    zero_errors_left: boolean;
    security_gate: boolean;
    quality_gate: boolean;
    architecture_gate: boolean;
    documentation_gate: boolean;
  };
}

export interface ScoringBreakdown {
  security_score: number;
  quality_score: number;
  architecture_score: number;
  documentation_score: number;
  overall_score: number;
  penalty_points: number;
  bonus_points: number;
}