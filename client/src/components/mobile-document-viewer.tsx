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
  AlertCircle
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

export function MobileDocumentViewer({ 
  document, 
  category, 
  onClose, 
  onDownload, 
  onUpdate 
}: MobileDocumentViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [showControls, setShowControls] = useState(true);
  
  const viewerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
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
      if (!document.fullscreenElement) {
        await viewerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.warn('Fullscreen not supported or failed:', error);
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const resetView = () => {
    setZoom(1);
    setRotation(0);
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
          {...swipeGestures}
        >
          <img
            src={getPreviewUrl()}
            alt={document.name}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ 
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              touchAction: 'pan-x pan-y',
            }}
            onLoad={() => setIsLoading(false)}
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
          {...swipeGestures}
        >
          <iframe
            src={getPreviewUrl()}
            className="w-full h-full border-0"
            style={{ 
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            onLoad={() => setIsLoading(false)}
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
          <div className="flex items-center justify-center gap-2 p-4">
            {(isImage() || isPDF()) && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="text-white hover:bg-white/20 p-2"
                >
                  <ZoomOut className="w-5 h-5" />
                </Button>
                
                <div className="text-white text-sm px-3 py-1 bg-white/20 rounded">
                  {Math.round(zoom * 100)}%
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="text-white hover:bg-white/20 p-2"
                >
                  <ZoomIn className="w-5 h-5" />
                </Button>

                {isImage() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRotate}
                    className="text-white hover:bg-white/20 p-2"
                  >
                    <RotateCw className="w-5 h-5" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetView}
                  className="text-white hover:bg-white/20 p-2 text-xs"
                >
                  Reset
                </Button>

                {document.fullscreenEnabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="text-white hover:bg-white/20 p-2"
                  >
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
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