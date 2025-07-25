import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, FileText } from "lucide-react";

interface SimpleDocumentModalProps {
  document: {
    id: number;
    name: string;
    mimeType: string;
    fileSize: number;
  };
  onClose: () => void;
}

export function SimpleDocumentModal({ document, onClose }: SimpleDocumentModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = () => {
    window.open(`/api/documents/${document.id}/download`, '_blank');
  };

  const getPreviewContent = () => {
    if (error) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-50">
          <div className="text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium">Preview failed</p>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <Button onClick={handleDownload} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Download Instead
            </Button>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-50">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading document...</p>
          </div>
        </div>
      );
    }

    if (document.mimeType.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-50">
          <img
            src={`/api/documents/${document.id}/preview`}
            alt={document.name}
            className="max-w-full max-h-full object-contain"
            onLoad={() => setLoading(false)}
            onError={() => {
              setError('Failed to load image');
              setLoading(false);
            }}
          />
        </div>
      );
    }

    if (document.mimeType === 'application/pdf') {
      return (
        <div className="h-96 bg-gray-50">
          <iframe
            src={`/api/documents/${document.id}/preview`}
            className="w-full h-full border-0"
            title={document.name}
            onLoad={() => setLoading(false)}
            onError={() => {
              setError('Failed to load PDF');
              setLoading(false);
            }}
          />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-96 bg-gray-50">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium">Preview not available</p>
          <p className="text-sm text-gray-600 mb-4">File type: {document.mimeType}</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download File
          </Button>
        </div>
      </div>
    );
  };

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
            <Button onClick={handleDownload} variant="outline" size="sm">
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
          {getPreviewContent()}
        </div>
      </div>
    </div>
  );
}