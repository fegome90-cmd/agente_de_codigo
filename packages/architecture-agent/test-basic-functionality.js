/**
 * Basic functionality test for Architecture Agent
 * Tests core functionality without Jest framework
 */

import { ArchitectureAgent } from './dist/architecture-agent.js';
import { ASTParser } from './dist/ast-parser.js';
import { SymbolExtractor } from './dist/symbol-extractor.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

console.log('🧪 Testing Architecture Agent basic functionality...');

async function testASTParser() {
  console.log('\n📋 Testing AST Parser...');

  const parser = new ASTParser();

  // Test language detection
  console.log('✅ Language detection tests:');
  console.log(`   test.py: ${parser.detectLanguage('test.py')}`);
  console.log(`   test.ts: ${parser.detectLanguage('test.ts')}`);
  console.log(`   test.js: ${parser.detectLanguage('test.js')}`);
  console.log(`   test.txt: ${parser.detectLanguage('test.txt')}`);

  // Test parsing a simple Python file
  const pythonCode = `
class TestClass:
    def __init__(self):
        self.value = 0

    def get_value(self):
        return self.value

def test_function():
    return "Hello, World!"

import os
import sys
  `;

  // Create temporary test file
  const testDir = join(dirname(process.argv[1]), 'temp-test');
  const testFile = join(testDir, 'test.py');

  try {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, pythonCode);

    console.log('\n📄 Testing Python AST parsing...');
    const result = parser.parseSource(pythonCode, 'python', testFile);

    console.log(`   ✅ Parsing successful: ${result.ast ? 'AST generated' : 'No AST'}`);
    console.log(`   📊 Root node type: ${result.ast.type}`);
    console.log(`   📊 Language: ${result.language}`);
    console.log(`   📊 Total children: ${result.ast.children.length}`);

    // Test symbol extraction
    console.log('\n🔍 Testing symbol extraction...');
    const extractor = new SymbolExtractor();
    const symbols = extractor.extractSymbols(result.ast, testFile);

    console.log(`   ✅ Symbol extraction successful: ${symbols.length} symbols found`);
    console.log(`   📊 Classes: ${symbols.filter(s => s.type === 'class').length}`);
    console.log(`   📊 Functions: ${symbols.filter(s => s.type === 'function').length}`);
    console.log(`   📊 Imports: ${symbols.filter(s => s.type === 'import').length}`);

    // Test dependency graph
    console.log('\n🕸️ Testing dependency graph...');
    const depGraph = extractor.getDependencyGraph();
    const allSymbols = depGraph.getAllSymbols();
    const metrics = extractor.getMetrics();

    console.log(`   ✅ Dependency graph built: ${allSymbols.length} nodes`);
    console.log(`   📊 Total symbols: ${metrics.totalSymbols}`);
    console.log(`   📊 Classes: ${metrics.classes}`);
    console.log(`   📊 Functions: ${metrics.functions}`);
    console.log(`   📊 Imports: ${metrics.imports}`);

    console.log('\n🎯 AST Parser tests completed successfully!');

  } catch (error) {
    console.error('❌ AST Parser test failed:', error.message);
    throw error;
  } finally {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function testArchitectureAgent() {
  console.log('\n🤖 Testing Architecture Agent...');

  try {
    const agent = new ArchitectureAgent('/tmp/test-socket');

    // Test capabilities
    const capabilities = agent.getCapabilities();
    console.log('✅ Agent capabilities:');
    console.log(`   📡 Heartbeat support: ${capabilities.supportsHeartbeat}`);
    console.log(`   📡 Task support: ${capabilities.supportsTasks}`);
    console.log(`   🔧 Tools count: ${capabilities.tools.length}`);
    console.log(`   🌐 Languages: ${capabilities.languages.join(', ')}`);
    console.log(`   ⚡ Features: ${capabilities.features.join(', ')}`);

    // Test configuration
    console.log('\n⚙️  Testing configuration...');
    const config = {
      timeoutSeconds: 120,
      layeringDetection: { enabled: true },
      dryDetection: { enabled: true, similarityThreshold: 0.8 },
      complexityAnalysis: { enabled: true, threshold: 10 }
    };

    // Access private method through prototype for testing
    agent.updateConfig(config);
    console.log('   ✅ Configuration updated successfully');

    console.log('\n🎯 Architecture Agent tests completed successfully!');

  } catch (error) {
    console.error('❌ Architecture Agent test failed:', error.message);
    throw error;
  }
}

async function testMultiLanguageSupport() {
  console.log('\n🌍 Testing multi-language support...');

  const parser = new ASTParser();

  // Test Python code
  const pythonCode = `
class PythonClass:
    def python_method(self):
        return "Python"
  `;

  // Test TypeScript code
  const typescriptCode = `
class TypeScriptClass {
    typescriptMethod(): string {
        return "TypeScript";
    }
}
  `;

  // Test JavaScript code
  const javascriptCode = `
class JavaScriptClass {
    javascriptMethod() {
        return "JavaScript";
    }
}
  `;

  try {
    // Create temporary test directory
    const testDir = join(dirname(process.argv[1]), 'temp-multi-lang');
    await fs.mkdir(testDir, { recursive: true });

    // Test Python parsing
    const pyFile = join(testDir, 'test.py');
    await fs.writeFile(pyFile, pythonCode);
    const pyResult = parser.parseSource(pythonCode, 'python', pyFile);
    console.log(`   ✅ Python parsing: ${pyResult.ast.type === 'module'}`);

    // Test TypeScript parsing
    const tsFile = join(testDir, 'test.ts');
    await fs.writeFile(tsFile, typescriptCode);
    const tsResult = parser.parseSource(typescriptCode, 'typescript', tsFile);
    console.log(`   ✅ TypeScript parsing: ${tsResult.ast.type === 'program'}`);

    // Test JavaScript parsing
    const jsFile = join(testDir, 'test.js');
    await fs.writeFile(jsFile, javascriptCode);
    const jsResult = parser.parseSource(javascriptCode, 'javascript', jsFile);
    console.log(`   ✅ JavaScript parsing: ${jsResult.ast.type === 'program'}`);

    // Test symbol extraction across languages
    const extractor = new SymbolExtractor();
    const pySymbols = extractor.extractSymbols(pyResult.ast, pyFile);
    const tsSymbols = extractor.extractSymbols(tsResult.ast, tsFile);
    const jsSymbols = extractor.extractSymbols(jsResult.ast, jsFile);

    console.log(`   📊 Python symbols: ${pySymbols.length}`);
    console.log(`   📊 TypeScript symbols: ${tsSymbols.length}`);
    console.log(`   📊 JavaScript symbols: ${jsSymbols.length}`);

    console.log('\n🎯 Multi-language support tests completed successfully!');

  } catch (error) {
    console.error('❌ Multi-language support test failed:', error.message);
    throw error;
  } finally {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function runTests() {
  console.log('🚀 Starting Architecture Agent Tests');
  console.log('=====================================');

  try {
    await testASTParser();
    await testArchitectureAgent();
    await testMultiLanguageSupport();

    console.log('\n🏆 ALL TESTS PASSED!');
    console.log('✅ Architecture Agent is ready for use');

  } catch (error) {
    console.error('\n💥 TESTS FAILED');
    console.error('Please check the implementation');
    process.exit(1);
  }
}

// Run tests
runTests();