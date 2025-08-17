import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ComponentErrorBoundary } from '@/components/error-boundary';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  Edit, 
  Trash2,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Share,
  MoreVertical,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Monitor,
  RotateCcw
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Document {
  id: number;
  name: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  extractedText: string | null;
  summary: string | null;
  uploadedAt: string;
  expiryDate: string | null;
}

interface Category {
  name: string;
  icon: string;
  color: string;
}

interface MobileDocumentViewerProps {
  document: Document;
  category?: Category;
  onClose: () => void;
  onDownload?: () => void;
  onUpdate?: () => void;
}

// Touch gesture hook for swipe detection
function useSwipeGestures(
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  threshold: number = 50
) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isLeftSwipe = distanceX > threshold;
    const isRightSwipe = distanceX < -threshold;
    const isVerticalSwipe = Math.abs(distanceY) > Math.abs(distanceX);

    // Only trigger horizontal swipes (ignore vertical scrolling)
    if (!isVerticalSwipe) {
      if (isLeftSwipe && onSwipeLeft) {
        onSwipeLeft();
      }
      if (isRightSwipe && onSwipeRight) {
        onSwipeRight();
      }
    }
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}

// Telemetry logging helper
function logTelemetry(action: string, metadata?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  console.log(`📊 Mobile Viewer Telemetry: ${action}`, {
    timestamp,
    documentId: metadata?.documentId,
    ...metadata
  });
}

// Auto-fit calculation helper
function calculateAutoFitZoom(
  documentWidth: number,
  documentHeight: number,
  containerWidth: number,
  containerHeight: number,
  mode: 'width' | 'height' = 'width',
  padding: number = 32
): number {
  const availableWidth = containerWidth - padding;
  const availableHeight = containerHeight - padding;

  if (mode === 'width') {
    return Math.min(availableWidth / documentWidth, 3); // Cap at 3x zoom
  } else {
    return Math.min(availableHeight / documentHeight, 3);
  }
}

export function MobileDocumentViewer({ 
  document, 
  category, 
  onClose, 
  onDownload, 
  onUpdate 
}: MobileDocumentViewerProps) {
  console.log('🔥 MobileDocumentViewer rendering for document:', document.id, document.name);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [showControls, setShowControls] = useState(true);

  // New state for auto-fit functionality
  const [autoFitZoom, setAutoFitZoom] = useState<number | null>(null);
  const [fitMode, setFitMode] = useState<'width' | 'height' | 'custom'>('width');
  const [hasUserZoomed, setHasUserZoomed] = useState(false);
  const [documentDimensions, setDocumentDimensions] = useState<{width: number, height: number} | null>(null);

  const viewerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Detect mobile viewport
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 480);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 480);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-fit zoom calculation and application
  const applyAutoFitZoom = useCallback(() => {
    if (!isMobile || hasUserZoomed || !documentDimensions || !viewerRef.current) return;

    const containerRect = viewerRef.current.getBoundingClientRect();
    const autoZoom = calculateAutoFitZoom(
      documentDimensions.width,
      documentDimensions.height,
      containerRect.width,
      containerRect.height,
      fitMode === 'custom' ? 'width' : fitMode,
      64 // padding for controls
    );

    if (autoZoom !== zoom) {
      setAutoFitZoom(autoZoom);
      setZoom(autoZoom);
      logTelemetry('auto_fit_applied', {
        documentId: document.id,
        autoZoom: autoZoom.toFixed(2),
        fitMode,
        documentDimensions,
        containerDimensions: { width: containerRect.width, height: containerRect.height }
      });
    }
  }, [isMobile, hasUserZoomed, documentDimensions, fitMode, zoom, document.id]);

  // Detect document dimensions when content loads
  const handleImageLoad = useCallback((event: Event) => {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
      setDocumentDimensions(dimensions);
      logTelemetry('document_dimensions_detected', {
        documentId: document.id,
        type: 'image',
        dimensions
      });
    }
  }, [document.id]);

  const handleIframeLoad = useCallback(() => {
    // For PDFs, we'll use standard A4 dimensions as fallback since iframe content is sandboxed
    const standardA4 = { width: 595, height: 842 }; // A4 in points
    setDocumentDimensions(standardA4);
    logTelemetry('document_dimensions_detected', {
      documentId: document.id,
      type: 'pdf',
      dimensions: standardA4,
      note: 'Using standard A4 dimensions for PDF'
    });
  }, [document.id]);

  // Apply auto-fit when dimensions change
  useEffect(() => {
    if (documentDimensions && !hasUserZoomed) {
      applyAutoFitZoom();
    }
  }, [documentDimensions, applyAutoFitZoom, hasUserZoomed]);

  // Telemetry for viewer lifecycle
  useEffect(() => {
    const startTime = Date.now();
    logTelemetry('viewer_opened', { 
      documentId: document.id, 
      mimeType: document.mimeType,
      fileSize: document.fileSize 
    });

    return () => {
      const viewDuration = Date.now() - startTime;
      logTelemetry('viewer_closed', { 
        documentId: document.id, 
        viewDuration: viewDuration / 1000,
        abandoned: viewDuration < 10000 // Less than 10 seconds
      });
    };
  }, [document.id, document.mimeType, document.fileSize]);

  // Enhanced gesture tracking
  const enhancedSwipeGestures = useSwipeGestures(
    () => {
      logTelemetry('swipe_left', { documentId: document.id });
    },
    () => {
      logTelemetry('swipe_right', { documentId: document.id });
    }
  );

  // Add a safety timeout to prevent hanging  
  useEffect(() => {
    console.log('🔄 MobileDocumentViewer useEffect: Starting document load for:', document.id);

    const safetyTimeout = setTimeout(() => {
      console.warn('⚠️ MobileDocumentViewer safety timeout - forcing loading to complete');
      setIsLoading(false);
      if (!error) {
        setError('Document loading took too long. Please try again.');
      }
    }, 5000);

    // For images, try to load the preview
    if (document.mimeType.startsWith('image/')) {
      console.log('📸 Loading image in mobile viewer...');
      const img = new Image();
      img.onload = () => {
        console.log('✅ Image loaded successfully in mobile viewer');
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      };
      img.onerror = () => {
        console.error('❌ Image failed to load in mobile viewer');
        setError('Failed to load image');
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      };
      img.src = `/api/documents/${document.id}/preview`;
    } else {
      // For non-images, just stop loading
      console.log('📄 Non-image document in mobile viewer');
      setIsLoading(false);
      clearTimeout(safetyTimeout);
    }

    return () => {
      clearTimeout(safetyTimeout);
    };
  }, [document.id, error]);

  // Auto-hide controls on mobile after inactivity
  useEffect(() => {
    if (!isMobile) return;

    const timer = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [showControls, isMobile]);

  // Touch gestures for navigation
  const swipeGestures = useSwipeGestures(
    () => {
      // Swipe left - could be used for next document in a collection
      console.log('Swipe left detected');
    },
    () => {
      // Swipe right - could be used for previous document
      console.log('Swipe right detected');
    }
  );

  // Document update mutation
  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update document');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setIsEditing(false);
      toast({ title: "Document updated successfully" });
      onUpdate?.();
    },
    onError: () => {
      toast({ title: "Failed to update document", variant: "destructive" });
    }
  });

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/documents/${id}`, { 
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete document');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({ title: "Document deleted successfully" });
      onUpdate?.();
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to delete document", variant: "destructive" });
    }
  });

  const handleSaveEdit = () => {
    if (editName.trim()) {
      updateDocumentMutation.mutate({
        id: document.id,
        name: editName.trim(),
      });
    }
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${document.name}"? This action cannot be undone.`)) {
      deleteDocumentMutation.mutate(document.id);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!(document as any).fullscreenElement) {
        await viewerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await (document as any).exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.warn('Fullscreen not supported or failed:', error);
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 0.25, 3);
    setZoom(newZoom);
    setHasUserZoomed(true);
    setFitMode('custom');
    logTelemetry('zoom_in', { documentId: document.id, newZoom, previousZoom: zoom });
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 0.25, 0.5);
    setZoom(newZoom);
    setHasUserZoomed(true);
    setFitMode('custom');
    logTelemetry('zoom_out', { documentId: document.id, newZoom, previousZoom: zoom });
  };

  const handleRotate = () => {
    const newRotation = (rotation + 90) % 360;
    setRotation(newRotation);
    logTelemetry('rotate', { documentId: document.id, newRotation, previousRotation: rotation });
  };

  const resetView = () => {
    setZoom(1);
    setRotation(0);
    setHasUserZoomed(false);
    setFitMode('width');
    logTelemetry('reset_view', { documentId: document.id });
  };

  // New fit mode functions
  const fitToWidth = () => {
    if (documentDimensions && viewerRef.current) {
      const containerRect = viewerRef.current.getBoundingClientRect();
      const newZoom = calculateAutoFitZoom(
        documentDimensions.width,
        documentDimensions.height,
        containerRect.width,
        containerRect.height,
        'width',
        64
      );
      setZoom(newZoom);
      setFitMode('width');
      setHasUserZoomed(true);
      logTelemetry('fit_to_width', { documentId: document.id, autoZoom: newZoom });
    }
  };

  const fitToHeight = () => {
    if (documentDimensions && viewerRef.current) {
      const containerRect = viewerRef.current.getBoundingClientRect();
      const newZoom = calculateAutoFitZoom(
        documentDimensions.width,
        documentDimensions.height,
        containerRect.width,
        containerRect.height,
        'height',
        64
      );
      setZoom(newZoom);
      setFitMode('height');
      setHasUserZoomed(true);
      logTelemetry('fit_to_height', { documentId: document.id, autoZoom: newZoom });
    }
  };

  const toggleControls = () => {
    setShowControls(prev => !prev);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getPreviewUrl = () => `/api/documents/${document.id}/preview`;
  const isImage = () => document.mimeType.startsWith('image/');
  const isPDF = () => document.mimeType === 'application/pdf';

  const renderContent = () => {
    if (error) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center p-6">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">Failed to load document</p>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    if (isImage()) {
      return (
        <div 
          className="flex items-center justify-center h-full overflow-auto bg-gray-900"
          {...enhancedSwipeGestures}
        >
          <img
            ref={imageRef}
            src={getPreviewUrl()}
            alt={document.name}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ 
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              touchAction: 'pan-x pan-y',
            }}
            onLoad={(e) => {
              setIsLoading(false);
              handleImageLoad(e.nativeEvent);
            }}
            onError={() => {
              setError('Failed to load image');
              setIsLoading(false);
            }}
            draggable={false}
          />
        </div>
      );
    }

    if (isPDF()) {
      return (
        <div 
          className="h-full bg-gray-200"
          {...enhancedSwipeGestures}
        >
          <iframe
            ref={iframeRef}
            src={getPreviewUrl()}
            className="w-full h-full border-0"
            style={{ 
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            onLoad={() => {
              setIsLoading(false);
              handleIframeLoad();
            }}
            onError={() => {
              setError('Failed to load PDF');
              setIsLoading(false);
            }}
            title={document.name}
          />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-6">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900">Preview not available</p>
          <p className="text-sm text-gray-600 mb-4">This file type cannot be previewed</p>
          <Button onClick={onDownload} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download File
          </Button>
        </div>
      </div>
    );
  };

  return (
    <ComponentErrorBoundary componentName="Mobile Document Viewer">
      <div 
        ref={viewerRef}
        className={`
          fixed inset-0 z-50 bg-black
          ${isMobile ? 'mobile-viewer' : ''}
        `}
        onClick={toggleControls}
      >
        {/* Mobile Header - Fixed at top */}
        <div className={`
          absolute top-0 left-0 right-0 z-60 
          bg-gradient-to-b from-black/80 to-transparent
          transition-transform duration-300
          ${showControls || !isMobile ? 'translate-y-0' : '-translate-y-full'}
        `}>
          <div className="flex items-center justify-between p-4 text-white">
            {/* Left side - Close button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2"
            >
              <X className="w-5 h-5" />
            </Button>

            {/* Center - Document info */}
            <div className="flex-1 mx-4 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 bg-white/20 text-white placeholder-white/60 px-3 py-1 rounded text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') setIsEditing(false);
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs"
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <h2 className="font-medium text-sm truncate">{document.name}</h2>
                  <div className="flex items-center justify-center gap-2 text-xs text-white/70 mt-1">
                    {category && (
                      <Badge variant="secondary" className="text-xs bg-white/20 text-white border-0">
                        {category.name}
                      </Badge>
                    )}
                    <span>{formatFileSize(document.fileSize)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right side - Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/20 p-2"
                >
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigator.share?.({ title: document.name, url: window.location.href })}>
                  <Share className="w-4 h-4 mr-2" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Main Content */}
        <div 
          ref={contentRef}
          className="h-full pt-16 pb-20"
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-white">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm">Loading document...</p>
              </div>
            </div>
          ) : (
            renderContent()
          )}
        </div>

        {/* Mobile Controls - Fixed at bottom */}
        <div className={`
          absolute bottom-0 left-0 right-0 z-60
          bg-gradient-to-t from-black/80 to-transparent
          transition-transform duration-300
          ${showControls || !isMobile ? 'translate-y-0' : 'translate-y-full'}
        `}>
          <div className="flex items-center justify-center gap-1 p-3 flex-wrap">
            {(isImage() || isPDF()) && (
              <>
                {/* Fit Mode Buttons */}
                <Button
                  variant={fitMode === 'width' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={fitToWidth}
                  className={`text-white hover:bg-white/20 p-2 text-xs ${
                    fitMode === 'width' ? 'bg-white/30' : ''
                  }`}
                  title="Fit to Width"
                >
                  <Monitor className="w-4 h-4" />
                </Button>

                <Button
                  variant={fitMode === 'height' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={fitToHeight}
                  className={`text-white hover:bg-white/20 p-2 text-xs ${
                    fitMode === 'height' ? 'bg-white/30' : ''
                  }`}
                  title="Fit to Height"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>

                {/* Zoom Controls */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="text-white hover:bg-white/20 p-2"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>

                <div className="text-white text-xs px-2 py-1 bg-white/20 rounded min-w-[3rem] text-center">
                  {Math.round(zoom * 100)}%
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="text-white hover:bg-white/20 p-2"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>

                {/* Additional Controls */}
                {isImage() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRotate}
                    className="text-white hover:bg-white/20 p-2"
                    title="Rotate"
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetView}
                  className="text-white hover:bg-white/20 p-2 text-xs"
                  title="Reset View"
                >
                  Reset
                </Button>

                {/* Auto-fit indicator */}
                {autoFitZoom && !hasUserZoomed && (
                  <div className="text-white/70 text-xs px-2 py-1 bg-blue-500/30 rounded">
                    Auto
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .mobile-viewer {
          /* Prevent iOS Safari bounce effect */
          position: fixed;
          overflow: hidden;
          -webkit-overflow-scrolling: touch;
        }

        .mobile-viewer * {
          /* Prevent text selection on mobile */
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }

        /* Custom scrollbar for mobile */
        @media (max-width: 480px) {
          .mobile-viewer ::-webkit-scrollbar {
            width: 2px;
          }

          .mobile-viewer ::-webkit-scrollbar-track {
            background: transparent;
          }

          .mobile-viewer ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 1px;
          }
        }
      `}</style>
    </ComponentErrorBoundary>
  );
}