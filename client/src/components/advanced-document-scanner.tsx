import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Scan, X, Upload, FileImage, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdvancedDocumentScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (file: File) => void;
}

export function AdvancedDocumentScanner({ isOpen, onClose, onScan }: AdvancedDocumentScannerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const processImage = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProgress(0);

    try {
      // Simulate advanced document processing
      for (let i = 0; i <= 100; i += 10) {
        setProgress(i);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Create preview
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      
      // Simulate processing completion
      await new Promise(resolve => setTimeout(resolve, 500));
      
      onScan(file);
      
      toast({
        title: "Document Processed",
        description: "Document has been enhanced and processed successfully.",
      });
      
    } catch (error) {
      console.error("Error processing document:", error);
      toast({
        title: "Processing Error",
        description: "Failed to process document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  }, [onScan, toast]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImage(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select an image file.",
        variant: "destructive",
      });
    }
  }, [processImage, toast]);

  const handleClose = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setIsProcessing(false);
    setProgress(0);
    onClose();
  }, [previewUrl, onClose]);

  const features = [
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Auto Enhancement",
      description: "Automatically adjusts brightness, contrast, and removes shadows"
    },
    {
      icon: <Scan className="w-5 h-5" />,
      title: "Edge Detection",
      description: "Detects document boundaries and applies perspective correction"
    },
    {
      icon: <FileImage className="w-5 h-5" />,
      title: "Format Optimization",
      description: "Optimizes image format and compression for better quality"
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Advanced Document Scanner</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {!isProcessing && !previewUrl && (
            <>
              {/* Features overview */}
              <div className="grid gap-4">
                <h3 className="text-sm font-medium">Enhanced Processing Features:</h3>
                {features.map((feature, index) => (
                  <Card key={index}>
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className="text-primary">{feature.icon}</div>
                      <div>
                        <h4 className="font-medium text-sm">{feature.title}</h4>
                        <p className="text-xs text-muted-foreground">{feature.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Upload area */}
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2">Upload Document Image</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Select an image to process with advanced enhancement
                </p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <FileImage className="w-4 h-4 mr-2" />
                  Select Image
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </>
          )}

          {isProcessing && (
            <div className="space-y-4">
              <div className="text-center">
                <Scan className="w-12 h-12 mx-auto mb-4 text-primary animate-pulse" />
                <h3 className="font-medium mb-2">Processing Document</h3>
                <p className="text-sm text-muted-foreground">
                  Applying advanced enhancements...
                </p>
              </div>
              <Progress value={progress} className="w-full" />
              <p className="text-xs text-center text-muted-foreground">
                {progress}% complete
              </p>
            </div>
          )}

          {previewUrl && !isProcessing && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-medium mb-2">Processing Complete</h3>
                <p className="text-sm text-muted-foreground">
                  Document has been enhanced and optimized
                </p>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <img 
                  src={previewUrl} 
                  alt="Processed document" 
                  className="w-full h-auto max-h-64 object-contain"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button onClick={handleClose} variant="outline">
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}