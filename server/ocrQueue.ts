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
      
      await processDocumentWithDateExtraction(
        job.documentId,
        job.fileName,
        job.filePathOrGCSKey,
        job.mimeType,
        job.userId,
        storage
      );
      
      // TICKET 5: Generate AI insights automatically after OCR processing
      try {
        const document = await storage.getDocument(job.documentId, job.userId);
        if (document && document.extractedText && aiInsightService.isServiceAvailable()) {
          console.log(`🧠 Generating AI insights for document: ${job.documentId}`);
          
          const insights = await aiInsightService.generateDocumentInsights(
            document.name,
            document.extractedText,
            document.mimeType,
            job.userId
          );
          
          // Store insights in database for dashboard display
          for (const insight of insights.insights) {
            await storage.createInsight({
              documentId: job.documentId,
              userId: job.userId,
              insightId: insight.id,
              message: aiInsightService.generateInsightMessage(insight),
              type: insight.type,
              title: insight.title,
              content: insight.content,
              confidence: insight.confidence,
              priority: insight.priority,
              dueDate: aiInsightService.extractDueDate(insight.content),
              actionUrl: `/document/${job.documentId}`,
              status: 'open',
              metadata: insight.metadata ? JSON.stringify(insight.metadata) : null,
              processingTime: insights.processingTime,
              aiModel: 'gpt-4o',
              source: 'ai'
            });
          }
          
          console.log(`✅ Generated ${insights.insights.length} AI insights for document: ${job.documentId}`);
        } else {
          console.log(`⚠️ Skipping AI insights - document has no extracted text or AI service unavailable: ${job.documentId}`);
        }
      } catch (insightError) {
        console.error(`❌ AI insight generation failed for document ${job.documentId}:`, insightError);
        // Continue processing - insights are optional
      }
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;
      const memoryDelta = endMemory - startMemory;
      
      console.log(`✅ OCR job completed: ${job.id} (${(endTime - startTime).toFixed(0)}ms, ${(memoryDelta / 1024 / 1024).toFixed(1)}MB)`);
      
      this.stats.completed++;
      
    } catch (error) {
      console.error(`❌ OCR job error: ${job.id}`, error);
      
      // Retry logic
      if (job.retries < 2) {
        job.retries++;
        job.priority = Math.max(1, job.priority - 1); // Lower priority for retries
        this.queue.unshift(job); // Add back to front of queue
        console.log(`🔄 Retrying OCR job: ${job.id} (attempt ${job.retries + 1})`);
      } else {
        this.stats.failed++;
        console.error(`💀 OCR job permanently failed: ${job.id}`);
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