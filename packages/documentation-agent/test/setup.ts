/**
 * Jest Test Setup
 * Global configuration for test environment
 */

import { jest } from '@jest/globals';

// Set test timeout
jest.setTimeout(30000); // 30 seconds

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PIT_CREW_SOCKET_PATH = '/tmp/test-socket.sock';