
import { capitalize, reverse, truncate } from '../../src/utils/StringUtils.js';

describe('StringUtils', () => {
  describe('capitalize', () => {
    test('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('WORLD')).toBe('WORLD');
    });

    test('should handle empty string', () => {
      expect(capitalize('')).toBe('');
      expect(capitalize(null)).toBe(null);
      expect(capitalize(undefined)).toBe(undefined);
    });
  });

  describe('reverse', () => {
    test('should reverse string', () => {
      expect(reverse('hello')).toBe('olleh');
      expect(reverse('abc')).toBe('cba');
    });
  });

  describe('truncate', () => {
    test('should truncate long string', () => {
      expect(truncate('hello world', 5)).toBe('hello...');
    });

    test('should return original string if shorter than limit', () => {
      expect(truncate('hi', 10)).toBe('hi');
    });
  });
});
      