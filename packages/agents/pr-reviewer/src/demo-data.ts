/**
 * Demo data for testing the simplified PR Reviewer Agent
 * Mock findings from different agents to demonstrate synthesis functionality
 */

import { SARIFReport, QualityReport, ArchitectureReport, DocumentationReport } from './local-types.js';

export const mockSecurityReport: SARIFReport = {
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'semgrep'
        }
      },
      results: [
        {
          level: 'error',
          ruleId: 'javascript.lang.security.insecure-random',
          message: {
            text: 'Use of insecure random number generator'
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: 'src/auth/crypto.js'
                },
                region: {
                  startLine: 45
                }
              }
            }
          ]
        },
        {
          level: 'warning',
          ruleId: 'javascript.lang.security.hardcoded-secret',
          message: {
            text: 'Potentially hardcoded secret detected'
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: 'src/config/database.js'
                },
                region: {
                  startLine: 12
                }
              }
            }
          ]
        }
      ]
    }
  ]
};

export const mockQualityReport: QualityReport = {
  findings: [
    {
      severity: 'error',
      rule: 'no-unused-vars',
      message: 'Variable "unusedVar" is defined but never used',
      file: 'src/utils/helpers.js',
      line: 23,
      column: 5,
      suggestion: 'Remove unused variable or use it in your code'
    },
    {
      severity: 'warning',
      rule: 'complexity',
      message: 'Function has high cyclomatic complexity',
      file: 'src/api/user-routes.js',
      line: 67,
      suggestion: 'Consider breaking down this function into smaller functions'
    },
    {
      severity: 'info',
      rule: 'prefer-const',
      message: 'Variable "config" should be declared as const',
      file: 'src/config/index.js',
      line: 8,
      column: 3
    }
  ],
  metrics: {
    total_issues: 3,
    errors: 1,
    warnings: 1,
    info: 1
  }
};

export const mockArchitectureReport: ArchitectureReport = {
  analysis: {
    layers: [
      {
        name: 'presentation',
        violations: [
          {
            type: 'data-access-violation',
            severity: 'warning',
            description: 'Presentation layer directly accessing database',
            file: 'src/controllers/user-controller.js',
            line: 15
          }
        ]
      },
      {
        name: 'business',
        violations: []
      }
    ],
    dry_violations: [
      {
        duplicated_code: 'validation logic repeated across multiple files',
        files: ['src/utils/validators.js', 'src/middleware/validation.js'],
        lines: [10]
      }
    ]
  },
  metrics: {
    total_violations: 2,
    layering_violations: 1,
    dry_violations: 1
  }
};

export const mockDocumentationReport: DocumentationReport = {
  api_validation: {
    validation_errors: [
      {
        severity: 'warning',
        error: 'Missing required field "description" in endpoint documentation',
        file: 'docs/api/users.yaml',
        line: 42
      }
    ],
    breaking_changes: []
  },
  coverage: {
    apis_documented: 15,
    total_apis: 18,
    coverage_percentage: 83.3
  }
};

export const createDemoFiles = async (tempDir: string): Promise<{
  securityReportPath: string;
  qualityReportPath: string;
  architectureReportPath: string;
  documentationReportPath: string;
}> => {
  const { promises: fs } = await import('fs');
  const { join } = await import('path');

  const securityReportPath = join(tempDir, 'security-report.json');
  const qualityReportPath = join(tempDir, 'quality-report.json');
  const architectureReportPath = join(tempDir, 'architecture-report.json');
  const documentationReportPath = join(tempDir, 'documentation-report.json');

  await fs.writeFile(securityReportPath, JSON.stringify(mockSecurityReport, null, 2));
  await fs.writeFile(qualityReportPath, JSON.stringify(mockQualityReport, null, 2));
  await fs.writeFile(architectureReportPath, JSON.stringify(mockArchitectureReport, null, 2));
  await fs.writeFile(documentationReportPath, JSON.stringify(mockDocumentationReport, null, 2));

  return {
    securityReportPath,
    qualityReportPath,
    architectureReportPath,
    documentationReportPath
  };
};