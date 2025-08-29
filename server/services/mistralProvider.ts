import type { LLMProvider, LLMGenerateRequest, LLMGenerateResponse } from './llmAdapter.js';

/**
 * Mistral API Provider Implementation
 * Supports both hosted Mistral API and Together.AI endpoints
 */
export class MistralProvider implements LLMProvider {
  name = 'mistral';
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || '';
    this.baseURL = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1';
    this.defaultModel = process.env.LLM_MODEL_STANDARD || 'mistral-small-latest';

    if (!this.apiKey) {
      throw new Error('MISTRAL_API_KEY environment variable is required');
    }

    console.log(`✅ [MISTRAL-PROVIDER] Initialized with endpoint: ${this.baseURL}`);
  }

  async generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || this.defaultModel,
          messages: request.messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stop: request.stop.length > 0 ? request.stop : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // Use the raw error text if JSON parsing fails
          if (errorText) {
            errorMessage = errorText;
          }
        }
        
        throw new Error(`Mistral API error: ${errorMessage}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from Mistral API');
      }

      const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
      const latencyMs = Date.now() - startTime;

      return {
        text: data.choices[0].message.content,
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
        },
        latencyMs
      };

    } catch (error) {
      if (error instanceof Error) {
        // Add context to the error
        throw new Error(`Mistral Provider: ${error.message}`);
      }
      throw new Error('Mistral Provider: Unknown error occurred');
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}