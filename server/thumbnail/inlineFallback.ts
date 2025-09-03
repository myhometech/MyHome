/**
 * THMB-EMERGENCY-BYPASS: Inline fallback renderer for when worker is down
 * Generates 240px thumbnails only with strict timeouts and safety rails
 */

import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StorageService } from '../storage/StorageService';

const exec = promisify(execFile);

interface InlineFallbackOptions {
  documentId: number;
  sourceHash: string;
  mimeType: string;
  storagePath: string;
  userId: string;
}

interface InlineFallbackResult {
  key: string;
  url: string;
  format: 'jpg' | 'png';
}

export class InlineFallbackRenderer {
  private readonly storageProvider = StorageService.getProvider();
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB limit
  private readonly timeouts = {
    download: 5000,
    pdf: 4000,
    office: 8000,
    image: 2000
  };

  constructor() {
    // Use storage provider instance
  }

  /**
   * Generate 240px thumbnail inline when worker is down
   * EMERGENCY ONLY - bounded execution with strict timeouts
   */
  async generate240Now(options: InlineFallbackOptions): Promise<InlineFallbackResult> {
    const { documentId, sourceHash, mimeType, storagePath } = options;
    const tmpDir = '/tmp/inline-fallback';
    const tmpIn = path.join(tmpDir, `in-${documentId}-${Date.now()}`);
    const correlationId = `INLINE-${documentId}`;

    // Ensure tmp directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const tempFiles: string[] = [tmpIn];

    try {
      console.log(`🚨 [${correlationId}] EMERGENCY: Generating inline 240px thumbnail for doc ${documentId}`);

      // 1. Download original with timeout
      const downloadStart = Date.now();
      await this.downloadWithTimeout(storagePath, tmpIn, this.timeouts.download);
      console.log(`⬇️ [${correlationId}] Downloaded in ${Date.now() - downloadStart}ms`);

      // 2. Validate file size
      const fileSize = fs.statSync(tmpIn).size;
      if (fileSize > this.maxFileSize) {
        throw new Error(`File size ${fileSize} exceeds 10MB limit`);
      }

      // 3. Convert to base image with type-specific timeouts
      const renderStart = Date.now();
      const baseImageBuffer = await this.convertToBaseImage(tmpIn, mimeType, correlationId, tempFiles);
      console.log(`🎨 [${correlationId}] Rendered in ${Date.now() - renderStart}ms`);

      // 4. Analyze and determine format
      const metadata = await sharp(baseImageBuffer).metadata();
      const hasTransparency = !!metadata.hasAlpha;
      const format = hasTransparency ? 'png' : 'jpg';

      console.log(`📐 [${correlationId}] Base: ${metadata.width}x${metadata.height}, format: ${format}`);

      // 5. Generate 240px thumbnail
      const thumbnailBuffer = await this.generate240Thumbnail(baseImageBuffer, hasTransparency);

      // 6. Upload to GCS
      const uploadStart = Date.now();
      const key = `thumbnails/${documentId}/240/v${sourceHash}.${format}`;
      
      await this.storageProvider.upload(
        thumbnailBuffer, 
        key, 
        hasTransparency ? 'image/png' : 'image/jpeg'
      );

      console.log(`⬆️ [${correlationId}] Uploaded in ${Date.now() - uploadStart}ms`);

      // 7. Generate signed URL
      const url = await this.storageProvider.getSignedUrl(key, 1800);

      console.log(`✅ [${correlationId}] EMERGENCY thumbnail complete: ${key}`);

      return { key, url, format };

    } finally {
      // Cleanup temp files
      this.cleanupTempFiles(tempFiles, correlationId);
    }
  }

  private async downloadWithTimeout(storagePath: string, localPath: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Download timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.storageProvider.download(storagePath)
        .then((buffer: Buffer) => require('fs').promises.writeFile(localPath, buffer))
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error: any) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private async convertToBaseImage(
    inputFile: string, 
    mimeType: string, 
    correlationId: string,
    tempFiles: string[]
  ): Promise<Buffer> {
    if (mimeType.startsWith('image/')) {
      return this.processImage(inputFile);
    } else if (mimeType === 'application/pdf') {
      return this.processPdf(inputFile, correlationId, tempFiles);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return this.processDocx(inputFile, correlationId, tempFiles);
    } else {
      throw new Error(`UNSUPPORTED_TYPE: ${mimeType}`);
    }
  }

  private async processImage(inputFile: string): Promise<Buffer> {
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Image processing timeout')), this.timeouts.image)
    );

    const processing = fs.promises.readFile(inputFile);

    return Promise.race([processing, timeout]);
  }

  private async processPdf(inputFile: string, correlationId: string, tempFiles: string[]): Promise<Buffer> {
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('PDF processing timeout')), this.timeouts.pdf)
    );

    const processing = (async () => {
      const outputBase = `/tmp/inline-fallback/page-${correlationId}`;
      tempFiles.push(`${outputBase}-1.png`);

      await exec('pdftoppm', [
        '-png', '-f', '1', '-l', '1', 
        '-scale-to', '1200', 
        inputFile, outputBase
      ]);

      return fs.promises.readFile(`${outputBase}-1.png`);
    })();

    return Promise.race([processing, timeout]);
  }

  private async processDocx(inputFile: string, correlationId: string, tempFiles: string[]): Promise<Buffer> {
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('DOCX processing timeout')), this.timeouts.office)
    );

    const processing = (async () => {
      const pdfFile = `/tmp/inline-fallback/converted-${correlationId}.pdf`;
      const outputBase = `/tmp/inline-fallback/page-${correlationId}`;
      
      tempFiles.push(pdfFile, `${outputBase}-1.png`);

      // Convert DOCX to PDF
      await exec('soffice', [
        '--headless', '--nologo', '--nofirststartwizard',
        '--convert-to', 'pdf', inputFile,
        '--outdir', '/tmp/inline-fallback'
      ]);

      // Convert PDF first page to PNG
      await exec('pdftoppm', [
        '-png', '-f', '1', '-l', '1',
        '-scale-to', '1200',
        pdfFile, outputBase
      ]);

      return fs.promises.readFile(`${outputBase}-1.png`);
    })();

    return Promise.race([processing, timeout]);
  }

  private async generate240Thumbnail(baseImageBuffer: Buffer, hasTransparency: boolean): Promise<Buffer> {
    const processor = sharp(baseImageBuffer)
      .rotate()
      .resize({ width: 240, fit: 'cover' });

    if (hasTransparency) {
      return processor.png({ compressionLevel: 9, palette: true }).toBuffer();
    } else {
      return processor.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    }
  }

  private cleanupTempFiles(tempFiles: string[], correlationId: string): void {
    tempFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.warn(`⚠️ [${correlationId}] Failed to cleanup ${file}:`, error);
      }
    });
  }
}

// Singleton instance
export const inlineFallbackRenderer = new InlineFallbackRenderer();