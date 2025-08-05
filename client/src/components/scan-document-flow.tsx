import React, { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check, Plus, Trash2, Download, Wand2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { imageProcessor, ProcessingOptions, ProcessedImage } from "@/utils/image-processing";

interface ScanDocumentFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (files: File[]) => void;
}

interface CapturedPage {
  id: string;
  imageData: string;
  processedImageData?: string;
  originalImageData?: string;
  corners?: { x: number; y: number }[];
  confidence?: number;
  timestamp: number;
  isProcessing?: boolean;
  processingTime?: number;
}

export default function ScanDocumentFlow({ isOpen, onClose, onCapture }: ScanDocumentFlowProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [capturedPages, setCapturedPages] = useState<CapturedPage[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showProcessingSettings, setShowProcessingSettings] = useState(false);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    autoDetectEdges: true,
    enhanceContrast: true,
    applySharpen: true,
    correctPerspective: true,
    cropMargin: 20
  });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Camera initialization
  const initializeCamera = useCallback(async () => {
    try {
      setError(null);
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      
      setIsScanning(true);
    } catch (err) {
      console.error('Failed to access camera:', err);
      setError('Unable to access camera. Please ensure camera permissions are granted.');
      toast({
        title: "Camera Access Failed",
        description: "Please check your camera permissions and try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsScanning(false);
  }, [stream]);

  // Capture current frame with OpenCV processing
  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to data URL
    const originalImageData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Create initial page entry
    const pageId = Date.now().toString();
    const newPage: CapturedPage = {
      id: pageId,
      imageData: originalImageData,
      originalImageData,
      timestamp: Date.now(),
      isProcessing: true
    };
    
    setCapturedPages(prev => [...prev, newPage]);
    
    toast({
      title: "Page Captured",
      description: `Processing page ${capturedPages.length + 1}...`,
    });

    // Process image with OpenCV
    try {
      if (imageProcessor.isOpenCVReady()) {
        const processed: ProcessedImage = await imageProcessor.processImage(originalImageData, processingOptions);
        
        // Update the page with processed results
        setCapturedPages(prev => prev.map(page => 
          page.id === pageId 
            ? {
                ...page,
                imageData: processed.processedDataUrl,
                processedImageData: processed.processedDataUrl,
                corners: processed.corners,
                confidence: processed.confidence,
                processingTime: processed.processingTime,
                isProcessing: false
              }
            : page
        ));

        toast({
          title: "Processing Complete",
          description: `Enhanced page with ${Math.round(processed.confidence * 100)}% confidence${processed.processingTime ? ` in ${Math.round(processed.processingTime)}ms` : ''}.`,
        });
      } else {
        // OpenCV not ready, use original image
        setCapturedPages(prev => prev.map(page => 
          page.id === pageId 
            ? { ...page, isProcessing: false }
            : page
        ));
        
        toast({
          title: "Processing Skipped",
          description: "Image enhancement unavailable. Using original capture.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Image processing failed:', error);
      
      // Fall back to original image
      setCapturedPages(prev => prev.map(page => 
        page.id === pageId 
          ? { ...page, isProcessing: false }
          : page
      ));
      
      toast({
        title: "Processing Failed",
        description: "Using original capture without enhancement.",
        variant: "destructive",
      });
    }
  }, [capturedPages.length, toast, processingOptions]);

  // Remove captured page
  const removePage = useCallback((pageId: string) => {
    setCapturedPages(prev => prev.filter(page => page.id !== pageId));
  }, []);

  // Retake a specific page
  const retakePage = useCallback((pageId: string) => {
    setCapturedPages(prev => prev.filter(page => page.id !== pageId));
    if (!isScanning) {
      initializeCamera();
    }
  }, [isScanning, initializeCamera]);

  // Toggle between original and processed image
  const toggleProcessing = useCallback((pageId: string) => {
    setCapturedPages(prev => prev.map(page => {
      if (page.id === pageId && page.originalImageData && page.processedImageData) {
        return {
          ...page,
          imageData: page.imageData === page.originalImageData 
            ? page.processedImageData 
            : page.originalImageData
        };
      }
      return page;
    }));
  }, []);

  // Reprocess a specific page with new settings
  const reprocessPage = useCallback(async (pageId: string) => {
    const page = capturedPages.find(p => p.id === pageId);
    if (!page || !page.originalImageData) return;

    setCapturedPages(prev => prev.map(p => 
      p.id === pageId ? { ...p, isProcessing: true } : p
    ));

    try {
      if (imageProcessor.isOpenCVReady()) {
        const processed: ProcessedImage = await imageProcessor.processImage(page.originalImageData, processingOptions);
        
        setCapturedPages(prev => prev.map(p => 
          p.id === pageId 
            ? {
                ...p,
                imageData: processed.processedDataUrl,
                processedImageData: processed.processedDataUrl,
                corners: processed.corners,
                confidence: processed.confidence,
                processingTime: processed.processingTime,
                isProcessing: false
              }
            : p
        ));

        toast({
          title: "Reprocessing Complete",
          description: `Enhanced with ${Math.round(processed.confidence * 100)}% confidence.`,
        });
      }
    } catch (error) {
      console.error('Reprocessing failed:', error);
      setCapturedPages(prev => prev.map(p => 
        p.id === pageId ? { ...p, isProcessing: false } : p
      ));
    }
  }, [capturedPages, processingOptions, toast]);

  // Convert captured pages to files and finish
  const finishScanning = useCallback(async () => {
    if (capturedPages.length === 0) {
      toast({
        title: "No Pages Captured",
        description: "Please capture at least one page before finishing.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const files: File[] = [];
      
      for (let i = 0; i < capturedPages.length; i++) {
        const page = capturedPages[i];
        
        // Convert data URL to blob
        const response = await fetch(page.imageData);
        const blob = await response.blob();
        
        // Create file with appropriate name
        const fileName = `scanned-page-${i + 1}-${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        files.push(file);
      }
      
      stopCamera();
      onCapture(files);
      onClose();
      
      toast({
        title: "Scan Complete",
        description: `Successfully scanned ${files.length} page${files.length > 1 ? 's' : ''}.`,
      });
      
    } catch (err) {
      console.error('Failed to process captured pages:', err);
      toast({
        title: "Processing Failed",
        description: "Failed to process captured pages. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [capturedPages, stopCamera, onCapture, onClose, toast]);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPages([]);
      setError(null);
    }
  }, [isOpen, stopCamera]);

  // Check for camera support
  const isCameraSupported = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;

  if (!isCameraSupported) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Camera Not Supported</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <Camera className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">
              Your browser doesn't support camera access. Please use a modern browser or try uploading files instead.
            </p>
            <Button onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Document Scanner
            {capturedPages.length > 0 && (
              <Badge variant="secondary">{capturedPages.length} page{capturedPages.length > 1 ? 's' : ''}</Badge>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProcessingSettings(!showProcessingSettings)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        {/* Processing Settings Panel */}
        {showProcessingSettings && (
          <div className="bg-gray-50 p-4 rounded-lg space-y-4">
            <h3 className="font-medium text-sm">Image Processing Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="auto-detect"
                  checked={processingOptions.autoDetectEdges}
                  onCheckedChange={(checked) =>
                    setProcessingOptions(prev => ({ ...prev, autoDetectEdges: checked }))
                  }
                />
                <Label htmlFor="auto-detect" className="text-sm">Auto Edge Detection</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="enhance-contrast"
                  checked={processingOptions.enhanceContrast}
                  onCheckedChange={(checked) =>
                    setProcessingOptions(prev => ({ ...prev, enhanceContrast: checked }))
                  }
                />
                <Label htmlFor="enhance-contrast" className="text-sm">Enhance Contrast</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="apply-sharpen"
                  checked={processingOptions.applySharpen}
                  onCheckedChange={(checked) =>
                    setProcessingOptions(prev => ({ ...prev, applySharpen: checked }))
                  }
                />
                <Label htmlFor="apply-sharpen" className="text-sm">Apply Sharpening</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="correct-perspective"
                  checked={processingOptions.correctPerspective}
                  onCheckedChange={(checked) =>
                    setProcessingOptions(prev => ({ ...prev, correctPerspective: checked }))
                  }
                />
                <Label htmlFor="correct-perspective" className="text-sm">Perspective Correction</Label>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex flex-col lg:flex-row gap-4 h-[70vh]">
          {/* Camera Section */}
          <div className="flex-1 flex flex-col">
            <div className="relative bg-black rounded-lg overflow-hidden flex-1 flex items-center justify-center">
              {error ? (
                <div className="text-center text-white p-8">
                  <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="mb-4">{error}</p>
                  <Button onClick={initializeCamera} variant="outline">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              ) : !isScanning ? (
                <div className="text-center text-white p-8">
                  <Camera className="h-16 w-16 mx-auto mb-4" />
                  <p className="mb-4">Start scanning documents with your camera</p>
                  <Button onClick={initializeCamera}>
                    <Camera className="h-4 w-4 mr-2" />
                    Start Camera
                  </Button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              )}
              
              {/* Camera overlay guides */}
              {isScanning && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-56 border-2 border-white/50 rounded-lg">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white"></div>
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white"></div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white"></div>
                  </div>
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded">
                    Align document within frame
                  </div>
                </div>
              )}
            </div>
            
            {/* Camera Controls */}
            {isScanning && (
              <div className="flex justify-center gap-4 mt-4">
                <Button onClick={stopCamera} variant="outline">
                  <X className="h-4 w-4 mr-2" />
                  Stop Camera
                </Button>
                <Button onClick={captureFrame} size="lg">
                  <Camera className="h-4 w-4 mr-2" />
                  Capture Page
                </Button>
              </div>
            )}
          </div>
          
          {/* Captured Pages Section */}
          <div className="w-full lg:w-80 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Captured Pages</h3>
              {capturedPages.length > 0 && (
                <Button onClick={finishScanning} disabled={isProcessing}>
                  <Check className="h-4 w-4 mr-2" />
                  {isProcessing ? 'Processing...' : 'Finish'}
                </Button>
              )}
            </div>
            
            {capturedPages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-center">
                <div>
                  <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pages captured yet</p>
                  <p className="text-xs">Use the camera to capture document pages</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3">
                {capturedPages.map((page, index) => (
                  <Card key={page.id} className="relative">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img
                            src={page.imageData}
                            alt={`Page ${index + 1}`}
                            className="w-16 h-16 object-cover rounded border"
                          />
                          {page.isProcessing && (
                            <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          {page.confidence !== undefined && (
                            <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full px-1">
                              {Math.round(page.confidence * 100)}%
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">Page {index + 1}</p>
                            {page.processedImageData && page.originalImageData && (
                              <Badge variant="outline" className="text-xs">
                                {page.imageData === page.processedImageData ? 'Enhanced' : 'Original'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {new Date(page.timestamp).toLocaleTimeString()}
                            {page.processingTime && ` • ${Math.round(page.processingTime)}ms`}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {page.processedImageData && page.originalImageData && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleProcessing(page.id)}
                              title="Toggle between original and enhanced"
                            >
                              <Wand2 className="h-3 w-3" />
                            </Button>
                          )}
                          {page.originalImageData && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reprocessPage(page.id)}
                              disabled={page.isProcessing}
                              title="Reprocess with current settings"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removePage(page.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            
            {/* Add More Pages Button */}
            {capturedPages.length > 0 && !isScanning && (
              <Button onClick={initializeCamera} variant="outline" className="mt-3">
                <Plus className="h-4 w-4 mr-2" />
                Add More Pages
              </Button>
            )}
          </div>
        </div>
        
        {/* Hidden canvas for image capture */}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}