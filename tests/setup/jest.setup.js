// Jest test setup for backend tests
import { jest } from '@jest/globals';

// Global test timeout
jest.setTimeout(30000);

// Setup environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.APP_ORIGIN = 'http://localhost:3000';

// Mock console methods in CI to reduce noise
if (process.env.CI) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: console.error // Keep errors visible
  };
}

// Mock timers for consistent test runs
beforeEach(() => {
  jest.clearAllTimers();
});

// Cleanup after each test
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllTimers();
});