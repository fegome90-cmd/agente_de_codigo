/**
 * OpenAPI Parser and Validator
 * Handles parsing, validation, and comparison of OpenAPI specifications
 */

import $RefParser from '@apidevtools/swagger-parser';
import { OpenAPIDocument, DocumentationFinding } from './types.js';
import { promises as fs } from 'fs';
import { join, extname } from 'path';

export class OpenAPIParser {
  private maxFileSize: number;

  constructor(maxFileSizeMb: number = 10) {
    this.maxFileSize = maxFileSizeMb * 1024 * 1024;
  }

  /**
   * Parse and validate an OpenAPI document
   */
  async parseDocument(filePath: string): Promise<{
    document: OpenAPIDocument;
    validationErrors: DocumentationFinding[];
  }> {
    const validationErrors: DocumentationFinding[] = [];

    try {
      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        validationErrors.push({
          ruleId: 'FILE_TOO_LARGE',
          message: `OpenAPI file too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: ${this.maxFileSize / 1024 / 1024}MB)`,
          severity: 'error',
          filePath,
          category: 'validation',
          metadata: { actualSize: stats.size, maxSize: this.maxFileSize }
        });
        return { document: {} as OpenAPIDocument, validationErrors };
      }

      // Parse with $RefParser
      const api = await $RefParser.bundle(filePath);

      // Validate the document
      const docValidationErrors = await this.validateDocument(api, filePath);
      validationErrors.push(...docValidationErrors);

      // Convert to our OpenAPIDocument format
      const document = this.convertToOpenAPIDocument(api, filePath);

      return { document, validationErrors };

    } catch (error) {
      validationErrors.push({
        ruleId: 'PARSE_ERROR',
        message: `Failed to parse OpenAPI document: ${(error as Error).message}`,
        severity: 'error',
        filePath,
        category: 'validation',
        metadata: { error: (error as Error).stack }
      });

      return { document: {} as OpenAPIDocument, validationErrors };
    }
  }

  /**
   * Compare two OpenAPI documents and detect changes
   */
  compareDocuments(
    oldDoc: OpenAPIDocument,
    newDoc: OpenAPIDocument,
    basePath: string = ''
  ): DocumentationFinding[] {
    const findings: DocumentationFinding[] = [];

    // Compare basic info
    if (oldDoc.version !== newDoc.version) {
      findings.push({
        ruleId: 'VERSION_CHANGED',
        message: `API version changed from ${oldDoc.version} to ${newDoc.version}`,
        severity: 'info',
        filePath: basePath,
        category: 'api-change',
        metadata: { oldValue: oldDoc.version, newValue: newDoc.version }
      });
    }

    if (oldDoc.title !== newDoc.title) {
      findings.push({
        ruleId: 'TITLE_CHANGED',
        message: `API title changed from "${oldDoc.title}" to "${newDoc.title}"`,
        severity: 'info',
        filePath: basePath,
        category: 'api-change',
        metadata: { oldValue: oldDoc.title, newValue: newDoc.title }
      });
    }

    // Compare paths
    const pathChanges = this.comparePaths(oldDoc.paths, newDoc.paths, basePath);
    findings.push(...pathChanges);

    // Compare components
    const componentChanges = this.compareComponents(oldDoc.components, newDoc.components, basePath);
    findings.push(...componentChanges);

    return findings;
  }

  /**
   * Validate an OpenAPI document structure
   */
  private async validateDocument(api: any, filePath: string): Promise<DocumentationFinding[]> {
    const errors: DocumentationFinding[] = [];

    // Basic structure validation
    if (!api.openapi) {
      errors.push({
        ruleId: 'MISSING_OPENAPI_VERSION',
        message: 'Missing OpenAPI version field',
        severity: 'error',
        filePath,
        category: 'validation'
      });
    }

    if (!api.info) {
      errors.push({
        ruleId: 'MISSING_INFO',
        message: 'Missing info object',
        severity: 'error',
        filePath,
        category: 'validation'
      });
    } else {
      if (!api.info.title) {
        errors.push({
          ruleId: 'MISSING_TITLE',
          message: 'Missing API title',
          severity: 'error',
          filePath,
          category: 'validation'
        });
      }

      if (!api.info.version) {
        errors.push({
          ruleId: 'MISSING_API_VERSION',
          message: 'Missing API version',
          severity: 'error',
          filePath,
          category: 'validation'
        });
      }
    }

    if (!api.paths) {
      errors.push({
        ruleId: 'MISSING_PATHS',
        message: 'Missing paths object',
        severity: 'error',
        filePath,
        category: 'validation'
      });
    } else {
      // Validate paths
      const pathValidationErrors = this.validatePaths(api.paths, filePath);
      errors.push(...pathValidationErrors);
    }

    // Validate components if present
    if (api.components) {
      const componentValidationErrors = this.validateComponents(api.components, filePath);
      errors.push(...componentValidationErrors);
    }

    return errors;
  }

  /**
   * Validate paths object
   */
  private validatePaths(paths: any, filePath: string): DocumentationFinding[] {
    const errors: DocumentationFinding[] = [];

    for (const [path, pathItem] of Object.entries(paths)) {
      if (!path.startsWith('/')) {
        errors.push({
          ruleId: 'INVALID_PATH_FORMAT',
          message: `Path "${path}" must start with "/"`,
          severity: 'error',
          filePath,
          category: 'validation'
        });
      }

      // Validate operations
      const pathItemObj = pathItem as any;
      const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];

      for (const method of httpMethods) {
        if (pathItemObj[method]) {
          const operation = pathItemObj[method];

          if (!operation.operationId) {
            errors.push({
              ruleId: 'MISSING_OPERATION_ID',
              message: `${method.toUpperCase()} ${path} missing operationId`,
              severity: 'warning',
              filePath,
              category: 'quality'
            });
          }

          if (!operation.responses || Object.keys(operation.responses).length === 0) {
            errors.push({
              ruleId: 'MISSING_RESPONSES',
              message: `${method.toUpperCase()} ${path} has no responses defined`,
              severity: 'error',
              filePath,
              category: 'validation'
            });
          }

          // Validate response formats
          if (operation.responses) {
            for (const [statusCode, response] of Object.entries(operation.responses as any)) {
              if (!(response as any).content && !(response as any).$ref) {
                errors.push({
                  ruleId: 'EMPTY_RESPONSE',
                  message: `${method.toUpperCase()} ${path} response ${statusCode} has no content or reference`,
                  severity: 'warning',
                  filePath,
                  category: 'quality'
                });
              }
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * Validate components object
   */
  private validateComponents(components: any, filePath: string): DocumentationFinding[] {
    const errors: DocumentationFinding[] = [];

    // Validate schemas
    if (components.schemas) {
      for (const [schemaName, schema] of Object.entries(components.schemas)) {
        if (!(schema as any).type && !(schema as any).$ref && !(schema as any).allOf && !(schema as any).anyOf && !(schema as any).oneOf) {
          errors.push({
            ruleId: 'INVALID_SCHEMA',
            message: `Schema "${schemaName}" has no type, $ref, or composition keyword`,
            severity: 'warning',
            filePath,
            category: 'validation'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Convert parsed API to our OpenAPIDocument format
   */
  private convertToOpenAPIDocument(api: any, filePath: string): OpenAPIDocument {
    return {
      version: api.info?.version || 'unknown',
      title: api.info?.title || 'Unknown API',
      paths: api.paths || {},
      components: api.components || {},
      info: api.info || {},
      servers: api.servers,
      security: api.security,
      tags: api.tags
    };
  }

  /**
   * Compare paths between two OpenAPI documents
   */
  private comparePaths(oldPaths: any, newPaths: any, basePath: string): DocumentationFinding[] {
    const findings: DocumentationFinding[] = [];
    const oldPathSet = new Set(Object.keys(oldPaths));
    const newPathSet = new Set(Object.keys(newPaths));

    // Check for removed paths
    for (const path of oldPathSet) {
      if (!newPathSet.has(path)) {
        findings.push({
          ruleId: 'PATH_REMOVED',
          message: `Path "${path}" was removed`,
          severity: 'error',
          filePath: basePath,
          category: 'breaking-change',
          changeType: 'removed',
          metadata: { path }
        });
      }
    }

    // Check for added paths
    for (const path of newPathSet) {
      if (!oldPathSet.has(path)) {
        findings.push({
          ruleId: 'PATH_ADDED',
          message: `Path "${path}" was added`,
          severity: 'info',
          filePath: basePath,
          category: 'api-change',
          changeType: 'added',
          metadata: { path }
        });
      }
    }

    // Check for modified paths
    for (const path of Array.from(oldPathSet).filter(p => newPathSet.has(p))) {
      const pathChanges = this.comparePathItem(
        oldPaths[path],
        newPaths[path],
        path,
        basePath
      );
      findings.push(...pathChanges);
    }

    return findings;
  }

  /**
   * Compare a specific path item
   */
  private comparePathItem(
    oldPathItem: any,
    newPathItem: any,
    path: string,
    basePath: string
  ): DocumentationFinding[] {
    const findings: DocumentationFinding[] = [];
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];

    for (const method of httpMethods) {
      const oldOperation = oldPathItem?.[method];
      const newOperation = newPathItem?.[method];

      if (oldOperation && !newOperation) {
        findings.push({
          ruleId: 'OPERATION_REMOVED',
          message: `${method.toUpperCase()} ${path} was removed`,
          severity: 'error',
          filePath: basePath,
          category: 'breaking-change',
          changeType: 'removed',
          metadata: { path, method }
        });
      } else if (!oldOperation && newOperation) {
        findings.push({
          ruleId: 'OPERATION_ADDED',
          message: `${method.toUpperCase()} ${path} was added`,
          severity: 'info',
          filePath: basePath,
          category: 'api-change',
          changeType: 'added',
          metadata: { path, method }
        });
      } else if (oldOperation && newOperation) {
        const operationChanges = this.compareOperation(
          oldOperation,
          newOperation,
          method,
          path,
          basePath
        );
        findings.push(...operationChanges);
      }
    }

    return findings;
  }

  /**
   * Compare operations between two path items
   */
  private compareOperation(
    oldOp: any,
    newOp: any,
    method: string,
    path: string,
    basePath: string
  ): DocumentationFinding[] {
    const findings: DocumentationFinding[] = [];

    // Check for response changes
    const oldResponses = oldOp.responses || {};
    const newResponses = newOp.responses || {};

    if (oldResponses['200'] && !newResponses['200']) {
      findings.push({
        ruleId: 'SUCCESS_RESPONSE_REMOVED',
        message: `${method.toUpperCase()} ${path} 200 response was removed`,
        severity: 'error',
        filePath: basePath,
        category: 'breaking-change',
        changeType: 'removed',
        metadata: { path, method, statusCode: '200' }
      });
    }

    // Check for parameter changes
    const oldParams = oldOp.parameters || [];
    const newParams = newOp.parameters || [];

    for (const oldParam of oldParams) {
      const matchingNewParam = newParams.find((p: any) =>
        p.name === oldParam.name && p.in === oldParam.in
      );

      if (!matchingNewParam) {
        findings.push({
          ruleId: 'PARAMETER_REMOVED',
          message: `${method.toUpperCase()} ${path} parameter "${oldParam.name}" (${oldParam.in}) was removed`,
          severity: 'error',
          filePath: basePath,
          category: 'breaking-change',
          changeType: 'removed',
          metadata: { path, method, parameter: oldParam }
        });
      } else if (oldParam.required && !matchingNewParam.required) {
        findings.push({
          ruleId: 'REQUIRED_PARAMETER_OPTIONALIZED',
          message: `${method.toUpperCase()} ${path} parameter "${oldParam.name}" is no longer required`,
          severity: 'info',
          filePath: basePath,
          category: 'api-change',
          changeType: 'modified',
          metadata: { path, method, parameter: oldParam }
        });
      } else if (!oldParam.required && matchingNewParam.required) {
        findings.push({
          ruleId: 'OPTIONAL_PARAMETER_REQUIRED',
          message: `${method.toUpperCase()} ${path} parameter "${oldParam.name}" is now required`,
          severity: 'error',
          filePath: basePath,
          category: 'breaking-change',
          changeType: 'modified',
          metadata: { path, method, parameter: oldParam }
        });
      }
    }

    return findings;
  }

  /**
   * Compare components between two OpenAPI documents
   */
  private compareComponents(
    oldComponents: any,
    newComponents: any,
    basePath: string
  ): DocumentationFinding[] {
    const findings: DocumentationFinding[] = [];

    // Compare schemas
    if (oldComponents.schemas || newComponents.schemas) {
      const oldSchemas = oldComponents.schemas || {};
      const newSchemas = newComponents.schemas || {};

      const oldSchemaNames = new Set(Object.keys(oldSchemas));
      const newSchemaNames = new Set(Object.keys(newSchemas));

      for (const schemaName of oldSchemaNames) {
        if (!newSchemaNames.has(schemaName)) {
          findings.push({
            ruleId: 'SCHEMA_REMOVED',
            message: `Schema "${schemaName}" was removed`,
            severity: 'error',
            filePath: basePath,
            category: 'breaking-change',
            changeType: 'removed',
            metadata: { schema: schemaName }
          });
        }
      }

      for (const schemaName of newSchemaNames) {
        if (!oldSchemaNames.has(schemaName)) {
          findings.push({
            ruleId: 'SCHEMA_ADDED',
            message: `Schema "${schemaName}" was added`,
            severity: 'info',
            filePath: basePath,
            category: 'api-change',
            changeType: 'added',
            metadata: { schema: schemaName }
          });
        }
      }
    }

    return findings;
  }

  /**
   * Check if a file is likely an OpenAPI specification
   */
  static isOpenAPIFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    const openAPIExtensions = ['.json', '.yaml', '.yml'];

    if (!openAPIExtensions.includes(ext)) {
      return false;
    }

    const fileName = filePath.toLowerCase();
    const openAPIPatterns = [
      'openapi', 'api', 'swagger', 'spec'
    ];

    return openAPIPatterns.some(pattern => fileName.includes(pattern));
  }
}