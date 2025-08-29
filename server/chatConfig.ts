/**
 * Chat Configuration Service
 * Manages chat feature flags and configuration values
 */

import { featureFlagService } from './featureFlagService.js';

export interface ChatConfig {
  // Feature flags
  enabled: boolean;
  showFilters: boolean;
  numericVerifier: boolean;
  
  // Configuration values
  maxAnswerTokens: number;
  maxContextChars: number;
}

export interface ChatConfigContext {
  userId: string;
  userTier: 'free' | 'beginner' | 'pro' | 'duo';
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Configuration defaults for chat system
 * Can be overridden by environment variables
 */
const CONFIG_DEFAULTS = {
  maxAnswerTokens: parseInt(process.env.CHAT_MAX_ANSWER_TOKENS || '512'),
  maxContextChars: parseInt(process.env.CHAT_MAX_CONTEXT_CHARS || '12000'),
} as const;

export class ChatConfigService {
  /**
   * Map subscription tier to feature flag tier
   */
  private mapTierToFlagTier(userTier: 'free' | 'beginner' | 'pro' | 'duo'): 'free' | 'premium' {
    return userTier === 'free' ? 'free' : 'premium';
  }

  /**
   * Get complete chat configuration for a user
   */
  async getChatConfig(context: ChatConfigContext): Promise<ChatConfig> {
    try {
      const flagContext = {
        userId: context.userId,
        userTier: this.mapTierToFlagTier(context.userTier),
        sessionId: context.sessionId,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress
      };

      // Evaluate feature flags
      const [enabled, showFilters, numericVerifier] = await Promise.all([
        featureFlagService.isFeatureEnabled('CHAT_ENABLED', flagContext, false),
        featureFlagService.isFeatureEnabled('CHAT_SHOW_FILTERS', flagContext, false),
        featureFlagService.isFeatureEnabled('CHAT_NUMERIC_VERIFIER', flagContext, false)
      ]);

      return {
        // Feature flags
        enabled,
        showFilters,
        numericVerifier,
        
        // Configuration values
        maxAnswerTokens: CONFIG_DEFAULTS.maxAnswerTokens,
        maxContextChars: CONFIG_DEFAULTS.maxContextChars,
      };
    } catch (error) {
      console.error('Failed to get chat config:', error);
      
      // Return safe defaults on error
      return {
        enabled: false,
        showFilters: false,
        numericVerifier: false,
        maxAnswerTokens: CONFIG_DEFAULTS.maxAnswerTokens,
        maxContextChars: CONFIG_DEFAULTS.maxContextChars,
      };
    }
  }

  /**
   * Check if chat is enabled for a user (for middleware)
   */
  async isChatEnabled(context: ChatConfigContext): Promise<boolean> {
    try {
      const flagContext = {
        userId: context.userId,
        userTier: this.mapTierToFlagTier(context.userTier),
        sessionId: context.sessionId,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress
      };

      return await featureFlagService.isFeatureEnabled('CHAT_ENABLED', flagContext, false);
    } catch (error) {
      console.error('Failed to check if chat is enabled:', error);
      return false; // Fail closed - chat disabled on error
    }
  }
}

export const chatConfigService = new ChatConfigService();