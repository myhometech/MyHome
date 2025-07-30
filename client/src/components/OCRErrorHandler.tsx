import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  AlertTriangle, 
  Camera, 
  RotateCcw, 
  Upload, 
  FileImage,
  Brain,
  Clock
} from 'lucide-react';

interface OCRErrorHandlerProps {
  error: string | null;
  documentName?: string;
  onRetryUpload?: () => void;
  onRetryCapture?: () => void;
  isProcessing?: boolean;
}

export function OCRErrorHandler({ 
  error, 
  documentName, 
  onRetryUpload, 
  onRetryCapture,
  isProcessing 
}: OCRErrorHandlerProps) {
  if (!error && !isProcessing) return null;

  // ANDROID-303: Map error types to user-friendly messages
  const getErrorMessage = (errorType: string) => {
    switch (errorType) {
      case 'OCR_NO_TEXT_DETECTED':
        return {
          title: "No readable text found",
          message: "We couldn't extract readable text. Try a clearer photo with better lighting and ensure the document is fully visible.",
          suggestion: "Make sure the text is clear and the document is well-lit",
          icon: <FileImage className="h-5 w-5 text-orange-500" />,
          showRetryCapture: true,
          showRetryUpload: true
        };
      
      case 'OCR_LOW_CONFIDENCE':
        return {
          title: "Poor text quality detected",
          message: "Text was detected but the quality is too low for reliable processing. Try retaking the photo with better focus and lighting.",
          suggestion: "Ensure the document is flat, well-lit, and in focus",
          icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
          showRetryCapture: true,
          showRetryUpload: true
        };
      
      case 'OCR_PROCESSING_FAILED':
        return {
          title: "Processing failed",
          message: "We encountered an error while processing your document. This might be a temporary issue.",
          suggestion: "Try uploading again or contact support if the problem persists",
          icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
          showRetryCapture: false,
          showRetryUpload: true
        };
      
      case 'INSIGHT_GENERATION_FAILED':
        return {
          title: "AI insights unavailable",
          message: "No insights detected for this document, but the file was uploaded successfully.",
          suggestion: "The document is saved and you can view it in your library",
          icon: <Brain className="h-5 w-5 text-blue-500" />,
          showRetryCapture: false,
          showRetryUpload: false
        };
      
      default:
        return {
          title: "Processing issue",
          message: "We encountered an issue processing your document. The file may still be uploaded successfully.",
          suggestion: "Check your document library or try uploading again",
          icon: <AlertTriangle className="h-5 w-5 text-gray-500" />,
          showRetryCapture: true,
          showRetryUpload: true
        };
    }
  };

  // Show processing state
  if (isProcessing) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <Clock className="h-5 w-5 text-blue-500 animate-spin" />
            <div>
              <h4 className="font-medium text-blue-900">Processing document</h4>
              <p className="text-sm text-blue-700">
                Extracting text and generating AI insights...
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const errorInfo = getErrorMessage(error || '');

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardContent className="p-4">
        <Alert className="border-none bg-transparent p-0">
          <div className="flex items-start space-x-3">
            {errorInfo.icon}
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-1">
                {errorInfo.title}
              </h4>
              <AlertDescription className="text-gray-700 mb-2">
                {errorInfo.message}
              </AlertDescription>
              <p className="text-xs text-gray-600 mb-3">
                💡 {errorInfo.suggestion}
              </p>
              
              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {errorInfo.showRetryCapture && onRetryCapture && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={onRetryCapture}
                    className="text-xs"
                  >
                    <Camera className="h-3 w-3 mr-1" />
                    Retake Photo
                  </Button>
                )}
                
                {errorInfo.showRetryUpload && onRetryUpload && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={onRetryUpload}
                    className="text-xs"
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Try Again
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Alert>
      </CardContent>
    </Card>
  );
}

// Hook for handling OCR errors in components
export function useOCRErrorHandler() {
  const [ocrError, setOCRError] = React.useState<string | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleOCRError = (error: string) => {
    setOCRError(error);
    setIsProcessing(false);
    
    // Log error for analytics (ANDROID-303 requirement)
    console.log(`📊 OCR Error Analytics: ${error}`);
  };

  const startProcessing = () => {
    setOCRError(null);
    setIsProcessing(true);
  };

  const clearError = () => {
    setOCRError(null);
    setIsProcessing(false);
  };

  return {
    ocrError,
    isProcessing,
    handleOCRError,
    startProcessing,
    clearError
  };
}