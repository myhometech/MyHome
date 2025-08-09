/**
 * Unit tests for auth configuration module
 */

describe('Auth Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('APP_ORIGIN validation', () => {
    it('should build correct absolute URL with valid APP_ORIGIN', () => {
      process.env.APP_ORIGIN = 'https://myhome.app';
      process.env.CALLBACK_PATH = '/auth/google/callback';
      
      const { GOOGLE_CALLBACK_URL } = require('../auth');
      expect(GOOGLE_CALLBACK_URL).toBe('https://myhome.app/auth/google/callback');
    });

    it('should use default CALLBACK_PATH when not provided', () => {
      process.env.APP_ORIGIN = 'http://localhost:5000';
      delete process.env.CALLBACK_PATH;
      
      const { GOOGLE_CALLBACK_URL } = require('../auth');
      expect(GOOGLE_CALLBACK_URL).toBe('http://localhost:5000/auth/google/callback');
    });

    it('should throw error for missing APP_ORIGIN', () => {
      delete process.env.APP_ORIGIN;
      
      expect(() => {
        require('../auth');
      }).toThrow('APP_ORIGIN environment variable is required');
    });

    it('should throw error for invalid APP_ORIGIN', () => {
      process.env.APP_ORIGIN = 'not-a-valid-url';
      
      expect(() => {
        require('../auth');
      }).toThrow('Invalid APP_ORIGIN: not-a-valid-url');
    });

    it('should throw error for non-http protocol', () => {
      process.env.APP_ORIGIN = 'ftp://example.com';
      
      expect(() => {
        require('../auth');
      }).toThrow('APP_ORIGIN must use http or https protocol');
    });
  });

  describe('Environment-specific URLs', () => {
    it('should handle localhost development URL', () => {
      process.env.APP_ORIGIN = 'http://localhost:5000';
      
      const { GOOGLE_CALLBACK_URL } = require('../auth');
      expect(GOOGLE_CALLBACK_URL).toBe('http://localhost:5000/auth/google/callback');
    });

    it('should handle staging URL', () => {
      process.env.APP_ORIGIN = 'https://staging.myhome.app';
      
      const { GOOGLE_CALLBACK_URL } = require('../auth');
      expect(GOOGLE_CALLBACK_URL).toBe('https://staging.myhome.app/auth/google/callback');
    });

    it('should handle production URL', () => {
      process.env.APP_ORIGIN = 'https://myhome.app';
      
      const { GOOGLE_CALLBACK_URL } = require('../auth');
      expect(GOOGLE_CALLBACK_URL).toBe('https://myhome.app/auth/google/callback');
    });

    it('should handle Replit deployment URL', () => {
      process.env.APP_ORIGIN = 'https://myapp-user.replit.app';
      
      const { GOOGLE_CALLBACK_URL } = require('../auth');
      expect(GOOGLE_CALLBACK_URL).toBe('https://myapp-user.replit.app/auth/google/callback');
    });
  });
});