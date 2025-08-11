// Email Body PDF Feature Flag Service
// Provides server-side authoritative evaluation for email-related feature flags

import { featureFlagService } from './featureFlagService.js';

export interface EmailPdfFeatureFlags {
  manualEnabled: boolean;
  autoNoAttachmentsEnabled: boolean;
  autoWithAttachmentsEnabled: boolean;
  autoTagging: boolean;
  defaultCategoryId: string | null;
}

export class EmailFeatureFlagService {
  private featureFlagService = featureFlagService;

  /**
   * Server-side authoritative evaluation for Email Body PDF features
   * Used by Mailgun ingest handler and /api/email/render-to-pdf
   */
  async evaluateEmailPdfFlags(userId: string, userTier: string = 'free'): Promise<EmailPdfFeatureFlags> {
    const flagKeys = [
      'emailPdf.manualEnabled',
      'emailPdf.autoNoAttachmentsEnabled', 
      'emailPdf.autoWithAttachmentsEnabled',
      'emailPdf.autoTagging',
      'emailPdf.defaultCategoryId'
    ];

    try {
      const evaluations = await this.featureFlagService.evaluateMultipleFlags(userId, userTier, flagKeys);
      
      // Extract defaultCategoryId from flag value (stored as JSON string)
      let defaultCategoryId: string | null = null;
      if (evaluations['emailPdf.defaultCategoryId']) {
        try {
          const categoryValue = await this.featureFlagService.getFlagValue('emailPdf.defaultCategoryId');
          if (categoryValue && typeof categoryValue === 'string') {
            defaultCategoryId = categoryValue;
          }
        } catch (error) {
          console.warn('Failed to parse emailPdf.defaultCategoryId flag value:', error);
        }
      }

      return {
        manualEnabled: evaluations['emailPdf.manualEnabled'] || false,
        autoNoAttachmentsEnabled: evaluations['emailPdf.autoNoAttachmentsEnabled'] || false,
        autoWithAttachmentsEnabled: evaluations['emailPdf.autoWithAttachmentsEnabled'] || false,
        autoTagging: evaluations['emailPdf.autoTagging'] || false,
        defaultCategoryId
      };

    } catch (error) {
      console.error('Failed to evaluate email PDF feature flags:', error);
      
      // Safe fallbacks for production
      return {
        manualEnabled: true,  // Always allow manual actions as fallback
        autoNoAttachmentsEnabled: false,
        autoWithAttachmentsEnabled: false,
        autoTagging: true,    // Safe default for tagging
        defaultCategoryId: null
      };
    }
  }

  /**
   * Quick evaluation for specific email PDF flags
   */
  async isManualEmailPdfEnabled(userId: string, userTier: string = 'free'): Promise<boolean> {
    try {
      return await this.featureFlagService.isEnabled('emailPdf.manualEnabled', userId, userTier);
    } catch (error) {
      console.error('Failed to check manual email PDF flag:', error);
      return true; // Safe fallback - always allow manual actions
    }
  }

  async isAutoNoAttachmentsEnabled(userId: string, userTier: string = 'free'): Promise<boolean> {
    try {
      return await this.featureFlagService.isEnabled('emailPdf.autoNoAttachmentsEnabled', userId, userTier);
    } catch (error) {
      console.error('Failed to check auto no-attachments email PDF flag:', error);
      return false; // Safe fallback - don't auto-process
    }
  }

  async isAutoWithAttachmentsEnabled(userId: string, userTier: string = 'free'): Promise<boolean> {
    try {
      return await this.featureFlagService.isEnabled('emailPdf.autoWithAttachmentsEnabled', userId, userTier);
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