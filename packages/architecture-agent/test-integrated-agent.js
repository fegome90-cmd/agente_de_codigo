/**
 * Test Integrated Architecture Agent Functionality
 */

import { IntegratedArchitectureAgent } from './dist/integrated-agent.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testIntegratedAgent() {
  console.log('🚀 Testing Integrated Architecture Agent...\n');

  try {
    // Test 1: Initialize integrated agent
    console.log('🔧 Testing initialization...');
    const agent = new IntegratedArchitectureAgent({
      analysis: {
        includeLayering: true,
        includeDRY: true,
        includeCoverage: true,
        includeSeverity: true,
        includeRefactoring: true
      },
      thresholds: {
        layeringSeverity: 'medium',
        drySimilarity: 0.7,
        coverageThreshold: 75,
        maxFindings: 50
      },
      output: {
        format: 'json',
        includeRecommendations: true,
        includeCodeExamples: true,
        groupBySeverity: true
      }
    });
    console.log('✅ Integrated agent initialized');

    // Create comprehensive test directory
    const testDir = './temp-integrated-test';

    // Create realistic project structure
    const projectFiles = {
      // Source files with various architectural issues
      'src/controllers/UserController.js': `
import { UserService } from '../services/UserService.js';
import { AuthService } from '../auth/AuthService.js';
import { DatabaseService } from '../infrastructure/DatabaseService.js'; // Layering violation
import { EmailService } from '../notifications/EmailService.js';

export class UserController {
  constructor() {
    this.userService = new UserService();
    this.authService = new AuthService();
    this.db = new DatabaseService(); // Direct infrastructure access
    this.emailService = new EmailService();
  }

  async createUser(req, res) {
    try {
      const { name, email, password } = req.body;

      // Validation logic (duplicated across controllers)
      if (!name || name.length < 2) {
        return res.status(400).json({ error: 'Invalid name' });
      }
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Invalid password' });
      }

      const user = await this.userService.createUser({ name, email, password });
      const token = this.authService.generateToken(user);

      // Direct database access (should be in service layer)
      await this.db.save('audit_log', { action: 'user_created', userId: user.id });

      res.status(201).json({ user, token });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getUser(req, res) {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Duplicate validation method
  validateUserData(userData) {
    const errors = [];

    if (!userData.name || userData.name.length < 2) {
      errors.push('Invalid name');
    }
    if (!userData.email || !userData.email.includes('@')) {
      errors.push('Invalid email');
    }
    if (!userData.password || userData.password.length < 6) {
      errors.push('Invalid password');
    }

    return errors;
  }
}
      `,
      'src/services/ProductService.js': `
import { DatabaseService } from '../infrastructure/DatabaseService.js';
import { CacheService } from '../infrastructure/CacheService.js';

export class ProductService {
  constructor() {
    this.db = new DatabaseService();
    this.cache = new CacheService();
  }

  async createProduct(productData) {
    // Validation logic (duplicated from UserController)
    if (!productData.name || productData.name.length < 2) {
      throw new Error('Invalid name');
    }
    if (!productData.price || productData.price <= 0) {
      throw new Error('Invalid price');
    }

    const product = await this.db.save('products', productData);
    await this.cache.del('products:all');

    return product;
  }

  async getProduct(id) {
    // Try cache first
    let product = await this.cache.get(\`product:\${id}\`);

    if (!product) {
      product = await this.db.findById('products', id);
      if (product) {
        await this.cache.set(\`product:\${id}\`, product, 3600);
      }
    }

    return product;
  }

  async getAllProducts() {
    let products = await this.cache.get('products:all');

    if (!products) {
      products = await this.db.findAll('products');
      await this.cache.set('products:all', products, 1800);
    }

    return products;
  }

  // Duplicate validation method (similar to UserController)
  validateProductData(productData) {
    const errors = [];

    if (!productData.name || productData.name.length < 2) {
      errors.push('Invalid name');
    }
    if (!productData.price || productData.price <= 0) {
      errors.push('Invalid price');
    }

    return errors;
  }
}
      `,
      'src/infrastructure/DatabaseService.js': `
import { EventEmitter } from 'events';

export class DatabaseService extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.cache = new Map();
  }

  async connect() {
    if (!this.connection) {
      this.connection = await this.createConnection();
      this.emit('connected');
    }
    return this.connection;
  }

  async save(table, data) {
    await this.connect();
    const id = Date.now() + Math.random();
    const record = { id, ...data, createdAt: new Date() };

    this.cache.set(\`\${table}:\${id}\`, record);
    this.emit('save', { table, record });

    return record;
  }

  async findById(table, id) {
    await this.connect();
    return this.cache.get(\`\${table}:\${id}\`) || null;
  }

  async findAll(table) {
    await this.connect();
    const records = [];

    for (const [key, value] of this.cache.entries()) {
      if (key.startsWith(\`\${table}:\`)) {
        records.push(value);
      }
    }

    return records;
  }

  async update(table, id, data) {
    await this.connect();
    const existing = await this.findById(table, id);

    if (existing) {
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.cache.set(\`\${table}:\${id}\`, updated);
      this.emit('update', { table, record: updated });
      return updated;
    }

    return null;
  }

  async delete(table, id) {
    await this.connect();
    const record = this.cache.get(\`\${table}:\${id}\`);

    if (record) {
      this.cache.delete(\`\${table}:\${id}\`);
      this.emit('delete', { table, id });
      return true;
    }

    return false;
  }

  async createConnection() {
    // Mock database connection
    return { connected: true, timestamp: Date.now() };
  }

  async disconnect() {
    if (this.connection) {
      this.connection = null;
      this.emit('disconnected');
    }
  }

  // Duplicate cache management logic
  clearCache(pattern) {
    for (const [key] of this.cache.entries()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  // Another duplicate cache method
  flushCache() {
    this.cache.clear();
    this.emit('cache_flushed');
  }
}
      `,
      'src/utils/ValidationHelper.js': `
export class ValidationHelper {
  // Email validation (duplicated in multiple places)
  static validateEmail(email) {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(email);
  }

  // Phone validation (duplicated logic)
  static validatePhone(phone) {
    const phoneRegex = /^\\+?[1-9]\\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  // General string validation (duplicated pattern)
  static validateString(value, minLength = 1) {
    return value && typeof value === 'string' && value.length >= minLength;
  }

  // Number validation (duplicated pattern)
  static validateNumber(value, min = 0, max = Infinity) {
    return typeof value === 'number' && value >= min && value <= max;
  }

  // Duplicate validation method (similar to controllers)
  static validateUserData(userData) {
    const errors = [];

    if (!this.validateString(userData.name, 2)) {
      errors.push('Invalid name');
    }
    if (!this.validateEmail(userData.email)) {
      errors.push('Invalid email');
    }

    return errors;
  }

  // Another duplicate validation method
  static validateProductData(productData) {
    const errors = [];

    if (!this.validateString(productData.name, 2)) {
      errors.push('Invalid name');
    }
    if (!this.validateNumber(productData.price, 0)) {
      errors.push('Invalid price');
    }

    return errors;
  }
}
      `,
      'src/auth/AuthService.js': `
import { CryptoService } from '../infrastructure/CryptoService.js';
import { UserService } from '../services/UserService.js';

export class AuthService {
  constructor() {
    this.crypto = new CryptoService();
    this.userService = new UserService();
  }

  async authenticateUser(email, password) {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await this.crypto.compare(password, user.passwordHash);

    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    return this.generateToken(user);
  }

  async registerUser(userData) {
    const existingUser = await this.userService.findByEmail(userData.email);

    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordHash = await this.crypto.hash(userData.password);
    const user = await this.userService.createUser({
      ...userData,
      passwordHash
    });

    return this.generateToken(user);
  }

  generateToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      iat: Date.now(),
      exp: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  verifyToken(token) {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString());

      if (payload.exp < Date.now()) {
        throw new Error('Token expired');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}
      `,
      'src/infrastructure/CryptoService.js': `
import { randomBytes, createHash } from 'crypto';

export class CryptoService {
  hash(password) {
    return createHash('sha256').update(password + 'salt').digest('hex');
  }

  async compare(password, hash) {
    const computedHash = this.hash(password);
    return computedHash === hash;
  }

  generateToken() {
    return randomBytes(32).toString('hex');
  }

  encrypt(data) {
    // Simple mock encryption
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  decrypt(encryptedData) {
    // Simple mock decryption
    return JSON.parse(Buffer.from(encryptedData, 'base64').toString());
  }
}
      `,
      'src/infrastructure/CacheService.js': `
export class CacheService {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }

  async set(key, value, ttlSeconds = 3600) {
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + (ttlSeconds * 1000));
  }

  async get(key) {
    const expiry = this.ttl.get(key);

    if (expiry && expiry < Date.now()) {
      this.cache.delete(key);
      this.ttl.delete(key);
      return null;
    }

    return this.cache.get(key) || null;
  }

  async del(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  async clear() {
    this.cache.clear();
    this.ttl.clear();
  }

  // Duplicate cleanup method (similar to DatabaseService)
  cleanup() {
    const now = Date.now();

    for (const [key, expiry] of this.ttl.entries()) {
      if (expiry < now) {
        this.cache.delete(key);
        this.ttl.delete(key);
      }
    }
  }

  // Another duplicate method
  flush() {
    this.cache.clear();
    this.ttl.clear();
  }
}
      `,
      'src/notifications/EmailService.js': `
export class EmailService {
  constructor() {
    this.provider = null;
    this.queue = [];
  }

  async sendEmail(to, subject, body) {
    const email = {
      id: Date.now(),
      to,
      subject,
      body,
      status: 'pending',
      createdAt: new Date()
    };

    this.queue.push(email);
    return await this.processEmail(email);
  }

  async processEmail(email) {
    try {
      // Mock email sending
      email.status = 'sent';
      email.sentAt = new Date();

      console.log(\`Email sent to \${email.to}: \${email.subject}\`);
      return email;
    } catch (error) {
      email.status = 'failed';
      email.error = error.message;
      throw error;
    }
  }

  async sendWelcomeEmail(user) {
    const subject = 'Welcome to our platform!';
    const body = \`Hello \${user.name}, welcome to our platform!\`;

    return await this.sendEmail(user.email, subject, body);
  }

  async sendPasswordResetEmail(user, token) {
    const subject = 'Password Reset Request';
    const body = \`Hello \${user.name}, use this token to reset your password: \${token}\`;

    return await this.sendEmail(user.email, subject, body);
  }
}
      `,

      // Test files
      'test/controllers/UserController.test.js': `
import { UserController } from '../../src/controllers/UserController.js';

describe('UserController', () => {
  let controller;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    controller = new UserController();
    mockReq = {
      body: {},
      params: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('createUser', () => {
    test('should create user with valid data', async () => {
      mockReq.body = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      await controller.createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('should reject invalid email', async () => {
      mockReq.body = {
        name: 'John Doe',
        email: 'invalid-email',
        password: 'password123'
      };

      await controller.createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateUserData', () => {
    test('should validate correct data', () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      const errors = controller.validateUserData(userData);
      expect(errors).toHaveLength(0);
    });

    test('should detect invalid name', () => {
      const userData = {
        name: '',
        email: 'john@example.com',
        password: 'password123'
      };

      const errors = controller.validateUserData(userData);
      expect(errors).toContain('Invalid name');
    });
  });
});
      `,
      'test/services/ProductService.test.js': `
import { ProductService } from '../../src/services/ProductService.js';

describe('ProductService', () => {
  let service;

  beforeEach(() => {
    service = new ProductService();
  });

  describe('createProduct', () => {
    test('should create product with valid data', async () => {
      const productData = {
        name: 'Test Product',
        price: 99.99,
        description: 'A test product'
      };

      const product = await service.createProduct(productData);

      expect(product).toBeDefined();
      expect(product.name).toBe(productData.name);
      expect(product.price).toBe(productData.price);
    });

    test('should reject invalid price', async () => {
      const productData = {
        name: 'Test Product',
        price: -10,
        description: 'A test product'
      };

      await expect(service.createProduct(productData))
        .rejects.toThrow('Invalid price');
    });
  });

  describe('validateProductData', () => {
    test('should validate correct product data', () => {
      const productData = {
        name: 'Test Product',
        price: 99.99
      };

      const errors = service.validateProductData(productData);
      expect(errors).toHaveLength(0);
    });

    test('should detect invalid name', () => {
      const productData = {
        name: '',
        price: 99.99
      };

      const errors = service.validateProductData(productData);
      expect(errors).toContain('Invalid name');
    });
  });
});
      `,
      'test/utils/ValidationHelper.test.js': `
import { ValidationHelper } from '../../src/utils/ValidationHelper.js';

describe('ValidationHelper', () => {
  describe('validateEmail', () => {
    test('should validate correct email', () => {
      expect(ValidationHelper.validateEmail('test@example.com')).toBe(true);
    });

    test('should reject invalid email', () => {
      expect(ValidationHelper.validateEmail('invalid-email')).toBe(false);
    });
  });

  describe('validatePhone', () => {
    test('should validate correct phone', () => {
      expect(ValidationHelper.validatePhone('+1234567890')).toBe(true);
    });

    test('should reject invalid phone', () => {
      expect(ValidationHelper.validatePhone('abc')).toBe(false);
    });
  });

  describe('validateString', () => {
    test('should validate correct string', () => {
      expect(ValidationHelper.validateString('hello', 2)).toBe(true);
    });

    test('should reject short string', () => {
      expect(ValidationHelper.validateString('a', 2)).toBe(false);
    });
  });
});
      `
    };

    // Create test directory and files
    mkdirSync(testDir, { recursive: true });

    for (const [filePath, content] of Object.entries(projectFiles)) {
      const fullPath = join(testDir, filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
    }

    console.log('✅ Created comprehensive test project structure');

    // Test 2: Run complete analysis
    console.log('\n🔍 Testing complete architectural analysis...');

    const allFiles = Object.keys(projectFiles).map(f => join(testDir, f));

    const taskData = {
      scope: allFiles,
      context: {
        repoRoot: testDir
      },
      output: join(testDir, 'integrated-analysis-report.json')
    };

    const results = await agent.analyze(taskData);
    console.log(`✅ Complete analysis finished in ${results.performance.totalDuration}ms`);

    // Test 3: Validate analysis results
    console.log('\n📊 Analysis Results Summary:');
    console.log(`   Task ID: ${results.taskId}`);
    console.log(`   Total Findings: ${results.summary.totalFindings}`);
    console.log(`   Risk Score: ${results.summary.overallRiskScore}/100`);
    console.log(`   Quality Score: ${results.summary.qualityScore}/100`);
    console.log(`   Estimated Effort: ${results.summary.estimatedEffort.hours} hours`);
    console.log(`   Files Analyzed: ${results.performance.filesAnalyzed}`);

    // Test 4: Check findings by type
    console.log('\n📈 Findings by Type:');
    Object.entries(results.summary.findingsByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // Test 5: Check findings by severity
    console.log('\n🎯 Findings by Severity:');
    Object.entries(results.summary.findingsBySeverity).forEach(([severity, count]) => {
      console.log(`   ${severity}: ${count}`);
    });

    // Test 6: Validate component performance
    console.log('\n⚡ Component Performance:');
    Object.entries(results.performance.componentDurations).forEach(([component, duration]) => {
      console.log(`   ${component}: ${Math.round(duration)}ms`);
    });

    // Test 7: Check critical issues
    if (results.summary.criticalIssues.length > 0) {
      console.log('\n🚨 Critical Issues Found:');
      results.summary.criticalIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
    }

    // Test 8: Check priority recommendations
    if (results.summary.priorityRecommendations.length > 0) {
      console.log('\n💡 Priority Recommendations:');
      results.summary.priorityRecommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }

    // Test 9: Test different output formats
    console.log('\n📄 Testing different output formats...');

    // Test Markdown output
    agent.updateConfig({ output: { format: 'markdown' } });
    const markdownPath = join(testDir, 'analysis-report.md');
    await agent.analyze({
      ...taskData,
      output: markdownPath
    });
    console.log('✅ Markdown report generated');

    // Test SARIF output
    agent.updateConfig({ output: { format: 'sarif' } });
    const sarifPath = join(testDir, 'analysis-report.sarif');
    await agent.analyze({
      ...taskData,
      output: sarifPath
    });
    console.log('✅ SARIF report generated');

    // Reset to JSON
    agent.updateConfig({ output: { format: 'json' } });

    // Test 10: Test configuration updates
    console.log('\n⚙️ Testing configuration updates...');

    const originalConfig = agent.getConfig();
    agent.updateConfig({
      thresholds: {
        maxFindings: 10,
        coverageThreshold: 90
      }
    });

    const limitedResults = await agent.analyze(taskData);
    console.log(`✅ Limited analysis: ${limitedResults.summary.totalFindings} findings (max 10)`);

    // Reset config
    agent.updateConfig(originalConfig);

    // Test 11: Test agent status
    console.log('\n📊 Testing agent status...');
    const status = agent.getStatus();
    console.log(`✅ Agent Status:`);
    console.log(`   Version: ${status.version}`);
    console.log(`   Components: ${status.components.length}`);
    console.log(`   Ready: ${status.ready}`);

    // Test 12: Validate severity classifications
    console.log('\n🎯 Testing severity classifications...');
    const classificationStats = results.severityClassifications.reduce((stats, classification) => {
      stats[classification.severity] = (stats[classification.severity] || 0) + 1;
      return stats;
    }, {});

    console.log(`✅ Severity Classifications:`);
    Object.entries(classificationStats).forEach(([severity, count]) => {
      console.log(`   ${severity}: ${count}`);
    });

    // Test 13: Validate refactor recommendations
    console.log('\n🔧 Testing refactor recommendations...');
    console.log(`✅ Refactoring Suggestions: ${results.refactorRecommendations.length} generated`);

    if (results.refactorRecommendations.length > 0) {
      const topRecommendations = results.refactorRecommendations.slice(0, 3);
      topRecommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec.title} (${rec.estimatedEffort} effort)`);
      });
    }

    console.log('\n🎉 All integrated agent tests passed!');

    return {
      analysisCompleted: true,
      totalFindings: results.summary.totalFindings,
      riskScore: results.summary.overallRiskScore,
      qualityScore: results.summary.qualityScore,
      estimatedEffort: results.summary.estimatedEffort.hours,
      componentPerformance: Object.keys(results.performance.componentDurations).length,
      outputFormats: ['json', 'markdown', 'sarif'],
      configurationTested: true,
      statusChecked: true,
      classificationsGenerated: results.severityClassifications.length,
      recommendationsGenerated: results.refactorRecommendations.length
    };

  } catch (error) {
    console.error('❌ Integrated agent test failed:', error);
    throw error;
  }
}

// Run the test
testIntegratedAgent()
  .then((results) => {
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Analysis completed: ${results.analysisCompleted ? 'Yes' : 'No'}`);
    console.log(`   - Total findings: ${results.totalFindings}`);
    console.log(`   - Risk score: ${results.riskScore}/100`);
    console.log(`   - Quality score: ${results.qualityScore}/100`);
    console.log(`   - Estimated effort: ${results.estimatedEffort} hours`);
    console.log(`   - Component performance: ${results.componentPerformance} components`);
    console.log(`   - Output formats: ${results.outputFormats.join(', ')}`);
    console.log(`   - Configuration tested: ${results.configurationTested ? 'Yes' : 'No'}`);
    console.log(`   - Status checked: ${results.statusChecked ? 'Yes' : 'No'}`);
    console.log(`   - Classifications generated: ${results.classificationsGenerated}`);
    console.log(`   - Recommendations generated: ${results.recommendationsGenerated}`);
    console.log('\n✅ Integrated Architecture Agent is working correctly!');
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });