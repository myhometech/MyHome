/**
 * E2E Tests for LLM Adapter Abstraction
 * Tests the complete /internal/llm/generate endpoint integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';

// Test configuration
const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const ENDPOINT = `${API_BASE}/internal/llm/generate`;

// Mock environment for testing
process.env.LLM_PROVIDER = 'mistral';
process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'test-key-for-e2e';
process.env.LLM_MODEL_STANDARD = 'mistral-small-latest';
process.env.LLM_TIMEOUT_MS = '15000';
process.env.LOG_PROMPTS = 'false';

describe('E2E: /internal/llm/generate', () => {
  beforeAll(() => {
    console.log('🧪 [E2E] Starting LLM Adapter E2E tests...');
    console.log('🧪 [E2E] Endpoint:', ENDPOINT);
    console.log('🧪 [E2E] Provider:', process.env.LLM_PROVIDER);
    console.log('🧪 [E2E] Model:', process.env.LLM_MODEL_STANDARD);
  });

  afterAll(() => {
    console.log('✅ [E2E] LLM Adapter E2E tests completed');
  });

  it('should accept valid requests and return proper response format', async () => {
    const requestBody = {
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Hello, world!" and nothing else.' }
      ],
      max_tokens: 50,
      temperature: 0.1,
      stop: []
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    
    const responseData = await response.json() as any;
    
    // Validate response format matches specification
    expect(responseData).toHaveProperty('text');
    expect(responseData).toHaveProperty('usage');
    expect(responseData).toHaveProperty('latencyMs');
    
    expect(typeof responseData.text).toBe('string');
    expect(responseData.text.length).toBeGreaterThan(0);
    
    expect(responseData.usage).toHaveProperty('prompt_tokens');
    expect(responseData.usage).toHaveProperty('completion_tokens');
    expect(typeof responseData.usage.prompt_tokens).toBe('number');
    expect(typeof responseData.usage.completion_tokens).toBe('number');
    expect(responseData.usage.prompt_tokens).toBeGreaterThan(0);
    expect(responseData.usage.completion_tokens).toBeGreaterThan(0);
    
    expect(typeof responseData.latencyMs).toBe('number');
    expect(responseData.latencyMs).toBeGreaterThan(0);
    
    console.log('✅ [E2E] Valid request test passed');
    console.log('📊 [E2E] Response stats:', {
      textLength: responseData.text.length,
      promptTokens: responseData.usage.prompt_tokens,
      completionTokens: responseData.usage.completion_tokens,
      latencyMs: responseData.latencyMs
    });
  }, 30000); // 30 second timeout for API calls

  it('should respect max_tokens parameter', async () => {
    const requestBody = {
      model: 'mistral-small-latest',
      messages: [
        { role: 'user', content: 'Write a very long response about artificial intelligence.' }
      ],
      max_tokens: 10, // Very small limit
      temperature: 0.1,
      stop: []
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    
    const responseData = await response.json() as any;
    
    // With max_tokens=10, completion should be limited
    expect(responseData.usage.completion_tokens).toBeLessThanOrEqual(10);
    
    console.log('✅ [E2E] Max tokens test passed');
    console.log('📊 [E2E] Completion tokens:', responseData.usage.completion_tokens);
  }, 30000);

  it('should handle temperature parameter', async () => {
    const requestBody = {
      model: 'mistral-small-latest',
      messages: [
        { role: 'user', content: 'Respond with exactly: "Temperature test response"' }
      ],
      max_tokens: 50,
      temperature: 0.0, // Deterministic
      stop: []
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    
    const responseData = await response.json() as any;
    expect(responseData.text).toBeTruthy();
    
    console.log('✅ [E2E] Temperature test passed');
  }, 30000);

  it('should handle stop parameter', async () => {
    const requestBody = {
      model: 'mistral-small-latest',
      messages: [
        { role: 'user', content: 'Count from 1 to 10: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10' }
      ],
      max_tokens: 100,
      temperature: 0.1,
      stop: ['5'] // Should stop at "5"
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    
    const responseData = await response.json() as any;
    expect(responseData.text).toBeTruthy();
    
    console.log('✅ [E2E] Stop parameter test passed');
    console.log('📝 [E2E] Response:', responseData.text.substring(0, 100));
  }, 30000);

  it('should reject invalid request format', async () => {
    const invalidRequestBody = {
      model: 'mistral-small-latest',
      messages: [], // Invalid - empty messages
      max_tokens: -1, // Invalid - negative
      temperature: 5, // Invalid - too high
      stop: []
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invalidRequestBody),
    });

    expect(response.status).toBe(400);
    
    const errorData = await response.json() as any;
    expect(errorData).toHaveProperty('error');
    expect(errorData).toHaveProperty('message');
    
    console.log('✅ [E2E] Invalid request rejection test passed');
  });

  it('should handle missing required fields', async () => {
    const incompleteRequestBody = {
      model: 'mistral-small-latest',
      // Missing messages field
      max_tokens: 50,
      temperature: 0.1,
      stop: []
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(incompleteRequestBody),
    });

    expect(response.status).toBe(400);
    
    const errorData = await response.json() as any;
    expect(errorData.error).toBe('Invalid request format');
    
    console.log('✅ [E2E] Missing fields test passed');
  });

  it('should handle malformed JSON', async () => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{invalid json}',
    });

    expect([400, 500]).toContain(response.status);
    
    console.log('✅ [E2E] Malformed JSON test passed');
  });

  it('should handle empty request body', async () => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '',
    });

    expect([400, 500]).toContain(response.status);
    
    console.log('✅ [E2E] Empty body test passed');
  });

  it('should propagate errors in proper envelope format', async () => {
    // This test assumes the provider is configured but may fail due to invalid API key or network
    const requestBody = {
      model: 'non-existent-model-that-should-fail',
      messages: [
        { role: 'user', content: 'This should trigger an error' }
      ],
      max_tokens: 50,
      temperature: 0.1,
      stop: []
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Should return proper error response
    expect([400, 500, 503]).toContain(response.status);
    
    const errorData = await response.json() as any;
    expect(errorData).toHaveProperty('error');
    expect(errorData).toHaveProperty('message');
    
    console.log('✅ [E2E] Error propagation test passed');
  }, 30000);
});

// Smoke test for quick verification
describe('E2E: Smoke Test', () => {
  it('should complete a round-trip generation from sample prompt', async () => {
    const samplePrompt = {
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful AI assistant. Respond concisely and clearly.' 
        },
        { 
          role: 'user', 
          content: 'What is 2+2? Respond with just the number.' 
        }
      ],
      max_tokens: 10,
      temperature: 0.1,
      stop: []
    };

    console.log('🔥 [SMOKE] Starting smoke test...');
    
    const startTime = Date.now();
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(samplePrompt),
    });
    const endTime = Date.now();

    expect(response.status).toBe(200);
    
    const responseData = await response.json() as any;
    
    // Validate basic structure
    expect(responseData).toMatchObject({
      text: expect.any(String),
      usage: {
        prompt_tokens: expect.any(Number),
        completion_tokens: expect.any(Number)
      },
      latencyMs: expect.any(Number)
    });

    console.log('🔥 [SMOKE] Smoke test completed successfully!');
    console.log('📊 [SMOKE] Results:', {
      httpStatus: response.status,
      responseText: responseData.text,
      promptTokens: responseData.usage.prompt_tokens,
      completionTokens: responseData.usage.completion_tokens,
      reportedLatencyMs: responseData.latencyMs,
      actualLatencyMs: endTime - startTime
    });
  }, 30000);
});

console.log('📋 [E2E] All E2E tests defined successfully');
export {};