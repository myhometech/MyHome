/**
 * THMB-2: Thumbnail Job Queue System
 * 
 * Manages async thumbnail generation jobs with BullMQ (Redis) or in-memory fallback.
 * Provides job enqueuing, status tracking, and idempotency handling.
 */

import { Queue, Worker, Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { logThumbnailRequested } from './auditLogger';
import { ThumbnailRenderingService, ThumbnailJob, ThumbnailResult, ThumbnailError, ThumbnailErrorCode } from './thumbnailRenderingService';
import { storage } from './storage';
import { inlineWorker } from './start-inline-worker';

export interface ThumbnailJobPayload {
  jobId: string;
  documentId: number;
  sourceHash: string;
  variants: number[];
  mimeType: string;
  userId: string;
  householdId?: string;
}

export interface ThumbnailJobStatus {
  jobId: string;
  documentId: number;
  variant: number;
  status: 'queued' | 'processing' | 'success' | 'failed';
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface EnqueueResult {
  jobId: string;
  status: 'queued';
  retryAfterMs: number;
}

/**
 * In-memory job tracking for environments without Redis
 */
class InMemoryJobTracker {
  private jobs = new Map<string, ThumbnailJobStatus>();
  private jobQueue: ThumbnailJobPayload[] = [];
  private processing = false;

  enqueue(payload: ThumbnailJobPayload): EnqueueResult {
    // Add to queue
    this.jobQueue.push(payload);

    // Track each variant as separate job status
    payload.variants.forEach(variant => {
      const jobStatus: ThumbnailJobStatus = {
        jobId: payload.jobId,
        documentId: payload.documentId,
        variant,
        status: 'queued',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.jobs.set(`${payload.jobId}:${variant}`, jobStatus);
    });

    console.log(`📋 [IN-MEMORY] Enqueued thumbnail job ${payload.jobId} for document ${payload.documentId}`);
    
    // THMB-RECOVER: Kick off processing if not already running
    if (!this.processing) {
      setTimeout(() => this.processNextJob(), 100);
    }
    
    return {
      jobId: payload.jobId,
      status: 'queued',
      retryAfterMs: 2000
    };
  }

  getJobStatus(jobId: string, variant?: number): ThumbnailJobStatus | undefined {
    if (variant !== undefined) {
      return this.jobs.get(`${jobId}:${variant}`);
    }
    
    // Return first matching job status for any variant
    for (const [key, status] of Array.from(this.jobs.entries())) {
      if (status.jobId === jobId) {
        return status;
      }
    }
    return undefined;
  }

  getAllJobs(): ThumbnailJobStatus[] {
    return Array.from(this.jobs.values());
  }

  updateJobStatus(jobId: string, variant: number, status: ThumbnailJobStatus['status'], errorCode?: string) {
    const key = `${jobId}:${variant}`;
    const job = this.jobs.get(key);
    if (job) {
      job.status = status;
      job.errorCode = errorCode;
      job.updatedAt = new Date();
      this.jobs.set(key, job);
    }
  }

  // THMB-3: Actual thumbnail processing
  async processNextJob(): Promise<boolean> {
    if (this.processing || this.jobQueue.length === 0) {
      return false;
    }

    this.processing = true;
    const payload = this.jobQueue.shift()!;
    
    console.log(`🔄 [IN-MEMORY] Processing job ${payload.jobId}`);
    
    // Mark all variants as processing
    payload.variants.forEach(variant => {
      this.updateJobStatus(payload.jobId, variant, 'processing');
    });

    try {
      // Get document details from storage
      const document = await storage.getDocument(payload.documentId, 'system');
      if (!document) {
        throw new Error(`Document ${payload.documentId} not found`);
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

      // Process with rendering service
      const renderingService = new ThumbnailRenderingService();
      const result = await renderingService.processJob(thumbnailJob);

      // Mark all variants as success
      payload.variants.forEach(variant => {
        this.updateJobStatus(payload.jobId, variant, 'success');
      });

      console.log(`✅ [IN-MEMORY] Job ${payload.jobId} completed successfully`);

    } catch (error: any) {
      console.error(`❌ [IN-MEMORY] Job ${payload.jobId} failed:`, error);
      
      // Mark all variants as failed
      payload.variants.forEach(variant => {
        this.updateJobStatus(payload.jobId, variant, 'failed', error.message);
      });
    } finally {
      this.processing = false;
      
      // Process next job if available
      setTimeout(() => this.processNextJob(), 100);
    }

    return true;
  }
}

/**
 * Redis-based job queue using BullMQ
 */
class RedisJobQueue {
  private queue: Queue<ThumbnailJobPayload>;
  private worker?: Worker<ThumbnailJobPayload>;

  constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 1,
    };

    this.queue = new Queue('thumbnail-generation', {
      connection: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 2,           // THMB-5: Max 2 retries for retryable codes
        backoff: {
          type: 'custom',
          delay: 2000,
        },
      },
    });

    // THMB-3: Initialize worker with actual thumbnail processing
    this.worker = new Worker<ThumbnailJobPayload>('thumbnail-generation', 
      async (job: Job<ThumbnailJobPayload>) => {
        return await this.processJob(job.data);
      }, 
      { 
        connection: redisConfig,
        concurrency: 2 // Process up to 2 jobs concurrently
      }
    );

    console.log('📋 [REDIS] BullMQ thumbnail job queue initialized with rendering worker');
  }

  /**
   * THMB-3: Process thumbnail generation job with rendering service
   */
  private async processJob(jobData: ThumbnailJobPayload): Promise<any> {
    const correlationId = jobData.jobId;
    console.log(`🎨 [REDIS] Starting thumbnail processing for job ${correlationId}`);

    try {
      // Get document details from storage
      const document = await storage.getDocument(jobData.documentId, 'system');
      if (!document) {
        throw new ThumbnailError(
          ThumbnailErrorCode.STORAGE_READ_FAILURE,
          `Document ${jobData.documentId} not found`,
          false
        );
      }

      // Build job data for rendering service
      const thumbnailJob: ThumbnailJob = {
        jobId: jobData.jobId,
        documentId: jobData.documentId,
        sourceHash: jobData.sourceHash,
        variants: jobData.variants,
        mimeType: jobData.mimeType,
        userId: jobData.userId,
        householdId: jobData.householdId,
        filePath: document.gcsPath || document.filePath
      };

      // Process with rendering service
      const renderingService = new ThumbnailRenderingService();
      const result = await renderingService.processJob(thumbnailJob);

      // Emit success event
      this.emitThumbnailCreated(result);

      console.log(`✅ [REDIS] Job ${correlationId} completed successfully`);
      return { 
        success: true, 
        documentId: result.documentId,
        variantsGenerated: result.variants.length,
        message: 'Thumbnail generation completed' 
      };

    } catch (error: any) {
      console.error(`❌ [REDIS] Job ${correlationId} failed:`, error);

      // Emit failure event
      this.emitThumbnailFailed(jobData, error);

      // Determine if job should be retried
      if (error instanceof ThumbnailError) {
        const shouldRetry = ThumbnailError.isRetryable(error.code);
        if (!shouldRetry) {
          console.log(`🚫 [REDIS] Job ${correlationId} marked as non-retryable: ${error.code}`);
        }
        throw error; // Let BullMQ handle retry logic
      } else {
        // Unknown errors are treated as retryable by default
        throw new ThumbnailError(
          ThumbnailErrorCode.TIMEOUT_ERROR,
          `Unknown error: ${error.message}`,
          true
        );
      }
    }
  }

  /**
   * Emit thumbnail.created event
   */
  private emitThumbnailCreated(result: ThumbnailResult): void {
    try {
      console.log(`📢 [EVENT] thumbnail.created for document ${result.documentId}`);
      // This could be extended to emit to an event system
      // For now, just log the successful creation
    } catch (error) {
      console.error('Failed to emit thumbnail.created event:', error);
    }
  }

  /**
   * Emit thumbnail.failed event
   */
  private emitThumbnailFailed(jobData: ThumbnailJobPayload, error: any): void {
    try {
      const errorCode = error instanceof ThumbnailError ? error.code : 'UNKNOWN_ERROR';
      console.log(`📢 [EVENT] thumbnail.failed for document ${jobData.documentId}: ${errorCode}`);
      // This could be extended to emit to an event system
    } catch (emitError) {
      console.error('Failed to emit thumbnail.failed event:', emitError);
    }
  }

  async enqueue(payload: ThumbnailJobPayload): Promise<EnqueueResult> {
    // Create idempotency key
    const idempotencyKey = `${payload.documentId}:${payload.sourceHash}:${payload.variants.join(',')}`;
    
    const job = await this.queue.add('generate-thumbnails', payload, {
      jobId: payload.jobId,
      delay: 0,
      removeOnComplete: true,
      removeOnFail: true,
    });

    console.log(`📋 [REDIS] Enqueued thumbnail job ${payload.jobId} for document ${payload.documentId}`);
    return {
      jobId: payload.jobId,
      status: 'queued',
      retryAfterMs: 2000
    };
  }

  async getJobStatus(jobId: string): Promise<ThumbnailJobStatus | undefined> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return undefined;

      const status = await job.getState();
      return {
        jobId,
        documentId: job.data.documentId,
        variant: job.data.variants[0], // Return first variant for now
        status: this.mapBullMQStatus(status),
        createdAt: new Date(job.timestamp),
        updatedAt: new Date(job.processedOn || job.timestamp)
      };
    } catch (error) {
      console.error(`Error getting job status for ${jobId}:`, error);
      return undefined;
    }
  }

  private mapBullMQStatus(bullmqStatus: string): ThumbnailJobStatus['status'] {
    switch (bullmqStatus) {
      case 'waiting':
      case 'delayed':
        return 'queued';
      case 'active':
        return 'processing';
      case 'completed':
        return 'success';
      case 'failed':
        return 'failed';
      default:
        return 'queued';
    }
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}

/**
 * Main thumbnail job queue service
 */
class ThumbnailJobQueueService {
  private redisQueue?: RedisJobQueue;
  private inMemoryTracker = new InMemoryJobTracker();
  private useRedis = false;

  async initialize(): Promise<void> {
    try {
      // Try to initialize Redis-based queue
      this.redisQueue = new RedisJobQueue();
      this.useRedis = true;
      console.log('✅ [THMB-2] Thumbnail job queue initialized with Redis/BullMQ');
    } catch (error) {
      console.warn('⚠️ [THMB-2] Redis unavailable, falling back to in-memory job tracking:', error);
      this.useRedis = false;
    }
  }

  async enqueueJob(payload: Omit<ThumbnailJobPayload, 'jobId'>): Promise<EnqueueResult> {
    const jobId = nanoid();
    const fullPayload: ThumbnailJobPayload = {
      ...payload,
      jobId
    };

    // Emit audit event
    try {
      await logThumbnailRequested(payload.documentId, payload.userId, payload.householdId, {
        variants: payload.variants,
        jobId,
        sourceHash: payload.sourceHash,
        actor: 'user'
      });
    } catch (auditError) {
      console.error('Failed to log thumbnail requested audit event:', auditError);
      // Don't fail the job for audit logging issues
    }

    // THMB-RECOVER: Try inline worker first if enabled
    if (inlineWorker.isEnabled()) {
      console.log(`🚀 [INLINE-WORKER] Attempting immediate processing for job ${jobId}`);
      
      // Fire-and-forget inline processing (don't block the response)
      inlineWorker.processJobImmediately(fullPayload).catch(error => {
        console.error(`⚠️ [INLINE-WORKER] Failed for job ${jobId}:`, error.message);
      });
    }

    if (this.useRedis && this.redisQueue) {
      return await this.redisQueue.enqueue(fullPayload);
    } else {
      return this.inMemoryTracker.enqueue(fullPayload);
    }
  }

  async getJobStatus(jobId: string, variant?: number): Promise<ThumbnailJobStatus | undefined> {
    if (this.useRedis && this.redisQueue) {
      return await this.redisQueue.getJobStatus(jobId);
    } else {
      return this.inMemoryTracker.getJobStatus(jobId, variant);
    }
  }

  generateIdempotencyKey(documentId: number, sourceHash: string, variant: number): string {
    return `${documentId}:${sourceHash}:${variant}`;
  }

  async close(): Promise<void> {
    if (this.redisQueue) {
      await this.redisQueue.close();
    }
  }
}

// Singleton instance
export const thumbnailJobQueue = new ThumbnailJobQueueService();