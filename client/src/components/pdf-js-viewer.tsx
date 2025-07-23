import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, AlertCircle, Eye } from "lucide-react";

interface PDFJSViewerProps {
  documentId: number;
  documentName: string;
  onDownload?: () => void;
}

export function PDFJSViewer({ documentId, documentName, onDownload }: PDFJSViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pdfUrl = `/api/documents/${documentId}/preview`;

  useEffect(() => {
    loadPDF();
  }, [pdfUrl]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(pageNumber);
    }
  }, [pdfDoc, pageNumber, scale]);

  const loadPDF = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Starting PDF load from:', pdfUrl);
      
      // Test if the PDF URL is accessible first
      const testResponse = await fetch(pdfUrl, { 
        credentials: 'include',
        method: 'HEAD'
      });
      
      if (!testResponse.ok) {
        throw new Error(`PDF not accessible: ${testResponse.status} ${testResponse.statusText}`);
      }
      
      const contentType = testResponse.headers.get('content-type');
      if (!contentType?.includes('application/pdf')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }
      
      console.log('PDF URL verified, loading with PDF.js...');
      
      // Dynamic import of PDF.js to avoid SSR issues
      const pdfjsLib = await import('pdfjs-dist');
      
      // Set worker path - use local worker if available
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      // First fetch the PDF as a blob to handle authentication properly
      const response = await fetch(pdfUrl, {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
      }
      
      const pdfBlob = await response.blob();
      const pdfUrl_local = URL.createObjectURL(pdfBlob);
      
      // Load PDF from blob
      const loadingTask = pdfjsLib.getDocument(pdfUrl_local);
      
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setPageNumber(1);
      
      console.log('PDF loaded successfully, pages:', pdf.numPages);
      setIsLoading(false);
    } catch (err) {
      console.error('PDF loading error:', err);
      setError(`Failed to load PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;
      console.log('Page rendered:', pageNum);
    } catch (err) {
      console.error('Page rendering error:', err);
      setError('Failed to render PDF page');
    }
  };

  const goToPreviousPage = () => {
    if (pageNumber > 1) {
      setPageNumber(pageNumber - 1);
    }
  };

  const goToNextPage = () => {
    if (pageNumber < numPages) {
      setPageNumber(pageNumber + 1);
    }
  };

  const zoomIn = () => {
    setScale(Math.min(3, scale + 0.2));
  };

  const zoomOut = () => {
    setScale(Math.max(0.5, scale - 0.2));
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
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center justify-between p-3 bg-gray-100 border-b rounded-t-lg">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-600" />
            <span className="text-sm text-gray-600 font-medium">PDF Viewer - Error</span>
          </div>
        </div>
        
        <div className="flex flex-col items-center gap-4 text-gray-500 py-8">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <div className="text-center">
            <p className="text-sm font-medium">Could not display PDF inline</p>
            <p className="text-xs text-gray-400 mt-1 max-w-md">{error}</p>
          </div>
          
          <div className="flex gap-3">
            <a 
              href={pdfUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              <Eye className="w-4 h-4 mr-2" />
              View PDF in New Tab
            </a>
            {onDownload && (
              <button
                onClick={onDownload}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </button>
            )}
          </div>
          
          <div className="text-center mt-4">
            <p className="text-xs text-gray-400">
              Some browsers block inline PDF viewing for security. 
              <br />Use the buttons above to view or download the PDF.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden">
      {/* PDF Controls */}
      <div className="flex items-center justify-between p-3 bg-gray-100 border-b">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-red-600" />
          <span className="text-sm text-gray-600 font-medium">PDF Viewer</span>
        </div>
        
        <div className="flex items-center gap-1">
          {/* Page Navigation */}
          <Button
            variant="ghost"
            size="sm"
            onClick={goToPreviousPage}
            disabled={pageNumber <= 1}
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <span className="text-xs text-gray-600 px-2 font-mono">
            {pageNumber} / {numPages}
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          
          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          {/* Zoom Controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          
          <span className="text-xs text-gray-600 px-2 font-mono">
            {Math.round(scale * 100)}%
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomIn}
            disabled={scale >= 3}
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
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

      {/* PDF Canvas */}
      <div className="p-4 bg-white flex justify-center overflow-auto max-h-96">
        <div className="relative">
          <canvas 
            ref={canvasRef}
            className="border shadow-sm max-w-full"
            style={{ 
              display: canvasRef.current?.width ? 'block' : 'none',
              maxWidth: '100%',
              height: 'auto'
            }}
          />
          {!canvasRef.current?.width && !isLoading && !error && (
            <div className="flex items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded">
              <p className="text-gray-500">Rendering PDF page...</p>
            </div>
          )}
        </div>
      </div>

      {/* PDF Info */}
      <div className="flex items-center justify-between p-2 bg-gray-50 border-t text-xs text-gray-500">
        <span>PDF.js Viewer</span>
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {documentName}
        </span>
      </div>
    </div>
  );
}