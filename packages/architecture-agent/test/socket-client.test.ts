/**
 * Unit Tests for SocketClient
 * Tests real IPC communication with orchestrator
 */

import { SocketClient } from '../src/socket-client.js';
import { createConnection } from 'node:net';
import * as fs from 'node:fs';

// Mock net module
jest.mock('node:net', () => ({
  createConnection: jest.fn(),
}));

// Mock fs module
const mockExistsSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  statSync: jest.fn(),
}));

describe('SocketClient', () => {
  let client: SocketClient;
  let mockSocket: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockSocket = {
      on: jest.fn(),
      write: jest.fn(),
      destroy: jest.fn(),
      removeAllListeners: jest.fn(),
    };
    (createConnection as jest.Mock).mockReturnValue(mockSocket);

    client = new SocketClient('/tmp/test.sock');
  });

  afterEach(() => {
    client.disconnect();
  });

  describe('constructor', () => {
    it('should initialize with default socket path', () => {
      const defaultClient = new SocketClient();
      expect(defaultClient).toBeDefined();
    });

    it('should initialize with custom auth token', () => {
      const customClient = new SocketClient('/tmp/test.sock', 'custom-token');
      expect(customClient).toBeDefined();
    });

    it('should generate auth token if not provided', () => {
      const client = new SocketClient('/tmp/test.sock');
      expect(client).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should emit standalone-mode if socket does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const standaloneHandler = jest.fn();
      client.on('standalone-mode', standaloneHandler);

      await client.connect();

      expect(standaloneHandler).toHaveBeenCalled();
    });

    it('should connect to socket when available', async () => {
      mockExistsSync.mockReturnValue(true);

      const connectHandler = jest.fn();
      client.on('connected', connectHandler);

      await client.connect();

      expect(createConnection).toHaveBeenCalledWith('/tmp/test.sock');
      expect(connectHandler).toHaveBeenCalled();
    });

    it('should handle connection timeout', async () => {
      mockExistsSync.mockReturnValue(true);
      (createConnection as jest.Mock).mockImplementation(() => {
        // Never emit 'connect' event to trigger timeout
        return {
          on: jest.fn(),
          destroy: jest.fn(),
          removeAllListeners: jest.fn(),
        };
      });

      const standaloneHandler = jest.fn();
      client.on('standalone-mode', standaloneHandler);

      await new Promise(resolve => setTimeout(resolve, 50)); // Wait for timeout

      expect(standaloneHandler).toHaveBeenCalled();
    });

    it('should retry connection on failure', async () => {
      mockExistsSync.mockReturnValue(true);

      let attempts = 0;
      (createConnection as jest.Mock).mockImplementation(() => {
        attempts++;
        return {
          on: (event: string, handler: Function) => {
            if (event === 'error' && attempts < 3) {
              handler(new Error('Connection failed'));
            } else if (event === 'connect' && attempts >= 3) {
              handler();
            }
          },
          destroy: jest.fn(),
          removeAllListeners: jest.fn(),
        };
      });

      const connectHandler = jest.fn();
      client.on('connected', connectHandler);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(attempts).toBeGreaterThan(1);
    });
  });

  describe('sendTaskResponse', () => {
    it('should send task response when connected', async () => {
      mockExistsSync.mockReturnValue(true);

      // Simulate connected state
      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') handler();
      });
      mockSocket.write = jest.fn((data, encoding, callback) => {
        if (callback) callback(null);
      });

      await client.connect();

      await client.sendTaskResponse('task-123', 'done', { result: 'success' }, 1000);

      expect(mockSocket.write).toHaveBeenCalled();
    });

    it('should queue message when not connected', async () => {
      mockExistsSync.mockReturnValue(false);

      await client.connect();

      await client.sendTaskResponse('task-123', 'running', {}, 500);

      // Message should be queued, not sent
      expect(mockSocket.write).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should cleanup socket and stop heartbeat', async () => {
      mockExistsSync.mockReturnValue(true);

      // Simulate connected state
      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') handler();
      });
      mockSocket.write = jest.fn();

      await client.connect();

      const disconnectHandler = jest.fn();
      client.on('disconnected', disconnectHandler);

      client.disconnect();

      expect(mockSocket.destroy).toHaveBeenCalled();
      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(disconnectHandler).toHaveBeenCalled();
    });

    it('should be idempotent', () => {
      client.disconnect();
      client.disconnect(); // Should not throw

      expect(mockSocket.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('runStandalone', () => {
    it('should emit standalone-task event', async () => {
      const standaloneTaskHandler = jest.fn();
      client.on('standalone-task', standaloneTaskHandler);

      await client.runStandalone({
        scope: ['src/**/*.ts'],
        output: '/tmp/report.json',
        context: {
          repoRoot: '/project',
        },
      } as any);

      expect(standaloneTaskHandler).toHaveBeenCalled();
    });

    it('should create output directory if it does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExistsSync.mockReturnValueOnce(false); // For output dir check
      mockExistsSync.mockReturnValueOnce(true); // For parent dir

      await client.runStandalone({
        scope: ['src/**/*.ts'],
        output: '/tmp/deep/nested/report.json',
        context: {
          repoRoot: '/project',
        },
      } as any);

      expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/deep/nested', {
        recursive: true,
      });
    });
  });

  describe('saveReport', () => {
    it('should save report to file', async () => {
      const report = { findings: [], summary: {} };
      const outputPath = '/tmp/report.json';

      await client.saveReport(report, outputPath);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        outputPath,
        JSON.stringify(report, null, 2)
      );
    });

    it('should handle save errors', async () => {
      const report = { findings: [] };
      const outputPath = '/tmp/report.json';

      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(client.saveReport(report, outputPath)).rejects.toThrow();
    });
  });

  describe('isClientConnected', () => {
    it('should return connection status', async () => {
      expect(client.isClientConnected()).toBe(false);

      mockExistsSync.mockReturnValue(true);
      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') handler();
      });

      await client.connect();

      expect(client.isClientConnected()).toBe(true);
    });
  });
});
