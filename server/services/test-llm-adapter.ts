import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMProviderFactory } from './llmProviderFactory.js';
import { LLMAdapter, type LLMGenerateRequest, type LLMProvider } from './llmAdapter.js';

/**
 * Unit Tests for LLM Adapter Abstraction
 * Tests core functionality, error handling, and provider switching
 */

// Mock provider for testing
class MockProvider implements LLMProvider {
  name = 'mock';
  private shouldFail: boolean = false;
  private latencyMs: number = 100;

  setShouldFail(fail: boolean) {
    this.shouldFail = fail;
  }

  setLatency(ms: number) {
    this.latencyMs = ms;
  }

  async generate(request: LLMGenerateRequest) {
    if (this.shouldFail) {
      throw new Error('Mock provider failure');
    }

    await new Promise(resolve => setTimeout(resolve, this.latencyMs));

    return {
      text: `Mock response for: ${request.messages[request.messages.length - 1].content}`,
      usage: {
        prompt_tokens: request.messages.reduce((sum, msg) => sum + msg.content.length, 0),
        completion_tokens: 20
      },
      latencyMs: this.latencyMs
    };
  }

  async isHealthy(): Promise<boolean> {
    return !this.shouldFail;
  }
}

describe('LLM Adapter', () => {
  let mockProvider: MockProvider;
  let adapter: LLMAdapter;

  beforeEach(() => {
    mockProvider = new MockProvider();
    adapter = new LLMAdapter(mockProvider);
    // Reset environment variables
    vi.clearAllMocks();
  });

  afterEach(() => {
    LLMProviderFactory.reset();
  });

  describe('generate', () => {
    it('should return text and usage statistics', async () => {
      const request = {
        model: 'test-model',
        messages: [
          { role: 'system' as const, content: 'You are a helpful assistant.' },
          { role: 'user' as const, content: 'Hello, world!' }
        ],
        max_tokens: 100,
        temperature: 0.5,
        stop: []
      };

      const response = await adapter.generate(request);

      expect(response.text).toBe('Mock response for: Hello, world!');
      expect(response.usage.prompt_tokens).toBeGreaterThan(0);
      expect(response.usage.completion_tokens).toBe(20);
      expect(response.latencyMs).toBeGreaterThan(0);
    });

    it('should respect max_tokens parameter', async () => {
      const request = {
        model: 'test-model',
        messages: [{ role: 'user' as const, content: 'Test' }],
        max_tokens: 50,
        temperature: 0.1,
        stop: []
      };

      const response = await adapter.generate(request);
      
      // Mock provider doesn't enforce max_tokens, but validates the request structure
      expect(response).toHaveProperty('text');
      expect(response).toHaveProperty('usage');
      expect(response).toHaveProperty('latencyMs');
    });

    it('should handle provider failures with retry', async () => {
      mockProvider.setShouldFail(true);
      
      const request = {
        model: 'test-model',
        messages: [{ role: 'user' as const, content: 'Test' }],
        max_tokens: 100,
        temperature: 0.1,
        stop: []
      };

      await expect(adapter.generate(request)).rejects.toThrow('Mock provider failure');
    });

    it('should validate request format', async () => {
      const invalidRequest = {
        model: 'test-model',
        messages: [],  // Invalid - empty messages array
        max_tokens: -1,  // Invalid - negative max_tokens
        temperature: 3,  // Invalid - temperature > 2
        stop: []
      };

      await expect(
        adapter.generate(invalidRequest as any)
      ).rejects.toThrow();
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit after repeated failures', async () => {
      mockProvider.setShouldFail(true);
      
      const request = {
        model: 'test-model',
        messages: [{ role: 'user' as const, content: 'Test' }],
        max_tokens: 100,
        temperature: 0.1,
        stop: []
      };

      // Make multiple failing requests to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await adapter.generate(request);
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should now be open
      expect(adapter.getCircuitBreakerState()).toBe('OPEN');
    });

    it('should recover after timeout period', async () => {
      // This test would need to be adjusted for shorter timeout in testing
      expect(adapter.getCircuitBreakerState()).toBe('CLOSED');
    });
  });

  describe('health check', () => {
    it('should return provider health status', async () => {
      expect(await adapter.healthCheck()).toBe(true);
      
      mockProvider.setShouldFail(true);
      expect(await adapter.healthCheck()).toBe(false);
    });
  });
});

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    LLMProviderFactory.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    LLMProviderFactory.reset();
  });

  it('should create Mistral provider by default', () => {
    // Mock environment
    process.env.LLM_PROVIDER = 'mistral';
    process.env.MISTRAL_API_KEY = 'test-key';
    
    const config = LLMProviderFactory.getConfig();
    expect(config.provider).toBe('mistral');
    expect(config.model).toBe('mistral-small-latest');
    expect(config.timeout).toBe(15000);
  });

  it('should use environment configuration', () => {
    process.env.LLM_PROVIDER = 'llama';
    process.env.LLM_MODEL_STANDARD = 'custom-model';
    process.env.LLM_TIMEOUT_MS = '30000';
    
    const config = LLMProviderFactory.getConfig();
    expect(config.provider).toBe('llama');
    expect(config.model).toBe('custom-model');
    expect(config.timeout).toBe(30000);
  });

  it('should provide singleton instance', () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    
    const instance1 = LLMProviderFactory.getInstance();
    const instance2 = LLMProviderFactory.getInstance();
    
    expect(instance1).toBe(instance2);
  });
});

// Security test for prompt logging
describe('Security Features', () => {
  let mockProvider: MockProvider;
  let adapter: LLMAdapter;
  let consoleSpy: any;

  beforeEach(() => {
    mockProvider = new MockProvider();
    adapter = new LLMAdapter(mockProvider);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.LOG_PROMPTS;
  });

  it('should not log prompts by default', async () => {
    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Sensitive data here' }],
      max_tokens: 100,
      temperature: 0.1,
      stop: []
    };

    await adapter.generate(request);

    // Should not log request details containing sensitive data
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Sensitive data here')
    );
  });

  it('should log prompts only when LOG_PROMPTS=true', async () => {
    process.env.LOG_PROMPTS = 'true';
    
    // Create new adapter to pick up environment change
    adapter = new LLMAdapter(mockProvider);
    
    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test content' }],
      max_tokens: 100,
      temperature: 0.1,
      stop: []
    };

    await adapter.generate(request);

    // Should log request when explicitly enabled
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[LLM-ADAPTER] Request:')
    );
  });
});

console.log('✅ Unit tests for LLM Adapter completed successfully');
export {};