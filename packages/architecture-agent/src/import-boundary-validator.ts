/**
 * Import Boundary Validation System
 * Comprehensive validation of import statements across architectural boundaries
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, normalize, isAbsolute, relative } from "node:path";
import * as fs from "node:fs";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import { logger } from "./utils/logger.js";
import type {
  ImportStatement,
  Finding,
  ArchitectureTaskData,
} from "./types.js";
import { LayeringAnalyzer } from "./layering-analyzer.js";
import { SymbolExtractor } from "./symbol-extractor.js";

/**
 * Import boundary violation types
 */
export interface ImportBoundaryViolation extends Finding {
  ruleId: "IMPORT_BOUNDARY_VIOLATION";
  violationType:
    | "forbidden_module"
    | "circular_dependency"
    | "external_dependency"
    | "missing_dependency"
    | "version_conflict";
  importModule: string;
  resolvedPath?: string | null;
  allowedModules: string[];
  boundaryType: "layer" | "module" | "package" | "external";
  context: {
    sourceLayer?: string;
    targetLayer?: string;
    dependencyChain?: string[];
  };
}

/**
 * Import boundary rule definition
 */
export interface ImportBoundaryRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  boundaryType: "layer" | "module" | "package" | "external";
  sourcePattern: string;
  targetRestriction: {
    allowed: string[];
    forbidden: string[];
    requireExplicit: boolean;
  };
  severity: "critical" | "high" | "medium" | "low";
  exceptions: string[];
  tags: string[];
}

/**
 * Import boundary validation configuration
 */
export interface ImportBoundaryConfig {
  enabled: boolean;
  rules: ImportBoundaryRule[];
  externalDependencies: {
    allowedPackages: string[];
    forbiddenPackages: string[];
    requireVersionPinning: boolean;
    allowedDomains: string[];
  };
  circularDependencyDetection: {
    enabled: boolean;
    maxDepth: number;
    ignorePatterns: string[];
  };
  reporting: {
    includeAllowedImports: boolean;
    groupByFile: boolean;
    includeDependencyGraph: boolean;
  };
}

/**
 * Import Boundary Validator
 */
export class ImportBoundaryValidator {
  private config: ImportBoundaryConfig;
  private layeringAnalyzer: LayeringAnalyzer;
  private symbolExtractor: SymbolExtractor;
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private resolvedModules: Map<string, string | null> = new Map();
  private projectRoot: string;

  constructor(
    layeringAnalyzer: LayeringAnalyzer,
    symbolExtractor: SymbolExtractor,
    projectRoot: string,
    configPath?: string,
  ) {
    this.layeringAnalyzer = layeringAnalyzer;
    this.symbolExtractor = symbolExtractor;
    this.projectRoot = normalize(projectRoot);

    // Validate project root exists
    if (!existsSync(this.projectRoot)) {
      throw new Error(`Project root does not exist: ${this.projectRoot}`);
    }

    this.config = this.getDefaultConfig();

    if (configPath) {
      this.loadConfiguration(configPath);
    }
  }

  /**
   * Secure path validation - ensures path is within project root
   */
  private validatePathWithinProject(path: string, operation: string): string {
    // Normalize the path to remove any traversal attempts
    const normalized = normalize(path);

    // Reject absolute paths (potential security risk)
    if (isAbsolute(normalized)) {
      throw new Error(`${operation}: Absolute paths not allowed: ${path}`);
    }

    // Reject paths containing directory traversal
    if (normalized.includes('..') || normalized.includes('~')) {
      throw new Error(`${operation}: Path traversal not allowed: ${path}`);
    }

    // Resolve the path relative to project root
    const resolved = resolve(this.projectRoot, normalized);

    // Ensure the resolved path is within project root
    const relPath = relative(this.projectRoot, resolved);
    if (relPath.startsWith('..') || isAbsolute(relPath)) {
      throw new Error(`${operation}: Path escapes project root: ${path}`);
    }

    return resolved;
  }

  /**
   * Validate file extension for security
   */
  private validateFileExtension(ext: string): void {
    // Whitelist allowed extensions
    const allowedExtensions = ['.ts', '.js', '.tsx', '.jsx', '.d.ts', '/index.ts', '/index.js'];

    if (!allowedExtensions.includes(ext)) {
      throw new Error(`Invalid file extension: ${ext}`);
    }
  }

  /**
   * Load boundary validation configuration
   */
  async loadConfiguration(configPath: string): Promise<void> {
    if (!existsSync(configPath)) {
      logger.warn(
        `⚠️ Import boundary config not found: ${configPath}, using defaults`,
      );
      return;
    }

    try {
      const configContent = readFileSync(configPath, "utf8");
      const loadedConfig = yamlLoad(
        configContent,
      ) as Partial<ImportBoundaryConfig>;

      this.config = {
        ...this.config,
        ...loadedConfig,
        rules: loadedConfig.rules || this.config.rules,
        externalDependencies: {
          ...this.config.externalDependencies,
          ...loadedConfig.externalDependencies,
        },
        circularDependencyDetection: {
          ...this.config.circularDependencyDetection,
          ...loadedConfig.circularDependencyDetection,
        },
        reporting: {
          ...this.config.reporting,
          ...loadedConfig.reporting,
        },
      };

      logger.info(
        `✅ Import boundary configuration loaded: ${this.config.rules.length} rules`,
      );
    } catch (error) {
      logger.error("Failed to load import boundary configuration:", error);
    }
  }

  /**
   * Validate import boundaries across all files
   */
  async validateBoundaries(
    taskData: ArchitectureTaskData,
  ): Promise<ImportBoundaryViolation[]> {
    logger.info(
      `🔍 Validating import boundaries for ${taskData.scope.length} files`,
    );

    const violations: ImportBoundaryViolation[] = [];
    let processedFiles = 0;

    // Build dependency graph first
    await this.buildDependencyGraph(taskData);

    // Process each file
    for (const filePath of taskData.scope) {
      try {
        const fileViolations = await this.validateFileBoundaries(
          filePath,
          taskData.context.repoRoot,
        );
        violations.push(...fileViolations);
        processedFiles++;

        if (processedFiles % 20 === 0) {
          logger.debug(
            `Validated ${processedFiles}/${taskData.scope.length} files`,
          );
        }
      } catch (error) {
        logger.error(`Failed to validate boundaries for ${filePath}:`, error);
      }
    }

    // Detect circular dependencies
    if (this.config.circularDependencyDetection.enabled) {
      const circularViolations = this.detectCircularDependencies();
      violations.push(...circularViolations);
    }

    logger.info(
      `🔍 Import boundary validation complete: ${violations.length} violations found`,
    );
    return violations;
  }

  /**
   * Validate import boundaries for a single file
   */
  private async validateFileBoundaries(
    filePath: string,
    repoRoot: string,
  ): Promise<ImportBoundaryViolation[]> {
    const violations: ImportBoundaryViolation[] = [];

    try {
      // Extract import statements
      const imports = await this.symbolExtractor.extractImports(filePath);

      // Get source layer
      const sourceLayer = this.getFileLayer(filePath);

      for (const importStmt of imports) {
        // Resolve module path
        const resolvedPath = await this.resolveModulePath(
          importStmt.module,
          filePath,
          repoRoot,
        );

        // Validate against boundary rules
        const ruleViolations = await this.validateImportAgainstRules(
          importStmt,
          filePath,
          sourceLayer,
          resolvedPath,
        );
        violations.push(...ruleViolations);

        // Validate external dependencies
        if (this.isExternalDependency(importStmt.module)) {
          const externalViolations = await this.validateExternalDependency(
            importStmt,
            filePath,
          );
          violations.push(...externalViolations);
        }
      }
    } catch (error) {
      logger.error(`Error validating file ${filePath}:`, error);
    }

    return violations;
  }

  /**
   * Validate import against configured boundary rules
   */
  private async validateImportAgainstRules(
    importStmt: ImportStatement,
    sourceFile: string,
    sourceLayer: string | null,
    resolvedPath: string | null,
  ): Promise<ImportBoundaryViolation[]> {
    const violations: ImportBoundaryViolation[] = [];

    for (const rule of this.config.rules) {
      if (!rule.enabled) continue;

      // Check if source file matches rule pattern
      if (!this.pathMatchesPattern(sourceFile, rule.sourcePattern)) {
        continue;
      }

      // Check target restriction
      const violation = this.checkTargetRestrictions(
        importStmt,
        rule,
        sourceLayer,
        resolvedPath,
      );

      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * Check if import violates target restrictions
   */
  private checkTargetRestrictions(
    importStmt: ImportStatement,
    rule: ImportBoundaryRule,
    sourceLayer: string | null,
    resolvedPath: string | null,
  ): ImportBoundaryViolation | null {
    const importModule = importStmt.module;

    // Check forbidden modules
    for (const forbidden of rule.targetRestriction.forbidden) {
      if (this.moduleMatchesPattern(importModule, forbidden)) {
        // Check if this is an exception
        if (rule.exceptions.includes(importModule)) {
          continue;
        }

        return {
          ruleId: "IMPORT_BOUNDARY_VIOLATION",
          message: `Import boundary violation: ${rule.name}`,
          severity: rule.severity,
          filePath: importStmt.source,
          line: importStmt.line,
          column: importStmt.column,
          category: "layering",
          architecturalImpact: rule.severity === "critical" ? "high" : "medium",
          refactorEffort: "medium",
          violationType: "forbidden_module",
          importModule,
          resolvedPath,
          allowedModules: rule.targetRestriction.allowed,
          boundaryType: rule.boundaryType,
          context: {
            sourceLayer: sourceLayer || undefined,
            targetLayer: this.getModuleLayer(resolvedPath) || undefined,
          },
        };
      }
    }

    // Check if explicit import is required
    if (rule.targetRestriction.requireExplicit) {
      const isAllowed = rule.targetRestriction.allowed.some((allowed) =>
        this.moduleMatchesPattern(importModule, allowed),
      );

      if (
        !isAllowed &&
        !rule.targetRestriction.forbidden.some((forbidden) =>
          this.moduleMatchesPattern(importModule, forbidden),
        )
      ) {
        return {
          ruleId: "IMPORT_BOUNDARY_VIOLATION",
          message: `Import boundary violation: ${rule.name} - explicit import required`,
          severity: rule.severity,
          filePath: importStmt.source,
          line: importStmt.line,
          column: importStmt.column,
          category: "layering",
          architecturalImpact: "medium",
          refactorEffort: "low",
          violationType: "forbidden_module",
          importModule,
          resolvedPath,
          allowedModules: rule.targetRestriction.allowed,
          boundaryType: rule.boundaryType,
          context: {
            sourceLayer: sourceLayer || undefined,
          },
        };
      }
    }

    return null;
  }

  /**
   * Validate external dependency
   */
  private async validateExternalDependency(
    importStmt: ImportStatement,
    sourceFile: string,
  ): Promise<ImportBoundaryViolation[]> {
    const violations: ImportBoundaryViolation[] = [];
    const packageName = this.extractPackageName(importStmt.module);

    // Check forbidden packages
    if (
      this.config.externalDependencies.forbiddenPackages.includes(packageName)
    ) {
      violations.push({
        ruleId: "IMPORT_BOUNDARY_VIOLATION",
        message: `Forbidden external dependency: ${packageName}`,
        severity: "high",
        filePath: importStmt.source,
        line: importStmt.line,
        column: importStmt.column,
        category: "layering",
        architecturalImpact: "medium",
        refactorEffort: "medium",
        violationType: "external_dependency",
        importModule: importStmt.module,
        allowedModules: this.config.externalDependencies.allowedPackages,
        boundaryType: "external",
        context: {},
      });
    }

    // Check if package is in allowed list (if list is not empty)
    if (
      this.config.externalDependencies.allowedPackages.length > 0 &&
      !this.config.externalDependencies.allowedPackages.includes(packageName)
    ) {
      violations.push({
        ruleId: "IMPORT_BOUNDARY_VIOLATION",
        message: `External dependency not in allowlist: ${packageName}`,
        severity: "medium",
        filePath: importStmt.source,
        line: importStmt.line,
        column: importStmt.column,
        category: "layering",
        architecturalImpact: "low",
        refactorEffort: "low",
        violationType: "external_dependency",
        importModule: importStmt.module,
        allowedModules: this.config.externalDependencies.allowedPackages,
        boundaryType: "external",
        context: {},
      });
    }

    return violations;
  }

  /**
   * Build dependency graph for circular dependency detection
   */
  private async buildDependencyGraph(
    taskData: ArchitectureTaskData,
  ): Promise<void> {
    this.dependencyGraph.clear();

    for (const filePath of taskData.scope) {
      try {
        const imports = await this.symbolExtractor.extractImports(filePath);
        const dependencies = new Set<string>();

        for (const importStmt of imports) {
          const resolvedPath = await this.resolveModulePath(
            importStmt.module,
            filePath,
            taskData.context.repoRoot,
          );

          if (resolvedPath && taskData.scope.includes(resolvedPath)) {
            dependencies.add(resolvedPath);
          }
        }

        this.dependencyGraph.set(filePath, dependencies);
      } catch (error) {
        logger.error(`Failed to build dependencies for ${filePath}:`, error);
      }
    }

    logger.debug(`Dependency graph built: ${this.dependencyGraph.size} nodes`);
  }

  /**
   * Detect circular dependencies
   */
  private detectCircularDependencies(): ImportBoundaryViolation[] {
    const violations: ImportBoundaryViolation[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const [file, dependencies] of this.dependencyGraph) {
      if (!visited.has(file)) {
        const cycle = this.detectCycle(file, visited, recursionStack, []);
        if (cycle.length > 0) {
          violations.push({
            ruleId: "IMPORT_BOUNDARY_VIOLATION",
            message: `Circular dependency detected: ${cycle.join(" → ")} → ${cycle[0]}`,
            severity: "high",
            filePath: cycle[0] || "",
            line: 1,
            column: 1,
            category: "layering",
            architecturalImpact: "high",
            refactorEffort: "high",
            violationType: "circular_dependency",
            importModule: cycle[1] || "",
            allowedModules: [],
            boundaryType: "module",
            context: {
              dependencyChain: cycle,
            },
          });
        }
      }
    }

    return violations;
  }

  /**
   * Detect cycle using DFS
   */
  private detectCycle(
    file: string,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[],
  ): string[] {
    visited.add(file);
    recursionStack.add(file);
    path.push(file);

    const dependencies = this.dependencyGraph.get(file) || new Set();

    for (const dependency of dependencies) {
      if (!visited.has(dependency)) {
        const cycle = this.detectCycle(dependency, visited, recursionStack, [
          ...path,
        ]);
        if (cycle.length > 0) {
          return cycle;
        }
      } else if (recursionStack.has(dependency)) {
        // Found a cycle
        const cycleStart = path.indexOf(dependency);
        return path.slice(cycleStart);
      }
    }

    recursionStack.delete(file);
    return [];
  }

  /**
   * Resolve module path to file path
   */
  private async resolveModulePath(
    module: string,
    sourceFile: string,
    repoRoot: string,
  ): Promise<string | null> {
    // Check cache first
    const cacheKey = `${sourceFile}:${module}`;
    if (this.resolvedModules.has(cacheKey)) {
      return this.resolvedModules.get(cacheKey)!;
    }

    let resolvedPath: string | null = null;

    if (module.startsWith("./") || module.startsWith("../")) {
      // Relative import
      resolvedPath = this.resolveRelativeImport(module, sourceFile);
    } else if (!this.isExternalDependency(module)) {
      // Absolute internal import
      resolvedPath = this.resolveAbsoluteImport(module, repoRoot);
    }

    // Cache result
    this.resolvedModules.set(cacheKey, resolvedPath);
    return resolvedPath;
  }

  /**
   * Resolve relative import with security validation
   */
  private resolveRelativeImport(
    module: string,
    sourceFile: string,
  ): string | null {
    const sourceDir = dirname(sourceFile);
    const importPath = module.replace(/\.(js|ts|jsx|tsx)$/, "");

    try {
      // SECURITY: Validate the source file is within project root
      this.validatePathWithinProject(sourceFile, 'Source file access');

      // SECURITY: Validate import path to prevent traversal
      this.validatePathWithinProject(importPath, 'Import path resolution');

      // Resolve the import path
      const resolved = resolve(sourceDir, importPath);

      // Try different extensions with validation
      const extensions = [
        ".ts",
        ".js",
        ".tsx",
        ".jsx",
        "/index.ts",
        "/index.js",
      ];

      for (const ext of extensions) {
        // SECURITY: Validate extension
        this.validateFileExtension(ext);

        const fullPath = resolved + ext;

        // Ensure the full path is still within project root
        const validatedPath = this.validatePathWithinProject(
          fullPath,
          'Import resolution'
        );

        if (existsSync(validatedPath)) {
          return validatedPath;
        }
      }
    } catch (error) {
      logger.debug(
        `Failed to resolve relative import: ${module} from ${sourceFile}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }

    return null;
  }

  /**
   * Resolve absolute import with security validation
   */
  private resolveAbsoluteImport(
    module: string,
    sourceFile: string,
  ): string | null {
    // Remove leading @ for scoped packages
    const cleanModule = module.startsWith("@") ? module.substring(1) : module;

    try {
      // SECURITY: Validate source file is within project
      this.validatePathWithinProject(sourceFile, 'Source file access');

      // SECURITY: Validate module name doesn't contain traversal
      if (module.includes('..') || isAbsolute(module)) {
        logger.warn(`Rejected potentially dangerous import: ${module}`);
        return null;
      }

      // Convert to path pattern with security validation
      const possiblePaths = [
        join(this.projectRoot, 'src', module),
        join(this.projectRoot, 'src', cleanModule),
        join(this.projectRoot, module),
        join(this.projectRoot, cleanModule),
      ];

      // Try different extensions with validation
      const extensions = [".ts", ".js", ".tsx", ".jsx", "/index.ts", "/index.js"];

      for (const basePath of possiblePaths) {
        // SECURITY: Validate base path is within project
        const validatedBasePath = this.validatePathWithinProject(
          basePath,
          'Base path resolution'
        );

        for (const ext of extensions) {
          // SECURITY: Validate extension
          this.validateFileExtension(ext);

          const fullPath = validatedBasePath + ext;

          // Ensure full path is still within project
          const validatedFullPath = this.validatePathWithinProject(
            fullPath,
            'Full path resolution'
          );

          if (existsSync(validatedFullPath)) {
            return validatedFullPath;
          }
        }
      }
    } catch (error) {
      logger.debug(
        `Failed to resolve absolute import: ${module} from ${sourceFile}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }

    return null;
  }

  /**
   * Check if module is external dependency
   */
  private isExternalDependency(module: string): boolean {
    // External dependencies don't start with ./, ../, or /
    return (
      !module.startsWith("./") &&
      !module.startsWith("../") &&
      !module.startsWith("/")
    );
  }

  /**
   * Extract package name from module
   */
  private extractPackageName(module: string): string {
    // Handle scoped packages
    if (module.startsWith("@")) {
      const parts = module.split("/");
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : module;
    }

    // Regular packages
    const parts = module.split("/");
    return parts[0] || module;
  }

  /**
   * Get file layer from layering analyzer
   */
  private getFileLayer(filePath: string): string | null {
    // Use relative path for layer detection
    const relativePath = filePath.includes("src/")
      ? filePath.substring(filePath.lastIndexOf("src/"))
      : filePath;

    return this.layeringAnalyzer.getFileLayer(relativePath);
  }

  /**
   * Get module layer from resolved path
   */
  private getModuleLayer(resolvedPath: string | null): string | null {
    if (!resolvedPath) return null;
    return this.getFileLayer(resolvedPath);
  }

  /**
   * Check if module matches pattern
   */
  private moduleMatchesPattern(module: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*\*/g, "🔥DOUBLESTAR🔥")
      .replace(/\*/g, "[^/]*")
      .replace(/🔥DOUBLESTAR🔥/g, ".*")
      .replace(/\?/g, "[^/]");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(module);
  }

  /**
   * Check if path matches pattern
   */
  private pathMatchesPattern(filePath: string, pattern: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const relativePath = normalizedPath.includes("/")
      ? normalizedPath.substring(normalizedPath.lastIndexOf("src/"))
      : normalizedPath;

    const regexPattern = pattern
      .replace(/\*\*/g, "🔥DOUBLESTAR🔥")
      .replace(/\*/g, "[^/]*")
      .replace(/🔥DOUBLESTAR🔥/g, ".*")
      .replace(/\?/g, "[^/]");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(relativePath) || regex.test(normalizedPath);
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): ImportBoundaryConfig {
    return {
      enabled: true,
      rules: [
        {
          id: "no-presentation-imports",
          name: "Presentation layer cannot import from other layers",
          description:
            "Prevents presentation components from importing business or infrastructure logic",
          enabled: true,
          boundaryType: "layer",
          sourcePattern: "src/components/**",
          targetRestriction: {
            allowed: ["src/**/*"],
            forbidden: [
              "src/services/**",
              "src/infrastructure/**",
              "src/domain/**",
            ],
            requireExplicit: false,
          },
          severity: "high",
          exceptions: [],
          tags: ["architecture", "presentation"],
        },
        {
          id: "no-infrastructure-upward",
          name: "Infrastructure cannot import from upper layers",
          description:
            "Prevents infrastructure from depending on business or presentation logic",
          enabled: true,
          boundaryType: "layer",
          sourcePattern: "src/infrastructure/**",
          targetRestriction: {
            allowed: ["src/infrastructure/**"],
            forbidden: [
              "src/components/**",
              "src/services/**",
              "src/domain/**",
            ],
            requireExplicit: false,
          },
          severity: "critical",
          exceptions: [],
          tags: ["architecture", "infrastructure"],
        },
      ],
      externalDependencies: {
        allowedPackages: [],
        forbiddenPackages: ["lodash", "moment"],
        requireVersionPinning: true,
        allowedDomains: ["npmjs.com", "github.com"],
      },
      circularDependencyDetection: {
        enabled: true,
        maxDepth: 10,
        ignorePatterns: ["**/*.test.*", "**/*.spec.*"],
      },
      reporting: {
        includeAllowedImports: false,
        groupByFile: true,
        includeDependencyGraph: false,
      },
    };
  }

  /**
   * Generate boundary validation configuration template
   */
  async generateConfigurationTemplate(outputPath: string): Promise<void> {
    const template = {
      enabled: true,
      rules: [
        {
          id: "custom-boundary-rule",
          name: "Custom Boundary Rule",
          description: "Describe your custom boundary rule",
          enabled: true,
          boundaryType: "layer",
          sourcePattern: "src/your-pattern/**",
          targetRestriction: {
            allowed: ["src/allowed/**"],
            forbidden: ["src/forbidden/**"],
            requireExplicit: false,
          },
          severity: "medium",
          exceptions: ["allowed-exception"],
          tags: ["custom"],
        },
      ],
      externalDependencies: {
        allowedPackages: ["react", "axios"],
        forbiddenPackages: ["deprecated-package"],
        requireVersionPinning: true,
        allowedDomains: ["npmjs.com"],
      },
      circularDependencyDetection: {
        enabled: true,
        maxDepth: 10,
        ignorePatterns: ["**/*.test.*"],
      },
      reporting: {
        includeAllowedImports: false,
        groupByFile: true,
        includeDependencyGraph: false,
      },
    };

    const yamlContent = yamlDump(template, { indent: 2 });

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    await fs.promises.writeFile(outputPath, yamlContent, "utf8");
    logger.info(
      `📄 Import boundary configuration template generated: ${outputPath}`,
    );
  }
}
