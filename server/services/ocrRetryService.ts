import sharp from 'sharp';
import { resourceTracker } from '../resourceTracker';

/**
 * OCR Retry Compression Service
 * Handles intelligent retry strategies with progressive image compression
 * for memory-constrained OCR processing
 */

export interface OCRResourceThresholds {
  maxResolution: number; // Max width/height pixels (e.g., 3000px)
  maxPixelArea: number; // Max total pixel area (e.g., 9M pixels = 3000x3000)
  maxFileSize: number; // Max file size in bytes (e.g., 10MB)
  maxPageCount: number; // Max pages for multi-page documents
  maxMemoryUsage: number; // Max memory threshold percentage (e.g., 85%)
}

export interface CompressionLevel {
  level: number;
  quality: number;
  maxWidth: number;
  removeMetadata: boolean;
  grayscale: boolean;
  description: string;
}

export interface OCRRetryConfig {
  maxRetries: number;
  compressionLevels: CompressionLevel[];
  resourceThresholds: OCRResourceThresholds;
  delayBetweenRetries: number; // milliseconds
  enableAnalytics: boolean;
  analyticsDestination: 'segment' | 'internal' | 'both';
}

export interface OCRAnalyticsEvent {
  eventName: string;
  documentId: number;
  userId: string;
  attempt: number;
  compressionLevel?: number;
  originalSize: number;
  compressedSize?: number;
  memoryUsage: number;
  error?: string;
  success: boolean;
  processingTime: number;
  timestamp: Date;
}

class OCRRetryService {
  private config: OCRRetryConfig;

  constructor() {
    this.config = {
      maxRetries: 3, // One original + 2 compressed retries
      compressionLevels: [
        {
          level: 1,
          quality: 85,
          maxWidth: 2400,
          removeMetadata: true,
          grayscale: false,
          description: 'Light compression - remove metadata, reduce quality'
        },
        {
          level: 2,
          quality: 70,
          maxWidth: 1800,
          removeMetadata: true,
          grayscale: true,
          description: 'Medium compression - grayscale, further size reduction'
        },
        {
          level: 3,
          quality: 60,
          maxWidth: 1200,
          removeMetadata: true,
          grayscale: true,
          description: 'Heavy compression - minimal quality for text extraction'
        }
      ],
      resourceThresholds: {
        maxResolution: 3000, // 300 DPI equivalent for standard docs
        maxPixelArea: 9000000, // 3000x3000 pixels
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxPageCount: 50, // Reasonable limit for memory management
        maxMemoryUsage: 85 // 85% heap usage threshold
      },
      delayBetweenRetries: 2000, // 2 second delay
      enableAnalytics: true,
      analyticsDestination: 'internal' // Route to internal dashboard
    };
  }

  /**
   * Preflight validator - checks if document meets resource thresholds
   */
  async validateResourceRequirements(
    fileBuffer: Buffer,
    pageCount: number = 1
  ): Promise<{ valid: boolean; issues: string[]; recommendations: string[] }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      const metadata = await sharp(fileBuffer).metadata();
      const pixelArea = (metadata.width || 0) * (metadata.height || 0);
      const fileSize = fileBuffer.length;
      const currentMemory = process.memoryUsage();
      const heapPercent = (currentMemory.heapUsed / currentMemory.heapTotal) * 100;

      // Check resolution
      if ((metadata.width || 0) > this.config.resourceThresholds.maxResolution ||
          (metadata.height || 0) > this.config.resourceThresholds.maxResolution) {
        issues.push(`Resolution exceeds limit: ${metadata.width}x${metadata.height} > ${this.config.resourceThresholds.maxResolution}px`);
        recommendations.push('Reduce image resolution to 300 DPI equivalent');
      }

      // Check pixel area
      if (pixelArea > this.config.resourceThresholds.maxPixelArea) {
        issues.push(`Pixel area too large: ${pixelArea} > ${this.config.resourceThresholds.maxPixelArea}`);
        recommendations.push('Resize image to reduce total pixel count');
      }

      // Check file size
      if (fileSize > this.config.resourceThresholds.maxFileSize) {
        issues.push(`File size too large: ${(fileSize / 1024 / 1024).toFixed(1)}MB > ${this.config.resourceThresholds.maxFileSize / 1024 / 1024}MB`);
        recommendations.push('Compress image quality or reduce dimensions');
      }

      // Check page count
      if (pageCount > this.config.resourceThresholds.maxPageCount) {
        issues.push(`Too many pages: ${pageCount} > ${this.config.resourceThresholds.maxPageCount}`);
        recommendations.push('Process document in smaller batches');
      }

      // Check current memory usage
      if (heapPercent > this.config.resourceThresholds.maxMemoryUsage) {
        issues.push(`Memory usage too high: ${heapPercent.toFixed(1)}% > ${this.config.resourceThresholds.maxMemoryUsage}%`);
        recommendations.push('Wait for memory cleanup or restart process');
      }

      return {
        valid: issues.length === 0,
        issues,
        recommendations
      };

    } catch (error) {
      return {
        valid: false,
        issues: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        recommendations: ['Check file format and integrity']
      };
    }
  }

  /**
   * Apply compression level to image buffer
   */
  async applyCompression(
    imageBuffer: Buffer,
    compressionLevel: CompressionLevel
  ): Promise<{ compressed: Buffer; metadata: any; reduction: number }> {
    let bufferId: string | null = null;

    try {
      bufferId = resourceTracker.trackBuffer(imageBuffer);
      
      let image = sharp(imageBuffer);
      const originalMetadata = await image.metadata();
      const originalSize = imageBuffer.length;

      // Remove metadata if specified
      if (compressionLevel.removeMetadata) {
        image = image.withMetadata({});
      }

      // Convert to grayscale if specified
      if (compressionLevel.grayscale) {
        image = image.grayscale();
      }

      // Resize if needed
      if ((originalMetadata.width || 0) > compressionLevel.maxWidth) {
        image = image.resize(compressionLevel.maxWidth, null, {
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true
        });
      }

      // Apply compression
      const compressedBuffer = await image.jpeg({
        quality: compressionLevel.quality,
        progressive: true,
        mozjpeg: true
      }).toBuffer();

      const newMetadata = await sharp(compressedBuffer).metadata();
      const reduction = ((originalSize - compressedBuffer.length) / originalSize) * 100;

      // Track compressed buffer
      resourceTracker.trackBuffer(compressedBuffer);

      return {
        compressed: compressedBuffer,
        metadata: newMetadata,
        reduction
      };

    } catch (error) {
      throw new Error(`Compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (bufferId) {
        await resourceTracker.releaseResource(bufferId);
      }
    }
  }

  /**
   * Track analytics event
   */
  private async trackAnalyticsEvent(event: OCRAnalyticsEvent): Promise<void> {
    if (!this.config.enableAnalytics) return;

    console.log(`📊 OCR Analytics Event: ${event.eventName}`, {
      documentId: event.documentId,
      userId: event.userId,
      attempt: event.attempt,
      compressionLevel: event.compressionLevel,
      originalSize: `${(event.originalSize / 1024).toFixed(1)}KB`,
      compressedSize: event.compressedSize ? `${(event.compressedSize / 1024).toFixed(1)}KB` : 'N/A',
      memoryUsage: `${event.memoryUsage.toFixed(1)}%`,
      success: event.success,
      processingTime: `${event.processingTime}ms`,
      error: event.error
    });

    // Route analytics based on configuration
    if (this.config.analyticsDestination === 'internal' || this.config.analyticsDestination === 'both') {
      // Internal dashboard routing
      await this.sendToInternalDashboard(event);
    }

    if (this.config.analyticsDestination === 'segment' || this.config.analyticsDestination === 'both') {
      // Segment routing (implement when needed)
      await this.sendToSegment(event);
    }
  }

  private async sendToInternalDashboard(event: OCRAnalyticsEvent): Promise<void> {
    // Store in internal metrics system (could be database table or monitoring service)
    console.log(`🎯 Internal Dashboard: ${event.eventName}`, event);
  }

  private async sendToSegment(event: OCRAnalyticsEvent): Promise<void> {
    // Segment integration (implement when Segment is configured)
    console.log(`📈 Segment Analytics: ${event.eventName}`, event);
  }

  /**
   * Execute OCR with retry compression strategy
   */
  async executeWithRetry<T>(
    documentId: number,
    userId: string,
    imageBuffer: Buffer,
    ocrFunction: (buffer: Buffer) => Promise<T>,
    options: {
      immediateRetry?: boolean; // For email imports
      lowPriority?: boolean; // For batch processing
    } = {}
  ): Promise<{ result: T; attempts: number; finalCompressionLevel?: number }> {
    const startTime = Date.now();
    let currentBuffer = imageBuffer;
    let attempts = 0;
    const originalSize = imageBuffer.length;

    // Check memory before starting
    const initialMemory = process.memoryUsage();
    const initialHeapPercent = (initialMemory.heapUsed / initialMemory.heapTotal) * 100;

    console.log(`🔄 Starting OCR retry process for document ${documentId} (${(originalSize / 1024).toFixed(1)}KB, ${initialHeapPercent.toFixed(1)}% heap)`);

    // Attempt 0: Original image
    try {
      attempts++;
      const result = await ocrFunction(currentBuffer);
      
      await this.trackAnalyticsEvent({
        eventName: 'ocr.success.original',
        documentId,
        userId,
        attempt: attempts,
        originalSize,
        memoryUsage: initialHeapPercent,
        success: true,
        processingTime: Date.now() - startTime,
        timestamp: new Date()
      });

      console.log(`✅ OCR succeeded on original image (attempt ${attempts})`);
      return { result, attempts };

    } catch (originalError) {
      console.log(`❌ OCR failed on original image: ${originalError instanceof Error ? originalError.message : 'Unknown error'}`);
      
      await this.trackAnalyticsEvent({
        eventName: 'ocr.failure.original',
        documentId,
        userId,
        attempt: attempts,
        originalSize,
        memoryUsage: initialHeapPercent,
        error: originalError instanceof Error ? originalError.message : 'Unknown error',
        success: false,
        processingTime: Date.now() - startTime,
        timestamp: new Date()
      });

      // For email imports with immediate retry option
      if (!options.immediateRetry && !options.lowPriority) {
        // Delay before retries to allow memory cleanup
        await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenRetries));
      }

      // Try compression levels
      for (const compressionLevel of this.config.compressionLevels) {
        if (attempts >= this.config.maxRetries) break;

        try {
          attempts++;
          console.log(`🔄 Attempting OCR with compression level ${compressionLevel.level}: ${compressionLevel.description}`);
          
          const compressionStart = Date.now();
          const { compressed, reduction } = await this.applyCompression(currentBuffer, compressionLevel);
          
          console.log(`📉 Compression level ${compressionLevel.level} achieved ${reduction.toFixed(1)}% size reduction`);
          
          // Check memory before OCR attempt
          const retryMemory = process.memoryUsage();
          const retryHeapPercent = (retryMemory.heapUsed / retryMemory.heapTotal) * 100;

          const result = await ocrFunction(compressed);
          
          await this.trackAnalyticsEvent({
            eventName: 'ocr.success.compressed',
            documentId,
            userId,
            attempt: attempts,
            compressionLevel: compressionLevel.level,
            originalSize,
            compressedSize: compressed.length,
            memoryUsage: retryHeapPercent,
            success: true,
            processingTime: Date.now() - startTime,
            timestamp: new Date()
          });

          console.log(`✅ OCR succeeded with compression level ${compressionLevel.level} (attempt ${attempts})`);
          return { result, attempts, finalCompressionLevel: compressionLevel.level };

        } catch (retryError) {
          console.log(`❌ OCR failed with compression level ${compressionLevel.level}: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
          
          await this.trackAnalyticsEvent({
            eventName: 'ocr.failure.compressed',
            documentId,
            userId,
            attempt: attempts,
            compressionLevel: compressionLevel.level,
            originalSize,
            compressedSize: undefined,
            memoryUsage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
            error: retryError instanceof Error ? retryError.message : 'Unknown error',
            success: false,
            processingTime: Date.now() - startTime,
            timestamp: new Date()
          });

          // Continue to next compression level
          if (!options.immediateRetry) {
            await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenRetries));
          }
        }
      }

      // All retries failed
      await this.trackAnalyticsEvent({
        eventName: 'ocr.failure.all_retries_exhausted',
        documentId,
        userId,
        attempt: attempts,
        originalSize,
        memoryUsage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
        success: false,
        processingTime: Date.now() - startTime,
        timestamp: new Date()
      });

      throw new Error(`OCR failed after ${attempts} attempts with all compression levels. Original error: ${originalError instanceof Error ? originalError.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): OCRRetryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<OCRRetryConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('📝 OCR Retry Service configuration updated');
  }
}

// Export singleton instance
export const ocrRetryService = new OCRRetryService();
export default ocrRetryService;