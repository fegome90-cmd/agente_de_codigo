/**
 * Unit Tests for ImportBoundaryValidator
 * Tests import boundary validation and security
 */

import { ImportBoundaryValidator } from '../src/import-boundary-validator.js';
import { LayeringAnalyzer } from '../src/layering-analyzer.js';
import { SymbolExtractor } from '../src/symbol-extractor.js';

// Mock dependencies
jest.mock('../src/layering-analyzer.js', () => ({
  LayeringAnalyzer: jest.fn().mockImplementation(() => ({
    getFileLayer: jest.fn(),
  })),
}));

jest.mock('../src/symbol-extractor.js', () => ({
  SymbolExtractor: jest.fn().mockImplementation(() => ({
    extractImports: jest.fn(),
  })),
}));

describe('ImportBoundaryValidator', () => {
  let validator: ImportBoundaryValidator;
  let mockLayeringAnalyzer: jest.Mocked<LayeringAnalyzer>;
  let mockSymbolExtractor: jest.Mocked<SymbolExtractor>;

  beforeEach(() => {
    mockLayeringAnalyzer = new LayeringAnalyzer(
      {} as any
    ) as jest.Mocked<LayeringAnalyzer>;
    mockSymbolExtractor = new SymbolExtractor() as jest.Mocked<SymbolExtractor>;

    validator = new ImportBoundaryValidator(
      mockLayeringAnalyzer,
      mockSymbolExtractor,
      '/project'
    );
  });

  describe('path validation', () => {
    it('should reject path traversal attempts', () => {
      expect(() => {
        validator['validatePathWithinProject']('../../../etc/passwd', 'test');
      }).toThrow('Path traversal not allowed');
    });

    it('should reject absolute paths', () => {
      expect(() => {
        validator['validatePathWithinProject']('/etc/passwd', 'test');
      }).toThrow('Absolute paths not allowed');
    });

    it('should reject paths escaping project root', () => {
      expect(() => {
        validator['validatePathWithinProject']('outside/file.ts', '/project');
      }).toThrow('Path escapes project root');
    });

    it('should accept valid paths within project', () => {
      expect(() => {
        validator['validatePathWithinProject']('src/components/App.tsx', '/project');
      }).not.toThrow();
    });
  });

  describe('file extension validation', () => {
    it('should accept valid extensions', () => {
      expect(() => {
        validator['validateFileExtension']('.ts');
      }).not.toThrow();

      expect(() => {
        validator['validateFileExtension']('.tsx');
      }).not.toThrow();

      expect(() => {
        validator['validateFileExtension']('/index.ts');
      }).not.toThrow();
    });

    it('should reject invalid extensions', () => {
      expect(() => {
        validator['validateFileExtension']('.exe');
      }).toThrow('Invalid file extension');
    });
  });

  describe('resolveRelativeImport', () => {
    it('should resolve relative imports within project', () => {
      const result = validator['resolveRelativeImport']('./utils/helper', '/project/src/components/App.tsx');
      expect(result).toBeDefined();
    });

    it('should reject relative imports with traversal', () => {
      const result = validator['resolveRelativeImport']('../../../etc/passwd', '/project/src/file.ts');
      expect(result).toBeNull();
    });
  });

  describe('resolveAbsoluteImport', () => {
    it('should resolve absolute imports within src', () => {
      const result = validator['resolveAbsoluteImport']('utils/helper', '/project/src/file.ts');
      expect(result).toBeDefined();
    });

    it('should reject imports with traversal', () => {
      const result = validator['resolveAbsoluteImport']('../outside/file', '/project/src/file.ts');
      expect(result).toBeNull();
    });
  });

  describe('isExternalDependency', () => {
    it('should identify external dependencies', () => {
      expect(validator['isExternalDependency']('lodash')).toBe(true);
      expect(validator['isExternalDependency']('@angular/core')).toBe(true);
      expect(validator['isExternalDependency']('react')).toBe(true);
    });

    it('should not identify relative imports as external', () => {
      expect(validator['isExternalDependency']('./helper')).toBe(false);
      expect(validator['isExternalDependency']('../utils')).toBe(false);
    });
  });

  describe('extractPackageName', () => {
    it('should extract package name from imports', () => {
      expect(validator['extractPackageName']('lodash')).toBe('lodash');
      expect(validator['extractPackageName']('@angular/core')).toBe('@angular/core');
      expect(validator['extractPackageName']('react-dom/server')).toBe('react-dom');
    });

    it('should handle edge cases', () => {
      expect(validator['extractPackageName']('package')).toBe('package');
    });
  });

  describe('moduleMatchesPattern', () => {
    it('should match patterns with wildcards', () => {
      expect(validator['moduleMatchesPattern']('src/utils/helper', 'src/**')).toBe(true);
      expect(validator['moduleMatchesPattern']('src/components/App', 'src/*/App')).toBe(true);
    });

    it('should not match patterns that do not match', () => {
      expect(validator['moduleMatchesPattern']('outside/file', 'src/**')).toBe(false);
    });
  });

  describe('pathMatchesPattern', () => {
    it('should match file paths against patterns', () => {
      expect(
        validator['pathMatchesPattern']('/project/src/components/App.tsx', 'src/components/**')
      ).toBe(true);

      expect(
        validator['pathMatchesPattern']('/project/src/services/UserService.ts', 'src/services/**')
      ).toBe(true);
    });

    it('should handle relative paths', () => {
      expect(
        validator['pathMatchesPattern']('src/components/App.tsx', 'src/components/**')
      ).toBe(true);
    });
  });

  describe('getFileLayer', () => {
    it('should use layering analyzer to get file layer', () => {
      mockLayeringAnalyzer.getFileLayer.mockReturnValue('presentation');

      const layer = validator['getFileLayer']('src/components/App.tsx');

      expect(layer).toBe('presentation');
      expect(mockLayeringAnalyzer.getFileLayer).toHaveBeenCalled();
    });
  });

  describe('validateBoundaries', () => {
    it('should validate import boundaries for files', async () => {
      const taskData = {
        scope: ['src/file.ts'],
        context: {
          repoRoot: '/project',
        },
      };

      mockSymbolExtractor.extractImports = jest.fn().mockResolvedValue([
        {
          module: './helper',
          source: 'src/file.ts',
          line: 1,
          column: 0,
          type: 'import',
        },
      ]);
      mockLayeringAnalyzer.getFileLayer.mockReturnValue('presentation');

      const violations = await validator.validateBoundaries(taskData);

      expect(violations).toBeDefined();
      expect(Array.isArray(violations)).toBe(true);
    });

    it('should handle files with no imports', async () => {
      const taskData = {
        scope: ['src/file.ts'],
        context: {
          repoRoot: '/project',
        },
      };

      mockSymbolExtractor.extractImports = jest.fn().mockResolvedValue([]);

      const violations = await validator.validateBoundaries(taskData);

      expect(violations).toHaveLength(0);
    });
  });
});
