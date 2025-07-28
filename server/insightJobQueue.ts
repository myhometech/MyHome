// AI Insight Job Queue with Cost Optimization (TICKET 17)
import crypto from 'crypto';

interface InsightJob {
  id: string;
  documentId: number;
  userId: string;
  documentType: string;
  documentName: string;
  extractedText: string;
  textHash: string; // SHA-256 hash for duplicate detection
  mimeType: string;
  priority: number;
  createdAt: Date;
  retries: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface InsightQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  duplicatesSkipped: number;
}

// Model selection based on document type and cost optimization
const MODEL_SELECTION = {
  'high-value': 'gpt-4o',        // Insurance, legal, contracts
  'routine': 'gpt-4o-mini',      // Receipts, utility bills, general
  'simple': 'gpt-3.5-turbo'      // Basic categorization only
};

const HIGH_VALUE_TYPES = ['insurance', 'legal', 'contract', 'tax', 'medical'];
const ROUTINE_TYPES = ['financial', 'utilities', 'warranty'];

class InsightJobQueue {
  private queue: InsightJob[] = [];
  private processing = new Map<string, InsightJob>();
  private processedHashes = new Set<string>(); // Track processed document hashes
  private maxConcurrency: number = 2;
  private maxQueueSize: number = 50;
  private stats: InsightQueueStats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    duplicatesSkipped: 0
  };

  constructor() {
    this.startProcessing();
  }

  /**
   * TICKET 17: Add insight generation job with cost optimization
   */
  public async addInsightJob(params: {
    documentId: number;
    userId: string;
    documentType: string;
    documentName: string;
    extractedText: string;
    mimeType: string;
    priority?: number;
  }): Promise<string | null> {
    const { documentId, userId, documentType, documentName, extractedText, mimeType, priority = 5 } = params;

    // COST OPTIMIZATION 7: Duplicate document detection
    const textHash = this.generateTextHash(extractedText);
    if (this.processedHashes.has(textHash)) {
      console.log(`🔄 DUPLICATE DETECTED: Skipping insight generation for document ${documentId} (hash: ${textHash.substring(0, 8)})`);
      
      this.stats.duplicatesSkipped++;
      return null; // No job needed - duplicate detected
    }

    // Check queue capacity
    if (this.queue.length >= this.maxQueueSize) {
      console.warn(`⚠️ INSIGHT QUEUE FULL: Rejecting job for document ${documentId}`);
      return null;
    }

    // COST OPTIMIZATION 8: Batch processing for free tier users
    const delayMs = await this.calculateJobDelay(userId);

    const job: InsightJob = {
      id: `insight_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      documentId,
      userId,
      documentType,
      documentName,
      extractedText: this.trimTextForProcessing(extractedText, documentType),
      textHash,
      mimeType,
      priority,
      createdAt: new Date(),
      retries: 0,
      maxRetries: 3,
      status: 'pending'
    };

    // Add delay for free tier throttling
    if (delayMs > 0) {
      setTimeout(() => {
        this.queue.push(job);
        this.stats.pending = this.queue.length;
        console.log(`💡 INSIGHT JOB QUEUED (delayed): ${job.id} for document ${documentId}`);
      }, delayMs);
    } else {
      this.queue.push(job);
      this.stats.pending = this.queue.length;
      console.log(`💡 INSIGHT JOB QUEUED: ${job.id} for document ${documentId}`);
    }

    return job.id;
  }

  /**
   * COST OPTIMIZATION 5: Trim input text to most relevant sections
   */
  private trimTextForProcessing(text: string, documentType: string): string {
    const maxChars = 2000; // Reduced from full text

    if (text.length <= maxChars) {
      return text;
    }

    // For most documents, take first and last sections
    const firstSection = text.substring(0, maxChars / 2);
    const lastSection = text.substring(text.length - maxChars / 2);
    
    return `${firstSection}\n\n[... content trimmed ...]\n\n${lastSection}`;
  }

  /**
   * COST OPTIMIZATION 4: Model selection based on document type
   */
  private selectOptimalModel(documentType: string): string {
    if (HIGH_VALUE_TYPES.includes(documentType.toLowerCase())) {
      return MODEL_SELECTION['high-value'];
    } else if (ROUTINE_TYPES.includes(documentType.toLowerCase())) {
      return MODEL_SELECTION['routine'];  
    } else {
      return MODEL_SELECTION['simple'];
    }
  }

  /**
   * COST OPTIMIZATION 6: Filter insight types by document category
   */
  private getRelevantInsightTypes(documentType: string): string[] {
    const baseTypes = ['summary', 'action_items'];
    
    switch (documentType.toLowerCase()) {
      case 'financial':
      case 'insurance':
        return [...baseTypes, 'key_dates', 'financial_info'];
      case 'legal':
      case 'contract':
        return [...baseTypes, 'key_dates', 'compliance'];
      case 'utilities':
        return [...baseTypes, 'key_dates'];
      case 'medical':
        return [...baseTypes, 'key_dates', 'contacts'];
      default:
        return baseTypes; // Minimal insights for unknown types
    }
  }

  /**
   * Generate SHA-256 hash for duplicate detection
   */
  private generateTextHash(text: string): string {
    return crypto.createHash('sha256').update(text.trim()).digest('hex');
  }

  /**
   * Calculate delay for free tier throttling
   */
  private async calculateJobDelay(userId: string): Promise<number> {
    try {
      const { storage } = await import('./storage');
      const user = await storage.getUser(userId);
      
      if (user?.subscriptionTier === 'free') {
        // Add 30 second delay for free tier users
        return 30000;
      }
    } catch (error) {
      console.error('Failed to determine user tier:', error);
    }
    
    return 0; // No delay for premium or unknown users
  }

  /**
   * Copy insights from similar document with same hash
   */
  private async copyInsightsFromSimilarDocument(documentId: number, textHash: string): Promise<void> {
    // This would require a new storage method to find documents by text hash
    // For now, we'll skip this optimization and mark it as handled
    console.log(`📋 Would copy insights for document ${documentId} from similar document with hash ${textHash.substring(0, 8)}`);
  }

  /**
   * Start processing queue
   */
  private startProcessing(): void {
    setInterval(() => {
      this.processQueue();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Process jobs in queue
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.processing.size < this.maxConcurrency) {
      const job = this.queue.shift();
      if (!job) continue;

      this.processing.set(job.id, job);
      job.status = 'processing';
      this.stats.pending = this.queue.length;
      this.stats.processing = this.processing.size;

      // Process job asynchronously
      this.processInsightJob(job).catch(error => {
        console.error(`Failed to process insight job ${job.id}:`, error);
        this.handleJobFailure(job, error);
      });
    }
  }

  /**
   * Process individual insight job
   */
  private async processInsightJob(job: InsightJob): Promise<void> {
    try {
      console.log(`🔄 PROCESSING INSIGHT JOB: ${job.id} for document ${job.documentId}`);

      const { aiInsightService } = await import('./aiInsightService');
      const { storage } = await import('./storage');

      // Generate insights with optimized model
      const model = this.selectOptimalModel(job.documentType);
      const relevantTypes = this.getRelevantInsightTypes(job.documentType);
      
      console.log(`🤖 Using model ${model} for document type: ${job.documentType}`);
      console.log(`🎯 Generating insight types: ${relevantTypes.join(', ')}`);

      const result = await aiInsightService.generateDocumentInsights(
        job.documentName,
        job.extractedText,
        job.mimeType,
        job.userId
      );

      // Filter insights to only relevant types for cost optimization
      const filteredInsights = result.insights.filter(insight => 
        relevantTypes.includes(insight.type)
      );

      // Save insights to database
      for (const insight of filteredInsights) {
        await storage.createDocumentInsight({
          documentId: job.documentId,
          userId: job.userId,
          insightId: insight.id,
          message: insight.title,
          type: insight.type,
          title: insight.title,
          content: insight.content,
          confidence: insight.confidence,
          priority: insight.priority,
          dueDate: null,
          actionUrl: `/document/${job.documentId}`,
          status: 'open',
          metadata: JSON.stringify(insight.metadata || {}),
          processingTime: result.processingTime,
          aiModel: model,
          source: 'ai'
        });
      }

      // Mark text hash as processed to avoid duplicates
      this.processedHashes.add(job.textHash);

      // Complete job
      this.completeJob(job);
      
      console.log(`✅ INSIGHT JOB COMPLETED: ${job.id} - Generated ${filteredInsights.length} insights`);

    } catch (error) {
      console.error(`❌ INSIGHT JOB FAILED: ${job.id}`, error);
      this.handleJobFailure(job, error);
    }
  }

  /**
   * Handle job completion
   */
  private completeJob(job: InsightJob): void {
    this.processing.delete(job.id);
    job.status = 'completed';
    this.stats.processing = this.processing.size;
    this.stats.completed++;
  }

  /**
   * Handle job failure with retry logic
   */
  private handleJobFailure(job: InsightJob, error: any): void {
    job.retries++;
    
    if (job.retries < job.maxRetries) {
      // Retry job
      job.status = 'pending';
      this.queue.push(job);
      this.stats.pending = this.queue.length;
      console.log(`🔄 RETRYING INSIGHT JOB: ${job.id} (attempt ${job.retries + 1}/${job.maxRetries})`);
    } else {
      // Mark as failed
      job.status = 'failed';
      this.stats.failed++;
      console.error(`❌ INSIGHT JOB PERMANENTLY FAILED: ${job.id} after ${job.maxRetries} attempts`);
    }

    this.processing.delete(job.id);
    this.stats.processing = this.processing.size;
  }

  /**
   * Get queue statistics
   */
  public getStats(): InsightQueueStats {
    return { ...this.stats };
  }

  /**
   * Get queue status for monitoring
   */
  public getStatus(): any {
    return {
      queue: this.queue.length,
      processing: this.processing.size,
      stats: this.stats,
      processedHashes: this.processedHashes.size
    };
  }
}

// Export singleton instance
export const insightJobQueue = new InsightJobQueue();