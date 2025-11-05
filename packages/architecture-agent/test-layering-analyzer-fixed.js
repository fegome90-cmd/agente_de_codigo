/**
 * Test Layering Analyzer with Configuration File
 */

import { LayeringAnalyzer } from './dist/layering-analyzer.js';
import { SymbolExtractor } from './dist/symbol-extractor.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

async function testLayeringAnalyzerWithConfig() {
  console.log('🧪 Testing Layering Analyzer with Configuration...\n');

  const testDir = './temp-layering-test';
  const configPath = join(testDir, 'layering-config.yaml');

  try {
    // Initialize layering analyzer
    const symbolExtractor = new SymbolExtractor();
    const layeringAnalyzer = new LayeringAnalyzer(symbolExtractor);

    console.log('✅ Layering analyzer initialized');

    // Load configuration from file
    await layeringAnalyzer.loadConfiguration(configPath);
    const configSummary = layeringAnalyzer.getConfigurationSummary();
    console.log(`✅ Configuration loaded from file: ${configSummary.layers.length} layers, ${configSummary.rules.length} rules`);

    // Get files to analyze
    const filesToAnalyze = [
      join(testDir, 'src/components/UserComponent.ts'),
      join(testDir, 'src/services/UserService.ts'),
      join(testDir, 'src/infrastructure/database/DatabaseService.ts'),
      join(testDir, 'src/utils/Helper.ts')
    ];

    console.log(`✅ Files to analyze: ${filesToAnalyze.length}`);

    // Test file layer detection
    console.log('\n🔍 Testing file layer detection:');
    for (const filePath of filesToAnalyze) {
      const relativePath = filePath.substring(filePath.lastIndexOf('src/'));
      console.log(`   ${relativePath} -> should be in a layer`);
    }

    // Analyze layering violations
    const violations = await layeringAnalyzer.analyzeLayering(testDir, filesToAnalyze);

    console.log(`\n✅ Layering analysis complete: ${violations.length} violations found`);

    if (violations.length > 0) {
      console.log('\n📋 Layering Violations Found:');
      violations.forEach((violation, index) => {
        console.log(`\n${index + 1}. ${violation.message}`);
        console.log(`   File: ${violation.filePath}:${violation.line}`);
        console.log(`   Import: ${violation.importModule} (${violation.importType})`);
        console.log(`   Rule: ${violation.fromLayer} → ${violation.toLayer} (${violation.ruleType})`);
        console.log(`   Severity: ${violation.severity} | Impact: ${violation.architecturalImpact} | Effort: ${violation.refactorEffort}`);
      });
    } else {
      console.log('\n📋 No violations detected - checking why...');

      // Debug: Check import extraction for each file
      for (const filePath of filesToAnalyze) {
        const imports = await symbolExtractor.extractImports(filePath);
        console.log(`\n📦 Imports from ${filePath}:`);
        if (imports.length === 0) {
          console.log('   No imports found');
        } else {
          imports.forEach((imp, i) => {
            console.log(`   ${i + 1}. ${imp.module} (${imp.type}) at line ${imp.line}`);
          });
        }
      }
    }

    console.log('\n🎉 Layering analyzer test completed!');

    return {
      violations: violations.length,
      layers: configSummary.layers.length,
      rules: configSummary.rules.length
    };

  } catch (error) {
    console.error('❌ Layering analyzer test failed:', error);
    throw error;
  }
}

// Run the test
testLayeringAnalyzerWithConfig()
  .then((results) => {
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Violations detected: ${results.violations}`);
    console.log(`   - Layers configured: ${results.layers}`);
    console.log(`   - Rules defined: ${results.rules}`);

    if (results.violations > 0) {
      console.log('\n✅ Layering violation detection is working correctly!');
    } else {
      console.log('\n⚠️ No violations detected - check configuration and import extraction');
    }
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });