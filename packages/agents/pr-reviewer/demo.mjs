#!/usr/bin/env node

/**
 * Demo script for PR Reviewer Agent
 * Shows how the agent synthesizes findings from other agents
 */

import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import agent classes
import { PRReviewerAgent } from './dist/pr-reviewer-agent.js';

async function runDemo() {
  console.log('🚀 PR Reviewer Agent Demo');
  console.log('='.repeat(50));

  // Create agent instance
  const agent = new PRReviewerAgent('/tmp/demo-socket.sock');

  // Sample task data
  const taskData = {
    scope: ['src/**/*.ts'],
    context: {
      repo_root: '/demo/repo',
      pr_number: 42,
      pr_metadata: {
        number: 42,
        title: 'Add user authentication system',
        description: 'Implement secure JWT-based authentication with password reset',
        author: 'demo-developer',
        base_branch: 'main',
        head_branch: 'feature/authentication',
        changed_files: 15,
        lines_added: 342,
        lines_removed: 28,
        commit_hash: 'abc123def456'
      }
    },
    output: '/tmp/demo-pr-review.json',
    config: {
      thresholds: {
        approve_min_score: 80,
        request_changes_max_score: 60,
        max_critical_issues: 0,
        max_high_issues: 3
      },
      quality_gates: {
        zero_errors_tolerance: true,
        security_blocking: true,
        documentation_required: false,
        architecture_compliance: true
      }
    },
    agent_reports: {
      security_report_path: join(__dirname, 'tests/sample-data/security-report.json'),
      quality_report_path: join(__dirname, 'tests/sample-data/quality-report.json'),
      architecture_report_path: join(__dirname, 'tests/sample-data/architecture-report.json'),
      documentation_report_path: join(__dirname, 'tests/sample-data/documentation-report.json')
    }
  };

  try {
    console.log('\n📊 Loading agent reports...');

    // Load agent reports
    const agentReports = await agent['loadAgentReports'](taskData.agent_reports);

    console.log(`✅ Security report: ${agentReports.security ? 'Loaded' : 'Missing'}`);
    console.log(`✅ Quality report: ${agentReports.quality ? 'Loaded' : 'Missing'}`);
    console.log(`✅ Architecture report: ${agentReports.architecture ? 'Loaded' : 'Missing'}`);
    console.log(`✅ Documentation report: ${agentReports.documentation ? 'Loaded' : 'Missing'}`);

    console.log('\n🔍 Extracting findings from all agents...');

    // Extract PR metadata
    const prMetadata = agent['extractPRMetadata'](taskData.context);

    // Extract findings
    const findings = agent['extractAllFindings'](agentReports);

    console.log(`📈 Total findings extracted: ${findings.length}`);
    console.log(`   - Security: ${findings.filter(f => f.agent === 'security').length} issues`);
    console.log(`   - Quality: ${findings.filter(f => f.agent === 'quality').length} issues`);
    console.log(`   - Architecture: ${findings.filter(f => f.agent === 'architecture').length} issues`);
    console.log(`   - Documentation: ${findings.filter(f => f.agent === 'documentation').length} issues`);

    console.log('\n🎯 Calculating scores...');

    // Calculate scores
    const scoring = agent['calculateScores'](agentReports, findings);

    console.log(`📊 Scoring Results:`);
    console.log(`   - Security Score: ${scoring.security_score}/100`);
    console.log(`   - Quality Score: ${scoring.quality_score}/100`);
    console.log(`   - Architecture Score: ${scoring.architecture_score}/100`);
    console.log(`   - Documentation Score: ${scoring.documentation_score}/100`);
    console.log(`   - **Overall Score: ${scoring.overall_score}/100**`);

    console.log('\n⚖️ Making decision...');

    // Make decision
    const decision = agent['makeDecision'](scoring, findings);

    const decisionEmoji = {
      'approve': '✅',
      'request_changes': '🔄',
      'needs_work': '⚠️'
    };

    console.log(`${decisionEmoji[decision]} Decision: ${decision.toUpperCase()}`);

    console.log('\n📋 Running synthesis analysis...');

    // Run full synthesis
    const synthesisResult = await agent['runSynthesisAnalysis'](
      agentReports,
      prMetadata,
      taskData.scope,
      taskData.context
    );

    console.log('\n🎉 Synthesis Results:');
    console.log(`   - Overall Score: ${synthesisResult.overall_score}/100`);
    console.log(`   - Decision: ${synthesisResult.decision}`);
    console.log(`   - Critical Issues: ${synthesisResult.critical_issues.length}`);
    console.log(`   - Medium Issues: ${synthesisResult.medium_issues.length}`);
    console.log(`   - Checklist Items: ${synthesisResult.checklist.length}`);
    console.log(`   - Recommendations: ${synthesisResult.recommendations.length}`);

    console.log('\n🚪 Validating quality gates...');

    // Validate quality gates
    const qualityGateResult = agent['validateQualityGates'](synthesisResult);

    console.log(`${qualityGateResult.passed ? '✅' : '❌'} Quality Gates: ${qualityGateResult.passed ? 'PASSED' : 'FAILED'}`);

    if (qualityGateResult.critical_blocking.length > 0) {
      console.log('   🚫 Critical Blocking Issues:');
      qualityGateResult.critical_blocking.forEach(issue => {
        console.log(`      - ${issue}`);
      });
    }

    if (qualityGateResult.warnings.length > 0) {
      console.log('   ⚠️ Warnings:');
      qualityGateResult.warnings.forEach(warning => {
        console.log(`      - ${warning}`);
      });
    }

    console.log('\n📄 Generating markdown report...');

    // Generate markdown report
    const prReviewReport = agent['generatePRReviewReport'](
      'demo-run-123',
      prMetadata,
      synthesisResult,
      qualityGateResult
    );

    const markdownReport = agent['generateMarkdownReport'](prReviewReport);

    // Show preview of markdown report
    const lines = markdownReport.split('\n');
    const previewLines = lines.slice(0, 20);

    console.log('\n📝 Markdown Report Preview:');
    console.log('─'.repeat(50));
    previewLines.forEach(line => console.log(line));
    console.log('─'.repeat(50));
    console.log(`... (${lines.length - 20} more lines)`);

    console.log('\n🎊 Demo completed successfully!');
    console.log('\nKey Features Demonstrated:');
    console.log('  ✅ Multi-agent synthesis');
    console.log('  ✅ Intelligent scoring algorithm');
    console.log('  ✅ Decision making logic');
    console.log('  ✅ Quality gates validation');
    console.log('  ✅ Report generation');
    console.log('  ✅ Checklist creation');
    console.log('  ✅ Recommendation system');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Check if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo();
}

export { runDemo };