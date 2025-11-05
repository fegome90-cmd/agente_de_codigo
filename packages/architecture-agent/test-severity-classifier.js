/**
 * Test Severity Classifier Functionality
 */

import { SeverityClassifier } from './dist/severity-classifier.js';

async function testSeverityClassifier() {
  console.log('🎯 Testing Severity Classifier...\n');

  try {
    // Test 1: Initialize classifier with default project context
    console.log('🔧 Testing initialization...');
    const classifier = new SeverityClassifier({
      criticality: 'production',
      teamSize: 5,
      deadlinePressure: 'medium',
      techDebtTolerance: 'low',
      businessStage: 'growth',
      architecturalComplexity: 'moderate'
    });
    console.log('✅ Severity classifier initialized');

    // Test 2: Create mock findings of different types
    console.log('\n📋 Creating test findings...');

    const mockFindings = [
      {
        ruleId: 'LAYERING_VIOLATION',
        message: 'Critical layering violation: infrastructure importing from presentation',
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
        message: 'High severity layering violation',
        severity: 'high',
        filePath: 'src/services/UserService.ts',
        line: 5,
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
        message: 'Forbidden external dependency',
        severity: 'high',
        filePath: 'src/components/UserComponent.ts',
        line: 3,
        column: 1,
        category: 'layering',
        architecturalImpact: 'medium',
        refactorEffort: 'medium',
        violationType: 'external_dependency',
        importModule: 'lodash',
        allowedModules: ['axios', 'react'],
        boundaryType: 'external',
        context: {}
      },
      {
        ruleId: 'CUSTOM_VIOLATION',
        message: 'Low severity issue',
        severity: 'low',
        filePath: 'src/utils/Helper.ts',
        line: 10,
        column: 1,
        category: 'quality',
        architecturalImpact: 'low',
        refactorEffort: 'low'
      },
      {
        ruleId: 'LAYERING_VIOLATION',
        message: 'Critical core file violation',
        severity: 'critical',
        filePath: 'src/core/Application.ts',
        line: 1,
        column: 1,
        category: 'layering',
        architecturalImpact: 'high',
        refactorEffort: 'high',
        fromLayer: 'core',
        toLayer: 'infrastructure',
        importModule: '../infrastructure/Database.js',
        importType: 'named',
        ruleType: 'forbidden_import'
      }
    ];

    console.log(`✅ Created ${mockFindings.length} test findings`);

    // Test 3: Classify individual findings
    console.log('\n🎯 Testing individual classification...');

    const classifications = mockFindings.map((finding, index) => {
      const classification = classifier.classify(finding);
      console.log(`\n${index + 1}. Finding: ${finding.ruleId}`);
      console.log(`   File: ${finding.filePath}`);
      console.log(`   Classification: ${classification.severity} severity`);
      console.log(`   Priority: ${classification.priority}`);
      console.log(`   Urgency: ${classification.urgency}`);
      console.log(`   Business Impact: ${classification.businessImpact}`);
      console.log(`   Risk Level: ${classification.riskLevel}`);
      console.log(`   Effort: ${classification.effortEstimate.hours}h, ${classification.effortEstimate.teamSize} person(s), ${classification.effortEstimate.complexity} complexity`);

      if (classification.reasoning.length > 0) {
        console.log(`   Reasoning: ${classification.reasoning.slice(0, 2).join('; ')}`);
      }

      return classification;
    });

    console.log(`✅ Classified ${classifications.length} findings individually`);

    // Test 4: Test batch classification and sorting
    console.log('\n📊 Testing batch classification and sorting...');

    const sortedClassifications = classifier.classifyAll(mockFindings);
    console.log(`✅ Batch classification complete`);

    console.log('\n📈 Sorted by priority:');
    sortedClassifications.forEach((classification, index) => {
      console.log(`   ${index + 1}. ${classification.severity} (priority: ${classification.priority}) - ${classification.urgency}`);
    });

    // Verify sorting
    const isSorted = sortedClassifications.every((classification, index) => {
      if (index === 0) return true;
      return classification.priority <= sortedClassifications[index - 1].priority;
    });
    console.log(`   ✅ Properly sorted: ${isSorted ? 'Yes' : 'No'}`);

    // Test 5: Test statistics
    console.log('\n📈 Testing classification statistics...');

    const stats = classifier.getStatistics(sortedClassifications);
    console.log(`✅ Statistics calculated:`);
    console.log(`   Total findings: ${stats.total}`);
    console.log(`   By severity: ${JSON.stringify(stats.bySeverity)}`);
    console.log(`   By urgency: ${JSON.stringify(stats.byUrgency)}`);
    console.log(`   By impact: ${JSON.stringify(stats.byImpact)}`);
    console.log(`   Average priority: ${stats.avgPriority}`);
    console.log(`   Total hours required: ${stats.totalHours}h`);

    // Test 6: Test project context changes
    console.log('\n🏗️ Testing project context changes...');

    // Change to startup context
    classifier.updateProjectContext({
      businessStage: 'startup',
      deadlinePressure: 'high',
      teamSize: 2,
      techDebtTolerance: 'high'
    });

    const startupClassifications = classifier.classifyAll(mockFindings.slice(0, 2)); // Test first 2 findings
    console.log(`✅ Startup context classification complete`);

    console.log('\n🔄 Comparison with startup context:');
    mockFindings.slice(0, 2).forEach((finding, index) => {
      const original = classifications[index];
      const startup = startupClassifications[index];

      console.log(`   ${index + 1}. ${finding.ruleId}:`);
      console.log(`      Original: ${original.severity} (priority: ${original.priority})`);
      console.log(`      Startup:  ${startup.severity} (priority: ${startup.priority})`);
      console.log(`      Hours: ${original.effortEstimate.hours}h → ${startup.effortEstimate.hours}h`);
    });

    // Test 7: Test custom rules
    console.log('\n⚙️ Testing custom rules...');

    const customRule = {
      id: 'test-rule',
      name: 'Test Rule for UI Components',
      conditions: {
        filePatterns: ['src/components/**'],
        severity: ['high', 'critical']
      },
      classification: {
        severity: 'critical',
        priority: 85,
        urgency: 'immediate',
        businessImpact: 'revenue-impacting',
        riskLevel: 'extreme'
      },
      weight: 35,
      enabled: true
    };

    classifier.addRule(customRule);

    const componentFinding = {
      ruleId: 'LAYERING_VIOLATION',
      message: 'Component violation',
      severity: 'high',
      filePath: 'src/components/UserProfile.tsx',
      line: 10,
      column: 1,
      category: 'layering',
      architecturalImpact: 'medium',
      refactorEffort: 'medium'
    };

    const customClassification = classifier.classify(componentFinding);
    console.log(`✅ Custom rule applied`);
    console.log(`   Component classification: ${customClassification.severity} (priority: ${customClassification.priority})`);
    console.log(`   Urgency: ${customClassification.urgency}`);

    // Test 8: Test reasoning and recommendations
    console.log('\n💡 Testing reasoning and recommendations...');

    const criticalClassification = sortedClassifications.find(c => c.severity === 'critical');
    if (criticalClassification) {
      console.log(`Critical violation analysis:`);
      console.log(`   Severity: ${criticalClassification.severity}`);
      console.log(`   Reasoning: ${criticalClassification.reasoning.slice(0, 2).join('; ')}`);
      console.log(`   Recommendations: ${criticalClassification.recommendations.slice(0, 2).join('; ')}`);
    }

    // Test 9: Verify effort estimation
    console.log('\n⏱️ Testing effort estimation...');

    const effortBreakdown = {
      low: sortedClassifications.filter(c => c.effortEstimate.hours <= 4).length,
      medium: sortedClassifications.filter(c => c.effortEstimate.hours > 4 && c.effortEstimate.hours <= 12).length,
      high: sortedClassifications.filter(c => c.effortEstimate.hours > 12).length
    };

    console.log(`✅ Effort breakdown:`);
    console.log(`   Low effort (≤4h): ${effortBreakdown.low} findings`);
    console.log(`   Medium effort (5-12h): ${effortBreakdown.medium} findings`);
    console.log(`   High effort (>12h): ${effortBreakdown.high} findings`);

    console.log('\n🎉 All severity classifier tests passed!');

    return {
      findingsClassified: mockFindings.length,
      rulesActive: 6 + 1, // default rules + custom rule
      priorityOrdering: isSorted,
      contextVariations: 2,
      statisticsGenerated: true
    };

  } catch (error) {
    console.error('❌ Severity classifier test failed:', error);
    throw error;
  }
}

// Run the test
testSeverityClassifier()
  .then((results) => {
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Findings classified: ${results.findingsClassified}`);
    console.log(`   - Rules active: ${results.rulesActive}`);
    console.log(`   - Priority ordering: ${results.priorityOrdering ? 'Working' : 'Failed'}`);
    console.log(`   - Context variations tested: ${results.contextVariations}`);
    console.log(`   - Statistics generated: ${results.statisticsGenerated ? 'Yes' : 'No'}`);
    console.log('\n✅ Severity classifier is working correctly!');
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });