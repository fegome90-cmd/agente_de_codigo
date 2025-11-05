/**
 * Jest test setup file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  createMockSocketPath: () => `/tmp/test-socket-${Date.now()}.sock`,
  cleanupTempFiles: async (paths: string[]) => {
    const fs = await import('fs/promises');
    for (const path of paths) {
      try {
        await fs.unlink(path);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
};