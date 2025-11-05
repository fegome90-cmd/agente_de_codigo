/**
 * Test suite for PR Reviewer Agent synthesis functionality
 */

import { PRReviewerAgent } from '../src/pr-reviewer-agent.js';
import { PRReviewerTaskData } from '../src/types.js';
import { join } from 'path';
import { promises as fs } from 'fs';

describe('PR Reviewer Agent', () => {
  let agent: PRReviewerAgent;
  const testOutputDir = join(__dirname, 'test-output');

  beforeAll(async () => {
    agent = new PRReviewerAgent('/tmp/test-socket.sock');
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup test directory
    try {
      await fs.rmdir(testOutputDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Synthesis Analysis', () => {
    test('should synthesize findings from all agents', async () => {
      const sampleDataDir = join(__dirname, 'sample-data');

      const taskData: PRReviewerTaskData = {
        scope: ['src/**/*.ts'],
        context: {
          repo_root: '/test/repo',
          pr_number: 42,
          pr_metadata: {
            number: 42,
            title: 'Add user authentication',
            description: 'Implement secure user authentication with JWT tokens',
            author: 'test-developer',
            base_branch: 'main',
            head_branch: 'feature/auth',
            changed_files: 15,
            lines_added: 342,
            lines_removed: 28
          }
        },
        output: join(testOutputDir, 'pr-review-result.json'),
        config: {
          thresholds: {
            approve_min_score: 80,
            max_critical_issues: 0,
            max_high_issues: 3
          }
        },
        agent_reports: {
          security_report_path: join(sampleDataDir, 'security-report.json'),
          quality_report_path: join(sampleDataDir, 'quality-report.json'),
          architecture_report_path: join(sampleDataDir, 'architecture-report.json'),
          documentation_report_path: join(sampleDataDir, 'documentation-report.json')
        }
      };

      // This would normally be called by the orchestrator
      // For testing, we'll call the synthesis method directly
      const agentReports = await agent['loadAgentReports'](taskData.agent_reports);
      const prMetadata = agent['extractPRMetadata'](taskData.context);

      expect(agentReports.security).toBeDefined();
      expect(agentReports.quality).toBeDefined();
      expect(agentReports.architecture).toBeDefined();
      expect(agentReports.documentation).toBeDefined();

      const synthesisResult = await agent['runSynthesisAnalysis'](
        agentReports,
        prMetadata,
        taskData.scope,
        taskData.context
      );

      // Verify synthesis results
      expect(synthesisResult.overall_score).toBeGreaterThan(0);
      expect(synthesisResult.overall_score).toBeLessThanOrEqual(100);
      expect(['approve', 'request_changes', 'needs_work']).toContain(synthesisResult.decision);
      expect(synthesisResult.summary).toContain('PR Review completed');

      // Check critical issues are detected
      expect(synthesisResult.critical_issues.length).toBeGreaterThan(0);

      // Verify agent contributions are calculated
      expect(Object.keys(synthesisResult.agent_contributions)).toContain('security');
      expect(Object.keys(synthesisResult.agent_contributions)).toContain('quality');

      // Verify checklist is generated
      expect(synthesisResult.checklist.length).toBeGreaterThan(0);

      // Verify recommendations are provided
      expect(synthesisResult.recommendations.length).toBeGreaterThan(0);

      console.log('✅ Synthesis Analysis Test Results:');
      console.log(`   Overall Score: ${synthesisResult.overall_score}/100`);
      console.log(`   Decision: ${synthesisResult.decision}`);
      console.log(`   Critical Issues: ${synthesisResult.critical_issues.length}`);
      console.log(`   Total Findings: ${synthesisResult.critical_issues.length + synthesisResult.medium_issues.length}`);
    });

    test('should handle missing agent reports gracefully', async () => {
      const taskData: PRReviewerTaskData = {
        scope: ['src/**/*.ts'],
        context: {
          repo_root: '/test/repo',
          pr_number: 43,
          pr_metadata: {
            number: 43,
            title: 'Minor code cleanup',
            description: 'Remove unused imports and fix typos',
            author: 'test-developer',
            base_branch: 'main',
            head_branch: 'fix/cleanup',
            changed_files: 3,
            lines_added: 15,
            lines_removed: 23
          }
        },
        agent_reports: {
          // Only include quality report
          quality_report_path: join(__dirname, 'sample-data', 'quality-report.json')
        }
      };

      const agentReports = await agent['loadAgentReports'](taskData.agent_reports);
      const prMetadata = agent['extractPRMetadata'](taskData.context);

      expect(agentReports.quality).toBeDefined();
      expect(agentReports.security).toBeUndefined();
      expect(agentReports.architecture).toBeUndefined();
      expect(agentReports.documentation).toBeUndefined();

      const synthesisResult = await agent['runSynthesisAnalysis'](
        agentReports,
        prMetadata,
        taskData.scope,
        taskData.context
      );

      // Should still produce results with available reports
      expect(synthesisResult.overall_score).toBeGreaterThan(0);
      expect(synthesisResult.decision).toBeDefined();

      // Agent contributions should only include quality
      expect(Object.keys(synthesisResult.agent_contributions)).toContain('quality');
      expect(Object.keys(synthesisResult.agent_contributions)).not.toContain('security');

      console.log('✅ Graceful Handling Test Results:');
      console.log(`   Overall Score: ${synthesisResult.overall_score}/100`);
      console.log(`   Decision: ${synthesisResult.decision}`);
      console.log(`   Available Agents: ${Object.keys(synthesisResult.agent_contributions).join(', ')}`);
    });

    test('should validate quality gates correctly', async () => {
      // Create a synthesis result with critical issues
      const synthesisResult = {
        overall_score: 45,
        decision: 'request_changes' as const,
        summary: 'Multiple critical issues found',
        critical_issues: [
          {
            agent: 'security' as const,
            severity: 'critical' as const,
            type: 'hardcoded-secret',
            description: 'Hardcoded AWS secret key',
            file: 'src/config/aws.ts',
            line: 15,
            fix_suggestion: 'Use environment variables',
            confidence: 0.9
          }
        ],
        medium_issues: [],
        info_items: [],
        checklist: [],
        metrics: {
          security_findings: 3,
          quality_issues: 8,
          architecture_violations: 2,
          documentation_gaps: 1,
          total_tokens_used: 15000,
          analysis_duration_ms: 2500
        },
        recommendations: [],
        agent_contributions: {}
      };

      const qualityGateResult = agent['validateQualityGates'](synthesisResult);

      // Should fail quality gates due to critical issues
      expect(qualityGateResult.passed).toBe(false);
      expect(qualityGateResult.critical_blocking.length).toBeGreaterThan(0);
      expect(qualityGateResult.gate_details.zero_errors_left).toBe(false);
      expect(qualityGateResult.gate_details.security_gate).toBe(false);

      console.log('✅ Quality Gates Validation Results:');
      console.log(`   Quality Gates Passed: ${qualityGateResult.passed}`);
      console.log(`   Critical Blocking Issues: ${qualityGateResult.critical_blocking.length}`);
      console.log(`   Warnings: ${qualityGateResult.warnings.length}`);
    });

    test('should generate markdown report correctly', async () => {
      const prReviewReport = {
        run_id: 'test-run-123',
        timestamp: '2024-01-15T11:00:00Z',
        agent: 'pr_reviewer' as const,
        pr_metadata: {
          number: 42,
          title: 'Add user authentication',
          description: 'Implement secure user authentication',
          author: 'test-developer',
          base_branch: 'main',
          head_branch: 'feature/auth',
          changed_files: 15,
          lines_added: 342,
          lines_removed: 28
        },
        synthesis: {
          overall_score: 75,
          decision: 'needs_work' as const,
          summary: 'Good implementation with some security concerns',
          critical_issues: [
            {
              agent: 'security' as const,
              severity: 'critical' as const,
              type: 'hardcoded-secret',
              description: 'Hardcoded AWS secret key detected',
              file: 'src/config/aws.ts',
              line: 15,
              fix_suggestion: 'Move to environment variables'
            }
          ],
          medium_issues: [
            {
              agent: 'quality' as const,
              severity: 'medium' as const,
              type: 'complexity',
              description: 'High cyclomatic complexity',
              file: 'src/database/connection.ts',
              line: 23,
              suggestion: 'Extract methods to reduce complexity'
            }
          ],
          info_items: [
            {
              agent: 'architecture',
              type: 'good-patterns',
              description: 'Good use of dependency injection',
              positive_note: true
            }
          ]
        },
        checklist: [
          {
            item: 'Fix security issues',
            completed: false,
            priority: 'critical' as const,
            assignee: 'test-developer'
          }
        ],
        metrics: {
          security_findings: 3,
          quality_issues: 8,
          architecture_violations: 2,
          documentation_gaps: 1,
          total_tokens_used: 15000,
          analysis_duration_ms: 2500
        },
        recommendations: [
          {
            category: 'Security',
            priority: 'immediate' as const,
            description: 'Address critical security vulnerabilities',
            estimated_effort: '2 hours'
          }
        ]
      };

      const markdownReport = agent['generateMarkdownReport'](prReviewReport);

      // Verify markdown structure
      expect(markdownReport).toContain('# PR Review Report');
      expect(markdownReport).toContain('## Summary');
      expect(markdownReport).toContain('## 🚨 Critical Issues');
      expect(markdownReport).toContain('## Checklist');
      expect(markdownReport).toContain('## Metrics');

      // Verify content
      expect(markdownReport).toContain('PR #42: Add user authentication');
      expect(markdownReport).toContain('75/100');
      expect(markdownReport).toContain('hardcoded-secret');
      expect(markdownReport).toContain('Fix security issues');

      console.log('✅ Markdown Report Generation Test:');
      console.log('   Generated markdown report with all sections');
      console.log('   Report contains critical issues and recommendations');
    });
  });

  describe('Scoring Algorithm', () => {
    test('should calculate scores correctly based on findings', () => {
      const findings = [
        {
          agent: 'security' as const,
          severity: 'critical' as const,
          type: 'hardcoded-secret',
          description: 'Hardcoded secret',
          confidence: 0.9
        },
        {
          agent: 'quality' as const,
          severity: 'high' as const,
          type: 'complexity',
          description: 'High complexity',
          confidence: 0.8
        },
        {
          agent: 'architecture' as const,
          severity: 'medium' as const,
          type: 'layering',
          description: 'Layering violation',
          confidence: 0.85
        }
      ];

      const scoring = agent['calculateScores']({}, findings);

      expect(scoring.security_score).toBeLessThan(100);
      expect(scoring.quality_score).toBeLessThan(100);
      expect(scoring.architecture_score).toBeLessThan(100);
      expect(scoring.overall_score).toBeGreaterThan(0);
      expect(scoring.overall_score).toBeLessThan(100);

      console.log('✅ Scoring Algorithm Test:');
      console.log(`   Security Score: ${scoring.security_score}`);
      console.log(`   Quality Score: ${scoring.quality_score}`);
      console.log(`   Architecture Score: ${scoring.architecture_score}`);
      console.log(`   Overall Score: ${scoring.overall_score}`);
    });

    test('should make correct decisions based on scores', () => {
      const testCases = [
        { score: 95, critical: 0, expected: 'approve' },
        { score: 85, critical: 0, expected: 'approve' },
        { score: 75, critical: 0, expected: 'needs_work' },
        { score: 65, critical: 0, expected: 'needs_work' },
        { score: 55, critical: 0, expected: 'request_changes' },
        { score: 85, critical: 1, expected: 'request_changes' },
        { score: 95, critical: 1, expected: 'request_changes' }
      ];

      testCases.forEach(({ score, critical, expected }) => {
        const scoring = {
          security_score: score,
          quality_score: score,
          architecture_score: score,
          documentation_score: score,
          overall_score: score,
          penalty_points: 0,
          bonus_points: 0
        };

        const findings = Array(critical).fill({
          agent: 'security' as const,
          severity: 'critical' as const,
          type: 'test',
          description: 'Test issue'
        });

        const decision = agent['makeDecision'](scoring, findings);
        expect(decision).toBe(expected);
      });

      console.log('✅ Decision Logic Test:');
      console.log(`   All ${testCases.length} decision scenarios passed`);
    });
  });

  describe('Agent Integration', () => {
    test('should extract findings from different agent reports correctly', async () => {
      const sampleDataDir = join(__dirname, 'sample-data');

      const agentReports = await agent['loadAgentReports']({
        security_report_path: join(sampleDataDir, 'security-report.json'),
        quality_report_path: join(sampleDataDir, 'quality-report.json'),
        architecture_report_path: join(sampleDataDir, 'architecture-report.json'),
        documentation_report_path: join(sampleDataDir, 'documentation-report.json')
      });

      const findings = agent['extractAllFindings'](agentReports);

      // Verify findings from each agent
      const securityFindings = findings.filter(f => f.agent === 'security');
      const qualityFindings = findings.filter(f => f.agent === 'quality');
      const architectureFindings = findings.filter(f => f.agent === 'architecture');
      const documentationFindings = findings.filter(f => f.agent === 'documentation');

      expect(securityFindings.length).toBeGreaterThan(0);
      expect(qualityFindings.length).toBeGreaterThan(0);
      expect(architectureFindings.length).toBeGreaterThan(0);
      expect(documentationFindings.length).toBeGreaterThan(0);

      // Verify severity mapping
      expect(securityFindings.some(f => f.severity === 'critical')).toBe(true);
      expect(qualityFindings.some(f => f.severity === 'error')).toBe(true);

      console.log('✅ Agent Integration Test:');
      console.log(`   Security Findings: ${securityFindings.length}`);
      console.log(`   Quality Findings: ${qualityFindings.length}`);
      console.log(`   Architecture Findings: ${architectureFindings.length}`);
      console.log(`   Documentation Findings: ${documentationFindings.length}`);
      console.log(`   Total Findings: ${findings.length}`);
    });
  });
});