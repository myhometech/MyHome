/**
 * Email Import OCR Retry Integration
 * Handles immediate vs batch retry strategies for email-imported documents
 */

import { ocrRetryService } from './services/ocrRetryService';

export interface EmailOCRStrategy {
  documentId: number;
  userId: string;
  fileBuffer: Buffer;
  isEmailImport: boolean;
  priority: 'immediate' | 'batch' | 'background';
}

export class EmailOCRRetryManager {
  /**
   * Process OCR with email-specific retry strategy
   */
  static async processEmailDocument(
    strategy: EmailOCRStrategy,
    ocrFunction: (buffer: Buffer) => Promise<string>
  ): Promise<{ result: string; attempts: number; strategy: string }> {
    
    console.log(`📧 Processing email document ${strategy.documentId} with ${strategy.priority} priority`);

    switch (strategy.priority) {
      case 'immediate':
        // Email imports: Immediate retry with compression, no delays
        try {
          const result = await ocrRetryService.executeWithRetry(
            strategy.documentId,
            strategy.userId,
            strategy.fileBuffer,
            ocrFunction,
            { immediateRetry: true, lowPriority: false }
          );
          
          return {
            result: result.result,
            attempts: result.attempts,
            strategy: 'immediate_retry_with_compression'
          };
        } catch (error) {
          console.error(`❌ Immediate OCR retry failed for email document ${strategy.documentId}:`, error);
          // Fall back to batch processing
          return this.scheduleBatchRetry(strategy, ocrFunction);
        }

      case 'batch':
        // Batch processing: Lower priority, delayed retries
        return this.scheduleBatchRetry(strategy, ocrFunction);

      case 'background':
        // Background processing: Lowest priority, maximum compression
        return this.scheduleBackgroundRetry(strategy, ocrFunction);

      default:
        throw new Error(`Unknown email OCR strategy: ${strategy.priority}`);
    }
  }

  private static async scheduleBatchRetry(
    strategy: EmailOCRStrategy,
    ocrFunction: (buffer: Buffer) => Promise<string>
  ): Promise<{ result: string; attempts: number; strategy: string }> {
    
    console.log(`📦 Batch processing email document ${strategy.documentId}`);
    
    const result = await ocrRetryService.executeWithRetry(
      strategy.documentId,
      strategy.userId,
      strategy.fileBuffer,
      ocrFunction,
      { immediateRetry: false, lowPriority: true }
    );

    return {
      result: result.result,
      attempts: result.attempts,
      strategy: 'batch_processing_with_delays'
    };
  }

  private static async scheduleBackgroundRetry(
    strategy: EmailOCRStrategy,
    ocrFunction: (buffer: Buffer) => Promise<string>
  ): Promise<{ result: string; attempts: number; strategy: string }> {
    
    console.log(`🔄 Background processing email document ${strategy.documentId}`);
    
    // Force maximum compression for background processing
    const compressionConfig = ocrRetryService.getConfig();
    const originalConfig = { ...compressionConfig };
    
    // Temporarily update to aggressive compression
    ocrRetryService.updateConfig({
      compressionLevels: [
        {
          level: 1,
          quality: 60,
          maxWidth: 1200,
          removeMetadata: true,
          grayscale: true,
          description: 'Aggressive compression for background processing'
        }
      ]
    });

    try {
      const result = await ocrRetryService.executeWithRetry(
        strategy.documentId,
        strategy.userId,
        strategy.fileBuffer,
        ocrFunction,
        { immediateRetry: false, lowPriority: true }
      );

      return {
        result: result.result,
        attempts: result.attempts,
        strategy: 'background_aggressive_compression'
      };
    } finally {
      // Restore original configuration
      ocrRetryService.updateConfig(originalConfig);
    }
  }

  /**
   * Determine OCR priority based on email context
   */
  static determineEmailOCRPriority(
    documentSize: number,
    userTier: string,
    timeOfDay: number,
    systemLoad: number
  ): 'immediate' | 'batch' | 'background' {
    
    // Small documents and premium users get immediate processing
    if (documentSize < 5 * 1024 * 1024 && userTier === 'premium') {
      return 'immediate';
    }
    
    // Large documents or high system load get background processing
    if (documentSize > 20 * 1024 * 1024 || systemLoad > 80) {
      return 'background';
    }
    
    // Business hours (9 AM - 5 PM) get batch processing
    if (timeOfDay >= 9 && timeOfDay <= 17) {
      return 'batch';
    }
    
    // Off-hours default to immediate (lower system load)
    return 'immediate';
  }
}

export default EmailOCRRetryManager;