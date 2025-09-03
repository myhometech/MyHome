import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import { StorageService } from './storage';
import { db } from './db';
import { thumbnailJobs, thumbnails, documents } from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import type {
  InsertThumbnailJob,
  InsertThumbnail,
  SelectThumbnailJob,
  SelectThumbnail,
  ThumbnailVariantResponse,
  ThumbnailResponse
} from '../shared/schema';

/**
 * Comprehensive Thumbnail Generation Service
 * Implements the robust thumbnail pipeline as specified in the checklist:
 * - Multiple variants (96px, 240px, 480px)
 * - Content hash-based storage and caching
 * - Support for PDF, Images, and DOCX
 * - Performance budgets and monitoring
 * - Proper error handling and fallbacks
 */

export interface ThumbnailVariant {
  name: string;
  width: number;
  maxHeight: number;
  quality: number;
  targetSizeKB: number; // Performance budget
}

export interface ThumbnailGenerationOptions {
  variants?: string[];
  forceRegenerate?: boolean;
  priority?: 'high' | 'normal' | 'low';
}

export interface ThumbnailGenerationResult {
  jobId: number;
  variants: ThumbnailVariantResponse[];
  contentHash: string;
  processingTimeMs: number;
  success: boolean;
  errors?: string[];
}

export class ThumbnailGenerationService {
  private storageService: StorageService;
  
  // Standardized variants based on checklist requirements
  private readonly VARIANTS: Record<string, ThumbnailVariant> = {
    '96': {
      name: '96',
      width: 96,
      maxHeight: 128,
      quality: 75,
      targetSizeKB: 40, // ≤ 40KB (96w)
    },
    '240': {
      name: '240',
      width: 240,
      maxHeight: 320,
      quality: 78,
      targetSizeKB: 120, // ≤ 120KB (240w)
    },
    '480': {
      name: '480',
      width: 480,
      maxHeight: 640,
      quality: 80,
      targetSizeKB: 220, // ≤ 220KB (480w)
    },
  };

  // Performance budgets from checklist
  private readonly PERFORMANCE_BUDGETS = {
    maxProcessingTimeMs: {
      image: 2500, // ≤ 2.5s for images
      pdf: 5000,   // ≤ 5s for PDFs
      docx: 5000,  // ≤ 5s for DOCX
    },
    maxConcurrentJobs: 5,
    retryAttempts: 3,
  };

  constructor() {
    this.storageService = StorageService.initialize();
  }

  /**
   * Generate thumbnails for a document
   * Implements async job processing with proper status tracking
   */
  async generateThumbnails(
    documentId: number,
    userId: string,
    options: ThumbnailGenerationOptions = {}
  ): Promise<ThumbnailGenerationResult> {
    const startTime = Date.now();
    
    try {
      // Fetch document
      const document = await this.getDocument(documentId, userId);
      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Generate content hash
      const contentHash = await this.generateContentHash(document);
      
      // Check for existing thumbnails (unless force regenerate)
      if (!options.forceRegenerate) {
        const existing = await this.getExistingThumbnails(documentId, contentHash);
        if (existing.length > 0) {
          console.log(`✅ Found existing thumbnails for document ${documentId}, content hash: ${contentHash}`);
          return this.buildResponse(existing, contentHash, Date.now() - startTime);
        }
      }

      // Create or update job
      const jobId = await this.createJob(documentId, userId, contentHash, document.mimeType, options.variants);
      
      // Download and process document
      const fileBuffer = await this.downloadDocument(document);
      const variants = options.variants || ['96', '240', '480'];
      
      console.log(`🔄 Generating ${variants.length} thumbnail variants for document ${documentId}`);
      
      // Generate thumbnails based on file type
      const generatedThumbnails = await this.processDocument(
        documentId,
        userId,
        jobId,
        fileBuffer,
        document.mimeType,
        contentHash,
        variants
      );

      // Update job status
      const processingTime = Date.now() - startTime;
      await this.updateJobStatus(jobId, 'completed', processingTime);

      console.log(`✅ Generated ${generatedThumbnails.length} thumbnails for document ${documentId} in ${processingTime}ms`);

      return {
        jobId,
        variants: generatedThumbnails,
        contentHash,
        processingTimeMs: processingTime,
        success: true,
      };

    } catch (error) {
      console.error(`❌ Thumbnail generation failed for document ${documentId}:`, error);
      
      return {
        jobId: 0,
        variants: [],
        contentHash: '',
        processingTimeMs: Date.now() - startTime,
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Get existing thumbnails for a document
   */
  async getThumbnails(documentId: number, userId: string): Promise<ThumbnailResponse | null> {
    try {
      const thumbnailList = await db
        .select()
        .from(thumbnails)
        .where(and(
          eq(thumbnails.documentId, documentId),
          eq(thumbnails.userId, userId)
        ));

      if (thumbnailList.length === 0) {
        return null;
      }

      // Get the most recent job
      const jobId = thumbnailList[0].jobId;
      const job = await db.select().from(thumbnailJobs).where(eq(thumbnailJobs.id, jobId)).limit(1);
      
      // Build variants response
      const variants: Record<string, ThumbnailVariantResponse> = {};
      for (const thumbnail of thumbnailList) {
        const signedUrl = await this.storageService.getSignedUrl(thumbnail.gcsPath, 3600); // 1 hour expiry
        
        variants[thumbnail.variant] = {
          variant: thumbnail.variant,
          url: signedUrl,
          width: thumbnail.width,
          height: thumbnail.height,
          fileSize: thumbnail.fileSize,
          format: thumbnail.format,
        };
      }

      return {
        documentId,
        variants,
        generatedAt: job[0]?.completedAt?.toISOString() || new Date().toISOString(),
        jobId,
      };

    } catch (error) {
      console.error(`Failed to get thumbnails for document ${documentId}:`, error);
      return null;
    }
  }

  /**
   * Process document based on file type
   */
  private async processDocument(
    documentId: number,
    userId: string,
    jobId: number,
    fileBuffer: Buffer,
    mimeType: string,
    contentHash: string,
    variants: string[]
  ): Promise<ThumbnailVariantResponse[]> {
    const results: ThumbnailVariantResponse[] = [];

    if (mimeType.startsWith('image/')) {
      // A) Images (JPG/PNG) - Use Sharp directly
      const imageResults = await this.processImage(documentId, userId, jobId, fileBuffer, contentHash, variants);
      results.push(...imageResults);
      
    } else if (mimeType === 'application/pdf') {
      // B) PDF (first page) - Convert to image then process
      const pdfResults = await this.processPDF(documentId, userId, jobId, fileBuffer, contentHash, variants);
      results.push(...pdfResults);
      
    } else if (this.isOfficeDocument(mimeType)) {
      // C) DOCX - Convert to PDF then to image
      const officeResults = await this.processOfficeDocument(documentId, userId, jobId, fileBuffer, contentHash, variants);
      results.push(...officeResults);
      
    } else {
      throw new Error(`Unsupported file type for thumbnail generation: ${mimeType}`);
    }

    return results;
  }

  /**
   * Process images using Sharp
   */
  private async processImage(
    documentId: number,
    userId: string,
    jobId: number,
    fileBuffer: Buffer,
    contentHash: string,
    variants: string[]
  ): Promise<ThumbnailVariantResponse[]> {
    const results: ThumbnailVariantResponse[] = [];

    for (const variantName of variants) {
      const variant = this.VARIANTS[variantName];
      if (!variant) continue;

      try {
        const startTime = Date.now();
        
        // Process with Sharp
        const processedBuffer = await sharp(fileBuffer)
          .rotate() // Apply EXIF orientation
          .resize(variant.width, variant.maxHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ 
            quality: variant.quality,
            mozjpeg: true // Better compression
          })
          .toBuffer({ resolveWithObject: true });

        const { data, info } = processedBuffer;
        
        // Check performance budget
        if (data.length > variant.targetSizeKB * 1024) {
          console.warn(`⚠️ Thumbnail ${variantName} exceeds target size: ${data.length} bytes > ${variant.targetSizeKB}KB`);
        }

        // Upload to GCS with content-hash based path
        const gcsPath = this.generateGCSPath(documentId, variantName, contentHash, 'jpg');
        await this.storageService.upload(data, gcsPath, 'image/jpeg');

        // Store in database
        const thumbnail = await this.saveThumbnail({
          documentId,
          userId,
          jobId,
          variant: variantName,
          contentHash,
          gcsPath,
          format: 'jpeg',
          width: info.width,
          height: info.height,
          fileSize: data.length,
          quality: variant.quality,
          generationTimeMs: Date.now() - startTime,
        });

        // Generate signed URL
        const signedUrl = await this.storageService.getSignedUrl(gcsPath, 3600);
        
        results.push({
          variant: variantName,
          url: signedUrl,
          width: info.width,
          height: info.height,
          fileSize: data.length,
          format: 'jpeg',
        });

        console.log(`✅ Generated ${variantName}px thumbnail: ${info.width}x${info.height}, ${data.length} bytes`);

      } catch (error) {
        console.error(`Failed to generate ${variantName}px thumbnail:`, error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Process PDF using multiple strategies (as per current implementation)
   */
  private async processPDF(
    documentId: number,
    userId: string,
    jobId: number,
    fileBuffer: Buffer,
    contentHash: string,
    variants: string[]
  ): Promise<ThumbnailVariantResponse[]> {
    // Create temporary file
    const tempPdfPath = path.join(os.tmpdir(), `pdf_${documentId}_${Date.now()}.pdf`);
    fs.writeFileSync(tempPdfPath, fileBuffer);

    try {
      // Strategy 1: Try pdftoppm (most reliable)
      let imageBuffer: Buffer | null = null;
      
      try {
        const tempImagePath = path.join(os.tmpdir(), `pdf_img_${documentId}_${Date.now()}`);
        execSync(`pdftoppm -f 1 -l 1 -jpeg -r 200 "${tempPdfPath}" "${tempImagePath}"`, { timeout: 10000 });
        
        const generatedFile = `${tempImagePath}-1.jpg`;
        if (fs.existsSync(generatedFile)) {
          imageBuffer = fs.readFileSync(generatedFile);
          fs.unlinkSync(generatedFile);
        }
      } catch (error) {
        console.warn('pdftoppm failed, trying ImageMagick:', error);
        
        // Strategy 2: ImageMagick fallback
        try {
          const tempImagePath = path.join(os.tmpdir(), `pdf_convert_${documentId}_${Date.now()}.jpg`);
          execSync(`convert "${tempPdfPath}[0]" -density 200 -quality 80 "${tempImagePath}"`, { timeout: 15000 });
          
          if (fs.existsSync(tempImagePath)) {
            imageBuffer = fs.readFileSync(tempImagePath);
            fs.unlinkSync(tempImagePath);
          }
        } catch (convertError) {
          throw new Error('Both pdftoppm and ImageMagick failed for PDF processing');
        }
      }

      if (!imageBuffer) {
        throw new Error('Failed to extract image from PDF');
      }

      // Process the extracted image through the image pipeline
      return await this.processImage(documentId, userId, jobId, imageBuffer, contentHash, variants);

    } finally {
      // Cleanup
      try { fs.unlinkSync(tempPdfPath); } catch {}
    }
  }

  /**
   * Process Office documents (DOCX, etc.)
   */
  private async processOfficeDocument(
    documentId: number,
    userId: string,
    jobId: number,
    fileBuffer: Buffer,
    contentHash: string,
    variants: string[]
  ): Promise<ThumbnailVariantResponse[]> {
    // Create temporary file
    const tempDocPath = path.join(os.tmpdir(), `doc_${documentId}_${Date.now()}.docx`);
    fs.writeFileSync(tempDocPath, fileBuffer);

    try {
      // Convert to PDF using LibreOffice
      const tempPdfPath = path.join(os.tmpdir(), `doc_pdf_${documentId}_${Date.now()}.pdf`);
      execSync(`libreoffice --headless --invisible --nodefault --nolockcheck --nologo --norestore --convert-to pdf:writer_pdf_Export --outdir ${os.tmpdir()} "${tempDocPath}"`, { timeout: 30000 });

      const baseName = path.basename(tempDocPath, path.extname(tempDocPath));
      const actualPdfPath = path.join(os.tmpdir(), `${baseName}.pdf`);

      if (!fs.existsSync(actualPdfPath)) {
        throw new Error('LibreOffice failed to generate PDF');
      }

      // Read generated PDF and process through PDF pipeline
      const pdfBuffer = fs.readFileSync(actualPdfPath);
      
      // Cleanup intermediate files
      try { fs.unlinkSync(actualPdfPath); } catch {}
      
      return await this.processPDF(documentId, userId, jobId, pdfBuffer, contentHash, variants);

    } finally {
      // Cleanup
      try { fs.unlinkSync(tempDocPath); } catch {}
    }
  }

  /**
   * Generate content hash from document
   */
  private async generateContentHash(document: any): Promise<string> {
    try {
      const fileBuffer = await this.downloadDocument(document);
      return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (error) {
      // Fallback to file metadata hash
      const metadataString = `${document.fileName}:${document.fileSize}:${document.uploadedAt}`;
      return crypto.createHash('sha256').update(metadataString).digest('hex');
    }
  }

  /**
   * Generate GCS storage path with content hash
   */
  private generateGCSPath(documentId: number, variant: string, contentHash: string, format: string): string {
    return `thumbnails/${documentId}/${variant}/v${contentHash}.${format}`;
  }

  /**
   * Download document from storage
   */
  private async downloadDocument(document: any): Promise<Buffer> {
    const storagePath = document.gcsPath || document.filePath;
    return await this.storageService.download(storagePath);
  }

  /**
   * Get document from database
   */
  private async getDocument(documentId: number, userId: string) {
    const results = await db
      .select()
      .from(documents)
      .where(and(
        eq(documents.id, documentId),
        eq(documents.userId, userId)
      ))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Check for existing thumbnails
   */
  private async getExistingThumbnails(documentId: number, contentHash: string): Promise<SelectThumbnail[]> {
    return await db
      .select()
      .from(thumbnails)
      .where(and(
        eq(thumbnails.documentId, documentId),
        eq(thumbnails.contentHash, contentHash)
      ));
  }

  /**
   * Create thumbnail generation job
   */
  private async createJob(
    documentId: number,
    userId: string,
    contentHash: string,
    mimeType: string,
    variants: string[] = ['96', '240', '480']
  ): Promise<number> {
    const idempotencyKey = `${documentId}:${contentHash}`;
    
    const jobData: InsertThumbnailJob = {
      documentId,
      userId,
      status: 'processing',
      contentHash,
      mimeType,
      variants,
      processingStartedAt: new Date(),
      jobIdempotencyKey: idempotencyKey,
    };

    const result = await db.insert(thumbnailJobs).values(jobData).returning();
    return result[0].id;
  }

  /**
   * Update job status
   */
  private async updateJobStatus(jobId: number, status: string, processingTimeMs?: number): Promise<void> {
    const updateData: any = { status, updatedAt: new Date() };
    
    if (status === 'completed') {
      updateData.completedAt = new Date();
      if (processingTimeMs) updateData.processingTimeMs = processingTimeMs;
    } else if (status === 'failed') {
      updateData.failedAt = new Date();
    }

    await db.update(thumbnailJobs).set(updateData).where(eq(thumbnailJobs.id, jobId));
  }

  /**
   * Save thumbnail to database
   */
  private async saveThumbnail(thumbnailData: InsertThumbnail): Promise<SelectThumbnail> {
    const result = await db.insert(thumbnails).values(thumbnailData).returning();
    return result[0];
  }

  /**
   * Check if file is an Office document
   */
  private isOfficeDocument(mimeType: string): boolean {
    const officeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/msword', // .doc
      'application/vnd.ms-excel', // .xls
      'application/vnd.ms-powerpoint' // .ppt
    ];
    return officeTypes.includes(mimeType);
  }

  /**
   * Build response object
   */
  private buildResponse(thumbnailList: SelectThumbnail[], contentHash: string, processingTime: number): ThumbnailGenerationResult {
    const variants: ThumbnailVariantResponse[] = thumbnailList.map(t => ({
      variant: t.variant,
      url: '', // Will be populated with signed URL when needed
      width: t.width,
      height: t.height,
      fileSize: t.fileSize,
      format: t.format,
    }));

    return {
      jobId: thumbnailList[0]?.jobId || 0,
      variants,
      contentHash,
      processingTimeMs: processingTime,
      success: true,
    };
  }
}

// Export singleton instance
export const thumbnailGenerationService = new ThumbnailGenerationService();