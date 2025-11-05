/**
 * ESLint Analyzer
 * Integrates ESLint for JavaScript/TypeScript code quality analysis
 */

import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ESLintResult, ESLintMessage } from './types.js';

export interface ESLintAnalyzerConfig {
  enabled: boolean;
  configFile?: string;
  extends?: string[];
  rules?: Record<string, any>;
  timeout: number;
  maxMemory: number;
}

export class ESLintAnalyzer {
  private config: ESLintAnalyzerConfig;
  private eslintPath: string;

  constructor(config: ESLintAnalyzerConfig) {
    this.config = config;
    this.eslintPath = this.findESLintPath();
  }

  private findESLintPath(): string {
    // Try to find ESLint in node_modules
    const possiblePaths = [
      './node_modules/.bin/eslint',
      './node_modules/eslint/bin/eslint.js',
      '/usr/local/bin/eslint',
      'eslint'
    ];

    for (const path of possiblePaths) {
      try {
        return path;
      } catch {
        continue;
      }
    }

    throw new Error('ESLint not found');
  }

  async analyzeFiles(files: string[]): Promise<ESLintResult[]> {
    if (!this.config.enabled || files.length === 0) {
      return [];
    }

    const results: ESLintResult[] = [];
    const batchSize = 50; // Process files in batches to avoid memory issues

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await this.analyzeBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async analyzeBatch(files: string[]): Promise<ESLintResult[]> {
    return new Promise((resolve, reject) => {
      const args = [
        '--format', 'json',
        '--no-eslintrc',
        '--max-warnings', '0'
      ];

      if (this.config.configFile) {
        args.push('--config', this.config.configFile);
      }

      if (this.config.extends) {
        for (const ext of this.config.extends) {
          args.push('--extend', ext);
        }
      }

      if (this.config.rules) {
        // Create temporary config file with custom rules
        const tempConfigPath = this.createTempConfig(this.config.rules);
        args.push('--config', tempConfigPath);
      }

      args.push(...files);

      const child = spawn(this.eslintPath, args, {
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('close', (code) => {
        if (code !== 0) {
          // ESLint returns 1 when there are lint errors, which is expected
          if (stderr.includes('Error:') || stderr.includes('CLIError:')) {
            reject(new Error(`ESLint error: ${stderr}`));
            return;
          }
        }

        try {
          const results = this.parseESLintOutput(stdout);
          resolve(results);
        } catch (error) {
          reject(new Error(`Failed to parse ESLint output: ${error}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to start ESLint: ${error.message}`));
      });

      // Set timeout
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`ESLint analysis timeout (${this.config.timeout}ms)`));
      }, this.config.timeout);
    });
  }

  private parseESLintOutput(output: string): ESLintResult[] {
    if (!output.trim()) {
      return [];
    }

    try {
      const rawResults = JSON.parse(output);

      // ESLint output format depends on version
      if (Array.isArray(rawResults)) {
        return rawResults.map(this.normalizeResult);
      } else if (rawResults && typeof rawResults === 'object') {
        // Handle single file result
        return [this.normalizeResult(rawResults)];
      }

      return [];
    } catch (error) {
      console.error('Failed to parse ESLint JSON output:', error);
      throw error;
    }
  }

  private normalizeResult(result: any): ESLintResult {
    return {
      filePath: result.filePath || result.file || 'unknown',
      messages: (result.messages || []).map(this.normalizeMessage),
      errorCount: result.errorCount || 0,
      warningCount: result.warningCount || 0,
      fixableErrorCount: result.fixableErrorCount || 0,
      fixableWarningCount: result.fixableWarningCount || 0,
    };
  }

  private normalizeMessage(message: any): ESLintMessage {
    return {
      ruleId: message.ruleId || message.rule || 'unknown',
      severity: message.severity || 1,
      message: message.message || 'No message',
      line: message.line || 0,
      column: message.column || 0,
      nodeType: message.nodeType,
      messageId: message.messageId,
      endLine: message.endLine,
      endColumn: message.endColumn,
      fix: message.fix,
    };
  }

  private createTempConfig(rules: Record<string, any>): string {
    const tempPath = join(process.cwd(), '.eslint-temp.json');
    const config = {
      rules,
      env: {
        browser: true,
        es2022: true,
        node: true,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    };

    require('fs').writeFileSync(tempPath, JSON.stringify(config, null, 2));

    // Schedule cleanup
    setTimeout(() => {
      try {
        require('fs').unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }, 5000);

    return tempPath;
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await access(this.eslintPath);
      return true;
    } catch {
      return false;
    }
  }

  getVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.eslintPath, ['--version'], {
        stdio: 'pipe',
      });

      let output = '';
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          output += data.toString();
        });
      }

      child.on('close', () => {
        resolve(output.trim());
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }
}