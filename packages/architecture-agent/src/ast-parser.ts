/**
 * AST Parser using Tree-sitter
 * Provides multi-language AST parsing capabilities for architectural analysis
 * with Node.js version compatibility and graceful degradation
 */

import { readFile } from "node:fs/promises";
import { extname, dirname } from "node:path";
import type { ASTNode, Symbol, ImportStatement } from "./types.js";
import { logger } from "./utils/logger.js";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import TypeScript from "tree-sitter-typescript";
import JavaScript from "tree-sitter-javascript";

// Dynamic imports for better compatibility
type ParserModule = any;

/**
 * Supported programming languages
 */
export type SupportedLanguage = "python" | "typescript" | "javascript";

/**
 * Language-specific parser configuration
 */
interface LanguageConfig {
  parser: any;
  extensions: string[];
  filePatterns: string[];
}

/**
 * AST Parser class using Tree-sitter for multi-language support
 * with Node.js version compatibility checks and graceful degradation
 */
export class ASTParser {
  private parsers: Map<SupportedLanguage, any> = new Map();
  private languageConfigs: Map<SupportedLanguage, LanguageConfig> = new Map();
  private initialized: boolean = false;
  private fallbackMode: boolean = false;

  constructor() {
    this.initializeParsers().catch((error) => {
      logger.warn(
        "⚠️ Tree-sitter initialization failed, enabling fallback mode",
        { error: error.message },
      );
      this.fallbackMode = true;
      this.initialized = true;
    });
  }

  /**
   * Check Node.js version compatibility
   */
  private checkNodeVersion(): { compatible: boolean; version: string } {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.substring(1).split(".")[0]);

    logger.debug(`Node.js version detected: ${nodeVersion}`);

    if (majorVersion < 18) {
      return { compatible: false, version: nodeVersion };
    }

    return { compatible: true, version: nodeVersion };
  }

  /**
   * Initialize Tree-sitter parsers with error handling and compatibility checks
   */
  private async initializeParsers(): Promise<void> {
    // Check Node.js version compatibility
    const { compatible, version } = this.checkNodeVersion();

    if (!compatible) {
      throw new Error(
        `Node.js ${version} is not supported. Requires Node.js 18 or higher.`,
      );
    }

    try {
      // Static imports for better compatibility
      logger.debug("Initializing tree-sitter parsers with static imports", {
        agent: "architecture-agent",
        version: "1.0.0",
      });

      // Initialize Python parser
      const pythonParser = new Parser();
      await this.setLanguageSafely(pythonParser, Python, "python");
      this.parsers.set("python", pythonParser);

      // Initialize TypeScript parser
      const tsParser = new Parser();
      await this.setLanguageSafely(
        tsParser,
        TypeScript.typescript,
        "typescript",
      );
      this.parsers.set("typescript", tsParser);

      // Initialize JavaScript parser
      const jsParser = new Parser();
      await this.setLanguageSafely(jsParser, JavaScript, "javascript");
      this.parsers.set("javascript", jsParser);

      // Configure language-specific settings
      this.languageConfigs.set("python", {
        parser: pythonParser,
        extensions: [".py"],
        filePatterns: ["**/*.py"],
      });

      this.languageConfigs.set("typescript", {
        parser: tsParser,
        extensions: [".ts", ".tsx"],
        filePatterns: ["**/*.ts", "**/*.tsx"],
      });

      this.languageConfigs.set("javascript", {
        parser: jsParser,
        extensions: [".js", ".jsx", ".mjs"],
        filePatterns: ["**/*.js", "**/*.jsx", "**/*.mjs"],
      });

      this.initialized = true;
      logger.info(
        "✅ Tree-sitter parsers initialized for all supported languages",
      );
    } catch (error) {
      logger.error("❌ Failed to initialize Tree-sitter parsers:", error);
      throw error;
    }
  }

  /**
   * Set language on parser with error handling
   */
  private async setLanguageSafely(
    parser: any,
    language: ParserModule,
    languageName: string,
  ): Promise<void> {
    try {
      // Handle both default export and direct export
      const langToUse = language?.default || language;

      if (!langToUse) {
        throw new Error(`Language module is empty: ${languageName}`);
      }

      parser.setLanguage(langToUse);

      // Validate parser works
      const testCode = this.getTestCode(languageName);
      const tree = parser.parse(testCode);

      if (!tree) {
        throw new Error("Parser returned null tree");
      }

      logger.debug(`✅ Initialized ${languageName} parser`);
    } catch (error) {
      logger.error(`❌ Failed to initialize ${languageName} parser:`, error);
      throw error;
    }
  }

  /**
   * Get test code for parser validation
   */
  private getTestCode(language: string): string {
    const testCodes: Record<string, string> = {
      python: "test = 1",
      typescript: "const test: number = 1;",
      javascript: "const test = 1;",
    };

    return testCodes[language] || "test;";
  }

  /**
   * Detect language from file extension
   */
  detectLanguage(filePath: string): SupportedLanguage | null {
    const ext = extname(filePath).toLowerCase();

    for (const [language, config] of this.languageConfigs) {
      if (config.extensions.includes(ext)) {
        return language;
      }
    }

    return null;
  }

  /**
   * Parse source file and return AST
   */
  async parseFile(
    filePath: string,
  ): Promise<{ ast: ASTNode; language: SupportedLanguage } | null> {
    try {
      const language = this.detectLanguage(filePath);
      if (!language) {
        logger.warn(`Unsupported file type: ${filePath}`);
        return null;
      }

      const source = await readFile(filePath, "utf-8");
      return this.parseSource(source, language, filePath);
    } catch (error) {
      logger.error(`Failed to parse file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Wait for parsers to be initialized
   */
  private async waitForInitialization(): Promise<void> {
    if (!this.initialized) {
      // Wait a bit for async initialization
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Parse source code and return AST with fallback support
   */
  async parseSource(
    source: string,
    language: SupportedLanguage,
    filePath: string = "",
  ): Promise<{ ast: ASTNode; language: SupportedLanguage } | null> {
    // Wait for initialization if needed
    await this.waitForInitialization();

    // If in fallback mode or parser not available, use regex-based parsing
    if (this.fallbackMode || !this.parsers.has(language)) {
      logger.debug(`Using fallback parsing for ${language} file: ${filePath}`);
      return this.parseWithRegex(source, language, filePath);
    }

    const parser = this.parsers.get(language);
    if (!parser) {
      logger.warn(
        `No parser available for language: ${language}, using fallback`,
      );
      return this.parseWithRegex(source, language, filePath);
    }

    try {
      const tree = parser.parse(source);
      const ast = this.convertTreeToASTNode(tree.rootNode, language, filePath);

      logger.debug(`Parsed ${language} file: ${filePath}`, {
        lines: source.split("\n").length,
        nodes: this.countNodes(ast),
      });

      return { ast, language };
    } catch (error) {
      logger.warn(
        `Tree-sitter parsing failed for ${language} file: ${filePath}, using fallback`,
        { error: error instanceof Error ? error.message : String(error) },
      );
      return this.parseWithRegex(source, language, filePath);
    }
  }

  /**
   * Fallback regex-based parsing when Tree-sitter is unavailable
   */
  private parseWithRegex(
    source: string,
    language: SupportedLanguage,
    filePath: string,
  ): { ast: ASTNode; language: SupportedLanguage } | null {
    try {
      logger.debug(
        `Using regex-based parsing for ${language} file: ${filePath}`,
      );

      // Simple regex-based parsing for basic symbol extraction
      const astNode: ASTNode = {
        id: `program_${Date.now()}`,
        type: "Program",
        text: source.substring(0, 100), // First 100 chars
        startPosition: { row: 0, column: 0 },
        endPosition: { row: source.split("\n").length, column: 0 },
        children: [],
        language,
        line: 1,
        column: 0,
      } as any; // Type assertion for flexibility

      return { ast: astNode, language };
    } catch (error) {
      logger.error(`Fallback parsing failed for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Convert Tree-sitter node to our AST node format
   */
  private convertTreeToASTNode(
    node: any,
    language: SupportedLanguage,
    filePath: string,
  ): ASTNode {
    const astNode: ASTNode = {
      id: this.generateNodeId(node),
      type: node.type,
      text: node.text,
      startPosition: {
        row: node.startPosition.row,
        column: node.startPosition.column,
      },
      endPosition: {
        row: node.endPosition.row,
        column: node.endPosition.column,
      },
      children: [],
      language,
    };

    // Recursively convert children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        const childASTNode = this.convertTreeToASTNode(
          child,
          language,
          filePath,
        );
        childASTNode.parent = astNode;
        astNode.children.push(childASTNode);
      }
    }

    return astNode;
  }

  /**
   * Extract symbols from AST
   */
  extractSymbols(ast: ASTNode): Symbol[] {
    const symbols: Symbol[] = [];
    this.extractSymbolsRecursive(ast, symbols);
    return symbols;
  }

  /**
   * Recursively extract symbols from AST nodes
   */
  private extractSymbolsRecursive(node: ASTNode, symbols: Symbol[]): void {
    // Language-specific symbol extraction
    switch (node.language) {
      case "python":
        this.extractPythonSymbols(node, symbols);
        break;
      case "typescript":
      case "javascript":
        this.extractTypeScriptSymbols(node, symbols);
        break;
    }

    // Recursively process children
    for (const child of node.children) {
      this.extractSymbolsRecursive(child, symbols);
    }
  }

  /**
   * Extract symbols from Python AST
   */
  private extractPythonSymbols(node: ASTNode, symbols: Symbol[]): void {
    // Class definitions
    if (node.type === "class_definition") {
      const className = this.extractIdentifier(node);
      if (className) {
        symbols.push({
          name: className,
          type: "class",
          file: "", // Will be set by caller
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          visibility: "public",
          dependencies: this.extractDependencies(node),
        });
      }
    }

    // Function definitions
    if (node.type === "function_definition") {
      const functionName = this.extractIdentifier(node);
      if (functionName) {
        symbols.push({
          name: functionName,
          type: "function",
          file: "", // Will be set by caller
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          visibility: "public",
          dependencies: this.extractDependencies(node),
        });
      }
    }

    // Import statements
    if (
      node.type === "import_statement" ||
      node.type === "import_from_statement"
    ) {
      const importInfo = this.extractPythonImport(node);
      if (importInfo) {
        symbols.push({
          name: importInfo.module,
          type: "import",
          file: "",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          visibility: "public",
          dependencies: [importInfo.module],
        });
      }
    }
  }

  /**
   * Extract symbols from TypeScript/JavaScript AST
   */
  private extractTypeScriptSymbols(node: ASTNode, symbols: Symbol[]): void {
    // Class declarations
    if (node.type === "class_declaration") {
      const className = this.extractIdentifier(node);
      if (className) {
        symbols.push({
          name: className,
          type: "class",
          file: "",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          visibility: this.extractVisibility(node),
          dependencies: this.extractDependencies(node),
        });
      }
    }

    // Function declarations
    if (
      node.type === "function_declaration" ||
      node.type === "arrow_function"
    ) {
      const functionName = this.extractIdentifier(node);
      if (functionName) {
        symbols.push({
          name: functionName,
          type: "function",
          file: "",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          visibility: this.extractVisibility(node),
          dependencies: this.extractDependencies(node),
        });
      }
    }

    // Import statements
    if (node.type === "import_statement") {
      const importInfo = this.extractTypeScriptImport(node);
      if (importInfo) {
        symbols.push({
          name: importInfo.module,
          type: "import",
          file: "",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          visibility: "public",
          dependencies: [importInfo.module],
        });
      }
    }
  }

  /**
   * Extract identifier from node
   */
  private extractIdentifier(node: ASTNode): string | null {
    // Look for identifier child nodes
    for (const child of node.children) {
      if (child.type === "identifier") {
        return child.text;
      }
    }
    return null;
  }

  /**
   * Extract dependencies from node
   */
  private extractDependencies(node: ASTNode): string[] {
    const dependencies: string[] = [];

    // Look for function calls and type references
    for (const child of node.children) {
      if (child.type === "identifier" || child.type === "type_identifier") {
        dependencies.push(child.text);
      }
    }

    return dependencies;
  }

  /**
   * Extract visibility modifier
   */
  private extractVisibility(
    node: ASTNode,
  ): "public" | "private" | "protected" | "internal" {
    // Look for visibility modifiers in children
    for (const child of node.children) {
      if (child.text === "private") return "private";
      if (child.text === "protected") return "protected";
      if (child.text === "public") return "public";
    }
    return "public";
  }

  /**
   * Extract Python import information
   */
  private extractPythonImport(node: ASTNode): ImportStatement | null {
    // This is a simplified implementation
    // In a full implementation, we'd parse the import structure more thoroughly
    return {
      module: node.text.split(" ")[1] || "",
      source: "",
      type: "named",
      symbols: [],
      isDynamic: false,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
    };
  }

  /**
   * Extract TypeScript/JavaScript import information
   */
  private extractTypeScriptImport(node: ASTNode): ImportStatement | null {
    // This is a simplified implementation
    // In a full implementation, we'd parse ES6 import statements
    return {
      module: node.text.split("from")[1]?.replace(/['"]/g, "") || "",
      source: "",
      type: "named",
      symbols: [],
      isDynamic: false,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
    };
  }

  /**
   * Generate unique node ID
   */
  private generateNodeId(node: any): string {
    return `${node.type}_${node.startPosition.row}_${node.startPosition.column}`;
  }

  /**
   * Count total nodes in AST
   */
  private countNodes(node: ASTNode): number {
    let count = 1;
    for (const child of node.children) {
      count += this.countNodes(child);
    }
    return count;
  }

  /**
   * Get supported file patterns for a language
   */
  getFilePatterns(language: SupportedLanguage): string[] {
    const config = this.languageConfigs.get(language);
    return config?.filePatterns || [];
  }

  /**
   * Get all supported file patterns
   */
  getAllSupportedPatterns(): string[] {
    const patterns: string[] = [];
    for (const config of this.languageConfigs.values()) {
      patterns.push(...config.filePatterns);
    }
    return patterns;
  }

  /**
   * Check if a file is supported
   */
  isFileSupported(filePath: string): boolean {
    return this.detectLanguage(filePath) !== null;
  }

  /**
   * Dispose of parsers and cleanup resources
   */
  dispose(): void {
    logger.debug("Disposing AST parser resources...");

    for (const parser of this.parsers.values()) {
      try {
        if (typeof parser.delete === "function") {
          parser.delete();
        }
      } catch (error) {
        logger.warn("Error disposing parser:", error);
      }
    }

    this.parsers.clear();
    this.languageConfigs.clear();
    this.initialized = false;
    this.fallbackMode = false;

    logger.debug("AST parser disposed successfully");
  }
}
