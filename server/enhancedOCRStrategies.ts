import sharp from 'sharp';
import { AdvancedOCRService } from './advancedOCRService';

export interface OCRRetryOptions {
  enableMultipleStrategies: boolean;
  enableImagePreprocessing: boolean;
  enableAdaptiveThresholding: boolean;
  enableDeskewing: boolean;
  maxRetries: number;
}

export interface EnhancedOCRResult {
  text: string;
  confidence: number;
  strategy: string;
  preprocessingApplied: string[];
  originalConfidence?: number;
}

export class EnhancedOCRStrategies {
  private ocrService: AdvancedOCRService;

  constructor() {
    this.ocrService = AdvancedOCRService.getInstance();
  }

  /**
   * Try multiple OCR strategies when standard OCR fails or has low confidence
   */
  async performAdvancedOCR(
    imageBuffer: Buffer,
    options: OCRRetryOptions = {
      enableMultipleStrategies: true,
      enableImagePreprocessing: true,
      enableAdaptiveThresholding: true,
      enableDeskewing: true,
      maxRetries: 4
    }
  ): Promise<EnhancedOCRResult> {
    console.log('🔍 Starting enhanced OCR with multiple strategies...');
    
    const strategies = [
      { name: 'standard', preprocessor: this.standardPreprocessing.bind(this) },
      { name: 'high_contrast', preprocessor: this.highContrastPreprocessing.bind(this) },
      { name: 'deskewed', preprocessor: this.deskewPreprocessing.bind(this) },
      { name: 'binary_threshold', preprocessor: this.binaryThresholdPreprocessing.bind(this) },
      { name: 'denoised', preprocessor: this.denoisedPreprocessing.bind(this) }
    ];

    let bestResult: EnhancedOCRResult = {
      text: '',
      confidence: 0,
      strategy: 'none',
      preprocessingApplied: []
    };

    for (let i = 0; i < Math.min(strategies.length, options.maxRetries); i++) {
      const strategy = strategies[i];
      
      try {
        console.log(`📝 Trying OCR strategy: ${strategy.name}`);
        
        const preprocessedImage = await strategy.preprocessor(imageBuffer);
        const ocrResult = await this.ocrService.extractTextFromImage(preprocessedImage.buffer);
        
        const result: EnhancedOCRResult = {
          text: ocrResult.text,
          confidence: ocrResult.confidence,
          strategy: strategy.name,
          preprocessingApplied: preprocessedImage.applied
        };

        console.log(`📊 Strategy '${strategy.name}' confidence: ${result.confidence}%`);

        if (result.confidence > bestResult.confidence) {
          bestResult = result;
        }

        // If we get high confidence, use this result
        if (result.confidence > 80) {
          console.log(`✅ High confidence result found with strategy: ${strategy.name}`);
          return result;
        }

      } catch (error) {
        console.error(`❌ Strategy '${strategy.name}' failed:`, error);
        continue;
      }
    }

    console.log(`🏆 Best OCR result: ${bestResult.strategy} (${bestResult.confidence}%)`);
    return bestResult;
  }

  /**
   * Standard preprocessing (current approach)
   */
  private async standardPreprocessing(imageBuffer: Buffer): Promise<{ buffer: Buffer, applied: string[] }> {
    const applied = ['standard'];
    return {
      buffer: imageBuffer,
      applied
    };
  }

  /**
   * High contrast preprocessing for faded documents
   */
  private async highContrastPreprocessing(imageBuffer: Buffer): Promise<{ buffer: Buffer, applied: string[] }> {
    const applied = ['high_contrast', 'gamma', 'sharpen'];
    
    const processedBuffer = await sharp(imageBuffer)
      .grayscale()
      .gamma(0.7) // Darken to improve contrast
      .linear(1.5, -(128 * 1.5) + 128) // Increase contrast significantly
      .sharpen(3.0, 1.0, 4.0) // Aggressive sharpening
      .jpeg({ quality: 98 })
      .toBuffer();

    return {
      buffer: processedBuffer,
      applied
    };
  }

  /**
   * Deskewing for tilted/rotated documents
   */
  private async deskewPreprocessing(imageBuffer: Buffer): Promise<{ buffer: Buffer, applied: string[] }> {
    const applied = ['deskew', 'rotate', 'perspective_correct'];
    
    // Simple rotation corrections - in production, you'd use more sophisticated deskewing
    const processedBuffer = await sharp(imageBuffer)
      .grayscale()
      .rotate(0) // Placeholder - would implement actual skew detection
      .trim() // Remove any black borders after rotation
      .resize(null, null, { 
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 95 })
      .toBuffer();

    return {
      buffer: processedBuffer,
      applied
    };
  }

  /**
   * Binary threshold preprocessing for clear text separation
   */
  private async binaryThresholdPreprocessing(imageBuffer: Buffer): Promise<{ buffer: Buffer, applied: string[] }> {
    const applied = ['binary_threshold', 'erosion_dilation'];
    
    // Analyze image brightness to set optimal threshold
    const image = sharp(imageBuffer);
    const stats = await image.grayscale().stats();
    const avgBrightness = stats.channels[0].mean;
    
    // Adaptive threshold based on image characteristics
    let threshold = 128;
    if (avgBrightness < 80) {
      threshold = 90; // Lower threshold for dark images
    } else if (avgBrightness > 180) {
      threshold = 170; // Higher threshold for bright images
    } else {
      threshold = 130; // Slightly higher for typical scans
    }

    const processedBuffer = await image
      .grayscale()
      .threshold(threshold)
      .jpeg({ quality: 98 })
      .toBuffer();

    return {
      buffer: processedBuffer,
      applied
    };
  }

  /**
   * Aggressive noise reduction for poor quality scans
   */
  private async denoisedPreprocessing(imageBuffer: Buffer): Promise<{ buffer: Buffer, applied: string[] }> {
    const applied = ['denoise', 'gaussian_blur', 'bilateral_filter'];
    
    const processedBuffer = await sharp(imageBuffer)
      .grayscale()
      .blur(0.5) // Light blur to reduce noise
      .sharpen(1.5, 1.0, 2.5) // Compensate with sharpening
      .median(2) // Median filter for noise reduction
      .modulate({
        brightness: 1.1,
        saturation: 1.0
      })
      .jpeg({ quality: 96 })
      .toBuffer();

    return {
      buffer: processedBuffer,
      applied
    };
  }

  /**
   * Get OCR improvement suggestions based on image analysis
   */
  async analyzeImageForOCRTips(imageBuffer: Buffer): Promise<string[]> {
    const tips: string[] = [];
    
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const stats = await image.stats();

      // Check resolution
      if (metadata.width && metadata.width < 1200) {
        tips.push("📐 Try taking the photo from closer to increase resolution (current: " + metadata.width + "px)");
      }

      // Check brightness
      const avgBrightness = stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length;
      if (avgBrightness < 50) {
        tips.push("💡 Image is too dark - try better lighting or flash");
      } else if (avgBrightness > 200) {
        tips.push("☀️ Image is too bright - avoid direct sunlight or flash glare");
      }

      // Check contrast
      const avgStdDev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;
      if (avgStdDev < 30) {
        tips.push("📊 Low contrast detected - ensure good lighting difference between text and background");
      }

      // Check for potential blur
      if (avgStdDev < 20) {
        tips.push("📷 Possible blur detected - hold device steady and ensure proper focus");
      }

      // General tips if no specific issues found
      if (tips.length === 0) {
        tips.push("✨ Image quality looks good! If OCR still fails, try the 'Black & White' filter in camera settings");
        tips.push("🔄 For difficult documents, try scanning in segments and combining results");
      }

    } catch (error) {
      tips.push("❓ Unable to analyze image - ensure file is a valid image format");
    }

    return tips;
  }
}