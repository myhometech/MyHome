import React, { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check, Plus, Trash2, Download, Wand2, Settings, ChevronLeft, ChevronRight, GripVertical, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { imageProcessor, ProcessingOptions, ProcessedImage } from "@/utils/image-processing";
import { trackScanEvent } from "@/lib/analytics";

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
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [showPagePreview, setShowPagePreview] = useState(false);
  const [previewAnimationId, setPreviewAnimationId] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Camera initialization
  const initializeCamera = useCallback(async () => {
    try {
      setError(null);
      
      // TICKET 8: Track scan started event
      trackScanEvent('browser_scan_started', {
        timestamp: new Date().toISOString()
      });
      
      // Log available devices for debugging
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('Available video devices:', videoDevices.map(d => ({ label: d.label, deviceId: d.deviceId })));
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // Try to prefer back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      console.log('Media stream obtained:', {
        active: mediaStream.active,
        id: mediaStream.id,
        tracks: mediaStream.getTracks().map(track => ({
          kind: track.kind,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings ? track.getSettings() : 'N/A'
        }))
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        console.log('Setting video source and properties...');
        
        // Clear any existing source first
        videoRef.current.srcObject = null;
        
        // Wait a tick then set the new stream
        await new Promise(resolve => setTimeout(resolve, 100));
        
        videoRef.current.srcObject = mediaStream;
        videoRef.current.autoplay = true;
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        
        // Force load and dimensions
        videoRef.current.load();
        videoRef.current.style.width = '100%';
        videoRef.current.style.height = '100%';
        videoRef.current.style.objectFit = 'cover';
        
        // Wait for video metadata to load
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Video metadata load timeout'));
          }, 10000);
          
          videoRef.current!.onloadedmetadata = () => {
            clearTimeout(timeoutId);
            console.log('Video metadata loaded:', {
              videoWidth: videoRef.current!.videoWidth,
              videoHeight: videoRef.current!.videoHeight,
              readyState: videoRef.current!.readyState,
              hasVideo: videoRef.current!.videoWidth > 0
            });
            
            // Force a repaint if dimensions are 0
            if (videoRef.current!.videoWidth === 0) {
              console.log('Video width is 0, forcing reload...');
              videoRef.current!.load();
            }
            
            resolve(void 0);
          };
          
          videoRef.current!.onerror = (error) => {
            clearTimeout(timeoutId);
            console.error('Video element error:', error);
            reject(new Error('Video element error'));
          };
        });
        
        // Start playing the video
        try {
          await videoRef.current.play();
          console.log('Video playing successfully');
          
          // Double-check video dimensions and stream
          setTimeout(() => {
            if (videoRef.current) {
              console.log('Video status after play:', {
                videoWidth: videoRef.current.videoWidth,
                videoHeight: videoRef.current.videoHeight,
                readyState: videoRef.current.readyState,
                paused: videoRef.current.paused,
                ended: videoRef.current.ended,
                srcObject: !!videoRef.current.srcObject,
                currentTime: videoRef.current.currentTime
              });
            }
          }, 1000);
        } catch (playError) {
          console.error('Video play failed:', playError);
          throw new Error('Failed to start video playback');
        }
      }
      
      // Start canvas preview loop since video element isn't working on mobile
      startCanvasPreview(mediaStream);
      
      setIsScanning(true);
    } catch (err: any) {
      console.error('Failed to access camera:', err);
      
      let errorMessage = 'Unable to access camera. Please ensure camera permissions are granted.';
      let toastTitle = "Camera Access Failed";
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access and try again.';
        toastTitle = "Camera Permission Denied";
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.';
        toastTitle = "Camera Not Found";
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.';
        toastTitle = "Camera In Use";
      } else if (err.message.includes('timeout')) {
        errorMessage = 'Camera failed to initialize. Please try again.';
        toastTitle = "Camera Timeout";
      }
      
      setError(errorMessage);
      toast({
        title: toastTitle,
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [toast]);

  // Canvas preview for mobile compatibility
  const startCanvasPreview = useCallback((mediaStream: MediaStream) => {
    const video = document.createElement('video');
    video.srcObject = mediaStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    
    let animationId: number | null = null;
    
    const updateCanvas = () => {
      if (previewCanvasRef.current && video.readyState >= 2) {
        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (ctx && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
        }
      }
      
      // Continue animation loop
      animationId = requestAnimationFrame(updateCanvas);
      setPreviewAnimationId(animationId);
    };
    
    video.addEventListener('loadeddata', () => {
      console.log('Canvas preview video loaded:', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      });
      updateCanvas();
    });
    
    // Also try to start when metadata is loaded
    video.addEventListener('loadedmetadata', () => {
      console.log('Canvas preview metadata loaded:', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      });
      if (video.videoWidth > 0) {
        updateCanvas();
      }
    });
    
    video.play().catch(console.error);
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (previewAnimationId) {
      cancelAnimationFrame(previewAnimationId);
      setPreviewAnimationId(null);
    }
    setIsScanning(false);
  }, [stream, previewAnimationId]);

  // Capture current frame with OpenCV processing
  const captureFrame = useCallback(async () => {
    if (!previewCanvasRef.current || !canvasRef.current) {
      console.log('Missing canvas references for capture');
      return;
    }

    const sourceCanvas = previewCanvasRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.log('No canvas context available');
      return;
    }

    if (sourceCanvas.width === 0 || sourceCanvas.height === 0) {
      console.log('Source canvas has no dimensions:', { width: sourceCanvas.width, height: sourceCanvas.height });
      toast({
        title: "Camera Not Ready",
        description: "Please wait for the camera to fully initialize before capturing.",
        variant: "destructive",
      });
      return;
    }

    console.log('Capturing frame from canvas:', { width: sourceCanvas.width, height: sourceCanvas.height });

    // Set canvas dimensions to match source canvas
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    
    // Draw current frame from preview canvas
    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    
    // Convert to data URL with higher quality and better format
    const originalImageData = canvas.toDataURL('image/jpeg', 0.95);
    
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

  // Reorder pages via drag and drop
  const reorderPages = useCallback((startIndex: number, endIndex: number) => {
    setCapturedPages(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((pageId: string, index: number) => {
    setDraggedPage(pageId);
    setSelectedPageIndex(index);
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedPage && selectedPageIndex !== null) {
      reorderPages(selectedPageIndex, targetIndex);
      setDraggedPage(null);
      setSelectedPageIndex(null);
    }
  }, [draggedPage, selectedPageIndex, reorderPages]);

  // Navigate to specific page
  const navigateToPage = useCallback((direction: 'prev' | 'next') => {
    if (selectedPageIndex === null) return;
    
    if (direction === 'prev' && selectedPageIndex > 0) {
      setSelectedPageIndex(selectedPageIndex - 1);
    } else if (direction === 'next' && selectedPageIndex < capturedPages.length - 1) {
      setSelectedPageIndex(selectedPageIndex + 1);
    }
  }, [selectedPageIndex, capturedPages.length]);

  // Convert captured pages to files and finish - creates PDF upload
  const finishScanning = useCallback(async () => {
    if (capturedPages.length === 0) {
      toast({
        title: "No Pages Captured",
        description: "Please capture at least one page before finishing.",
        variant: "destructive",
      });
      return;
    }

    if (capturedPages.length > 20) {
      toast({
        title: "Too Many Pages",
        description: "Maximum 20 pages allowed. Please remove some pages.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      // Create image files with document-scan- prefix to trigger PDF bundling
      const files: File[] = [];
      const timestamp = Date.now();
      
      for (let i = 0; i < capturedPages.length; i++) {
        const page = capturedPages[i];
        
        // Convert data URL to blob with proper JPEG format
        const response = await fetch(page.imageData);
        const blob = await response.blob();
        
        // Ensure we have a valid JPEG by re-creating it if needed
        if (blob.type !== 'image/jpeg') {
          console.log('Converting blob to JPEG format');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          await new Promise((resolve) => {
            img.onload = () => {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              resolve(void 0);
            };
            img.src = page.imageData;
          });
          
          const jpegBlob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.95);
          });
          
          const fileName = `document-scan-page-${String(i + 1).padStart(2, '0')}-${timestamp}.jpg`;
          const file = new File([jpegBlob], fileName, { type: 'image/jpeg' });
          files.push(file);
        } else {
          // Create file with document-scan- prefix to trigger merge logic
          const fileName = `document-scan-page-${String(i + 1).padStart(2, '0')}-${timestamp}.jpg`;
          const file = new File([blob], fileName, { type: 'image/jpeg' });
          files.push(file);
        }
      }
      
      stopCamera();
      
      // Use FormData to send multiple files for PDF bundling
      const formData = new FormData();
      files.forEach((file, index) => {
        formData.append('pages', file);
      });
      
      // Add metadata
      formData.append('uploadSource', 'browser_scan');
      formData.append('documentName', `Scanned Document ${new Date().toLocaleDateString()}`);
      formData.append('pageCount', files.length.toString());
      
      // TICKET 8: Track scan upload initiated
      trackScanEvent('browser_scan_uploaded', {
        pageCount: files.length,
        timestamp: new Date().toISOString()
      });
      
      // Upload to server for PDF creation
      const response = await fetch('/api/documents/multi-page-scan-upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const result = await response.json();
      
      onClose();
      
      // Redirect to document view or refresh page
      if (result.documentId) {
        window.location.href = `/document/${result.documentId}`;
      } else {
        // Refresh the current page to show new document
        window.location.reload();
      }
      
      toast({
        title: "Scan Complete",
        description: `Successfully created ${capturedPages.length}-page PDF document.`,
      });
      
    } catch (err) {
      console.error('Failed to process captured pages:', err);
      toast({
        title: "Upload Failed",
        description: "Failed to create PDF document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [capturedPages, stopCamera, onClose, toast]);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPages([]);
      setError(null);
      setSelectedPageIndex(null);
      setShowPagePreview(false);
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
      <DialogContent className="max-w-4xl max-h-[100vh] md:max-h-[90vh] overflow-hidden p-2 md:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Document Scanner
            {capturedPages.length > 0 && (
              <Badge variant="secondary" className={capturedPages.length > 20 ? "bg-red-100 text-red-800" : ""}>
                {capturedPages.length}/20 page{capturedPages.length > 1 ? 's' : ''}
              </Badge>
            )}
            <div className="ml-auto flex gap-2">
              {capturedPages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPagePreview(!showPagePreview)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
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
          <div className="flex-1 flex flex-col relative">
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
                <div className="relative w-full h-full">
                  {/* Hidden video element for stream access */}
                  <video
                    ref={videoRef}
                    className="hidden"
                    autoPlay
                    playsInline
                    muted
                  />
                  
                  {/* Canvas preview that should work on mobile */}
                  <canvas
                    ref={previewCanvasRef}
                    className="w-full h-full object-cover"
                    style={{ 
                      backgroundColor: '#000',
                      transform: 'scaleX(-1)' // Mirror for selfie view
                    }}
                  />
                  
                  {/* Debug overlay with more details */}
                  <div className="absolute top-2 right-2 bg-black bg-opacity-75 text-white text-xs p-2 rounded">
                    <div>Camera: {stream ? 'Active' : 'Inactive'}</div>
                    <div>Canvas: {previewCanvasRef.current?.width || 0}x{previewCanvasRef.current?.height || 0}</div>
                    <div>Video: {videoRef.current?.videoWidth || 0}x{videoRef.current?.videoHeight || 0}</div>
                  </div>
                </div>
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
                  <div className="absolute bottom-20 md:bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded">
                    Align document within frame
                  </div>
                </div>
              )}
            </div>
            
            {/* Camera Controls - Always visible on mobile */}
            {isScanning && (
              <>
                {/* Mobile Controls - Fixed at bottom */}
                <div className="md:hidden fixed bottom-4 left-4 right-4 z-50 bg-black/80 rounded-lg p-3">
                  <div className="flex justify-center gap-3">
                    <Button onClick={stopCamera} variant="outline" size="sm" className="bg-white/90">
                      <X className="h-4 w-4" />
                    </Button>
                    <Button onClick={captureFrame} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                      <Camera className="h-4 w-4 mr-2" />
                      Capture Page
                    </Button>
                  </div>
                </div>
                
                {/* Desktop Controls - Below camera */}
                <div className="hidden md:flex justify-center gap-4 mt-4">
                  <Button onClick={stopCamera} variant="outline">
                    <X className="h-4 w-4 mr-2" />
                    Stop Camera
                  </Button>
                  <Button onClick={captureFrame} size="lg">
                    <Camera className="h-4 w-4 mr-2" />
                    Capture Page
                  </Button>
                </div>
              </>
            )}
          </div>
          
          {/* Captured Pages Section */}
          <div className="w-full lg:w-80 flex flex-col">
            {/* Horizontal Page Preview Bar */}
            {capturedPages.length > 1 && !showPagePreview && (
              <div className="mb-4 p-2 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-600">Quick Preview:</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPagePreview(true)}
                    className="h-6 px-2 text-xs"
                  >
                    View All
                  </Button>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {capturedPages.slice(0, 5).map((page, index) => (
                    <div
                      key={page.id}
                      className={`relative flex-shrink-0 cursor-pointer border-2 rounded ${
                        selectedPageIndex === index ? 'border-blue-500' : 'border-gray-200'
                      }`}
                      onClick={() => setSelectedPageIndex(index)}
                    >
                      <img
                        src={page.imageData}
                        alt={`Page ${index + 1}`}
                        className="w-12 h-16 object-cover rounded"
                      />
                      <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                  {capturedPages.length > 5 && (
                    <div className="flex-shrink-0 w-12 h-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-600">
                      +{capturedPages.length - 5}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Captured Pages</h3>
                {showPagePreview && capturedPages.length > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigateToPage('prev')}
                      disabled={selectedPageIndex === null || selectedPageIndex === 0}
                      className="h-6 px-1"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="text-xs text-gray-500">
                      {selectedPageIndex !== null ? selectedPageIndex + 1 : 1} / {capturedPages.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigateToPage('next')}
                      disabled={selectedPageIndex === null || selectedPageIndex === capturedPages.length - 1}
                      className="h-6 px-1"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              {capturedPages.length > 0 && (
                <Button 
                  onClick={finishScanning} 
                  disabled={isProcessing || capturedPages.length > 20}
                  variant={capturedPages.length > 20 ? "destructive" : "default"}
                >
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
            ) : showPagePreview && selectedPageIndex !== null ? (
              /* Full Page Preview Mode */
              <div className="flex-1 flex flex-col">
                <div className="relative bg-black rounded-lg overflow-hidden flex-1 flex items-center justify-center mb-4">
                  <img
                    src={capturedPages[selectedPageIndex]?.imageData}
                    alt={`Page ${selectedPageIndex + 1}`}
                    className="max-w-full max-h-full object-contain"
                  />
                  
                  {/* Navigation overlays */}
                  {selectedPageIndex > 0 && (
                    <button
                      onClick={() => navigateToPage('prev')}
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                  )}
                  {selectedPageIndex < capturedPages.length - 1 && (
                    <button
                      onClick={() => navigateToPage('next')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  )}
                  
                  {/* Page info overlay */}
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded text-sm">
                    Page {selectedPageIndex + 1} of {capturedPages.length}
                    {capturedPages[selectedPageIndex]?.confidence && (
                      <span className="ml-2">({Math.round(capturedPages[selectedPageIndex].confidence! * 100)}% confidence)</span>
                    )}
                  </div>
                </div>
                
                {/* Page controls */}
                <div className="flex justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPagePreview(false)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Close Preview
                  </Button>
                  
                  {capturedPages[selectedPageIndex]?.processedImageData && capturedPages[selectedPageIndex]?.originalImageData && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleProcessing(capturedPages[selectedPageIndex].id)}
                      title="Toggle between original and enhanced"
                    >
                      <Wand2 className="h-3 w-3 mr-1" />
                      Toggle Enhancement
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      removePage(capturedPages[selectedPageIndex].id);
                      if (selectedPageIndex >= capturedPages.length - 1) {
                        setSelectedPageIndex(Math.max(0, capturedPages.length - 2));
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete Page
                  </Button>
                </div>
              </div>
            ) : (
              /* List View Mode */
              <div className="flex-1 overflow-y-auto space-y-3">
                {capturedPages.map((page, index) => (
                  <Card 
                    key={page.id} 
                    className={`relative cursor-pointer transition-all ${
                      selectedPageIndex === index ? 'ring-2 ring-blue-500' : ''
                    } ${draggedPage === page.id ? 'opacity-50' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      handleDragStart(page.id, index);
                    }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={() => setSelectedPageIndex(index)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        {/* Drag handle */}
                        <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        
                        <div className="relative">
                          <img
                            src={page.imageData}
                            alt={`Page ${index + 1}`}
                            className="w-16 h-20 object-cover rounded border"
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
                          
                          {/* Page number overlay */}
                          <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {index + 1}
                          </div>
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPageIndex(index);
                              setShowPagePreview(true);
                            }}
                            title="Preview page"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          
                          {page.processedImageData && page.originalImageData && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleProcessing(page.id);
                              }}
                              title="Toggle between original and enhanced"
                            >
                              <Wand2 className="h-3 w-3" />
                            </Button>
                          )}
                          
                          {page.originalImageData && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                reprocessPage(page.id);
                              }}
                              disabled={page.isProcessing}
                              title="Reprocess with current settings"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          )}
                          
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePage(page.id);
                            }}
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
            {capturedPages.length > 0 && !isScanning && !showPagePreview && (
              <Button 
                onClick={initializeCamera} 
                variant="outline" 
                className="mt-3"
                disabled={capturedPages.length >= 20}
              >
                <Plus className="h-4 w-4 mr-2" />
                {capturedPages.length >= 20 ? 'Maximum Pages Reached' : 'Add More Pages'}
              </Button>
            )}
            
            {/* Page count warning */}
            {capturedPages.length > 15 && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                ⚠️ Approaching maximum of 20 pages ({capturedPages.length}/20)
              </div>
            )}
          </div>
        </div>
        
        {/* Hidden canvas for image capture */}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}