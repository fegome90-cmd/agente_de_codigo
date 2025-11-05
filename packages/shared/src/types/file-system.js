/**
 * File system types for /obs structure
 * Based on F1 Pit Stop architecture plan
 */
import { z } from 'zod';
// File artifact structure
export const ArtifactSchema = z.object({
    id: z.string(),
    run_id: z.string(),
    agent: z.string(),
    type: z.enum(['sarif', 'json', 'markdown', 'html', 'xml', 'csv']),
    filename: z.string(),
    path: z.string(),
    size_bytes: z.number(),
    checksum: z.string(),
    created_at: z.string(),
    metadata: z.record(z.any()).optional(),
});
// SARIF report structure (security findings)
export const SARIFReportSchema = z.object({
    version: z.string(),
    $schema: z.string().optional(),
    runs: z.array(z.object({
        tool: z.object({
            driver: z.object({
                name: z.string(),
                version: z.string(),
                informationUri: z.string().optional(),
            }),
        }),
        results: z.array(z.object({
            ruleId: z.string(),
            level: z.enum(['error', 'warning', 'note', 'none']),
            message: z.object({
                text: z.string(),
            }),
            locations: z.array(z.object({
                physicalLocation: z.object({
                    artifactLocation: z.object({
                        uri: z.string(),
                    }),
                    region: z.object({
                        startLine: z.number(),
                        startColumn: z.number(),
                        endLine: z.number().optional(),
                        endColumn: z.number().optional(),
                    }),
                }),
            })),
        })),
    })),
});
// Quality report structure
export const QualityReportSchema = z.object({
    run_id: z.string(),
    timestamp: z.string(),
    agent: z.literal('quality'),
    scope: z.array(z.string()),
    metrics: z.object({
        total_files: z.number(),
        files_with_issues: z.number(),
        total_issues: z.number(),
        severity_breakdown: z.record(z.number()),
        complexity_metrics: z.object({
            average_cyclomatic: z.number(),
            max_cyclomatic: z.number(),
            high_complexity_functions: z.number(),
        }),
        duplication_metrics: z.object({
            duplicated_lines: z.number(),
            duplication_percentage: z.number(),
            duplicate_blocks: z.number(),
        }),
        test_coverage: z.object({
            line_coverage: z.number().optional(),
            branch_coverage: z.number().optional(),
            function_coverage: z.number().optional(),
        }).optional(),
    }),
    findings: z.array(z.object({
        file: z.string(),
        line: z.number(),
        column: z.number().optional(),
        severity: z.enum(['error', 'warning', 'info']),
        rule: z.string(),
        message: z.string(),
        suggestion: z.string().optional(),
    })),
    summary: z.object({
        score: z.number(), // 0-100
        grade: z.enum(['A', 'B', 'C', 'D', 'F']),
        recommendations: z.array(z.string()),
    }),
});
// Architecture report structure
export const ArchitectureReportSchema = z.object({
    run_id: z.string(),
    timestamp: z.string(),
    agent: z.literal('architecture'),
    scope: z.array(z.string()),
    analysis: z.object({
        layers: z.array(z.object({
            name: z.string(),
            files: z.array(z.string()),
            violations: z.array(z.object({
                type: z.string(),
                description: z.string(),
                file: z.string(),
                line: z.number(),
                severity: z.enum(['error', 'warning', 'info']),
            })),
        })),
        patterns: z.object({
            detected: z.array(z.object({
                pattern: z.string(),
                files: z.array(z.string()),
                confidence: z.number(),
            })),
            missing: z.array(z.string()),
        }),
        dependencies: z.object({
            circular_dependencies: z.array(z.object({
                files: z.array(z.string()),
                description: z.string(),
            })),
            high_coupling: z.array(z.object({
                file: z.string(),
                dependencies: z.array(z.string()),
                coupling_score: z.number(),
            })),
        }),
        dry_violations: z.array(z.object({
            type: z.string(),
            duplicated_code: z.string(),
            locations: z.array(z.object({
                file: z.string(),
                start_line: z.number(),
                end_line: z.number(),
            })),
        })),
    }),
    recommendations: z.array(z.object({
        priority: z.enum(['high', 'medium', 'low']),
        category: z.string(),
        description: z.string(),
        file: z.string().optional(),
        effort_estimate: z.string().optional(),
    })),
    summary: z.object({
        health_score: z.number(), // 0-100
        critical_issues: z.number(),
        improvement_areas: z.array(z.string()),
    }),
});
// Documentation report structure
export const DocumentationReportSchema = z.object({
    run_id: z.string(),
    timestamp: z.string(),
    agent: z.literal('documentation'),
    scope: z.array(z.string()),
    coverage: z.object({
        total_documented_files: z.number(),
        total_files: z.number(),
        coverage_percentage: z.number(),
        documented_functions: z.number(),
        total_functions: z.number(),
    }),
    api_validation: z.object({
        openapi_files: z.array(z.string()),
        validation_errors: z.array(z.object({
            file: z.string(),
            line: z.number(),
            error: z.string(),
            severity: z.enum(['error', 'warning']),
        })),
        breaking_changes: z.array(z.object({
            type: z.string(),
            description: z.string(),
            impact: z.string(),
        })),
    }),
    changelog: z.object({
        generated: z.string(),
        entries: z.array(z.object({
            version: z.string(),
            date: z.string(),
            changes: z.array(z.string()),
            type: z.enum(['added', 'changed', 'deprecated', 'removed', 'fixed', 'security']),
        })),
    }),
    quality_metrics: z.object({
        readability_score: z.number(),
        completeness_score: z.number(),
        accuracy_score: z.number(),
    }),
    recommendations: z.array(z.string()),
    summary: z.object({
        overall_score: z.number(),
        status: z.enum(['excellent', 'good', 'needs_improvement', 'poor']),
    }),
});
// PR Review synthesis report
export const PRReviewReportSchema = z.object({
    run_id: z.string(),
    timestamp: z.string(),
    agent: z.literal('pr_reviewer'),
    pr_metadata: z.object({
        number: z.number(),
        title: z.string(),
        description: z.string(),
        author: z.string(),
        base_branch: z.string(),
        head_branch: z.string(),
        changed_files: z.number(),
        lines_added: z.number(),
        lines_removed: z.number(),
    }),
    synthesis: z.object({
        overall_score: z.number(), // 0-100
        decision: z.enum(['approve', 'request_changes', 'needs_work']),
        summary: z.string(),
        critical_issues: z.array(z.object({
            agent: z.string(),
            type: z.string(),
            description: z.string(),
            file: z.string(),
            line: z.number().optional(),
            fix_suggestion: z.string(),
        })),
        medium_issues: z.array(z.object({
            agent: z.string(),
            type: z.string(),
            description: z.string(),
            file: z.string(),
            line: z.number().optional(),
            suggestion: z.string(),
        })),
        info_items: z.array(z.object({
            agent: z.string(),
            type: z.string(),
            description: z.string(),
            positive_note: z.boolean(),
        })),
    }),
    checklist: z.array(z.object({
        item: z.string(),
        completed: z.boolean(),
        priority: z.enum(['critical', 'high', 'medium', 'low']),
        assignee: z.string().optional(),
        due_date: z.string().optional(),
    })),
    metrics: z.object({
        security_findings: z.number(),
        quality_issues: z.number(),
        architecture_violations: z.number(),
        documentation_gaps: z.number(),
        total_tokens_used: z.number(),
        analysis_duration_ms: z.number(),
    }),
    recommendations: z.array(z.object({
        category: z.string(),
        priority: z.enum(['immediate', 'short_term', 'long_term']),
        description: z.string(),
        estimated_effort: z.string(),
    })),
});
// MemTech memory layer types
export const MemTechL2Schema = z.object({
    layer: z.literal('L2'),
    type: z.enum(['session', 'cache', 'working_memory']),
    key: z.string(),
    value: z.any(),
    ttl_seconds: z.number().optional(),
    tags: z.array(z.string()).optional(),
    created_at: z.string(),
    accessed_at: z.string(),
    access_count: z.number().default(0),
});
export const MemTechL3Schema = z.object({
    layer: z.literal('L3'),
    type: z.enum(['knowledge', 'patterns', 'adrs', 'snapshots']),
    key: z.string(),
    content: z.any(),
    metadata: z.object({
        version: z.string(),
        author: z.string(),
        created_at: z.string(),
        updated_at: z.string(),
        tags: z.array(z.string()),
        relevance_score: z.number().optional(),
    }),
});
//# sourceMappingURL=file-system.js.map