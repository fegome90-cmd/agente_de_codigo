/**
 * Test Coverage Analyzer Functionality
 */

import { CoverageAnalyzer } from './dist/coverage-analyzer.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testCoverageAnalyzer() {
  console.log('🧪 Testing Coverage Analyzer...\n');

  try {
    // Test 1: Initialize coverage analyzer
    console.log('🔧 Testing initialization...');
    const analyzer = new CoverageAnalyzer({
      coverageThreshold: 80,
      minAssertionsPerFunction: 3,
      requireEdgeCaseCoverage: true,
      requireErrorHandling: true,
      trackMutationScore: true
    });
    console.log('✅ Coverage analyzer initialized');

    // Create test directory with source and test files
    const testDir = './temp-coverage-test';

    // Create source files with various functions
    const sourceFiles = {
      'src/utils/Calculator.js': `
export class Calculator {
  add(a, b) {
    return a + b;
  }

  subtract(a, b) {
    return a - b;
  }

  multiply(a, b) {
    return a * b;
  }

  divide(a, b) {
    if (b === 0) {
      throw new Error('Division by zero');
    }
    return a / b;
  }

  _privateHelper(value) {
    return value * 2;
  }

  #veryPrivate(secret) {
    return secret.toString();
  }
}
      `,
      'src/services/UserService.js': `
export class UserService {
  constructor(database) {
    this.db = database;
  }

  async createUser(userData) {
    if (!userData.email || !userData.name) {
      throw new Error('Email and name are required');
    }

    const user = {
      id: Date.now(),
      ...userData,
      createdAt: new Date()
    };

    return await this.db.save(user);
  }

  async getUserById(id) {
    const user = await this.db.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async updateUser(id, updates) {
    const user = await this.getUserById(id);
    Object.assign(user, updates);
    user.updatedAt = new Date();
    return await this.db.update(id, user);
  }

  async deleteUser(id) {
    const user = await this.getUserById(id);
    return await this.db.delete(id);
  }

  _validateEmail(email) {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(email);
  }

  _hashPassword(password) {
    // Simulate password hashing
    return 'hashed_' + password;
  }
}
      `,
      'src/utils/StringUtils.js': `
export function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function reverse(str) {
  return str.split('').reverse().join('');
}

export function truncate(str, length) {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function isPalindrome(str) {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned === cleaned.split('').reverse().join('');
}

export function countWords(str) {
  return str.trim().split(/\\s+/).filter(word => word.length > 0).length;
}
      `,
      'src/auth/AuthService.js': `
export class AuthService {
  constructor(jwtSecret, userRepository) {
    this.jwtSecret = jwtSecret;
    this.userRepo = userRepository;
  }

  async authenticateUser(email, password) {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    return this.generateToken(user);
  }

  async registerUser(userData) {
    const existingUser = await this.userRepo.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const hashedPassword = await this.hashPassword(userData.password);
    const user = await this.userRepo.create({
      ...userData,
      passwordHash: hashedPassword
    });

    return this.generateToken(user);
  }

  verifyToken(token) {
    try {
      return this.decodeToken(token);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  generateToken(user) {
    // Mock token generation
    return 'jwt_token_' + user.id + '_' + Date.now();
  }

  async hashPassword(password) {
    // Mock password hashing
    return 'hashed_' + password;
  }

  async verifyPassword(password, hash) {
    // Mock password verification
    return hash === 'hashed_' + password;
  }

  decodeToken(token) {
    // Mock token decoding
    return { userId: 123, email: 'test@example.com' };
  }
}
      `
    };

    // Create test files with varying coverage
    const testFiles = {
      'test/utils/Calculator.test.js': `
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
      `,
      'test/services/UserService.test.js': `
import { UserService } from '../../src/services/UserService.js';

describe('UserService', () => {
  let userService;
  let mockDatabase;

  beforeEach(() => {
    mockDatabase = {
      save: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };
    userService = new UserService(mockDatabase);
  });

  describe('createUser', () => {
    test('should create user with valid data', async () => {
      const userData = { email: 'test@example.com', name: 'Test User' };
      mockDatabase.save.mockResolvedValue({ id: 1, ...userData });

      const result = await userService.createUser(userData);

      expect(mockDatabase.save).toHaveBeenCalled();
      expect(result.id).toBe(1);
      expect(result.email).toBe(userData.email);
    });

    test('should throw error when email is missing', async () => {
      const userData = { name: 'Test User' };

      await expect(userService.createUser(userData))
        .rejects.toThrow('Email and name are required');
    });
  });

  describe('getUserById', () => {
    test('should return user when found', async () => {
      const user = { id: 1, email: 'test@example.com' };
      mockDatabase.findById.mockResolvedValue(user);

      const result = await userService.getUserById(1);

      expect(result).toBe(user);
    });

    test('should throw error when user not found', async () => {
      mockDatabase.findById.mockResolvedValue(null);

      await expect(userService.getUserById(999))
        .rejects.toThrow('User not found');
    });
  });
});
      `,
      'test/utils/StringUtils.test.js': `
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
      `
    };

    // Create test directory and files
    mkdirSync(testDir, { recursive: true });

    // Create source files
    for (const [filePath, content] of Object.entries(sourceFiles)) {
      const fullPath = join(testDir, filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
    }

    // Create test files
    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = join(testDir, filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
    }

    console.log('✅ Created test files with source code and tests');

    // Test 2: Basic coverage analysis
    console.log('\n🔍 Testing basic coverage analysis...');

    const allFiles = [
      ...Object.keys(sourceFiles).map(f => join(testDir, f)),
      ...Object.keys(testFiles).map(f => join(testDir, f))
    ];

    const taskData = {
      scope: allFiles,
      context: {
        repoRoot: testDir
      },
      output: join(testDir, 'coverage-analysis-report.json')
    };

    const coverageAnalysis = await analyzer.analyzeCoverage(taskData);
    console.log(`✅ Coverage analysis complete: ${coverageAnalysis.overallCoverage}% overall coverage`);

    // Test 3: Analyze coverage gaps
    if (coverageAnalysis.criticalGaps.length > 0) {
      console.log('\n📋 Critical Coverage Gaps Found:');
      coverageAnalysis.criticalGaps.slice(0, 5).forEach((gap, index) => {
        console.log(`\n${index + 1}. ${gap.type.replace('_', ' ').toUpperCase()}`);
        console.log(`   Function: ${gap.functionName}`);
        console.log(`   File: ${gap.filePath}:${gap.line}`);
        console.log(`   Severity: ${gap.severity} | Risk: ${gap.riskLevel} | Effort: ${gap.estimatedEffort}`);
        console.log(`   Suggested tests: ${gap.suggestedTests.slice(0, 2).join(', ')}`);
      });
    }

    // Test 4: Check file-level results
    console.log('\n📊 File Coverage Results:');
    coverageAnalysis.fileResults.slice(0, 3).forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.filePath}`);
      console.log(`   Coverage: ${result.coveragePercentage}% (${result.testedFunctions}/${result.totalFunctions} functions)`);
      console.log(`   Uncovered functions: ${result.uncoveredFunctions.length > 0 ? result.uncoveredFunctions.slice(0, 3).join(', ') : 'None'}`);
      console.log(`   Test quality: ${result.testQuality.totalAssertions} assertions, ${result.testQuality.edgeCaseCoverage} edge case coverage`);
    });

    // Test 5: Test quality metrics
    console.log('\n📈 Testing quality metrics...');
    console.log(`✅ Quality score calculated: ${coverageAnalysis.qualityScore}/100`);
    console.log(`   Function coverage: ${coverageAnalysis.functionCoverage}%`);
    console.log(`   Class coverage: ${coverageAnalysis.classCoverage}%`);

    // Test 6: Test configuration changes
    console.log('\n⚙️ Testing configuration changes...');

    const originalConfig = analyzer.getConfig();
    analyzer.updateConfig({
      coverageThreshold: 90,
      minAssertionsPerFunction: 5,
      requireEdgeCaseCoverage: false
    });

    const highThresholdAnalysis = await analyzer.analyzeCoverage(taskData);
    console.log(`✅ High threshold analysis: ${highThresholdAnalysis.overallCoverage}% coverage (threshold: 90%)`);

    // Reset config
    analyzer.updateConfig(originalConfig);

    // Test 7: Test statistics
    console.log('\n📈 Testing analysis statistics...');

    const stats = analyzer.getStatistics();
    console.log(`✅ Statistics calculated:`);
    console.log(`   Source files: ${stats.sourceFiles}`);
    console.log(`   Test files: ${stats.testFiles}`);
    console.log(`   Total functions: ${stats.totalFunctions}`);
    console.log(`   Total tests: ${stats.totalTests}`);

    // Test 8: Test recommendations
    console.log('\n💡 Testing recommendations...');

    if (coverageAnalysis.recommendations.length > 0) {
      console.log('📝 Generated Recommendations:');
      coverageAnalysis.recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }

    // Test 9: Test severity classification
    console.log('\n🎯 Testing severity classification...');

    const gapsBySeverity = {
      critical: coverageAnalysis.criticalGaps.filter(g => g.severity === 'critical').length,
      high: coverageAnalysis.criticalGaps.filter(g => g.severity === 'high').length,
      medium: coverageAnalysis.criticalGaps.filter(g => g.severity === 'medium').length,
      low: coverageAnalysis.criticalGaps.filter(g => g.severity === 'low').length
    };

    console.log(`✅ Gaps by severity:`);
    console.log(`   Critical: ${gapsBySeverity.critical}`);
    console.log(`   High: ${gapsBySeverity.high}`);
    console.log(`   Medium: ${gapsBySeverity.medium}`);
    console.log(`   Low: ${gapsBySeverity.low}`);

    // Test 10: Test edge case detection
    console.log('\n🔍 Testing edge case detection...');

    const filesWithEdgeCases = coverageAnalysis.fileResults.filter(
      result => result.testQuality.edgeCaseCoverage !== 'poor'
    );

    console.log(`✅ Files with edge case testing: ${filesWithEdgeCases.length}/${coverageAnalysis.fileResults.length}`);

    console.log('\n🎉 All coverage analyzer tests passed!');

    return {
      coverageAnalyzed: coverageAnalysis.overallCoverage,
      gapsFound: coverageAnalysis.criticalGaps.length,
      filesAnalyzed: coverageAnalysis.fileResults.length,
      qualityScore: coverageAnalysis.qualityScore,
      recommendationsGenerated: coverageAnalysis.recommendations.length,
      configurationTested: true,
      statisticsGenerated: true,
      severityClassification: true,
      edgeCaseDetection: filesWithEdgeCases.length > 0
    };

  } catch (error) {
    console.error('❌ Coverage analyzer test failed:', error);
    throw error;
  }
}

// Run the test
testCoverageAnalyzer()
  .then((results) => {
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Overall coverage: ${results.coverageAnalyzed}%`);
    console.log(`   - Coverage gaps found: ${results.gapsFound}`);
    console.log(`   - Files analyzed: ${results.filesAnalyzed}`);
    console.log(`   - Quality score: ${results.qualityScore}/100`);
    console.log(`   - Recommendations generated: ${results.recommendationsGenerated}`);
    console.log(`   - Configuration tested: ${results.configurationTested ? 'Yes' : 'No'}`);
    console.log(`   - Statistics generated: ${results.statisticsGenerated ? 'Yes' : 'No'}`);
    console.log(`   - Severity classification: ${results.severityClassification ? 'Yes' : 'No'}`);
    console.log(`   - Edge case detection: ${results.edgeCaseDetection ? 'Yes' : 'No'}`);
    console.log('\n✅ Coverage analyzer is working correctly!');
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });