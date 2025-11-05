/**
 * Ruff Analyzer
 * Integrates Ruff for Python code quality analysis
 */

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import type { RuffResult, RuffViolation } from './types.js';

export interface RuffAnalyzerConfig {
  enabled: boolean;
  select: string[];
  exclude: string[];
  lineLength: number;
  timeout: number;
  maxMemory: number;
}

export class RuffAnalyzer {
  private config: RuffAnalyzerConfig;
  private ruffPath: string;

  constructor(config: RuffAnalyzerConfig) {
    this.config = config;
    this.ruffPath = this.findRuffPath();
  }

  private findRuffPath(): string {
    // Try to find Ruff in node_modules
    const possiblePaths = [
      './node_modules/.bin/ruff',
      './node_modules/ruff/bin/ruff',
      '/usr/local/bin/ruff',
      'ruff'
    ];

    for (const path of possiblePaths) {
      try {
        return path;
      } catch {
        continue;
      }
    }

    throw new Error('Ruff not found');
  }

  async analyzeFiles(files: string[]): Promise<RuffResult[]> {
    if (!this.config.enabled || files.length === 0) {
      return [];
    }

    // Filter Python files
    const pythonFiles = files.filter(file =>
      file.endsWith('.py') || file.endsWith('.pyi')
    );

    if (pythonFiles.length === 0) {
      return [];
    }

    const results: RuffResult[] = [];
    const batchSize = 50;

    for (let i = 0; i < pythonFiles.length; i += batchSize) {
      const batch = pythonFiles.slice(i, i + batchSize);
      const batchResults = await this.analyzeBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async analyzeBatch(files: string[]): Promise<RuffResult[]> {
    return new Promise((resolve, reject) => {
      const args = [
        'check',
        '--output-format', 'json',
        '--no-fix',
        '--exit-zero',
        '--extend-select', this.config.select.join(','),
        '--line-length', this.config.lineLength.toString()
      ];

      for (const exclude of this.config.exclude) {
        args.push('--exclude', exclude);
      }

      args.push(...files);

      const child = spawn(this.ruffPath, args, {
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
        if (code !== 0 && code !== 1) {
          // Ruff returns 1 when there are issues, which is expected
          reject(new Error(`Ruff process failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const results = this.parseRuffOutput(stdout, files);
          resolve(results);
        } catch (error) {
          reject(new Error(`Failed to parse Ruff output: ${error}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to start Ruff: ${error.message}`));
      });

      // Set timeout
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Ruff analysis timeout (${this.config.timeout}ms)`));
      }, this.config.timeout);
    });
  }

  private parseRuffOutput(output: string, files: string[]): RuffResult[] {
    if (!output.trim()) {
      // No issues found, return empty results for each file
      return files.map(filePath => ({
        filePath,
        violations: [],
        statistics: {
          errors: 0,
          warnings: 0,
          info: 0,
          fixable: 0,
        },
      }));
    }

    try {
      const rawResults = JSON.parse(output);

      if (!Array.isArray(rawResults)) {
        throw new Error('Expected array of results from Ruff');
      }

      return rawResults.map(this.normalizeResult);
    } catch (error) {
      console.error('Failed to parse Ruff JSON output:', error);
      throw error;
    }
  }

  private normalizeResult(result: any): RuffResult {
    const violations = (result.violations || []).map(this.normalizeViolation);

    const statistics = {
      errors: violations.filter(v => v.level === 'error').length,
      warnings: violations.filter(v => v.level === 'warning').length,
      info: violations.filter(v => v.level === 'info').length,
      fixable: violations.filter(v => v.fix).length,
    };

    return {
      filePath: result.filename || result.file || 'unknown',
      violations,
      statistics,
    };
  }

  private normalizeViolation(violation: any): RuffViolation {
    return {
      kind: violation.kind || 'unknown',
      code: violation.code || 'unknown',
      message: violation.message || 'No message',
      span: violation.span || { start: 0, end: 0 },
      level: violation.level || 'warning',
      fix: violation.fix,
    };
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await access(this.ruffPath);
      return true;
    } catch {
      return false;
    }
  }

  getVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ruffPath, ['--version'], {
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

  async getAvailableRules(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ruffPath, ['rule', '--list'], {
        stdio: 'pipe',
      });

      let output = '';
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          output += data.toString();
        });
      }

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to list rules with code ${code}`));
          return;
        }

        const rules = output
          .split('\n')
          .filter(line => line.trim())
          .map(line => line.trim());

        resolve(rules);
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }
}