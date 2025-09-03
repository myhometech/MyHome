/**
 * THMB-3: Thumbnail Rendering Service
 * 
 * Comprehensive rendering pipeline for PDFs, images, and DOCX files
 * Generates 96/240/480px variants with smart format selection (PNG/JPEG)
 */

import sharp from 'sharp';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { StorageService } from './storage/StorageService';
import { thumbnailObjectKey } from './thumbnailHelpers';
import { logThumbnailWriteCompleted } from './auditLogger';

// Error taxonomy for deterministic retry behavior
export enum ThumbnailErrorCode {
  // Non-retryable errors
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
  PDF_PASSWORD = 'PDF_PASSWORD',
  IMAGE_DECODE_FAILURE = 'IMAGE_DECODE_FAILURE',
  DOCX_CONVERT_FAILURE = 'DOCX_CONVERT_FAILURE',
  SIZE_OVER_LIMIT = 'SIZE_OVER_LIMIT',
  
  // Retryable errors
  STORAGE_READ_FAILURE = 'STORAGE_READ_FAILURE',
  STORAGE_WRITE_FAILURE = 'STORAGE_WRITE_FAILURE',
  PDF_RENDER_FAILURE = 'PDF_RENDER_FAILURE',
  DOCX_CONVERT_TIMEOUT = 'DOCX_CONVERT_TIMEOUT',
  SPAWN_EAGAIN = 'SPAWN_EAGAIN',
  NETWORK_ECONNRESET = 'NETWORK_ECONNRESET',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR'
}

export class ThumbnailError extends Error {
  constructor(
    public code: ThumbnailErrorCode,
    message: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ThumbnailError';
  }
  
  static isRetryable(code: ThumbnailErrorCode): boolean {
    return [
      ThumbnailErrorCode.STORAGE_READ_FAILURE,
      ThumbnailErrorCode.STORAGE_WRITE_FAILURE,
      ThumbnailErrorCode.PDF_RENDER_FAILURE,
      ThumbnailErrorCode.DOCX_CONVERT_TIMEOUT,
      ThumbnailErrorCode.SPAWN_EAGAIN,
      ThumbnailErrorCode.NETWORK_ECONNRESET,
      ThumbnailErrorCode.TIMEOUT_ERROR
    ].includes(code);
  }
}

export interface ThumbnailJob {
  jobId: string;
  documentId: number;
  sourceHash: string;
  variants: number[];
  mimeType: string;
  userId: string;
  householdId?: string;
  filePath: string; // Path to original file in storage
}

export interface ThumbnailResult {
  documentId: number;
  sourceHash: string;
  variants: {
    variant: number;
    url: string;
    width: number;
    height: number;
    fileSize: number;
    format: 'jpeg' | 'png';
  }[];
  generatedAt: string;
}

export interface ProcessingStats {
  totalDuration: number;
  downloadDuration: number;
  renderDuration: number;
  uploadDuration: number;
  variantsGenerated: number;
  variantsSkipped: number;
}

/**
 * Main thumbnail rendering service
 */
export class ThumbnailRenderingService {
  private readonly tmpDir: string;
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB limit
  private readonly storageService: StorageService;

  constructor() {
    this.tmpDir = '/tmp/thumbnails';
    this.storageService = StorageService.initialize();
    this.ensureTmpDir();
  }

  private ensureTmpDir(): void {
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  /**
   * Process a thumbnail generation job
   */
  async processJob(job: ThumbnailJob): Promise<ThumbnailResult> {
    const startTime = Date.now();
    const correlationId = job.jobId;
    
    console.log(`🎨 [THMB-3:${correlationId}] Starting thumbnail generation for document ${job.documentId}`);
    
    const stats: ProcessingStats = {
      totalDuration: 0,
      downloadDuration: 0,
      renderDuration: 0,
      uploadDuration: 0,
      variantsGenerated: 0,
      variantsSkipped: 0
    };

    const tempFiles: string[] = [];
    
    try {
      // 1. Download original file from storage
      const downloadStart = Date.now();
      const inputFile = await this.downloadOriginal(job.filePath, correlationId);
      tempFiles.push(inputFile);
      stats.downloadDuration = Date.now() - downloadStart;

      // 2. Validate file size
      const fileSize = fs.statSync(inputFile).size;
      if (fileSize > this.maxFileSize) {
        throw new ThumbnailError(
          ThumbnailErrorCode.SIZE_OVER_LIMIT,
          `File size ${fileSize} exceeds limit of ${this.maxFileSize} bytes`,
          false
        );
      }

      // 3. Convert to base image buffer
      const renderStart = Date.now();
      const baseImageBuffer = await this.convertToBaseImage(inputFile, job.mimeType, correlationId, tempFiles);
      stats.renderDuration = Date.now() - renderStart;

      // 4. Analyze image and determine format
      const metadata = await sharp(baseImageBuffer).metadata();
      const hasTransparency = !!metadata.hasAlpha;
      const outputFormat = hasTransparency ? 'png' : 'jpeg';
      const fileExtension = hasTransparency ? 'png' : 'jpg';

      console.log(`📐 [THMB-3:${correlationId}] Base image: ${metadata.width}x${metadata.height}, format: ${outputFormat}, transparency: ${hasTransparency}`);

      // 5. Generate variants
      const uploadStart = Date.now();
      const variants = await this.generateVariants(
        baseImageBuffer,
        job.documentId,
        job.sourceHash,
        job.variants,
        outputFormat,
        fileExtension,
        correlationId,
        job.userId,
        job.householdId
      );
      stats.uploadDuration = Date.now() - uploadStart;
      stats.variantsGenerated = variants.filter(v => !v.skipped).length;
      stats.variantsSkipped = variants.filter(v => v.skipped).length;

      stats.totalDuration = Date.now() - startTime;

      console.log(`✅ [THMB-3:${correlationId}] Completed in ${stats.totalDuration}ms: ${stats.variantsGenerated} generated, ${stats.variantsSkipped} skipped`);

      return {
        documentId: job.documentId,
        sourceHash: job.sourceHash,
        variants: variants.filter(v => !v.skipped).map(v => ({
          variant: v.variant,
          url: v.url!,
          width: v.width!,
          height: v.height!,
          fileSize: v.fileSize!,
          format: outputFormat
        })),
        generatedAt: new Date().toISOString()
      };

    } finally {
      // Cleanup temporary files
      this.cleanupTempFiles(tempFiles, correlationId);
    }
  }

  /**
   * Download original file from storage to temp location
   */
  private async downloadOriginal(filePath: string, correlationId: string): Promise<string> {
    const inputFile = path.join(this.tmpDir, `${correlationId}_input`);
    
    try {
      console.log(`📥 [THMB-3:${correlationId}] Downloading from: ${filePath}`);
      
      // For GCS paths, use storage service
      if (filePath.startsWith('gs://') || filePath.startsWith('users/')) {
        const buffer = await this.storageService.downloadBuffer(filePath);
        await fs.promises.writeFile(inputFile, buffer);
      } 
      // For local paths, copy file
      else if (fs.existsSync(filePath)) {
        await fs.promises.copyFile(filePath, inputFile);
      } 
      else {
        throw new Error(`File not found: ${filePath}`);
      }

      console.log(`✅ [THMB-3:${correlationId}] Downloaded to: ${inputFile}`);
      return inputFile;

    } catch (error: any) {
      console.error(`❌ [THMB-3:${correlationId}] Download failed:`, error);
      throw new ThumbnailError(
        ThumbnailErrorCode.STORAGE_READ_FAILURE,
        `Failed to download original file: ${error.message}`,
        true
      );
    }
  }

  /**
   * Convert various formats to base image buffer for variant generation
   */
  private async convertToBaseImage(
    inputFile: string,
    mimeType: string,
    correlationId: string,
    tempFiles: string[]
  ): Promise<Buffer> {
    
    if (mimeType.startsWith('image/')) {
      return await this.processImageFile(inputFile, correlationId);
    } 
    else if (mimeType === 'application/pdf') {
      return await this.processPdfFile(inputFile, correlationId, tempFiles);
    } 
    else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return await this.processDocxFile(inputFile, correlationId, tempFiles);
    } 
    else {
      throw new ThumbnailError(
        ThumbnailErrorCode.UNSUPPORTED_TYPE,
        `Unsupported MIME type: ${mimeType}`,
        false
      );
    }
  }

  /**
   * Process image files with EXIF rotation
   */
  private async processImageFile(inputFile: string, correlationId: string): Promise<Buffer> {
    try {
      console.log(`🖼️ [THMB-3:${correlationId}] Processing image file`);
      
      const imageBuffer = await fs.promises.readFile(inputFile);
      
      // Apply EXIF rotation and normalize
      const processedBuffer = await sharp(imageBuffer)
        .rotate() // Auto-rotate based on EXIF
        .toBuffer();

      return processedBuffer;

    } catch (error: any) {
      console.error(`❌ [THMB-3:${correlationId}] Image processing failed:`, error);
      throw new ThumbnailError(
        ThumbnailErrorCode.IMAGE_DECODE_FAILURE,
        `Failed to process image: ${error.message}`,
        false
      );
    }
  }

  /**
   * Process PDF files using pdftoppm
   */
  private async processPdfFile(inputFile: string, correlationId: string, tempFiles: string[]): Promise<Buffer> {
    const outputPrefix = path.join(this.tmpDir, `${correlationId}_page`);
    const outputFile = `${outputPrefix}-1.png`;
    tempFiles.push(outputFile);

    try {
      console.log(`📄 [THMB-3:${correlationId}] Converting PDF first page to PNG`);

      await this.executeWithTimeout(
        'pdftoppm',
        ['-png', '-f', '1', '-l', '1', '-scale-to', '1200', inputFile, outputPrefix],
        4000, // 4s timeout for PDF rendering
        correlationId
      );

      if (!fs.existsSync(outputFile)) {
        throw new Error(`PDF conversion output not found: ${outputFile}`);
      }

      return await fs.promises.readFile(outputFile);

    } catch (error: any) {
      console.error(`❌ [THMB-3:${correlationId}] PDF processing failed:`, error);
      
      // Check for password protection
      if (error.message.includes('password') || error.message.includes('encrypted')) {
        throw new ThumbnailError(
          ThumbnailErrorCode.PDF_PASSWORD,
          'PDF is password protected',
          false
        );
      }
      
      throw new ThumbnailError(
        ThumbnailErrorCode.PDF_RENDER_FAILURE,
        `Failed to render PDF: ${error.message}`,
        true
      );
    }
  }

  /**
   * Process DOCX files via LibreOffice -> PDF -> Image pipeline
   */
  private async processDocxFile(inputFile: string, correlationId: string, tempFiles: string[]): Promise<Buffer> {
    const pdfOutput = path.join(this.tmpDir, `${correlationId}_converted.pdf`);
    tempFiles.push(pdfOutput);

    try {
      console.log(`📝 [THMB-3:${correlationId}] Converting DOCX to PDF`);

      // Convert DOCX to PDF using LibreOffice
      await this.executeWithTimeout(
        'soffice',
        ['--headless', '--nologo', '--nofirststartwizard', '--convert-to', 'pdf', '--outdir', this.tmpDir, inputFile],
        10000, // 10s timeout for DOCX conversion
        correlationId
      );

      // LibreOffice creates output with input filename + .pdf
      const inputBasename = path.basename(inputFile, path.extname(inputFile));
      const actualPdfOutput = path.join(this.tmpDir, `${inputBasename}.pdf`);
      
      if (fs.existsSync(actualPdfOutput) && actualPdfOutput !== pdfOutput) {
        await fs.promises.rename(actualPdfOutput, pdfOutput);
      }

      if (!fs.existsSync(pdfOutput)) {
        throw new Error(`DOCX conversion output not found: ${pdfOutput}`);
      }

      console.log(`📄 [THMB-3:${correlationId}] Converting generated PDF to image`);

      // Now process the generated PDF
      return await this.processPdfFile(pdfOutput, correlationId, tempFiles);

    } catch (error: any) {
      console.error(`❌ [THMB-3:${correlationId}] DOCX processing failed:`, error);
      
      if (error.message.includes('timeout')) {
        throw new ThumbnailError(
          ThumbnailErrorCode.DOCX_CONVERT_TIMEOUT,
          'DOCX conversion timed out',
          true
        );
      }
      
      throw new ThumbnailError(
        ThumbnailErrorCode.DOCX_CONVERT_FAILURE,
        `Failed to convert DOCX: ${error.message}`,
        false
      );
    }
  }

  /**
   * Execute command with timeout and proper error handling
   */
  private async executeWithTimeout(
    command: string,
    args: string[],
    timeoutMs: number,
    correlationId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`⚡ [THMB-3:${correlationId}] Executing: ${command} ${args.join(' ')}`);
      
      const child = spawn(command, args);
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000); // Force kill after 1s
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        
        if (timedOut) return; // Already handled
        
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        if (timedOut) return;
        
        reject(error);
      });
    });
  }

  /**
   * Generate variants and upload to GCS with idempotency
   */
  private async generateVariants(
    baseImageBuffer: Buffer,
    documentId: number,
    sourceHash: string,
    variants: number[],
    outputFormat: 'jpeg' | 'png',
    fileExtension: string,
    correlationId: string,
    userId: string,
    householdId?: string
  ): Promise<Array<{
    variant: number;
    skipped: boolean;
    url?: string;
    width?: number;
    height?: number;
    fileSize?: number;
  }>> {
    const results = [];

    for (const variant of variants) {
      const objectKey = thumbnailObjectKey(documentId, variant, fileExtension as 'jpg' | 'png', sourceHash);
      
      try {
        // Check if thumbnail already exists (idempotency)
        const exists = await this.storageService.objectExists(objectKey);
        if (exists) {
          console.log(`⏭️ [THMB-3:${correlationId}] Skipping existing variant ${variant}px: ${objectKey}`);
          results.push({ variant, skipped: true });
          continue;
        }

        console.log(`🎨 [THMB-3:${correlationId}] Generating ${variant}px variant`);

        // Generate thumbnail variant
        let image = sharp(baseImageBuffer)
          .rotate() // Ensure proper orientation
          .resize({ 
            width: variant, 
            fit: 'cover',
            withoutEnlargement: true // Don't upscale small images
          });

        let thumbnailBuffer: Buffer;
        
        if (outputFormat === 'png') {
          thumbnailBuffer = await image
            .png({ 
              compressionLevel: 9, 
              palette: true,
              quality: 90
            })
            .toBuffer({ resolveWithObject: true })
            .then(({ data, info }) => {
              console.log(`📏 [THMB-3:${correlationId}] PNG ${variant}px: ${info.width}x${info.height}, ${data.length} bytes`);
              return data;
            });
        } else {
          thumbnailBuffer = await image
            .jpeg({ 
              quality: 80, 
              mozjpeg: true,
              progressive: true
            })
            .toBuffer({ resolveWithObject: true })
            .then(({ data, info }) => {
              console.log(`📏 [THMB-3:${correlationId}] JPEG ${variant}px: ${info.width}x${info.height}, ${data.length} bytes`);
              return data;
            });
        }

        // Get final image metadata
        const finalMetadata = await sharp(thumbnailBuffer).metadata();

        // Upload to GCS with proper metadata
        const uploadResult = await this.storageService.upload(
          thumbnailBuffer,
          objectKey,
          outputFormat === 'png' ? 'image/png' : 'image/jpeg',
          {
            cacheControl: 'public, max-age=31536000, immutable',
            metadata: {
              documentId: documentId.toString(),
              sourceHash,
              variant: variant.toString(),
              generatedAt: new Date().toISOString()
            }
          }
        );

        console.log(`✅ [THMB-3:${correlationId}] Uploaded ${variant}px variant: ${objectKey}`);

        // Emit audit event
        try {
          await logThumbnailWriteCompleted(documentId, userId, householdId, {
            variant,
            sourceHash,
            storagePath: objectKey,
            actor: 'system',
            generationTimeMs: Date.now(),
            fileSize: thumbnailBuffer.length
          });
        } catch (auditError) {
          console.error(`⚠️ [THMB-3:${correlationId}] Audit logging failed:`, auditError);
        }

        results.push({
          variant,
          skipped: false,
          url: uploadResult,
          width: finalMetadata.width!,
          height: finalMetadata.height!,
          fileSize: thumbnailBuffer.length
        });

      } catch (error: any) {
        console.error(`❌ [THMB-3:${correlationId}] Failed to generate ${variant}px variant:`, error);
        throw new ThumbnailError(
          ThumbnailErrorCode.STORAGE_WRITE_FAILURE,
          `Failed to generate variant ${variant}px: ${error.message}`,
          true
        );
      }
    }

    return results;
  }

  /**
   * Clean up temporary files
   */
  private cleanupTempFiles(tempFiles: string[], correlationId: string): void {
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`🧹 [THMB-3:${correlationId}] Cleaned up: ${file}`);
        }
      } catch (error) {
        console.warn(`⚠️ [THMB-3:${correlationId}] Failed to cleanup ${file}:`, error);
      }
    }
  }
}