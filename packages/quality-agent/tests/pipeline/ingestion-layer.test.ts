/**
 * SARIF Ingestion Layer Tests
 */

import { SARIFIngestionLayer } from '../../src/pipeline/ingestion-layer.js';

describe('SARIFIngestionLayer', () => {
  let ingestionLayer: SARIFIngestionLayer;

  beforeEach(() => {
    ingestionLayer = new SARIFIngestionLayer();
  });

  describe('ingest', () => {
    it('should validate and normalize a valid SARIF report', async () => {
      const validSarif = {
        version: '2.1.0',
        runs: [
          {
            tool: {
              driver: {
                name: 'test-tool',
                version: '1.0.0',
                rules: [
                  {
                    id: 'TEST001',
                    name: 'Test Rule',
                    shortDescription: { text: 'Test rule description' },
                    fullDescription: { text: 'Detailed test rule description' },
                    defaultConfiguration: { level: 'error' },
                  },
                ],
              },
            },
            invocations: [
              {
                executionSuccessful: true,
                endTimeUtc: new Date().toISOString(),
              },
            ],
            artifacts: [
              {
                location: { uri: 'src/test.js' },
                roles: ['analysisTarget'],
              },
            ],
            results: [
              {
                ruleId: 'TEST001',
                level: 'error',
                message: { text: 'Test finding message' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'src/test.js' },
                      region: {
                        startLine: 10,
                        startColumn: 5,
                        endLine: 10,
                        endColumn: 15,
                      },
                    },
                  },
                ],
                fix: {
                  description: { text: 'Fix the test issue' },
                  artifactChanges: [
                    {
                      artifactLocation: { uri: 'src/test.js' },
                      replacements: [
                        {
                          deletedRegion: {
                            startLine: 10,
                            startColumn: 5,
                            endLine: 10,
                            endColumn: 15,
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = await ingestionLayer.ingest(JSON.stringify(validSarif));

      expect(result.isValid).toBe(true);
      expect(result.schemaVersion).toBe('2.1.0');
      expect(result.runs).toHaveLength(1);
      expect(result.summary.totalFindings).toBe(1);
      expect(result.summary.totalRules).toBe(1);
      expect(result.summary.totalArtifacts).toBe(1);
      expect(result.summary.severityBreakdown.critical).toBe(1);
      expect(result.errors).toHaveLength(0);

      const run = result.runs[0];
      expect(run.toolName).toBe('test-tool');
      expect(run.toolVersion).toBe('1.0.0');
      expect(run.results).toHaveLength(1);
      expect(run.results[0].severity).toBe('critical');
      expect(run.results[0].fixable).toBe(true);
    });

    it('should reject invalid JSON', async () => {
      const invalidJson = '{ invalid json';

      const result = await ingestionLayer.ingest(invalidJson);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('should reject SARIF with invalid schema', async () => {
      const invalidSarif = {
        version: '2.1.0',
        runs: [
          {
            // Missing required 'tool' property
            results: [],
          },
        ],
      };

      const result = await ingestionLayer.ingest(JSON.stringify(invalidSarif));

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should normalize multiple runs', async () => {
      const multiRunSarif = {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'tool-a', rules: [] } },
            invocations: [{ executionSuccessful: true }],
            results: [
              {
                ruleId: 'RULE1',
                level: 'error',
                message: { text: 'Error from tool A' },
                locations: [],
              },
            ],
          },
          {
            tool: { driver: { name: 'tool-b', rules: [] } },
            invocations: [{ executionSuccessful: true }],
            results: [
              {
                ruleId: 'RULE2',
                level: 'warning',
                message: { text: 'Warning from tool B' },
                locations: [],
              },
              {
                ruleId: 'RULE3',
                level: 'note',
                message: { text: 'Note from tool B' },
                locations: [],
              },
            ],
          },
        ],
      };

      const result = await ingestionLayer.ingest(JSON.stringify(multiRunSarif));

      expect(result.isValid).toBe(true);
      expect(result.runs).toHaveLength(2);
      expect(result.summary.totalFindings).toBe(3);
      expect(result.summary.agentBreakdown['tool-a']).toBe(1);
      expect(result.summary.agentBreakdown['tool-b']).toBe(2);
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalSarif = {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'minimal', rules: [] } },
            invocations: [{ executionSuccessful: true }],
            results: [
              {
                ruleId: 'MINIMAL',
                level: 'warning',
                message: { text: 'Minimal finding' },
              },
            ],
          },
        ],
      };

      const result = await ingestionLayer.ingest(JSON.stringify(minimalSarif));

      expect(result.isValid).toBe(true);
      expect(result.runs[0].results[0].filePath).toBe('unknown');
      expect(result.runs[0].results[0].line).toBeUndefined();
    });

    it('should generate consistent finding IDs', async () => {
      const sarif = {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'tool', rules: [] } },
            invocations: [{ executionSuccessful: true }],
            results: [
              {
                ruleId: 'RULE1',
                level: 'error',
                message: { text: 'Finding 1' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'file.js' },
                      region: { startLine: 10 },
                    },
                  },
                ],
              },
              {
                ruleId: 'RULE1',
                level: 'error',
                message: { text: 'Finding 2' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'file.js' },
                      region: { startLine: 10 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await ingestionLayer.ingest(JSON.stringify(sarif));

      expect(result.isValid).toBe(true);
      expect(result.runs[0].results[0].id).toBe(result.runs[0].results[1].id);
    });
  });

  describe('severity mapping', () => {
    it('should map SARIF levels to normalized severity', async () => {
      const testCases = [
        { level: 'error', expected: 'critical' },
        { level: 'warning', expected: 'high' },
        { level: 'note', expected: 'medium' },
        { level: 'none', expected: 'low' },
      ];

      for (const testCase of testCases) {
        const sarif = {
          version: '2.1.0',
          runs: [
            {
              tool: { driver: { name: 'tool', rules: [] } },
              invocations: [{ executionSuccessful: true }],
              results: [
                {
                  ruleId: 'TEST',
                  level: testCase.level,
                  message: { text: 'Test' },
                },
              ],
            },
          ],
        };

        const result = await ingestionLayer.ingest(JSON.stringify(sarif));
        expect(result.runs[0].results[0].severity).toBe(testCase.expected);
      }
    });
  });

  describe('summary calculations', () => {
    it('should calculate correct summary statistics', async () => {
      const mixedSarif = {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'tool', rules: [] } },
            invocations: [{ executionSuccessful: true }],
            results: [
              { ruleId: 'E1', level: 'error', message: { text: 'E1' } },
              { ruleId: 'E2', level: 'error', message: { text: 'E2' } },
              { ruleId: 'W1', level: 'warning', message: { text: 'W1' } },
              { ruleId: 'W2', level: 'warning', message: { text: 'W2' } },
              { ruleId: 'W3', level: 'warning', message: { text: 'W3' } },
              { ruleId: 'W4', level: 'warning', message: { text: 'W4' } },
              { ruleId: 'W5', level: 'warning', message: { text: 'W5' } },
              { ruleId: 'N1', level: 'note', message: { text: 'N1' } },
              { ruleId: 'N2', level: 'note', message: { text: 'N2' } },
              { ruleId: 'N3', level: 'note', message: { text: 'N3' } },
            ],
          },
        ],
      };

      const result = await ingestionLayer.ingest(JSON.stringify(mixedSarif));

      expect(result.summary.totalFindings).toBe(10);
      expect(result.summary.severityBreakdown.critical).toBe(2);
      expect(result.summary.severityBreakdown.high).toBe(5);
      expect(result.summary.severityBreakdown.medium).toBe(3);
    });
  });
});
