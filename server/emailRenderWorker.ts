import { Worker, Queue, Job } from 'bullmq';
import Redis from 'ioredis';
import { renderAndCreateEmailBodyPdf } from './emailBodyPdfService.js';
import { storage } from './storage';

// TICKET 8: CloudConvert-based Email Body PDF Rendering Worker

interface EmailRenderJobPayload {
  tenantId: string;
  messageId: string;
  subject?: string | null;
  from: string;
  to: string[];
  receivedAt: string;
  html?: string | null;
  text?: string | null;
  ingestGroupId?: string | null;
  categoryId?: string | null;
  tags?: string[];
  route: 'auto_no_attachments' | 'auto_with_attachments' | 'manual';
}

interface RenderMetrics {
  attempts: Map<string, number>;
  success: Map<string, number>;
  failures: Map<string, number>;
  skipped: Map<string, number>;
  sanitizeDurations: number[];
  renderDurations: number[];
  pdfSizes: number[];
  queueDepth: number;
  concurrencyInUse: number;
  memoryViolations: number;
}

export class EmailRenderWorker {
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private redis: Redis;
  private metrics: RenderMetrics;
  private readonly maxConcurrency: number;
  private isShuttingDown = false;

  constructor(
    redisConnection?: Redis,
    maxConcurrency: number = 2
  ) {
    this.maxConcurrency = maxConcurrency;
    this.redis = redisConnection || new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    this.metrics = {
      attempts: new Map(),
      success: new Map(),
      failures: new Map(),
      skipped: new Map(),
      sanitizeDurations: [],
      renderDurations: [],
      pdfSizes: [],
      queueDepth: 0,
      concurrencyInUse: 0,
      memoryViolations: 0
    };

    this.setupGracefulShutdown();
  }

  async initialize(): Promise<void> {
    if (this.worker) {
      console.log('⚠️  EmailRenderWorker already initialized');
      return;
    }

    try {
      console.log(`📧 Initializing CloudConvert EmailRenderWorker (concurrency: ${this.maxConcurrency})`);

      // Create queue
      this.queue = new Queue('email-pdf-render', {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 20,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          delay: 1000 // Small delay to prevent overwhelming CloudConvert API
        }
      });

      // Create worker
      this.worker = new Worker('email-pdf-render', this.processJob.bind(this), {
        connection: this.redis,
        concurrency: this.maxConcurrency,
        removeOnComplete: 50,
        removeOnFail: 20
      });

      this.setupEventHandlers();
      
      console.log('✅ CloudConvert EmailRenderWorker initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize EmailRenderWorker:', error);
      throw error;
    }
  }

  private async processJob(job: Job<EmailRenderJobPayload>): Promise<any> {
    const startTime = Date.now();
    const { data } = job;
    
    try {
      console.log(`📧 Processing email render job: ${data.messageId}`);
      console.log(`   Route: ${data.route}`);
      console.log(`   From: ${data.from}`);
      console.log(`   Subject: ${data.subject || 'No subject'}`);

      this.metrics.concurrencyInUse++;

      // Track attempt
      const attemptKey = `${data.tenantId}:${data.messageId}`;
      const currentAttempts = this.metrics.attempts.get(attemptKey) || 0;
      this.metrics.attempts.set(attemptKey, currentAttempts + 1);

      // Process the email body PDF with CloudConvert
      const result = await renderAndCreateEmailBodyPdf({
        tenantId: data.tenantId,
        messageId: data.messageId,
        subject: data.subject,
        from: data.from,
        to: data.to,
        receivedAt: data.receivedAt,
        html: data.html,
        text: data.text,
        ingestGroupId: data.ingestGroupId,
        categoryId: data.categoryId,
        tags: data.tags || ['email']
      });

      const renderTime = Date.now() - startTime;

      // Update metrics
      this.metrics.renderDurations.push(renderTime);
      const successKey = `${data.tenantId}:${data.messageId}`;
      const successCount = this.metrics.success.get(successKey) || 0;
      this.metrics.success.set(successKey, successCount + 1);

      console.log(`✅ Email PDF job completed: ${data.messageId}`);
      console.log(`   Document ID: ${result.documentId}`);
      console.log(`   Created: ${result.created}`);
      console.log(`   Render time: ${renderTime}ms`);

      return {
        success: true,
        documentId: result.documentId,
        filename: result.name,
        created: result.created,
        renderTimeMs: renderTime,
        engine: 'cloudconvert'
      };

    } catch (error) {
      const renderTime = Date.now() - startTime;
      
      // Update failure metrics
      const failureKey = `${data.tenantId}:${data.messageId}`;
      const failureCount = this.metrics.failures.get(failureKey) || 0;
      this.metrics.failures.set(failureKey, failureCount + 1);

      console.error(`❌ Email PDF job failed: ${data.messageId}`, error);
      console.error(`   Render time: ${renderTime}ms`);

      throw error;
    } finally {
      this.metrics.concurrencyInUse = Math.max(0, this.metrics.concurrencyInUse - 1);
    }
  }

  private setupEventHandlers(): void {
    if (!this.worker || !this.queue) return;

    this.worker.on('completed', (job) => {
      console.log(`✅ Email PDF job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Email PDF job failed: ${job?.id}`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('❌ Email PDF worker error:', err);
    });

    // Queue event handlers
    this.queue.on('waiting', (jobId) => {
      console.log(`📧 Email PDF job waiting: ${jobId}`);
    });

    this.queue.on('active', (job) => {
      this.metrics.queueDepth = Math.max(0, this.metrics.queueDepth - 1);
      console.log(`📧 Email PDF job active: ${job.id}`);
    });
  }

  async addJob(payload: EmailRenderJobPayload, priority: number = 0): Promise<string> {
    if (!this.queue) {
      throw new Error('EmailRenderWorker not initialized');
    }

    if (this.isShuttingDown) {
      throw new Error('EmailRenderWorker is shutting down');
    }

    const jobId = `email-pdf-${payload.tenantId}-${payload.messageId}-${Date.now()}`;
    
    try {
      const job = await this.queue.add('render-email-pdf', payload, {
        jobId,
        priority: -priority, // BullMQ uses negative priority for higher priority
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        }
      });

      this.metrics.queueDepth++;
      console.log(`📧 Added email PDF job to queue: ${jobId} (priority: ${priority})`);

      return job.id!;
    } catch (error) {
      console.error(`❌ Failed to add email PDF job to queue: ${jobId}`, error);
      throw error;
    }
  }

  async getQueueStatus(): Promise<any> {
    if (!this.queue) {
      return { error: 'Queue not initialized' };
    }

    try {
      const waiting = await this.queue.getWaiting();
      const active = await this.queue.getActive();
      const completed = await this.queue.getCompleted();
      const failed = await this.queue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        metrics: {
          queueDepth: this.metrics.queueDepth,
          concurrencyInUse: this.metrics.concurrencyInUse,
          totalAttempts: Array.from(this.metrics.attempts.values()).reduce((a, b) => a + b, 0),
          totalSuccess: Array.from(this.metrics.success.values()).reduce((a, b) => a + b, 0),
          totalFailures: Array.from(this.metrics.failures.values()).reduce((a, b) => a + b, 0),
          avgRenderTime: this.metrics.renderDurations.length > 0 
            ? Math.round(this.metrics.renderDurations.reduce((a, b) => a + b, 0) / this.metrics.renderDurations.length)
            : 0
        }
      };
    } catch (error) {
      console.error('❌ Failed to get queue status:', error);
      return { error: error.message };
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`📧 Received ${signal}, shutting down EmailRenderWorker gracefully...`);
      this.isShuttingDown = true;
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async cleanup(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.worker) {
      console.log('🧹 Closing CloudConvert EmailRenderWorker...');
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      console.log('🧹 Closing EmailRenderWorker queue...');
      await this.queue.close();
      this.queue = null;
    }

    if (this.redis) {
      await this.redis.quit();
    }

    console.log('✅ CloudConvert EmailRenderWorker cleanup complete');
  }

  getMetrics(): RenderMetrics {
    return { ...this.metrics };
  }
}

// Singleton instance
let emailRenderWorkerInstance: EmailRenderWorker | null = null;

export const emailRenderWorker = {
  async initialize(redisConnection?: Redis, maxConcurrency: number = 2): Promise<EmailRenderWorker> {
    if (!emailRenderWorkerInstance) {
      emailRenderWorkerInstance = new EmailRenderWorker(redisConnection, maxConcurrency);
      await emailRenderWorkerInstance.initialize();
    }
    return emailRenderWorkerInstance;
  },

  getInstance(): EmailRenderWorker | null {
    return emailRenderWorkerInstance;
  },

  async cleanup(): Promise<void> {
    if (emailRenderWorkerInstance) {
      await emailRenderWorkerInstance.cleanup();
      emailRenderWorkerInstance = null;
    }
  }
};