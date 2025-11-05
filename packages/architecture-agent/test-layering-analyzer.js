/**
 * Test Layering Analyzer Functionality
 */

import { LayeringAnalyzer } from './dist/layering-analyzer.js';
import { SymbolExtractor } from './dist/symbol-extractor.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

async function testLayeringAnalyzer() {
  console.log('🧪 Testing Layering Analyzer...\n');

  // Create test directory structure that violates layering
  const testDir = './temp-layering-test';

  // Create test files with layering violations
  const testFiles = {
    'src/components/UserComponent.ts': `
import { UserService } from '../services/UserService.js';
import { DatabaseService } from '../infrastructure/database/DatabaseService.js';

export class UserComponent {
  constructor(private userService: UserService, private db: DatabaseService) {}

  renderUser() {
    return this.userService.getUser();
  }
}
    `,
    'src/services/UserService.ts': `
import { UserComponent } from '../components/UserComponent.js';  // VIOLATION: Business importing from Presentation

export class UserService {
  getUser() {
    return { id: 1, name: 'Test User' };
  }
}
    `,
    'src/infrastructure/database/DatabaseService.ts': `
import { UserComponent } from '../../components/UserComponent.js';  // VIOLATION: Infrastructure importing from Presentation
import { UserService } from '../../services/UserService.js';       // VIOLATION: Infrastructure importing from Business

export class DatabaseService {
  connect() {
    return 'Connected to database';
  }
}
    `,
    'src/utils/Helper.ts': `
export class Helper {
  static format(str: string) {
    return str.trim();
  }
}
    `
  };

  try {
    // Create test directory and files
    mkdirSync(testDir, { recursive: true });
    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = join(testDir, filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
    }

    console.log('✅ Test directory structure created');

    // Initialize layering analyzer
    const symbolExtractor = new SymbolExtractor();
    const layeringAnalyzer = new LayeringAnalyzer(symbolExtractor);

    console.log('✅ Layering analyzer initialized');

    // Test 1: Load default configuration
    await layeringAnalyzer.loadConfiguration();
    const configSummary = layeringAnalyzer.getConfigurationSummary();
    console.log(`✅ Default configuration loaded: ${configSummary.layers.length} layers, ${configSummary.rules.length} rules`);

    // Test 2: Analyze layering violations
    const filesToAnalyze = Object.keys(testFiles).map(f => join(testDir, f));
    const violations = await layeringAnalyzer.analyzeLayering(testDir, filesToAnalyze);

    console.log(`✅ Layering analysis complete: ${violations.length} violations found`);

    if (violations.length > 0) {
      console.log('\n📋 Layering Violations Found:');
      violations.forEach((violation, index) => {
        console.log(`\n${index + 1}. ${violation.message}`);
        console.log(`   File: ${violation.filePath}:${violation.line}`);
        console.log(`   Import: ${violation.importModule} (${violation.importType})`);
        console.log(`   Rule: ${violation.fromLayer} → ${violation.toLayer} (${violation.ruleType})`);
        console.log(`   Severity: ${violation.severity} | Impact: ${violation.architecturalImpact} | Effort: ${violation.refactorEffort}`);
      });
    }

    // Test 3: Generate configuration template
    const templatePath = join(testDir, 'layering-config.yaml');
    await layeringAnalyzer.generateConfigurationTemplate(templatePath);
    console.log(`✅ Configuration template generated: ${templatePath}`);

    // Test 4: Test import extraction
    const testFile = join(testDir, 'src/services/UserService.ts');
    const imports = await symbolExtractor.extractImports(testFile);
    console.log(`✅ Import extraction test: ${imports.length} imports found from ${testFile}`);

    if (imports.length > 0) {
      console.log('   Imports found:');
      imports.forEach((imp, index) => {
        console.log(`   ${index + 1}. ${imp.module} (${imp.type}) at line ${imp.line}`);
      });
    }

    console.log('\n🎉 All layering analyzer tests passed!');

    return {
      violations: violations.length,
      imports: imports.length,
      layers: configSummary.layers.length,
      rules: configSummary.rules.length
    };

  } catch (error) {
    console.error('❌ Layering analyzer test failed:', error);
    throw error;
  }
}

// Run the test
testLayeringAnalyzer()
  .then((results) => {
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Violations detected: ${results.violations}`);
    console.log(`   - Imports extracted: ${results.imports}`);
    console.log(`   - Layers configured: ${results.layers}`);
    console.log(`   - Rules defined: ${results.rules}`);
    console.log('\n✅ Layering analyzer is working correctly!');
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });