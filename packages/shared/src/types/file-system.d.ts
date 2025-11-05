/**
 * File system types for /obs structure
 * Based on F1 Pit Stop architecture plan
 */
import { z } from 'zod';
export declare const ArtifactSchema: z.ZodObject<{
    id: z.ZodString;
    run_id: z.ZodString;
    agent: z.ZodString;
    type: z.ZodEnum<["sarif", "json", "markdown", "html", "xml", "csv"]>;
    filename: z.ZodString;
    path: z.ZodString;
    size_bytes: z.ZodNumber;
    checksum: z.ZodString;
    created_at: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    agent: string;
    path: string;
    type: "sarif" | "json" | "markdown" | "html" | "xml" | "csv";
    run_id: string;
    id: string;
    filename: string;
    size_bytes: number;
    checksum: string;
    created_at: string;
    metadata?: Record<string, any> | undefined;
}, {
    agent: string;
    path: string;
    type: "sarif" | "json" | "markdown" | "html" | "xml" | "csv";
    run_id: string;
    id: string;
    filename: string;
    size_bytes: number;
    checksum: string;
    created_at: string;
    metadata?: Record<string, any> | undefined;
}>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export declare const SARIFReportSchema: z.ZodObject<{
    version: z.ZodString;
    $schema: z.ZodOptional<z.ZodString>;
    runs: z.ZodArray<z.ZodObject<{
        tool: z.ZodObject<{
            driver: z.ZodObject<{
                name: z.ZodString;
                version: z.ZodString;
                informationUri: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                version: string;
                name: string;
                informationUri?: string | undefined;
            }, {
                version: string;
                name: string;
                informationUri?: string | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            driver: {
                version: string;
                name: string;
                informationUri?: string | undefined;
            };
        }, {
            driver: {
                version: string;
                name: string;
                informationUri?: string | undefined;
            };
        }>;
        results: z.ZodArray<z.ZodObject<{
            ruleId: z.ZodString;
            level: z.ZodEnum<["error", "warning", "note", "none"]>;
            message: z.ZodObject<{
                text: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                text: string;
            }, {
                text: string;
            }>;
            locations: z.ZodArray<z.ZodObject<{
                physicalLocation: z.ZodObject<{
                    artifactLocation: z.ZodObject<{
                        uri: z.ZodString;
                    }, "strip", z.ZodTypeAny, {
                        uri: string;
                    }, {
                        uri: string;
                    }>;
                    region: z.ZodObject<{
                        startLine: z.ZodNumber;
                        startColumn: z.ZodNumber;
                        endLine: z.ZodOptional<z.ZodNumber>;
                        endColumn: z.ZodOptional<z.ZodNumber>;
                    }, "strip", z.ZodTypeAny, {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    }, {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    }>;
                }, "strip", z.ZodTypeAny, {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                }, {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                }>;
            }, "strip", z.ZodTypeAny, {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                };
            }, {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                };
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            message: {
                text: string;
            };
            level: "error" | "warning" | "note" | "none";
            ruleId: string;
            locations: {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                };
            }[];
        }, {
            message: {
                text: string;
            };
            level: "error" | "warning" | "note" | "none";
            ruleId: string;
            locations: {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                };
            }[];
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        tool: {
            driver: {
                version: string;
                name: string;
                informationUri?: string | undefined;
            };
        };
        results: {
            message: {
                text: string;
            };
            level: "error" | "warning" | "note" | "none";
            ruleId: string;
            locations: {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                };
            }[];
        }[];
    }, {
        tool: {
            driver: {
                version: string;
                name: string;
                informationUri?: string | undefined;
            };
        };
        results: {
            message: {
                text: string;
            };
            level: "error" | "warning" | "note" | "none";
            ruleId: string;
            locations: {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                };
            }[];
        }[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    version: string;
    runs: {
        tool: {
            driver: {
                version: string;
                name: string;
                informationUri?: string | undefined;
            };
        };
        results: {
            message: {
                text: string;
            };
            level: "error" | "warning" | "note" | "none";
            ruleId: string;
            locations: {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                };
            }[];
        }[];
    }[];
    $schema?: string | undefined;
}, {
    version: string;
    runs: {
        tool: {
            driver: {
                version: string;
                name: string;
                informationUri?: string | undefined;
            };
        };
        results: {
            message: {
                text: string;
            };
            level: "error" | "warning" | "note" | "none";
            ruleId: string;
            locations: {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region: {
                        startLine: number;
                        startColumn: number;
                        endLine?: number | undefined;
                        endColumn?: number | undefined;
                    };
                };
            }[];
        }[];
    }[];
    $schema?: string | undefined;
}>;
export type SARIFReport = z.infer<typeof SARIFReportSchema>;
export declare const QualityReportSchema: z.ZodObject<{
    run_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodLiteral<"quality">;
    scope: z.ZodArray<z.ZodString, "many">;
    metrics: z.ZodObject<{
        total_files: z.ZodNumber;
        files_with_issues: z.ZodNumber;
        total_issues: z.ZodNumber;
        severity_breakdown: z.ZodRecord<z.ZodString, z.ZodNumber>;
        complexity_metrics: z.ZodObject<{
            average_cyclomatic: z.ZodNumber;
            max_cyclomatic: z.ZodNumber;
            high_complexity_functions: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            average_cyclomatic: number;
            max_cyclomatic: number;
            high_complexity_functions: number;
        }, {
            average_cyclomatic: number;
            max_cyclomatic: number;
            high_complexity_functions: number;
        }>;
        duplication_metrics: z.ZodObject<{
            duplicated_lines: z.ZodNumber;
            duplication_percentage: z.ZodNumber;
            duplicate_blocks: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            duplicated_lines: number;
            duplication_percentage: number;
            duplicate_blocks: number;
        }, {
            duplicated_lines: number;
            duplication_percentage: number;
            duplicate_blocks: number;
        }>;
        test_coverage: z.ZodOptional<z.ZodObject<{
            line_coverage: z.ZodOptional<z.ZodNumber>;
            branch_coverage: z.ZodOptional<z.ZodNumber>;
            function_coverage: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            line_coverage?: number | undefined;
            branch_coverage?: number | undefined;
            function_coverage?: number | undefined;
        }, {
            line_coverage?: number | undefined;
            branch_coverage?: number | undefined;
            function_coverage?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        severity_breakdown: Record<string, number>;
        total_files: number;
        files_with_issues: number;
        total_issues: number;
        complexity_metrics: {
            average_cyclomatic: number;
            max_cyclomatic: number;
            high_complexity_functions: number;
        };
        duplication_metrics: {
            duplicated_lines: number;
            duplication_percentage: number;
            duplicate_blocks: number;
        };
        test_coverage?: {
            line_coverage?: number | undefined;
            branch_coverage?: number | undefined;
            function_coverage?: number | undefined;
        } | undefined;
    }, {
        severity_breakdown: Record<string, number>;
        total_files: number;
        files_with_issues: number;
        total_issues: number;
        complexity_metrics: {
            average_cyclomatic: number;
            max_cyclomatic: number;
            high_complexity_functions: number;
        };
        duplication_metrics: {
            duplicated_lines: number;
            duplication_percentage: number;
            duplicate_blocks: number;
        };
        test_coverage?: {
            line_coverage?: number | undefined;
            branch_coverage?: number | undefined;
            function_coverage?: number | undefined;
        } | undefined;
    }>;
    findings: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        column: z.ZodOptional<z.ZodNumber>;
        severity: z.ZodEnum<["error", "warning", "info"]>;
        rule: z.ZodString;
        message: z.ZodString;
        suggestion: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        severity: "error" | "info" | "warning";
        line: number;
        file: string;
        rule: string;
        column?: number | undefined;
        suggestion?: string | undefined;
    }, {
        message: string;
        severity: "error" | "info" | "warning";
        line: number;
        file: string;
        rule: string;
        column?: number | undefined;
        suggestion?: string | undefined;
    }>, "many">;
    summary: z.ZodObject<{
        score: z.ZodNumber;
        grade: z.ZodEnum<["A", "B", "C", "D", "F"]>;
        recommendations: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        score: number;
        grade: "A" | "B" | "C" | "D" | "F";
        recommendations: string[];
    }, {
        score: number;
        grade: "A" | "B" | "C" | "D" | "F";
        recommendations: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    agent: "quality";
    run_id: string;
    scope: string[];
    findings: {
        message: string;
        severity: "error" | "info" | "warning";
        line: number;
        file: string;
        rule: string;
        column?: number | undefined;
        suggestion?: string | undefined;
    }[];
    timestamp: string;
    metrics: {
        severity_breakdown: Record<string, number>;
        total_files: number;
        files_with_issues: number;
        total_issues: number;
        complexity_metrics: {
            average_cyclomatic: number;
            max_cyclomatic: number;
            high_complexity_functions: number;
        };
        duplication_metrics: {
            duplicated_lines: number;
            duplication_percentage: number;
            duplicate_blocks: number;
        };
        test_coverage?: {
            line_coverage?: number | undefined;
            branch_coverage?: number | undefined;
            function_coverage?: number | undefined;
        } | undefined;
    };
    summary: {
        score: number;
        grade: "A" | "B" | "C" | "D" | "F";
        recommendations: string[];
    };
}, {
    agent: "quality";
    run_id: string;
    scope: string[];
    findings: {
        message: string;
        severity: "error" | "info" | "warning";
        line: number;
        file: string;
        rule: string;
        column?: number | undefined;
        suggestion?: string | undefined;
    }[];
    timestamp: string;
    metrics: {
        severity_breakdown: Record<string, number>;
        total_files: number;
        files_with_issues: number;
        total_issues: number;
        complexity_metrics: {
            average_cyclomatic: number;
            max_cyclomatic: number;
            high_complexity_functions: number;
        };
        duplication_metrics: {
            duplicated_lines: number;
            duplication_percentage: number;
            duplicate_blocks: number;
        };
        test_coverage?: {
            line_coverage?: number | undefined;
            branch_coverage?: number | undefined;
            function_coverage?: number | undefined;
        } | undefined;
    };
    summary: {
        score: number;
        grade: "A" | "B" | "C" | "D" | "F";
        recommendations: string[];
    };
}>;
export type QualityReport = z.infer<typeof QualityReportSchema>;
export declare const ArchitectureReportSchema: z.ZodObject<{
    run_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodLiteral<"architecture">;
    scope: z.ZodArray<z.ZodString, "many">;
    analysis: z.ZodObject<{
        layers: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            files: z.ZodArray<z.ZodString, "many">;
            violations: z.ZodArray<z.ZodObject<{
                type: z.ZodString;
                description: z.ZodString;
                file: z.ZodString;
                line: z.ZodNumber;
                severity: z.ZodEnum<["error", "warning", "info"]>;
            }, "strip", z.ZodTypeAny, {
                type: string;
                description: string;
                severity: "error" | "info" | "warning";
                line: number;
                file: string;
            }, {
                type: string;
                description: string;
                severity: "error" | "info" | "warning";
                line: number;
                file: string;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            files: string[];
            name: string;
            violations: {
                type: string;
                description: string;
                severity: "error" | "info" | "warning";
                line: number;
                file: string;
            }[];
        }, {
            files: string[];
            name: string;
            violations: {
                type: string;
                description: string;
                severity: "error" | "info" | "warning";
                line: number;
                file: string;
            }[];
        }>, "many">;
        patterns: z.ZodObject<{
            detected: z.ZodArray<z.ZodObject<{
                pattern: z.ZodString;
                files: z.ZodArray<z.ZodString, "many">;
                confidence: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                files: string[];
                pattern: string;
                confidence: number;
            }, {
                files: string[];
                pattern: string;
                confidence: number;
            }>, "many">;
            missing: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            detected: {
                files: string[];
                pattern: string;
                confidence: number;
            }[];
            missing: string[];
        }, {
            detected: {
                files: string[];
                pattern: string;
                confidence: number;
            }[];
            missing: string[];
        }>;
        dependencies: z.ZodObject<{
            circular_dependencies: z.ZodArray<z.ZodObject<{
                files: z.ZodArray<z.ZodString, "many">;
                description: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                files: string[];
                description: string;
            }, {
                files: string[];
                description: string;
            }>, "many">;
            high_coupling: z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                dependencies: z.ZodArray<z.ZodString, "many">;
                coupling_score: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                file: string;
                dependencies: string[];
                coupling_score: number;
            }, {
                file: string;
                dependencies: string[];
                coupling_score: number;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            circular_dependencies: {
                files: string[];
                description: string;
            }[];
            high_coupling: {
                file: string;
                dependencies: string[];
                coupling_score: number;
            }[];
        }, {
            circular_dependencies: {
                files: string[];
                description: string;
            }[];
            high_coupling: {
                file: string;
                dependencies: string[];
                coupling_score: number;
            }[];
        }>;
        dry_violations: z.ZodArray<z.ZodObject<{
            type: z.ZodString;
            duplicated_code: z.ZodString;
            locations: z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                start_line: z.ZodNumber;
                end_line: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                file: string;
                start_line: number;
                end_line: number;
            }, {
                file: string;
                start_line: number;
                end_line: number;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            type: string;
            locations: {
                file: string;
                start_line: number;
                end_line: number;
            }[];
            duplicated_code: string;
        }, {
            type: string;
            locations: {
                file: string;
                start_line: number;
                end_line: number;
            }[];
            duplicated_code: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        layers: {
            files: string[];
            name: string;
            violations: {
                type: string;
                description: string;
                severity: "error" | "info" | "warning";
                line: number;
                file: string;
            }[];
        }[];
        patterns: {
            detected: {
                files: string[];
                pattern: string;
                confidence: number;
            }[];
            missing: string[];
        };
        dependencies: {
            circular_dependencies: {
                files: string[];
                description: string;
            }[];
            high_coupling: {
                file: string;
                dependencies: string[];
                coupling_score: number;
            }[];
        };
        dry_violations: {
            type: string;
            locations: {
                file: string;
                start_line: number;
                end_line: number;
            }[];
            duplicated_code: string;
        }[];
    }, {
        layers: {
            files: string[];
            name: string;
            violations: {
                type: string;
                description: string;
                severity: "error" | "info" | "warning";
                line: number;
                file: string;
            }[];
        }[];
        patterns: {
            detected: {
                files: string[];
                pattern: string;
                confidence: number;
            }[];
            missing: string[];
        };
        dependencies: {
            circular_dependencies: {
                files: string[];
                description: string;
            }[];
            high_coupling: {
                file: string;
                dependencies: string[];
                coupling_score: number;
            }[];
        };
        dry_violations: {
            type: string;
            locations: {
                file: string;
                start_line: number;
                end_line: number;
            }[];
            duplicated_code: string;
        }[];
    }>;
    recommendations: z.ZodArray<z.ZodObject<{
        priority: z.ZodEnum<["high", "medium", "low"]>;
        category: z.ZodString;
        description: z.ZodString;
        file: z.ZodOptional<z.ZodString>;
        effort_estimate: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        priority: "high" | "medium" | "low";
        description: string;
        category: string;
        file?: string | undefined;
        effort_estimate?: string | undefined;
    }, {
        priority: "high" | "medium" | "low";
        description: string;
        category: string;
        file?: string | undefined;
        effort_estimate?: string | undefined;
    }>, "many">;
    summary: z.ZodObject<{
        health_score: z.ZodNumber;
        critical_issues: z.ZodNumber;
        improvement_areas: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        health_score: number;
        critical_issues: number;
        improvement_areas: string[];
    }, {
        health_score: number;
        critical_issues: number;
        improvement_areas: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    agent: "architecture";
    run_id: string;
    scope: string[];
    timestamp: string;
    summary: {
        health_score: number;
        critical_issues: number;
        improvement_areas: string[];
    };
    recommendations: {
        priority: "high" | "medium" | "low";
        description: string;
        category: string;
        file?: string | undefined;
        effort_estimate?: string | undefined;
    }[];
    analysis: {
        layers: {
            files: string[];
            name: string;
            violations: {
                type: string;
                description: string;
                severity: "error" | "info" | "warning";
                line: number;
                file: string;
            }[];
        }[];
        patterns: {
            detected: {
                files: string[];
                pattern: string;
                confidence: number;
            }[];
            missing: string[];
        };
        dependencies: {
            circular_dependencies: {
                files: string[];
                description: string;
            }[];
            high_coupling: {
                file: string;
                dependencies: string[];
                coupling_score: number;
            }[];
        };
        dry_violations: {
            type: string;
            locations: {
                file: string;
                start_line: number;
                end_line: number;
            }[];
            duplicated_code: string;
        }[];
    };
}, {
    agent: "architecture";
    run_id: string;
    scope: string[];
    timestamp: string;
    summary: {
        health_score: number;
        critical_issues: number;
        improvement_areas: string[];
    };
    recommendations: {
        priority: "high" | "medium" | "low";
        description: string;
        category: string;
        file?: string | undefined;
        effort_estimate?: string | undefined;
    }[];
    analysis: {
        layers: {
            files: string[];
            name: string;
            violations: {
                type: string;
                description: string;
                severity: "error" | "info" | "warning";
                line: number;
                file: string;
            }[];
        }[];
        patterns: {
            detected: {
                files: string[];
                pattern: string;
                confidence: number;
            }[];
            missing: string[];
        };
        dependencies: {
            circular_dependencies: {
                files: string[];
                description: string;
            }[];
            high_coupling: {
                file: string;
                dependencies: string[];
                coupling_score: number;
            }[];
        };
        dry_violations: {
            type: string;
            locations: {
                file: string;
                start_line: number;
                end_line: number;
            }[];
            duplicated_code: string;
        }[];
    };
}>;
export type ArchitectureReport = z.infer<typeof ArchitectureReportSchema>;
export declare const DocumentationReportSchema: z.ZodObject<{
    run_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodLiteral<"documentation">;
    scope: z.ZodArray<z.ZodString, "many">;
    coverage: z.ZodObject<{
        total_documented_files: z.ZodNumber;
        total_files: z.ZodNumber;
        coverage_percentage: z.ZodNumber;
        documented_functions: z.ZodNumber;
        total_functions: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        total_files: number;
        total_documented_files: number;
        coverage_percentage: number;
        documented_functions: number;
        total_functions: number;
    }, {
        total_files: number;
        total_documented_files: number;
        coverage_percentage: number;
        documented_functions: number;
        total_functions: number;
    }>;
    api_validation: z.ZodObject<{
        openapi_files: z.ZodArray<z.ZodString, "many">;
        validation_errors: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            error: z.ZodString;
            severity: z.ZodEnum<["error", "warning"]>;
        }, "strip", z.ZodTypeAny, {
            error: string;
            severity: "error" | "warning";
            line: number;
            file: string;
        }, {
            error: string;
            severity: "error" | "warning";
            line: number;
            file: string;
        }>, "many">;
        breaking_changes: z.ZodArray<z.ZodObject<{
            type: z.ZodString;
            description: z.ZodString;
            impact: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: string;
            description: string;
            impact: string;
        }, {
            type: string;
            description: string;
            impact: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        openapi_files: string[];
        validation_errors: {
            error: string;
            severity: "error" | "warning";
            line: number;
            file: string;
        }[];
        breaking_changes: {
            type: string;
            description: string;
            impact: string;
        }[];
    }, {
        openapi_files: string[];
        validation_errors: {
            error: string;
            severity: "error" | "warning";
            line: number;
            file: string;
        }[];
        breaking_changes: {
            type: string;
            description: string;
            impact: string;
        }[];
    }>;
    changelog: z.ZodObject<{
        generated: z.ZodString;
        entries: z.ZodArray<z.ZodObject<{
            version: z.ZodString;
            date: z.ZodString;
            changes: z.ZodArray<z.ZodString, "many">;
            type: z.ZodEnum<["added", "changed", "deprecated", "removed", "fixed", "security"]>;
        }, "strip", z.ZodTypeAny, {
            type: "security" | "added" | "changed" | "deprecated" | "removed" | "fixed";
            date: string;
            version: string;
            changes: string[];
        }, {
            type: "security" | "added" | "changed" | "deprecated" | "removed" | "fixed";
            date: string;
            version: string;
            changes: string[];
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        entries: {
            type: "security" | "added" | "changed" | "deprecated" | "removed" | "fixed";
            date: string;
            version: string;
            changes: string[];
        }[];
        generated: string;
    }, {
        entries: {
            type: "security" | "added" | "changed" | "deprecated" | "removed" | "fixed";
            date: string;
            version: string;
            changes: string[];
        }[];
        generated: string;
    }>;
    quality_metrics: z.ZodObject<{
        readability_score: z.ZodNumber;
        completeness_score: z.ZodNumber;
        accuracy_score: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        accuracy_score: number;
        readability_score: number;
        completeness_score: number;
    }, {
        accuracy_score: number;
        readability_score: number;
        completeness_score: number;
    }>;
    recommendations: z.ZodArray<z.ZodString, "many">;
    summary: z.ZodObject<{
        overall_score: z.ZodNumber;
        status: z.ZodEnum<["excellent", "good", "needs_improvement", "poor"]>;
    }, "strip", z.ZodTypeAny, {
        status: "excellent" | "good" | "needs_improvement" | "poor";
        overall_score: number;
    }, {
        status: "excellent" | "good" | "needs_improvement" | "poor";
        overall_score: number;
    }>;
}, "strip", z.ZodTypeAny, {
    agent: "documentation";
    run_id: string;
    scope: string[];
    timestamp: string;
    quality_metrics: {
        accuracy_score: number;
        readability_score: number;
        completeness_score: number;
    };
    summary: {
        status: "excellent" | "good" | "needs_improvement" | "poor";
        overall_score: number;
    };
    recommendations: string[];
    coverage: {
        total_files: number;
        total_documented_files: number;
        coverage_percentage: number;
        documented_functions: number;
        total_functions: number;
    };
    api_validation: {
        openapi_files: string[];
        validation_errors: {
            error: string;
            severity: "error" | "warning";
            line: number;
            file: string;
        }[];
        breaking_changes: {
            type: string;
            description: string;
            impact: string;
        }[];
    };
    changelog: {
        entries: {
            type: "security" | "added" | "changed" | "deprecated" | "removed" | "fixed";
            date: string;
            version: string;
            changes: string[];
        }[];
        generated: string;
    };
}, {
    agent: "documentation";
    run_id: string;
    scope: string[];
    timestamp: string;
    quality_metrics: {
        accuracy_score: number;
        readability_score: number;
        completeness_score: number;
    };
    summary: {
        status: "excellent" | "good" | "needs_improvement" | "poor";
        overall_score: number;
    };
    recommendations: string[];
    coverage: {
        total_files: number;
        total_documented_files: number;
        coverage_percentage: number;
        documented_functions: number;
        total_functions: number;
    };
    api_validation: {
        openapi_files: string[];
        validation_errors: {
            error: string;
            severity: "error" | "warning";
            line: number;
            file: string;
        }[];
        breaking_changes: {
            type: string;
            description: string;
            impact: string;
        }[];
    };
    changelog: {
        entries: {
            type: "security" | "added" | "changed" | "deprecated" | "removed" | "fixed";
            date: string;
            version: string;
            changes: string[];
        }[];
        generated: string;
    };
}>;
export type DocumentationReport = z.infer<typeof DocumentationReportSchema>;
export declare const PRReviewReportSchema: z.ZodObject<{
    run_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodLiteral<"pr_reviewer">;
    pr_metadata: z.ZodObject<{
        number: z.ZodNumber;
        title: z.ZodString;
        description: z.ZodString;
        author: z.ZodString;
        base_branch: z.ZodString;
        head_branch: z.ZodString;
        changed_files: z.ZodNumber;
        lines_added: z.ZodNumber;
        lines_removed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        number: number;
        author: string;
        description: string;
        title: string;
        base_branch: string;
        head_branch: string;
        changed_files: number;
        lines_added: number;
        lines_removed: number;
    }, {
        number: number;
        author: string;
        description: string;
        title: string;
        base_branch: string;
        head_branch: string;
        changed_files: number;
        lines_added: number;
        lines_removed: number;
    }>;
    synthesis: z.ZodObject<{
        overall_score: z.ZodNumber;
        decision: z.ZodEnum<["approve", "request_changes", "needs_work"]>;
        summary: z.ZodString;
        critical_issues: z.ZodArray<z.ZodObject<{
            agent: z.ZodString;
            type: z.ZodString;
            description: z.ZodString;
            file: z.ZodString;
            line: z.ZodOptional<z.ZodNumber>;
            fix_suggestion: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            agent: string;
            type: string;
            description: string;
            file: string;
            fix_suggestion: string;
            line?: number | undefined;
        }, {
            agent: string;
            type: string;
            description: string;
            file: string;
            fix_suggestion: string;
            line?: number | undefined;
        }>, "many">;
        medium_issues: z.ZodArray<z.ZodObject<{
            agent: z.ZodString;
            type: z.ZodString;
            description: z.ZodString;
            file: z.ZodString;
            line: z.ZodOptional<z.ZodNumber>;
            suggestion: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            agent: string;
            type: string;
            description: string;
            file: string;
            suggestion: string;
            line?: number | undefined;
        }, {
            agent: string;
            type: string;
            description: string;
            file: string;
            suggestion: string;
            line?: number | undefined;
        }>, "many">;
        info_items: z.ZodArray<z.ZodObject<{
            agent: z.ZodString;
            type: z.ZodString;
            description: z.ZodString;
            positive_note: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            agent: string;
            type: string;
            description: string;
            positive_note: boolean;
        }, {
            agent: string;
            type: string;
            description: string;
            positive_note: boolean;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        summary: string;
        critical_issues: {
            agent: string;
            type: string;
            description: string;
            file: string;
            fix_suggestion: string;
            line?: number | undefined;
        }[];
        overall_score: number;
        decision: "approve" | "request_changes" | "needs_work";
        medium_issues: {
            agent: string;
            type: string;
            description: string;
            file: string;
            suggestion: string;
            line?: number | undefined;
        }[];
        info_items: {
            agent: string;
            type: string;
            description: string;
            positive_note: boolean;
        }[];
    }, {
        summary: string;
        critical_issues: {
            agent: string;
            type: string;
            description: string;
            file: string;
            fix_suggestion: string;
            line?: number | undefined;
        }[];
        overall_score: number;
        decision: "approve" | "request_changes" | "needs_work";
        medium_issues: {
            agent: string;
            type: string;
            description: string;
            file: string;
            suggestion: string;
            line?: number | undefined;
        }[];
        info_items: {
            agent: string;
            type: string;
            description: string;
            positive_note: boolean;
        }[];
    }>;
    checklist: z.ZodArray<z.ZodObject<{
        item: z.ZodString;
        completed: z.ZodBoolean;
        priority: z.ZodEnum<["critical", "high", "medium", "low"]>;
        assignee: z.ZodOptional<z.ZodString>;
        due_date: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        priority: "critical" | "high" | "medium" | "low";
        item: string;
        completed: boolean;
        assignee?: string | undefined;
        due_date?: string | undefined;
    }, {
        priority: "critical" | "high" | "medium" | "low";
        item: string;
        completed: boolean;
        assignee?: string | undefined;
        due_date?: string | undefined;
    }>, "many">;
    metrics: z.ZodObject<{
        security_findings: z.ZodNumber;
        quality_issues: z.ZodNumber;
        architecture_violations: z.ZodNumber;
        documentation_gaps: z.ZodNumber;
        total_tokens_used: z.ZodNumber;
        analysis_duration_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        security_findings: number;
        quality_issues: number;
        architecture_violations: number;
        documentation_gaps: number;
        total_tokens_used: number;
        analysis_duration_ms: number;
    }, {
        security_findings: number;
        quality_issues: number;
        architecture_violations: number;
        documentation_gaps: number;
        total_tokens_used: number;
        analysis_duration_ms: number;
    }>;
    recommendations: z.ZodArray<z.ZodObject<{
        category: z.ZodString;
        priority: z.ZodEnum<["immediate", "short_term", "long_term"]>;
        description: z.ZodString;
        estimated_effort: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        priority: "immediate" | "short_term" | "long_term";
        description: string;
        category: string;
        estimated_effort: string;
    }, {
        priority: "immediate" | "short_term" | "long_term";
        description: string;
        category: string;
        estimated_effort: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    agent: "pr_reviewer";
    run_id: string;
    timestamp: string;
    metrics: {
        security_findings: number;
        quality_issues: number;
        architecture_violations: number;
        documentation_gaps: number;
        total_tokens_used: number;
        analysis_duration_ms: number;
    };
    recommendations: {
        priority: "immediate" | "short_term" | "long_term";
        description: string;
        category: string;
        estimated_effort: string;
    }[];
    pr_metadata: {
        number: number;
        author: string;
        description: string;
        title: string;
        base_branch: string;
        head_branch: string;
        changed_files: number;
        lines_added: number;
        lines_removed: number;
    };
    synthesis: {
        summary: string;
        critical_issues: {
            agent: string;
            type: string;
            description: string;
            file: string;
            fix_suggestion: string;
            line?: number | undefined;
        }[];
        overall_score: number;
        decision: "approve" | "request_changes" | "needs_work";
        medium_issues: {
            agent: string;
            type: string;
            description: string;
            file: string;
            suggestion: string;
            line?: number | undefined;
        }[];
        info_items: {
            agent: string;
            type: string;
            description: string;
            positive_note: boolean;
        }[];
    };
    checklist: {
        priority: "critical" | "high" | "medium" | "low";
        item: string;
        completed: boolean;
        assignee?: string | undefined;
        due_date?: string | undefined;
    }[];
}, {
    agent: "pr_reviewer";
    run_id: string;
    timestamp: string;
    metrics: {
        security_findings: number;
        quality_issues: number;
        architecture_violations: number;
        documentation_gaps: number;
        total_tokens_used: number;
        analysis_duration_ms: number;
    };
    recommendations: {
        priority: "immediate" | "short_term" | "long_term";
        description: string;
        category: string;
        estimated_effort: string;
    }[];
    pr_metadata: {
        number: number;
        author: string;
        description: string;
        title: string;
        base_branch: string;
        head_branch: string;
        changed_files: number;
        lines_added: number;
        lines_removed: number;
    };
    synthesis: {
        summary: string;
        critical_issues: {
            agent: string;
            type: string;
            description: string;
            file: string;
            fix_suggestion: string;
            line?: number | undefined;
        }[];
        overall_score: number;
        decision: "approve" | "request_changes" | "needs_work";
        medium_issues: {
            agent: string;
            type: string;
            description: string;
            file: string;
            suggestion: string;
            line?: number | undefined;
        }[];
        info_items: {
            agent: string;
            type: string;
            description: string;
            positive_note: boolean;
        }[];
    };
    checklist: {
        priority: "critical" | "high" | "medium" | "low";
        item: string;
        completed: boolean;
        assignee?: string | undefined;
        due_date?: string | undefined;
    }[];
}>;
export type PRReviewReport = z.infer<typeof PRReviewReportSchema>;
export declare const MemTechL2Schema: z.ZodObject<{
    layer: z.ZodLiteral<"L2">;
    type: z.ZodEnum<["session", "cache", "working_memory"]>;
    key: z.ZodString;
    value: z.ZodAny;
    ttl_seconds: z.ZodOptional<z.ZodNumber>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    created_at: z.ZodString;
    accessed_at: z.ZodString;
    access_count: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "session" | "cache" | "working_memory";
    created_at: string;
    layer: "L2";
    key: string;
    accessed_at: string;
    access_count: number;
    value?: any;
    tags?: string[] | undefined;
    ttl_seconds?: number | undefined;
}, {
    type: "session" | "cache" | "working_memory";
    created_at: string;
    layer: "L2";
    key: string;
    accessed_at: string;
    value?: any;
    tags?: string[] | undefined;
    ttl_seconds?: number | undefined;
    access_count?: number | undefined;
}>;
export type MemTechL2 = z.infer<typeof MemTechL2Schema>;
export declare const MemTechL3Schema: z.ZodObject<{
    layer: z.ZodLiteral<"L3">;
    type: z.ZodEnum<["knowledge", "patterns", "adrs", "snapshots"]>;
    key: z.ZodString;
    content: z.ZodAny;
    metadata: z.ZodObject<{
        version: z.ZodString;
        author: z.ZodString;
        created_at: z.ZodString;
        updated_at: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        relevance_score: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        author: string;
        version: string;
        tags: string[];
        created_at: string;
        updated_at: string;
        relevance_score?: number | undefined;
    }, {
        author: string;
        version: string;
        tags: string[];
        created_at: string;
        updated_at: string;
        relevance_score?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "patterns" | "knowledge" | "adrs" | "snapshots";
    metadata: {
        author: string;
        version: string;
        tags: string[];
        created_at: string;
        updated_at: string;
        relevance_score?: number | undefined;
    };
    layer: "L3";
    key: string;
    content?: any;
}, {
    type: "patterns" | "knowledge" | "adrs" | "snapshots";
    metadata: {
        author: string;
        version: string;
        tags: string[];
        created_at: string;
        updated_at: string;
        relevance_score?: number | undefined;
    };
    layer: "L3";
    key: string;
    content?: any;
}>;
export type MemTechL3 = z.infer<typeof MemTechL3Schema>;
//# sourceMappingURL=file-system.d.ts.map