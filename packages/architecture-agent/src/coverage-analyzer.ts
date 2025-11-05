/**
 * Testing Coverage Analysis System
 * Analyzes test coverage, identifies gaps, and provides quality metrics
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import * as crypto from "node:crypto";
import { logger } from "./utils/logger.js";
import { ASTParser } from "./ast-parser.js";
import { SymbolExtractor } from "./symbol-extractor.js";
import type {
  ArchitectureTaskData,
  Finding,
  TestCoverageGap,
  TestQualityMetrics,
  Symbol,
} from "./types.js";

/**
 * Coverage analysis configuration
 */
export interface CoverageAnalysisConfig {
  coverageThreshold: number;
  excludePatterns: string[];
  includePatterns: string[];
  testFilePatterns: string[];
  sourceFilePatterns: string[];
  minAssertionsPerFunction: number;
  requireEdgeCaseCoverage: boolean;
  requireErrorHandling: boolean;
  trackMutationScore: boolean;
}

/**
 * Test coverage result
 */
export interface TestCoverageResult {
  filePath: string;
  totalFunctions: number;
  testedFunctions: number;
  totalClasses: number;
  testedClasses: number;
  coveragePercentage: number;
  uncoveredFunctions: string[];
  uncoveredClasses: string[];
  testQuality: TestQualityMetrics;
  recommendations: string[];
}

/**
 * Coverage gap analysis
 */
export interface CoverageGapAnalysis {
  overallCoverage: number;
  functionCoverage: number;
  classCoverage: number;
  criticalGaps: TestCoverageGap[];
  qualityScore: number;
  recommendations: string[];
  fileResults: TestCoverageResult[];
}

/**
 * Test block information
 */
interface TestBlock {
  type:
    | "test"
    | "describe"
    | "beforeEach"
    | "afterEach"
    | "beforeAll"
    | "afterAll";
  name: string;
  filePath: string;
  line: number;
  assertions: number;
  mocks: string[];
  edgeCases: string[];
}

/**
 * Coverage Analyzer Class
 */
export class CoverageAnalyzer {
  private astParser: ASTParser;
  private symbolExtractor: SymbolExtractor;
  private config: CoverageAnalysisConfig;
  private sourceFiles: Map<string, Symbol[]> = new Map();
  private testFiles: Map<string, TestBlock[]> = new Map();

  constructor(config?: Partial<CoverageAnalysisConfig>) {
    this.config = {
      coverageThreshold: 80,
      excludePatterns: ["node_modules", ".git", "dist", "build", "coverage"],
      includePatterns: ["**/*.{js,ts,jsx,tsx,py}"],
      testFilePatterns: [
        "**/*.test.{js,ts,jsx,tsx}",
        "**/*.spec.{js,ts,jsx,tsx}",
        "**/test/**",
        "**/tests/**",
        "**/test_*.py",
        "**/*_test.py",
      ],
      sourceFilePatterns: ["**/src/**", "**/lib/**", "**/source/**"],
      minAssertionsPerFunction: 3,
      requireEdgeCaseCoverage: true,
      requireErrorHandling: true,
      trackMutationScore: true,
      ...config,
    };

    this.astParser = new ASTParser();
    this.symbolExtractor = new SymbolExtractor();
    logger.info("🔍 Coverage Analyzer initialized", {
      agent: "architecture-agent",
      version: "1.0.0",
    });
  }

  /**
   * Analyze test coverage for the given scope
   */
  async analyzeCoverage(
    taskData: ArchitectureTaskData,
  ): Promise<CoverageGapAnalysis> {
    logger.info(
      `🔍 Analyzing test coverage for ${taskData.scope.length} files`,
      {
        agent: "architecture-agent",
        version: "1.0.0",
      },
    );

    // Clear previous analysis
    this.sourceFiles.clear();
    this.testFiles.clear();

    // Separate source and test files
    const { sourceFiles, testFiles } = this.categorizeFiles(taskData.scope);

    // Extract source code symbols
    await this.extractSourceSymbols(sourceFiles);

    // Extract test information
    await this.extractTestInformation(testFiles);

    // Analyze coverage gaps
    const gaps = this.identifyCoverageGaps();

    // Calculate quality metrics
    const qualityScore = this.calculateQualityScore(gaps);

    // Generate recommendations
    const recommendations = this.generateRecommendations(gaps, qualityScore);

    const analysis: CoverageGapAnalysis = {
      overallCoverage: this.calculateOverallCoverage(gaps),
      functionCoverage: this.calculateFunctionCoverage(gaps),
      classCoverage: this.calculateClassCoverage(gaps),
      criticalGaps: gaps,
      qualityScore,
      recommendations,
      fileResults: this.generateFileResults(gaps),
    };

    logger.info(
      `✅ Coverage analysis complete: ${analysis.overallCoverage}% overall coverage`,
      {
        agent: "architecture-agent",
        version: "1.0.0",
      },
    );

    return analysis;
  }

  /**
   * Categorize files into source and test files
   */
  private categorizeFiles(filePaths: string[]): {
    sourceFiles: string[];
    testFiles: string[];
  } {
    const sourceFiles: string[] = [];
    const testFiles: string[] = [];

    for (const filePath of filePaths) {
      if (this.isTestFile(filePath)) {
        testFiles.push(filePath);
      } else if (this.isSourceFile(filePath)) {
        sourceFiles.push(filePath);
      }
    }

    logger.debug(
      `📂 Categorized ${sourceFiles.length} source files and ${testFiles.length} test files`,
      {
        agent: "architecture-agent",
        version: "1.0.0",
      },
    );

    return { sourceFiles, testFiles };
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(filePath: string): boolean {
    const fileName = filePath.toLowerCase();
    const dirPath = dirname(filePath).toLowerCase();

    return this.config.testFilePatterns.some((pattern) => {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"),
      );
      return regex.test(fileName) || regex.test(dirPath);
    });
  }

  /**
   * Check if file is a source file
   */
  private isSourceFile(filePath: string): boolean {
    const fileName = filePath.toLowerCase();

    return this.config.sourceFilePatterns.some((pattern) => {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"),
      );
      return regex.test(fileName);
    });
  }

  /**
   * Extract symbols from source files
   */
  private async extractSourceSymbols(sourceFiles: string[]): Promise<void> {
    for (const filePath of sourceFiles) {
      try {
        const parsed = await this.astParser.parseFile(filePath);
        if (!parsed) {
          logger.warn(`⚠️ Failed to parse ${filePath}`, {
            agent: "architecture-agent",
            version: "1.0.0",
          });
          continue;
        }
        const ast = parsed.ast;
        const symbols = this.symbolExtractor.extractSymbols(ast, filePath);
        this.sourceFiles.set(filePath, symbols);

        logger.debug(
          `📦 Extracted ${symbols.length} symbols from ${filePath}`,
          {
            agent: "architecture-agent",
            version: "1.0.0",
            symbols: symbols.length,
          },
        );
      } catch (error) {
        logger.warn(`⚠️ Failed to extract symbols from ${filePath}: ${error}`, {
          agent: "architecture-agent",
          version: "1.0.0",
        });
      }
    }

    const totalSymbols = Array.from(this.sourceFiles.values()).reduce(
      (sum, symbols) => sum + symbols.length,
      0,
    );
    logger.info(
      `📦 Extracted ${totalSymbols} symbols from ${this.sourceFiles.size} source files`,
      {
        agent: "architecture-agent",
        version: "1.0.0",
      },
    );
  }

  /**
   * Extract test information from test files
   */
  private async extractTestInformation(testFiles: string[]): Promise<void> {
    for (const filePath of testFiles) {
      try {
        const content = readFileSync(filePath, "utf8");
        const testBlocks = this.extractTestBlocks(content, filePath);
        this.testFiles.set(filePath, testBlocks);

        logger.debug(
          `🧪 Extracted ${testBlocks.length} test blocks from ${filePath}`,
          {
            agent: "architecture-agent",
            version: "1.0.0",
            testBlocks: testBlocks.length,
          },
        );
      } catch (error) {
        logger.warn(`⚠️ Failed to extract tests from ${filePath}: ${error}`, {
          agent: "architecture-agent",
          version: "1.0.0",
        });
      }
    }

    const totalTests = Array.from(this.testFiles.values()).reduce(
      (sum, blocks) => sum + blocks.length,
      0,
    );
    logger.info(
      `🧪 Extracted ${totalTests} test blocks from ${this.testFiles.size} test files`,
      {
        agent: "architecture-agent",
        version: "1.0.0",
      },
    );
  }

  /**
   * Extract test blocks from test file content
   */
  private extractTestBlocks(content: string, filePath: string): TestBlock[] {
    const testBlocks: TestBlock[] = [];
    const lines = content.split("\n");

    // Test patterns for different testing frameworks
    const testPatterns = [
      { type: "test", regex: /\b(test|it)\s*\(\s*['"`]([^'"`]+)['"`]/ },
      {
        type: "describe",
        regex: /\b(describe|context|suite)\s*\(\s*['"`]([^'"`]+)['"`]/,
      },
      { type: "beforeEach", regex: /\b(beforeEach|beforeEach)\s*\(/ },
      { type: "afterEach", regex: /\b(afterEach|teardown)\s*\(/ },
      { type: "beforeAll", regex: /\b(beforeAll|setup)\s*\(/ },
      { type: "afterAll", regex: /\b(afterAll|teardownAll)\s*\(/ },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of testPatterns) {
        const match = line.match(pattern.regex);
        if (match) {
          const testBlock: TestBlock = {
            type: pattern.type as any,
            name: match[2] || match[1] || "",
            filePath,
            line: i + 1,
            assertions: this.countAssertions(lines, i),
            mocks: this.extractMockNames(lines, i),
            edgeCases: this.extractEdgeCases(lines, i),
          };

          testBlocks.push(testBlock);
          break;
        }
      }
    }

    return testBlocks;
  }

  /**
   * Count assertions in a test block
   */
  private countAssertions(lines: string[], startLine: number): number {
    let count = 0;
    let braceDepth = 0;
    let inTestBlock = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      // Count assertion keywords
      const assertionPatterns = [
        /\b(expect|should|assert|chai\.expect|assert\.)\b/,
        /\b(toEqual|toBe|toHaveBeenCalled|toThrow|to\.equal|ok|isTrue|isFalse)\b/,
        /\b(equal|deepEqual|strictEqual|notEqual|isDefined|isUndefined)\b/,
      ];

      for (const pattern of assertionPatterns) {
        if (pattern.test(line)) {
          count++;
        }
      }

      // Track brace depth to find test block boundaries
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      if (braceDepth > 0) {
        inTestBlock = true;
      } else if (inTestBlock && braceDepth === 0) {
        break;
      }
    }

    return count;
  }

  /**
   * Extract mock names from test block
   */
  private extractMockNames(lines: string[], startLine: number): string[] {
    const mocks: string[] = [];
    const mockPatterns = [
      /(?:jest|vi|sinon)\.mock\(['"`]([^'"`]+)['"`]/,
      /mock\(['"`]([^'"`]+)['"`]/,
      /stub\(['"`]([^'"`]+)['"`]/,
      /spyOn\([^,]+,\s*['"`]([^'"`]+)['"`]/,
    ];

    let braceDepth = 0;
    let inTestBlock = false;

    for (let i = startLine; i < Math.min(startLine + 50, lines.length); i++) {
      const line = lines[i];
      if (line === undefined) continue;
      for (const pattern of mockPatterns) {
        const match = line.match(pattern);
        if (match) {
          mocks.push(match[1]);
        }
      }

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      if (braceDepth > 0) {
        inTestBlock = true;
      } else if (inTestBlock && braceDepth === 0) {
        break;
      }
    }

    return [...new Set(mocks)]; // Remove duplicates
  }

  /**
   * Extract edge cases from test block
   */
  private extractEdgeCases(lines: string[], startLine: number): string[] {
    const edgeCases: string[] = [];
    const edgeCasePatterns = [
      /null|undefined|null/,
      /empty|''|""|\[\]|{}/,
      /zero|0/,
      /negative|-\d+/,
      /error|throw|exception/,
      /boundary|limit|max|min/,
    ];

    let braceDepth = 0;
    let inTestBlock = false;

    for (let i = startLine; i < Math.min(startLine + 50, lines.length); i++) {
      const line = lines[i];
      if (line === undefined) continue;

      for (const pattern of edgeCasePatterns) {
        if (pattern.test(line.toLowerCase())) {
          edgeCases.push(line.trim());
        }
      }

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      if (braceDepth > 0) {
        inTestBlock = true;
      } else if (inTestBlock && braceDepth === 0) {
        break;
      }
    }

    return [...new Set(edgeCases)]; // Remove duplicates
  }

  /**
   * Identify coverage gaps
   */
  private identifyCoverageGaps(): TestCoverageGap[] {
    const gaps: TestCoverageGap[] = [];

    for (const [sourceFilePath, symbols] of this.sourceFiles) {
      for (const symbol of symbols) {
        // Only check functions and methods for coverage
        if (symbol.type === "function" || symbol.type === "method") {
          const isCovered = this.isFunctionCovered(symbol);

          if (!isCovered) {
            const gap: TestCoverageGap = {
              ruleId: "TEST_COVERAGE_GAP",
              message: `Function ${symbol.name} is not covered by tests`,
              type: "untested_function",
              severity: this.calculateGapSeverity(symbol),
              filePath: sourceFilePath,
              line: symbol.line,
              column: symbol.column,
              functionName: symbol.name,
              suggestedTests: this.generateTestSuggestions(symbol),
              estimatedEffort: this.estimateTestEffort(symbol),
              riskLevel: this.calculateRiskLevel(symbol),
            };

            gaps.push(gap);
          }
        }
      }
    }

    logger.info(`🚫 Identified ${gaps.length} coverage gaps`, {
      agent: "architecture-agent",
      version: "1.0.0",
    });

    return gaps;
  }

  /**
   * Check if a function is covered by tests
   */
  private isFunctionCovered(symbol: Symbol): boolean {
    const functionName = symbol.name.toLowerCase();

    for (const testBlocks of this.testFiles.values()) {
      for (const testBlock of testBlocks) {
        if (testBlock.type === "test") {
          const testName = testBlock.name.toLowerCase();
          const testContent = testBlock.name.toLowerCase();

          // Check if test name references the function
          if (
            testName.includes(functionName) ||
            testContent.includes(functionName) ||
            functionName.includes(testName.replace(/\s+/g, "_"))
          ) {
            return true;
          }

          // Check if mocks reference the function
          for (const mock of testBlock.mocks) {
            if (mock.toLowerCase().includes(functionName)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Calculate gap severity based on function characteristics
   */
  private calculateGapSeverity(
    symbol: Symbol,
  ): "low" | "medium" | "high" | "critical" {
    let severity: "low" | "medium" | "high" | "critical" = "medium";

    // High complexity functions need testing
    if ((symbol.complexity || 0) > 10) {
      severity = "critical";
    }
    // Public functions should be tested
    else if (!symbol.name.startsWith("_") && !symbol.name.startsWith("#")) {
      severity = "high";
    }
    // Error handling functions
    else if (
      symbol.name.toLowerCase().includes("error") ||
      symbol.name.toLowerCase().includes("exception")
    ) {
      severity = "high";
    }
    // Private/internal functions
    else if (symbol.name.startsWith("_") || symbol.name.startsWith("#")) {
      severity = "low";
    }

    return severity;
  }

  /**
   * Generate test suggestions for a function
   */
  private generateTestSuggestions(symbol: Symbol): string[] {
    const suggestions: string[] = [];

    // Basic test suggestion
    suggestions.push(`Test ${symbol.name} with valid inputs`);

    // Edge case suggestions
    if (this.config.requireEdgeCaseCoverage) {
      suggestions.push(`Test ${symbol.name} with null/undefined inputs`);
      suggestions.push(`Test ${symbol.name} with empty arrays/objects`);
      suggestions.push(`Test ${symbol.name} boundary conditions`);
    }

    // Error handling suggestions
    if (this.config.requireErrorHandling) {
      suggestions.push(`Test ${symbol.name} error handling scenarios`);
    }

    // Mock suggestions (simplified since Symbol doesn't have parameters)
    if (symbol.dependencies.length > 0) {
      suggestions.push(`Test ${symbol.name} with mocked dependencies`);
    }

    return suggestions;
  }

  /**
   * Estimate effort required to test a function
   */
  private estimateTestEffort(symbol: Symbol): "low" | "medium" | "high" {
    let effort: "low" | "medium" | "high" = "medium";

    // Complexity-based effort estimation
    if ((symbol.complexity || 0) > 15) {
      effort = "high";
    } else if ((symbol.complexity || 0) < 5) {
      effort = "low";
    }

    // Dependency-based effort adjustment
    if (symbol.dependencies.length > 5) {
      effort = "high";
    }

    return effort;
  }

  /**
   * Calculate risk level for untested function
   */
  private calculateRiskLevel(
    symbol: Symbol,
  ): "low" | "medium" | "high" | "critical" {
    let riskLevel: "low" | "medium" | "high" | "critical" = "medium";

    // Public interface functions are higher risk
    if (!symbol.name.startsWith("_") && !symbol.name.startsWith("#")) {
      riskLevel = "high";
    }

    // High complexity increases risk
    if ((symbol.complexity || 0) > 10) {
      riskLevel = "critical";
    }

    // Security-sensitive functions
    const securityKeywords = [
      "auth",
      "password",
      "token",
      "crypto",
      "encrypt",
      "decrypt",
      "validate",
      "sanitize",
    ];
    if (
      securityKeywords.some((keyword) =>
        symbol.name.toLowerCase().includes(keyword),
      )
    ) {
      riskLevel = "critical";
    }

    return riskLevel;
  }

  /**
   * Calculate overall coverage percentage
   */
  private calculateOverallCoverage(gaps: TestCoverageGap[]): number {
    const totalFunctions = Array.from(this.sourceFiles.values()).reduce(
      (sum, symbols) => {
        return (
          sum +
          symbols.filter((s) => s.type === "function" || s.type === "method")
            .length
        );
      },
      0,
    );
    const uncoveredFunctions = gaps.length;
    const coveredFunctions = totalFunctions - uncoveredFunctions;

    return totalFunctions > 0
      ? Math.round((coveredFunctions / totalFunctions) * 100)
      : 100;
  }

  /**
   * Calculate function coverage percentage
   */
  private calculateFunctionCoverage(gaps: TestCoverageGap[]): number {
    return this.calculateOverallCoverage(gaps);
  }

  /**
   * Calculate class coverage percentage
   */
  private calculateClassCoverage(gaps: TestCoverageGap[]): number {
    // For now, return function coverage as a proxy
    // In a more sophisticated implementation, we'd track class coverage separately
    return this.calculateOverallCoverage(gaps);
  }

  /**
   * Calculate quality score for coverage analysis
   */
  private calculateQualityScore(gaps: TestCoverageGap[]): number {
    let score = 100;

    // Deduct points for coverage gaps based on severity
    for (const gap of gaps) {
      switch (gap.severity) {
        case "critical":
          score -= 20;
          break;
        case "high":
          score -= 10;
          break;
        case "medium":
          score -= 5;
          break;
        case "low":
          score -= 2;
          break;
      }
    }

    // Ensure score doesn't go below 0
    return Math.max(0, score);
  }

  /**
   * Generate recommendations based on coverage analysis
   */
  private generateRecommendations(
    gaps: TestCoverageGap[],
    qualityScore: number,
  ): string[] {
    const recommendations: string[] = [];

    // Overall coverage recommendations
    const overallCoverage = this.calculateOverallCoverage(gaps);
    if (overallCoverage < this.config.coverageThreshold) {
      recommendations.push(
        `Increase test coverage from ${overallCoverage}% to at least ${this.config.coverageThreshold}%`,
      );
    }

    // Severity-based recommendations
    const criticalGaps = gaps.filter((g) => g.severity === "critical");
    const highGaps = gaps.filter((g) => g.severity === "high");

    if (criticalGaps.length > 0) {
      recommendations.push(
        `Prioritize testing ${criticalGaps.length} critical functions that are currently untested`,
      );
    }

    if (highGaps.length > 0) {
      recommendations.push(
        `Focus on ${highGaps.length} high-priority functions to improve coverage`,
      );
    }

    // Quality-based recommendations
    if (qualityScore < 70) {
      recommendations.push(
        "Implement comprehensive test suite to improve code quality score",
      );
    }

    // Edge case recommendations
    if (this.config.requireEdgeCaseCoverage) {
      recommendations.push(
        "Add edge case testing for boundary conditions and error scenarios",
      );
    }

    // Mock recommendations
    const filesWithMocks = Array.from(this.testFiles.values()).some((blocks) =>
      blocks.some((block) => block.mocks.length > 0),
    );

    if (!filesWithMocks) {
      recommendations.push(
        "Implement mocking strategies for external dependencies",
      );
    }

    return recommendations;
  }

  /**
   * Generate file-level results
   */
  private generateFileResults(gaps: TestCoverageGap[]): TestCoverageResult[] {
    const fileResults: TestCoverageResult[] = [];

    for (const [filePath, symbols] of this.sourceFiles) {
      const functions = symbols.filter(
        (s) => s.type === "function" || s.type === "method",
      );
      const fileGaps = gaps.filter((gap) => gap.filePath === filePath);
      const testedFunctions = functions.length - fileGaps.length;
      const coveragePercentage =
        functions.length > 0
          ? Math.round((testedFunctions / functions.length) * 100)
          : 100;

      const result: TestCoverageResult = {
        filePath,
        totalFunctions: functions.length,
        testedFunctions,
        totalClasses: symbols.filter((s) => s.type === "class").length, // Count classes
        testedClasses: 0, // TODO: Implement class test coverage tracking
        coveragePercentage,
        uncoveredFunctions: fileGaps.map((gap) => gap.functionName || ""),
        uncoveredClasses: [],
        testQuality: this.calculateTestQuality(filePath, fileGaps),
        recommendations: this.generateFileRecommendations(fileGaps),
      };

      fileResults.push(result);
    }

    return fileResults.sort(
      (a, b) => a.coveragePercentage - b.coveragePercentage,
    );
  }

  /**
   * Calculate test quality metrics for a file
   */
  private calculateTestQuality(
    filePath: string,
    gaps: TestCoverageGap[],
  ): TestQualityMetrics {
    const testFilePaths = Array.from(this.testFiles.keys()).filter((testPath) =>
      testPath.includes(
        filePath
          .split("/")
          .pop()
          ?.replace(/\.[^/.]+$/, "") || "",
      ),
    );

    let totalAssertions = 0;
    let totalEdgeCases = 0;
    let totalMocks = 0;

    for (const testFilePath of testFilePaths) {
      const testBlocks = this.testFiles.get(testFilePath) || [];
      for (const block of testBlocks) {
        if (block.type === "test") {
          totalAssertions += block.assertions;
          totalEdgeCases += block.edgeCases.length;
          totalMocks += block.mocks.length;
        }
      }
    }

    return {
      totalAssertions,
      averageAssertionsPerTest:
        testFilePaths.length > 0
          ? Math.round(totalAssertions / testFilePaths.length)
          : 0,
      edgeCaseCoverage: totalEdgeCases > 0 ? "good" : "poor",
      mockCoverage: totalMocks > 0 ? "good" : "poor",
      mutationScore: this.config.trackMutationScore ? "unknown" : "not_tracked",
    };
  }

  /**
   * Generate file-level recommendations
   */
  private generateFileRecommendations(gaps: TestCoverageGap[]): string[] {
    const recommendations: string[] = [];

    if (gaps.length === 0) {
      recommendations.push("Excellent test coverage for this file");
      return recommendations;
    }

    // Sort gaps by severity
    gaps.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    // Recommend testing highest severity gaps first
    const criticalGaps = gaps.filter((g) => g.severity === "critical");
    const highGaps = gaps.filter((g) => g.severity === "high");

    if (criticalGaps.length > 0) {
      recommendations.push(
        `Priority: Test ${criticalGaps.length} critical functions`,
      );
    }

    if (highGaps.length > 0) {
      recommendations.push(
        `Next: Test ${highGaps.length} high-priority functions`,
      );
    }

    return recommendations;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CoverageAnalysisConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug("Updated coverage analyzer configuration", {
      agent: "architecture-agent",
      version: "1.0.0",
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): CoverageAnalysisConfig {
    return { ...this.config };
  }

  /**
   * Get analysis statistics
   */
  getStatistics(): {
    sourceFiles: number;
    testFiles: number;
    totalFunctions: number;
    totalTests: number;
  } {
    const totalFunctions = Array.from(this.sourceFiles.values()).reduce(
      (sum, symbols) => {
        return (
          sum +
          symbols.filter((s) => s.type === "function" || s.type === "method")
            .length
        );
      },
      0,
    );
    const totalTests = Array.from(this.testFiles.values()).reduce(
      (sum, blocks) => sum + blocks.length,
      0,
    );

    return {
      sourceFiles: this.sourceFiles.size,
      testFiles: this.testFiles.size,
      totalFunctions,
      totalTests,
    };
  }
}
