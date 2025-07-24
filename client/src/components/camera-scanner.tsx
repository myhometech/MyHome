import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check, Upload, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface CameraScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export function CameraScanner({ isOpen, onClose, onCapture }: CameraScannerProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<File[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Process offline queue when coming back online
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      toast({
        title: "Connection restored",
        description: `Processing ${offlineQueue.length} offline document(s)...`,
      });
      
      // Process each file in the queue
      offlineQueue.forEach(file => onCapture(file));
      setOfflineQueue([]);
    }
  }, [isOnline, offlineQueue, onCapture, toast]);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device/browser');
      }
      
      // Try different camera configurations for better iPhone compatibility
      let stream: MediaStream;
      
      try {
        // First try with back camera (environment)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 }
          }
        });
      } catch (backCameraError) {
        console.log('Back camera not available, trying any camera:', backCameraError);
        
        try {
          // Fallback to any available camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment', // Prefer back camera but don't require
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 }
            }
          });
        } catch (anyLameraError) {
          console.log('Any camera failed, trying basic constraints:', anyLameraError);
          
          // Final fallback with minimal constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: true
          });
        }
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      
      let errorMessage = 'Unable to access camera.';
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access and try again.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage = 'Camera not supported on this browser.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is being used by another application.';
      } else if (err.message.includes('not supported')) {
        errorMessage = 'Camera not supported on this device/browser.';
      }
      
      setError(errorMessage);
      toast({
        title: "Camera Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas size to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Apply document enhancement for better OCR
    const enhancedCanvas = enhanceDocumentImage(canvas);
    
    // Convert enhanced image to data URL
    const imageDataUrl = enhancedCanvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(imageDataUrl);
    stopCamera();
  }, [stopCamera]);

  // Document edge detection and cropping function
  const enhanceDocumentImage = (sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const sourceCtx = sourceCanvas.getContext('2d');
    if (!sourceCtx) return sourceCanvas;

    // Step 1: Detect document boundaries
    const documentBounds = detectDocumentEdges(sourceCanvas);
    
    // Step 2: Crop to document area
    const croppedCanvas = cropToDocument(sourceCanvas, documentBounds);
    
    // Step 3: Enhance the cropped document for OCR
    const enhancedCanvas = enhanceForOCR(croppedCanvas);
    
    return enhancedCanvas;
  };

  // Detect document edges using edge detection and contour analysis
  const detectDocumentEdges = (canvas: HTMLCanvasElement): { x: number, y: number, width: number, height: number } => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { x: 0, y: 0, width: canvas.width, height: canvas.height };

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    // Convert to grayscale for edge detection
    const grayData = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayData[i / 4] = gray;
    }

    // Apply Gaussian blur to reduce noise
    const blurred = applyGaussianBlur(grayData, width, height);
    
    // Apply Sobel edge detection
    const edges = applySobelEdgeDetection(blurred, width, height);
    
    // Find document contours
    const bounds = findLargestRectangle(edges, width, height);
    
    return bounds;
  };

  // Apply Gaussian blur for noise reduction
  const applyGaussianBlur = (data: Uint8Array, width: number, height: number): Uint8Array => {
    const result = new Uint8Array(data.length);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const kernelSum = 16;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            sum += data[idx] * kernel[kernelIdx];
          }
        }
        result[y * width + x] = Math.round(sum / kernelSum);
      }
    }
    return result;
  };

  // Apply Sobel edge detection
  const applySobelEdgeDetection = (data: Uint8Array, width: number, height: number): Uint8Array => {
    const result = new Uint8Array(data.length);
    
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += data[idx] * sobelX[kernelIdx];
            gy += data[idx] * sobelY[kernelIdx];
          }
        }
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        result[y * width + x] = Math.min(255, magnitude);
      }
    }
    return result;
  };

  // Find the largest rectangular contour (document boundary) with improved detection
  const findLargestRectangle = (edges: Uint8Array, width: number, height: number): { x: number, y: number, width: number, height: number } => {
    const threshold = 30; // Lower threshold for better edge detection
    const binary = edges.map(pixel => pixel > threshold ? 255 : 0);

    // Apply morphological operations to clean up edges
    const cleaned = applyMorphologicalOps(binary, width, height);

    // Find contours by detecting significant edge density regions
    const contours = findDocumentContours(cleaned, width, height);
    
    if (contours.length > 0) {
      // Return the largest contour (likely the document)
      return contours[0];
    }

    // More aggressive fallback - crop to center 70% instead of 80%
    const margin = 0.15;
    return {
      x: Math.floor(width * margin),
      y: Math.floor(height * margin),
      width: Math.floor(width * (1 - 2 * margin)),
      height: Math.floor(height * (1 - 2 * margin))
    };
  };

  // Apply morphological operations to clean up binary edges
  const applyMorphologicalOps = (binary: Uint8Array, width: number, height: number): Uint8Array => {
    // Apply closing operation to fill gaps in document edges
    const structuringElement = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1]
    ];

    const result = new Uint8Array(binary.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let hasEdge = false;
        
        // Check if any neighbor has an edge
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            if (structuringElement[ky + 1][kx + 1] && binary[(y + ky) * width + (x + kx)] > 0) {
              hasEdge = true;
              break;
            }
          }
          if (hasEdge) break;
        }
        
        result[y * width + x] = hasEdge ? 255 : 0;
      }
    }
    
    return result;
  };

  // Find document contours by analyzing edge density
  const findDocumentContours = (binary: Uint8Array, width: number, height: number): Array<{ x: number, y: number, width: number, height: number }> => {
    const contours: Array<{ x: number, y: number, width: number, height: number }> = [];
    
    // Scan for strong horizontal and vertical line segments
    const horizontalLines = findHorizontalLines(binary, width, height);
    const verticalLines = findVerticalLines(binary, width, height);
    
    // Find rectangles formed by these lines
    if (horizontalLines.length >= 2 && verticalLines.length >= 2) {
      const topLine = Math.min(...horizontalLines);
      const bottomLine = Math.max(...horizontalLines);
      const leftLine = Math.min(...verticalLines);
      const rightLine = Math.max(...verticalLines);
      
      // Ensure we have a reasonable rectangle
      const rectWidth = rightLine - leftLine;
      const rectHeight = bottomLine - topLine;
      
      if (rectWidth > width * 0.2 && rectHeight > height * 0.2) {
        const margin = 5; // Small margin
        contours.push({
          x: Math.max(0, leftLine - margin),
          y: Math.max(0, topLine - margin),
          width: Math.min(width - leftLine + margin, rectWidth + 2 * margin),
          height: Math.min(height - topLine + margin, rectHeight + 2 * margin)
        });
      }
    }
    
    // Sort by area (largest first)
    contours.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    
    return contours;
  };

  // Find horizontal line segments that could be document edges
  const findHorizontalLines = (binary: Uint8Array, width: number, height: number): number[] => {
    const lines: number[] = [];
    const minLineLength = width * 0.3; // At least 30% of width
    
    for (let y = 0; y < height; y++) {
      let lineLength = 0;
      let startX = -1;
      
      for (let x = 0; x < width; x++) {
        if (binary[y * width + x] > 0) {
          if (startX === -1) startX = x;
          lineLength++;
        } else {
          if (lineLength > minLineLength) {
            lines.push(y);
            break;
          }
          lineLength = 0;
          startX = -1;
        }
      }
      
      // Check if line extends to edge
      if (lineLength > minLineLength) {
        lines.push(y);
      }
    }
    
    return lines;
  };

  // Find vertical line segments that could be document edges
  const findVerticalLines = (binary: Uint8Array, width: number, height: number): number[] => {
    const lines: number[] = [];
    const minLineLength = height * 0.3; // At least 30% of height
    
    for (let x = 0; x < width; x++) {
      let lineLength = 0;
      let startY = -1;
      
      for (let y = 0; y < height; y++) {
        if (binary[y * width + x] > 0) {
          if (startY === -1) startY = y;
          lineLength++;
        } else {
          if (lineLength > minLineLength) {
            lines.push(x);
            break;
          }
          lineLength = 0;
          startY = -1;
        }
      }
      
      // Check if line extends to edge
      if (lineLength > minLineLength) {
        lines.push(x);
      }
    }
    
    return lines;
  };

  // Crop canvas to document area
  const cropToDocument = (sourceCanvas: HTMLCanvasElement, bounds: { x: number, y: number, width: number, height: number }): HTMLCanvasElement => {
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = bounds.width;
    croppedCanvas.height = bounds.height;
    
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return sourceCanvas;

    // Draw the cropped portion
    croppedCtx.drawImage(
      sourceCanvas,
      bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, bounds.width, bounds.height
    );

    return croppedCanvas;
  };

  // Enhance cropped document for OCR
  const enhanceForOCR = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Apply contrast and brightness enhancement
    const contrast = 1.4; // Higher contrast for text clarity
    const brightness = 20; // Slight brightness increase

    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast and brightness to RGB channels
      data[i] = Math.min(255, Math.max(0, contrast * (data[i] - 128) + 128 + brightness));     // Red
      data[i + 1] = Math.min(255, Math.max(0, contrast * (data[i + 1] - 128) + 128 + brightness)); // Green
      data[i + 2] = Math.min(255, Math.max(0, contrast * (data[i + 2] - 128) + 128 + brightness)); // Blue
    }

    // Apply the enhanced image data
    ctx.putImageData(imageData, 0, 0);

    // Apply sharpening filter
    applySharpeningFilter(ctx, canvas.width, canvas.height);

    return canvas;
  };

  // Sharpening filter to improve text clarity
  const applySharpeningFilter = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const originalData = new Uint8ClampedArray(data);

    // Sharpening kernel for text enhancement
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

    // Apply convolution
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) { // RGB channels only
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              const kernelIdx = (ky + 1) * 3 + (kx + 1);
              sum += originalData[idx] * kernel[kernelIdx];
            }
          }
          const idx = (y * width + x) * 4 + c;
          data[idx] = Math.min(255, Math.max(0, sum));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);

  const confirmCapture = useCallback(() => {
    if (!capturedImage || !canvasRef.current) return;

    // Convert data URL to blob then to file
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `document-scan-${Date.now()}.jpg`, {
          type: 'image/jpeg'
        });
        onCapture(file);
        handleClose();
      }
    }, 'image/jpeg', 0.9);
  }, [capturedImage, onCapture]);

  const handleClose = useCallback(() => {
    stopCamera();
    setCapturedImage(null);
    setError(null);
    onClose();
  }, [stopCamera, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
      <div className="w-full h-full max-w-4xl mx-auto p-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-semibold">Document Scanner</h2>
          <Button variant="ghost" size="sm" onClick={handleClose} className="text-white hover:bg-white/20">
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Camera/Preview Area */}
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-2xl">
            <CardContent className="p-0 relative">
              {error ? (
                <div className="aspect-video flex items-center justify-center bg-gray-100 text-center p-6">
                  <div>
                    <Camera className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">{error}</p>
                    <Button onClick={startCamera}>
                      Try Again
                    </Button>
                  </div>
                </div>
              ) : capturedImage ? (
                <div className="relative">
                  <img 
                    src={capturedImage} 
                    alt="Captured document" 
                    className="w-full h-auto rounded-lg"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <div className="text-white text-center">
                      <p className="text-sm mb-2">Document captured successfully</p>
                    </div>
                  </div>
                </div>
              ) : isStreaming ? (
                <div className="relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    controls={false}
                    className="w-full h-auto rounded-lg"
                    style={{ maxHeight: '70vh', objectFit: 'cover' }}
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        videoRef.current.play().catch(console.error);
                      }
                    }}
                  />
                  {/* Enhanced document frame overlay for better scanning */}
                  <div className="absolute inset-4 border-2 border-blue-400/70 rounded-lg pointer-events-none">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-300"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-300"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-300"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-300"></div>
                    
                    {/* Center guidelines for document alignment */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 border border-blue-300/50 rounded-full"></div>
                  </div>
                  
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black/70 px-4 py-2 rounded-lg">
                    📄 Position document within frame for best OCR results
                  </div>
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center bg-gray-100">
                  <div className="text-center">
                    <Camera className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">Ready to scan documents with your camera</p>
                    <p className="text-xs text-gray-500 mb-4">
                      Note: Camera requires HTTPS and permission access<br/>
                      On iPhone: Use "Scan with Camera" for better compatibility
                    </p>
                    <Button onClick={startCamera}>
                      <Camera className="h-4 w-4 mr-2" />
                      Start Camera
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center space-x-4 mt-6">
          {capturedImage ? (
            <>
              <Button variant="outline" onClick={retakePhoto} className="bg-white">
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button onClick={confirmCapture} className="bg-primary text-white">
                <Check className="h-4 w-4 mr-2" />
                Use This Photo
              </Button>
            </>
          ) : isStreaming ? (
            <Button 
              onClick={capturePhoto}
              size="lg"
              className="bg-white text-black hover:bg-gray-100 rounded-full w-16 h-16"
            >
              <Camera className="h-8 w-8" />
            </Button>
          ) : null}
        </div>

        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}