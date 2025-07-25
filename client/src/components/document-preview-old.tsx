import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MoreVertical, Eye, Download, Trash, Edit, Save, X, AlertCircle, FileText, Image as ImageIcon, ZoomIn, ZoomOut, Calendar, XCircle, MoreHorizontal, Edit2, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { SmartPreviewChips } from "./smart-preview-chips";
import { MobileDocumentViewer } from "@/components/mobile-document-viewer";
// Removed react-pdf imports - using native browser PDF viewing instead

interface DocumentPreviewProps {
  document: {
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
  };
  category?: {
    name: string;
    icon: string;
    color: string;
  };
  onClose: () => void;
  onDownload?: () => void;
  onUpdate?: () => void;
}

// Using native browser PDF viewing - removed PDF.js worker configuration

export function DocumentPreview({ document, category, onClose, onDownload, onUpdate }: DocumentPreviewProps) {
  console.log('DocumentPreview rendering for document:', document.id, document.name);
  
  // Check if mobile viewport for responsive behavior
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 480);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 480);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use simple modal for all devices to avoid complexity
  console.log('Using simple modal for document:', document.id);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-xl font-semibold truncate">{document.name}</h2>
            <p className="text-sm text-gray-600">
              {document.mimeType} • {Math.round(document.fileSize / 1024)} KB
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onDownload} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button onClick={onClose} variant="ghost" size="sm">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading && (
            <div className="flex items-center justify-center h-96 bg-gray-50">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading document...</p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="flex items-center justify-center h-96 bg-gray-50">
              <div className="text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium">Preview failed</p>
                <p className="text-sm text-gray-600 mb-4">{error}</p>
                <Button onClick={onDownload} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download Instead
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !error && isImage() && (
            <div className="flex items-center justify-center h-96 bg-gray-50">
              <img
                src={getPreviewUrl()}
                alt={document.name}
                className="max-w-full max-h-full object-contain"
                onLoad={() => console.log('✅ Image loaded in simple modal')}
                onError={() => {
                  console.error('❌ Image failed to load in simple modal');
                  setError('Failed to load image');
                }}
              />
            </div>
          )}

          {!isLoading && !error && isPDF() && (
            <div className="h-96 bg-gray-50">
              <iframe
                src={getPreviewUrl()}
                className="w-full h-full border-0"
                title={document.name}
                onLoad={() => console.log('✅ PDF loaded in simple modal')}
                onError={() => {
                  console.error('❌ PDF failed to load in simple modal');
                  setError('Failed to load PDF');
                }}
              />
            </div>
          )}

          {!isLoading && !error && !isImage() && !isPDF() && (
            <div className="flex items-center justify-center h-96 bg-gray-50">
              <div className="text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium">Preview not available</p>
                <p className="text-sm text-gray-600 mb-4">File type: {document.mimeType}</p>
                <Button onClick={onDownload} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download File
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [editExpiryDate, setEditExpiryDate] = useState(document.expiryDate || "");
  const [zoom, setZoom] = useState(1);
  
  // PDF-specific state
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation for updating document properties
  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, name, expiryDate }: { id: number; name: string; expiryDate: string | null }) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expiryDate: expiryDate || null }),
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

  // Mutation for deleting document
  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
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
    updateDocumentMutation.mutate({
      id: document.id,
      name: editName,
      expiryDate: editExpiryDate || null
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName(document.name);
    setEditExpiryDate(document.expiryDate || "");
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      deleteDocumentMutation.mutate(document.id);
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    
    console.log('🚀 DocumentPreview useEffect triggered!', {
      documentId: document.id,
      mimeType: document.mimeType,
      isImage: isImage(),
      isPDF: isPDF()
    });

    // Add a safety timeout to prevent hanging
    const safetyTimeout = setTimeout(() => {
      console.warn('⚠️ DocumentPreview safety timeout - forcing loading to complete');
      setIsLoading(false);
      if (!error && !pdfData && isPDF()) {
        setError('Document loading took too long. Please try again.');
      }
    }, 10000);
    
    // For image documents, test if the preview URL is accessible
    if (isImage()) {
      console.log('📸 Loading image document...');
      fetch(getPreviewUrl(), { credentials: 'include' })
        .then(response => {
          console.log('📸 Image fetch response:', response.status);
          if (!response.ok) {
            setError(`Failed to load preview: ${response.status} ${response.statusText}`);
          }
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Preview load error:', err);
          setError(`Network error: ${err.message}`);
          setIsLoading(false);
        });
    } else if (isPDF()) {
      // For PDFs, fetch the data as blob for reliable loading
      setIsLoading(true);
      console.log('🔄 Starting PDF load for document:', document.id, 'Expected size: ~35KB');
      
      const startTime = Date.now();
      fetch(`/api/documents/${document.id}/preview`, { 
        credentials: 'include',
        headers: {
          'Accept': 'application/pdf'
        }
      })
        .then(response => {
          const loadTime = Date.now() - startTime;
          console.log(`✅ PDF fetch completed in ${loadTime}ms, status: ${response.status}`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          console.log('🔄 Converting response to blob...');
          return response.blob();
        })
        .then(blob => {
          console.log(`✅ PDF blob created, size: ${blob.size} bytes (${(blob.size/1024).toFixed(1)}KB)`);
          
          if (blob.size === 0) {
            throw new Error('PDF file is empty');
          }
          
          console.log('🔄 Converting blob to ArrayBuffer...');
          // Convert blob to ArrayBuffer for react-pdf
          return blob.arrayBuffer();
        })
        .then(arrayBuffer => {
          const totalTime = Date.now() - startTime;
          console.log(`🎉 PDF ready for display in ${totalTime}ms, size: ${arrayBuffer.byteLength} bytes`);
          setPdfData(arrayBuffer);
          // Clear timeout since data is ready 
          if (timeoutId) {
            clearTimeout(timeoutId);
            console.log('✅ Timeout cleared - PDF data ready for rendering');
          }
          
          // Set loading to false immediately when data is ready
          // The iframe will display the PDF, no need to wait for onLoad
          setIsLoading(false);
          console.log('🎉 PDF loaded successfully in iframe');
        })
        .catch(err => {
          console.error('❌ PDF loading failed:', err);
          setError(`Failed to load PDF: ${err.message}`);
          setIsLoading(false);
        });
      
      // Add timeout for PDF data loading (8 seconds for small files)
      timeoutId = setTimeout(() => {
        console.warn('⏰ PDF data loading timeout after 8 seconds - this is too slow for a 35KB file');
        setError('PDF data loading timed out. Your 35KB file should load much faster. Please try retry.');
        setIsLoading(false);
      }, 8000);
    } else {
      // For other files, just stop loading immediately
      setIsLoading(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
      }
    };
  }, [document.id]);
  
  // Reset timeout when PDF loads successfully
  useEffect(() => {
    if (!isLoading && isPDF() && pdfData) {
      console.log('PDF loaded successfully, clearing any timeouts');
    }
  }, [isLoading, pdfData]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const isImage = () => {
    return document.mimeType.startsWith('image/');
  };

  const isPDF = () => {
    const result = document.mimeType === 'application/pdf';
    console.log('isPDF check:', document.mimeType, '→', result);
    return result;
  };

  const getPreviewUrl = () => {
    return `/api/documents/${document.id}/preview`;
  };

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-600">Generating preview...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <AlertCircle className="w-12 h-12" />
            <p className="text-sm">Preview not available</p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      );
    }

    if (isImage()) {
      return (
        <div className="relative bg-gray-50 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-2 bg-gray-100">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-600">Image Preview</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
                disabled={zoom <= 0.25}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-600 px-2">{Math.round(zoom * 100)}%</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                disabled={zoom >= 3}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-center p-4 min-h-96 max-h-96 overflow-auto">
            <img
              src={getPreviewUrl()}
              alt={document.name}
              className="max-w-full h-auto rounded shadow-sm"
              style={{ transform: `scale(${zoom})` }}
              onLoad={() => console.log('Image loaded successfully')}
              onError={(e) => {
                console.error('Image load error:', e);
                setError('Failed to load image preview');
              }}
            />
          </div>
        </div>
      );
    }

    if (isPDF()) {
      return (
        <div className="bg-gray-50 rounded-lg">
          {/* PDF Controls */}
          <div className="flex items-center justify-between p-3 bg-gray-100 border-b">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium">{document.fileName}</span>
              <Badge variant="secondary" className="text-xs">PDF</Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {/* PDF Info */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>PDF Document</span>
                {pdfData && (
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {(pdfData.byteLength / 1024).toFixed(1)}KB
                  </span>
                )}
              </div>
              
              {/* External Open Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const pdfUrl = `/api/documents/${document.id}/preview`;
                  window.open(pdfUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                <Eye className="w-3 h-3 mr-1" />
                Open External
              </Button>
            </div>
          </div>

          {/* Simple PDF Viewer - Using iframe with blob URL for reliability */}
          <div className="flex items-center justify-center p-4 bg-white min-h-96 max-h-[70vh] overflow-auto">
            {pdfData ? (
              <div className="w-full h-full">
                <iframe
                  src={URL.createObjectURL(new Blob([pdfData], { type: 'application/pdf' }))}
                  className="w-full h-[60vh] border border-gray-200 rounded"
                  title="PDF Preview"
                  onLoad={() => {
                    console.log('✅ Iframe onLoad event fired (PDF already displayed)');
                  }}
                  onError={() => {
                    console.error('❌ PDF iframe failed to load');
                    setError('PDF display failed. Please use "Open External" button.');
                    setIsLoading(false);
                  }}
                />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 text-gray-500 py-8">
                <AlertCircle className="w-12 h-12" />
                <div className="text-center">
                  <p className="text-sm font-medium">PDF Loading Failed</p>
                  <p className="text-xs text-gray-400 mt-1">{error}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setIsLoading(true);
                      setPdfData(null);
                      // Trigger retry by fetching PDF data again
                      console.log('Retrying PDF load for document:', document.id);
                      
                      const startTime = Date.now();
                      fetch(`/api/documents/${document.id}/preview`, { 
                        credentials: 'include',
                        headers: { 'Accept': 'application/pdf' }
                      })
                        .then(response => {
                          if (!response.ok) throw new Error(`HTTP ${response.status}`);
                          return response.blob();
                        })
                        .then(blob => blob.arrayBuffer())
                        .then(arrayBuffer => {
                          const totalTime = Date.now() - startTime;
                          console.log(`PDF retry successful in ${totalTime}ms`);
                          setPdfData(arrayBuffer);
                        })
                        .catch(err => {
                          console.error('PDF retry failed:', err);
                          setError(`Retry failed: ${err.message}`);
                          setIsLoading(false);
                        });
                    }}
                  >
                    Retry PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const pdfUrl = `/api/documents/${document.id}/preview`;
                      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Open in Browser
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-gray-600">Preparing PDF...</p>
                <p className="text-xs text-gray-500">Downloading document data</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Fallback for other file types
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-gray-600" />
          <span className="font-medium">Document Preview</span>
        </div>
        <div className="bg-white rounded border-2 border-dashed border-gray-300 h-96 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <FileText className="w-16 h-16 mx-auto mb-2 text-gray-400" />
            <p className="font-medium">Preview not available</p>
            <p className="text-sm">File type: {document.mimeType}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[98vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${category?.color || 'gray'}-100`}>
              {category?.icon ? (
                <i className={`${category.icon} text-${category.color || 'gray'}-600`}></i>
              ) : (
                <FileText className="w-5 h-5 text-gray-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-lg font-semibold"
                    placeholder="Document name"
                  />
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <Input
                        type="date"
                        value={editExpiryDate}
                        onChange={(e) => setEditExpiryDate(e.target.value)}
                        className="text-sm h-8 w-40"
                        placeholder="Expiry date"
                      />
                    </div>
                    <p className="text-sm text-gray-500">
                      {category?.name || "Uncategorized"} • {formatFileSize(document.fileSize)} • Uploaded {formatDate(document.uploadedAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold truncate">{document.name}</h2>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{category?.name || "Uncategorized"} • {formatFileSize(document.fileSize)} • Uploaded {formatDate(document.uploadedAt)}</span>
                    {document.expiryDate && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Expires {formatDate(document.expiryDate)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleSaveEdit} 
                  disabled={updateDocumentMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    {onDownload && (
                      <DropdownMenuItem onClick={onDownload}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleDelete}
                      className="text-red-600 focus:text-red-600"
                      disabled={deleteDocumentMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Preview Section */}
            <div className="lg:col-span-2">
              {renderPreview()}
            </div>

            {/* Document Details Section */}
            <div className="space-y-3">
              {/* File Information */}
              <Card>
                <CardContent className="p-3">
                  <h3 className="font-semibold mb-2 text-sm">File Information</h3>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">File name:</span>
                      <span className="truncate ml-2">{document.fileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">File size:</span>
                      <span>{formatFileSize(document.fileSize)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Type:</span>
                      <span>{document.mimeType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Uploaded:</span>
                      <span>{formatDate(document.uploadedAt)}</span>
                    </div>
                    {document.expiryDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Expires:</span>
                        <span>{formatDate(document.expiryDate)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Smart Preview Chips */}
              <SmartPreviewChips document={document} />

              {/* AI Summary */}
              {document.summary && (
                <Card>
                  <CardContent className="p-3">
                    <h3 className="font-semibold mb-2 text-sm">AI Summary</h3>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {document.summary}
                    </p>
                    <Badge variant="secondary" className="mt-2 text-xs">
                      AI Generated
                    </Badge>
                  </CardContent>
                </Card>
              )}

              {/* Extracted Text */}
              {/* Extracted text hidden to reduce clutter - content is available via AI summary above */}

              {/* Quick Actions */}
              <Card>
                <CardContent className="p-3">
                  <h3 className="font-semibold mb-2 text-sm">Quick Actions</h3>
                  <div className="space-y-1.5">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start"
                      onClick={() => {
                        if (isPDF()) {
                          console.log('Opening PDF for document ID:', document.id);
                          const pdfUrl = `/api/documents/${document.id}/preview`;
                          window.open(pdfUrl, '_blank', 'noopener,noreferrer');
                        } else if (isImage()) {
                          const imageUrl = `/api/documents/${document.id}/preview`;
                          window.open(imageUrl, '_blank', 'noopener,noreferrer');
                        } else {
                          // For other file types, download
                          const downloadUrl = `/api/documents/${document.id}/download`;
                          window.open(downloadUrl, '_blank', 'noopener,noreferrer');
                        }
                      }}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      {isPDF() ? 'Open PDF' : isImage() ? 'View Full Size' : 'Download File'}
                    </Button>
                    {onDownload && (
                      <Button variant="outline" size="sm" className="w-full justify-start" onClick={onDownload}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Original
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}