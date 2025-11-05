#!/usr/bin/env node

/**
 * Pit Crew Daemon
 * F1 Pit Stop Architecture - Background daemon that watches git changes and coordinates agents
 */

import dotenv from 'dotenv';
import winston from 'winston';
import PMX from '@pm2/io';
import { GitWatcher } from './git-watcher.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GitEvent } from '@pit-crew/shared';

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level}] [DAEMON]: ${message} ${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: './logs/daemon.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

class PitCrewDaemon {
  private gitWatcher: GitWatcher;
  private pmx: any;
  private isRunning = false;
  private stats = {
    eventsProcessed: 0,
    eventsEmitted: 0,
    errors: 0,
    startTime: new Date(),
    lastEventTime: null as Date | null,
  };

  constructor() {
    this.gitWatcher = new GitWatcher({
      watchPath: process.env.WATCH_PATH || process.cwd(),
      pollInterval: parseInt(process.env.GIT_POLL_INTERVAL || '5000'),
    });

    this.setupPM2Metrics();
    this.setupEventHandlers();
    this.setupGracefulShutdown();
  }

  /**
   * Setup PM2 metrics for monitoring
   */
  private setupPM2Metrics(): void {
    this.pmx = PMX;
    this.pmx.init({
      http: true,
      metrics: {
        eventLoopDump: true
      }
    });

    // Custom metrics
    const eventsProcessed = this.pmx.metric({
      name: 'Events Processed',
      id: 'daemon/events_processed'
    });

    const eventsEmitted = this.pmx.metric({
      name: 'Events Emitted',
      id: 'daemon/events_emitted'
    });

    const errorRate = this.pmx.metric({
      name: 'Error Rate',
      id: 'daemon/error_rate'
    });

    const uptime = this.pmx.metric({
      name: 'Uptime (seconds)',
      id: 'daemon/uptime'
    });

    // Update metrics periodically
    setInterval(() => {
      eventsProcessed.set(this.stats.eventsProcessed);
      eventsEmitted.set(this.stats.eventsEmitted);
      errorRate.set(this.stats.errors);
      uptime.set(Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000));
    }, 5000);

    // Actions
    this.pmx.action('get-stats', (reply: any) => {
      reply(this.stats);
    });

    this.pmx.action('get-status', (reply: any) => {
      reply({
        running: this.isRunning,
        uptime: Date.now() - this.stats.startTime.getTime(),
        lastEvent: this.stats.lastEventTime?.toISOString() || null
      });
    });

    this.pmx.action('trigger-scan', (reply: any) => {
      this.triggerManualScan().then(result => {
        reply(result);
      }).catch(error => {
        reply({ error: error.message });
      });
    });
  }

  /**
   * Setup event handlers for git watcher
   */
  private setupEventHandlers(): void {
    this.gitWatcher.on('started', () => {
      logger.info('Git watcher started');
      this.isRunning = true;
    });

    this.gitWatcher.on('stopped', () => {
      logger.info('Git watcher stopped');
      this.isRunning = false;
    });

    this.gitWatcher.on('git_event', async (gitEvent: GitEvent) => {
      this.stats.eventsProcessed++;
      this.stats.lastEventTime = new Date();

      logger.info('Git event received', {
        repo: gitEvent.repo,
        commit: gitEvent.commit,
        files: gitEvent.files.length,
        loc_changed: gitEvent.loc_changed
      });

      try {
        // Emit event to orchestrator via PM2 messenger
        await this.emitEventToOrchestrator(gitEvent);
        this.stats.eventsEmitted++;

        logger.info('Event emitted to orchestrator', {
          run_id: this.generateRunId(),
          repo: gitEvent.repo,
          commit: gitEvent.commit
        });

      } catch (error) {
        this.stats.errors++;
        logger.error('Failed to emit event to orchestrator', {
          error: error instanceof Error ? error.message : 'Unknown error',
          gitEvent
        });
      }
    });

    this.gitWatcher.on('error', (error: Error) => {
      this.stats.errors++;
      logger.error('Git watcher error', { error });
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down daemon...`);

      try {
        await this.gitWatcher.stop();
        logger.info('Daemon shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during daemon shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    logger.info('Starting Pit Crew Daemon', {
      watchPath: process.env.WATCH_PATH,
      pollInterval: process.env.GIT_POLL_INTERVAL
    });

    try {
      await this.gitWatcher.start();
      this.isRunning = true;

      logger.info('Pit Crew Daemon started successfully', {
        pid: process.pid,
        watchPath: process.env.WATCH_PATH,
        startTime: this.stats.startTime.toISOString()
      });

    } catch (error) {
      logger.error('Failed to start daemon', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    logger.info('Stopping Pit Crew Daemon');
    await this.gitWatcher.stop();
    this.isRunning = false;
    logger.info('Pit Crew Daemon stopped');
  }

  /**
   * Emit event to orchestrator via PM2 IPC
   */
  private async emitEventToOrchestrator(gitEvent: GitEvent): Promise<void> {
    // Use PM2 process messenger to communicate with orchestrator
    if (process.send) {
      return new Promise((resolve, reject) => {
        const message = {
          type: 'git_event',
          data: gitEvent,
          timestamp: new Date().toISOString(),
          source: 'pit-crew-daemon'
        };

        // Send to orchestrator process
        if (process.send) {
          try {
            process.send(message);
            resolve();
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error('process.send not available'));
        }
      });
    } else {
      // Fallback: write to trigger file for orchestrator to pick up
      const obsPath = process.env.OBS_PATH || '../../obs';
      const triggerDir = path.join(obsPath, 'triggers');

      // Ensure trigger directory exists
      await fs.mkdir(triggerDir, { recursive: true });

      const triggerFile = path.join(triggerDir, `event-${Date.now()}.json`);
      const eventData = {
        type: 'manual_review',
        git_event: gitEvent,
        timestamp: new Date().toISOString(),
        source: 'pit-crew-daemon-fallback'
      };

      await fs.writeFile(triggerFile, JSON.stringify(eventData, null, 2));
      logger.info('Fallback trigger file created', { triggerFile });
    }
  }

  /**
   * Generate a unique run ID
   */
  private generateRunId(): string {
    const chars = '0123456789abcdef';
    let result = 'r-';
    for (let i = 0; i < 4; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * Trigger manual scan of current repository state
   */
  async triggerManualScan(): Promise<any> {
    logger.info('Triggering manual scan');

    try {
      const gitEvent = await this.gitWatcher.checkCurrentCommit();

      if (gitEvent) {
        await this.emitEventToOrchestrator(gitEvent);
        this.stats.eventsEmitted++;

        return {
          success: true,
          event: gitEvent,
          message: 'Manual scan triggered successfully'
        };
      } else {
        return {
          success: false,
          message: 'No new commits found'
        };
      }
    } catch (error) {
      logger.error('Manual scan failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get daemon statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime.getTime(),
      isRunning: this.isRunning,
      watchPath: this.gitWatcher['config']?.watchPath || 'unknown'
    };
  }

  /**
   * Get repository status
   */
  async getRepositoryStatus() {
    return await this.gitWatcher.getRepositoryStatus();
  }
}

// Main execution
async function main() {
  const daemon = new PitCrewDaemon();

  try {
    await daemon.start();
  } catch (error) {
    logger.error('Failed to start Pit Crew daemon', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Export for testing
export { PitCrewDaemon };

// Run if called directly (ESM-safe check)
const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch(console.error);
}
