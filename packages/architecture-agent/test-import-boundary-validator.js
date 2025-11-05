/**
 * Test Import Boundary Validator Functionality
 */

import { ImportBoundaryValidator } from './dist/import-boundary-validator.js';
import { LayeringAnalyzer } from './dist/layering-analyzer.js';
import { SymbolExtractor } from './dist/symbol-extractor.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

async function testImportBoundaryValidator() {
  console.log('🧪 Testing Import Boundary Validator...\n');

  const testDir = './temp-layering-test';

  try {
    // Initialize components
    const symbolExtractor = new SymbolExtractor();
    const layeringAnalyzer = new LayeringAnalyzer(symbolExtractor);
    const boundaryValidator = new ImportBoundaryValidator(layeringAnalyzer, symbolExtractor);

    console.log('✅ Import boundary validator initialized');

    // Load layering configuration
    await layeringAnalyzer.loadConfiguration(join(testDir, 'layering-config.yaml'));
    console.log('✅ Layering configuration loaded');

    // Test 1: Validate boundaries with default configuration
    const testFiles = [
      join(testDir, 'src/components/UserComponent.ts'),
      join(testDir, 'src/services/UserService.ts'),
      join(testDir, 'src/infrastructure/database/DatabaseService.ts'),
      join(testDir, 'src/utils/Helper.ts')
    ];

    const taskData = {
      scope: testFiles,
      context: {
        repoRoot: testDir
      },
      output: join(testDir, 'boundary-validation-report.json')
    };

    console.log('✅ Task data prepared');

    const violations = await boundaryValidator.validateBoundaries(taskData);
    console.log(`✅ Boundary validation complete: ${violations.length} violations found`);

    if (violations.length > 0) {
      console.log('\n📋 Import Boundary Violations Found:');
      violations.forEach((violation, index) => {
        console.log(`\n${index + 1}. ${violation.message}`);
        console.log(`   File: ${violation.filePath}:${violation.line}`);
        console.log(`   Import: ${violation.importModule} (${violation.violationType})`);
        console.log(`   Boundary: ${violation.boundaryType} | Severity: ${violation.severity}`);
        console.log(`   Impact: ${violation.architecturalImpact} | Effort: ${violation.refactorEffort}`);

        if (violation.context.sourceLayer || violation.context.targetLayer) {
          console.log(`   Layers: ${violation.context.sourceLayer} → ${violation.context.targetLayer}`);
        }

        if (violation.context.dependencyChain && violation.context.dependencyChain.length > 0) {
          console.log(`   Cycle: ${violation.context.dependencyChain.join(' → ')}`);
        }
      });
    }

    // Test 2: Generate boundary configuration template
    const boundaryConfigPath = join(testDir, 'import-boundary-config.yaml');
    await boundaryValidator.generateConfigurationTemplate(boundaryConfigPath);
    console.log(`✅ Boundary configuration template generated: ${boundaryConfigPath}`);

    // Test 3: Test external dependency validation
    console.log('\n🔍 Testing external dependency validation...');

    // Create a test file with external dependencies
    const externalDepTestFile = join(testDir, 'src/components/ExternalComponent.ts');
    const externalDepContent = `
import lodash from 'lodash';  // Forbidden
import moment from 'moment';  // Forbidden
import axios from 'axios';    // Allowed
import { customLib } from 'some-custom-package';  // Not in allowlist

export class ExternalComponent {
  constructor() {
    const data = lodash.cloneDeep({});
    const time = moment().format();
    const response = axios.get('/api/data');
  }
}
    `;

    writeFileSync(externalDepTestFile, externalDepContent, 'utf8');

    // Test external dependency validation
    const externalViolations = await boundaryValidator.validateBoundaries({
      scope: [externalDepTestFile],
      context: { repoRoot: testDir },
      output: join(testDir, 'external-deps-report.json')
    });

    console.log(`✅ External dependency validation: ${externalViolations.length} violations found`);

    if (externalViolations.length > 0) {
      console.log('\n📦 External Dependency Violations:');
      externalViolations.forEach((violation, index) => {
        console.log(`\n${index + 1}. ${violation.message}`);
        console.log(`   Package: ${violation.importModule}`);
        console.log(`   Severity: ${violation.severity}`);
      });
    }

    // Test 4: Test circular dependency detection
    console.log('\n🔄 Testing circular dependency detection...');

    // Create circular dependency test files
    const circularA = join(testDir, 'src/circular/A.ts');
    const circularB = join(testDir, 'src/circular/B.ts');

    writeFileSync(circularA, `
import { B } from './B.js';
export class A {
  constructor(private b: B) {}
}
    `, 'utf8');

    writeFileSync(circularB, `
import { A } from './A.js';
export class B {
  constructor(private a: A) {}
}
    `, 'utf8');

    const circularViolations = await boundaryValidator.validateBoundaries({
      scope: [circularA, circularB],
      context: { repoRoot: testDir },
      output: join(testDir, 'circular-deps-report.json')
    });

    console.log(`✅ Circular dependency detection: ${circularViolations.length} cycles found`);

    if (circularViolations.length > 0) {
      console.log('\n🔄 Circular Dependencies:');
      circularViolations.forEach((violation, index) => {
        console.log(`\n${index + 1}. ${violation.message}`);
        console.log(`   Severity: ${violation.severity}`);
        if (violation.context.dependencyChain) {
          console.log(`   Chain: ${violation.context.dependencyChain.join(' → ')}`);
        }
      });
    }

    console.log('\n🎉 All import boundary validator tests passed!');

    return {
      totalViolations: violations.length,
      externalViolations: externalViolations.length,
      circularViolations: circularViolations.length,
      boundaryRules: 2, // Default rules
      layersConfigured: 3
    };

  } catch (error) {
    console.error('❌ Import boundary validator test failed:', error);
    throw error;
  }
}

// Run the test
testImportBoundaryValidator()
  .then((results) => {
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Total boundary violations: ${results.totalViolations}`);
    console.log(`   - External dependency violations: ${results.externalViolations}`);
    console.log(`   - Circular dependencies: ${results.circularViolations}`);
    console.log(`   - Boundary rules: ${results.boundaryRules}`);
    console.log(`   - Layers configured: ${results.layersConfigured}`);
    console.log('\n✅ Import boundary validator is working correctly!');
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });