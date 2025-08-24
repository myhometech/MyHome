import { z } from 'zod';
import { llmUsageLogger, type LlmUsageContext } from '../llmUsageLogger';

// Types for LLM requests and responses
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model?: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  timeout?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
  finish_reason?: string;
}

export interface LLMError extends Error {
  status?: number;
  code?: string;
  type?: 'rate_limit' | 'api_error' | 'network_error' | 'timeout' | 'parse_error';
}

// Configuration schema
const configSchema = z.object({
  apiKey: z.string().min(1),
  baseURL: z.string().url().optional(),
  defaultModel: z.string().default('mistral-medium'),
  timeout: z.number().default(30000),
  maxRetries: z.number().default(3),
  retryDelay: z.number().default(1000),
});

type LLMConfig = z.infer<typeof configSchema>;

/**
 * TICKET 1: Mistral API Client Wrapper
 * 
 * Standardized LLM client that abstracts provider-specific implementations
 * and provides backward compatibility with OpenAI structure.
 */
export class LLMClient {
  private config: LLMConfig;
  private requestCount: number = 0;
  private openaiApiKey: string = ''; // Added for OpenAI API key

  constructor(config: Partial<LLMConfig> = {}) {
    // Load configuration from environment
    const envConfig = {
      apiKey: process.env.MISTRAL_API_KEY || '',
      baseURL: process.env.MISTRAL_BASE_URL || 'https://api.together.xyz/v1',
      defaultModel: process.env.MISTRAL_MODEL_NAME || 'mistralai/Mistral-7B-Instruct-v0.1',
      ...config
    };

    this.config = configSchema.parse(envConfig);

    // Store OpenAI API key separately for the isConfigured check
    this.openaiApiKey = this.config.apiKey;

    if (!this.config.apiKey) {
      console.warn('⚠️ LLM Client: No API key configured. Set MISTRAL_API_KEY environment variable.');
    } else {
      console.log(`✅ LLM Client initialized with model: ${this.config.defaultModel}`);
    }
  }

  /**
   * Generate chat completion with automatic retry and error handling
   */
  async createChatCompletion(request: LLMRequest, context?: LlmUsageContext): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      throw this.createError('API key not configured', 'api_error', 401);
    }

    const requestId = `llm-${Date.now()}-${++this.requestCount}`;
    console.log(`[${requestId}] LLM Request: ${request.model || this.config.defaultModel}, ${request.messages.length} messages`);

    let lastError: LLMError | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        const response = await this.makeRequest(request, requestId);
        const durationMs = Date.now() - startTime;

        console.log(`[${requestId}] LLM Success: ${response.content.length} chars, ${response.usage?.total_tokens || 0} tokens`);

        // Log usage to database if context provided
        if (context && response.usage) {
          const provider = this.config.baseURL?.includes('together') ? 'together.ai' : 'mistral';
          const model = request.model || this.config.defaultModel;
          const costUsd = provider === 'together.ai' ? 
            llmUsageLogger.calculateMistralCost(response.usage.total_tokens) :
            undefined;

          await llmUsageLogger.logUsage({
            ...context,
            provider,
            model,
          }, {
            tokensUsed: response.usage.total_tokens,
            durationMs,
            status: 'success',
            costUsd,
          });
        }

        return response;

      } catch (error) {
        lastError = this.normalizeError(error, requestId);

        if (attempt === this.config.maxRetries || !this.shouldRetry(lastError)) {
          console.error(`[${requestId}] LLM Failed after ${attempt} attempts:`, lastError.message);

          // Log failed usage if context provided
          if (context) {
            const provider = this.config.baseURL?.includes('together') ? 'together.ai' : 'mistral';
            const model = request.model || this.config.defaultModel;
            const durationMs = Date.now() - startTime;

            await llmUsageLogger.logUsage({
              ...context,
              provider,
              model,
            }, {
              tokensUsed: 0,
              durationMs,
              status: 'error',
            });
          }

          throw lastError;
        }

        const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.warn(`[${requestId}] LLM Retry ${attempt}/${this.config.maxRetries} in ${delay}ms:`, lastError.message);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Make the actual HTTP request to Mistral/Together API
   */
  private async makeRequest(request: LLMRequest, requestId: string): Promise<LLMResponse> {
    const model = request.model || this.config.defaultModel;
    const timeout = request.timeout || this.config.timeout;

    // Build request payload compatible with Together.ai/Mistral API
    const payload = {
      model,
      messages: request.messages,
      temperature: request.temperature ?? 0.1,
      max_tokens: request.max_tokens ?? 1000,
      stream: false,
      // Note: JSON mode support varies by provider - handle gracefully
      ...(request.response_format?.type === 'json_object' && {
        response_format: { type: 'json_object' }
      })
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createError(
          errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          this.mapStatusToErrorType(response.status),
          response.status
        );
      }

      const data = await response.json();
      return this.parseResponse(data, requestId);

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(`Request timeout after ${timeout}ms`, 'timeout');
      }

      throw error;
    }
  }

  /**
   * Parse and validate API response
   */
  private parseResponse(data: any, requestId: string): LLMResponse {
    try {
      const choice = data.choices?.[0];
      if (!choice?.message?.content) {
        throw new Error('Invalid response format: missing content');
      }

      const response: LLMResponse = {
        content: choice.message.content,
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
        } : undefined,
        model: data.model,
        finish_reason: choice.finish_reason,
      };

      return response;

    } catch (parseError) {
      console.error(`[${requestId}] Response parse error:`, parseError);
      throw this.createError(
        `Failed to parse API response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        'parse_error'
      );
    }
  }

  /**
   * Parse JSON response with fallback handling
   */
  parseJSONResponse<T = any>(content: string, requestId?: string): T {
    try {
      // First, try direct JSON parsing
      return JSON.parse(content);
    } catch (error) {
      // Fallback: try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (extractError) {
          // Continue to final fallback
        }
      }

      // Final fallback: try to find JSON-like content
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        try {
          return JSON.parse(content.slice(jsonStart, jsonEnd + 1));
        } catch (fallbackError) {
          // Give up and throw original error
        }
      }

      const errorId = requestId || 'unknown';
      console.error(`[${errorId}] JSON parse failed. Content preview:`, content.substring(0, 200));
      throw this.createError(
        `Failed to parse JSON from LLM response: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        'parse_error'
      );
    }
  }

  /**
   * Backward compatibility method matching OpenAI SDK structure
   */
  get chat() {
    return {
      completions: {
        create: (request: LLMRequest) => this.createChatCompletion(request)
      }
    };
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    // This method should check if the LLM service is generally available,
    // which depends on having an API key.
    return this.isConfigured();
  }

  /**
   * Alias for isAvailable() for backward compatibility
   */
  private isConfigured(): boolean {
    const hasKey = !!(this.openaiApiKey && this.openaiApiKey.length > 0);
    console.log(`🔍 [LLM-CLIENT] API Key configured: ${hasKey ? 'YES' : 'NO'}`);
    if (!hasKey) {
      console.log(`❌ [LLM-CLIENT] OpenAI API key missing or empty`);
    }
    return hasKey;
  }

  /**
   * Get service configuration for debugging
   */
  getStatus(): { available: boolean; model: string; provider: string; reason?: string } {
    return {
      available: this.isAvailable(),
      model: this.config.defaultModel,
      provider: this.config.baseURL?.includes('together') ? 'Together.ai' : 'Mistral',
      reason: !this.config.apiKey ? 'API key not configured' : undefined
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    // Update the internal openaiApiKey as well if it's changed
    if (newConfig.apiKey !== undefined) {
      this.openaiApiKey = newConfig.apiKey;
    }
    console.log(`✅ LLM Client config updated: ${this.config.defaultModel}`);
  }

  // Private helper methods

  private createError(message: string, type: LLMError['type'] = 'api_error', status?: number): LLMError {
    const error = new Error(message) as LLMError;
    error.type = type;
    error.status = status;
    return error;
  }

  private normalizeError(error: any, requestId: string): LLMError {
    if (error instanceof Error) {
      // Check for specific error types that might be missed by instanceof
      if (error.message.includes('API key not configured')) {
        return { ...error, type: 'api_error', status: 401 } as LLMError;
      }
      // Add more specific error type checks if needed
      return error as LLMError;
    }

    // Handle cases where error is not an Error instance
    const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
    return this.createError(
      `LLM Error: ${errorMessage}`,
      'api_error' // Default to api_error for unknown types
    );
  }

  private shouldRetry(error: LLMError): boolean {
    // Don't retry on client errors (4xx) except rate limits
    if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
      return false;
    }

    // Retry on network errors, timeouts, and server errors
    return ['network_error', 'timeout', 'rate_limit'].includes(error.type || '') || 
           !!(error.status && error.status >= 500);
  }

  private mapStatusToErrorType(status: number): LLMError['type'] {
    if (status === 429) return 'rate_limit';
    if (status >= 500) return 'api_error';
    if (status >= 400) return 'api_error';
    return 'network_error';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const llmClient = new LLMClient();

// Export factory function for custom configurations
export function createLLMClient(config?: Partial<LLMConfig>): LLMClient {
  return new LLMClient(config);
}

// Re-export types for consumers (avoiding conflicts)
export type { LLMRequest as LLMRequestType, LLMResponse as LLMResponseType, LLMMessage as LLMMessageType, LLMError as LLMErrorType };