#!/usr/bin/env node

/**
 * Integration test for Pit Crew Orchestrator + Security Agent
 * Tests complete Unix socket IPC workflow
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

class IntegrationTest {
  constructor() {
    // Use test socket path
    this.socketPath = '/tmp/pit-crew-integration-test.sock';
    this.testRepoPath = process.cwd();
    this.securityAgentProcess = null;

    // We'll initialize these in setup
    this.socketServer = null;
    this.agentRegistry = null;
  }

  async setup() {
    logger.info('Setting up integration test...');

    // Dynamically import TypeScript modules
    const { SocketServer } = await import('../packages/orchestrator/src/ipc/socket-server.js');
    const { AgentRegistry } = await import('../packages/orchestrator/src/ipc/agent-registry.js');
    const { AgentUtils } = await import('../packages/shared/src/index.js');

    // Initialize socket server and agent registry
    this.socketServer = new SocketServer(this.socketPath);
    this.agentRegistry = new AgentRegistry(this.socketServer);
    this.AgentUtils = AgentUtils;

    // Create test directories
    const obsDir = path.join(this.testRepoPath, 'obs');
    const reportsDir = path.join(obsDir, 'reports');

    if (!fs.existsSync(obsDir)) fs.mkdirSync(obsDir, { recursive: true });
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    // Start socket server
    await this.socketServer.start();
    logger.info('Socket server started');

    // Setup agent registry event handlers
    this.setupAgentRegistryHandlers();

    // Start security agent
    await this.startSecurityAgent();

    // Wait for agent to register
    await this.waitForAgentRegistration();
  }

  setupAgentRegistryHandlers() {
    this.agentRegistry.on('agent_registered', (registration) => {
      logger.info('Agent registered', {
        agent: registration.agent,
        pid: registration.pid,
        version: registration.version
      });
    });

    this.agentRegistry.on('task_completed', (result) => {
      logger.info('Task completed', {
        agent: result.agent,
        taskId: result.taskId,
        status: result.status,
        duration: result.durationMs
      });
    });

    this.agentRegistry.on('task_failed', (result) => {
      logger.error('Task failed', {
        agent: result.agent,
        taskId: result.taskId,
        error: result.error
      });
    });
  }

  private async startSecurityAgent(): Promise<void> {
    return new Promise((resolve, reject) => {
      const agentPath = path.join(this.testRepoPath, 'packages/agents/src/security_agent.py');
      const socketPath = this.socketServer['socketPath'];

      logger.info('Starting security agent...', { agentPath, socketPath });

      // Start Python agent
      this.securityAgentProcess = spawn('python3', [agentPath], {
        cwd: this.testRepoPath,
        env: {
          ...process.env,
          PYTHONPATH: path.join(this.testRepoPath, 'packages/agents/src'),
          SOCKET_PATH: socketPath,
          OBS_PATH: path.join(this.testRepoPath, 'obs')
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.securityAgentProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          logger.info(`[SECURITY_AGENT] ${output}`);
        }
      });

      this.securityAgentProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          logger.error(`[SECURITY_AGENT] ${output}`);
        }
      });

      this.securityAgentProcess.on('error', (error: Error) => {
        logger.error('Security agent process error', { error });
        reject(error);
      });

      this.securityAgentProcess.on('close', (code: number) => {
        logger.warn('Security agent process closed', { code });
      });

      // Give agent time to start
      setTimeout(() => {
        logger.info('Security agent started');
        resolve();
      }, 2000);
    });
  }

  private async waitForAgentRegistration(): Promise<void> {
    logger.info('Waiting for agent registration...');

    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const agents = this.agentRegistry.getAllAgents();
      const securityAgent = agents.find(a => a.agent === 'security');

      if (securityAgent) {
        logger.info('Security agent registered successfully', {
          pid: securityAgent.pid,
          capabilities: securityAgent.capabilities
        });
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error('Security agent failed to register');
  }

  async runTest(): Promise<void> {
    logger.info('Running integration test...');

    // Create mock git event
    const gitEvent: GitEvent = {
      repo: this.testRepoPath,
      branch: 'main',
      commit: 'test-commit-' + Date.now(),
      files: [
        'packages/orchestrator/src/index.ts',
        'packages/shared/src/types/agent-events.ts',
        'packages/agents/src/security_agent.py'
      ],
      loc_changed: 500,
      author: 'integration-test',
      message: 'Test commit for integration',
      timestamp: AgentUtils.now()
    };

    logger.info('Created test git event', {
      files: gitEvent.files.length,
      loc_changed: gitEvent.loc_changed
    });

    try {
      // Create and send task to security agent
      const task = {
        task_id: `security-test-${Date.now()}`,
        agent: 'security' as const,
        scope: gitEvent.files,
        context: {
          repo_root: gitEvent.repo,
          commit_hash: gitEvent.commit,
          branch: gitEvent.branch,
        },
        output: path.join(this.testRepoPath, 'obs/reports/security-test.sarif'),
        config: {
          tools: ['semgrep', 'gitleaks'],
          severity_threshold: 'medium'
        }
      };

      logger.info('Sending task to security agent', {
        task_id: task.task_id,
        scope: task.scope.length
      });

      const result = await this.agentRegistry.sendTask(task);

      logger.info('Task completed successfully', {
        agent: result.agent,
        taskId: result.taskId,
        status: result.status,
        duration: result.durationMs,
        findingsCount: result.results?.findings?.length || 0
      });

      // Verify output file was created
      if (fs.existsSync(task.output)) {
        const sarifData = JSON.parse(fs.readFileSync(task.output, 'utf8'));
        logger.info('SARIF report generated', {
          path: task.output,
          results: sarifData.results?.length || 0,
          tool: sarifData.runs?.[0]?.tool?.driver?.name
        });
      } else {
        logger.warn('SARIF report not found', { path: task.output });
      }

      // Print agent registry stats
      const stats = this.agentRegistry.getStats();
      logger.info('Agent registry stats', stats);

    } catch (error) {
      logger.error('Integration test failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up integration test...');

    try {
      // Stop security agent
      if (this.securityAgentProcess) {
        this.securityAgentProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!this.securityAgentProcess.killed) {
          this.securityAgentProcess.kill('SIGKILL');
        }
      }

      // Stop socket server
      await this.socketServer.stop();

      // Cleanup registry
      this.agentRegistry.cleanup();

      logger.info('Integration test cleaned up');
    } catch (error) {
      logger.error('Error during cleanup', { error });
    }
  }
}

// Main execution
async function main() {
  const test = new IntegrationTest();

  try {
    await test.setup();
    await test.runTest();

    logger.info('✅ Integration test completed successfully!');

    // Wait a bit before cleanup to see final logs
    await new Promise(resolve => setTimeout(resolve, 1000));

  } catch (error) {
    logger.error('❌ Integration test failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  } finally {
    await test.cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}