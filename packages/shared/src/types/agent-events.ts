/**
 * Core types for agent events and communication
 * Based on F1 Pit Stop architecture plan
 */

import { z } from 'zod';

// Base agent event schema as defined in the plan
export const AgentEventSchema = z.object({
  ts: z.string(), // ISO 8601 timestamp
  agent: z.enum(['security', 'quality', 'documentation', 'architecture', 'pr_reviewer', 'observability']),
  run_id: z.string().regex(/^r-[a-f0-9]{4}$/), // Format: r-8f2c
  repo: z.string(),
  scope: z.array(z.string()),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  artifacts: z.array(z.string()).optional(),
  kpis: z.object({
    latency_ms: z.number(),
    tokens: z.number(),
    findings: z.number().optional(),
  }).optional(),
  error: z.string().optional(),
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;

// Task assignment from orchestrator to agent
export const AgentTaskSchema = z.object({
  task_id: z.string(),
  agent: z.enum(['security', 'quality', 'documentation', 'architecture', 'pr_reviewer', 'observability']),
  scope: z.array(z.string()),
  context: z.object({
    repo_root: z.string(),
    diff: z.string().optional(),
    commit_hash: z.string().optional(),
    branch: z.string().optional(),
    pr_number: z.number().optional(),
  }),
  output: z.string(), // Path to output file
  config: z.record(z.any()).optional(), // Agent-specific configuration
});

export type AgentTask = z.infer<typeof AgentTaskSchema>;

// Skill routing rules
export const SkillRuleSchema = z.object({
  condition: z.string(), // Expression language
  activate: z.array(z.enum(['security', 'quality', 'documentation', 'architecture', 'pr_reviewer'])),
  priority: z.number().min(1).max(10).default(5),
  conditions: z.array(z.string()).optional(),
});

export type SkillRule = z.infer<typeof SkillRuleSchema>;

// Git event from daemon to orchestrator
export const GitEventSchema = z.object({
  event: z.literal('task.completed'),
  repo: z.string(),
  branch: z.string(),
  commit: z.string(),
  files: z.array(z.string()),
  loc_changed: z.number(),
  timestamp: z.string(),
  author: z.string(),
  message: z.string(),
});

export type GitEvent = z.infer<typeof GitEventSchema>;

// Manual review trigger file schema (for orchestrator trigger files)
export const ManualReviewTriggerSchema = z.object({
  type: z.literal('manual_review'),
  timestamp: z.string(),
  scope: z.array(z.string()),
  options: z.object({
    agents: z.array(z.enum(['security', 'quality', 'documentation', 'architecture', 'pr_reviewer', 'observability'])).optional(),
    timeout_ms: z.number().optional(),
    output_dir: z.string().optional(),
  }).optional(),
  git_event: GitEventSchema,
});

export type ManualReviewTrigger = z.infer<typeof ManualReviewTriggerSchema>;

// Skill manifest for agent metadata
export const SkillManifestSchema = z.object({
  agent: z.string(),
  version: z.string(),
  capabilities: z.array(z.string()),
  triggers: z.object({
    auto: z.array(z.object({
      pattern: z.string(),
      description: z.string().optional(),
    })),
    explicit: z.boolean().default(true),
  }),
  kpis: z.object({
    target_latency_p95: z.number(),
    target_tokens_per_op: z.number(),
    expected_recall: z.number().optional(),
    expected_precision: z.number().optional(),
  }),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

// Circuit breaker state
export const CircuitBreakerStateSchema = z.enum(['closed', 'open', 'half_open']);

export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

export const CircuitBreakerConfigSchema = z.object({
  failure_threshold: z.number().default(5),
  timeout_ms: z.number().default(60000),
  half_open_requests: z.number().default(2),
  monitoring_period_ms: z.number().default(10000),
});

export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

// Agent health status
export const AgentHealthSchema = z.object({
  agent: z.string(),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  last_heartbeat: z.string(),
  uptime_ms: z.number(),
  memory_usage_mb: z.number(),
  cpu_usage_percent: z.number(),
  active_tasks: z.number(),
  completed_tasks: z.number(),
  failed_tasks: z.number(),
  average_latency_ms: z.number(),
  circuit_breaker_state: CircuitBreakerStateSchema,
});

export type AgentHealth = z.infer<typeof AgentHealthSchema>;