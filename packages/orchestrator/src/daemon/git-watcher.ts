/**
 * Git Watcher Daemon
 * F1 Pit Stop Architecture - Monitors git repositories for changes
 */

import chokidar from 'chokidar';
import { simpleGit } from 'simple-git';
import winston from 'winston';
import { GitEvent } from '@pit-crew/shared';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';

export interface GitWatcherConfig {
  watchPath: string;
  pollInterval: number;
  debounceMs: number;
  ignoredPatterns: string[];
}

export class GitWatcher extends EventEmitter {
  private config: GitWatcherConfig;
  private git: any;
  private logger: winston.Logger;
  private watcher: chokidar.FSWatcher | null = null;
  private lastKnownCommit: string = '';
  private isScanning = false;

  constructor(config: Partial<GitWatcherConfig> = {}) {
    super();

    this.config = {
      watchPath: config.watchPath || process.cwd(),
      pollInterval: config.pollInterval || 5000,
      debounceMs: config.debounceMs || 1000,
      ignoredPatterns: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/.next/**',
        '**/.nuxt/**',
        '**/logs/**',
        '**/.obs/**',
        '**/tmp/**',
        '**/.DS_Store',
        '**/Thumbs.db'
      ],
      ...config
    };

    this.git = simpleGit(this.config.watchPath);
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.prettyPrint()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: './logs/git-watcher.log',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 3,
        }),
      ],
    });
  }

  /**
   * Start the git watcher
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting Git Watcher', {
        watchPath: this.config.watchPath,
        pollInterval: this.config.pollInterval
      });

      // Verify we're in a git repository
      await this.validateGitRepository();

      // Get initial state
      this.lastKnownCommit = await this.getCurrentCommit();
      this.logger.info('Initial commit detected', { commit: this.lastKnownCommit });

      // Start file system watcher
      this.startFileWatcher();

      // Start git polling
      this.startGitPolling();

      this.logger.info('Git Watcher started successfully');
      this.emit('started');

    } catch (error) {
      this.logger.error('Failed to start Git Watcher', { error });
      throw error;
    }
  }

  /**
   * Stop the git watcher
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping Git Watcher');

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.emit('stopped');
    this.logger.info('Git Watcher stopped');
  }

  /**
   * Validate that we're in a git repository
   */
  private async validateGitRepository(): Promise<void> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`${this.config.watchPath} is not a git repository`);
      }

      // Get repository info
      const remotes = await this.git.getRemotes(true);
      const status = await this.git.status();

      this.logger.info('Git repository validated', {
        path: this.config.watchPath,
        remotes: remotes.length,
        currentBranch: status.current,
        trackedFiles: status.tracked.length
      });

    } catch (error) {
      throw new Error(`Invalid git repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current commit hash
   */
  private async getCurrentCommit(): Promise<string> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      return log.latest?.hash || '';
    } catch (error) {
      this.logger.warn('Failed to get current commit', { error });
      return '';
    }
  }

  /**
   * Start file system watcher for .git directory
   */
  private startFileWatcher(): void {
    const gitDir = path.join(this.config.watchPath, '.git');

    this.watcher = chokidar.watch(path.join(gitDir, 'logs', 'refs', 'heads'), {
      ignored: this.config.ignoredPatterns,
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('change', async (filePath: string) => {
      this.logger.debug('Git reference changed', { filePath });
      await this.debounceCheck();
    });

    this.watcher.on('error', (error) => {
      this.logger.error('File watcher error', { error });
    });
  }

  /**
   * Start git polling for changes
   */
  private startGitPolling(): void {
    const checkInterval = setInterval(async () => {
      try {
        await this.checkForChanges();
      } catch (error) {
        this.logger.error('Error during git polling', { error });
      }
    }, this.config.pollInterval);

    // Cleanup on process exit
    process.on('SIGTERM', () => {
      clearInterval(checkInterval);
      this.stop();
    });

    process.on('SIGINT', () => {
      clearInterval(checkInterval);
      this.stop();
    });
  }

  /**
   * Debounced check for changes
   */
  private debounceTimeout: NodeJS.Timeout | null = null;
  private async debounceCheck(): Promise<void> {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(async () => {
      await this.checkForChanges();
    }, this.config.debounceMs);
  }

  /**
   * Check for git changes
   */
  private async checkForChanges(): Promise<void> {
    if (this.isScanning) {
      return;
    }

    this.isScanning = true;

    try {
      const currentCommit = await this.getCurrentCommit();

      if (currentCommit && currentCommit !== this.lastKnownCommit) {
        this.logger.info('New commit detected', {
          previous: this.lastKnownCommit,
          current: currentCommit
        });

        const gitEvent = await this.createGitEvent(this.lastKnownCommit, currentCommit);

        if (gitEvent) {
          this.emit('git_event', gitEvent);
          this.lastKnownCommit = currentCommit;
        }
      }
    } catch (error) {
      this.logger.error('Error checking for changes', { error });
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Create a git event from commit changes
   */
  private async createGitEvent(fromCommit: string, toCommit: string): Promise<GitEvent | null> {
    try {
      // Get commit info
      const commitInfo = await this.git.log({ from: fromCommit, to: toCommit, maxCount: 1 });
      const latestCommit = commitInfo.latest;

      if (!latestCommit) {
        return null;
      }

      // Get changed files
      const diff = await this.git.diff([`${fromCommit}..${toCommit}`]);
      const diffSummary = await this.git.diffSummary([`${fromCommit}..${toCommit}`]);

      // Count lines changed
      const linesAdded = diffSummary.insertions;
      const linesDeleted = diffSummary.deletions;
      const locChanged = linesAdded + linesDeleted;

      // Get file list
      const changedFiles = diffSummary.files.map((file: any) => file.file);

      // Extract author and message
      const author = latestCommit.author_name || 'Unknown';
      const message = latestCommit.message || 'No message';

      // Get current branch
      const status = await this.git.status();
      const branch = status.current || 'main';

      const gitEvent: GitEvent = {
        event: 'task.completed',
        repo: path.basename(this.config.watchPath),
        branch,
        commit: latestCommit.hash,
        files: changedFiles,
        loc_changed: locChanged,
        timestamp: latestCommit.date || new Date().toISOString(),
        author,
        message: message.split('\n')[0], // First line only
      };

      this.logger.info('Git event created', {
        repo: gitEvent.repo,
        commit: gitEvent.commit,
        files: gitEvent.files.length,
        loc_changed: gitEvent.loc_changed,
        author: gitEvent.author
      });

      return gitEvent;

    } catch (error) {
      this.logger.error('Failed to create git event', {
        fromCommit,
        toCommit,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Manually trigger a check for the current commit
   */
  async checkCurrentCommit(): Promise<GitEvent | null> {
    const currentCommit = await this.getCurrentCommit();
    if (currentCommit && currentCommit !== this.lastKnownCommit) {
      const gitEvent = await this.createGitEvent(this.lastKnownCommit, currentCommit);
      if (gitEvent) {
        this.lastKnownCommit = currentCommit;
      }
      return gitEvent;
    }
    return null;
  }

  /**
   * Get repository status
   */
  async getRepositoryStatus() {
    try {
      const status = await this.git.status();
      const remotes = await this.git.getRemotes(true);
      const log = await this.git.log({ maxCount: 1 });

      return {
        path: this.config.watchPath,
        branch: status.current,
        isClean: status.isClean(),
        trackedFiles: status.tracked.length,
        modifiedFiles: status.modified.length,
        addedFiles: status.added.length,
        deletedFiles: status.deleted.length,
        remotes: remotes.length,
        lastCommit: log.latest?.hash || '',
        lastCommitDate: log.latest?.date || '',
        isScanning: this.isScanning,
        watcherActive: this.watcher !== null
      };
    } catch (error) {
      this.logger.error('Failed to get repository status', { error });
      return null;
    }
  }
}