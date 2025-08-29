import { z } from 'zod';

// Request/Response schemas matching the specification
export const LLMGenerateRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string()
  })),
  max_tokens: z.number().positive().default(512),
  temperature: z.number().min(0).max(2).default(0.1),
  stop: z.array(z.string()).default([])
});

export const LLMGenerateResponseSchema = z.object({
  text: z.string(),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number()
  }),
  latencyMs: z.number()
});

export type LLMGenerateRequest = z.infer<typeof LLMGenerateRequestSchema>;
export type LLMGenerateResponse = z.infer<typeof LLMGenerateResponseSchema>;

// Provider interface
export interface LLMProvider {
  name: string;
  generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse>;
  isHealthy(): Promise<boolean>;
}

// Circuit breaker states
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringWindowMs: number;
}

// Circuit breaker for provider resilience
class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'CLOSED';
        this.failures = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// LLM Adapter with provider abstraction and circuit breaker
export class LLMAdapter {
  private provider: LLMProvider;
  private circuitBreaker: CircuitBreaker;
  private config: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
    logPrompts: boolean;
  };

  constructor(provider: LLMProvider) {
    this.provider = provider;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      monitoringWindowMs: 300000 // 5 minutes
    });
    
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '15000'),
      logPrompts: process.env.LOG_PROMPTS === 'true'
    };
  }

  async generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    // Validate request
    const validatedRequest = LLMGenerateRequestSchema.parse(request);
    
    // Log request (only if enabled)
    if (this.config.logPrompts) {
      console.log(`[LLM-ADAPTER] Request: ${JSON.stringify(validatedRequest, null, 2)}`);
    }

    const startTime = Date.now();
    let lastError: Error | null = null;

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.circuitBreaker.execute(() => 
          this.executeWithTimeout(validatedRequest)
        );
        
        const latencyMs = Date.now() - startTime;
        const finalResponse = { ...response, latencyMs };
        
        console.log(`[LLM-ADAPTER] Success: ${this.provider.name}, attempt ${attempt}, ${latencyMs}ms`);
        return finalResponse;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`[LLM-ADAPTER] Attempt ${attempt}/${this.config.maxRetries} failed: ${lastError.message}`);
        
        if (attempt < this.config.maxRetries && this.shouldRetry(lastError)) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          console.log(`[LLM-ADAPTER] Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    console.error(`[LLM-ADAPTER] All ${this.config.maxRetries} attempts failed`);
    throw lastError || new Error('LLM generation failed');
  }

  private async executeWithTimeout(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      try {
        const result = await this.provider.generate(request);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private shouldRetry(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('network') ||
           message.includes('rate limit') ||
           message.includes('500') ||
           message.includes('502') ||
           message.includes('503') ||
           message.includes('504');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProviderName(): string {
    return this.provider.name;
  }

  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  async healthCheck(): Promise<boolean> {
    try {
      return await this.provider.isHealthy();
    } catch {
      return false;
    }
  }
}