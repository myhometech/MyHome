import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, Lightbulb, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OCRRetryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  documentName: string;
  currentOcrText?: string;
  currentConfidence?: number;
}

interface OCRResult {
  text: string;
  confidence: number;
  strategy: string;
  preprocessingApplied: string[];
}

interface OCRTip {
  tip: string;
  type: 'info' | 'warning' | 'success';
}

export default function OCRRetryDialog({
  isOpen,
  onClose,
  documentId,
  documentName,
  currentOcrText = '',
  currentConfidence = 0
}: OCRRetryDialogProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<string[]>([]);
  const [retryResults, setRetryResults] = useState<OCRResult | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  const analyzeDocument = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/analyze-for-ocr`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysisResults(data.tips || []);
      
      toast({
        title: "Analysis Complete",
        description: `Found ${data.tips?.length || 0} improvement suggestions`,
      });

    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: "Unable to analyze document for OCR improvements",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const retryOCR = async () => {
    setIsRetrying(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/retry-ocr`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('OCR retry failed');
      }

      const data = await response.json();
      setRetryResults(data.result);
      setAnalysisResults(data.tips || []);
      setShowComparison(true);
      
      const confidenceImproved = data.result.confidence > currentConfidence;
      const hasMoreText = data.result.text.length > currentOcrText.length;
      
      toast({
        title: confidenceImproved || hasMoreText ? "OCR Improved!" : "OCR Retry Complete",
        description: `New confidence: ${data.result.confidence}% (was ${currentConfidence}%)`,
        variant: confidenceImproved || hasMoreText ? "default" : "destructive",
      });

    } catch (error) {
      toast({
        title: "OCR Retry Failed",
        description: "Unable to retry OCR with enhanced strategies",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const formatTipIcon = (tip: string) => {
    if (tip.includes('💡') || tip.includes('too dark')) return '💡';
    if (tip.includes('☀️') || tip.includes('too bright')) return '☀️';
    if (tip.includes('📐') || tip.includes('resolution')) return '📐';
    if (tip.includes('📊') || tip.includes('contrast')) return '📊';
    if (tip.includes('📷') || tip.includes('blur')) return '📷';
    if (tip.includes('✨') || tip.includes('good')) return '✨';
    if (tip.includes('🔄') || tip.includes('segments')) return '🔄';
    return '💡';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-100 text-green-800';
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Improve OCR for "{documentName}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Status */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium">Current OCR Status</p>
              <p className="text-xs text-gray-600">
                {currentOcrText ? `${currentOcrText.length} characters extracted` : 'No text extracted'}
              </p>
            </div>
            <Badge className={getConfidenceColor(currentConfidence)}>
              {currentConfidence}% confidence
            </Badge>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={analyzeDocument}
              disabled={isAnalyzing || isRetrying}
              variant="outline"
              className="flex-1"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lightbulb className="h-4 w-4 mr-2" />
              )}
              Analyze & Get Tips
            </Button>
            
            <Button
              onClick={retryOCR}
              disabled={isAnalyzing || isRetrying}
              className="flex-1"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Retry with Enhanced OCR
            </Button>
          </div>

          {/* Analysis Results */}
          {analysisResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Improvement Suggestions</h3>
              {analysisResults.map((tip, index) => (
                <Alert key={index}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg" role="img" aria-label="tip icon">
                      {formatTipIcon(tip)}
                    </span>
                    <AlertDescription className="text-sm">
                      {tip.replace(/[💡☀️📐📊📷✨🔄]/g, '').trim()}
                    </AlertDescription>
                  </div>
                </Alert>
              ))}
            </div>
          )}

          {/* OCR Comparison Results */}
          {showComparison && retryResults && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">OCR Results Comparison</h3>
              
              {/* Strategy Info */}
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <div className="text-sm">
                  <span className="font-medium">Best Strategy:</span> {retryResults.strategy}
                  <br />
                  <span className="font-medium">Processing:</span> {retryResults.preprocessingApplied.join(', ')}
                </div>
              </div>

              {/* Results Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Original</h4>
                    <Badge className={getConfidenceColor(currentConfidence)}>
                      {currentConfidence}%
                    </Badge>
                  </div>
                  <div className="text-xs bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                    {currentOcrText || 'No text extracted'}
                  </div>
                </div>

                {/* Enhanced */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Enhanced</h4>
                    <Badge className={getConfidenceColor(retryResults.confidence)}>
                      {retryResults.confidence}%
                    </Badge>
                  </div>
                  <div className="text-xs bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                    {retryResults.text || 'No text extracted'}
                  </div>
                </div>
              </div>

              {/* Improvement Indicator */}
              <div className="flex items-center gap-2 p-3 rounded-lg" 
                   style={{
                     backgroundColor: retryResults.confidence > currentConfidence ? '#f0f9ff' : '#fef2f2'
                   }}>
                {retryResults.confidence > currentConfidence ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="text-sm">
                  {retryResults.confidence > currentConfidence
                    ? `Confidence improved by ${retryResults.confidence - currentConfidence}%`
                    : retryResults.confidence === currentConfidence
                    ? 'Same confidence level achieved'
                    : `Confidence decreased by ${currentConfidence - retryResults.confidence}%`
                  }
                </span>
              </div>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-4">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}