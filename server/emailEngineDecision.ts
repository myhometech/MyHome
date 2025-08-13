/**
 * Email Engine Decision Service
 * 
 * Provides a drop-in wrapper for determining which conversion engines to use
 * for email body PDF generation and attachment conversion based on:
 * 1. Environment variable overrides (highest precedence)
 * 2. Feature flags with per-user rollout capability
 * 3. Default fallback (Puppeteer for body, no attachment conversion)
 */

import { featureFlagService } from './featureFlagService.js';

export type Engine = 'cloudconvert' | 'puppeteer';

export interface EngineDecision {
  body: Engine;
  convertAttachments: boolean;
  reason: string[];
}

export interface EngineDecisionContext {
  userId?: string;
  userTier?: 'free' | 'premium';
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Decides which engines to use for email conversion with proper precedence:
 * 1. ENV override (PDF_CONVERTER_ENGINE) wins
 * 2. DB flags via featureFlagService.isFeatureEnabled()
 * 3. Default fallback (Puppeteer body, no attachment conversion)
 */
export async function decideEngines(context: EngineDecisionContext = {}): Promise<EngineDecision> {
  const reasons: string[] = [];
  
  // 1. Check environment variable override first (highest precedence)
  const envEngine = process.env.PDF_CONVERTER_ENGINE as Engine | undefined;
  if (envEngine === 'cloudconvert' || envEngine === 'puppeteer') {
    reasons.push(`env:${envEngine}`);
    return {
      body: envEngine,
      convertAttachments: envEngine === 'cloudconvert',
      reason: reasons
    };
  }

  // 2. Check feature flags via database
  let bodyUseCloudConvert = false;
  let attachmentConversion = false;
  
  try {
    const flagContext = {
      userId: context.userId || 'anonymous',
      userTier: context.userTier || 'free',
      sessionId: context.sessionId,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress
    };

    bodyUseCloudConvert = await featureFlagService.isFeatureEnabled(
      'EMAIL_BODY_PDF_USE_CLOUDCONVERT',
      flagContext
    );
    
    attachmentConversion = await featureFlagService.isFeatureEnabled(
      'EMAIL_ATTACHMENT_CONVERT_TO_PDF',
      flagContext
    );
    
    reasons.push(`flag:body=${bodyUseCloudConvert}`, `flag:att=${attachmentConversion}`);
  } catch (error) {
    // DB failure → OFF by default per specification
    console.error('Feature flag evaluation error:', error);
    reasons.push('flag_eval_error');
    bodyUseCloudConvert = false;
    attachmentConversion = false;
  }

  // 3. Return decision based on flags
  return {
    body: bodyUseCloudConvert ? 'cloudconvert' : 'puppeteer',
    convertAttachments: attachmentConversion,
    reason: reasons
  };
}

/**
 * Legacy compatibility wrapper - maps from old userId-only API
 */
export async function decideEnginesLegacy(userId?: string): Promise<EngineDecision> {
  return decideEngines({ userId });
}