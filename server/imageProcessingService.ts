import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  generateThumbnail?: boolean;
  thumbnailSize?: number;
}

const DEFAULT_OPTIONS: ImageProcessingOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 80,
  format: 'jpeg',
  generateThumbnail: true,
  thumbnailSize: 300,
};

export class ImageProcessingService {
  private uploadsDir: string;
  private thumbnailsDir: string;

  constructor(uploadsDir: string = './uploads') {
    this.uploadsDir = uploadsDir;
    this.thumbnailsDir = path.join(uploadsDir, 'thumbnails');
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.thumbnailsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create thumbnail directory:', error);
    }
  }

  async processImage(
    inputPath: string,
    outputPath: string,
    options: ImageProcessingOptions = {}
  ): Promise<{ 
    processedPath: string; 
    thumbnailPath?: string; 
    metadata: sharp.Metadata;
    compressionRatio: number;
  }> {
    const config = { ...DEFAULT_OPTIONS, ...options };
    
    try {
      // Get original file stats
      const originalStats = await fs.stat(inputPath);
      const originalSize = originalStats.size;

      // Process main image
      const image = sharp(inputPath);
      const metadata = await image.metadata();
      
      console.log('Processing image:', {
        original: { width: metadata.width, height: metadata.height, size: `${(originalSize / 1024).toFixed(1)}KB` },
        target: { maxWidth: config.maxWidth, maxHeight: config.maxHeight, quality: config.quality }
      });

      // Resize and compress main image
      let processedImage = image
        .resize(config.maxWidth, config.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });

      // Apply format-specific processing
      switch (config.format) {
        case 'jpeg':
          processedImage = processedImage.jpeg({ 
            quality: config.quality,
            progressive: true,
            mozjpeg: true,
          });
          break;
        case 'png':
          processedImage = processedImage.png({ 
            compressionLevel: 8,
            adaptiveFiltering: true,
          });
          break;
        case 'webp':
          processedImage = processedImage.webp({ 
            quality: config.quality,
            effort: 6,
          });
          break;
      }

      await processedImage.toFile(outputPath);

      // Get processed file stats
      const processedStats = await fs.stat(outputPath);
      const processedSize = processedStats.size;
      const compressionRatio = ((originalSize - processedSize) / originalSize) * 100;

      console.log('Image processing completed:', {
        processed: { size: `${(processedSize / 1024).toFixed(1)}KB` },
        compressionRatio: `${compressionRatio.toFixed(1)}%`
      });

      let thumbnailPath: string | undefined;

      // Generate thumbnail if requested
      if (config.generateThumbnail) {
        const fileName = path.basename(outputPath, path.extname(outputPath));
        const ext = path.extname(outputPath);
        thumbnailPath = path.join(this.thumbnailsDir, `${fileName}_thumb${ext}`);

        await sharp(inputPath)
          .resize(config.thumbnailSize, config.thumbnailSize, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 70 })
          .toFile(thumbnailPath);

        console.log('Thumbnail generated:', thumbnailPath);
      }

      return {
        processedPath: outputPath,
        thumbnailPath,
        metadata,
        compressionRatio,
      };

    } catch (error) {
      console.error('Image processing failed:', error);
      throw new Error(`Failed to process image: ${error.message}`);
    }
  }

  async isImageFile(filePath: string): Promise<boolean> {
    try {
      const metadata = await sharp(filePath).metadata();
      return metadata.format !== undefined;
    } catch {
      return false;
    }
  }

  async getImageMetadata(filePath: string): Promise<sharp.Metadata> {
    try {
      return await sharp(filePath).metadata();
    } catch (error) {
      throw new Error(`Failed to get image metadata: ${error.message}`);
    }
  }

  getThumbnailPath(originalPath: string): string {
    const fileName = path.basename(originalPath, path.extname(originalPath));
    const ext = path.extname(originalPath);
    return path.join(this.thumbnailsDir, `${fileName}_thumb${ext}`);
  }

  async deleteThumbnail(originalPath: string): Promise<void> {
    try {
      const thumbnailPath = this.getThumbnailPath(originalPath);
      await fs.unlink(thumbnailPath);
    } catch (error) {
      // Ignore errors if thumbnail doesn't exist
      console.warn('Failed to delete thumbnail:', error.message);
    }
  }
}