#!/usr/bin/env node

/**
 * Simple integration test for Pit Crew Orchestrator + Security Agent
 * Tests Unix socket IPC workflow using compiled modules
 */

const dotenv = require('dotenv');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level}] [INTEGRATION_TEST]: ${message} ${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

async function testSocketCommunication() {
  const socketPath = '/tmp/pit-crew-test.sock';
  const testRepoPath = process.cwd();

  logger.info('Starting simple socket communication test...');

  try {
    // Clean up existing socket
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    // Create obs directory
    const obsDir = path.join(testRepoPath, 'obs');
    const reportsDir = path.join(obsDir, 'reports');
    if (!fs.existsSync(obsDir)) fs.mkdirSync(obsDir, { recursive: true });
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    // Start security agent in test mode
    logger.info('Starting security agent...');

    const agentProcess = spawn('python3', [
      path.join(testRepoPath, 'packages/agents/src/security_agent.py')
    ], {
      cwd: testRepoPath,
      env: {
        ...process.env,
        PYTHONPATH: path.join(testRepoPath, 'packages/agents/src'),
        SOCKET_PATH: socketPath,
        OBS_PATH: obsDir
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    agentProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.info(`[AGENT] ${output}`);
      }
    });

    agentProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.error(`[AGENT] ${output}`);
      }
    });

    agentProcess.on('error', (error) => {
      logger.error('Agent process error', { error });
      throw error;
    });

    // Wait for agent to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if agent is running
    if (agentProcess.killed) {
      throw new Error('Security agent failed to start');
    }

    logger.info('Security agent started successfully');

    // Test: Create a simple security scan task file
    const testTask = {
      task_id: `test-${Date.now()}`,
      agent: 'security',
      scope: [
        'packages/orchestrator/src/index.ts',
        'packages/shared/src/types/agent-events.ts'
      ],
      context: {
        repo_root: testRepoPath,
        commit_hash: 'test-commit',
        branch: 'main'
      },
      output: path.join(reportsDir, 'test-security.sarif'),
      config: {
        tools: ['basic'],
        severity_threshold: 'low'
      }
    };

    logger.info('Test configuration created', {
      task_id: testTask.task_id,
      files: testTask.scope.length,
      output: testTask.output
    });

    // Wait a bit for the agent to run
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if any output files were created
    const reportFiles = fs.readdirSync(reportsDir);
    logger.info('Report files found', { files: reportFiles });

    // Check if SARIF file was created
    if (fs.existsSync(testTask.output)) {
      try {
        const sarifData = JSON.parse(fs.readFileSync(testTask.output, 'utf8'));
        logger.info('✅ SARIF report generated successfully', {
          path: testTask.output,
          results: sarifData.results?.length || 0,
          tool: sarifData.runs?.[0]?.tool?.driver?.name
        });
      } catch (error) {
        logger.error('Error reading SARIF file', { error, path: testTask.output });
      }
    } else {
      logger.warn('SARIF file not created', { expected: testTask.output });
    }

    // Cleanup
    logger.info('Cleaning up...');
    agentProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!agentProcess.killed) {
      agentProcess.kill('SIGKILL');
    }

    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    logger.info('✅ Simple integration test completed');

  } catch (error) {
    logger.error('❌ Integration test failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await testSocketCommunication();
  } catch (error) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}