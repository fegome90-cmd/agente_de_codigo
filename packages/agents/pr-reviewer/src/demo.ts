/**
 * Demo script to test the simplified PR Reviewer Agent functionality
 * Creates mock data and runs synthesis to demonstrate the agent works
 */

import { SimplePRReviewerAgent } from './simple-pr-reviewer-agent.js';
import { PRReviewerTaskData } from './types.js';
import { createDemoFiles } from './demo-data.js';
import { logger } from './simple-logger.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

async function runDemo() {
  logger.info('🚀 Starting PR Reviewer Agent Demo');

  try {
    // Create temporary directory for demo files
    const tempDir = join(tmpdir(), `pr-reviewer-demo-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    logger.info(`📁 Created temp directory: ${tempDir}`);

    // Create demo report files
    const reportPaths = await createDemoFiles(tempDir);
    logger.info('📄 Created mock agent reports');

    // Create a mock agent (we won't actually connect to socket)
    const agent = new SimplePRReviewerAgent('/tmp/mock-socket.sock');

    // Create mock task data
    const taskData: PRReviewerTaskData = {
      scope: ['src/**/*.js'],
      context: {
        repo_root: '/mock/repo',
        pr_number: 123,
        pr_title: 'Add user authentication feature',
        pr_description: 'Implement JWT-based authentication with secure password hashing',
        pr_author: 'developer',
        base_branch: 'main',
        head_branch: 'feature/auth',
        changed_files: 5,
        lines_added: 250,
        lines_removed: 15,
        commit_hash: 'abc123def456'
      },
      output: join(tempDir, 'pr-review-result.json'),
      agent_reports: {
        security_report_path: reportPaths.securityReportPath,
        quality_report_path: reportPaths.qualityReportPath,
        architecture_report_path: reportPaths.architectureReportPath,
        documentation_report_path: reportPaths.documentationReportPath
      }
    };

    logger.info('🔄 Starting PR review synthesis...');

    // Create a mock task ID and run the synthesis
    const taskId = `demo-task-${Date.now()}`;

    // We'll call the handleTask method directly since we're not connected to a socket
    // In a real scenario, this would be called via the socket communication
    await agent.handleTask(taskId, taskData);

    logger.info('✅ Demo completed successfully!');

    // Read and display the results
    const resultPath = taskData.output!;
    const results = JSON.parse(await fs.readFile(resultPath, 'utf-8'));

    console.log('\n📊 PR Review Results:');
    console.log(`Overall Score: ${results.structured_report.synthesis.overall_score}/100`);
    console.log(`Decision: ${results.structured_report.synthesis.decision}`);
    console.log(`Critical Issues: ${results.structured_report.synthesis.critical_issues.length}`);
    console.log(`Total Issues: ${results.total_issues_count}`);

    console.log('\n📝 Markdown Report Preview:');
    console.log(results.markdown_report.substring(0, 500) + '...');

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    logger.info(`🧹 Cleaned up temp directory: ${tempDir}`);

  } catch (error) {
    logger.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export { runDemo };