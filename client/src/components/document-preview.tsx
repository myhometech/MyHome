import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, FileText } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface DocumentPreviewProps {
  document: {
    id: number;
    name: string;
    mimeType: string;
    fileSize: number;
  };
  category?: {
    id: number;
    name: string;
    icon: string;
    color: string;
  };
  onClose: () => void;
  onDownload: () => void;
  onUpdate?: () => void;
}

export function DocumentPreview({ document, category, onClose, onDownload, onUpdate }: DocumentPreviewProps) {
  console.log('DocumentPreview rendering for document:', document.id, document.mimeType.startsWith('image/') ? 'Image' : document.mimeType);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper functions
  const isImage = () => document.mimeType.startsWith('image/');
  const isPDF = () => document.mimeType === 'application/pdf';
  const isDocx = () => document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                      document.mimeType === 'application/vnd.ms-word.document.macroEnabled.12' ||
                      document.mimeType === 'application/msword';
  const getPreviewUrl = () => `/api/documents/${document.id}/preview`;

  // Initialize loading state
  useEffect(() => {
    console.log('🔄 DocumentPreview: Starting document load for:', document.id);
    
    const safetyTimeout = setTimeout(() => {
      console.warn('⚠️ DocumentPreview safety timeout - forcing loading to complete');
      setIsLoading(false);
      if (!error) {
        setError('Document loading took too long. Please try again.');
      }
    }, 5000);
    
    // For images, preload to ensure they work
    if (isImage()) {
      console.log('📸 Preloading image...');
      const img = new Image();
      img.onload = () => {
        console.log('✅ Image preloaded successfully');
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      };
      img.onerror = () => {
        console.error('❌ Image failed to preload');
        setError('Failed to load image');
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      };
      img.src = getPreviewUrl();
    } else {
      // For non-images, just stop loading immediately
      console.log('📄 Non-image document, stopping loading');
      setIsLoading(false);
      clearTimeout(safetyTimeout);
    }
    
    return () => {
      clearTimeout(safetyTimeout);
    };
  }, [document.id, error]);

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

          {!isLoading && !error && isDocx() && (
            <div className="flex items-center justify-center h-96 bg-blue-50">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-blue-600" />
                </div>
                <p className="text-lg font-medium text-gray-900">DOCX Document</p>
                <p className="text-sm text-gray-600 mb-4">
                  Word document processed and ready for AI insights
                </p>
                <div className="space-y-2">
                  <Button onClick={onDownload} variant="outline" className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Download Original DOCX
                  </Button>
                  <p className="text-xs text-gray-500">
                    Text extracted for analysis and insights generation
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isLoading && !error && !isImage() && !isPDF() && !isDocx() && (
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
}