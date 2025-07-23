import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Download, ZoomIn, ZoomOut, RotateCw, AlertCircle } from "lucide-react";

interface PDFViewerProps {
  documentId: number;
  documentName: string;
  onDownload?: () => void;
}

export function PDFViewer({ documentId, documentName, onDownload }: PDFViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pdfUrl = `/api/documents/${documentId}/preview`;

  useEffect(() => {
    // Test if PDF is accessible
    const testPdfAccess = async () => {
      try {
        console.log('Testing PDF access for URL:', pdfUrl);
        const response = await fetch(pdfUrl, { credentials: 'include' });
        console.log('PDF test response:', response.status, response.statusText);
        
        if (!response.ok) {
          if (response.status === 401) {
            setError('Authentication required - please log in again');
          } else {
            setError(`Failed to load PDF: ${response.status} ${response.statusText}`);
          }
        } else {
          console.log('PDF access test successful');
        }
      } catch (err) {
        console.error('PDF load error:', err);
        setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    };

    testPdfAccess();
  }, [pdfUrl]);

  const handleZoomIn = () => {
    setZoom(Math.min(3, zoom + 0.25));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(0.5, zoom - 0.25));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="flex flex-col items-center gap-4 text-gray-500">
          <AlertCircle className="w-12 h-12" />
          <div className="text-center">
            <p className="text-sm font-medium">PDF preview not available</p>
            <p className="text-xs text-gray-400 mt-1">{error}</p>
          </div>
          {onDownload && (
            <Button onClick={onDownload} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden">
      {/* PDF Viewer Controls */}
      <div className="flex items-center justify-between p-3 bg-gray-100 border-b">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-red-600" />
          <span className="text-sm text-gray-600 font-medium">PDF Viewer</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          
          <span className="text-xs text-gray-600 px-2 font-mono">
            {Math.round(zoom * 100)}%
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          
          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRotate}
            title="Rotate"
          >
            <RotateCw className="w-4 h-4" />
          </Button>
          
          {onDownload && (
            <>
              <div className="w-px h-4 bg-gray-300 mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onDownload}
                title="Download PDF"
              >
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* PDF Iframe Container */}
      <div className="relative bg-white">
        <div 
          className="w-full h-96 overflow-auto"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          <iframe
            src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`}
            title={`PDF: ${documentName}`}
            className="w-full h-full border-0"
            style={{
              minHeight: rotation % 180 === 0 ? '100%' : '150%',
              minWidth: rotation % 180 === 0 ? '100%' : '150%',
            }}
            onLoad={(e) => {
              console.log('PDF iframe loaded successfully');
              // Check if the iframe actually loaded content or an error page
              try {
                const iframe = e.target as HTMLIFrameElement;
                if (iframe.contentDocument) {
                  const title = iframe.contentDocument.title;
                  console.log('PDF iframe title:', title);
                  if (title && title.toLowerCase().includes('error')) {
                    setError('PDF failed to load in viewer');
                  }
                }
              } catch (err) {
                // Cross-origin restrictions, but that's normal for PDF display
                console.log('PDF loaded (cross-origin restrictions normal)');
              }
            }}
            onError={() => {
              console.error('PDF iframe load error');
              setError('Failed to display PDF in viewer');
            }}
          />
        </div>
      </div>

      {/* PDF Info Bar */}
      <div className="flex items-center justify-between p-2 bg-gray-50 border-t text-xs text-gray-500">
        <span>Use browser controls for additional navigation</span>
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          PDF Document
        </span>
      </div>
    </div>
  );
}