/**
 * Background Job Service for Asynchronous Processing
 * Handles OCR processing, search index refresh, and other background tasks
 */

import { storage } from './storage';
import { processDocumentOCRAndSummary, processDocumentWithDateExtraction } from './ocrService';
import { tagSuggestionService } from './tagSuggestionService';

interface JobQueue {
  id: string;
  type: 'ocr_processing' | 'search_index_refresh' | 'bulk_operation';
  documentId?: number;
  userId: string;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  createdAt: Date;
  processedAt?: Date;
  error?: string;
}

class BackgroundJobService {
  private jobQueue: JobQueue[] = [];
  private isProcessing = false;
  private maxConcurrentJobs = 3;
  private currentJobs = 0;

  /**
   * Add OCR processing job to queue
   */
  async queueOCRProcessing(
    documentId: number,
    userId: string,
    filePath: string,
    fileName: string,
    mimeType: string,
    priority: number = 5
  ): Promise<string> {
    const jobId = `ocr_${documentId}_${Date.now()}`;
    
    const job: JobQueue = {
      id: jobId,
      type: 'ocr_processing',
      documentId,
      userId,
      filePath,
      fileName,
      mimeType,
      status: 'pending',
      priority,
      createdAt: new Date(),
    };

    this.jobQueue.push(job);
    this.sortQueueByPriority();
    
    console.log(`OCR job queued: ${jobId} for document ${documentId}`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return jobId;
  }

  /**
   * Add search index refresh job
   */
  async queueSearchIndexRefresh(userId: string, priority: number = 3): Promise<string> {
    const jobId = `search_refresh_${userId}_${Date.now()}`;
    
    const job: JobQueue = {
      id: jobId,
      type: 'search_index_refresh',
      userId,
      status: 'pending',
      priority,
      createdAt: new Date(),
    };

    this.jobQueue.push(job);
    this.sortQueueByPriority();
    
    console.log(`Search index refresh job queued: ${jobId} for user ${userId}`);
    
    if (!this.isProcessing) {
      this.processQueue();
    }

    return jobId;
  }

  /**
   * Process the job queue asynchronously
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.currentJobs >= this.maxConcurrentJobs) {
      return;
    }

    this.isProcessing = true;

    while (this.jobQueue.length > 0 && this.currentJobs < this.maxConcurrentJobs) {
      const job = this.jobQueue.shift();
      if (!job || job.status !== 'pending') continue;

      this.currentJobs++;
      job.status = 'processing';
      
      // Process job asynchronously
      this.processJob(job).finally(() => {
        this.currentJobs--;
      });
    }

    this.isProcessing = false;

    // Continue processing if there are more jobs
    if (this.jobQueue.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Process individual job
   */
  private async processJob(job: JobQueue): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`Processing job ${job.id} of type ${job.type}`);
      
      switch (job.type) {
        case 'ocr_processing':
          await this.processOCRJob(job);
          break;
        case 'search_index_refresh':
          await this.processSearchIndexRefresh(job);
          break;
        case 'bulk_operation':
          await this.processBulkOperation(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      job.status = 'completed';
      job.processedAt = new Date();
      
      const duration = Date.now() - startTime;
      console.log(`Job ${job.id} completed in ${duration}ms`);
      
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.processedAt = new Date();
      
      const duration = Date.now() - startTime;
      console.error(`Job ${job.id} failed after ${duration}ms:`, error);
    }
  }

  /**
   * Process OCR job with enhanced date extraction and tag suggestions
   */
  private async processOCRJob(job: JobQueue): Promise<void> {
    if (!job.documentId || !job.filePath || !job.fileName || !job.mimeType) {
      throw new Error('Missing required OCR job parameters');
    }

    try {
      // Enhanced OCR processing with date extraction
      await processDocumentWithDateExtraction(
        job.documentId,
        job.fileName,
        job.filePath,
        job.mimeType,
        job.userId,
        storage
      );
      
      // Get the updated document for tag suggestions
      const updatedDocument = await storage.getDocument(job.documentId, job.userId);
      if (updatedDocument?.extractedText) {
        // Generate tag suggestions based on extracted content
        const tagSuggestions = await tagSuggestionService.suggestTags(
          job.fileName,
          updatedDocument.extractedText,
          job.mimeType,
          updatedDocument.tags || []
        );
        
        // Auto-apply high-confidence tags
        const autoTags = [...(updatedDocument.tags || [])];
        tagSuggestions.suggestedTags.forEach(suggestion => {
          if (suggestion.confidence >= 0.8 && !autoTags.includes(suggestion.tag)) {
            autoTags.push(suggestion.tag);
          }
        });
        
        // Update document with auto-suggested tags
        if (autoTags.length > (updatedDocument.tags || []).length) {
          await storage.updateDocumentTags(job.documentId, job.userId, autoTags);
        }
      }
      
      console.log(`OCR processing completed for document ${job.documentId}`);
      
    } catch (ocrError) {
      console.error(`Enhanced OCR failed for document ${job.documentId}, falling back to basic OCR:`, ocrError);
      
      // Fallback to basic OCR
      try {
        const { extractedText, summary } = await processDocumentOCRAndSummary(
          job.filePath,
          job.fileName,
          job.mimeType
        );
        await storage.updateDocumentOCRAndSummary(job.documentId, job.userId, extractedText, summary);
        
        console.log(`Fallback OCR completed for document ${job.documentId}`);
      } catch (fallbackError) {
        throw new Error(`Both enhanced and fallback OCR failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Process search index refresh job
   */
  private async processSearchIndexRefresh(job: JobQueue): Promise<void> {
    // For PostgreSQL, we don't need to manually refresh indexes
    // This is a placeholder for future search engine integrations
    console.log(`Search index refresh completed for user ${job.userId}`);
  }

  /**
   * Process bulk operation job
   */
  private async processBulkOperation(job: JobQueue): Promise<void> {
    // Placeholder for bulk operations that need background processing
    console.log(`Bulk operation completed for user ${job.userId}`);
  }

  /**
   * Sort queue by priority (higher numbers = higher priority)
   */
  private sortQueueByPriority(): void {
    this.jobQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): JobQueue | undefined {
    return this.jobQueue.find(job => job.id === jobId) || this.getCompletedJob(jobId);
  }

  /**
   * Get completed job from memory (last 100 jobs)
   */
  private completedJobs: JobQueue[] = [];
  
  private getCompletedJob(jobId: string): JobQueue | undefined {
    return this.completedJobs.find(job => job.id === jobId);
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    totalJobs: number;
  } {
    const pending = this.jobQueue.filter(job => job.status === 'pending').length;
    const processing = this.jobQueue.filter(job => job.status === 'processing').length;
    const completed = this.completedJobs.filter(job => job.status === 'completed').length;
    const failed = this.completedJobs.filter(job => job.status === 'failed').length;
    
    return {
      pending,
      processing,
      completed,
      failed,
      totalJobs: pending + processing + completed + failed,
    };
  }

  /**
   * Clear completed jobs older than 24 hours
   */
  private cleanupCompletedJobs(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.completedJobs = this.completedJobs.filter(job => 
      !job.processedAt || job.processedAt > oneDayAgo
    );
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanupCompletedJobs();
    }, 60 * 60 * 1000); // Clean up every hour
  }
}

export const backgroundJobService = new BackgroundJobService();

// Start periodic cleanup
backgroundJobService.startPeriodicCleanup();