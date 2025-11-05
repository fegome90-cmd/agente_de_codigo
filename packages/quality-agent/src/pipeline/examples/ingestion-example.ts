/**
 * SARIF Ingestion Layer - Usage Example
 *
 * Demonstrates how to use the Capa 1: Ingesta for validating
 * and normalizing SARIF reports from multiple agents.
 */

import { SARIFIngestionLayer } from '../ingestion-layer.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function runIngestionExample() {
  console.log('=== SARIF Ingestion Layer - Capa 1: Ingesta ===\n');

  const ingestionLayer = new SARIFIngestionLayer();

  // Example 1: Single agent SARIF report
  console.log('Example 1: Quality Agent SARIF Report\n');
  const singleAgentSarif = {
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'quality-agent',
            version: '1.0.0',
            rules: [
              {
                id: 'no-unused-vars',
                name: 'Unused Variables',
                shortDescription: { text: 'Variable is defined but never used' },
                defaultConfiguration: { level: 'warning' },
                properties: {
                  category: 'best-practices',
                },
              },
              {
                id: 'max-lines',
                name: 'Max Lines',
                shortDescription: { text: 'File exceeds maximum number of lines' },
                defaultConfiguration: { level: 'error' },
                properties: {
                  category: 'complexity',
                },
              },
            ],
          },
        },
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: new Date().toISOString(),
            exitCode: 0,
          },
        ],
        artifacts: [
          {
            location: { uri: 'src/index.ts' },
            roles: ['analysisTarget'],
            mimeType: 'text/typescript',
          },
          {
            location: { uri: 'src/utils.ts' },
            roles: ['analysisTarget'],
            mimeType: 'text/typescript',
          },
        ],
        results: [
          {
            ruleId: 'no-unused-vars',
            level: 'warning',
            message: {
              text: 'unused parameter \'config\'',
              markdown: 'The parameter `config` is defined but never used',
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/index.ts' },
                  region: {
                    startLine: 5,
                    startColumn: 10,
                    endLine: 5,
                    endColumn: 16,
                  },
                },
              },
            ],
            properties: {
              effort: 'low',
            },
          },
          {
            ruleId: 'max-lines',
            level: 'error',
            message: {
              text: 'File has 520 lines, exceeds maximum of 500',
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/utils.ts' },
                  region: {
                    startLine: 1,
                    startColumn: 1,
                    endLine: 520,
                    endColumn: 1,
                  },
                },
              },
            ],
            fix: {
              description: { text: 'Split file into smaller modules' },
              artifactChanges: [
                {
                  artifactLocation: { uri: 'src/utils.ts' },
                  replacements: [
                    {
                      deletedRegion: {
                        startLine: 1,
                        startColumn: 1,
                        endLine: 520,
                        endColumn: 1,
                      },
                    },
                  ],
                },
              ],
            },
            properties: {
              effort: 'high',
            },
          },
        ],
      },
    ],
  };

  const result1 = await ingestionLayer.ingest(JSON.stringify(singleAgentSarif), ['src/index.ts', 'src/utils.ts']);

  console.log('Validation Result:', result1.isValid ? '✅ PASSED' : '❌ FAILED');
  console.log('Schema Version:', result1.schemaVersion);
  console.log('Processing Time:', `${result1.metadata.validationTime}ms`);
  console.log('\nSummary:');
  console.log('  Total Runs:', result1.summary.totalRuns);
  console.log('  Total Findings:', result1.summary.totalFindings);
  console.log('  Total Rules:', result1.summary.totalRules);
  console.log('\nSeverity Breakdown:');
  console.log('  Critical:', result1.summary.severityBreakdown.critical);
  console.log('  High:', result1.summary.severityBreakdown.high);
  console.log('  Medium:', result1.summary.severityBreakdown.medium);
  console.log('  Low:', result1.summary.severityBreakdown.low);
  console.log('\nNormalized Findings:');
  if (result1.runs[0]?.results) {
    result1.runs[0].results.forEach((finding, idx) => {
      console.log(`  ${idx + 1}. ${finding.ruleId} (${finding.severity})`);
      console.log(`     ${finding.message}`);
      console.log(`     File: ${finding.filePath}:${finding.line ?? 'N/A'}`);
      console.log(`     Fixable: ${finding.fixable ? 'Yes' : 'No'}`);
    });
  }

  // Example 2: Multi-agent SARIF report
  console.log('\n\nExample 2: Multi-Agent SARIF Report\n');
  const multiAgentSarif = {
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'security-agent', rules: [] } },
        invocations: [{ executionSuccessful: true }],
        results: [
          {
            ruleId: 'sql-injection',
            level: 'error',
            message: { text: 'Potential SQL injection vulnerability' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/db.ts' },
                  region: { startLine: 25 },
                },
              },
            ],
          },
        ],
      },
      {
        tool: { driver: { name: 'quality-agent', rules: [] } },
        invocations: [{ executionSuccessful: true }],
        results: [
          {
            ruleId: 'no-console',
            level: 'warning',
            message: { text: 'Console statement found' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/logger.ts' },
                  region: { startLine: 10 },
                },
              },
            ],
          },
        ],
      },
      {
        tool: { driver: { name: 'documentation-agent', rules: [] } },
        invocations: [{ executionSuccessful: true }],
        results: [
          {
            ruleId: 'missing-docstring',
            level: 'note',
            message: { text: 'Function is missing a docstring' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/utils.ts' },
                  region: { startLine: 5 },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const result2 = await ingestionLayer.ingest(JSON.stringify(multiAgentSarif));

  console.log('Validation Result:', result2.isValid ? '✅ PASSED' : '❌ FAILED');
  console.log('\nAgent Breakdown:');
  Object.entries(result2.summary.agentBreakdown).forEach(([agent, count]) => {
    console.log(`  ${agent}: ${count} findings`);
  });
  console.log('\nTool Breakdown:');
  Object.entries(result2.summary.toolBreakdown).forEach(([tool, info]) => {
    console.log(`  ${tool}: ${info.count} findings (version: ${info.version || 'unknown'})`);
  });

  // Example 3: Invalid SARIF (error handling)
  console.log('\n\nExample 3: Invalid SARIF Report\n');
  const invalidSarif = {
    version: '2.1.0',
    runs: [
      {
        // Missing required 'tool' property
        results: [],
      },
    ],
  };

  const result3 = await ingestionLayer.ingest(JSON.stringify(invalidSarif));

  console.log('Validation Result:', result3.isValid ? '✅ PASSED' : '❌ FAILED');
  console.log('Errors:', result3.errors.length);
  result3.errors.forEach((error, idx) => {
    console.log(`  ${idx + 1}. ${error}`);
  });

  // Example 4: Using with real SARIF file
  console.log('\n\nExample 4: Loading SARIF from File\n');
  try {
    // This would load a real SARIF file if it exists
    // const sarifContent = readFileSync('reports/quality-report.sarif', 'utf-8');
    // const result = await ingestionLayer.ingest(sarifContent, ['src/']);
    // console.log('Loaded SARIF from file:', result.summary.totalFindings, 'findings');
    console.log('  (This example requires an existing SARIF file)');
  } catch (error) {
    console.log('  File not found or inaccessible');
  }

  console.log('\n=== Ingestion Complete ===\n');
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestionExample().catch(console.error);
}

export { runIngestionExample };
