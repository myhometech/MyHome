import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ComponentErrorBoundary } from '@/components/error-boundary';
import { useToast } from '@/hooks/use-toast';
import { 
  ImageProcessor, 
  ProcessingOptions, 
  ProcessingResult, 
  DEFAULT_PROCESSING_OPTIONS 
} from '@/lib/image-processing';
import {
  RotateCcw,
  Crop, 
  Contrast,
  Sun,
  Palette,
  Zap,
  Filter,
  Settings,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';

interface ImageProcessingPanelProps {
  originalFile: File;
  onProcessed: (result: ProcessingResult) => void;
  onCancel: () => void;
  autoProcess?: boolean;
}

export function ImageProcessingPanel({ 
  originalFile, 
  onProcessed, 
  onCancel,
  autoProcess = true 
}: ImageProcessingPanelProps) {
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_PROCESSING_OPTIONS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string>('');
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const processorRef = useRef<ImageProcessor>(new ImageProcessor());
  const { toast } = useToast();

  useEffect(() => {
    // Set up original image preview
    const url = URL.createObjectURL(originalFile);
    setPreviewUrl(url);

    // Auto-process with default settings if enabled
    if (autoProcess) {
      processImage(DEFAULT_PROCESSING_OPTIONS);
    }

    return () => {
      URL.revokeObjectURL(url);
      if (processedPreviewUrl) {
        URL.revokeObjectURL(processedPreviewUrl);
      }
    };
  }, [originalFile, autoProcess]);

  const updateOption = <K extends keyof ProcessingOptions>(
    key: K, 
    value: ProcessingOptions[K]
  ) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const processImage = async (processingOptions?: ProcessingOptions) => {
    setIsProcessing(true);
    
    try {
      const opts = processingOptions || options;
      console.log('Processing image with options:', opts);
      
      const result = await processorRef.current.processImage(originalFile, opts);
      
      // Create preview URL for processed image
      const processedUrl = URL.createObjectURL(result.processedImage);
      setProcessedPreviewUrl(processedUrl);
      setProcessingResult(result);
      
      toast({
        title: "Image processed successfully",
        description: `Applied ${result.transformsApplied.length} enhancements in ${result.processingTime.toFixed(0)}ms`,
      });

    } catch (error: any) {
      console.error('Image processing failed:', error);
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process image",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (processingResult) {
      onProcessed(processingResult);
    } else {
      processImage();
    }
  };

  const resetToDefaults = () => {
    setOptions(DEFAULT_PROCESSING_OPTIONS);
    processImage(DEFAULT_PROCESSING_OPTIONS);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <ComponentErrorBoundary componentName="Image Processing Panel">
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <Card className="w-full max-w-[95vw] lg:max-w-[90vw] max-h-[90vh] overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                <CardTitle>Image Processing</CardTitle>
                {processingResult?.documentDetected && (
                  <Badge variant="secondary" className="text-xs">
                    Document Detected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <Settings className="w-4 h-4 mr-1" />
                  {showAdvanced ? 'Simple' : 'Advanced'}
                </Button>
                <Button variant="ghost" onClick={onCancel}>
                  ×
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Image Preview Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original Image */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Original</Label>
                <div className="relative bg-gray-100 rounded-lg overflow-hidden aspect-[4/3]">
                  <img
                    src={previewUrl}
                    alt="Original"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-xs">
                      {formatFileSize(originalFile.size)}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Processed Image */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Processed</Label>
                <div className="relative bg-gray-100 rounded-lg overflow-hidden aspect-[4/3]">
                  {isProcessing ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Processing...</p>
                      </div>
                    </div>
                  ) : processedPreviewUrl ? (
                    <>
                      <img
                        src={processedPreviewUrl}
                        alt="Processed"
                        className="w-full h-full object-contain"
                      />
                      {processingResult && (
                        <div className="absolute top-2 left-2 space-y-1">
                          <Badge variant="default" className="text-xs">
                            {formatFileSize(processingResult.processedSize)}
                          </Badge>
                          {processingResult.compressionRatio > 0 && (
                            <Badge variant="secondary" className="text-xs block">
                              -{processingResult.compressionRatio.toFixed(1)}% size
                            </Badge>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-sm">Processed image will appear here</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Processing Results */}
            {processingResult && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-sm">Processing Complete</span>
                  <Badge variant="outline" className="text-xs">
                    {processingResult.processingTime.toFixed(0)}ms
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Original Size</p>
                    <p className="font-medium">{formatFileSize(processingResult.originalSize)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Processed Size</p>
                    <p className="font-medium">{formatFileSize(processingResult.processedSize)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Compression</p>
                    <p className="font-medium">{processingResult.compressionRatio.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Rotation</p>
                    <p className="font-medium">{processingResult.rotationApplied?.toFixed(1) || 0}°</p>
                  </div>
                </div>

                {processingResult.transformsApplied.length > 0 && (
                  <div className="mt-3">
                    <p className="text-gray-600 text-sm mb-2">Applied Enhancements:</p>
                    <div className="flex flex-wrap gap-1">
                      {processingResult.transformsApplied.map((transform, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {transform}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Processing Options */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Processing Options</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefaults}
                  className="text-xs"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </div>

              {/* Basic Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Document Detection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Crop className="w-4 h-4" />
                      <Label htmlFor="detectEdges">Document Detection</Label>
                    </div>
                    <Switch
                      id="detectEdges"
                      checked={options.detectDocumentEdges}
                      onCheckedChange={(checked) => updateOption('detectDocumentEdges', checked)}
                    />
                  </div>
                  <p className="text-xs text-gray-600">
                    Automatically detect and crop document boundaries
                  </p>
                </div>

                {/* Auto Rotation */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-4 h-4" />
                      <Label htmlFor="autoRotate">Auto Rotation</Label>
                    </div>
                    <Switch
                      id="autoRotate"
                      checked={options.autoRotate}
                      onCheckedChange={(checked) => updateOption('autoRotate', checked)}
                    />
                  </div>
                  <p className="text-xs text-gray-600">
                    Correct document orientation automatically
                  </p>
                </div>

                {/* Auto Enhance */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      <Label htmlFor="autoEnhance">Auto Enhance</Label>
                    </div>
                    <Switch
                      id="autoEnhance"
                      checked={options.autoEnhanceContrast}
                      onCheckedChange={(checked) => updateOption('autoEnhanceContrast', checked)}
                    />
                  </div>
                  <p className="text-xs text-gray-600">
                    Automatically optimize contrast and brightness
                  </p>
                </div>

                {/* Grayscale */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      <Label htmlFor="grayscale">Grayscale</Label>
                    </div>
                    <Switch
                      id="grayscale"
                      checked={options.applyGrayscale}
                      onCheckedChange={(checked) => updateOption('applyGrayscale', checked)}
                    />
                  </div>
                  <p className="text-xs text-gray-600">
                    Convert to grayscale for better OCR accuracy
                  </p>
                </div>
              </div>

              {/* Advanced Options */}
              {showAdvanced && (
                <>
                  <Separator />
                  <div className="space-y-6">
                    <Label className="text-base font-medium">Advanced Settings</Label>
                    
                    {/* Contrast Adjustment */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Contrast className="w-4 h-4" />
                          <Label>Contrast: {options.contrastAdjustment}</Label>
                        </div>
                      </div>
                      <Slider
                        value={[options.contrastAdjustment]}
                        onValueChange={([value]) => updateOption('contrastAdjustment', value)}
                        min={-50}
                        max={50}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Brightness Adjustment */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sun className="w-4 h-4" />
                          <Label>Brightness: {options.brightnessAdjustment}</Label>
                        </div>
                      </div>
                      <Slider
                        value={[options.brightnessAdjustment]}
                        onValueChange={([value]) => updateOption('brightnessAdjustment', value)}
                        min={-50}
                        max={50}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Output Quality */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Filter className="w-4 h-4" />
                          <Label>Quality: {Math.round(options.outputQuality * 100)}%</Label>
                        </div>
                      </div>
                      <Slider
                        value={[options.outputQuality]}
                        onValueChange={([value]) => updateOption('outputQuality', value)}
                        min={0.1}
                        max={1.0}
                        step={0.1}
                        className="w-full"
                      />
                    </div>

                    {/* Additional Options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sharpen">Sharpen Image</Label>
                        <Switch
                          id="sharpen"
                          checked={options.sharpenImage}
                          onCheckedChange={(checked) => updateOption('sharpenImage', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="denoise">Reduce Noise</Label>
                        <Switch
                          id="denoise"
                          checked={options.reduceNoise}
                          onCheckedChange={(checked) => updateOption('reduceNoise', checked)}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => processImage()}
                  disabled={isProcessing}
                  size="sm"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  {isProcessing ? 'Processing...' : 'Preview'}
                </Button>
                
                {processingResult && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = processedPreviewUrl;
                      a.download = `processed_${originalFile.name}`;
                      a.click();
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleApply}
                  disabled={isProcessing || !processingResult}
                >
                  Apply & Upload
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ComponentErrorBoundary>
  );
}