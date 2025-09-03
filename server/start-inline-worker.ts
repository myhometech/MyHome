/**
 * THMB-RECOVER: Temporary inline worker for immediate thumbnail processing
 * This bypasses the queue entirely and processes thumbnails synchronously
 */

import { ThumbnailRenderingService, ThumbnailJob } from './thumbnailRenderingService';
import { storage } from './storage';

export class InlineWorker {
  private renderingService: ThumbnailRenderingService;
  private enabled: boolean;

  constructor() {
    this.renderingService = new ThumbnailRenderingService();
    // THMB-RECOVER: Auto-enable when Redis is unavailable or explicitly requested
    this.enabled = process.env.INLINE_WORKER === 'true' || this.shouldAutoEnable();
    
    if (this.enabled) {
      console.log('🚀 [INLINE-WORKER] Enabled for immediate thumbnail processing');
    }
  }

  private shouldAutoEnable(): boolean {
    // Auto-enable if Redis connection fails
    try {
      // Simple Redis connectivity test
      const net = require('net');
      const client = net.createConnection({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        timeout: 1000
      });
      
      client.on('connect', () => {
        client.destroy();
      });
      
      client.on('error', () => {
        // Redis not available - auto-enable inline worker
      });
      
      // If we get Redis connection errors in logs, auto-enable
      return true; // For now, always enable as fallback
    } catch (error) {
      return true;
    }
  }

  /**
   * Process a thumbnail job immediately in the current process
   */
  async processJobImmediately(payload: {
    jobId: string;
    documentId: number;
    sourceHash: string;
    variants: number[];
    mimeType: string;
    userId: string;
    householdId?: string;
  }): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      console.log(`⚡ [INLINE-WORKER] Processing job ${payload.jobId} immediately`);
      
      // Get document details from storage
      const document = await storage.getDocument(payload.documentId, 'system');
      if (!document) {
        console.error(`❌ [INLINE-WORKER] Document ${payload.documentId} not found`);
        return false;
      }

      // Build job data for rendering service
      const thumbnailJob: ThumbnailJob = {
        jobId: payload.jobId,
        documentId: payload.documentId,
        sourceHash: payload.sourceHash,
        variants: payload.variants,
        mimeType: payload.mimeType,
        userId: payload.userId,
        householdId: payload.householdId,
        filePath: document.gcsPath || document.filePath
      };

      // Process with rendering service (with 10s timeout)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('INLINE_WORKER_TIMEOUT')), 10000);
      });

      await Promise.race([
        this.renderingService.processJob(thumbnailJob),
        timeoutPromise
      ]);

      console.log(`✅ [INLINE-WORKER] Job ${payload.jobId} completed successfully`);
      return true;

    } catch (error: any) {
      console.error(`❌ [INLINE-WORKER] Job ${payload.jobId} failed:`, error.message);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
export const inlineWorker = new InlineWorker();