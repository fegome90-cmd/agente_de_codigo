/**
 * Layering Analysis Engine
 * Detects architectural layering violations using configurable YAML rules
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import * as fs from 'node:fs';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { z } from 'zod';
import { logger } from './utils/logger.js';
import type {
  LayerConfig,
  LayeringRule,
  LayeringViolation,
  ImportStatement,
  Finding,
  ArchitectureAnalysis
} from './types.js';
import { SymbolExtractor } from './symbol-extractor.js';

// Zod schemas for secure YAML loading

/**
 * Zod schema for LayerConfig
 */
const LayerConfigSchema = z.object({
  name: z.string()
    .min(1, 'Layer name is required')
    .max(50, 'Layer name too long (max 50 characters)')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Layer name must contain only alphanumeric characters, underscores, and hyphens'),
  paths: z.array(z.string())
    .min(1, 'Layer must have at least one path')
    .max(100, 'Too many paths for layer (max 100)')
    .refine((paths) => {
      // Validate that paths don't contain directory traversal
      return !paths.some(p => p.includes('..') || p.includes('~') || p.startsWith('/'));
    }, 'Paths cannot contain directory traversal or absolute paths'),
  allowedImports: z.array(z.string()).default([]),
  forbiddenImports: z.array(z.string()).default([]),
  allowedToImportFrom: z.array(z.string()).default([]),
  description: z.string().optional(),
});

/**
 * Zod schema for LayeringRule
 */
const LayeringRuleSchema = z.object({
  from: z.string()
    .min(1, 'Source layer is required')
    .max(50, 'Layer name too long'),
  to: z.string()
    .min(1, 'Target layer is required')
    .max(50, 'Layer name too long'),
  type: z.enum(['allowed', 'forbidden']).default('forbidden'),
  description: z.string().optional(),
});

/**
 * Zod schema for complete LayeringConfiguration
 */
const LayeringConfigurationSchema = z.object({
  layers: z.array(LayerConfigSchema)
    .min(1, 'At least one layer must be defined')
    .max(50, 'Too many layers (max 50)'),
  rules: z.array(LayeringRuleSchema).optional(),
  metadata: z.object({
    version: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
});

/**
 * Layering Analysis Engine for architectural violation detection
 */
export class LayeringAnalyzer {
  private layers: Map<string, LayerConfig> = new Map();
  private rules: LayeringRule[] = [];
  private symbolExtractor: SymbolExtractor;
  private configPath?: string;

  constructor(symbolExtractor: SymbolExtractor, configPath?: string) {
    this.symbolExtractor = symbolExtractor;
    this.configPath = configPath;
  }

  /**
   * Load layering configuration from YAML file
   */
  async loadConfiguration(configPath?: string): Promise<void> {
    const configToLoad = configPath || this.configPath;
    if (!configToLoad || !existsSync(configToLoad)) {
      logger.warn('⚠️ No layering configuration found, using default rules');
      this.loadDefaultConfiguration();
      return;
    }

    try {
      // Read file with size limit (prevent DoS)
      const stats = fs.statSync(configToLoad);
      const maxSize = 1024 * 1024; // 1MB limit

      if (stats.size > maxSize) {
        throw new Error(`Configuration file too large: ${stats.size} bytes (max: ${maxSize})`);
      }

      const configContent = readFileSync(configToLoad, 'utf8');

      // SECURITY: Load YAML safely with size limit
      let rawConfig: any;
      try {
        rawConfig = yamlLoad(configContent);
      } catch (yamlError) {
        const errorMessage = yamlError instanceof Error ? yamlError.message : String(yamlError);
        throw new Error(`Invalid YAML syntax: ${errorMessage}`);
      }

      // SECURITY: Validate against Zod schema
      let validatedConfig: z.infer<typeof LayeringConfigurationSchema>;

      try {
        validatedConfig = LayeringConfigurationSchema.parse(rawConfig);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          // Format validation errors
          const errorMessages = validationError.errors.map(err => {
            const path = err.path.join('.');
            return `${path}: ${err.message}`;
          });

          throw new Error(
            `Invalid layer configuration:\n${errorMessages.join('\n')}`
          );
        }
        throw validationError;
      }

      // SECURITY: Additional runtime validation for path patterns
      for (const layer of validatedConfig.layers) {
        for (const pathPattern of layer.paths) {
          // Ensure paths are within reasonable bounds
          if (pathPattern.length > 200) {
            throw new Error(`Path pattern too long: ${pathPattern}`);
          }

          // Validate path pattern doesn't escape project
          if (pathPattern.includes('..') || pathPattern.startsWith('/')) {
            throw new Error(
              `Invalid path pattern (directory traversal not allowed): ${pathPattern}`
            );
          }
        }
      }

      // Load validated layers
      this.layers.clear();
      for (const layer of validatedConfig.layers) {
        // Convert Zod types to our internal types
        const layerConfig: LayerConfig = {
          name: layer.name,
          paths: layer.paths,
          allowedImports: layer.allowedImports,
          forbiddenImports: layer.forbiddenImports,
          allowedToImportFrom: layer.allowedToImportFrom,
          description: layer.description || '',
        };

        this.layers.set(layerConfig.name, layerConfig);
        logger.debug(`Loaded layer: ${layerConfig.name} with ${layerConfig.paths.length} paths`);
      }

      // Load rules
      this.rules = (validatedConfig.rules || []).map(rule => ({
        fromLayer: rule.from,
        toLayer: rule.to,
        type: rule.type,
        description: rule.description || '',
      }));

      logger.info(`✅ Layering configuration loaded: ${this.layers.size} layers, ${this.rules.length} rules`);
    } catch (error) {
      logger.error('Failed to load layering configuration:', error);
      this.loadDefaultConfiguration();
    }
  }

  /**
   * Load default layering configuration for common architectures
   */
  private loadDefaultConfiguration(): void {
    logger.info('📋 Using default 3-tier architecture layering');

    // Default 3-tier architecture
    const defaultLayers: LayerConfig[] = [
      {
        name: 'presentation',
        paths: ['src/components/**', 'src/controllers/**', 'src/views/**', 'src/pages/**'],
        allowedImports: ['business', 'infrastructure'],
        forbiddenImports: ['presentation'],
        allowedToImportFrom: ['business', 'infrastructure'],
        description: 'UI components, controllers, and presentation logic'
      },
      {
        name: 'business',
        paths: ['src/services/**', 'src/domain/**', 'src/core/**', 'src/usecases/**'],
        allowedImports: ['business', 'infrastructure'],
        forbiddenImports: ['presentation'],
        allowedToImportFrom: ['business', 'infrastructure'],
        description: 'Business logic, services, and domain models'
      },
      {
        name: 'infrastructure',
        paths: ['src/repositories/**', 'src/database/**', 'src/api/**', 'src/utils/**', 'src/config/**'],
        allowedImports: ['infrastructure'],
        forbiddenImports: ['presentation', 'business'],
        allowedToImportFrom: ['infrastructure'],
        description: 'Data access, external APIs, and infrastructure services'
      }
    ];

    // Generate default rules from layers
    const defaultRules: LayeringRule[] = [];
    for (const layer of defaultLayers) {
      for (const forbidden of layer.forbiddenImports) {
        defaultRules.push({
          fromLayer: layer.name,
          toLayer: forbidden,
          type: 'forbidden',
          description: `Layer ${layer.name} should not import from ${forbidden}`
        });
      }
    }

    this.layers.clear();
    for (const layer of defaultLayers) {
      this.layers.set(layer.name, layer);
    }
    this.rules = defaultRules;

    logger.debug(`Default configuration loaded: ${this.layers.size} layers, ${this.rules.length} rules`);
  }

  /**
   * Analyze project for layering violations
   */
  async analyzeLayering(projectPath: string, files: string[]): Promise<LayeringViolation[]> {
    logger.info(`🏗️ Analyzing layering for ${files.length} files`);

    const violations: LayeringViolation[] = [];
    let processedFiles = 0;

    for (const filePath of files) {
      try {
        const fileViolations = await this.analyzeFileLayering(projectPath, filePath);
        violations.push(...fileViolations);
        processedFiles++;

        if (processedFiles % 10 === 0) {
          logger.debug(`Processed ${processedFiles}/${files.length} files`);
        }
      } catch (error) {
        logger.error(`Failed to analyze layering for ${filePath}:`, error);
      }
    }

    logger.info(`🏗️ Layering analysis complete: ${violations.length} violations found`);
    return violations;
  }

  /**
   * Analyze a single file for layering violations
   */
  private async analyzeFileLayering(projectPath: string, filePath: string): Promise<LayeringViolation[]> {
    const violations: LayeringViolation[] = [];

    // Determine which layer this file belongs to
    const sourceLayer = this.getFileLayerInternal(filePath);
    if (!sourceLayer) {
      logger.debug(`File ${filePath} does not belong to any configured layer`);
      return violations;
    }

    // Extract import statements from the file
    const imports = await this.extractImportStatements(projectPath, filePath);

    // Check each import against layering rules
    for (const importStmt of imports) {
      const targetLayer = this.getImportLayer(importStmt.module, projectPath, filePath);

      if (!targetLayer) {
        continue; // External dependency or not in any layer
      }

      // Check if this import violates any rules
      const violation = this.checkLayeringRules(sourceLayer, targetLayer, importStmt);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * Determine which layer a file belongs to based on its path (internal method)
   */
  private getFileLayerInternal(filePath: string): string | null {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Extract relative path from full path
    const relativePath = normalizedPath.includes('/')
      ? normalizedPath.substring(normalizedPath.lastIndexOf('src/'))
      : normalizedPath;

    for (const [layerName, layerConfig] of this.layers) {
      for (const pattern of layerConfig.paths) {
        if (this.pathMatchesPattern(relativePath, pattern) || this.pathMatchesPattern(normalizedPath, pattern)) {
          return layerName;
        }
      }
    }

    return null;
  }

  /**
   * Determine which layer an imported module belongs to
   */
  private getImportLayer(importModule: string, _projectPath: string, sourceFilePath: string): string | null {
    // Handle relative imports
    if (importModule.startsWith('./') || importModule.startsWith('../')) {
      return this.resolveRelativeImportLayer(importModule, sourceFilePath);
    }

    // Convert import module to file path pattern
    const possiblePaths = this.moduleToPossiblePaths(importModule);

    for (const path of possiblePaths) {
      const layer = this.getFileLayer(path);
      if (layer) {
        return layer;
      }
    }

    return null;
  }

  /**
   * Resolve relative import to layer
   */
  private resolveRelativeImportLayer(relativeImport: string, sourceFilePath: string): string | null {
    // Remove file extension and get relative path
    const importPath = relativeImport.replace(/\.(js|ts|jsx|tsx)$/, '');

    // Get source directory
    const sourceDir = sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/'));

    // Resolve the relative path
    let resolvedPath = sourceDir;
    const segments = importPath.split('/');

    for (const segment of segments) {
      if (segment === '..') {
        resolvedPath = resolvedPath.substring(0, resolvedPath.lastIndexOf('/'));
      } else if (segment !== '.') {
        resolvedPath += '/' + segment;
      }
    }

    // Convert to relative path from project root
    const relativePath = resolvedPath.includes('src/')
      ? resolvedPath.substring(resolvedPath.lastIndexOf('src/'))
      : resolvedPath;

    return this.getFileLayer(relativePath);
  }

  /**
   * Check if an import violates layering rules
   */
  private checkLayeringRules(
    sourceLayer: string,
    targetLayer: string,
    importStmt: ImportStatement
  ): LayeringViolation | null {
    // Find applicable rule
    const rule = this.rules.find(r =>
      r.fromLayer === sourceLayer && r.toLayer === targetLayer
    );

    if (!rule) {
      return null; // No rule means this is allowed
    }

    if (rule.type === 'forbidden') {
      return {
        ruleId: 'LAYERING_VIOLATION',
        message: `Layering violation: ${sourceLayer} layer should not import from ${targetLayer} layer`,
        severity: this.calculateViolationSeverity(sourceLayer, targetLayer),
        filePath: importStmt.source,
        line: importStmt.line,
        column: importStmt.column,
        category: 'layering',
        architecturalImpact: this.calculateArchitecturalImpact(sourceLayer, targetLayer),
        refactorEffort: this.calculateRefactorEffort(sourceLayer, targetLayer),
        fromLayer: sourceLayer,
        toLayer: targetLayer,
        importModule: importStmt.module,
        importType: importStmt.type,
        ruleType: 'forbidden_import'
      };
    }

    return null;
  }

  /**
   * Extract import statements from a file
   */
  private async extractImportStatements(_projectPath: string, filePath: string): Promise<ImportStatement[]> {
    try {
      const imports = await this.symbolExtractor.extractImports(filePath);
      return imports;
    } catch (error) {
      logger.error(`Failed to extract imports from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Check if a file path matches a glob pattern
   */
  private pathMatchesPattern(filePath: string, pattern: string): boolean {
    // Simple glob matching - could be enhanced with minimatch or similar
    let regexPattern = pattern;

    // Handle ** first (must be before *)
    regexPattern = regexPattern.replace(/\*\*/g, '🔥DOUBLESTAR🔥');

    // Handle single * (doesn't match directory separators)
    regexPattern = regexPattern.replace(/\*/g, '[^/]*');

    // Handle ** (matches anything including slashes)
    regexPattern = regexPattern.replace(/🔥DOUBLESTAR🔥/g, '.*');

    // Handle ? (matches any single character except slash)
    regexPattern = regexPattern.replace(/\?/g, '[^/]');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * Convert module name to possible file paths
   */
  private moduleToPossiblePaths(module: string): string[] {
    const paths: string[] = [];

    // Handle different module patterns
    if (module.startsWith('@')) {
      // Scoped package: @scope/module -> src/scope/module
      const parts = module.split('/');
      if (parts.length >= 2) {
        paths.push(`src/${parts[0]}/${parts[1]}`);
        paths.push(`src/${parts[1]}`);
      }
    } else {
      // Regular package: module -> src/module
      paths.push(`src/${module}`);
    }

    // Add index variations
    for (const path of [...paths]) {
      paths.push(`${path}/index`);
    }

    return paths;
  }

  /**
   * Calculate violation severity based on layer distance
   */
  private calculateViolationSeverity(sourceLayer: string, targetLayer: string): 'critical' | 'high' | 'medium' | 'low' {
    // Higher severity for "upward" violations (e.g., infrastructure importing from presentation)
    const layerOrder = ['presentation', 'business', 'infrastructure'];
    const sourceIndex = layerOrder.indexOf(sourceLayer);
    const targetIndex = layerOrder.indexOf(targetLayer);

    if (sourceIndex === -1 || targetIndex === -1) {
      return 'medium';
    }

    const distance = Math.abs(sourceIndex - targetIndex);

    if (distance === 2) {
      return 'critical'; // Skip-level violation
    } else if (distance === 1 && targetIndex < sourceIndex) {
      return 'high'; // Upward dependency
    } else {
      return 'medium';
    }
  }

  /**
   * Calculate architectural impact
   */
  private calculateArchitecturalImpact(sourceLayer: string, targetLayer: string): 'high' | 'medium' | 'low' {
    const criticalViolations = [
      ['infrastructure', 'presentation'],
      ['infrastructure', 'business']
    ];

    const isCritical = criticalViolations.some(([from, to]) =>
      sourceLayer === from && targetLayer === to
    );

    return isCritical ? 'high' : 'medium';
  }

  /**
   * Calculate refactor effort
   */
  private calculateRefactorEffort(sourceLayer: string, targetLayer: string): 'low' | 'medium' | 'high' {
    // Higher effort for deeper layers
    const effortMap: Record<string, Record<string, 'low' | 'medium' | 'high'>> = {
      'presentation': {
        'infrastructure': 'medium',
        'business': 'low'
      },
      'business': {
        'infrastructure': 'low',
        'presentation': 'high'
      },
      'infrastructure': {
        'business': 'high',
        'presentation': 'high'
      }
    };

    return effortMap[sourceLayer]?.[targetLayer] || 'medium';
  }

  /**
   * Generate layering configuration file
   */
  async generateConfigurationTemplate(outputPath: string): Promise<void> {
    const template = {
      layers: [
        {
          name: 'presentation',
          paths: ['src/components/**', 'src/controllers/**', 'src/views/**'],
          allowedImports: ['business', 'infrastructure'],
          forbiddenImports: ['presentation'],
          allowedToImportFrom: ['business', 'infrastructure'],
          description: 'UI components and controllers'
        },
        {
          name: 'business',
          paths: ['src/services/**', 'src/domain/**', 'src/core/**'],
          allowedImports: ['business', 'infrastructure'],
          forbiddenImports: ['presentation'],
          allowedToImportFrom: ['business', 'infrastructure'],
          description: 'Business logic and domain models'
        },
        {
          name: 'infrastructure',
          paths: ['src/repositories/**', 'src/database/**', 'src/api/**'],
          allowedImports: ['infrastructure'],
          forbiddenImports: ['presentation', 'business'],
          allowedToImportFrom: ['infrastructure'],
          description: 'Data access and external services'
        }
      ],
      rules: [
        {
          fromLayer: 'presentation',
          toLayer: 'presentation',
          type: 'forbidden' as const,
          description: 'Presentation layer should not import from itself'
        },
        {
          fromLayer: 'business',
          toLayer: 'presentation',
          type: 'forbidden' as const,
          description: 'Business layer should not depend on presentation'
        },
        {
          fromLayer: 'infrastructure',
          toLayer: 'business',
          type: 'forbidden' as const,
          description: 'Infrastructure should not depend on business logic'
        },
        {
          fromLayer: 'infrastructure',
          toLayer: 'presentation',
          type: 'forbidden' as const,
          description: 'Infrastructure should not depend on presentation'
        }
      ]
    };

    const yamlContent = this.toYamlString(template);
    const outputDir = dirname(outputPath);

    if (!existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    await fs.promises.writeFile(outputPath, yamlContent, 'utf8');
    logger.info(`📄 Layering configuration template generated: ${outputPath}`);
  }

  /**
   * Convert object to YAML string
   */
  private toYamlString(obj: any): string {
    return yamlDump(obj, { indent: 2 });
  }

  /**
   * Get current configuration summary
   */
  getConfigurationSummary(): { layers: string[]; rules: number } {
    return {
      layers: Array.from(this.layers.keys()),
      rules: this.rules.length
    };
  }

  /**
   * Get file layer (public method for external use)
   */
  getFileLayer(filePath: string): string | null {
    return this.getFileLayerInternal(filePath);
  }
}