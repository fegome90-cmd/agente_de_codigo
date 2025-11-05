
import { Calculator } from '../../src/utils/Calculator.js';

describe('Calculator', () => {
  let calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  describe('add', () => {
    test('should add two positive numbers', () => {
      expect(calculator.add(2, 3)).toBe(5);
      expect(calculator.add(10, 5)).toBe(15);
    });

    test('should handle negative numbers', () => {
      expect(calculator.add(-2, 3)).toBe(1);
      expect(calculator.add(-5, -5)).toBe(-10);
    });

    test('should handle zero', () => {
      expect(calculator.add(0, 5)).toBe(5);
      expect(calculator.add(0, 0)).toBe(0);
    });
  });

  describe('multiply', () => {
    test('should multiply two numbers', () => {
      expect(calculator.multiply(3, 4)).toBe(12);
      expect(calculator.multiply(-2, 5)).toBe(-10);
    });

    test('should handle zero multiplication', () => {
      expect(calculator.multiply(5, 0)).toBe(0);
      expect(calculator.multiply(0, 0)).toBe(0);
    });
  });

  describe('divide', () => {
    test('should divide two numbers', () => {
      expect(calculator.divide(10, 2)).toBe(5);
      expect(calculator.divide(-6, 3)).toBe(-2);
    });

    test('should throw error when dividing by zero', () => {
      expect(() => calculator.divide(5, 0)).toThrow('Division by zero');
      expect(() => calculator.divide(0, 0)).toThrow('Division by zero');
    });
  });
});
      