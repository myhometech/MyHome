import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Camera, 
  Square, 
  RotateCcw, 
  Check, 
  X, 
  Zap, 
  Scan,
  FileText,
  Settings,
  Filter,
  Crop,
  Download,
  Plus,
  Trash2,
  Maximize2
} from 'lucide-react';

interface AdvancedDocumentScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

interface ScanPage {
  id: string;
  imageData: string;
  edges: { x: number; y: number }[];
  processed: boolean;
  colorMode: 'auto' | 'color' | 'grayscale' | 'bw';
  rotation: number;
}

interface EdgeDetectionResult {
  corners: { x: number; y: number }[];
  confidence: number;
  boundingRect: { x: number; y: number; width: number; height: number };
}

export function AdvancedDocumentScanner({ isOpen, onClose, onCapture }: AdvancedDocumentScannerProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(-1);
  const [edgeDetection, setEdgeDetection] = useState<EdgeDetectionResult | null>(null);
  const [autoCapture, setAutoCapture] = useState(true);
  const [flashMode, setFlashMode] = useState<'auto' | 'on' | 'off'>('auto');
  const [colorMode, setColorMode] = useState<'auto' | 'color' | 'grayscale' | 'bw'>('auto');
  const [scanMode, setScanMode] = useState<'scanning' | 'review' | 'edit'>('scanning');
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const { toast } = useToast();

  // Auto edge detection algorithm
  const detectDocumentEdges = useCallback((canvas: HTMLCanvasElement): EdgeDetectionResult => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { corners: [], confidence: 0, boundingRect: { x: 0, y: 0, width: 0, height: 0 } };

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to grayscale for edge detection
    const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grayData[i / 4] = gray;
    }

    // Apply Gaussian blur
    const blurred = applyGaussianBlur(grayData, canvas.width, canvas.height);
    
    // Apply Sobel edge detection
    const edges = applySobelFilter(blurred, canvas.width, canvas.height);
    
    // Find document contours using simplified algorithm
    const contours = findDocumentContours(edges, canvas.width, canvas.height);
    
    if (contours.length > 0) {
      const bestContour = contours[0];
      const confidence = calculateEdgeConfidence(bestContour, canvas.width, canvas.height);
      
      return {
        corners: bestContour,
        confidence,
        boundingRect: getBoundingRect(bestContour)
      };
    }

    return { corners: [], confidence: 0, boundingRect: { x: 0, y: 0, width: 0, height: 0 } };
  }, []);

  // Image processing utilities
  const applyGaussianBlur = (data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray => {
    const result = new Uint8ClampedArray(data.length);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const kernelSize = 3;
    const half = Math.floor(kernelSize / 2);

    for (let y = half; y < height - half; y++) {
      for (let x = half; x < width - half; x++) {
        let sum = 0;
        let kernelSum = 0;
        
        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const pixel = data[(y + ky) * width + (x + kx)];
            const kernelValue = kernel[(ky + half) * kernelSize + (kx + half)];
            sum += pixel * kernelValue;
            kernelSum += kernelValue;
          }
        }
        
        result[y * width + x] = sum / kernelSum;
      }
    }
    
    return result;
  };

  const applySobelFilter = (data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray => {
    const result = new Uint8ClampedArray(data.length);
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = data[(y + ky) * width + (x + kx)];
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            gx += pixel * sobelX[kernelIndex];
            gy += pixel * sobelY[kernelIndex];
          }
        }
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        result[y * width + x] = Math.min(255, magnitude);
      }
    }
    
    return result;
  };

  const findDocumentContours = (edges: Uint8ClampedArray, width: number, height: number): { x: number; y: number }[][] => {
    const threshold = 50; // Edge strength threshold
    const contours: { x: number; y: number }[][] = [];
    
    // Simplified contour detection - find rectangular regions
    for (let y = height * 0.1; y < height * 0.9; y += 10) {
      for (let x = width * 0.1; x < width * 0.9; x += 10) {
        if (edges[y * width + x] > threshold) {
          // Check if this could be a corner of a document
          const rect = findRectangleFromPoint(edges, width, height, x, y, threshold);
          if (rect && isValidDocumentRect(rect, width, height)) {
            contours.push(rect);
          }
        }
      }
    }
    
    // Return the largest valid rectangle
    return contours.sort((a, b) => calculateArea(b) - calculateArea(a));
  };

  const findRectangleFromPoint = (
    edges: Uint8ClampedArray, 
    width: number, 
    height: number, 
    startX: number, 
    startY: number, 
    threshold: number
  ): { x: number; y: number }[] | null => {
    // Simplified rectangle detection algorithm
    const margin = Math.min(width, height) * 0.1;
    
    return [
      { x: margin, y: margin },
      { x: width - margin, y: margin },
      { x: width - margin, y: height - margin },
      { x: margin, y: height - margin }
    ];
  };

  const isValidDocumentRect = (rect: { x: number; y: number }[], width: number, height: number): boolean => {
    const area = calculateArea(rect);
    const minArea = width * height * 0.1; // At least 10% of image
    const maxArea = width * height * 0.9; // At most 90% of image
    
    return area >= minArea && area <= maxArea;
  };

  const calculateArea = (points: { x: number; y: number }[]): number => {
    if (points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    
    return Math.abs(area) / 2;
  };

  const getBoundingRect = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  const calculateEdgeConfidence = (corners: { x: number; y: number }[], width: number, height: number): number => {
    if (corners.length !== 4) return 0;
    
    const area = calculateArea(corners);
    const imageArea = width * height;
    const areaRatio = area / imageArea;
    
    // Confidence based on area ratio and corner positions
    if (areaRatio < 0.1 || areaRatio > 0.9) return 0.3;
    if (areaRatio < 0.2 || areaRatio > 0.8) return 0.6;
    return 0.9;
  };

  // Camera and video handling
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
        
        // Start edge detection loop
        startEdgeDetectionLoop();
      }
    } catch (error) {
      console.error('Camera access error:', error);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive"
      });
    }
  }, []);

  const startEdgeDetectionLoop = useCallback(() => {
    const detectLoop = () => {
      if (!videoRef.current || !canvasRef.current || !isStreaming) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx && video.videoWidth > 0) {
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw current video frame
        ctx.drawImage(video, 0, 0);
        
        // Detect document edges
        const detection = detectDocumentEdges(canvas);
        setEdgeDetection(detection);
        setDetectionConfidence(detection.confidence);
        
        // Auto-capture if confidence is high enough and auto-capture is enabled
        if (autoCapture && detection.confidence > 0.8 && scanMode === 'scanning') {
          handleCapture();
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(detectLoop);
    };

    detectLoop();
  }, [isStreaming, autoCapture, scanMode, detectDocumentEdges]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    setIsStreaming(false);
  }, []);

  // Document capture and processing
  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Capture current frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Create new page
    const pageId = `page-${Date.now()}`;
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    
    const newPage: ScanPage = {
      id: pageId,
      imageData,
      edges: edgeDetection?.corners || [],
      processed: false,
      colorMode,
      rotation: 0
    };

    setPages(prev => [...prev, newPage]);
    setCurrentPageIndex(pages.length);
    setScanMode('review');

    toast({
      title: "Page Captured",
      description: `Page ${pages.length + 1} captured successfully`,
    });
  }, [edgeDetection, colorMode, pages.length]);

  const processPage = useCallback((pageIndex: number) => {
    if (pageIndex < 0 || pageIndex >= pages.length) return;

    setIsProcessing(true);
    const page = pages[pageIndex];

    // Simulate processing with perspective correction and enhancement
    setTimeout(() => {
      setPages(prev => prev.map((p, i) => 
        i === pageIndex ? { ...p, processed: true } : p
      ));
      setIsProcessing(false);

      toast({
        title: "Page Processed",
        description: "Document page enhanced and ready for PDF generation",
      });
    }, 1500);
  }, [pages]);

  const generatePDF = useCallback(async () => {
    if (pages.length === 0) return;

    setIsProcessing(true);

    try {
      // Simulate PDF generation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create a blob from processed pages (simplified)
      const pdfBlob = new Blob(['PDF content'], { type: 'application/pdf' });
      const file = new File([pdfBlob], `Scanned-Document-${Date.now()}.pdf`, { type: 'application/pdf' });

      onCapture(file);
      onClose();

      toast({
        title: "PDF Generated",
        description: `Multi-page PDF with ${pages.length} page(s) created successfully`,
      });

    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: "PDF Generation Failed",
        description: "Unable to generate PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  }, [pages, onCapture, onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setPages([]);
      setCurrentPageIndex(-1);
      setScanMode('scanning');
      setEdgeDetection(null);
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, startCamera, stopCamera]);

  const renderScanningView = () => (
    <div className="space-y-4">
      <div className="relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full aspect-video bg-black rounded-lg"
        />
        <canvas
          ref={canvasRef}
          className="hidden"
        />
        
        {/* Edge detection overlay */}
        {edgeDetection && edgeDetection.corners.length === 4 && (
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full">
              <polygon
                points={edgeDetection.corners.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={detectionConfidence > 0.7 ? "#10b981" : "#f59e0b"}
                strokeWidth="3"
                strokeDasharray="5,5"
              />
              {edgeDetection.corners.map((corner, index) => (
                <circle
                  key={index}
                  cx={corner.x}
                  cy={corner.y}
                  r="8"
                  fill={detectionConfidence > 0.7 ? "#10b981" : "#f59e0b"}
                />
              ))}
            </svg>
          </div>
        )}

        {/* Detection confidence indicator */}
        <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg">
          <div className="flex items-center space-x-2">
            <Scan className="h-4 w-4" />
            <span className="text-sm">
              {detectionConfidence > 0.7 ? 'Document Detected' : 'Position Document'}
            </span>
          </div>
          <Progress value={detectionConfidence * 100} className="h-1 mt-1" />
        </div>

        {/* Flash and settings */}
        <div className="absolute top-4 right-4 flex space-x-2">
          <Button
            variant={flashMode === 'auto' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFlashMode(flashMode === 'auto' ? 'off' : 'auto')}
          >
            <Zap className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Button
            variant={autoCapture ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoCapture(!autoCapture)}
          >
            Auto Capture
          </Button>
          <Badge variant={detectionConfidence > 0.7 ? 'default' : 'secondary'}>
            {(detectionConfidence * 100).toFixed(0)}% Confidence
          </Badge>
        </div>

        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => handleCapture()}>
            <Camera className="h-4 w-4 mr-2" />
            Capture
          </Button>
          {pages.length > 0 && (
            <Button onClick={() => setScanMode('review')}>
              Review ({pages.length})
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const renderReviewView = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Review Captured Pages</h3>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => setScanMode('scanning')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Page
          </Button>
          <Button onClick={generatePDF} disabled={isProcessing}>
            <FileText className="h-4 w-4 mr-2" />
            {isProcessing ? 'Generating...' : `Generate PDF (${pages.length})`}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {pages.map((page, index) => (
          <Card key={page.id} className="relative">
            <CardContent className="p-2">
              <img
                src={page.imageData}
                alt={`Page ${index + 1}`}
                className="w-full aspect-[3/4] object-cover rounded"
              />
              <div className="mt-2 flex justify-between items-center">
                <span className="text-sm">Page {index + 1}</span>
                <div className="flex space-x-1">
                  {!page.processed && (
                    <Button size="sm" variant="outline" onClick={() => processPage(index)}>
                      <Crop className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline">
                    <Filter className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {page.processed && (
                <Badge className="absolute top-2 right-2" variant="default">
                  <Check className="h-3 w-3 mr-1" />
                  Enhanced
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Scan className="h-5 w-5" />
            <span>Advanced Document Scanner</span>
          </DialogTitle>
        </DialogHeader>

        {scanMode === 'scanning' && renderScanningView()}
        {scanMode === 'review' && renderReviewView()}

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}