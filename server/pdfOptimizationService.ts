import { PDFDocument, PDFPage } from 'pdf-lib';
import { promises as fs } from 'fs';
import path from 'path';

interface PDFOptimizationOptions {
  maxPages?: number;
  generatePreview?: boolean;
  compressImages?: boolean;
  removeMetadata?: boolean;
}

const DEFAULT_OPTIONS: PDFOptimizationOptions = {
  maxPages: 50, // Limit for preview generation
  generatePreview: true,
  compressImages: true,
  removeMetadata: true,
};

export class PDFOptimizationService {
  private uploadsDir: string;
  private previewsDir: string;

  constructor(uploadsDir: string = './uploads') {
    this.uploadsDir = uploadsDir;
    this.previewsDir = path.join(uploadsDir, 'pdf-previews');
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.previewsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create PDF preview directory:', error);
    }
  }

  async optimizePDF(
    inputPath: string,
    outputPath: string,
    options: PDFOptimizationOptions = {}
  ): Promise<{
    optimizedPath: string;
    previewPath?: string;
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
    pageCount: number;
  }> {
    const config = { ...DEFAULT_OPTIONS, ...options };
    
    try {
      // Read original PDF
      const originalBuffer = await fs.readFile(inputPath);
      const originalSize = originalBuffer.length;
      
      console.log('Optimizing PDF:', {
        inputPath,
        originalSize: `${(originalSize / 1024).toFixed(1)}KB`,
        options: config
      });

      // Parse PDF document
      const pdfDoc = await PDFDocument.load(originalBuffer);
      const pageCount = pdfDoc.getPageCount();

      console.log(`PDF has ${pageCount} pages`);

      // Remove metadata if requested
      if (config.removeMetadata) {
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('MyHome Document Manager');
        pdfDoc.setCreator('MyHome Document Manager');
      }

      // Optimize and save main PDF
      const optimizedBuffer = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50,
      });

      await fs.writeFile(outputPath, optimizedBuffer);
      const optimizedSize = optimizedBuffer.length;
      const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

      console.log('PDF optimization completed:', {
        optimizedSize: `${(optimizedSize / 1024).toFixed(1)}KB`,
        compressionRatio: `${compressionRatio.toFixed(1)}%`,
        pageCount
      });

      let previewPath: string | undefined;

      // Generate preview with first few pages if requested
      if (config.generatePreview && pageCount > 1) {
        previewPath = await this.generatePreview(pdfDoc, inputPath, config.maxPages!);
      }

      return {
        optimizedPath: outputPath,
        previewPath,
        originalSize,
        optimizedSize,
        compressionRatio,
        pageCount,
      };

    } catch (error) {
      console.error('PDF optimization failed:', error);
      throw new Error(`Failed to optimize PDF: ${error.message}`);
    }
  }

  private async generatePreview(
    pdfDoc: PDFDocument,
    originalPath: string,
    maxPages: number
  ): Promise<string> {
    try {
      const fileName = path.basename(originalPath, path.extname(originalPath));
      const previewPath = path.join(this.previewsDir, `${fileName}_preview.pdf`);

      // Create new document with limited pages
      const previewDoc = await PDFDocument.create();
      const totalPages = pdfDoc.getPageCount();
      const pagesToCopy = Math.min(maxPages, totalPages);

      console.log(`Generating PDF preview with first ${pagesToCopy} pages`);

      // Copy first few pages
      const pageIndices = Array.from({ length: pagesToCopy }, (_, i) => i);
      const copiedPages = await previewDoc.copyPages(pdfDoc, pageIndices);
      
      copiedPages.forEach((page) => {
        previewDoc.addPage(page);
      });

      // Add a note if pages were truncated
      if (totalPages > maxPages) {
        const lastPage = previewDoc.addPage();
        const { width, height } = lastPage.getSize();
        
        lastPage.drawText(
          `This preview shows the first ${maxPages} pages of ${totalPages} total pages.\nOpen the full document to view all pages.`,
          {
            x: 50,
            y: height - 100,
            size: 12,
          }
        );
      }

      const previewBuffer = await previewDoc.save();
      await fs.writeFile(previewPath, previewBuffer);

      console.log('PDF preview generated:', previewPath);
      return previewPath;

    } catch (error) {
      console.error('Failed to generate PDF preview:', error);
      throw error;
    }
  }

  async getPDFInfo(filePath: string): Promise<{
    pageCount: number;
    fileSize: number;
    hasText: boolean;
    metadata: any;
  }> {
    try {
      const buffer = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(buffer);
      
      const pageCount = pdfDoc.getPageCount();
      const fileSize = buffer.length;
      
      // Basic metadata extraction
      const metadata = {
        title: pdfDoc.getTitle() || '',
        author: pdfDoc.getAuthor() || '',
        subject: pdfDoc.getSubject() || '',
        creator: pdfDoc.getCreator() || '',
        producer: pdfDoc.getProducer() || '',
        creationDate: pdfDoc.getCreationDate(),
        modificationDate: pdfDoc.getModificationDate(),
      };

      // Simple heuristic to check if PDF has text (vs pure images)
      const firstPage = pdfDoc.getPage(0);
      const hasText = firstPage !== undefined; // More sophisticated text detection would require additional libraries

      return {
        pageCount,
        fileSize,
        hasText,
        metadata,
      };

    } catch (error) {
      throw new Error(`Failed to get PDF info: ${error.message}`);
    }
  }

  getPreviewPath(originalPath: string): string {
    const fileName = path.basename(originalPath, path.extname(originalPath));
    return path.join(this.previewsDir, `${fileName}_preview.pdf`);
  }

  async deletePreview(originalPath: string): Promise<void> {
    try {
      const previewPath = this.getPreviewPath(originalPath);
      await fs.unlink(previewPath);
    } catch (error) {
      console.warn('Failed to delete PDF preview:', error.message);
    }
  }
}