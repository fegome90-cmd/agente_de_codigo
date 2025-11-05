/**
 * Unit Tests for LayeringAnalyzer
 * Tests architectural layer validation and violation detection
 */

import { LayeringAnalyzer } from '../src/layering-analyzer.js';
import { SymbolExtractor } from '../src/symbol-extractor.js';
import * as fs from 'node:fs';

// Mock SymbolExtractor
jest.mock('../src/symbol-extractor.js', () => ({
  SymbolExtractor: jest.fn().mockImplementation(() => ({
    extractImports: jest.fn(),
  })),
}));

describe('LayeringAnalyzer', () => {
  let analyzer: LayeringAnalyzer;
  let mockSymbolExtractor: jest.Mocked<SymbolExtractor>;

  beforeEach(() => {
    mockSymbolExtractor = new SymbolExtractor() as jest.Mocked<SymbolExtractor>;
    analyzer = new LayeringAnalyzer(mockSymbolExtractor);
  });

  describe('loadConfiguration', () => {
    it('should load valid YAML configuration', async () => {
      const configPath = '/tmp/test-layer-config.yaml';
      const config = `
layers:
  - name: presentation
    paths:
      - src/components/**
      - src/pages/**
    description: UI components
  - name: business
    paths:
      - src/services/**
    description: Business logic
rules:
  - from: presentation
    to: business
    type: forbidden
`;

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(config);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as any);

      await analyzer.loadConfiguration(configPath);

      const summary = analyzer.getConfigurationSummary();
      expect(summary.layers).toContain('presentation');
      expect(summary.layers).toContain('business');
      expect(summary.rules).toBeGreaterThan(0);
    });

    it('should use default configuration if file not found', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      await analyzer.loadConfiguration('/nonexistent/path.yaml');

      const summary = analyzer.getConfigurationSummary();
      expect(summary.layers.length).toBeGreaterThan(0);
    });

    it('should reject invalid YAML syntax', async () => {
      const configPath = '/tmp/invalid.yaml';
      const invalidConfig = 'invalid: yaml: syntax: [unclosed';

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(invalidConfig);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as any);

      await expect(analyzer.loadConfiguration(configPath)).rejects.toThrow();
    });

    it('should reject configuration with path traversal', async () => {
      const configPath = '/tmp/traversal.yaml';
      const maliciousConfig = `
layers:
  - name: test
    paths:
      - ../../../etc/passwd
`;

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(maliciousConfig);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as any);

      await expect(analyzer.loadConfiguration(configPath)).rejects.toThrow();
    });
  });

  describe('getFileLayer', () => {
    beforeEach(async () => {
      // Load default configuration
      await analyzer.loadConfiguration();
    });

    it('should identify presentation layer files', () => {
      expect(analyzer.getFileLayer('src/components/App.tsx')).toBe('presentation');
      expect(analyzer.getFileLayer('src/pages/Home.tsx')).toBe('presentation');
    });

    it('should identify business layer files', () => {
      expect(analyzer.getFileLayer('src/services/UserService.ts')).toBe('business');
      expect(analyzer.getFileLayer('src/domain/User.ts')).toBe('business');
    });

    it('should return null for files not in any layer', () => {
      expect(analyzer.getFileLayer('external/file.ts')).toBeNull();
      expect(analyzer.getFileLayer('unmatched.ts')).toBeNull();
    });
  });

  describe('analyzeLayering', () => {
    beforeEach(async () => {
      await analyzer.loadConfiguration();
    });

    it('should analyze files for layering violations', async () => {
      const files = ['src/components/App.tsx', 'src/services/UserService.ts'];

      // Mock import extraction
      mockSymbolExtractor.extractImports = jest.fn().mockResolvedValue([
        {
          module: '../services/UserService',
          source: 'src/components/App.tsx',
          line: 1,
          column: 0,
          type: 'import',
        },
      ]);

      const violations = await analyzer.analyzeLayering('/project', files);

      expect(violations).toBeDefined();
      expect(Array.isArray(violations)).toBe(true);
    });

    it('should handle files with no imports', async () => {
      const files = ['src/components/NoImports.tsx'];

      mockSymbolExtractor.extractImports = jest.fn().mockResolvedValue([]);

      const violations = await analyzer.analyzeLayering('/project', files);

      expect(violations).toHaveLength(0);
    });

    it('should handle files not in any configured layer', async () => {
      const files = ['external/file.ts'];

      mockSymbolExtractor.extractImports = jest.fn().mockResolvedValue([]);

      const violations = await analyzer.analyzeLayering('/project', files);

      expect(violations).toHaveLength(0);
    });
  });

  describe('generateConfigurationTemplate', () => {
    it('should generate configuration template', async () => {
      const outputPath = '/tmp/layer-config-template.yaml';

      await analyzer.generateConfigurationTemplate(outputPath);

      // Verify file was created (mocked)
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
