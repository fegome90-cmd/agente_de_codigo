#!/usr/bin/env node

/**
 * Code Audit Executor
 *
 * This script executes a comprehensive code audit of all implemented components
 * using the Pit-Crew multi-agent system
 */

import { CodeAuditOrchestrator } from '../src/audit/code-audit-orchestrator.js';
import { logger } from '../src/utils/logger.js';

async function executeCodeAudit() {
  const orchestrator = new CodeAuditOrchestrator();

  try {
    console.log('🚀 Starting comprehensive code audit of Pit-Crew v2.1.0 implementation...\n');

    // Define the scope of files to audit
    const auditScope = [
      'packages/orchestrator/src/caching/redis-cache-service.ts',
      'packages/orchestrator/src/llm/llm-api-optimization-service.ts',
      'packages/orchestrator/src/routing/enhanced-deterministic-router.ts',
      'packages/orchestrator/src/ipc/socketio-connection-pool.ts',
      'packages/orchestrator/src/monitoring/enhanced-monitoring-dashboard.ts',
      'packages/orchestrator/src/profiling/agent-performance-profiler.ts',
      'packages/orchestrator/src/audit/code-audit-orchestrator.ts'
    ];

    // Create and execute audit task
    const taskId = await orchestrator.createCodeAudit(auditScope);

    console.log(`📋 Audit task created: ${taskId}`);
    console.log('🔄 Executing comprehensive analysis...\n');

    // Wait for audit completion
    await new Promise((resolve) => {
      orchestrator.on('task:completed', (event) => {
        if (event.task.id === taskId) {
          resolve(event.task);
        }
      });

      orchestrator.on('task:failed', (event) => {
        if (event.task.id === taskId) {
          console.error('❌ Audit failed:', event.error);
          process.exit(1);
        }
      });
    });

    // Get the completed task
    const completedTask = orchestrator.getTaskResults(taskId);
    if (!completedTask || !completedTask.results) {
      throw new Error('Audit task not completed or results not available');
    }

    // Generate comprehensive report
    console.log('📊 Generating comprehensive audit report...\n');
    const report = await orchestrator.generateAuditReport(taskId);

    // Display summary
    const results = completedTask.results;
    console.log('🎯 === AUDIT SUMMARY ===');
    console.log(`📈 Overall Score: ${results.summary.overallScore}/100`);
    console.log(`🚦 Overall Status: ${results.summary.overallStatus.toUpperCase()}`);
    console.log(`📁 Files Analyzed: ${results.summary.totalFiles}`);
    console.log(`📝 Lines of Code: ${results.summary.totalLines}`);
    console.log(`🚨 Critical Issues: ${results.summary.criticalIssues}`);
    console.log(`⚠️  High Issues: ${results.summary.highIssues}`);

    console.log('\n📊 === INDIVIDUAL SCORES ===');
    console.log(`🏗️  Architecture: ${results.architecture.score}/100`);
    console.log(`⚡ Performance: ${results.performance.score}/100`);
    console.log(`🛡️  Security: ${results.security.score}/100`);
    console.log(`🔧 Quality: ${results.quality.score}/100`);
    console.log(`📚 Documentation: ${results.documentation.score}/100`);

    console.log('\n🎉 === KEY ACHIEVEMENTS ===');
    results.summary.keyFindings.forEach(finding => {
      console.log(`✅ ${finding}`);
    });

    console.log('\n🚨 === CRITICAL RECOMMENDATIONS ===');
    results.summary.executiveRecommendations.slice(0, 3).forEach(rec => {
      console.log(`🔥 ${rec}`);
    });

    // Save report to file
    const reportPath = `./audit-report-${new Date().toISOString().split('T')[0]}.md`;
    require('fs').writeFileSync(reportPath, report);
    console.log(`\n💾 Complete report saved to: ${reportPath}`);

    // Show sample of security findings
    if (results.security.vulnerabilities.length > 0) {
      console.log('\n🛡️ === SECURITY FINDINGS ===');
      results.security.vulnerabilities.slice(0, 2).forEach(vuln => {
        console.log(`⚠️  ${vuln.severity.toUpperCase()}: ${vuln.type}`);
        console.log(`   File: ${vuln.file}:${vuln.line}`);
        console.log(`   Description: ${vuln.description}`);
      });
    }

    // Show sample of performance findings
    if (results.performance.bottlenecks.length > 0) {
      console.log('\n⚡ === PERFORMANCE FINDINGS ===');
      results.performance.bottlenecks.forEach(bottleneck => {
        console.log(`🔍 ${bottleneck.severity.toUpperCase()}: ${bottleneck.type}`);
        console.log(`   Location: ${bottleneck.function}`);
        console.log(`   Impact: ${bottleneck.impact}`);
      });
    }

    console.log('\n✨ === NEXT STEPS ===');
    results.summary.nextSteps.forEach((step, index) => {
      console.log(`${index + 1}. ${step}`);
    });

    console.log('\n🎉 Audit completed successfully!');
    console.log(`📊 View the complete report at: ${reportPath}`);

    await orchestrator.shutdown();

  } catch (error) {
    console.error('❌ Audit execution failed:', error);
    process.exit(1);
  }
}

// Execute the audit
if (require.main === module) {
  executeCodeAudit();
}

export { executeCodeAudit };
