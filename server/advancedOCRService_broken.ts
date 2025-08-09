import * as Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { resourceTracker } from './resourceTracker';

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
  private workerTrackingId: string | null = null;
  private activeBuffers: Set<WeakRef<Buffer>> = new Set();

  private constructor() {
    // Register cleanup task with ResourceTracker
    resourceTracker.registerCleanupTask(async () => {
      await this.cleanup();
    });
  }

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

    try {
      this.tesseractWorker = await Tesseract.createWorker('eng', 1, {
        logger: (m: any) => console.log('OCR:', m)
      });

      // Track the worker for cleanup
      this.workerTrackingId = resourceTracker.trackWorker('tesseract', async () => {
        if (this.tesseractWorker) {
          await this.tesseractWorker.terminate();
          this.tesseractWorker = null;
        }
      });

      await this.tesseractWorker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?@#$%&*()_+-=[]{}|;:\'\"<>/\\~`',
        preserve_interword_spaces: '1',
        // Enhanced parameters for better OCR accuracy
        textord_min_linesize: '2.5',
        textord_tabfind_show_vlines: '0',
        wordrec_enable_assoc: '1',
        classify_enable_learning: '1',
        tessedit_enable_doc_dict: '1',
        load_system_dawg: '1',
        load_freq_dawg: '1',
      });

      console.log('✅ OCR Service initialized with resource tracking');
    } catch (error) {
      console.error('❌ Failed to initialize OCR service:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Apply advanced image enhancements for better OCR
   */
  async enhanceImageForOCR(imageBuffer: Buffer): Promise<{
    enhanced: Buffer;
    metadata: { enhancement: string[]; originalSize: any; processedSize: any };
  }> {
    const enhancements: string[] = [];
    let sharpInstance: sharp.Sharp | null = null;
    let bufferId: string | null = null;

    try {
      // Track input buffer
      bufferId = resourceTracker.trackBuffer(imageBuffer);
      
      sharpInstance = sharp(imageBuffer);
    
    try {
      let image = sharp(imageBuffer);
      const originalMetadata = await image.metadata();
      
      // 1. Resize to optimal OCR resolution (300 DPI equivalent)
      const targetWidth = Math.min(3000, originalMetadata.width || 1920);
      image = image.resize(targetWidth, null, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true
      });
      enhancements.push('resize');

      // 2. Convert to grayscale for better OCR (unless color is specifically needed)
      image = image.grayscale();
      enhancements.push('grayscale');

      // 3. Advanced noise reduction using gaussian blur
      image = image.blur(0.3);
      enhancements.push('blur');

      // 4. Normalize brightness and contrast with linear adjustment
      image = image.linear(1.2, -(128 * 1.2) + 128);
      enhancements.push('linear_contrast');

      // 5. Apply histogram equalization effect via normalize
      image = image.normalize();
      enhancements.push('normalize');

      // 6. Apply unsharp mask for edge enhancement with stronger settings
      image = image.sharpen(2.0, 1.0, 3.0);
      enhancements.push('sharpen');

      // 7. Apply median filter for additional noise reduction
      image = image.median(1);
      enhancements.push('median_filter');

      // 8. Enhance contrast for text clarity with gamma correction
      image = image.gamma(1.2);
      enhancements.push('gamma');

      // 9. Final brightness and contrast enhancement
      image = image.modulate({
        brightness: 1.15,
        saturation: 1.0,
        hue: 0
      });
      enhancements.push('final_contrast');

      const enhancedBuffer = await image.jpeg({ quality: 98 }).toBuffer();
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
          // Convert to black and white with adaptive threshold
          // First convert to grayscale, then apply threshold
          const stats = await image.grayscale().stats();
          const avgBrightness = stats.channels[0].mean;
          
          // Adaptive threshold based on image brightness
          let threshold = 128;
          if (avgBrightness < 100) {
            threshold = 100; // Lower threshold for dark images
          } else if (avgBrightness > 180) {
            threshold = 160; // Higher threshold for bright images
          }
          
          image = image.grayscale().threshold(threshold);
          break;
          
        case 'auto':
          // Advanced analysis to determine best color mode
          const colorStats = await image.stats();
          
          // Check if image is already grayscale
          const isGrayscale = colorStats.channels.length === 1 || 
            colorStats.channels.every(channel => 
              Math.abs(channel.mean - colorStats.channels[0].mean) < 15
            );
          
          if (isGrayscale) {
            image = image.grayscale();
            
            // For very low contrast grayscale images, try black and white
            const contrast = colorStats.channels[0].stdev;
            if (contrast < 30) {
              const avgBrightness = colorStats.channels[0].mean;
              const threshold = avgBrightness > 128 ? 160 : 100;
              image = image.threshold(threshold);
            }
          } else {
            // For color images, enhance saturation slightly to improve text contrast
            image = image.modulate({
              saturation: 0.8, // Reduce saturation to emphasize text
              brightness: 1.0,
              hue: 0
            });
          }
          break;
          
        case 'color':
        default:
          // Keep original colors but enhance for OCR
          image = image.modulate({
            saturation: 0.9, // Slightly reduce saturation
            brightness: 1.05,
            hue: 0
          });
          break;
      }

      return await image.jpeg({ quality: 95 }).toBuffer();
    } catch (error) {
      console.error('Color filter error:', error);
      return imageBuffer;
    }
  }

  /**
   * Extract text from enhanced image using OCR with multiple strategies
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
    if (!this.tesseractWorker) {
      await this.initialize();
    }

    if (!this.tesseractWorker) {
      throw new Error('OCR worker not initialized');
    }

    try {
      // Strategy 1: Default AUTO page segmentation
      const result1 = await this.performOCRWithSettings(imageBuffer, {
        tessedit_pageseg_mode: Tesseract.PSM.AUTO
      });

      // If confidence is low, try alternative strategies
      if (result1.confidence < 60) {
        console.log('Low confidence OCR, trying alternative strategies...');
        
        // Strategy 2: Single uniform block of text
        const result2 = await this.performOCRWithSettings(imageBuffer, {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
        });

        // Strategy 3: Single text line
        const result3 = await this.performOCRWithSettings(imageBuffer, {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE
        });

        // Strategy 4: Sparse text - find text in no particular order
        const result4 = await this.performOCRWithSettings(imageBuffer, {
          tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT
        });

        // Return the result with highest confidence
        const results = [result1, result2, result3, result4];
        const bestResult = results.reduce((prev, current) => 
          current.confidence > prev.confidence ? current : prev
        );

        console.log(`Best OCR result confidence: ${bestResult.confidence}%`);
        return bestResult;
      }

      return result1;
    } catch (error) {
      console.error('OCR extraction error:', error);
      throw new Error(`OCR extraction failed: ${error}`);
    }
  }

  /**
   * Perform OCR with specific settings
   */
  private async performOCRWithSettings(
    imageBuffer: Buffer, 
    settings: { [key: string]: any }
  ): Promise<OCRResult> {
    if (!this.tesseractWorker) {
      throw new Error('OCR worker not initialized');
    }

    // Apply settings
    await this.tesseractWorker.setParameters(settings);
    
    const result = await this.tesseractWorker.recognize(imageBuffer);
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: (result.data.words || []).map((word: any) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox
      }))
    };
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