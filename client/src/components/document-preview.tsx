import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { X, Download, FileText, Image as ImageIcon, AlertCircle, Eye, ZoomIn, ZoomOut } from "lucide-react";

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
}

export function DocumentPreview({ document, category, onClose, onDownload }: DocumentPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    // For image documents, test if the preview URL is accessible
    if (isImage()) {
      fetch(getPreviewUrl(), { credentials: 'include' })
        .then(response => {
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
    } else {
      // For PDFs and other files, just stop loading immediately
      setIsLoading(false);
    }
  }, []);

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
    return document.mimeType === 'application/pdf';
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
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-2 bg-gray-100">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-600" />
              <span className="text-sm text-gray-600">PDF Document</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                PDF
              </Badge>
            </div>
          </div>
          <div className="p-4">
            <div className="bg-white rounded border-2 border-dashed border-gray-300 h-96 flex items-center justify-center">
              <div className="text-center text-gray-500 max-w-xs">
                <FileText className="w-20 h-20 mx-auto mb-4 text-red-400" />
                <p className="font-medium text-lg mb-2">PDF Preview</p>
                <p className="text-sm text-gray-600 mb-4">
                  PDF preview is not yet supported. Use the download button to view the full document.
                </p>
                {onDownload && (
                  <Button onClick={onDownload} variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                )}
              </div>
            </div>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${category?.color || 'gray'}-100`}>
              {category?.icon ? (
                <i className={`${category.icon} text-${category.color || 'gray'}-600`}></i>
              ) : (
                <FileText className="w-5 h-5 text-gray-600" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold truncate">{document.name}</h2>
              <p className="text-sm text-gray-500">{category?.name || "Uncategorized"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDownload && (
              <Button variant="outline" size="sm" onClick={onDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Preview Section */}
            <div className="lg:col-span-2">
              {renderPreview()}
            </div>

            {/* Document Details Section */}
            <div className="space-y-4">
              {/* File Information */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">File Information</h3>
                  <div className="space-y-2 text-sm">
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

              {/* AI Summary */}
              {document.summary && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">AI Summary</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
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
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Quick Actions</h3>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Eye className="w-4 h-4 mr-2" />
                      View Full Size
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