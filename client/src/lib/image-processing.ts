// Enhanced image processing library for document capture optimization

export interface ProcessingOptions {
  // Document detection and cropping
  detectDocumentEdges: boolean;
  cropTolerance: number; // Percentage margin around detected document
  
  // Orientation and rotation
  autoRotate: boolean;
  rotationTolerance: number; // Degrees tolerance for auto-rotation
  
  // Image enhancement
  autoEnhanceContrast: boolean;
  contrastAdjustment: number; // -100 to 100
  brightnessAdjustment: number; // -100 to 100
  
  // Filters
  applyGrayscale: boolean;
  sharpenImage: boolean;
  reduceNoise: boolean;
  
  // Output quality
  outputQuality: number; // 0.1 to 1.0
  maxWidth: number;
  maxHeight: number;
}

export const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  detectDocumentEdges: true,
  cropTolerance: 0.05, // 5% margin
  autoRotate: true,
  rotationTolerance: 2, // 2 degrees
  autoEnhanceContrast: true,
  contrastAdjustment: 15,
  brightnessAdjustment: 10,
  applyGrayscale: false,
  sharpenImage: true,
  reduceNoise: true,
  outputQuality: 0.9,
  maxWidth: 1920,
  maxHeight: 1920,
};

export interface ProcessingResult {
  processedImage: File;
  originalSize: number;
  processedSize: number;
  compressionRatio: number;
  transformsApplied: string[];
  documentDetected: boolean;
  rotationApplied: number;
  processingTime: number;
}

export class ImageProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ready: boolean = true; // Canvas-based processing is always ready

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Check if image processing is ready
   * For canvas-based processing, this is always true
   */
  isOpenCVReady(): boolean {
    return this.ready && !!this.canvas && !!this.ctx;
  }

  async processImage(
    file: File, 
    options: Partial<ProcessingOptions> = {}
  ): Promise<ProcessingResult> {
    const startTime = performance.now();
    const config = { ...DEFAULT_PROCESSING_OPTIONS, ...options };
    const transformsApplied: string[] = [];
    
    console.log('Starting image processing with options:', config);

    try {
      // Load image
      const img = await this.loadImage(file);
      
      // Set up canvas with original dimensions
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);

      let imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      let documentDetected = false;
      let rotationApplied = 0;

      // 1. Document edge detection and cropping
      if (config.detectDocumentEdges) {
        const cropResult = await this.detectAndCropDocument(imageData, config.cropTolerance);
        if (cropResult.detected) {
          imageData = cropResult.croppedData;
          documentDetected = true;
          transformsApplied.push('Document Detection & Cropping');
          
          // Update canvas size
          this.canvas.width = imageData.width;
          this.canvas.height = imageData.height;
          this.ctx.putImageData(imageData, 0, 0);
        }
      }

      // 2. Auto-rotation based on document orientation
      if (config.autoRotate) {
        const rotation = await this.detectDocumentRotation(imageData, config.rotationTolerance);
        if (Math.abs(rotation) > config.rotationTolerance) {
          imageData = this.rotateImage(imageData, rotation);
          rotationApplied = rotation;
          transformsApplied.push(`Auto-rotation (${rotation.toFixed(1)}°)`);
          
          // Update canvas
          this.canvas.width = imageData.width;
          this.canvas.height = imageData.height;
          this.ctx.putImageData(imageData, 0, 0);
        }
      }

      // 3. Contrast and brightness enhancement
      if (config.autoEnhanceContrast || config.contrastAdjustment !== 0 || config.brightnessAdjustment !== 0) {
        let contrast = config.contrastAdjustment;
        let brightness = config.brightnessAdjustment;
        
        if (config.autoEnhanceContrast) {
          const autoAdjustments = this.calculateOptimalAdjustments(imageData);
          contrast += autoAdjustments.contrast;
          brightness += autoAdjustments.brightness;
        }
        
        imageData = this.adjustContrastBrightness(imageData, contrast, brightness);
        transformsApplied.push(`Contrast/Brightness (${contrast}/${brightness})`);
        this.ctx.putImageData(imageData, 0, 0);
      }

      // 4. Noise reduction
      if (config.reduceNoise) {
        imageData = this.reduceNoise(imageData);
        transformsApplied.push('Noise Reduction');
        this.ctx.putImageData(imageData, 0, 0);
      }

      // 5. Sharpening for better OCR
      if (config.sharpenImage) {
        imageData = this.sharpenImage(imageData);
        transformsApplied.push('Image Sharpening');
        this.ctx.putImageData(imageData, 0, 0);
      }

      // 6. Grayscale conversion (if requested)
      if (config.applyGrayscale) {
        imageData = this.convertToGrayscale(imageData);
        transformsApplied.push('Grayscale Conversion');
        this.ctx.putImageData(imageData, 0, 0);
      }

      // 7. Resize if needed
      if (this.canvas.width > config.maxWidth || this.canvas.height > config.maxHeight) {
        const { width, height } = this.calculateResizeDimensions(
          this.canvas.width, 
          this.canvas.height, 
          config.maxWidth, 
          config.maxHeight
        );
        
        const resizedCanvas = document.createElement('canvas');
        const resizedCtx = resizedCanvas.getContext('2d')!;
        resizedCanvas.width = width;
        resizedCanvas.height = height;
        
        resizedCtx.drawImage(this.canvas, 0, 0, width, height);
        this.canvas = resizedCanvas;
        this.ctx = resizedCtx;
        
        transformsApplied.push(`Resized to ${width}x${height}`);
      }

      // 8. Generate processed file
      const processedBlob = await this.canvasToBlob(config.outputQuality);
      const processedFile = new File([processedBlob], file.name, { 
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      const processingTime = performance.now() - startTime;
      const compressionRatio = ((file.size - processedFile.size) / file.size) * 100;

      console.log('Image processing completed:', {
        transformsApplied,
        originalSize: file.size,
        processedSize: processedFile.size,
        compressionRatio: `${compressionRatio.toFixed(1)}%`,
        processingTime: `${processingTime.toFixed(1)}ms`
      });

      return {
        processedImage: processedFile,
        originalSize: file.size,
        processedSize: processedFile.size,
        compressionRatio,
        transformsApplied,
        documentDetected,
        rotationApplied,
        processingTime,
      };

    } catch (error) {
      console.error('Image processing failed:', error);
      throw new Error(`Image processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  private async detectAndCropDocument(
    imageData: ImageData, 
    tolerance: number
  ): Promise<{ detected: boolean; croppedData: ImageData }> {
    const { data, width, height } = imageData;
    
    // Convert to grayscale for edge detection
    const grayData = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayData[i / 4] = gray;
    }

    // Apply Sobel edge detection
    const edges = this.applySobelFilter(grayData, width, height);
    
    // Find document boundaries
    const bounds = this.findDocumentBounds(edges, width, height, tolerance);
    
    if (bounds) {
      // Crop the image
      const croppedWidth = bounds.right - bounds.left;
      const croppedHeight = bounds.bottom - bounds.top;
      const croppedData = this.ctx.createImageData(croppedWidth, croppedHeight);
      
      for (let y = 0; y < croppedHeight; y++) {
        for (let x = 0; x < croppedWidth; x++) {
          const srcIndex = ((bounds.top + y) * width + (bounds.left + x)) * 4;
          const destIndex = (y * croppedWidth + x) * 4;
          
          croppedData.data[destIndex] = data[srcIndex];
          croppedData.data[destIndex + 1] = data[srcIndex + 1];
          croppedData.data[destIndex + 2] = data[srcIndex + 2];
          croppedData.data[destIndex + 3] = data[srcIndex + 3];
        }
      }
      
      return { detected: true, croppedData };
    }
    
    return { detected: false, croppedData: imageData };
  }

  private applySobelFilter(grayData: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const edges = new Uint8ClampedArray(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = grayData[(y + ky) * width + (x + kx)];
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            gx += pixel * sobelX[kernelIndex];
            gy += pixel * sobelY[kernelIndex];
          }
        }
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = Math.min(255, magnitude);
      }
    }
    
    return edges;
  }

  private findDocumentBounds(
    edges: Uint8ClampedArray, 
    width: number, 
    height: number, 
    tolerance: number
  ): { left: number; top: number; right: number; bottom: number } | null {
    const threshold = 50; // Edge strength threshold
    const margin = Math.floor(Math.min(width, height) * tolerance);
    
    let left = width, right = 0, top = height, bottom = 0;
    let edgePixels = 0;
    
    // Find bounding box of strong edges
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (edges[y * width + x] > threshold) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          edgePixels++;
        }
      }
    }
    
    // Check if we found enough edges to constitute a document
    const totalPixels = width * height;
    const edgeRatio = edgePixels / totalPixels;
    
    if (edgeRatio > 0.01 && edgeRatio < 0.5) { // Reasonable edge density
      return {
        left: Math.max(0, left - margin),
        top: Math.max(0, top - margin),
        right: Math.min(width, right + margin),
        bottom: Math.min(height, bottom + margin),
      };
    }
    
    return null;
  }

  private async detectDocumentRotation(imageData: ImageData, tolerance: number): Promise<number> {
    const { data, width, height } = imageData;
    
    // Convert to grayscale
    const grayData = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayData[i / 4] = gray;
    }

    // Apply edge detection
    const edges = this.applySobelFilter(grayData, width, height);
    
    // Use Hough transform to detect dominant lines
    const angles = [];
    const angleStep = 0.5; // Check every 0.5 degrees
    const maxAngle = 45; // Check -45 to +45 degrees
    
    for (let angle = -maxAngle; angle <= maxAngle; angle += angleStep) {
      const score = this.calculateLineScore(edges, width, height, angle);
      angles.push({ angle, score });
    }
    
    // Find the angle with the highest score
    angles.sort((a, b) => b.score - a.score);
    const bestAngle = angles[0].angle;
    
    // Only return the angle if it's significant
    return Math.abs(bestAngle) > tolerance ? bestAngle : 0;
  }

  private calculateLineScore(
    edges: Uint8ClampedArray, 
    width: number, 
    height: number, 
    angle: number
  ): number {
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    let score = 0;
    
    // Sample points along potential lines
    const step = 5;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (edges[y * width + x] > 50) {
          // Check if there are aligned edge pixels
          for (let d = 1; d <= 20; d++) {
            const nx = Math.round(x + d * cos);
            const ny = Math.round(y + d * sin);
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (edges[ny * width + nx] > 50) {
                score++;
              }
            }
          }
        }
      }
    }
    
    return score;
  }

  private rotateImage(imageData: ImageData, angle: number): ImageData {
    const { width, height } = imageData;
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    // Calculate new dimensions
    const newWidth = Math.abs(width * cos) + Math.abs(height * sin);
    const newHeight = Math.abs(width * sin) + Math.abs(height * cos);
    
    const rotatedData = this.ctx.createImageData(Math.ceil(newWidth), Math.ceil(newHeight));
    const centerX = width / 2;
    const centerY = height / 2;
    const newCenterX = newWidth / 2;
    const newCenterY = newHeight / 2;
    
    for (let y = 0; y < rotatedData.height; y++) {
      for (let x = 0; x < rotatedData.width; x++) {
        // Reverse rotation to find source pixel
        const srcX = (x - newCenterX) * cos + (y - newCenterY) * sin + centerX;
        const srcY = -(x - newCenterX) * sin + (y - newCenterY) * cos + centerY;
        
        if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
          const srcIndex = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
          const destIndex = (y * rotatedData.width + x) * 4;
          
          rotatedData.data[destIndex] = imageData.data[srcIndex];
          rotatedData.data[destIndex + 1] = imageData.data[srcIndex + 1];
          rotatedData.data[destIndex + 2] = imageData.data[srcIndex + 2];
          rotatedData.data[destIndex + 3] = 255; // Full opacity
        }
      }
    }
    
    return rotatedData;
  }

  private calculateOptimalAdjustments(imageData: ImageData): { contrast: number; brightness: number } {
    const { data } = imageData;
    let min = 255, max = 0, sum = 0;
    const pixels = data.length / 4;
    
    // Calculate histogram and statistics
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      min = Math.min(min, gray);
      max = Math.max(max, gray);
      sum += gray;
    }
    
    const mean = sum / pixels;
    const currentContrast = max - min;
    const targetContrast = 200; // Target contrast range
    
    const contrastAdjustment = currentContrast < targetContrast ? 
      Math.min(30, (targetContrast - currentContrast) / 4) : 0;
    
    const brightnessAdjustment = mean < 128 ? 
      Math.min(20, (128 - mean) / 4) : 
      Math.max(-20, (128 - mean) / 4);
    
    return { 
      contrast: Math.round(contrastAdjustment), 
      brightness: Math.round(brightnessAdjustment) 
    };
  }

  private adjustContrastBrightness(
    imageData: ImageData, 
    contrast: number, 
    brightness: number
  ): ImageData {
    const { data } = imageData;
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast
      data[i] = Math.max(0, Math.min(255, contrastFactor * (data[i] - 128) + 128));
      data[i + 1] = Math.max(0, Math.min(255, contrastFactor * (data[i + 1] - 128) + 128));
      data[i + 2] = Math.max(0, Math.min(255, contrastFactor * (data[i + 2] - 128) + 128));
      
      // Apply brightness
      data[i] = Math.max(0, Math.min(255, data[i] + brightness));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + brightness));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + brightness));
    }
    
    return imageData;
  }

  private reduceNoise(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const newData = new Uint8ClampedArray(data);
    
    // Apply median filter for noise reduction
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) { // RGB channels
          const values = [];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const index = ((y + dy) * width + (x + dx)) * 4 + c;
              values.push(data[index]);
            }
          }
          values.sort((a, b) => a - b);
          const index = (y * width + x) * 4 + c;
          newData[index] = values[4]; // Median value
        }
      }
    }
    
    return new ImageData(newData, width, height);
  }

  private sharpenImage(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const newData = new Uint8ClampedArray(data);
    
    // Sharpening kernel
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) { // RGB channels
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const index = ((y + ky) * width + (x + kx)) * 4 + c;
              const kernelIndex = (ky + 1) * 3 + (kx + 1);
              sum += data[index] * kernel[kernelIndex];
            }
          }
          const index = (y * width + x) * 4 + c;
          newData[index] = Math.max(0, Math.min(255, sum));
        }
      }
    }
    
    return new ImageData(newData, width, height);
  }

  private convertToGrayscale(imageData: ImageData): ImageData {
    const { data } = imageData;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = gray;     // Red
      data[i + 1] = gray; // Green
      data[i + 2] = gray; // Blue
      // Alpha channel remains unchanged
    }
    
    return imageData;
  }

  private calculateResizeDimensions(
    width: number, 
    height: number, 
    maxWidth: number, 
    maxHeight: number
  ): { width: number; height: number } {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio),
    };
  }

  private canvasToBlob(quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Failed to create blob')),
        'image/jpeg',
        quality
      );
    });
  }
}