/**
 * Symbol Extractor and Dependency Graph Builder
 * Analyzes AST to extract symbols and build dependency relationships
 */

import type { ASTNode, Symbol, ImportStatement } from './types.js';
import { logger } from './utils/logger.js';

/**
 * Dependency graph node
 */
export interface DependencyNode {
  symbol: Symbol;
  dependencies: Set<string>;
  dependents: Set<string>;
  complexity: number;
  coupling: number;
  cohesion: number;
}

/**
 * Dependency graph representing symbol relationships
 */
export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  private edges: Map<string, Set<string>> = new Map();

  /**
   * Add symbol to the graph
   */
  addSymbol(symbol: Symbol): void {
    const key = this.getSymbolKey(symbol);
    if (!this.nodes.has(key)) {
      this.nodes.set(key, {
        symbol,
        dependencies: new Set(),
        dependents: new Set(),
        complexity: 0,
        coupling: 0,
        cohesion: 0
      });
      this.edges.set(key, new Set());
    }
  }

  /**
   * Add dependency relationship
   */
  addDependency(from: Symbol, to: string): void {
    const fromKey = this.getSymbolKey(from);
    const toKey = `${to}:${from.file}`;

    // Add nodes if they don't exist
    this.addSymbol(from);
    if (!this.nodes.has(toKey)) {
      // Create a placeholder node for external dependency
      this.nodes.set(toKey, {
        symbol: {
          name: to,
          type: 'import',
          file: from.file,
          line: from.line,
          column: from.column,
          visibility: 'public',
          dependencies: []
        },
        dependencies: new Set(),
        dependents: new Set(),
        complexity: 0,
        coupling: 0,
        cohesion: 0
      });
      this.edges.set(toKey, new Set());
    }

    // Add dependency relationship
    this.nodes.get(fromKey)!.dependencies.add(toKey);
    this.nodes.get(toKey)!.dependents.add(fromKey);
    this.edges.get(fromKey)!.add(toKey);
  }

  /**
   * Calculate complexity metrics for all nodes
   */
  calculateComplexity(): void {
    for (const [key, node] of this.nodes) {
      node.complexity = this.calculateNodeComplexity(node);
      node.coupling = this.calculateNodeCoupling(node);
      node.cohesion = this.calculateNodeCohesion(node);
    }
  }

  /**
   * Get all symbols
   */
  getAllSymbols(): Symbol[] {
    return Array.from(this.nodes.values()).map(node => node.symbol);
  }

  /**
   * Get symbols by type
   */
  getSymbolsByType(type: Symbol['type']): Symbol[] {
    return this.getAllSymbols().filter(symbol => symbol.type === type);
  }

  /**
   * Get symbols by file
   */
  getSymbolsByFile(filePath: string): Symbol[] {
    return this.getAllSymbols().filter(symbol => symbol.file === filePath);
  }

  /**
   * Get tightly coupled symbols (high coupling)
   */
  getTightlyCoupledSymbols(threshold: number = 5): Symbol[] {
    return Array.from(this.nodes.values())
      .filter(node => node.coupling > threshold)
      .map(node => node.symbol);
  }

  /**
   * Get high complexity symbols
   */
  getHighComplexitySymbols(threshold: number = 10): Symbol[] {
    return Array.from(this.nodes.values())
      .filter(node => node.complexity > threshold)
      .map(node => node.symbol);
  }

  /**
   * Get low cohesion symbols
   */
  getLowCohesionSymbols(threshold: number = 0.3): Symbol[] {
    return Array.from(this.nodes.values())
      .filter(node => node.cohesion < threshold)
      .map(node => node.symbol);
  }

  /**
   * Generate unique key for symbol
   */
  private getSymbolKey(symbol: Symbol): string {
    return `${symbol.name}:${symbol.file}:${symbol.line}`;
  }

  /**
   * Calculate complexity for a single node
   */
  private calculateNodeComplexity(node: DependencyNode): number {
    // Simple complexity calculation based on dependencies and dependents
    const dependencyComplexity = node.dependencies.size * 2;
    const dependentComplexity = node.dependents.size;
    return dependencyComplexity + dependentComplexity;
  }

  /**
   * Calculate coupling for a single node
   */
  private calculateNodeCoupling(node: DependencyNode): number {
    // Coupling is the number of dependencies on external modules
    let externalDependencies = 0;
    for (const dep of node.dependencies) {
      if (!dep.includes(node.symbol.file)) {
        externalDependencies++;
      }
    }
    return externalDependencies;
  }

  /**
   * Calculate cohesion for a single node
   */
  private calculateNodeCohesion(node: DependencyNode): number {
    // Simplified cohesion calculation
    // Higher cohesion when dependencies are within the same file/module
    let internalDependencies = 0;
    for (const dep of node.dependencies) {
      if (dep.includes(node.symbol.file)) {
        internalDependencies++;
      }
    }

    const totalDependencies = node.dependencies.size || 1;
    return internalDependencies / totalDependencies;
  }
}

/**
 * Symbol Extractor class for analyzing AST and extracting symbols
 */
export class SymbolExtractor {
  private dependencyGraph: DependencyGraph;

  constructor() {
    this.dependencyGraph = new DependencyGraph();
  }

  /**
   * Extract symbols from AST and build dependency graph
   */
  extractSymbols(ast: ASTNode, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];
    this.extractSymbolsRecursive(ast, symbols, filePath);

    // Build dependency graph
    for (const symbol of symbols) {
      this.dependencyGraph.addSymbol(symbol);
      for (const dependency of symbol.dependencies) {
        this.dependencyGraph.addDependency(symbol, dependency);
      }
    }

    // Calculate metrics
    this.dependencyGraph.calculateComplexity();

    logger.debug(`Extracted ${symbols.length} symbols from ${filePath}`, {
      classes: symbols.filter(s => s.type === 'class').length,
      functions: symbols.filter(s => s.type === 'function').length,
      imports: symbols.filter(s => s.type === 'import').length
    });

    return symbols;
  }

  /**
   * Recursively extract symbols from AST
   */
  private extractSymbolsRecursive(node: ASTNode, symbols: Symbol[], filePath: string): void {
    // Extract symbol based on node type and language
    const symbol = this.extractSymbolFromNode(node, filePath);
    if (symbol) {
      symbols.push(symbol);
    }

    // Recursively process children
    for (const child of node.children) {
      this.extractSymbolsRecursive(child, symbols, filePath);
    }
  }

  /**
   * Extract symbol from a single AST node
   */
  private extractSymbolFromNode(node: ASTNode, filePath: string): Symbol | null {
    switch (node.language) {
      case 'python':
        return this.extractPythonSymbol(node, filePath);
      case 'typescript':
      case 'javascript':
        return this.extractTypeScriptSymbol(node, filePath);
      default:
        return null;
    }
  }

  /**
   * Extract symbol from Python AST node
   */
  private extractPythonSymbol(node: ASTNode, filePath: string): Symbol | null {
    switch (node.type) {
      case 'class_definition':
        return this.extractPythonClass(node, filePath);
      case 'function_definition':
        return this.extractPythonFunction(node, filePath);
      case 'async_function_definition':
        return this.extractPythonFunction(node, filePath);
      case 'import_statement':
      case 'import_from_statement':
        return this.extractPythonImport(node, filePath);
      default:
        return null;
    }
  }

  /**
   * Extract symbol from TypeScript/JavaScript AST node
   */
  private extractTypeScriptSymbol(node: ASTNode, filePath: string): Symbol | null {
    switch (node.type) {
      case 'class_declaration':
        return this.extractTypeScriptClass(node, filePath);
      case 'function_declaration':
        return this.extractTypeScriptFunction(node, filePath);
      case 'arrow_function':
        return this.extractTypeScriptArrowFunction(node, filePath);
      case 'method_definition':
        return this.extractTypeScriptMethod(node, filePath);
      case 'import_statement':
        return this.extractTypeScriptImport(node, filePath);
      case 'export_statement':
        return this.extractTypeScriptExport(node, filePath);
      default:
        return null;
    }
  }

  /**
   * Extract Python class symbol
   */
  private extractPythonClass(node: ASTNode, filePath: string): Symbol | null {
    const className = this.findChildText(node, 'identifier');
    if (!className) return null;

    return {
      name: className,
      type: 'class',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: 'public',
      dependencies: this.extractNodeDependencies(node),
      complexity: this.calculateNodeComplexity(node)
    };
  }

  /**
   * Extract Python function symbol
   */
  private extractPythonFunction(node: ASTNode, filePath: string): Symbol | null {
    const functionName = this.findChildText(node, 'identifier');
    if (!functionName) return null;

    return {
      name: functionName,
      type: 'function',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: this.extractPythonVisibility(node),
      dependencies: this.extractNodeDependencies(node),
      complexity: this.calculateNodeComplexity(node)
    };
  }

  /**
   * Extract Python import symbol
   */
  private extractPythonImport(node: ASTNode, filePath: string): Symbol | null {
    const moduleName = this.extractPythonModuleName(node);
    if (!moduleName) return null;

    return {
      name: moduleName,
      type: 'import',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: 'public',
      dependencies: [moduleName]
    };
  }

  /**
   * Extract TypeScript class symbol
   */
  private extractTypeScriptClass(node: ASTNode, filePath: string): Symbol | null {
    const className = this.findChildText(node, 'identifier');
    if (!className) return null;

    return {
      name: className,
      type: 'class',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: this.extractTypeScriptVisibility(node),
      dependencies: this.extractNodeDependencies(node),
      complexity: this.calculateNodeComplexity(node)
    };
  }

  /**
   * Extract TypeScript function symbol
   */
  private extractTypeScriptFunction(node: ASTNode, filePath: string): Symbol | null {
    const functionName = this.findChildText(node, 'identifier');
    if (!functionName) return null;

    return {
      name: functionName,
      type: 'function',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: this.extractTypeScriptVisibility(node),
      dependencies: this.extractNodeDependencies(node),
      complexity: this.calculateNodeComplexity(node)
    };
  }

  /**
   * Extract TypeScript arrow function symbol
   */
  private extractTypeScriptArrowFunction(node: ASTNode, filePath: string): Symbol | null {
    // Arrow functions might not have names, use parent context
    const functionName = this.inferArrowFunctionName(node);
    if (!functionName) return null;

    return {
      name: functionName,
      type: 'function',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: this.extractTypeScriptVisibility(node),
      dependencies: this.extractNodeDependencies(node),
      complexity: this.calculateNodeComplexity(node)
    };
  }

  /**
   * Extract TypeScript method symbol
   */
  private extractTypeScriptMethod(node: ASTNode, filePath: string): Symbol | null {
    const methodName = this.findChildText(node, 'property_identifier');
    if (!methodName) return null;

    return {
      name: methodName,
      type: 'method',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: this.extractTypeScriptVisibility(node),
      dependencies: this.extractNodeDependencies(node),
      complexity: this.calculateNodeComplexity(node)
    };
  }

  /**
   * Extract TypeScript import symbol
   */
  private extractTypeScriptImport(node: ASTNode, filePath: string): Symbol | null {
    const moduleName = this.extractTypeScriptModuleName(node);
    if (!moduleName) return null;

    return {
      name: moduleName,
      type: 'import',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: 'public',
      dependencies: [moduleName]
    };
  }

  /**
   * Extract TypeScript export symbol
   */
  private extractTypeScriptExport(node: ASTNode, filePath: string): Symbol | null {
    const exportName = this.findChildText(node, 'identifier');
    if (!exportName) return null;

    return {
      name: exportName,
      type: 'export',
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      visibility: 'public',
      dependencies: this.extractNodeDependencies(node)
    };
  }

  /**
   * Helper methods for symbol extraction
   */
  private findChildText(node: ASTNode, childType: string): string | null {
    for (const child of node.children) {
      if (child.type === childType) {
        return child.text;
      }
    }
    return null;
  }

  private extractNodeDependencies(node: ASTNode): string[] {
    const dependencies: string[] = [];
    this.extractDependenciesRecursive(node, dependencies);
    return [...new Set(dependencies)]; // Remove duplicates
  }

  private extractDependenciesRecursive(node: ASTNode, dependencies: string[]): void {
    // Look for identifiers and type references
    if (node.type === 'identifier' || node.type === 'type_identifier') {
      dependencies.push(node.text);
    }

    for (const child of node.children) {
      this.extractDependenciesRecursive(child, dependencies);
    }
  }

  private calculateNodeComplexity(node: ASTNode): number {
    // Simple complexity calculation based on node structure
    let complexity = 1;

    // Add complexity for control structures
    if (node.type.includes('if') || node.type.includes('for') || node.type.includes('while')) {
      complexity += 2;
    }

    // Add complexity for nested structures
    complexity += node.children.length;

    return complexity;
  }

  private extractPythonVisibility(node: ASTNode): 'public' | 'private' | 'protected' | 'internal' {
    // Python uses naming conventions for visibility
    const name = this.findChildText(node, 'identifier');
    if (!name) return 'public';

    if (name.startsWith('__')) return 'private';
    if (name.startsWith('_')) return 'protected';
    return 'public';
  }

  private extractTypeScriptVisibility(node: ASTNode): 'public' | 'private' | 'protected' | 'internal' {
    // Look for visibility modifiers
    for (const child of node.children) {
      if (child.text === 'private') return 'private';
      if (child.text === 'protected') return 'protected';
      if (child.text === 'public') return 'public';
      if (child.text === 'internal') return 'internal';
    }
    return 'public';
  }

  private extractPythonModuleName(node: ASTNode): string | null {
    // Simplified Python module name extraction
    if (node.type === 'import_statement') {
      const moduleNode = this.findChild(node, 'dotted_name');
      return moduleNode ? moduleNode.text : null;
    }
    if (node.type === 'import_from_statement') {
      return this.findChildText(node, 'dotted_name');
    }
    return null;
  }

  private extractTypeScriptModuleName(node: ASTNode): string | null {
    // Simplified TypeScript module name extraction
    const stringNode = this.findChild(node, 'string');
    return stringNode ? stringNode.text.replace(/['"]/g, '') : null;
  }

  private findChild(node: ASTNode, childType: string): ASTNode | null {
    for (const child of node.children) {
      if (child.type === childType) {
        return child;
      }
    }
    return null;
  }

  private inferArrowFunctionName(node: ASTNode): string | null {
    // Try to infer name from assignment or parent context
    // This is a simplified implementation
    return `arrow_function_${node.startPosition.row}_${node.startPosition.column}`;
  }

  /**
   * Extract import statements from a file for layering analysis
   */
  async extractImports(filePath: string): Promise<ImportStatement[]> {
    const imports: ImportStatement[] = [];

    try {
      // This is a simplified implementation - in production, you'd parse the file
      // and extract actual import statements with proper line/column info

      // For now, we'll create a basic implementation that reads the file
      // and extracts import patterns using regex
      const fs = await import('node:fs');
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Python imports
        const pythonMatch = line.match(/^(import|from)\s+([^\s;]+)/);
        if (pythonMatch) {
          imports.push({
            module: pythonMatch[2],
            source: filePath,
            type: pythonMatch[1] === 'from' ? 'named' : 'namespace',
            symbols: [],
            isDynamic: false,
            line: i + 1,
            column: line.indexOf(pythonMatch[1]) + 1
          });
        }

        // TypeScript/JavaScript imports
        const tsMatch = line.match(/^import\s+(.*?from\s+)?['"`]([^'"`]+)['"`]/);
        if (tsMatch) {
          const importText = tsMatch[1] || '';
          let importType: 'default' | 'named' | 'namespace' | 'side-effect' = 'side-effect';

          if (importText.includes('*')) {
            importType = 'namespace';
          } else if (importText.includes('{')) {
            importType = 'named';
          } else if (importText.trim()) {
            importType = 'default';
          }

          imports.push({
            module: tsMatch[2],
            source: filePath,
            type: importType,
            symbols: [],
            isDynamic: line.includes('import('),
            line: i + 1,
            column: line.indexOf('import') + 1
          });
        }

        // Dynamic imports
        const dynamicMatch = line.match(/import\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (dynamicMatch) {
          imports.push({
            module: dynamicMatch[1],
            source: filePath,
            type: 'named',
            symbols: [],
            isDynamic: true,
            line: i + 1,
            column: line.indexOf('import(') + 1
          });
        }
      }

      logger.debug(`Extracted ${imports.length} import statements from ${filePath}`);
    } catch (error) {
      logger.error(`Failed to extract imports from ${filePath}:`, error);
    }

    return imports;
  }

  /**
   * Get the dependency graph
   */
  getDependencyGraph(): DependencyGraph {
    return this.dependencyGraph;
  }

  /**
   * Get analysis metrics
   */
  getMetrics() {
    const graph = this.dependencyGraph;
    const symbols = graph.getAllSymbols();

    return {
      totalSymbols: symbols.length,
      classes: symbols.filter(s => s.type === 'class').length,
      functions: symbols.filter(s => s.type === 'function').length,
      imports: symbols.filter(s => s.type === 'import').length,
      highComplexity: graph.getHighComplexitySymbols().length,
      tightlyCoupled: graph.getTightlyCoupledSymbols().length,
      lowCohesion: graph.getLowCohesionSymbols().length
    };
  }

  /**
   * Dispose of resources and cleanup
   */
  dispose(): void {
    logger.debug('Disposing symbol extractor resources...');

    // Clear dependency graph
    this.dependencyGraph = new DependencyGraph();

    logger.debug('Symbol extractor disposed successfully');
  }
}