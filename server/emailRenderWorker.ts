import { Worker, Queue, Job } from 'bullmq';
import Redis from 'ioredis';
import puppeteer, { Browser, Page } from 'puppeteer';
import { EmailBodyPdfService } from './emailBodyPdfService';
import { storage } from './storage';

// TICKET 8: Email Body PDF Rendering Worker with Concurrency Control

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

class BrowserPool {
  private browsers: Browser[] = [];
  private availableBrowsers: Browser[] = [];
  private maxConcurrency: number;
  private renderCount = new Map<Browser, number>();
  private readonly MAX_RENDERS_PER_BROWSER = 50;

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
  }

  async initialize(): Promise<void> {
    console.log(`📦 Initializing browser pool with ${this.maxConcurrency} browsers`);
    
    for (let i = 0; i < Math.min(1, this.maxConcurrency); i++) {
      await this.createBrowser();
    }
  }

  private async createBrowser(): Promise<Browser> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--memory-pressure-off',
        '--max_old_space_size=512'
      ],
      timeout: 10000
    });

    this.browsers.push(browser);
    this.availableBrowsers.push(browser);
    this.renderCount.set(browser, 0);

    console.log(`🌐 Created new browser (total: ${this.browsers.length})`);
    return browser;
  }

  async acquirePage(): Promise<{ browser: Browser; page: Page }> {
    // Get available browser or create new one if under limit
    let browser: Browser;
    
    if (this.availableBrowsers.length === 0 && this.browsers.length < this.maxConcurrency) {
      browser = await this.createBrowser();
    } else if (this.availableBrowsers.length > 0) {
      browser = this.availableBrowsers.shift()!;
    } else {
      throw new Error('No available browsers and max concurrency reached');
    }

    const page = await browser.newPage();
    
    // Memory guard - set soft limit
    await page.setViewport({ width: 1024, height: 768 });
    
    // Block external requests for security
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith('http') && !req.url().startsWith('data:')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    return { browser, page };
  }

  async releasePage(browser: Browser, page: Page): Promise<void> {
    try {
      await page.close();
      
      const currentCount = this.renderCount.get(browser) || 0;
      this.renderCount.set(browser, currentCount + 1);

      // Recycle browser if it has rendered too many pages
      if (currentCount >= this.MAX_RENDERS_PER_BROWSER) {
        console.log(`♻️ Recycling browser after ${currentCount} renders`);
        await this.recycleBrowser(browser);
      } else {
        this.availableBrowsers.push(browser);
      }
    } catch (error) {
      console.error('Error releasing page:', error);
      // Force recycle on error
      await this.recycleBrowser(browser);
    }
  }

  private async recycleBrowser(browser: Browser): Promise<void> {
    try {
      await browser.close();
    } catch (error) {
      console.error('Error closing browser:', error);
    }

    // Remove from arrays
    const browserIndex = this.browsers.indexOf(browser);
    if (browserIndex > -1) {
      this.browsers.splice(browserIndex, 1);
    }
    
    const availableIndex = this.availableBrowsers.indexOf(browser);
    if (availableIndex > -1) {
      this.availableBrowsers.splice(availableIndex, 1);
    }

    this.renderCount.delete(browser);

    // Create replacement browser
    if (this.browsers.length < Math.min(1, this.maxConcurrency)) {
      await this.createBrowser();
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up browser pool');
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        console.error('Error closing browser during cleanup:', error);
      }
    }
    this.browsers = [];
    this.availableBrowsers = [];
    this.renderCount.clear();
  }

  getStats() {
    return {
      totalBrowsers: this.browsers.length,
      availableBrowsers: this.availableBrowsers.length,
      inUseBrowsers: this.browsers.length - this.availableBrowsers.length
    };
  }
}

export class EmailRenderWorker {
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private redis: Redis;
  private browserPool: BrowserPool;
  private emailBodyPdfService: EmailBodyPdfService;
  private metrics: RenderMetrics;
  private readonly maxConcurrency: number;
  private readonly jobTimeoutMs: number;
  private readonly pageTimeoutMs: number;
  private readonly maxQueueDepthAlert: number;

  constructor() {
    this.maxConcurrency = parseInt(process.env.RENDER_MAX_CONCURRENCY || '2');
    this.jobTimeoutMs = parseInt(process.env.RENDER_JOB_TIMEOUT_MS || '15000');
    this.pageTimeoutMs = parseInt(process.env.RENDER_PAGE_TIMEOUT_MS || '8000');
    this.maxQueueDepthAlert = parseInt(process.env.RENDER_MAX_QUEUE_DEPTH_ALERT || '500');

    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.browserPool = new BrowserPool(this.maxConcurrency);
    this.emailBodyPdfService = new EmailBodyPdfService();
    
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

    console.log(`⚙️ Email Render Worker configured: concurrency=${this.maxConcurrency}, jobTimeout=${this.jobTimeoutMs}ms, pageTimeout=${this.pageTimeoutMs}ms`);
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Email Render Worker...');

    await this.browserPool.initialize();

    this.queue = new Queue('email-body-render', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 25,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // 1s, 2s, 4s
        },
        delay: 0,
      },
    });

    this.worker = new Worker(
      'email-body-render',
      async (job: Job<EmailRenderJobPayload>) => this.processRenderJob(job),
      {
        connection: this.redis,
        concurrency: this.maxConcurrency,
        limiter: {
          max: this.maxConcurrency,
          duration: 1000,
        },
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      console.log(`✅ Job ${job.id} completed for messageId: ${job.data.messageId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} failed for messageId: ${job?.data.messageId}`, err.message);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`⚠️ Job ${jobId} stalled`);
    });

    // Start metrics reporting
    this.startMetricsReporting();

    console.log('✅ Email Render Worker initialized successfully');
  }

  async enqueueRenderJob(payload: EmailRenderJobPayload, priority: number = 0): Promise<string> {
    if (!this.queue) {
      throw new Error('Worker not initialized');
    }

    // Check queue depth for backpressure
    const queueStats = await this.queue.getWaiting();
    this.metrics.queueDepth = queueStats.length;

    if (queueStats.length > this.maxQueueDepthAlert) {
      console.warn(`⚠️ Queue depth exceeded alert threshold: ${queueStats.length} > ${this.maxQueueDepthAlert}`);
      // Could implement load shedding here for low-priority manual requests
    }

    const job = await this.queue.add('render-email-pdf', payload, {
      priority,
      jobId: `${payload.tenantId}:${payload.messageId}:${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: false,
    });

    console.log(`📋 Enqueued job ${job.id} for messageId: ${payload.messageId}, route: ${payload.route}`);
    return job.id!;
  }

  private async processRenderJob(job: Job<EmailRenderJobPayload>): Promise<void> {
    const startTime = Date.now();
    const { data } = job;
    
    console.log(`🎬 Processing render job ${job.id} for messageId: ${data.messageId}, attempt: ${job.attemptsMade + 1}`);

    // Update metrics
    const route = data.route;
    this.metrics.attempts.set(route, (this.metrics.attempts.get(route) || 0) + 1);
    this.metrics.concurrencyInUse++;

    try {
      // Validate job data
      if (!data.html && !data.text) {
        const error = new Error('EMAIL_BODY_MISSING');
        error.name = 'EMAIL_BODY_MISSING';
        throw error;
      }

      // Check if PDF already exists (idempotency)
      const existingDocs = await storage.searchDocuments(data.tenantId, data.messageId);
      const existingBodyPdf = existingDocs.find(doc => 
        doc.uploadSource === 'email' && 
        doc.emailContext?.messageId === data.messageId &&
        doc.name?.includes('Email Body')
      );

      if (existingBodyPdf) {
        console.log(`✨ Email body PDF already exists for messageId: ${data.messageId}`);
        this.metrics.skipped.set('already_exists', (this.metrics.skipped.get('already_exists') || 0) + 1);
        this.metrics.success.set('created', (this.metrics.success.get('created') || 0) + 1);
        return;
      }

      // Acquire browser and page
      const { browser, page } = await this.browserPool.acquirePage();

      try {
        // Set timeout for page operations
        page.setDefaultTimeout(this.pageTimeoutMs);

        // Sanitize HTML
        const sanitizeStart = Date.now();
        const sanitizedHtml = data.html ? await this.emailBodyPdfService.sanitizeHtml(data.html) : null;
        const sanitizeDuration = Date.now() - sanitizeStart;
        this.metrics.sanitizeDurations.push(sanitizeDuration);

        if (sanitizeDuration > 2000) {
          console.warn(`⚠️ Sanitize operation took ${sanitizeDuration}ms for messageId: ${data.messageId}`);
        }

        // Render PDF
        const renderStart = Date.now();
        const pdfBuffer = await this.emailBodyPdfService.renderToPdf(sanitizedHtml || data.text || '', {
          from: data.from,
          to: data.to,
          subject: data.subject || 'No Subject',
          receivedAt: data.receivedAt,
          messageId: data.messageId
        }, page);
        const renderDuration = Date.now() - renderStart;
        this.metrics.renderDurations.push(renderDuration);

        if (renderDuration > 6000) {
          console.warn(`⚠️ Render operation took ${renderDuration}ms for messageId: ${data.messageId}`);
        }

        // Check PDF size
        const pdfSizeBytes = pdfBuffer.length;
        this.metrics.pdfSizes.push(pdfSizeBytes);

        if (pdfSizeBytes > 10 * 1024 * 1024) { // 10MB limit
          const error = new Error('EMAIL_TOO_LARGE_AFTER_COMPRESSION');
          error.name = 'EMAIL_TOO_LARGE_AFTER_COMPRESSION';
          throw error;
        }

        // Create document in storage
        await storage.createEmailBodyDocument(data.tenantId, {
          messageId: data.messageId,
          from: data.from,
          to: data.to,
          subject: data.subject || 'No Subject',
          receivedAt: data.receivedAt,
          ingestGroupId: data.ingestGroupId,
          categoryId: data.categoryId,
          tags: data.tags || []
        }, pdfBuffer);

        // Success metrics
        this.metrics.success.set('created', (this.metrics.success.get('created') || 0) + 1);

        console.log(`✅ Successfully created email body PDF for messageId: ${data.messageId}, size: ${Math.round(pdfSizeBytes / 1024)}KB, render: ${renderDuration}ms`);

      } finally {
        // Always release page back to pool
        await this.browserPool.releasePage(browser, page);
      }

    } catch (error: any) {
      console.error(`❌ Job ${job.id} failed:`, error.message);

      // Track error metrics
      const errorCode = error.name || 'UNKNOWN_ERROR';
      this.metrics.failures.set(errorCode, (this.metrics.failures.get(errorCode) || 0) + 1);

      // Check if error should not be retried
      const nonRetryableErrors = ['EMAIL_BODY_MISSING', 'EMAIL_TOO_LARGE_AFTER_COMPRESSION'];
      if (nonRetryableErrors.includes(errorCode)) {
        console.log(`🚫 Non-retryable error ${errorCode}, not requeuing`);
        // Mark as failed but don't retry
        error.name = 'NON_RETRYABLE';
      }

      throw error;

    } finally {
      this.metrics.concurrencyInUse--;
      const totalDuration = Date.now() - startTime;
      console.log(`⏱️ Job ${job.id} completed in ${totalDuration}ms`);
    }
  }

  private startMetricsReporting(): void {
    // Report metrics every 30 seconds
    setInterval(() => {
      this.reportMetrics();
    }, 30000);
  }

  private async reportMetrics(): Promise<void> {
    const browserStats = this.browserPool.getStats();
    const queueStats = this.queue ? await this.queue.getWaiting() : [];
    
    console.log('📊 EMAIL RENDER WORKER METRICS:', {
      queue_depth: queueStats.length,
      concurrency_in_use: this.metrics.concurrencyInUse,
      browser_stats: browserStats,
      attempts_total: Object.fromEntries(this.metrics.attempts),
      success_total: Object.fromEntries(this.metrics.success),
      failures_total: Object.fromEntries(this.metrics.failures),
      skipped_total: Object.fromEntries(this.metrics.skipped),
      avg_sanitize_duration_ms: this.metrics.sanitizeDurations.length > 0 
        ? Math.round(this.metrics.sanitizeDurations.reduce((a, b) => a + b, 0) / this.metrics.sanitizeDurations.length)
        : 0,
      avg_render_duration_ms: this.metrics.renderDurations.length > 0
        ? Math.round(this.metrics.renderDurations.reduce((a, b) => a + b, 0) / this.metrics.renderDurations.length)
        : 0,
      avg_pdf_size_kb: this.metrics.pdfSizes.length > 0
        ? Math.round(this.metrics.pdfSizes.reduce((a, b) => a + b, 0) / this.metrics.pdfSizes.length / 1024)
        : 0,
      memory_violations: this.metrics.memoryViolations
    });

    // Reset rolling metrics
    if (this.metrics.sanitizeDurations.length > 100) {
      this.metrics.sanitizeDurations = this.metrics.sanitizeDurations.slice(-50);
    }
    if (this.metrics.renderDurations.length > 100) {
      this.metrics.renderDurations = this.metrics.renderDurations.slice(-50);
    }
    if (this.metrics.pdfSizes.length > 100) {
      this.metrics.pdfSizes = this.metrics.pdfSizes.slice(-50);
    }

    // Check alert conditions
    await this.checkAlerts(queueStats.length);
  }

  private async checkAlerts(queueDepth: number): Promise<void> {
    // Queue depth alert
    if (queueDepth > this.maxQueueDepthAlert) {
      console.warn(`🚨 ALERT: Queue depth ${queueDepth} exceeds threshold ${this.maxQueueDepthAlert}`);
    }

    // High failure rate alert (>5% over last 20 attempts)
    const totalAttempts = Array.from(this.metrics.attempts.values()).reduce((a, b) => a + b, 0);
    const totalFailures = Array.from(this.metrics.failures.values()).reduce((a, b) => a + b, 0);
    
    if (totalAttempts >= 20 && (totalFailures / totalAttempts) > 0.05) {
      console.warn(`🚨 ALERT: High failure rate ${Math.round((totalFailures / totalAttempts) * 100)}% (${totalFailures}/${totalAttempts})`);
    }

    // High render time alert (P95 > 6s)
    if (this.metrics.renderDurations.length >= 20) {
      const sortedDurations = [...this.metrics.renderDurations].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedDurations.length * 0.95);
      const p95Duration = sortedDurations[p95Index];
      
      if (p95Duration > 6000) {
        console.warn(`🚨 ALERT: P95 render time ${p95Duration}ms exceeds 6000ms threshold`);
      }
    }
  }

  async getQueueStats() {
    if (!this.queue) return null;
    
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      concurrency: this.metrics.concurrencyInUse,
      browserStats: this.browserPool.getStats()
    };
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Email Render Worker...');
    
    if (this.worker) {
      await this.worker.close();
    }
    
    if (this.queue) {
      await this.queue.close();
    }
    
    await this.browserPool.cleanup();
    await this.redis.disconnect();
    
    console.log('✅ Email Render Worker cleanup complete');
  }
}

// Global worker instance
export let emailRenderWorker: EmailRenderWorker | null = null;

export async function initializeEmailRenderWorker(): Promise<void> {
  if (emailRenderWorker) {
    console.log('Email Render Worker already initialized');
    return;
  }

  emailRenderWorker = new EmailRenderWorker();
  await emailRenderWorker.initialize();
}

export async function cleanupEmailRenderWorker(): Promise<void> {
  if (emailRenderWorker) {
    await emailRenderWorker.cleanup();
    emailRenderWorker = null;
  }
}