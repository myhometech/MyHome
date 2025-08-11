// Email Body PDF Feature Flag Service
// Provides server-side authoritative evaluation for email-related feature flags

import { featureFlagService } from './featureFlagService.js';

export class EmailFeatureFlagService {
  private featureFlagService = featureFlagService;

  /**
   * Quick evaluation for specific email PDF flags using the correct API
   */
  async isManualEmailPdfEnabled(userId: string, userTier: string = 'free'): Promise<boolean> {
    try {
      const context = {
        userId,
        userTier,
        sessionId: null,
        userAgent: null,
        ipAddress: null
      };
      return await this.featureFlagService.isFeatureEnabled('EMAIL_PDF_MANUAL', context, true);
    } catch (error) {
      console.error('Failed to check manual email PDF flag:', error);
      return true; // Safe fallback - always allow manual actions
    }
  }

  async isAutoNoAttachmentsEnabled(userId: string, userTier: string = 'free'): Promise<boolean> {
    try {
      const context = {
        userId,
        userTier,
        sessionId: null,
        userAgent: null,
        ipAddress: null
      };
      return await this.featureFlagService.isFeatureEnabled('EMAIL_PDF_AUTO_NO_ATTACHMENTS', context, true);
    } catch (error) {
      console.error('Failed to check auto no-attachments email PDF flag:', error);
      return false; // Safe fallback - don't auto-process
    }
  }

  async isAutoWithAttachmentsEnabled(userId: string, userTier: string = 'free'): Promise<boolean> {
    try {
      const context = {
        userId,
        userTier,
        sessionId: null,
        userAgent: null,
        ipAddress: null
      };
      return await this.featureFlagService.isFeatureEnabled('EMAIL_PDF_AUTO_WITH_ATTACHMENTS', context, true);
    } catch (error) {
      console.error('Failed to check auto with-attachments email PDF flag:', error);
      return false; // Safe fallback - don't auto-process
    }
  }

  /**
   * Frontend-compatible batch evaluation
   * Returns read-only flags for UI controls (showing/hiding kebab actions)
   */
  async getEmailPdfFlagsForFrontend(userId: string, userTier: string = 'free'): Promise<Record<string, boolean>> {
    const flags = await this.evaluateEmailPdfFlags(userId, userTier);
    
    return {
      'emailPdf.manualEnabled': flags.manualEnabled,
      'emailPdf.autoNoAttachmentsEnabled': flags.autoNoAttachmentsEnabled,
      'emailPdf.autoWithAttachmentsEnabled': flags.autoWithAttachmentsEnabled,
      'emailPdf.autoTagging': flags.autoTagging,
      'emailPdf.defaultCategoryId': !!flags.defaultCategoryId
    };
  }

  /**
   * Get the default category ID for email body PDFs if configured
   */
  async getDefaultCategoryId(userId: string, userTier: string = 'free'): Promise<string | null> {
    try {
      const isEnabled = await this.featureFlagService.isEnabled('emailPdf.defaultCategoryId', userId, userTier);
      if (!isEnabled) return null;

      const categoryValue = await this.featureFlagService.getFlagValue('emailPdf.defaultCategoryId');
      return typeof categoryValue === 'string' ? categoryValue : null;
    } catch (error) {
      console.error('Failed to get default category ID for email PDFs:', error);
      return null;
    }
  }

  /**
   * Development/testing helper - get all email PDF flags with details
   */
  async getEmailPdfFlagsDebug(userId: string, userTier: string = 'free'): Promise<any> {
    const flags = await this.evaluateEmailPdfFlags(userId, userTier);
    
    return {
      userId,
      userTier,
      timestamp: new Date().toISOString(),
      flags,
      evaluation: {
        manualActionsAvailable: flags.manualEnabled,
        autoProcessingForEmptyEmails: flags.autoNoAttachmentsEnabled,
        autoProcessingWithAttachments: flags.autoWithAttachmentsEnabled,
        autoTaggingActive: flags.autoTagging,
        hasDefaultCategory: !!flags.defaultCategoryId,
        defaultCategoryId: flags.defaultCategoryId
      }
    };
  }
}

// Singleton instance for use across the application
export const emailFeatureFlagService = new EmailFeatureFlagService();