import { LLMAdapter, type LLMProvider } from './llmAdapter.js';
import { MistralProvider } from './mistralProvider.js';
import { LlamaProvider } from './llamaProvider.js';

/**
 * Factory for creating LLM providers based on configuration
 */
export class LLMProviderFactory {
  private static instance: LLMAdapter | null = null;

  /**
   * Get the configured LLM adapter instance (singleton)
   */
  static getInstance(): LLMAdapter {
    if (!this.instance) {
      const provider = this.createProvider();
      this.instance = new LLMAdapter(provider);
      console.log(`🚀 [LLM-FACTORY] LLM Adapter initialized with ${provider.name} provider`);
    }
    return this.instance;
  }

  /**
   * Create provider based on LLM_PROVIDER environment variable
   */
  private static createProvider(): LLMProvider {
    const providerName = process.env.LLM_PROVIDER || 'mistral';
    
    console.log(`🔧 [LLM-FACTORY] Creating provider: ${providerName}`);
    
    switch (providerName.toLowerCase()) {
      case 'mistral':
        return new MistralProvider();
      
      case 'llama':
      case 'together':
        return new LlamaProvider();
      
      default:
        console.warn(`⚠️ [LLM-FACTORY] Unknown provider: ${providerName}, falling back to mistral`);
        return new MistralProvider();
    }
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Get provider configuration info
   */
  static getConfig(): { provider: string; model: string; timeout: number } {
    const providerName = process.env.LLM_PROVIDER || 'mistral';
    const model = process.env.LLM_MODEL_STANDARD || 'mistral-small-latest';
    const timeout = parseInt(process.env.LLM_TIMEOUT_MS || '15000');
    
    return {
      provider: providerName,
      model,
      timeout
    };
  }
}