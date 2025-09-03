#!/usr/bin/env tsx

/**
 * TICKET 1: LLM Client Test Utility
 * 
 * Test script to validate Mistral API client wrapper functionality
 * Usage: tsx server/services/test-llm-client.ts
 */

import { llmClient, createLLMClient } from './llmClient.js';

async function testLLMClient() {
  console.log('🧪 Testing LLM Client Wrapper...\n');

  // Test 1: Check service availability
  console.log('1. Service Status:');
  const status = llmClient.getStatus();
  console.log(JSON.stringify(status, null, 2));
  
  if (!status.available) {
    console.log('\n❌ LLM Client not available. Please set MISTRAL_API_KEY or OPENAI_API_KEY environment variable.');
    console.log('\nExample environment variables:');
    console.log('export MISTRAL_API_KEY="your-together-api-key"');
    console.log('export MISTRAL_MODEL_NAME="mistralai/Mistral-7B-Instruct-v0.1"');
    console.log('export MISTRAL_BASE_URL="https://api.together.xyz/v1"');
    return;
  }

  console.log('\n2. Testing Basic Chat Completion:');
  try {
    const response = await llmClient.createChatCompletion({
      messages: [
        { role: 'system', content: 'You are a helpful assistant that responds with valid JSON.' },
        { role: 'user', content: 'Generate a simple JSON object with a "test" field set to "success" and a "message" field with a brief greeting.' }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 100
    });

    console.log('✅ Response received:');
    console.log(`Content length: ${response.content.length} chars`);
    console.log(`Usage: ${response.usage?.total_tokens || 'unknown'} tokens`);
    console.log(`Model: ${response.model || 'unknown'}`);
    
    // Test JSON parsing
    console.log('\n3. Testing JSON Parsing:');
    const parsed = llmClient.parseJSONResponse(response.content);
    console.log('✅ Parsed JSON:', JSON.stringify(parsed, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        type: (error as any).type,
        status: (error as any).status
      });
    }
  }

  console.log('\n4. Testing Backward Compatibility (OpenAI-style):');
  try {
    const response = await llmClient.chat.completions.create({
      messages: [
        { role: 'user', content: 'Return JSON: {"compatibility": "success", "note": "OpenAI-style API works"}' }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 50
    });

    const parsed = llmClient.parseJSONResponse(response.content);
    console.log('✅ Backward compatibility test:', JSON.stringify(parsed, null, 2));

  } catch (error) {
    console.error('❌ Backward compatibility test failed:', error);
  }

  console.log('\n5. Testing Custom Configuration:');
  const customClient = createLLMClient({
    defaultModel: 'mistralai/Mistral-7B-Instruct-v0.1',
    timeout: 15000,
    maxRetries: 2
  });

  console.log('✅ Custom client status:', customClient.getStatus());

  console.log('\n🎉 LLM Client testing complete!');
}

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLLMClient().catch(console.error);
}

export { testLLMClient };