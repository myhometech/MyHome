
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFeatures } from '@/hooks/useFeatures';
import { MobileInsightsDrawer } from '@/components/MobileInsightsDrawer';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  Edit, 
  Trash2,
  MoreVertical,
  FileText,
  AlertCircle,
  Share
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
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [showControls, setShowControls] = useState(true);
  
  const viewerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasFeature } = useFeatures();

  const hasAIInsights = hasFeature('AI_SUMMARIZATION');

  // Auto-hide controls after 3 seconds of inactivity
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowControls(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [showControls]);

  // Initialize document loading
  useEffect(() => {
    const loadDocument = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (document.mimeType.startsWith('image/')) {
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = `/api/documents/${document.id}/preview`;
          });
        }
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load document');
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [document.id, document.mimeType]);

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
        <div className="flex items-center justify-center h-full bg-gray-50 p-6">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">Failed to load document</p>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Refresh
            </Button>
          </div>
        </div>
      );
    }

    if (isImage()) {
      return (
        <div className="flex items-center justify-center h-full overflow-hidden bg-black">
          <img
            ref={imageRef}
            src={getPreviewUrl()}
            alt={document.name}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ 
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
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
        <div className="w-full h-full bg-gray-200">
          <iframe
            ref={iframeRef}
            src={getPreviewUrl()}
            className="w-full h-full border-0"
            style={{ 
              transform: `scale(${zoom})`,
              transformOrigin: 'center top',
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
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">Preview not available</p>
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
    <div className="fixed inset-0 z-50 bg-black w-full h-full" onClick={toggleControls}>
      {/* Header */}
      <div className={`
        absolute top-0 left-0 right-0 z-60 
        bg-gradient-to-b from-black/90 to-transparent
        transition-transform duration-300 ease-in-out
        ${showControls ? 'translate-y-0' : '-translate-y-full'}
      `}>
        <div className="flex items-center justify-between p-4 text-white">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-white hover:bg-white/20 p-2 rounded-full"
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Document Info */}
          <div className="flex-1 mx-4 text-center">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 bg-white/20 text-white placeholder-white/60 px-3 py-1 rounded text-sm border border-white/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveEdit();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs"
                >
                  Save
                </Button>
              </div>
            ) : (
              <div>
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

          {/* Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                className="text-white hover:bg-white/20 p-2 rounded-full"
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
      <div className="w-full h-full pt-0">
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

      {/* Bottom Controls */}
      {(isImage() || isPDF()) && (
        <div className={`
          absolute bottom-0 left-0 right-0 z-60
          bg-gradient-to-t from-black/90 to-transparent
          transition-transform duration-300 ease-in-out
          ${showControls ? 'translate-y-0' : 'translate-y-full'}
        `}>
          <div className="flex items-center justify-center gap-2 p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleZoomOut();
              }}
              disabled={zoom <= 0.5}
              className="text-white hover:bg-white/20 p-2 rounded-full"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>

            <div className="text-white text-xs px-3 py-2 bg-white/20 rounded-full min-w-[4rem] text-center">
              {Math.round(zoom * 100)}%
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleZoomIn();
              }}
              disabled={zoom >= 3}
              className="text-white hover:bg-white/20 p-2 rounded-full"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>

            {isImage() && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRotate();
                }}
                className="text-white hover:bg-white/20 p-2 rounded-full ml-2"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                resetView();
              }}
              className="text-white hover:bg-white/20 p-2 rounded-full ml-2 text-xs px-3"
            >
              Reset
            </Button>
          </div>
        </div>
      )}

      {/* AI Insights Drawer */}
      {hasAIInsights && (
        <MobileInsightsDrawer
          documentId={document.id}
          documentName={document.name}
        />
      )}
    </div>
  );
}
