import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CloudUpload, Camera, Plus, X, Upload } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useQuery } from "@tanstack/react-query";
import { CameraScanner } from "./camera-scanner";

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadData, setUploadData] = useState({
    categoryId: "",
    tags: "",
    expiryDate: "",
    customName: "",
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, data }: { file: File; data: any }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", data.customName || data.name || file.name);
      if (data.categoryId) formData.append("categoryId", data.categoryId);
      if (data.tags) formData.append("tags", JSON.stringify(data.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)));
      if (data.expiryDate) formData.append("expiryDate", data.expiryDate);

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Upload failed");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Upload successful",
        description: "Your document has been uploaded and organized.",
      });
      onUpload(selectedFiles);
      setSelectedFiles([]);
      setShowUploadDialog(false);
      setUploadData({ categoryId: "", tags: "", expiryDate: "", customName: "" });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Upload failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (files: File[]) => {
    const validFiles = files.filter(file => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a supported file type.`,
          variant: "destructive",
        });
        return false;
      }
      
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB.`,
          variant: "destructive",
        });
        return false;
      }
      
      return true;
    });

    if (validFiles.length > 0) {
      // Process images with document edge detection
      const processedFiles = await Promise.all(
        validFiles.map(async (file) => {
          if (file.type.startsWith('image/')) {
            return await processImageWithDocumentDetection(file);
          }
          return file;
        })
      );
      
      setSelectedFiles(processedFiles);
      setShowUploadDialog(true);
    }
  };

  // Process captured image with document detection
  const processImageWithDocumentDetection = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        if (!ctx) {
          resolve(file);
          return;
        }

        // Set canvas size to image size
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Apply document detection and cropping
        const enhancedCanvas = enhanceDocumentImage(canvas);

        // Convert back to file
        enhancedCanvas.toBlob((blob) => {
          if (blob) {
            const processedFile = new File([blob], `processed_${file.name}`, { 
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(processedFile);
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.95);
      };

      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  // Document enhancement function (same as camera scanner)
  const enhanceDocumentImage = (sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const sourceCtx = sourceCanvas.getContext('2d');
    if (!sourceCtx) return sourceCanvas;

    // Step 1: Detect document boundaries
    const documentBounds = detectDocumentEdges(sourceCanvas);
    
    // Step 2: Crop to document area
    const croppedCanvas = cropToDocument(sourceCanvas, documentBounds);
    
    // Step 3: Enhance the cropped document for OCR
    const enhancedCanvas = enhanceForOCR(croppedCanvas);
    
    return enhancedCanvas;
  };

  // Detect document edges using edge detection
  const detectDocumentEdges = (canvas: HTMLCanvasElement): { x: number, y: number, width: number, height: number } => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { x: 0, y: 0, width: canvas.width, height: canvas.height };

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    // Convert to grayscale
    const grayData = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayData[i / 4] = gray;
    }

    // Apply edge detection
    const edges = applySobelEdgeDetection(grayData, width, height);
    const bounds = findLargestRectangle(edges, width, height);
    
    return bounds;
  };

  // Sobel edge detection
  const applySobelEdgeDetection = (data: Uint8Array, width: number, height: number): Uint8Array => {
    const result = new Uint8Array(data.length);
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += data[idx] * sobelX[kernelIdx];
            gy += data[idx] * sobelY[kernelIdx];
          }
        }
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        result[y * width + x] = Math.min(255, magnitude);
      }
    }
    return result;
  };

  // Find largest rectangle contour
  const findLargestRectangle = (edges: Uint8Array, width: number, height: number): { x: number, y: number, width: number, height: number } => {
    const threshold = 50;
    const binary = edges.map(pixel => pixel > threshold ? 255 : 0);

    let minX = width, maxX = 0, minY = height, maxY = 0;
    let hasEdges = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (binary[y * width + x] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          hasEdges = true;
        }
      }
    }

    // Fallback to center 80% if no clear document edges
    if (!hasEdges || (maxX - minX) < width * 0.3 || (maxY - minY) < height * 0.3) {
      const margin = 0.1;
      return {
        x: Math.floor(width * margin),
        y: Math.floor(height * margin),
        width: Math.floor(width * (1 - 2 * margin)),
        height: Math.floor(height * (1 - 2 * margin))
      };
    }

    const margin = 10;
    return {
      x: Math.max(0, minX - margin),
      y: Math.max(0, minY - margin),
      width: Math.min(width - (minX - margin), maxX - minX + 2 * margin),
      height: Math.min(height - (minY - margin), maxY - minY + 2 * margin)
    };
  };

  // Crop to document area
  const cropToDocument = (sourceCanvas: HTMLCanvasElement, bounds: { x: number, y: number, width: number, height: number }): HTMLCanvasElement => {
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = bounds.width;
    croppedCanvas.height = bounds.height;
    
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return sourceCanvas;

    croppedCtx.drawImage(
      sourceCanvas,
      bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, bounds.width, bounds.height
    );

    return croppedCanvas;
  };

  // Enhance for OCR
  const enhanceForOCR = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const contrast = 1.4;
    const brightness = 20;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, contrast * (data[i] - 128) + 128 + brightness));
      data[i + 1] = Math.min(255, Math.max(0, contrast * (data[i + 1] - 128) + 128 + brightness));
      data[i + 2] = Math.min(255, Math.max(0, contrast * (data[i + 2] - 128) + 128 + brightness));
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFileSelect(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    handleFileSelect(files);
  };

  const handleCameraCapture = (file: File) => {
    setSelectedFiles([file]);
    setShowUploadDialog(true);
    setShowCameraScanner(false);
  };

  const openCameraScanner = () => {
    setShowCameraScanner(true);
  };

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.setAttribute('accept', 'application/pdf,image/*');
      fileInputRef.current.click();
    }
  };

  const handleCameraUpload = () => {
    if (fileInputRef.current) {
      // For mobile devices, use camera capture via file input as fallback
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.setAttribute('accept', 'image/*');
      fileInputRef.current.click();
    }
  };

  const handleUpload = async () => {
    for (const file of selectedFiles) {
      await uploadMutation.mutateAsync({ 
        file, 
        data: {
          ...uploadData,
          name: file.name,
        }
      });
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(files => files.filter((_, i) => i !== index));
  };

  return (
    <>
      <div className="mb-8" data-upload-zone>
        <Card 
          className={`border-2 border-dashed transition-colors ${
            isDragOver 
              ? "border-primary bg-blue-50" 
              : "border-gray-300 hover:border-primary"
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
        >
          <CardContent className="p-4 md:p-8 text-center">
            <div className="max-w-md mx-auto">
              <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Upload Documents</h3>
              <p className="text-gray-500 text-sm mb-6">
                Drag and drop files here, or click to select
              </p>
              <div className="flex flex-col gap-3 justify-center">
                <Button 
                  onClick={handleFileUpload}
                  className="bg-primary hover:bg-blue-700 w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Choose Files
                </Button>
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Primary camera button for mobile - works on iPhone */}
                  <Button 
                    variant="outline"
                    onClick={handleCameraUpload}
                    className="border-primary text-primary hover:bg-blue-50 w-full sm:w-auto order-1 sm:order-2"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    📱 Scan with Camera
                  </Button>
                  
                  {/* Advanced scanner for desktop */}
                  <Button 
                    variant="outline"
                    onClick={openCameraScanner}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50 w-full sm:w-auto order-2 sm:order-1"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Advanced Scanner
                  </Button>
                </div>
                
                {/* Mobile help text */}
                <p className="text-xs text-gray-400 sm:hidden mt-2">
                  📄 Document edges automatically detected and cropped
                </p>
              </div>
              {/* Mobile help text */}
              <p className="text-xs text-gray-400 sm:hidden mt-3">
                💡 "Scan with Camera" opens your phone's camera app
              </p>
              
              <p className="text-xs text-gray-500 mt-4">
                Supports PDF, JPG, PNG up to 10MB
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
        accept="application/pdf,image/*"
      />

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto mx-2">
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* File List */}
            <div className="space-y-2">
              <Label>Selected Files</Label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Document Title */}
            <div className="space-y-2">
              <Label htmlFor="customName">Document Title (Optional)</Label>
              <Input
                id="customName"
                placeholder="Enter a custom title for your document"
                value={uploadData.customName}
                onChange={(e) => setUploadData(prev => ({ ...prev, customName: e.target.value }))}
              />
              <p className="text-xs text-gray-500">
                Leave blank to use the original filename
              </p>
            </div>

            {/* Category Selection */}
            <div className="space-y-2">
              <Label htmlFor="category">Category (Optional)</Label>
              <Select value={uploadData.categoryId} onValueChange={(value) => setUploadData(prev => ({ ...prev, categoryId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (Optional)</Label>
              <Input
                id="tags"
                placeholder="Enter tags separated by commas"
                value={uploadData.tags}
                onChange={(e) => setUploadData(prev => ({ ...prev, tags: e.target.value }))}
              />
            </div>

            {/* Expiry Date */}
            <div className="space-y-2">
              <Label htmlFor="expiryDate">Expiry Date (Optional)</Label>
              <Input
                id="expiryDate"
                type="date"
                value={uploadData.expiryDate}
                onChange={(e) => setUploadData(prev => ({ ...prev, expiryDate: e.target.value }))}
              />
            </div>

            {/* Upload Button */}
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setShowUploadDialog(false)}
                disabled={uploadMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || uploadMutation.isPending}
                className="bg-primary hover:bg-blue-700"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Upload className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Scanner */}
      <CameraScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onCapture={handleCameraCapture}
      />
    </>
  );
}
