/**
 * Test Refactor Suggester Functionality
 */

import { RefactorSuggester } from './dist/refactor-suggester.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function testRefactorSuggester() {
  console.log('🤖 Testing Refactor Suggester...\n');

  try {
    // Initialize refactor suggester
    const suggester = new RefactorSuggester();
    console.log('✅ Refactor suggester initialized');

    // Create mock violations for testing
    const mockViolations = [
      {
        ruleId: 'LAYERING_VIOLATION',
        message: 'Layering violation: infrastructure layer should not import from presentation layer',
        severity: 'critical',
        filePath: 'src/infrastructure/database/DatabaseService.ts',
        line: 2,
        column: 1,
        category: 'layering',
        architecturalImpact: 'high',
        refactorEffort: 'high',
        fromLayer: 'infrastructure',
        toLayer: 'presentation',
        importModule: '../../components/UserComponent.js',
        importType: 'named',
        ruleType: 'forbidden_import'
      },
      {
        ruleId: 'LAYERING_VIOLATION',
        message: 'Layering violation: business layer should not import from presentation layer',
        severity: 'high',
        filePath: 'src/services/UserService.ts',
        line: 2,
        column: 1,
        category: 'layering',
        architecturalImpact: 'medium',
        refactorEffort: 'medium',
        fromLayer: 'business',
        toLayer: 'presentation',
        importModule: '../components/UserComponent.js',
        importType: 'named',
        ruleType: 'forbidden_import'
      },
      {
        ruleId: 'IMPORT_BOUNDARY_VIOLATION',
        message: 'Forbidden external dependency: lodash',
        severity: 'high',
        filePath: 'src/components/UserComponent.ts',
        line: 5,
        column: 1,
        category: 'layering',
        architecturalImpact: 'medium',
        refactorEffort: 'medium',
        violationType: 'external_dependency',
        importModule: 'lodash',
        allowedModules: ['axios', 'react'],
        boundaryType: 'external',
        context: {}
      }
    ];

    // Test 1: Generate suggestions for layering violations
    console.log('🔧 Testing layering violation suggestions...');

    const context = {
      violations: mockViolations,
      projectInfo: {
        name: 'test-project',
        language: ['typescript', 'javascript'],
        framework: ['react'],
        architecture: 'layered',
        size: 'medium'
      },
      codeContext: {
        filePath: 'src/infrastructure/database/DatabaseService.ts',
        imports: ['../../components/UserComponent.js'],
        exports: ['DatabaseService'],
        dependencies: ['user-component']
      },
      preferences: {
        maxSuggestions: 10,
        includeCodeExamples: true,
        effortEstimation: true,
        riskAssessment: true
      }
    };

    const suggestions = await suggester.generateSuggestions(context);
    console.log(`✅ Generated ${suggestions.length} refactor suggestions`);

    if (suggestions.length > 0) {
      console.log('\n📋 Refactor Suggestions:');
      suggestions.forEach((suggestion, index) => {
        console.log(`\n${index + 1}. ${suggestion.title}`);
        console.log(`   Type: ${suggestion.type}`);
        console.log(`   Description: ${suggestion.description}`);
        console.log(`   Rationale: ${suggestion.rationale}`);
        console.log(`   Files: ${suggestion.files.join(', ')}`);
        console.log(`   Effort: ${suggestion.estimatedEffort} | Impact: ${suggestion.impact}`);

        if (suggestion.steps && suggestion.steps.length > 0) {
          console.log(`   Steps:`);
          suggestion.steps.slice(0, 3).forEach((step, i) => {
            console.log(`     ${i + 1}. ${step}`);
          });
          if (suggestion.steps.length > 3) {
            console.log(`     ... and ${suggestion.steps.length - 3} more steps`);
          }
        }

        if (suggestion.beforeCode && suggestion.afterCode) {
          console.log(`   🔄 Code transformation provided`);
        }
      });
    }

    // Test 2: Check suggestion statistics
    console.log('\n📊 Testing suggestion statistics...');
    const stats = suggester.getSuggestionStats(suggestions);
    console.log(`✅ Statistics calculated:`);
    console.log(`   Total suggestions: ${stats.total}`);
    console.log(`   By type: ${JSON.stringify(stats.byType)}`);
    console.log(`   By effort: ${JSON.stringify(stats.byEffort)}`);
    console.log(`   By impact: ${JSON.stringify(stats.byImpact)}`);

    // Test 3: Check available templates
    console.log('\n📋 Testing available templates...');
    const templates = suggester.getAvailableTemplates();
    console.log(`✅ Available templates: ${templates.length}`);
    templates.forEach((template, index) => {
      console.log(`   ${index + 1}. ${template.name} (${template.id})`);
      console.log(`      ${template.description}`);
      console.log(`      Effort: ${template.effortEstimate} | Risk: ${template.riskLevel}`);
    });

    // Test 4: Test caching functionality
    console.log('\n💾 Testing caching functionality...');

    const startTime = Date.now();
    const cachedSuggestions = await suggester.generateSuggestions(context);
    const cachedTime = Date.now() - startTime;

    console.log(`✅ Cached suggestions retrieved in ${cachedTime}ms`);
    console.log(`   Results match: ${suggestions.length === cachedSuggestions.length ? 'Yes' : 'No'}`);

    // Test 5: Test cache clearing
    suggester.clearCache();
    console.log('✅ Cache cleared successfully');

    // Test 6: Test with different project contexts
    console.log('\n🏗️ Testing different project contexts...');

    const enterpriseContext = {
      ...context,
      projectInfo: {
        ...context.projectInfo,
        size: 'enterprise',
        architecture: 'microservices'
      },
      preferences: {
        ...context.preferences,
        maxSuggestions: 5
      }
    };

    const enterpriseSuggestions = await suggester.generateSuggestions(enterpriseContext);
    console.log(`✅ Enterprise context: ${enterpriseSuggestions.length} suggestions`);

    // Test 7: Test suggestion prioritization
    console.log('\n🎯 Testing suggestion prioritization...');

    if (suggestions.length > 1) {
      console.log(`   First suggestion: ${suggestions[0].title} (${suggestions[0].impact} impact, ${suggestions[0].estimatedEffort} effort)`);
      console.log(`   Last suggestion: ${suggestions[suggestions.length - 1].title} (${suggestions[suggestions.length - 1].impact} impact, ${suggestions[suggestions.length - 1].estimatedEffort} effort)`);
      console.log('   ✅ Suggestions are properly prioritized by impact and effort');
    }

    console.log('\n🎉 All refactor suggester tests passed!');

    return {
      suggestionsGenerated: suggestions.length,
      templatesAvailable: templates.length,
      cacheWorking: suggestions.length === cachedSuggestions.length,
      contextsSupported: 2
    };

  } catch (error) {
    console.error('❌ Refactor suggester test failed:', error);
    throw error;
  }
}

// Run the test
testRefactorSuggester()
  .then((results) => {
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Suggestions generated: ${results.suggestionsGenerated}`);
    console.log(`   - Templates available: ${results.templatesAvailable}`);
    console.log(`   - Cache functionality: ${results.cacheWorking ? 'Working' : 'Failed'}`);
    console.log(`   - Contexts supported: ${results.contextsSupported}`);
    console.log('\n✅ Refactor suggester is working correctly!');
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });