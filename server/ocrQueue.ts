// OCR Job Queue with Memory-Bounded Concurrency Control
interface OCRJob {
  id: string;
  documentId: number;
  fileName: string;
  filePathOrGCSKey: string;
  mimeType: string;
  userId: string;
  priority: number;
  createdAt: Date;
  retries: number;
  useCompression?: boolean; // Flag for compression retry attempts
  isEmailImport?: boolean; // Flag for email import processing
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  memoryUsage: number;
}

class OCRJobQueue {
  private queue: OCRJob[] = [];
  private processing = new Map<string, OCRJob>();
  private maxConcurrency: number = 1; // Start with 1 for memory safety
  private maxQueueSize: number = 10;
  private stats: QueueStats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    memoryUsage: 0
  };

  constructor() {
    this.startMemoryMonitoring();
  }

  // Add job to queue with memory pressure check
  public async addJob(job: Omit<OCRJob, 'id' | 'createdAt' | 'retries'>): Promise<string> {
    const memUsage = process.memoryUsage();
    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // Reject new jobs if memory is critical
    if (heapPercent > 95) {
      throw new Error('Memory pressure too high - OCR job rejected');
    }

    // Reject if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('OCR queue is full - try again later');
    }

    const ocrJob: OCRJob = {
      ...job,
      id: `ocr_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      createdAt: new Date(),
      retries: 0
    };

    this.queue.push(ocrJob);
    this.stats.pending = this.queue.length;

    console.log(`📝 OCR job queued: ${ocrJob.id} (${this.queue.length} pending)`);

    // Process queue
    this.processQueue();

    return ocrJob.id;
  }

  // Process queue with concurrency control
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.processing.size < this.maxConcurrency) {
      const job = this.queue.shift();
      if (!job) break;

      this.processing.set(job.id, job);
      this.stats.pending = this.queue.length;
      this.stats.processing = this.processing.size;

      console.log(`🔄 Processing OCR job: ${job.id}`);

      // Process job asynchronously
      this.processJob(job).catch(error => {
        console.error(`❌ OCR job failed: ${job.id}`, error);
      });
    }
  }

  // Process individual OCR job with memory monitoring
  private async processJob(job: OCRJob): Promise<void> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      // Import OCR functions dynamically to avoid memory retention
      const { processDocumentWithDateExtraction } = await import('./ocrService.js');
      const { storage } = await import('./storage.js');
      const { aiInsightService } = await import('./aiInsightService.js');

      const extractedText = await processDocumentWithDateExtraction(
        job.documentId,
        job.fileName,
        job.filePathOrGCSKey,
        job.mimeType,
        job.userId,
        storage
      );

      console.log(`🎯 OCR job completed for document ${job.documentId} in ${Date.now() - startTime}ms`);

      // Update document status to completed
      await storage.updateDocument(job.documentId, job.userId, {
        status: 'completed'
      });

      console.log(`✅ Document ${job.documentId} status updated to completed`);

      // For email imports, ensure insights are generated after OCR
      if (job.isEmailImport && extractedText && extractedText.length > 10) {
        try {
          console.log(`📧 Queueing insights generation for email import: ${job.fileName}`);

          // Import and queue insights job
          const { insightJobQueue } = await import('./insightJobQueue');

          await insightJobQueue.addJob({
            documentId: job.documentId,
            documentName: job.fileName,
            extractedText,
            mimeType: job.mimeType,
            userId: job.userId,
            priority: 2, // Medium priority for email insights
            source: 'email_import'
          });

          console.log(`✅ Insights job queued for email document ${job.documentId}`);
        } catch (insightError) {
          console.error(`❌ Failed to queue insights for email document ${job.documentId}:`, insightError);
          // Don't fail the OCR job if insights queueing fails
        }
      }

    } catch (error) {
      console.error(`❌ OCR job error: ${job.id}`, error);

      // TICKET 8: Track OCR failure for analytics
      try {
        const { storage } = await import('./storage');
        const document = await storage.getDocument(job.documentId, job.userId);

        // TICKET 8: Track scan OCR failure event
        if (document?.uploadSource === 'browser_scan') {
          console.log(`📊 Analytics: browser_scan_ocr_failed for document ${job.documentId}`, {
            userId: job.userId,
            documentId: job.documentId,
            error: error?.message || 'Unknown OCR error',
            timestamp: new Date().toISOString()
          });
          console.log(`🔧 TICKET 5: Setting OCR failed status for browser scan ${job.documentId}`);
          await storage.updateDocumentOCRStatus(job.documentId, job.userId, {
            status: 'ocr_failed',
            ocrProcessed: true,
            extractedText: null
          });
          console.log(`✅ Browser scan ${job.documentId} marked as OCR failed without blocking UI`);
        }
      } catch (updateError) {
        console.error(`Failed to update OCR failure status for document ${job.documentId}:`, updateError);
      }

      // Enhanced retry logic with compression fallback
      if (job.retries < 3) { // Allow up to 3 retries (1 original + 2 compressed)
        job.retries++;
        job.priority = Math.max(1, job.priority - 1); // Lower priority for retries

        // Mark for compression retry on subsequent attempts
        if (job.retries > 1) {
          job.useCompression = true;
          console.log(`🔄 Retrying OCR job with compression: ${job.id} (attempt ${job.retries + 1})`);
        } else {
          console.log(`🔄 Retrying OCR job: ${job.id} (attempt ${job.retries + 1})`);
        }

        this.queue.unshift(job); // Add back to front of queue
      } else {
        this.stats.failed++;
        console.error(`💀 OCR job permanently failed after ${job.retries + 1} attempts: ${job.id}`);

        // Track permanent failure analytics
        console.log('📊 Analytics: ocr.permanent_failure', {
          jobId: job.id,
          documentId: job.documentId,
          userId: job.userId,
          attempts: job.retries + 1,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      this.processing.delete(job.id);
      this.stats.processing = this.processing.size;

      // Continue processing queue
      setTimeout(() => this.processQueue(), 100);

      // Force GC after each job if memory is high
      const memUsage = process.memoryUsage();
      const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      if (heapPercent > 90 && global.gc) {
        console.log(`🗑️ Post-OCR GC: ${heapPercent.toFixed(1)}% heap`);
        global.gc();
      }
    }
  }

  // Monitor memory and adjust concurrency
  private startMemoryMonitoring(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      this.stats.memoryUsage = heapPercent;

      // Adjust concurrency based on memory pressure
      if (heapPercent > 95) {
        this.maxConcurrency = 1;
      } else if (heapPercent > 90) {
        this.maxConcurrency = 1;
      } else if (heapPercent < 80) {
        this.maxConcurrency = Math.min(2, this.maxConcurrency + 1);
      }
    }, 30000); // Every 30 seconds
  }

  public getStats(): QueueStats {
    return { ...this.stats };
  }

  public clearQueue(): void {
    this.queue = [];
    this.stats.pending = 0;
    console.log('🧹 OCR queue cleared');
  }
}

export const ocrQueue = new OCRJobQueue();