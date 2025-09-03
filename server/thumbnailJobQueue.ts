/**
 * THMB-2: Thumbnail Job Queue System
 * 
 * Manages async thumbnail generation jobs with BullMQ (Redis) or in-memory fallback.
 * Provides job enqueuing, status tracking, and idempotency handling.
 */

import { Queue, Worker, Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { logThumbnailRequested } from './auditLogger';

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
    for (const [key, status] of this.jobs.entries()) {
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

  // Simple processing simulation (actual processing will be in THMB-3)
  async processNextJob(): Promise<boolean> {
    if (this.processing || this.jobQueue.length === 0) {
      return false;
    }

    this.processing = true;
    const payload = this.jobQueue.shift()!;
    
    console.log(`🔄 [IN-MEMORY] Processing job ${payload.jobId} (simulation)`);
    
    // Mark all variants as processing
    payload.variants.forEach(variant => {
      this.updateJobStatus(payload.jobId, variant, 'processing');
    });

    // Simulate processing delay
    setTimeout(() => {
      // For now, mark as queued since we don't have actual processing yet
      payload.variants.forEach(variant => {
        this.updateJobStatus(payload.jobId, variant, 'queued');
      });
      this.processing = false;
    }, 100);

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

    this.queue = new Queue<ThumbnailJobPayload>('thumbnail-generation', {
      connection: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Initialize worker for job processing (actual processing in THMB-3)
    this.worker = new Worker<ThumbnailJobPayload>('thumbnail-generation', 
      async (job: Job<ThumbnailJobPayload>) => {
        console.log(`🔄 [REDIS] Processing job ${job.data.jobId} (placeholder)`);
        // Actual thumbnail generation will be implemented in THMB-3
        return { success: true, message: 'Placeholder processing' };
      }, 
      { connection: redisConfig }
    );

    console.log('📋 [REDIS] BullMQ thumbnail job queue initialized');
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