import type { LLMProvider, LLMGenerateRequest, LLMGenerateResponse } from './llmAdapter.js';

/**
 * Together.ai Llama Provider Implementation
 * Supports Llama 3.3 8B and 70B Instruct Turbo models
 */
export class LlamaProvider implements LLMProvider {
  name = 'together';
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;
  private accurateModel: string;

  constructor() {
    this.apiKey = process.env.TOGETHER_API_KEY || process.env.LLAMA_API_KEY || '';
    this.baseURL = process.env.TOGETHER_BASE_URL || process.env.LLAMA_BASE_URL || 'https://api.together.xyz/v1';
    this.defaultModel = process.env.LLM_MODEL_STANDARD || 'meta-llama/Llama-3.3-8B-Instruct-Turbo';
    this.accurateModel = process.env.LLM_MODEL_ACCURATE || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

    if (!this.apiKey) {
      throw new Error('TOGETHER_API_KEY (or LLAMA_API_KEY) environment variable is required');
    }

    console.log(`🦙 [TOGETHER-PROVIDER] Initialized with endpoint: ${this.baseURL}`);
    console.log(`🦙 [TOGETHER-PROVIDER] Models: ${this.defaultModel} (standard), ${this.accurateModel} (accurate)`);
  }

  async generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    const startTime = Date.now();
    
    try {
      const model = request.model || this.defaultModel;
      
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          max_tokens: request.max_tokens || 512,
          temperature: request.temperature || 0.1,
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
        
        throw new Error(`Together.ai API error: ${errorMessage}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from Together.ai API');
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
        throw new Error(`Together.ai Provider: ${error.message}`);
      }
      throw new Error('Together.ai Provider: Unknown error occurred');
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getAccurateModel(): string {
    return this.accurateModel;
  }
}