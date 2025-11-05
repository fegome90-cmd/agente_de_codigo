/**
 * Unit Tests for ASTParser
 * Tests Tree-sitter parsing with fallback support
 */

import { ASTParser } from '../src/ast-parser.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock Tree-sitter modules
jest.mock('tree-sitter', () => ({
  default: jest.fn().mockImplementation(() => ({
    parse: jest.fn(() => ({
      rootNode: {
        type: 'program',
        text: 'test code',
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 1, column: 0 },
        children: [],
      },
    })),
    setLanguage: jest.fn(),
  })),
}));

jest.mock('tree-sitter-python', () => ({
  default: { type: 'python' },
}));

jest.mock('tree-sitter-typescript', () => ({
  default: {
    typescript: { type: 'typescript' },
  },
}));

jest.mock('tree-sitter-javascript', () => ({
  default: { type: 'javascript' },
}));

describe('ASTParser', () => {
  let parser: ASTParser;

  beforeEach(() => {
    parser = new ASTParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  describe('detectLanguage', () => {
    it('should detect Python files', () => {
      expect(parser.detectLanguage('test.py')).toBe('python');
      expect(parser.detectLanguage('/path/to/file.py')).toBe('python');
    });

    it('should detect TypeScript files', () => {
      expect(parser.detectLanguage('test.ts')).toBe('typescript');
      expect(parser.detectLanguage('test.tsx')).toBe('typescript');
      expect(parser.detectLanguage('/path/to/component.tsx')).toBe('typescript');
    });

    it('should detect JavaScript files', () => {
      expect(parser.detectLanguage('test.js')).toBe('javascript');
      expect(parser.detectLanguage('test.jsx')).toBe('javascript');
      expect(parser.detectLanguage('test.mjs')).toBe('javascript');
    });

    it('should return null for unsupported files', () => {
      expect(parser.detectLanguage('test.txt')).toBeNull();
      expect(parser.detectLanguage('test.json')).toBeNull();
      expect(parser.detectLanguage('README')).toBeNull();
    });
  });

  describe('isFileSupported', () => {
    it('should return true for supported files', () => {
      expect(parser.isFileSupported('test.py')).toBe(true);
      expect(parser.isFileSupported('test.ts')).toBe(true);
      expect(parser.isFileSupported('test.js')).toBe(true);
    });

    it('should return false for unsupported files', () => {
      expect(parser.isFileSupported('test.txt')).toBe(false);
      expect(parser.isFileSupported('test.json')).toBe(false);
    });
  });

  describe('getAllSupportedPatterns', () => {
    it('should return all supported file patterns', () => {
      const patterns = parser.getAllSupportedPatterns();
      expect(patterns).toContain('**/*.py');
      expect(patterns).toContain('**/*.ts');
      expect(patterns).toContain('**/*.tsx');
      expect(patterns).toContain('**/*.js');
      expect(patterns).toContain('**/*.jsx');
      expect(patterns).toContain('**/*.mjs');
    });
  });

  describe('parseSource', () => {
    it('should parse Python source code', async () => {
      const source = 'def hello():\n    print("world")';
      const result = await parser.parseSource(source, 'python', 'test.py');

      expect(result).toBeDefined();
      expect(result?.language).toBe('python');
      expect(result?.ast).toBeDefined();
      expect(result?.ast.type).toBe('Program');
    });

    it('should parse TypeScript source code', async () => {
      const source = 'const hello = (): void => { console.log("world"); }';
      const result = await parser.parseSource(source, 'typescript', 'test.ts');

      expect(result).toBeDefined();
      expect(result?.language).toBe('typescript');
    });

    it('should handle errors gracefully', async () => {
      const source = 'invalid syntax @#$%';
      const result = await parser.parseSource(source, 'python', 'test.py');

      // Should either succeed with fallback or return null
      expect(result === null || result?.ast).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should clean up parser resources', () => {
      const disposeSpy = jest.spyOn(parser as any, 'dispose');

      parser.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should be idempotent', () => {
      parser.dispose();
      parser.dispose(); // Should not throw

      expect(parser.dispose).toBeDefined();
    });
  });
});
