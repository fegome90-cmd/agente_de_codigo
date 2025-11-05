/**
 * Unit Tests for OpenAPI Parser
 * Tests OpenAPI parsing, validation, and comparison functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OpenAPIParser } from '../src/openapi-parser.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { DocumentationFinding } from '../src/types.js';

describe('OpenAPIParser', () => {
  let parser: OpenAPIParser;
  let testDir: string;

  beforeEach(() => {
    parser = new OpenAPIParser(5); // 5MB max file size
    testDir = join(__dirname, 'fixtures');
  });

  describe('isOpenAPIFile', () => {
    it('should identify valid OpenAPI JSON files', () => {
      expect(OpenAPIParser.isOpenAPIFile('openapi.json')).toBe(true);
      expect(OpenAPIParser.isOpenAPIFile('api-spec.json')).toBe(true);
      expect(OpenAPIParser.isOpenAPIFile('swagger.json')).toBe(true);
    });

    it('should identify valid OpenAPI YAML files', () => {
      expect(OpenAPIParser.isOpenAPIFile('openapi.yaml')).toBe(true);
      expect(OpenAPIParser.isOpenAPIFile('api.yml')).toBe(true);
      expect(OpenAPIParser.isOpenAPIFile('swagger.yaml')).toBe(true);
    });

    it('should reject non-OpenAPI files', () => {
      expect(OpenAPIParser.isOpenAPIFile('package.json')).toBe(false);
      expect(OpenAPIParser.isOpenAPIFile('README.md')).toBe(false);
      expect(OpenAPIParser.isOpenAPIFile('config.js')).toBe(false);
    });
  });

  describe('parseDocument', () => {
    const validOpenAPI = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A test API'
      },
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            summary: 'Get all users',
            responses: {
              '200': {
                description: 'Successful response',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    it('should parse a valid OpenAPI document', async () => {
      const testFile = join(testDir, 'valid-api.json');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testFile, JSON.stringify(validOpenAPI, null, 2));

      const result = await parser.parseDocument(testFile);

      expect(result.validationErrors).toHaveLength(0);
      expect(result.document.title).toBe('Test API');
      expect(result.document.version).toBe('1.0.0');
      expect(Object.keys(result.document.paths)).toContain('/users');
    });

    it('should detect missing required fields', async () => {
      const invalidOpenAPI = {
        // missing openapi version
        info: {
          // missing title
          version: '1.0.0'
        },
        paths: {}
      };

      const testFile = join(testDir, 'invalid-api.json');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testFile, JSON.stringify(invalidOpenAPI, null, 2));

      const result = await parser.parseDocument(testFile);

      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.validationErrors.some(e => e.ruleId === 'MISSING_OPENAPI_VERSION')).toBe(true);
      expect(result.validationErrors.some(e => e.ruleId === 'MISSING_TITLE')).toBe(true);
    });

    it('should handle file size limits', async () => {
      const largeContent = '{"data": "' + 'x'.repeat(6 * 1024 * 1024) + '"}'; // 6MB
      const testFile = join(testDir, 'large-api.json');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testFile, largeContent);

      const result = await parser.parseDocument(testFile);

      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors[0].ruleId).toBe('FILE_TOO_LARGE');
      expect(result.validationErrors[0].severity).toBe('error');
    });

    it('should validate operations', async () => {
      const openAPIWithIssues = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              // missing operationId
              summary: 'Get users',
              responses: {
                '200': {
                  description: 'Success',
                  // missing content or $ref
                }
              }
            },
            post: {
              operationId: 'createUser',
              // missing responses
            }
          }
        }
      };

      const testFile = join(testDir, 'validation-issues.json');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testFile, JSON.stringify(openAPIWithIssues, null, 2));

      const result = await parser.parseDocument(testFile);

      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.validationErrors.some(e => e.ruleId === 'MISSING_OPERATION_ID')).toBe(true);
      expect(result.validationErrors.some(e => e.ruleId === 'EMPTY_RESPONSE')).toBe(true);
      expect(result.validationErrors.some(e => e.ruleId === 'MISSING_RESPONSES')).toBe(true);
    });
  });

  describe('compareDocuments', () => {
    const baseOpenAPI = {
      version: '1.0.0',
      title: 'Test API',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: { '200': { description: 'Success' } }
          }
        }
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { id: { type: 'string' } }
          }
        }
      }
    };

    it('should detect version changes', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        version: '2.0.0'
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'VERSION_CHANGED')).toBe(true);
      expect(findings.some(f => f.message.includes('1.0.0'))).toBe(true);
      expect(findings.some(f => f.message.includes('2.0.0'))).toBe(true);
    });

    it('should detect title changes', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        title: 'Updated API'
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'TITLE_CHANGED')).toBe(true);
      expect(findings.some(f => f.message.includes('Test API'))).toBe(true);
      expect(findings.some(f => f.message.includes('Updated API'))).toBe(true);
    });

    it('should detect added paths', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        paths: {
          ...baseOpenAPI.paths,
          '/posts': {
            get: {
              operationId: 'getPosts',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'PATH_ADDED' && f.message.includes('/posts'))).toBe(true);
      expect(findings.some(f => f.changeType === 'added')).toBe(true);
    });

    it('should detect removed paths', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        paths: {}
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'PATH_REMOVED' && f.message.includes('/users'))).toBe(true);
      expect(findings.some(f => f.changeType === 'removed')).toBe(true);
      expect(findings.some(f => f.severity === 'error')).toBe(true);
    });

    it('should detect removed operations', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        paths: {
          '/users': {}
        }
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'OPERATION_REMOVED' && f.message.includes('GET'))).toBe(true);
      expect(findings.some(f => f.severity === 'error')).toBe(true);
    });

    it('should detect added operations', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        paths: {
          '/users': {
            ...baseOpenAPI.paths['/users'],
            post: {
              operationId: 'createUser',
              responses: { '201': { description: 'Created' } }
            }
          }
        }
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'OPERATION_ADDED' && f.message.includes('POST'))).toBe(true);
      expect(findings.some(f => f.changeType === 'added')).toBe(true);
    });

    it('should detect removed success responses', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '404': { description: 'Not found' }
              }
            }
          }
        }
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'SUCCESS_RESPONSE_REMOVED')).toBe(true);
      expect(findings.some(f => f.severity === 'error')).toBe(true);
    });

    it('should detect added schemas', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        components: {
          schemas: {
            ...baseOpenAPI.components.schemas,
            Post: {
              type: 'object',
              properties: { title: { type: 'string' } }
            }
          }
        }
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'SCHEMA_ADDED' && f.message.includes('Post'))).toBe(true);
      expect(findings.some(f => f.changeType === 'added')).toBe(true);
    });

    it('should detect removed schemas', () => {
      const newOpenAPI = {
        ...baseOpenAPI,
        components: {
          schemas: {}
        }
      };

      const findings = parser.compareDocuments(baseOpenAPI, newOpenAPI);

      expect(findings.some(f => f.ruleId === 'SCHEMA_REMOVED' && f.message.includes('User'))).toBe(true);
      expect(findings.some(f => f.changeType === 'removed')).toBe(true);
      expect(findings.some(f => f.severity === 'error')).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle a complete workflow', async () => {
      // Create old version
      const oldSpec = {
        openapi: '3.0.0',
        info: { title: 'User API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          schemas: {
            User: { type: 'object', properties: { id: { type: 'string' } } }
          }
        }
      };

      // Create new version with changes
      const newSpec = {
        openapi: '3.0.0',
        info: { title: 'User API v2', version: '2.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            },
            post: {
              operationId: 'createUser',
              responses: { '201': { description: 'Created' } }
            }
          },
          '/posts': {
            get: {
              operationId: 'getPosts',
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            },
            Post: { type: 'object', properties: { title: { type: 'string' } } }
          }
        }
      };

      const oldFile = join(testDir, 'old-spec.json');
      const newFile = join(testDir, 'new-spec.json');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(oldFile, JSON.stringify(oldSpec, null, 2));
      await fs.writeFile(newFile, JSON.stringify(newSpec, null, 2));

      // Parse both documents
      const oldResult = await parser.parseDocument(oldFile);
      const newResult = await parser.parseDocument(newFile);

      // Compare documents
      const findings = parser.compareDocuments(oldResult.document, newResult.document);

      // Verify results
      expect(oldResult.validationErrors).toHaveLength(0);
      expect(newResult.validationErrors).toHaveLength(0);
      expect(findings.length).toBeGreaterThan(0);

      // Check for expected changes
      expect(findings.some(f => f.ruleId === 'VERSION_CHANGED')).toBe(true);
      expect(findings.some(f => f.ruleId === 'TITLE_CHANGED')).toBe(true);
      expect(findings.some(f => f.ruleId === 'OPERATION_ADDED')).toBe(true);
      expect(findings.some(f => f.ruleId === 'PATH_ADDED')).toBe(true);
      expect(findings.some(f => f.ruleId === 'SCHEMA_ADDED')).toBe(true);

      // Verify metadata is included
      const versionChange = findings.find(f => f.ruleId === 'VERSION_CHANGED');
      expect(versionChange?.metadata).toHaveProperty('oldValue', '1.0.0');
      expect(versionChange?.metadata).toHaveProperty('newValue', '2.0.0');
    });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});