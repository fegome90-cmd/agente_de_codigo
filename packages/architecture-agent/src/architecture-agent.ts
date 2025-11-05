/**
 * Architecture Agent - Main implementation
 * Analyzes code architecture, detects layering violations, DRY issues, and provides refactor recommendations
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { glob } from "glob";
import { parse as parseYaml } from "yaml";
import type {
  ArchitectureTaskData,
  ArchitectureFinding,
  ArchitectureReport,
  ArchitectureConfig,
  LayerConfig,
  Symbol,
} from "./types.js";
import { SocketClient } from "./socket-client.js";
import { ASTParser } from "./ast-parser.js";
import { SymbolExtractor, DependencyGraph } from "./symbol-extractor.js";
import { LayeringAnalyzer } from "./layering-analyzer.js";
import { logger } from "./utils/logger.js";

/**
 * Default configuration for Architecture Agent
 */
const DEFAULT_CONFIG: ArchitectureConfig = {
  timeoutSeconds: 60,
  maxFileSize: 1024 * 1024, // 1MB
  languages: ["python", "typescript", "javascript"],
  layeringDetection: {
    enabled: true,
    customRules: [],
  },
  dryDetection: {
    enabled: true,
    similarityThreshold: 0.8,
    minLinesToConsider: 5,
    ignorePatterns: ["test/", "spec/", "mock/"],
  },
  coverageAnalysis: {
    enabled: true,
    coverageFiles: ["**/coverage/**", "**/*.lcov"],
    minCoverageThreshold: 80,
    prioritizeByComplexity: true,
  },
  complexityAnalysis: {
    enabled: true,
    threshold: 10,
    includeCognitiveComplexity: false,
  },
  llmIntegration: {
    enabled: false, // Will enable in future phases
    maxSuggestions: 5,
    temperature: 0.1,
  },
};

/**
 * Architecture Agent main class
 */
export class ArchitectureAgent {
  private socketClient: SocketClient;
  private config: ArchitectureConfig;
  private astParser: ASTParser;
  private symbolExtractor: SymbolExtractor;
  private layeringAnalyzer: LayeringAnalyzer;
  private layerConfigs: LayerConfig[] = [];

  constructor(socketPath: string = "/tmp/pit-crew.sock") {
    this.socketClient = new SocketClient(socketPath);
    this.config = { ...DEFAULT_CONFIG };
    this.astParser = new ASTParser();
    this.symbolExtractor = new SymbolExtractor();
    this.layeringAnalyzer = new LayeringAnalyzer(this.symbolExtractor);

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for socket client
   */
  private setupEventHandlers(): void {
    this.socketClient.on("connected", () => {
      logger.info("✅ Connected to orchestrator");
    });

    this.socketClient.on("disconnected", () => {
      logger.info("🔌 Disconnected from orchestrator");
    });

    this.socketClient.on(
      "task",
      async (taskId: string, taskData: ArchitectureTaskData) => {
        await this.handleTask(taskId, taskData);
      },
    );

    this.socketClient.on("standalone-mode", async () => {
      logger.info("🔧 Running in standalone mode");
    });

    this.socketClient.on(
      "standalone-task",
      async (taskData: ArchitectureTaskData) => {
        await this.handleTask("standalone", taskData);
      },
    );

    this.socketClient.on("error", (error: Error) => {
      logger.error("Socket client error:", error);
    });
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return {
      name: "Architecture Agent",
      version: "1.0.0",
      description:
        "Analyzes code architecture, detects layering violations, DRY issues, and provides refactor recommendations",
      supportsHeartbeat: true,
      supportsTasks: true,
      supportsEvents: true,
      languages: this.config.languages,
      features: [
        "layering-violation-detection",
        "dry-violation-analysis",
        "testing-coverage-analysis",
        "complexity-analysis",
        "dependency-graph-analysis",
        "refactor-recommendations",
        "ast-parsing",
        "symbol-extraction",
      ],
      tools: [
        "tree-sitter",
        "ast-analysis",
        "similarity-detection",
        "coverage-parser",
        "layer-rules-engine",
      ],
    };
  }

  /**
   * Update configuration with task-specific settings
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // ts-expect-error: Intentionally unused in current implementation
  private updateConfig(_taskConfig: Partial<ArchitectureConfig>): void {
    this.config = { ...this.config, ..._taskConfig };
    logger.info("⚙️ Configuration updated", {
      timeoutSeconds: this.config.timeoutSeconds,
      languages: this.config.languages,
      layeringDetection: this.config.layeringDetection.enabled,
      dryDetection: this.config.dryDetection.enabled,
    });
  }

  /**
   * Handle architecture analysis task
   */
  async handleTask(
    taskId: string,
    taskData: ArchitectureTaskData,
  ): Promise<void> {
    const startTime = Date.now();
    logger.info(`🎯 Starting architecture analysis task: ${taskId}`);

    try {
      // Get project root from task context
      const projectRoot = taskData.context.repoRoot;

      // Validate project root is provided
      if (!projectRoot) {
        throw new Error('Project root (repoRoot) is required in task context');
      }

      // Update configuration from task data
      if (taskData.context.layersConfig) {
        await this.loadLayerConfiguration(taskData.context.layersConfig);
      }

      // Filter architecture-relevant files with security validation
      const relevantFiles = await this.filterArchitectureFiles(taskData.scope, projectRoot);
      logger.info(
        `📁 Found ${relevantFiles.length} architecture-relevant files`,
      );

      if (relevantFiles.length === 0) {
        await this.sendTaskResponse(
          taskId,
          "done",
          {
            message: "No architecture-relevant files found for analysis",
            files_analyzed: 0,
            findings_count: 0,
            tools_used: [],
          },
          Date.now() - startTime,
        );
        return;
      }

      // Perform analysis
      const analysisResult = await this.analyzeArchitecture(
        relevantFiles,
        taskData.context,
      );

      // Generate report
      const report = this.generateReport(
        taskId,
        taskData,
        analysisResult,
        Date.now() - startTime,
      );

      // Save report
      await this.saveReport(report, taskData.output);

      // Send response
      await this.sendTaskResponse(
        taskId,
        "done",
        {
          findings_count: report.findings.length,
          files_analyzed: relevantFiles.length,
          tools_used: ["tree-sitter", "ast-analysis", "dependency-graph"],
          analysis_summary: this.generateAnalysisSummary(report),
          severity_breakdown: report.summary.severityBreakdown,
          category_breakdown: report.summary.categoryBreakdown,
        },
        Date.now() - startTime,
      );

      logger.info(
        `✅ Architecture analysis completed: ${report.findings.length} findings`,
      );
    } catch (error) {
      logger.error(`❌ Architecture analysis failed:`, error);
      await this.sendTaskResponse(
        taskId,
        "failed",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          error_type:
            error instanceof Error ? error.constructor.name : "Unknown",
        },
        Date.now() - startTime,
      );
    }
  }

  /**
   * Validate glob pattern for security
   */
  private validateGlobPattern(pattern: string): void {
    // Maximum pattern length to prevent DoS
    if (pattern.length > 500) {
      throw new Error(`Glob pattern too long: ${pattern.length} characters (max: 500)`);
    }

    // Reject dangerous patterns
    const dangerousPatterns = [
      /\.\./,  // Directory traversal
      /^[\/\\]/, // Absolute paths on Unix/Windows
      /[\*\|\?]?\*[\*\|\?]/, // Nested wildcards (excessive complexity)
      /\{[^}]*\{/, // Nested brace expansion
    ];

    for (const danger of dangerousPatterns) {
      if (danger.test(pattern)) {
        throw new Error(`Dangerous glob pattern detected: ${pattern}`);
      }
    }

    // Whitelist allowed characters
    const allowedPattern = /^[\w\-\.\/\*\?\[\]\(\)\{\}\+\#\!\@\$]+$/;
    if (!allowedPattern.test(pattern)) {
      throw new Error(`Invalid characters in glob pattern: ${pattern}`);
    }

    // Check for balanced brackets
    const openBrackets = (pattern.match(/[\[\{]/g) || []).length;
    const closeBrackets = (pattern.match(/[\]\}]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      throw new Error(`Unbalanced brackets in glob pattern: ${pattern}`);
    }
  }

  /**
   * Secure glob pattern execution with validation
   */
  private async globSecure(
    pattern: string,
    projectRoot: string,
    cwd?: string
  ): Promise<string[]> {
    // Validate pattern
    this.validateGlobPattern(pattern);

    // Add security ignores
    const secureIgnore = [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/temp/**",
      "**/tmp/**",
      "**/coverage/**",
      "**/.nyc_output/**",
      "**/*.map",
      "**/.DS_Store",
    ];

    // Use project root as cwd to prevent escaping
    const globOptions = {
      cwd: cwd || projectRoot,
      ignore: secureIgnore,
      absolute: true,
      dot: false,
      onlyFiles: true,
    };

    let files: string[];

    try {
      files = await glob(pattern, globOptions);
    } catch (error) {
      logger.warn(`Glob pattern failed: ${pattern}`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Glob execution failed: ${errorMessage}`);
    }

    // Filter results to ensure all files are within project root
    return files.filter(file => {
      const relPath = relative(projectRoot, file);
      return !relPath.startsWith('..') && !isAbsolute(relPath);
    });
  }

  /**
   * Filter files that are relevant for architecture analysis
   */
  private async filterArchitectureFiles(scope: string[], projectRoot: string): Promise<string[]> {
    const relevantFiles: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _supportedPatterns = this.astParser.getAllSupportedPatterns();

    for (const pattern of scope) {
      try {
        // SECURITY: Validate pattern before execution
        this.validateGlobPattern(pattern);

        // SECURITY: Execute with security checks
        const files = await this.globSecure(pattern, projectRoot);

        for (const file of files) {
          if (this.astParser.isFileSupported(file)) {
            relevantFiles.push(file);
          }
        }
      } catch (error) {
        logger.warn(`Failed to process glob pattern ${pattern}`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        // Continue processing other patterns instead of failing
      }
    }

    return [...new Set(relevantFiles)]; // Remove duplicates
  }

  /**
   * Analyze architecture for given files
   */
  private async analyzeArchitecture(
    files: string[],
    _context: any,
  ): Promise<any> {
    const analysis: any = {
      filesAnalyzed: files.length,
      languages: new Set<string>(),
      symbols: [] as Symbol[],
      dependencies: new Map<string, DependencyGraph>(),
      layeringViolations: [],
      dryViolations: [],
      complexityMetrics: {
        average: 0,
        max: 0,
        hotspots: [],
      },
      couplingMetrics: {
        average: 0,
        max: 0,
        tightlyCoupled: [],
      },
    };

    // Filter files by size limits
    const filteredFiles = this.filterFilesBySize(files);
    const skippedCount = files.length - filteredFiles.length;

    if (skippedCount > 0) {
      logger.info(`📏 Skipped ${skippedCount} files exceeding size limit (10MB)`);
    }

    logger.info(`🔍 Analyzing ${filteredFiles.length} files for architecture issues`);

    // Process files concurrently with a concurrency limit
    const concurrencyLimit = 5;
    const results: Array<{ filePath: string; symbols: Symbol[] }> = [];

    // Process files in batches to limit concurrency
    for (let i = 0; i < filteredFiles.length; i += concurrencyLimit) {
      const batch = filteredFiles.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (filePath) => {
        try {
          const parseResult = await this.astParser.parseFile(filePath);
          if (!parseResult) return null;

          const { ast, language } = parseResult;
          analysis.languages.add(language);

          // Extract symbols
          const symbols = this.symbolExtractor.extractSymbols(ast, filePath);

          // Update file path for symbols
          symbols.forEach((symbol) => {
            symbol.file = filePath;
          });

          // Get dependency graph for this file
          const depGraph = this.symbolExtractor.getDependencyGraph();
          analysis.dependencies.set(filePath, depGraph);

          // Analyze complexity
          if (this.config.complexityAnalysis.enabled) {
            await this.analyzeComplexity(symbols, analysis.complexityMetrics);
          }

          return { filePath, symbols };
        } catch (error) {
          logger.warn(`Failed to analyze file ${filePath}:`, error);
          return null;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Collect successful results
      for (const result of batchResults) {
        if (result) {
          results.push(result);
        }
      }

      logger.debug(`Processed batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(filteredFiles.length / concurrencyLimit)}`);
    }

    // Merge all symbols
    for (const result of results) {
      analysis.symbols.push(...result.symbols);
    }

    // Convert Set to Array for languages
    analysis.languages = Array.from(analysis.languages);

    // Analyze layering violations using LayeringAnalyzer
    if (this.config.layeringDetection.enabled) {
      // Get list of files to analyze
      const fileList = Array.from(analysis.dependencies.keys()) as string[];
      if (fileList.length > 0) {
        try {
          analysis.layeringViolations = await this.layeringAnalyzer.analyzeLayering(
            _context.repoRoot || '/project',
            fileList,
          );
          logger.debug(`Found ${analysis.layeringViolations.length} layering violations`);
        } catch (error) {
          logger.warn('Layering analysis failed:', error);
          analysis.layeringViolations = [];
        }
      }
    }

    // Analyze DRY violations using DRYAnalyzer
    if (this.config.dryDetection.enabled) {
      try {
        // Extract functions and check for duplicates
        const functionSymbols = analysis.symbols.filter((s: Symbol) => s.type === 'function');
        analysis.dryViolations = await this.analyzeDRYViolations(
          functionSymbols,
        );
        logger.debug(`Found ${analysis.dryViolations.length} DRY violations`);
      } catch (error) {
        logger.warn('DRY analysis failed:', error);
        analysis.dryViolations = [];
      }
    }

    // Calculate aggregate metrics
    this.calculateAggregateMetrics(analysis);

    return analysis;
  }

  /**
   * Load layer configuration from file
   */
  private async loadLayerConfiguration(configPath: string): Promise<void> {
    try {
      const configContent = await readFile(configPath, "utf-8");
      const config = parseYaml(configContent);

      if (config.layers && Array.isArray(config.layers)) {
        this.layerConfigs = config.layers;
        logger.info(
          `✅ Loaded ${this.layerConfigs.length} layer configurations from ${configPath}`,
        );
      }
    } catch (error) {
      logger.warn(
        `Failed to load layer configuration from ${configPath}:`,
        error,
      );
    }
  }

  /**
   * Analyze layering violations
   */
  private async analyzeLayeringViolations(symbols: Symbol[]): Promise<any[]> {
    const violations: any[] = [];

    // This is a simplified implementation
    // In a full implementation, we'd check import statements against layer rules
    for (const symbol of symbols) {
      if (symbol.type === "import") {
        // Check if import violates layering rules
        for (const layer of this.layerConfigs) {
          if (this.isLayeringViolation(symbol, layer)) {
            violations.push({
              ruleId: "LAYERING_VIOLATION",
              message: `Import from ${symbol.name} violates layering rules`,
              severity: "medium",
              filePath: symbol.file,
              line: symbol.line,
              category: "layering",
              fromLayer: this.detectLayer(symbol.file),
              toLayer: this.detectLayer(symbol.name),
              importModule: symbol.name,
              importType: "direct",
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Analyze DRY violations
   */
  private async analyzeDRYViolations(symbols: Symbol[]): Promise<any[]> {
    const violations: any[] = [];

    // Group symbols by name and analyze for duplicates
    const symbolGroups = new Map<string, Symbol[]>();

    for (const symbol of symbols) {
      if (!symbolGroups.has(symbol.name)) {
        symbolGroups.set(symbol.name, []);
      }
      symbolGroups.get(symbol.name)!.push(symbol);
    }

    // Check for potential duplicates
    for (const [name, symbolList] of symbolGroups) {
      if (symbolList.length > 1) {
        // Simple duplicate detection based on name
        // In a full implementation, we'd analyze code similarity
        violations.push({
          ruleId: "DRY_VIOLATION",
          message: `Duplicate symbol '${name}' found in ${symbolList.length} locations`,
          severity: "low",
          category: "dry",
          locations: symbolList.map((s) => ({ file: s.file, line: s.line })),
          similarity: 1.0,
          refactorSuggestion: `Consider extracting common functionality from duplicate '${name}' implementations`,
        });
      }
    }

    return violations;
  }

  /**
   * Analyze complexity metrics
   */
  private async analyzeComplexity(
    symbols: Symbol[],
    metrics: any,
  ): Promise<void> {
    for (const symbol of symbols) {
      if (
        symbol.complexity &&
        symbol.complexity > this.config.complexityAnalysis.threshold
      ) {
        metrics.hotspots.push({
          name: symbol.name,
          file: symbol.file,
          line: symbol.line,
          complexity: symbol.complexity,
        });

        if (symbol.complexity > metrics.max) {
          metrics.max = symbol.complexity;
        }
      }
    }

    // Calculate average complexity
    const complexities = symbols
      .filter((s) => s.complexity)
      .map((s) => s.complexity!);

    if (complexities.length > 0) {
      metrics.average =
        complexities.reduce((sum, c) => sum + c, 0) / complexities.length;
    }
  }

  /**
   * Calculate aggregate metrics
   */
  private calculateAggregateMetrics(analysis: any): void {
    // This would calculate more sophisticated metrics in a full implementation
    logger.debug("Calculating aggregate metrics", {
      filesAnalyzed: analysis.filesAnalyzed,
      symbolsFound: analysis.symbols.length,
      languages: analysis.languages.length,
    });
  }

  /**
   * Check if import violates layering rules
   */
  private isLayeringViolation(_symbol: Symbol, _layer: LayerConfig): boolean {
    // Simplified layering violation check
    // In a full implementation, we'd check file paths and import patterns
    return false;
  }

  /**
   * Detect layer for file path
   */
  private detectLayer(filePath: string): string {
    // Simplified layer detection
    // In a full implementation, we'd match against layer path patterns
    if (filePath.includes("/controller/")) return "controller";
    if (filePath.includes("/service/")) return "service";
    if (filePath.includes("/repository/")) return "repository";
    return "unknown";
  }

  /**
   * Generate architecture report
   */
  private generateReport(
    taskId: string,
    _taskData: ArchitectureTaskData,
    analysis: any,
    duration: number,
  ): ArchitectureReport {
    const allFindings: ArchitectureFinding[] = [
      ...analysis.layeringViolations,
      ...analysis.dryViolations,
    ];

    // Add complexity findings
    for (const hotspot of analysis.complexityMetrics.hotspots) {
      allFindings.push({
        ruleId: "HIGH_COMPLEXITY",
        message: `Function '${hotspot.name}' has high complexity (${hotspot.complexity})`,
        severity: hotspot.complexity > 20 ? "high" : "medium",
        filePath: hotspot.file,
        line: hotspot.line,
        column: 0,
        category: "complexity",
        architecturalImpact: "medium",
        refactorEffort: "medium",
      });
    }

    return {
      version: "1.0.0",
      runId: taskId,
      timestamp: new Date().toISOString(),
      agent: "architecture",
      analysis: {
        filesAnalyzed: analysis.filesAnalyzed,
        languages: analysis.languages,
        symbolsFound: analysis.symbols.length,
        importsFound: analysis.symbols.filter(
          (s: Symbol) => s.type === "import",
        ).length,
        layeringViolations: analysis.layeringViolations,
        dryViolations: analysis.dryViolations,
        coverageGaps: [], // Will implement in future phases
        metrics: {
          complexity: analysis.complexityMetrics,
          coupling: analysis.couplingMetrics,
          cohesion: { average: 0, low: [] },
        },
      },
      summary: {
        totalFindings: allFindings.length,
        severityBreakdown: this.getSeverityBreakdown(allFindings),
        categoryBreakdown: this.getCategoryBreakdown(allFindings),
        architecturalImpact: this.getArchitecturalImpactBreakdown(allFindings),
      },
      findings: allFindings,
      recommendations: [], // Will implement in future phases
      metrics: {
        analysisDuration: duration,
        filesProcessed: analysis.filesAnalyzed,
        linesOfCode: 0, // Would calculate in full implementation
        complexityMetrics: analysis.complexityMetrics,
      },
    };
  }

  /**
   * Get severity breakdown
   */
  private getSeverityBreakdown(
    findings: ArchitectureFinding[],
  ): Record<string, number> {
    const breakdown: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const finding of findings) {
      const severity = finding.severity as string;
      breakdown[severity] = (breakdown[severity] || 0) + 1;
    }

    return breakdown;
  }

  /**
   * Get category breakdown
   */
  private getCategoryBreakdown(
    findings: ArchitectureFinding[],
  ): Record<string, number> {
    const breakdown: Record<string, number> = {};

    for (const finding of findings) {
      breakdown[finding.category] = (breakdown[finding.category] || 0) + 1;
    }

    return breakdown;
  }

  /**
   * Get architectural impact breakdown
   */
  private getArchitecturalImpactBreakdown(
    findings: ArchitectureFinding[],
  ): Record<string, number> {
    const breakdown: Record<string, number> = { high: 0, medium: 0, low: 0 };

    for (const finding of findings) {
      const impact = finding.architecturalImpact as string;
      breakdown[impact] = (breakdown[impact] || 0) + 1;
    }

    return breakdown;
  }

  /**
   * Generate analysis summary
   */
  private generateAnalysisSummary(report: ArchitectureReport): string {
    const { analysis, summary } = report;

    const severity = summary.severityBreakdown as Record<string, number>;
    const categories = summary.categoryBreakdown;

    const languagesStr = analysis.languages?.join(", ") || "none";

    return (
      `Architecture analysis completed for ${analysis.filesAnalyzed} files (${languagesStr}). ` +
      `Found ${summary.totalFindings} issues: ${severity['critical'] || 0} critical, ` +
      `${severity['high'] || 0} high, ${severity['medium'] || 0} medium, ` +
      `${severity['low'] || 0} low. ` +
      `Main categories: ${Object.keys(categories).join(", ")}. ` +
      `Analysis completed in ${report.metrics.analysisDuration}ms.`
    );
  }

  /**
   * Save report to file system
   */
  private async saveReport(
    report: ArchitectureReport,
    outputPath: string,
  ): Promise<void> {
    try {
      const outputDir = dirname(outputPath);
      await this.ensureDirectoryExists(outputDir);

      await writeFile(outputPath, JSON.stringify(report, null, 2));
      logger.info(`📄 Architecture report saved: ${outputPath}`);
    } catch (error) {
      logger.error("Failed to save architecture report:", error);
      throw error;
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await writeFile(dirPath + "/.gitkeep", "");
    } catch {
      // Directory creation handled by writeFile
    }
  }

  /**
   * Send task response
   */
  private async sendTaskResponse(
    taskId: string,
    status: "running" | "done" | "failed",
    data: any,
    duration?: number,
  ): Promise<void> {
    await this.socketClient.sendTaskResponse(taskId, status, data, duration);
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    logger.info("🚀 Starting Architecture Agent");
    await this.socketClient.connect();
  }

  /**
   * Stop the agent
   */
  stop(): void {
    logger.info("🛑 Stopping Architecture Agent");
    this.cleanupResources();
    this.socketClient.disconnect();
  }

  /**
   * Cleanup all resources
   */
  private cleanupResources(): void {
    logger.debug("🧹 Cleaning up Architecture Agent resources...");

    try {
      // Dispose AST parser
      this.astParser.dispose();

      // Dispose symbol extractor
      this.symbolExtractor.dispose();

      logger.debug("✅ All resources cleaned up successfully");
    } catch (error) {
      logger.error("❌ Error during resource cleanup:", error);
    }
  }

  /**
   * Check file size and enforce limits
   */
  private checkFileSize(filePath: string): boolean {
    try {
      const stats = require("node:fs").statSync(filePath);
      const fileSizeInBytes = stats.size;
      const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

      if (fileSizeInMB > 10) { // 10MB limit
        logger.warn(
          `Skipping large file: ${filePath} (${fileSizeInMB.toFixed(2)} MB)`,
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.warn(`Failed to check file size for ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Process files with size limits
   */
  private filterFilesBySize(files: string[]): string[] {
    return files.filter((file) => this.checkFileSize(file));
  }
}
