/**
 * Jest Test Setup
 * Global test configuration and utilities
 */

// Reduce test noise
process.env.LOG_LEVEL = 'error';

// Suppress console logs during tests unless explicitly needed
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Mock fs module for testing
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
}));

// Mock path module
jest.mock('node:path', () => ({
  ...jest.requireActual('node:path'),
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((path) => path.split('/').slice(0, -1).join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  normalize: jest.fn((path) => path),
  isAbsolute: jest.fn((path) => path.startsWith('/')),
}));

// Mock logger to reduce test noise
jest.mock('./mock-utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

afterEach(() => {
  jest.clearAllMocks();
});
