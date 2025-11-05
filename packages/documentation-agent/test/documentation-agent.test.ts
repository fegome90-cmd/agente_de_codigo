/**
 * Unit Tests for Documentation Agent
 * Tests the main DocumentationAgent class functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DocumentationAgent } from '../src/documentation-agent.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { DocumentationTaskData, DocumentationFinding } from '../src/types.js';

// Mock the socket client
jest.mock('../src/socket-client.js');

describe('DocumentationAgent', () => {
  let agent: DocumentationAgent;
  let testDir: string;

  beforeEach(() => {
    agent = new DocumentationAgent('/tmp/test.sock');
    testDir = join(__dirname, 'fixtures');
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const capabilities = (agent as any).getCapabilities();

      expect(capabilities.supportsHeartbeat).toBe(true);
      expect(capabilities.supportsTasks).toBe(true);
      expect(capabilities.supportsEvents).toBe(true);
      expect(capabilities.tools).toContain('@apidevtools/swagger-parser');
      expect(capabilities.languages).toContain('json');
      expect(capabilities.features).toContain('openapi-validation');
    });

    it('should update configuration with task-specific settings', () => {
      const taskConfig = {
        timeoutSeconds: 120,
        breakingChangeThresholds: {
          critical: 0,
          high: 5,
          medium: 10
        },
        semverAnalysis: {
          autoRecommend: false,
          considerBreakingChanges: true,
          considerDeprecations: true
        }
      };

      // Access private method through type assertion for testing
      (agent as any).updateConfig(taskConfig);

      const config = (agent as any).config;
      expect(config.timeoutSeconds).toBe(120);
      expect(config.breakingChangeThresholds.high).toBe(5);
      expect(config.semverAnalysis.autoRecommend).toBe(false);
    });
  });

  describe('OpenAPI File Filtering', () => {
    beforeEach(async () => {
      await fs.mkdir(testDir, { recursive: true });
    });

    it('should identify and filter OpenAPI files', async () => {
      // Create test files
      const openApiFile = join(testDir, 'openapi.json');
      const swaggerFile = join(testDir, 'swagger.yaml');
      const regularFile = join(testDir, 'package.json');
      const nonApiFile = join(testDir, 'config.txt');

      await Promise.all([
        fs.writeFile(openApiFile, '{"openapi": "3.0.0"}'),
        fs.writeFile(swaggerFile, 'openapi: 3.0.0'),
        fs.writeFile(regularFile, '{"name": "test"}'),
        fs.writeFile(nonApiFile, 'some config')
      ]);

      const scope = [openApiFile, swaggerFile, regularFile, nonApiFile];
      const filteredFiles = await (agent as any).filterOpenAPIFiles(scope);

      expect(filteredFiles).toHaveLength(2);
      expect(filteredFiles).toContain(openApiFile);
      expect(filteredFiles).toContain(swaggerFile);
      expect(filteredFiles).not.toContain(regularFile);
      expect(filteredFiles).not.toContain(nonApiFile);
    });

    it('should search subdirectories for OpenAPI files', async () => {
      const subDir = join(testDir, 'api');
      await fs.mkdir(subDir, { recursive: true });

      const openApiFile = join(subDir, 'spec.json');
      await fs.writeFile(openApiFile, '{"openapi": "3.0.0"}');

      const scope = [testDir];
      const filteredFiles = await (agent as any).filterOpenAPIFiles(scope);

      expect(filteredFiles).toHaveLength(1);
      expect(filteredFiles[0]).toBe(openApiFile);
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  describe('Severity and Category Breakdowns', () => {
    beforeEach(() => {
      // Setup test findings
      const testFindings: DocumentationFinding[] = [
        {
          ruleId: 'PATH_REMOVED',
          message: 'Path /users was removed',
          severity: 'error',
          filePath: 'openapi.json',
          category: 'breaking-change',
          changeType: 'removed'
        },
        {
          ruleId: 'MISSING_OPERATION_ID',
          message: 'Operation missing operationId',
          severity: 'warning',
          filePath: 'openapi.json',
          category: 'quality'
        },
        {
          ruleId: 'VERSION_CHANGED',
          message: 'Version changed from 1.0.0 to 2.0.0',
          severity: 'info',
          filePath: 'openapi.json',
          category: 'api-change'
        },
        {
          ruleId: 'SCHEMA_REMOVED',
          message: 'Schema User was removed',
          severity: 'error',
          filePath: 'openapi.json',
          category: 'breaking-change',
          changeType: 'removed'
        }
      ];

      (agent as any).findings = testFindings;
    });

    it('should generate correct severity breakdown', () => {
      const breakdown = (agent as any).getSeverityBreakdown();

      expect(breakdown.error).toBe(2);
      expect(breakdown.warning).toBe(1);
      expect(breakdown.info).toBe(1);
    });

    it('should generate correct category breakdown', () => {
      const breakdown = (agent as any).getCategoryBreakdown();

      expect(breakdown['breaking-change']).toBe(2);
      expect(breakdown.quality).toBe(1);
      expect(breakdown['api-change']).toBe(1);
    });
  });

  describe('SemVer Recommendation', () => {
    it('should recommend major version for breaking changes', () => {
      const oldDoc = { version: '1.2.3' };
      const newDoc = { version: '1.3.0' };

      const findings: DocumentationFinding[] = [
        {
          ruleId: 'PATH_REMOVED',
          message: 'Breaking change',
          severity: 'error',
          filePath: 'openapi.json',
          category: 'breaking-change'
        }
      ];

      (agent as any).config.semverAnalysis.autoRecommend = true;
      const recommendation = (agent as any).generateSemVerRecommendation(oldDoc, newDoc, findings);

      expect(recommendation.current).toBe('1.2.3');
      expect(recommendation.recommended).toBe('2.0.0');
      expect(recommendation.breakingChanges).toBe(1);
      expect(recommendation.reason).toContain('breaking changes');
    });

    it('should recommend minor version for additions', () => {
      const oldDoc = { version: '1.2.3' };
      const newDoc = { version: '1.3.0' };

      const findings: DocumentationFinding[] = [
        {
          ruleId: 'PATH_ADDED',
          message: 'New path added',
          severity: 'info',
          filePath: 'openapi.json',
          category: 'api-change',
          changeType: 'added'
        }
      ];

      (agent as any).config.semverAnalysis.autoRecommend = true;
      const recommendation = (agent as any).generateSemVerRecommendation(oldDoc, newDoc, findings);

      expect(recommendation.current).toBe('1.2.3');
      expect(recommendation.recommended).toBe('1.3.0');
      expect(recommendation.additions).toBe(1);
      expect(recommendation.reason).toContain('additions');
    });

    it('should recommend patch version for minor changes', () => {
      const oldDoc = { version: '1.2.3' };
      const newDoc = { version: '1.2.4' };

      const findings: DocumentationFinding[] = [
        {
          ruleId: 'TITLE_CHANGED',
          message: 'Title updated',
          severity: 'info',
          filePath: 'openapi.json',
          category: 'api-change'
        }
      ];

      (agent as any).config.semverAnalysis.autoRecommend = true;
      const recommendation = (agent as any).generateSemVerRecommendation(oldDoc, newDoc, findings);

      expect(recommendation.current).toBe('1.2.3');
      expect(recommendation.recommended).toBe('1.2.4');
      expect(recommendation.reason).toContain('Minor improvements');
    });

    it('should return undefined when auto-recommend is disabled', () => {
      const oldDoc = { version: '1.2.3' };
      const newDoc = { version: '1.3.0' };
      const findings: DocumentationFinding[] = [];

      (agent as any).config.semverAnalysis.autoRecommend = false;
      const recommendation = (agent as any).generateSemVerRecommendation(oldDoc, newDoc, findings);

      expect(recommendation).toBeUndefined();
    });
  });

  describe('Changelog Generation', () => {
    it('should generate changelog from findings', async () => {
      const oldDoc = { version: '1.0.0' };
      const newDoc = { version: '2.0.0' };

      const findings: DocumentationFinding[] = [
        {
          ruleId: 'PATH_ADDED',
          message: 'Added new /posts endpoint',
          severity: 'info',
          filePath: 'openapi.json',
          category: 'api-change',
          changeType: 'added',
          metadata: { path: '/posts' }
        },
        {
          ruleId: 'PATH_REMOVED',
          message: 'Removed /legacy endpoint',
          severity: 'error',
          filePath: 'openapi.json',
          category: 'breaking-change',
          changeType: 'removed',
          metadata: { path: '/legacy' }
        },
        {
          ruleId: 'PARAMETER_DEPRECATED',
          message: 'Deprecated old parameter',
          severity: 'warning',
          filePath: 'openapi.json',
          category: 'deprecation'
        }
      ];

      const context = { repoRoot: '/tmp', commitHash: 'abc123' };
      const changelog = await (agent as any).generateChangelog(oldDoc, newDoc, findings, context);

      expect(changelog.version).toBe('2.0.0');
      expect(changelog.entries).toHaveLength(3);
      expect(changelog.summary.added).toBe(1);
      expect(changelog.summary.removed).toBe(1);
      expect(changelog.summary.deprecated).toBe(1);
      expect(changelog.summary.breaking).toBe(1); // removed path is breaking

      const addedEntry = changelog.entries.find((e: any) => e.type === 'added');
      expect(addedEntry?.message).toContain('/posts endpoint');
      expect(addedEntry?.scope).toBe('/posts');

      const removedEntry = changelog.entries.find((e: any) => e.type === 'removed');
      expect(removedEntry?.message).toContain('/legacy endpoint');
      expect(removedEntry?.breaking).toBe(true);
    });
  });

  describe('Task Handling', () => {
    it('should handle documentation analysis task', async () => {
      const openApiSpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const apiFile = join(testDir, 'api.json');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(apiFile, JSON.stringify(openApiSpec, null, 2));

      const taskData: DocumentationTaskData = {
        scope: [apiFile],
        context: {
          repoRoot: testDir,
          commitHash: 'abc123',
          branch: 'main'
        },
        output: join(testDir, 'result.json')
      };

      // Mock the response sending
      const sendTaskResponseSpy = jest.spyOn(agent, 'sendTaskResponse');

      await agent.handleTask('test-task-123', taskData);

      expect(sendTaskResponseSpy).toHaveBeenCalledWith(
        'test-task-123',
        'done',
        expect.objectContaining({
          findings_count: expect.any(Number),
          tools_used: expect.arrayContaining(['@apidevtools/swagger-parser']),
          openapi_files_analyzed: 1,
          analysis_summary: expect.any(String)
        }),
        expect.any(Number)
      );

      // Verify output file was created
      const outputExists = await fs.access(taskData.output).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });

    it('should handle task with no OpenAPI files', async () => {
      const taskData: DocumentationTaskData = {
        scope: [join(testDir, 'package.json')],
        context: { repoRoot: testDir, commitHash: 'abc123', branch: 'main' },
        output: join(testDir, 'result.json')
      };

      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(join(testDir, 'package.json'), '{"name": "test"}');

      const sendTaskResponseSpy = jest.spyOn(agent, 'sendTaskResponse');

      await agent.handleTask('test-task-456', taskData);

      expect(sendTaskResponseSpy).toHaveBeenCalledWith(
        'test-task-456',
        'done',
        expect.objectContaining({
          findings_count: 0,
          message: 'No OpenAPI files found for analysis'
        })
      );
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle task processing errors gracefully', async () => {
      const taskData: DocumentationTaskData = {
        scope: ['/nonexistent/path/api.json'],
        context: { repoRoot: '/tmp', commitHash: 'abc123', branch: 'main' },
        output: '/tmp/result.json'
      };

      const sendTaskResponseSpy = jest.spyOn(agent, 'sendTaskResponse');

      await agent.handleTask('test-task-error', taskData);

      expect(sendTaskResponseSpy).toHaveBeenCalledWith(
        'test-task-error',
        'failed',
        expect.objectContaining({
          error: expect.any(String),
          error_type: expect.any(String)
        })
      );
    });
  });

  describe('Analysis Summary Generation', () => {
    it('should generate comprehensive analysis summary', () => {
      const findings: DocumentationFinding[] = [
        {
          ruleId: 'PATH_REMOVED',
          message: 'Path removed',
          severity: 'error',
          filePath: 'openapi.json',
          category: 'breaking-change'
        },
        {
          ruleId: 'MISSING_OPERATION_ID',
          message: 'Missing operationId',
          severity: 'warning',
          filePath: 'openapi.json',
          category: 'quality'
        }
      ];

      const toolsUsed = new Set(['@apidevtools/swagger-parser', 'document-comparison']);
      const summary = (agent as any).generateAnalysisSummary(findings, toolsUsed);

      expect(summary).toContain('@apidevtools/swagger-parser');
      expect(summary).toContain('document-comparison');
      expect(summary).toContain('2 issues');
      expect(summary).toContain('1 critical');
      expect(summary).toContain('1 warnings');
      expect(summary).toContain('1 breaking changes');
      expect(summary).toContain('0 deprecations');
    });
  });
});