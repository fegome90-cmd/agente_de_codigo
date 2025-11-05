/**
 * DRY (Don't Repeat Yourself) Violation Analysis System
 * Detects code duplication using AST analysis and similarity algorithms
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import * as crypto from "node:crypto";
// Simple cosine similarity implementation
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}
import { logger } from "./utils/logger.js";
import type {
  ASTNode,
  CodeBlock,
  SimilarityMatch,
  DRYViolation,
  Finding,
  ArchitectureTaskData,
} from "./types.js";
import { ASTParser } from "./ast-parser.js";
import { SymbolExtractor } from "./symbol-extractor.js";

/**
 * Code block fingerprint for similarity detection
 */
export interface CodeFingerprint {
  id: string;
  structureHash: string;
  contentHash: string;
  variablePattern: string;
  controlFlowPattern: string;
  complexity: number;
  tokenCount: number;
  language: string;
}

/**
 * DRY analysis configuration
 */
export interface DRYAnalysisConfig {
  enabled: boolean;
  similarityThreshold: number; // 0.0 - 1.0
  minLinesToConsider: number;
  minTokenCount: number;
  maxTokenCount: number;
  ignorePatterns: string[];
  includeTests: boolean;
  includeComments: boolean;
  structuralWeight: number; // Weight for structural similarity
  semanticWeight: number; // Weight for semantic similarity
  exactMatchBonus: number; // Bonus for exact matches
}

/**
 * Similarity analysis result
 */
export interface SimilarityAnalysis {
  similarity: number;
  matchType: "exact" | "structural" | "semantic";
  structuralSimilarity: number;
  semanticSimilarity: number;
  matchingLines: number[];
  differences: string[];
  commonVariables: string[];
  differentVariables: string[];
}

/**
 * DRY Analyzer
 */
export class DRYAnalyzer {
  private astParser: ASTParser;
  private symbolExtractor: SymbolExtractor;
  private config: DRYAnalysisConfig;
  private codeBlocks: Map<string, CodeBlock> = new Map();
  private fingerprints: Map<string, CodeFingerprint> = new Map();
  private similarityCache: Map<string, SimilarityAnalysis[]> = new Map();

  constructor(config?: Partial<DRYAnalysisConfig>) {
    this.astParser = new ASTParser();
    this.symbolExtractor = new SymbolExtractor();
    this.config = {
      enabled: true,
      similarityThreshold: 0.75,
      minLinesToConsider: 5,
      minTokenCount: 20,
      maxTokenCount: 500,
      ignorePatterns: [
        "**/*.test.*",
        "**/*.spec.*",
        "**/node_modules/**",
        "**/dist/**",
      ],
      includeTests: false,
      includeComments: false,
      structuralWeight: 0.6,
      semanticWeight: 0.4,
      exactMatchBonus: 0.2,
      ...config,
    };

    logger.debug("DRY Analyzer initialized");
  }

  /**
   * Analyze project for DRY violations
   */
  async analyzeDRYViolations(
    taskData: ArchitectureTaskData,
  ): Promise<DRYViolation[]> {
    logger.info(
      `🔍 Analyzing DRY violations for ${taskData.scope.length} files`,
    );

    if (!this.config.enabled) {
      logger.info("DRY analysis is disabled");
      return [];
    }

    // Clear previous analysis
    this.codeBlocks.clear();
    this.fingerprints.clear();
    this.similarityCache.clear();

    // Step 1: Extract code blocks from all files
    const extractedBlocks = await this.extractCodeBlocks(taskData);
    logger.info(`📦 Extracted ${extractedBlocks.length} code blocks`);

    // Step 2: Generate fingerprints for all blocks
    const fingerprints = await this.generateFingerprints(extractedBlocks);
    logger.info(`🔑 Generated ${fingerprints.length} fingerprints`);

    // Step 3: Find similar blocks
    const similarityMatches = await this.findSimilarBlocks(fingerprints);
    logger.info(`🔍 Found ${similarityMatches.length} similarity matches`);

    // Step 4: Convert matches to DRY violations
    const violations = await this.convertToViolations(
      similarityMatches,
      taskData,
    );

    // Step 5: Filter and sort violations
    const filteredViolations = this.filterViolations(violations);

    logger.info(
      `🚫 DRY analysis complete: ${filteredViolations.length} violations found`,
    );
    return filteredViolations;
  }

  /**
   * Extract code blocks from files
   */
  private async extractCodeBlocks(
    taskData: ArchitectureTaskData,
  ): Promise<CodeBlock[]> {
    const blocks: CodeBlock[] = [];
    let processedFiles = 0;

    for (const filePath of taskData.scope) {
      if (this.shouldIgnoreFile(filePath)) {
        continue;
      }

      try {
        const fileBlocks = await this.extractBlocksFromFile(
          filePath,
          taskData.context.repoRoot,
        );
        blocks.push(...fileBlocks);
        processedFiles++;

        if (processedFiles % 10 === 0) {
          logger.debug(
            `Processed ${processedFiles}/${taskData.scope.length} files`,
          );
        }
      } catch (error) {
        logger.error(`Failed to extract blocks from ${filePath}:`, error);
      }
    }

    // Store blocks for later reference
    for (const block of blocks) {
      this.codeBlocks.set(block.id, block);
    }

    return blocks;
  }

  /**
   * Extract code blocks from a single file
   */
  private async extractBlocksFromFile(
    filePath: string,
    repoRoot: string,
  ): Promise<CodeBlock[]> {
    const blocks: CodeBlock[] = [];

    try {
      // Parse AST
      const parsed = await this.astParser.parseFile(filePath);
      if (!parsed || !parsed.ast) {
        return blocks;
      }

      const ast = parsed.ast;

      // Extract different types of code blocks
      const functionBlocks = this.extractFunctionBlocks(ast, filePath);
      const classBlocks = this.extractClassBlocks(ast, filePath);
      const methodBlocks = this.extractMethodBlocks(ast, filePath);
      const genericBlocks = this.extractGenericBlocks(ast, filePath);

      blocks.push(
        ...functionBlocks,
        ...classBlocks,
        ...methodBlocks,
        ...genericBlocks,
      );

      // Filter blocks by minimum lines
      return blocks.filter(
        (block) =>
          block.endLine - block.startLine + 1 >= this.config.minLinesToConsider,
      );
    } catch (error) {
      logger.error(`Error extracting blocks from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Extract function blocks from AST
   */
  private extractFunctionBlocks(ast: ASTNode, filePath: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    const extractFunctions = (node: ASTNode) => {
      if (this.isFunctionNode(node)) {
        const block = this.createCodeBlock(node, filePath, "function");
        if (block) blocks.push(block);
      }

      for (const child of node.children) {
        extractFunctions(child);
      }
    };

    extractFunctions(ast);
    return blocks;
  }

  /**
   * Extract class blocks from AST
   */
  private extractClassBlocks(ast: ASTNode, filePath: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    const extractClasses = (node: ASTNode) => {
      if (node.type.includes("class")) {
        const block = this.createCodeBlock(node, filePath, "class");
        if (block) blocks.push(block);
      }

      for (const child of node.children) {
        extractClasses(child);
      }
    };

    extractClasses(ast);
    return blocks;
  }

  /**
   * Extract method blocks from AST
   */
  private extractMethodBlocks(ast: ASTNode, filePath: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    const extractMethods = (node: ASTNode) => {
      if (
        node.type.includes("method") ||
        node.type.includes("function_definition")
      ) {
        const block = this.createCodeBlock(node, filePath, "method");
        if (block) blocks.push(block);
      }

      for (const child of node.children) {
        extractMethods(child);
      }
    };

    extractMethods(ast);
    return blocks;
  }

  /**
   * Extract generic blocks (large code segments)
   */
  private extractGenericBlocks(ast: ASTNode, filePath: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    // Extract large blocks of code that aren't functions/classes
    const traverse = (node: ASTNode, depth: number = 0) => {
      if (depth > 0 && this.shouldCreateBlock(node)) {
        const block = this.createCodeBlock(node, filePath, "block");
        if (block) blocks.push(block);
      }

      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    };

    traverse(ast);
    return blocks;
  }

  /**
   * Create a code block from AST node
   */
  private createCodeBlock(
    node: ASTNode,
    filePath: string,
    type: CodeBlock["type"],
  ): CodeBlock | null {
    const startLine = node.startPosition.row;
    const endLine = node.endPosition.row;

    // Simplified line extraction - in production, you'd extract actual source lines
    const content = `// Code block ${type} from ${filePath}:${startLine}-${endLine}`;

    // Simple token count estimation
    const estimatedTokens = (endLine - startLine + 1) * 10;

    if (endLine - startLine + 1 < this.config.minLinesToConsider) {
      return null;
    }

    if (
      estimatedTokens < this.config.minTokenCount ||
      estimatedTokens > this.config.maxTokenCount
    ) {
      return null;
    }

    const symbols = this.extractSymbols(node);
    const complexity = this.calculateComplexity(node);

    return {
      id: this.generateBlockId(filePath, node),
      content,
      hash: crypto.createHash("md5").update(content).digest("hex"),
      file: filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      type,
      complexity,
      symbols,
    };
  }

  /**
   * Generate fingerprints for code blocks
   */
  private async generateFingerprints(
    blocks: CodeBlock[],
  ): Promise<CodeFingerprint[]> {
    const fingerprints: CodeFingerprint[] = [];

    for (const block of blocks) {
      const fingerprint = await this.createFingerprint(block);
      if (fingerprint) {
        fingerprints.push(fingerprint);
        this.fingerprints.set(block.id, fingerprint);
      }
    }

    return fingerprints;
  }

  /**
   * Create fingerprint for a code block
   */
  private async createFingerprint(
    block: CodeBlock,
  ): Promise<CodeFingerprint | null> {
    try {
      const tokens = this.tokenize(block.content);
      const normalizedTokens = this.normalizeTokens(tokens);

      return {
        id: block.id,
        structureHash: this.calculateStructureHash(block.content),
        contentHash: block.hash,
        variablePattern: this.extractVariablePattern(block.content),
        controlFlowPattern: this.extractControlFlowPattern(block.content),
        complexity: block.complexity,
        tokenCount: tokens.length,
        language: this.detectLanguage(block.file),
      };
    } catch (error) {
      logger.error(
        `Failed to create fingerprint for block ${block.id}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Find similar blocks using fingerprint comparison
   */
  private async findSimilarBlocks(
    fingerprints: CodeFingerprint[],
  ): Promise<SimilarityMatch[]> {
    const matches: SimilarityMatch[] = [];
    let comparisons = 0;

    for (let i = 0; i < fingerprints.length; i++) {
      for (let j = i + 1; j < fingerprints.length; j++) {
        comparisons++;

        const fp1 = fingerprints[i];
        const fp2 = fingerprints[j];

        if (!fp1 || !fp2) continue;

        // Skip if same file (optional - can be configured)
        if (fp1.language !== fp2.language) continue;

        // Check cache first
        const cacheKey = [fp1.id, fp2.id].sort().join(":");
        if (this.similarityCache.has(cacheKey)) {
          const cachedResults = this.similarityCache.get(cacheKey)!;

          // Convert cached similarities to matches
          for (const similarity of cachedResults) {
            if (similarity.similarity >= this.config.similarityThreshold) {
              const block1 = this.codeBlocks.get(fp1.id);
              const block2 = this.codeBlocks.get(fp2.id);

              if (!block1 || !block2) continue;

              matches.push({
                block1,
                block2,
                similarity: similarity.similarity,
                matchingLines: similarity.matchingLines,
                differences: similarity.differences,
                type: similarity.matchType,
              });
            }
          }
          continue;
        }

        // Calculate similarity
        const similarities = await this.calculateSimilarity(fp1, fp2);

        // Cache results
        this.similarityCache.set(cacheKey, similarities);

        // Convert to SimilarityMatch if above threshold
        for (const similarity of similarities) {
          if (similarity.similarity >= this.config.similarityThreshold) {
            const block1 = this.codeBlocks.get(fp1.id)!;
            const block2 = this.codeBlocks.get(fp2.id)!;

            matches.push({
              block1,
              block2,
              similarity: similarity.similarity,
              matchingLines: similarity.matchingLines,
              differences: similarity.differences,
              type: similarity.matchType,
            });
          }
        }
      }
    }

    logger.debug(`Performed ${comparisons} fingerprint comparisons`);
    return matches;
  }

  /**
   * Calculate similarity between two fingerprints
   */
  private async calculateSimilarity(
    fp1: CodeFingerprint,
    fp2: CodeFingerprint,
  ): Promise<SimilarityAnalysis[]> {
    const analyses: SimilarityAnalysis[] = [];

    // Check for exact match
    if (fp1.contentHash === fp2.contentHash) {
      analyses.push({
        similarity: 1.0 + this.config.exactMatchBonus,
        matchType: "exact",
        structuralSimilarity: 1.0,
        semanticSimilarity: 1.0,
        matchingLines: [],
        differences: [],
        commonVariables: [],
        differentVariables: [],
      });
      return analyses;
    }

    // Check structural similarity
    const structuralSim = this.calculateStructuralSimilarity(fp1, fp2);
    if (structuralSim >= this.config.similarityThreshold * 0.5) {
      const block1 = this.codeBlocks.get(fp1.id)!;
      const block2 = this.codeBlocks.get(fp2.id)!;

      analyses.push({
        similarity: structuralSim * this.config.structuralWeight,
        matchType: "structural",
        structuralSimilarity: structuralSim,
        semanticSimilarity: 0,
        matchingLines: this.findMatchingLines(block1, block2),
        differences: this.findDifferences(block1, block2),
        commonVariables: this.findCommonVariables(block1, block2),
        differentVariables: this.findDifferentVariables(block1, block2),
      });
    }

    // Check semantic similarity
    const semanticSim = this.calculateSemanticSimilarity(fp1, fp2);
    if (semanticSim >= this.config.similarityThreshold * 0.5) {
      const block1 = this.codeBlocks.get(fp1.id)!;
      const block2 = this.codeBlocks.get(fp2.id)!;

      analyses.push({
        similarity: semanticSim * this.config.semanticWeight,
        matchType: "semantic",
        structuralSimilarity: 0,
        semanticSimilarity: semanticSim,
        matchingLines: this.findMatchingLines(block1, block2),
        differences: this.findDifferences(block1, block2),
        commonVariables: this.findCommonVariables(block1, block2),
        differentVariables: this.findDifferentVariables(block1, block2),
      });
    }

    // Combined similarity
    const combinedSim =
      structuralSim * this.config.structuralWeight +
      semanticSim * this.config.semanticWeight;

    if (combinedSim >= this.config.similarityThreshold * 0.7) {
      const block1 = this.codeBlocks.get(fp1.id)!;
      const block2 = this.codeBlocks.get(fp2.id)!;

      analyses.push({
        similarity: combinedSim,
        matchType: "structural",
        structuralSimilarity: structuralSim,
        semanticSimilarity: semanticSim,
        matchingLines: this.findMatchingLines(block1, block2),
        differences: this.findDifferences(block1, block2),
        commonVariables: this.findCommonVariables(block1, block2),
        differentVariables: this.findDifferentVariables(block1, block2),
      });
    }

    return analyses;
  }

  /**
   * Calculate structural similarity between fingerprints
   */
  private calculateStructuralSimilarity(
    fp1: CodeFingerprint,
    fp2: CodeFingerprint,
  ): number {
    let similarity = 0;

    // Compare structure hashes
    if (fp1.structureHash === fp2.structureHash) {
      similarity += 0.4;
    }

    // Compare control flow patterns
    if (fp1.controlFlowPattern === fp2.controlFlowPattern) {
      similarity += 0.3;
    }

    // Compare variable patterns
    const varPatternSim = this.calculateStringSimilarity(
      fp1.variablePattern,
      fp2.variablePattern,
    );
    similarity += varPatternSim * 0.2;

    // Compare complexity
    const complexityDiff = Math.abs(fp1.complexity - fp2.complexity);
    const complexitySim = Math.max(
      0,
      1 - complexityDiff / Math.max(fp1.complexity, fp2.complexity),
    );
    similarity += complexitySim * 0.1;

    return Math.min(1, similarity);
  }

  /**
   * Calculate semantic similarity using cosine similarity
   */
  private calculateSemanticSimilarity(
    fp1: CodeFingerprint,
    fp2: CodeFingerprint,
  ): number {
    const block1 = this.codeBlocks.get(fp1.id)!;
    const block2 = this.codeBlocks.get(fp2.id)!;

    const vector1 = this.createSemanticVector(block1);
    const vector2 = this.createSemanticVector(block2);

    return cosineSimilarity(vector1, vector2);
  }

  /**
   * Create semantic vector for code block
   */
  private createSemanticVector(block: CodeBlock): number[] {
    const tokens = this.tokenize(block.content);
    const symbols = block.symbols;

    // Create a simple bag-of-words vector
    const vector = new Array(1000).fill(0); // Fixed size vector

    // Hash tokens to vector indices
    for (const token of tokens) {
      const index = Math.abs(this.hashCode(token)) % 1000;
      vector[index]++;
    }

    // Add symbols
    for (const symbol of symbols) {
      const index = Math.abs(this.hashCode(symbol)) % 1000;
      vector[index] += 2; // Higher weight for symbols
    }

    return vector;
  }

  /**
   * Convert similarity matches to DRY violations
   */
  private async convertToViolations(
    matches: SimilarityMatch[],
    taskData: ArchitectureTaskData,
  ): Promise<DRYViolation[]> {
    const violations: DRYViolation[] = [];

    for (const match of matches) {
      const violation: DRYViolation = {
        ruleId: "DRY_VIOLATION",
        message: this.generateViolationMessage(match),
        severity: this.calculateSeverity(match),
        filePath: match.block1.file,
        line: match.block1.startLine,
        column: 1,
        category: "dry",
        architecturalImpact: this.calculateArchitecturalImpact(match),
        refactorEffort: this.calculateRefactorEffort(match),
        similarity: match.similarity,
        blocks: [match.block1, match.block2],
        violationType: this.determineViolationType(match),
        refactorSuggestion: this.generateRefactorSuggestion(match),
      };

      violations.push(violation);
    }

    return violations;
  }

  /**
   * Filter violations by relevance and importance
   */
  private filterViolations(violations: DRYViolation[]): DRYViolation[] {
    // Sort by similarity (highest first) and then by impact
    return violations
      .sort((a, b) => {
        if (a.similarity !== b.similarity) {
          return b.similarity - a.similarity;
        }
        return (b.architecturalImpact || "medium").localeCompare(
          a.architecturalImpact || "medium",
        );
      })
      .filter((v) => v.similarity >= this.config.similarityThreshold);
  }

  // Helper methods

  private shouldIgnoreFile(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, "/");

    return this.config.ignorePatterns.some((pattern) => {
      const regexPattern = pattern
        .replace(/\*\*/g, "🔥DOUBLESTAR🔥")
        .replace(/\*/g, "[^/]*")
        .replace(/🔥DOUBLESTAR🔥/g, ".*")
        .replace(/\?/g, "[^/]");

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(normalizedPath);
    });
  }

  private isFunctionNode(node: ASTNode): boolean {
    const functionTypes = [
      "function_declaration",
      "function_definition",
      "arrow_function",
      "method_definition",
      "async_function",
      "async_function_definition",
    ];

    return (
      functionTypes.length > 0 &&
      functionTypes.some((type) => node.type.includes(type))
    );
  }

  private shouldCreateBlock(node: ASTNode): boolean {
    // Create blocks for large, complex nodes that aren't functions/classes
    const lineCount = node.endPosition.row - node.startPosition.row + 1;
    return lineCount >= this.config.minLinesToConsider * 2;
  }

  private extractNodeLines(node: ASTNode): string[] {
    const lines: string[] = [];
    const startLine = node.startPosition.row;
    const endLine = node.endPosition.row;

    // This is simplified - in production, you'd extract the actual source lines
    for (let i = startLine; i <= endLine; i++) {
      lines.push(`// Line ${i + 1} - ${node.type}`);
    }

    // Ensure we always return at least one line
    if (lines.length === 0) {
      lines.push(`// ${node.type} - Line ${startLine + 1}`);
    }

    return lines;
  }

  private tokenize(content: string): string[] {
    // Simple tokenization - split by non-word characters
    return content
      .split(/[^a-zA-Z0-9_]/)
      .filter((token) => token.length > 0)
      .filter((token) => !this.isKeyword(token));
  }

  private isKeyword(token: string): boolean {
    const keywords = [
      "if",
      "else",
      "for",
      "while",
      "do",
      "switch",
      "case",
      "default",
      "return",
      "break",
      "continue",
      "throw",
      "try",
      "catch",
      "finally",
      "var",
      "let",
      "const",
      "function",
      "class",
      "extends",
      "import",
      "export",
    ];
    return keywords.includes(token);
  }

  private normalizeTokens(tokens: string[]): string[] {
    // Normalize tokens for comparison
    return tokens.map((token) => {
      // Replace variable names with placeholder
      if (this.looksLikeVariable(token)) {
        return "VAR";
      }
      // Replace string literals with placeholder
      if (token.startsWith('"') || token.startsWith("'")) {
        return "STRING";
      }
      // Replace numbers with placeholder
      if (/^\d+$/.test(token)) {
        return "NUMBER";
      }
      return token;
    });
  }

  private looksLikeVariable(token: string): boolean {
    // Simple heuristic: camelCase or snake_case
    return /^[a-z][a-zA-Z0-9_]*$/.test(token);
  }

  private calculateStructureHash(content: string): string {
    // Create hash of code structure (simplified)
    const structure = content
      .replace(/[a-zA-Z0-9_]+/g, "IDENTIFIER")
      .replace(/['"`][^'"`]*['"`]/g, "STRING")
      .replace(/\d+/g, "NUMBER")
      .replace(/\s+/g, " ")
      .trim();

    return crypto.createHash("md5").update(structure).digest("hex");
  }

  private extractVariablePattern(content: string): string {
    // Extract pattern of variable declarations
    const varPattern =
      content
        .match(/(?:var|let|const|def)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g)
        ?.map((match) => match.replace(/[a-zA-Z_][a-zA-Z0-9_]*/, "VAR"))
        .join(",") || "";

    return varPattern;
  }

  private extractControlFlowPattern(content: string): string {
    // Extract control flow structure
    const controlFlow =
      content
        .match(/\b(if|else|for|while|do|switch|case|break|continue|return)\b/g)
        ?.join(",") || "";

    return controlFlow;
  }

  private extractSymbols(node: ASTNode): string[] {
    // Extract symbol names from AST node
    const symbols: string[] = [];

    const traverse = (n: ASTNode) => {
      if (n.type === "identifier") {
        symbols.push(n.text);
      }
      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    return [...new Set(symbols)];
  }

  private calculateComplexity(node: ASTNode): number {
    // Simple complexity calculation
    let complexity = 1;

    const traverse = (n: ASTNode) => {
      // Add complexity for control structures
      if (
        n.type.includes("if") ||
        n.type.includes("for") ||
        n.type.includes("while")
      ) {
        complexity += 2;
      }

      // Add complexity for nesting
      complexity += n.children.length * 0.1;

      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    return Math.round(complexity);
  }

  private generateBlockId(filePath: string, node: ASTNode): string {
    const fileHash = crypto
      .createHash("md5")
      .update(filePath)
      .digest("hex")
      .substring(0, 8);
    const nodeHash = crypto
      .createHash("md5")
      .update(`${node.type}:${node.startPosition.row}`)
      .digest("hex")
      .substring(0, 8);
    return `${fileHash}_${nodeHash}`;
  }

  private detectLanguage(filePath: string): string {
    if (filePath.endsWith(".py")) return "python";
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
      return "typescript";
    if (filePath.endsWith(".js") || filePath.endsWith(".jsx"))
      return "javascript";
    return "unknown";
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const tokens1 = str1.split(",").map((t) => t.trim());
    const tokens2 = str2.split(",").map((t) => t.trim());

    const common = tokens1.filter((t) => tokens2.includes(t)).length;
    const total = Math.max(tokens1.length, tokens2.length);

    return total > 0 ? common / total : 0;
  }

  private findMatchingLines(block1: CodeBlock, block2: CodeBlock): number[] {
    // Simplified - would use actual line comparison
    const lineCount = Math.min(
      block1.endLine - block1.startLine,
      block2.endLine - block2.startLine,
    );
    return Array.from(
      { length: Math.max(0, Math.min(lineCount, 5)) },
      (_, i) => i + 1,
    );
  }

  private findDifferences(block1: CodeBlock, block2: CodeBlock): string[] {
    const differences: string[] = [];

    if (block1.type !== block2.type) {
      differences.push(
        `Different block types: ${block1.type} vs ${block2.type}`,
      );
    }

    if (Math.abs(block1.complexity - block2.complexity) > 2) {
      differences.push(
        `Complexity difference: ${block1.complexity} vs ${block2.complexity}`,
      );
    }

    return differences;
  }

  private findCommonVariables(block1: CodeBlock, block2: CodeBlock): string[] {
    return block1.symbols.filter((symbol) => block2.symbols.includes(symbol));
  }

  private findDifferentVariables(
    block1: CodeBlock,
    block2: CodeBlock,
  ): string[] {
    const unique1 = block1.symbols.filter(
      (symbol) => !block2.symbols.includes(symbol),
    );
    const unique2 = block2.symbols.filter(
      (symbol) => !block1.symbols.includes(symbol),
    );
    return [...unique1, ...unique2];
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  private generateViolationMessage(match: SimilarityMatch): string {
    const percentage = Math.round(match.similarity * 100);
    return `Code duplication detected: ${percentage}% similar code blocks found`;
  }

  private calculateSeverity(
    match: SimilarityMatch,
  ): "critical" | "high" | "medium" | "low" {
    if (match.similarity > 0.95) return "critical";
    if (match.similarity > 0.85) return "high";
    if (match.similarity > 0.75) return "medium";
    return "low";
  }

  private calculateArchitecturalImpact(
    match: SimilarityMatch,
  ): "high" | "medium" | "low" {
    const avgComplexity =
      (match.block1.complexity + match.block2.complexity) / 2;
    if (avgComplexity > 10) return "high";
    if (avgComplexity > 5) return "medium";
    return "low";
  }

  private calculateRefactorEffort(
    match: SimilarityMatch,
  ): "low" | "medium" | "high" {
    const totalLines =
      match.block1.endLine -
      match.block1.startLine +
      (match.block2.endLine - match.block2.startLine);

    if (totalLines > 50) return "high";
    if (totalLines > 20) return "medium";
    return "low";
  }

  private determineViolationType(
    match: SimilarityMatch,
  ): "exact_duplicate" | "structural_duplicate" | "semantic_duplicate" {
    if (match.type === "exact") return "exact_duplicate";
    if (match.type === "semantic") return "semantic_duplicate";
    return "structural_duplicate";
  }

  private generateRefactorSuggestion(match: SimilarityMatch): string {
    if (match.type === "exact") {
      return "Extract common code into a shared function or method";
    }

    const commonVars = this.findCommonVariables(match.block1, match.block2);
    if (commonVars.length > 2) {
      return "Create a parameterized function to handle the common logic";
    }

    return "Consider refactoring to reduce code duplication";
  }

  /**
   * Get analysis statistics
   */
  getStatistics(): {
    blocksAnalyzed: number;
    fingerprintsGenerated: number;
    similarityComparisons: number;
    cacheHits: number;
    cacheSize: number;
  } {
    return {
      blocksAnalyzed: this.codeBlocks.size,
      fingerprintsGenerated: this.fingerprints.size,
      similarityComparisons: Math.floor(
        (this.fingerprints.size * (this.fingerprints.size - 1)) / 2,
      ),
      cacheHits: this.similarityCache.size,
      cacheSize: this.similarityCache.size,
    };
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.codeBlocks.clear();
    this.fingerprints.clear();
    this.similarityCache.clear();
    logger.debug("DRY analyzer cache cleared");
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DRYAnalysisConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info("DRY analyzer configuration updated");
  }

  /**
   * Get current configuration
   */
  getConfig(): DRYAnalysisConfig {
    return { ...this.config };
  }
}
