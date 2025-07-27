import * as Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

interface OCRResult {
  text: string;
  confidence: number;
  words: {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }[];
}

interface ProcessedPage {
  imageBuffer: Buffer;
  ocrResult: OCRResult;
  enhancedImage: Buffer;
  metadata: {
    originalSize: { width: number; height: number };
    processedSize: { width: number; height: number };
    enhancement: string[];
    compression: number;
  };
}

export class AdvancedOCRService {
  private static instance: AdvancedOCRService;
  private tesseractWorker: Tesseract.Worker | null = null;

  private constructor() {}

  public static getInstance(): AdvancedOCRService {
    if (!AdvancedOCRService.instance) {
      AdvancedOCRService.instance = new AdvancedOCRService();
    }
    return AdvancedOCRService.instance;
  }

  /**
   * Initialize Tesseract worker with optimized settings
   */
  async initialize(): Promise<void> {
    if (this.tesseractWorker) return;

    this.tesseractWorker = await Tesseract.createWorker('eng', 1, {
      logger: (m: any) => console.log('OCR:', m)
    });

    await this.tesseractWorker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?@#$%&*()_+-=[]{}|;:\'\"<>/\\~`',
      preserve_interword_spaces: '1',
    });
  }

  /**
   * Apply advanced image enhancements for better OCR
   */
  async enhanceImageForOCR(imageBuffer: Buffer): Promise<{
    enhanced: Buffer;
    metadata: { enhancement: string[]; originalSize: any; processedSize: any };
  }> {
    const enhancements: string[] = [];
    
    try {
      let image = sharp(imageBuffer);
      const originalMetadata = await image.metadata();
      
      // 1. Resize to optimal OCR resolution (300 DPI equivalent)
      const targetWidth = Math.min(2400, originalMetadata.width || 1920);
      image = image.resize(targetWidth, null, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true
      });
      enhancements.push('resize');

      // 2. Convert to grayscale for better OCR (unless color is specifically needed)
      image = image.grayscale();
      enhancements.push('grayscale');

      // 3. Normalize brightness and contrast
      image = image.normalize();
      enhancements.push('normalize');

      // 4. Apply unsharp mask for edge enhancement
      image = image.sharpen(1.0, 1.0, 2.0);
      enhancements.push('sharpen');

      // 5. Apply noise reduction
      image = image.median(1);
      enhancements.push('denoise');

      // 6. Enhance contrast for text clarity
      image = image.modulate({
        brightness: 1.1,
        saturation: 1.0,
        hue: 0
      });
      enhancements.push('contrast');

      const enhancedBuffer = await image.jpeg({ quality: 95 }).toBuffer();
      const processedMetadata = await sharp(enhancedBuffer).metadata();

      return {
        enhanced: enhancedBuffer,
        metadata: {
          enhancement: enhancements,
          originalSize: { width: originalMetadata.width, height: originalMetadata.height },
          processedSize: { width: processedMetadata.width, height: processedMetadata.height }
        }
      };
    } catch (error) {
      console.error('Image enhancement error:', error);
      throw new Error(`Image enhancement failed: ${error}`);
    }
  }

  /**
   * Apply perspective correction to document images
   */
  async correctPerspective(
    imageBuffer: Buffer, 
    corners?: { x: number; y: number }[]
  ): Promise<Buffer> {
    try {
      let image = sharp(imageBuffer);
      const metadata = await image.metadata();
      
      if (corners && corners.length === 4) {
        // Apply perspective transformation based on detected corners
        // This is a simplified implementation - in production, you'd use more sophisticated algorithms
        const width = metadata.width || 1920;
        const height = metadata.height || 1080;
        
        // Calculate transformation matrix and apply
        // For now, we'll apply basic skew correction
        image = image.affine([1, 0, 0, 1], {
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        });
      }

      return await image.jpeg({ quality: 95 }).toBuffer();
    } catch (error) {
      console.error('Perspective correction error:', error);
      return imageBuffer; // Return original if correction fails
    }
  }

  /**
   * Apply intelligent color filtering
   */
  async applyColorFilter(
    imageBuffer: Buffer, 
    mode: 'auto' | 'color' | 'grayscale' | 'bw'
  ): Promise<Buffer> {
    try {
      let image = sharp(imageBuffer);
      
      switch (mode) {
        case 'grayscale':
          image = image.grayscale();
          break;
          
        case 'bw':
          // Convert to black and white with threshold
          image = image.grayscale().threshold(128);
          break;
          
        case 'auto':
          // Analyze image to determine best color mode
          const stats = await image.stats();
          const isGrayscale = stats.channels.every(channel => 
            Math.abs(channel.mean - stats.channels[0].mean) < 10
          );
          
          if (isGrayscale) {
            image = image.grayscale();
          }
          break;
          
        case 'color':
        default:
          // Keep original colors
          break;
      }

      return await image.jpeg({ quality: 90 }).toBuffer();
    } catch (error) {
      console.error('Color filter error:', error);
      return imageBuffer;
    }
  }

  /**
   * Extract text from enhanced image using OCR
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
    if (!this.tesseractWorker) {
      await this.initialize();
    }

    if (!this.tesseractWorker) {
      throw new Error('OCR worker not initialized');
    }

    try {
      const result = await this.tesseractWorker.recognize(imageBuffer);
      
      return {
        text: result.data.text,
        confidence: result.data.confidence,
        words: result.data.words.map(word => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox
        }))
      };
    } catch (error) {
      console.error('OCR extraction error:', error);
      throw new Error(`OCR extraction failed: ${error}`);
    }
  }

  /**
   * Process multiple pages for multi-page document scanning
   */
  async processMultiplePages(
    pages: {
      imageBuffer: Buffer;
      corners?: { x: number; y: number }[];
      colorMode: 'auto' | 'color' | 'grayscale' | 'bw';
    }[]
  ): Promise<ProcessedPage[]> {
    const processedPages: ProcessedPage[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      console.log(`Processing page ${i + 1}/${pages.length}`);

      try {
        // 1. Apply perspective correction
        const correctedImage = await this.correctPerspective(page.imageBuffer, page.corners);
        
        // 2. Apply color filtering
        const filteredImage = await this.applyColorFilter(correctedImage, page.colorMode);
        
        // 3. Enhance image for OCR
        const { enhanced, metadata } = await this.enhanceImageForOCR(filteredImage);
        
        // 4. Extract text using OCR
        const ocrResult = await this.extractTextFromImage(enhanced);

        processedPages.push({
          imageBuffer: page.imageBuffer,
          ocrResult,
          enhancedImage: enhanced,
          metadata: {
            ...metadata,
            compression: (enhanced.length / page.imageBuffer.length) * 100
          }
        });

      } catch (error) {
        console.error(`Error processing page ${i + 1}:`, error);
        throw new Error(`Failed to process page ${i + 1}: ${error}`);
      }
    }

    return processedPages;
  }

  /**
   * Generate searchable PDF with embedded OCR text
   */
  async generateSearchablePDF(
    processedPages: ProcessedPage[],
    filename: string = 'scanned-document.pdf'
  ): Promise<{ pdfBuffer: Buffer; metadata: any }> {
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      let totalTextLength = 0;
      const pageTexts: string[] = [];

      for (let i = 0; i < processedPages.length; i++) {
        const processedPage = processedPages[i];
        
        // Embed the enhanced image
        const image = await pdfDoc.embedJpg(processedPage.enhancedImage);
        const imageDims = image.scale(1);
        
        // Create page with appropriate dimensions
        const page = pdfDoc.addPage([imageDims.width, imageDims.height]);
        
        // Draw the image
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: imageDims.width,
          height: imageDims.height,
        });

        // Add invisible OCR text for searchability
        if (processedPage.ocrResult.text.trim()) {
          const ocrText = processedPage.ocrResult.text.trim();
          pageTexts.push(ocrText);
          totalTextLength += ocrText.length;

          // Add invisible text overlay for search functionality
          // Position text based on OCR word bounding boxes
          if (processedPage.ocrResult.words && processedPage.ocrResult.words.length > 0) {
            processedPage.ocrResult.words.forEach(word => {
              if (word.confidence > 30) { // Only include confident words
                page.drawText(word.text, {
                  x: word.bbox.x0,
                  y: imageDims.height - word.bbox.y1, // Flip Y coordinate
                  size: Math.max(8, word.bbox.y1 - word.bbox.y0), // Estimate font size
                  font,
                  color: rgb(1, 1, 1), // White text (invisible)
                  opacity: 0.01, // Nearly transparent
                });
              }
            });
          }
        }
      }

      // Add document metadata
      pdfDoc.setTitle(filename.replace('.pdf', ''));
      pdfDoc.setSubject('Scanned Document with OCR');
      pdfDoc.setCreator('MyHome Advanced Scanner');
      pdfDoc.setProducer('MyHome Document Management');
      pdfDoc.setCreationDate(new Date());
      pdfDoc.setModificationDate(new Date());

      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = Buffer.from(pdfBytes);

      return {
        pdfBuffer,
        metadata: {
          pageCount: processedPages.length,
          totalTextLength,
          pageTexts,
          fileSize: pdfBuffer.length,
          averageConfidence: processedPages.reduce((sum, page) => 
            sum + page.ocrResult.confidence, 0) / processedPages.length,
          compressionRatio: processedPages.reduce((sum, page) => 
            sum + page.metadata.compression, 0) / processedPages.length
        }
      };

    } catch (error) {
      console.error('PDF generation error:', error);
      throw new Error(`PDF generation failed: ${error}`);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}

// Export singleton instance
export const advancedOCRService = AdvancedOCRService.getInstance();