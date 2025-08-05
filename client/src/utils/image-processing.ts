// Image processing utilities using OpenCV.js
declare global {
  interface Window {
    cv: any;
  }
}

export interface ProcessedImage {
  originalDataUrl: string;
  processedDataUrl: string;
  corners?: { x: number; y: number }[];
  confidence: number;
  processingTime: number;
}

export interface ProcessingOptions {
  autoDetectEdges: boolean;
  enhanceContrast: boolean;
  applySharpen: boolean;
  correctPerspective: boolean;
  cropMargin: number;
}

class ImageProcessor {
  private cv: any;
  private isReady: boolean = false;

  constructor() {
    this.waitForOpenCV();
  }

  private async waitForOpenCV(): Promise<void> {
    return new Promise((resolve) => {
      const checkOpenCV = () => {
        if (window.cv && window.cv.Mat) {
          this.cv = window.cv;
          this.isReady = true;
          console.log('✅ OpenCV.js loaded successfully');
          resolve();
        } else {
          // Listen for the opencv-ready event
          window.addEventListener('opencv-ready', () => {
            if (window.cv && window.cv.Mat) {
              this.cv = window.cv;
              this.isReady = true;
              console.log('✅ OpenCV.js loaded successfully via event');
              resolve();
            }
          }, { once: true });
          
          // Also keep checking periodically
          setTimeout(checkOpenCV, 100);
        }
      };
      checkOpenCV();
    });
  }

  public async processImage(
    imageDataUrl: string, 
    options: ProcessingOptions = {
      autoDetectEdges: true,
      enhanceContrast: true,
      applySharpen: true,
      correctPerspective: true,
      cropMargin: 20
    }
  ): Promise<ProcessedImage> {
    const startTime = performance.now();
    
    if (!this.isReady) {
      await this.waitForOpenCV();
    }

    try {
      // Load image from data URL
      const img = await this.loadImageFromDataUrl(imageDataUrl);
      const src = this.cv.imread(img);
      
      let processedMat = src.clone();
      let corners: { x: number; y: number }[] | undefined;
      let confidence = 0;

      if (options.autoDetectEdges) {
        const edgeResult = this.detectDocumentEdges(src);
        corners = edgeResult.corners;
        confidence = edgeResult.confidence;
        
        if (options.correctPerspective && corners && confidence > 0.6) {
          processedMat = this.correctPerspective(src, corners);
        }
      }

      if (options.enhanceContrast) {
        processedMat = this.enhanceContrast(processedMat);
      }

      if (options.applySharpen) {
        processedMat = this.applySharpen(processedMat);
      }

      // Convert back to data URL
      const canvas = document.createElement('canvas');
      this.cv.imshow(canvas, processedMat);
      const processedDataUrl = canvas.toDataURL('image/jpeg', 0.9);

      // Cleanup
      src.delete();
      processedMat.delete();
      img.remove();

      const processingTime = performance.now() - startTime;

      return {
        originalDataUrl: imageDataUrl,
        processedDataUrl,
        corners,
        confidence,
        processingTime
      };

    } catch (error) {
      console.error('Image processing failed:', error);
      return {
        originalDataUrl: imageDataUrl,
        processedDataUrl: imageDataUrl, // Return original on failure
        confidence: 0,
        processingTime: performance.now() - startTime
      };
    }
  }

  private async loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  private detectDocumentEdges(src: any): { corners: { x: number; y: number }[] | undefined; confidence: number } {
    try {
      // Convert to grayscale
      const gray = new this.cv.Mat();
      this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY);

      // Apply Gaussian blur to reduce noise
      const blurred = new this.cv.Mat();
      this.cv.GaussianBlur(gray, blurred, new this.cv.Size(5, 5), 0);

      // Edge detection using Canny
      const edges = new this.cv.Mat();
      this.cv.Canny(blurred, edges, 50, 150);

      // Morphological operations to close gaps
      const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3));
      const morphed = new this.cv.Mat();
      this.cv.morphologyEx(edges, morphed, this.cv.MORPH_CLOSE, kernel);

      // Find contours
      const contours = new this.cv.MatVector();
      const hierarchy = new this.cv.Mat();
      this.cv.findContours(morphed, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE);

      let bestContour = null;
      let maxArea = 0;
      let confidence = 0;

      // Find the largest rectangular contour
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = this.cv.contourArea(contour);
        
        // Only consider contours with reasonable area
        if (area > src.rows * src.cols * 0.1) {
          // Approximate contour to polygon
          const epsilon = 0.02 * this.cv.arcLength(contour, true);
          const approx = new this.cv.Mat();
          this.cv.approxPolyDP(contour, approx, epsilon, true);

          // Check if it's a quadrilateral
          if (approx.rows === 4 && area > maxArea) {
            maxArea = area;
            bestContour = approx.clone();
            
            // Calculate confidence based on area ratio and shape
            const imageArea = src.rows * src.cols;
            const areaRatio = area / imageArea;
            confidence = Math.min(areaRatio * 2, 1.0); // Max confidence of 1.0
          }
          
          approx.delete();
        }
        contour.delete();
      }

      // Cleanup
      gray.delete();
      blurred.delete();
      edges.delete();
      kernel.delete();
      morphed.delete();
      contours.delete();
      hierarchy.delete();

      if (bestContour && confidence > 0.3) {
        // Extract corners from best contour
        const corners: { x: number; y: number }[] = [];
        const data = bestContour.data32S;
        
        for (let i = 0; i < bestContour.rows; i++) {
          corners.push({
            x: data[i * 2],
            y: data[i * 2 + 1]
          });
        }

        // Sort corners: top-left, top-right, bottom-right, bottom-left
        const sortedCorners = this.sortCorners(corners);
        bestContour.delete();
        
        return { corners: sortedCorners, confidence };
      }

      if (bestContour) {
        bestContour.delete();
      }
      
      return { corners: undefined, confidence: 0 };

    } catch (error) {
      console.error('Edge detection failed:', error);
      return { corners: undefined, confidence: 0 };
    }
  }

  private sortCorners(corners: { x: number; y: number }[]): { x: number; y: number }[] {
    // Calculate center point
    const centerX = corners.reduce((sum, p) => sum + p.x, 0) / corners.length;
    const centerY = corners.reduce((sum, p) => sum + p.y, 0) / corners.length;

    // Sort by angle from center
    const sorted = corners.sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX);
      const angleB = Math.atan2(b.y - centerY, b.x - centerX);
      return angleA - angleB;
    });

    // Reorder to top-left, top-right, bottom-right, bottom-left
    const topLeft = sorted.reduce((min, p) => (p.x + p.y < min.x + min.y) ? p : min);
    const bottomRight = sorted.reduce((max, p) => (p.x + p.y > max.x + max.y) ? p : max);
    const topRight = sorted.reduce((min, p) => (p.x - p.y > min.x - min.y) ? p : min);
    const bottomLeft = sorted.reduce((max, p) => (p.x - p.y < max.x - max.y) ? p : max);

    return [topLeft, topRight, bottomRight, bottomLeft];
  }

  private correctPerspective(src: any, corners: { x: number; y: number }[]): any {
    try {
      if (corners.length !== 4) return src.clone();

      // Calculate target dimensions
      const width = Math.max(
        this.distance(corners[0], corners[1]),
        this.distance(corners[2], corners[3])
      );
      const height = Math.max(
        this.distance(corners[0], corners[3]),
        this.distance(corners[1], corners[2])
      );

      // Source points (detected corners)
      const srcPoints = this.cv.matFromArray(4, 1, this.cv.CV_32FC2, [
        corners[0].x, corners[0].y,  // top-left
        corners[1].x, corners[1].y,  // top-right
        corners[2].x, corners[2].y,  // bottom-right
        corners[3].x, corners[3].y   // bottom-left
      ]);

      // Destination points (rectangle)
      const dstPoints = this.cv.matFromArray(4, 1, this.cv.CV_32FC2, [
        0, 0,                    // top-left
        width, 0,                // top-right
        width, height,           // bottom-right
        0, height                // bottom-left
      ]);

      // Get perspective transformation matrix
      const transformMatrix = this.cv.getPerspectiveTransform(srcPoints, dstPoints);

      // Apply transformation
      const dst = new this.cv.Mat();
      this.cv.warpPerspective(src, dst, transformMatrix, new this.cv.Size(width, height));

      // Cleanup
      srcPoints.delete();
      dstPoints.delete();
      transformMatrix.delete();

      return dst;

    } catch (error) {
      console.error('Perspective correction failed:', error);
      return src.clone();
    }
  }

  private distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  private enhanceContrast(src: any): any {
    try {
      // Convert to grayscale if needed
      let gray = new this.cv.Mat();
      if (src.channels() === 3) {
        this.cv.cvtColor(src, gray, this.cv.COLOR_RGB2GRAY);
      } else if (src.channels() === 4) {
        this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY);
      } else {
        gray = src.clone();
      }

      // Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
      const clahe = new this.cv.CLAHE(2.0, new this.cv.Size(8, 8));
      const enhanced = new this.cv.Mat();
      clahe.apply(gray, enhanced);

      // Convert back to original format
      let result = new this.cv.Mat();
      if (src.channels() === 3) {
        this.cv.cvtColor(enhanced, result, this.cv.COLOR_GRAY2RGB);
      } else if (src.channels() === 4) {
        this.cv.cvtColor(enhanced, result, this.cv.COLOR_GRAY2RGBA);
      } else {
        result = enhanced.clone();
      }

      // Cleanup
      gray.delete();
      enhanced.delete();
      clahe.delete();

      return result;

    } catch (error) {
      console.error('Contrast enhancement failed:', error);
      return src.clone();
    }
  }

  private applySharpen(src: any): any {
    try {
      // Sharpening kernel
      const kernel = this.cv.matFromArray(3, 3, this.cv.CV_32FC1, [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
      ]);

      const sharpened = new this.cv.Mat();
      this.cv.filter2D(src, sharpened, this.cv.CV_8U, kernel);

      kernel.delete();
      return sharpened;

    } catch (error) {
      console.error('Sharpening failed:', error);
      return src.clone();
    }
  }

  public isOpenCVReady(): boolean {
    return this.isReady;
  }
}

// Global instance
export const imageProcessor = new ImageProcessor();

// Export types and processor
export default imageProcessor;