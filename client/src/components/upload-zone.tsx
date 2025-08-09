import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CloudUpload, Camera, Plus, X, Upload, Check } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { CameraScanner } from "./camera-scanner";
import { AdvancedDocumentScanner } from "./advanced-document-scanner";
import { useFeatures } from "@/hooks/useFeatures";

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [showAdvancedScanner, setShowAdvancedScanner] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadData, setUploadData] = useState({
    categoryId: "",
    tags: "",
    expiryDate: "",
    customName: "",
  });

  const [categorySuggestion, setCategorySuggestion] = useState<{
    suggested: string;
    confidence: number;
    reason: string;
    isVisible: boolean;
  } | null>(null);

  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryData, setNewCategoryData] = useState({
    name: "",
    icon: "fas fa-folder",
    color: "blue"
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  // Available icons for category creation
  const availableIcons = [
    { icon: "fas fa-home", label: "Home" },
    { icon: "fas fa-building", label: "Building" },
    { icon: "fas fa-car", label: "Car" },
    { icon: "fas fa-bolt", label: "Utilities" },
    { icon: "fas fa-shield-alt", label: "Insurance" },
    { icon: "fas fa-calculator", label: "Taxes" },
    { icon: "fas fa-tools", label: "Maintenance" },
    { icon: "fas fa-file-contract", label: "Legal" },
    { icon: "fas fa-certificate", label: "Warranty" },
    { icon: "fas fa-receipt", label: "Receipts" },
    { icon: "fas fa-folder", label: "Folder" },
    { icon: "fas fa-key", label: "Keys" },
    { icon: "fas fa-wifi", label: "Internet" },
    { icon: "fas fa-phone", label: "Phone" },
    { icon: "fas fa-medkit", label: "Medical" },
    { icon: "fas fa-graduation-cap", label: "Education" },
  ];

  const availableColors = [
    { color: "blue", label: "Blue" },
    { color: "green", label: "Green" },
    { color: "purple", label: "Purple" },
    { color: "orange", label: "Orange" },
    { color: "teal", label: "Teal" },
    { color: "indigo", label: "Indigo" },
    { color: "yellow", label: "Yellow" },
    { color: "red", label: "Red" },
    { color: "pink", label: "Pink" },
    { color: "gray", label: "Gray" },
  ];



  const { hasFeature, features } = useFeatures();
  const isFree = !features.BULK_OPERATIONS; // Simple check for free tier

  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; icon: string; color: string }) => {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create category");
      }

      return response.json();
    },
    onSuccess: (newCategory) => {
      // Invalidate categories cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      
      // Auto-select the newly created category
      setUploadData(prev => ({ ...prev, categoryId: newCategory.id.toString() }));
      
      // Reset form and close dialog
      setNewCategoryData({ name: "", icon: "fas fa-folder", color: "blue" });
      setShowCreateCategory(false);
      
      toast({
        title: "Category created",
        description: `"${newCategory.name}" category has been created and selected.`,
      });
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
        title: "Failed to create category",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
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
      setCategorySuggestion(null);
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
    // Note: Document limit checking for free users will be handled server-side during upload
    // This removes the need for client-side document statistics API calls

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
      
      // Get AI category suggestion for the first file
      if (processedFiles.length > 0) {
        await getSuggestionForFile(processedFiles[0]);
      }
      
      setShowUploadDialog(true);
    }
  };

  // Get AI category suggestion for uploaded file
  const getSuggestionForFile = async (file: File) => {
    try {
      const response = await fetch("/api/documents/suggest-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          ocrText: "" // TODO: Add OCR text if available
        })
      });

      if (response.ok) {
        const result = await response.json();
        const suggestedCategory = categories.find(cat => cat.name === result.suggested.category);
        
        if (suggestedCategory) {
          setCategorySuggestion({
            suggested: suggestedCategory.id.toString(),
            confidence: result.suggested.confidence,
            reason: result.suggested.reason,
            isVisible: true
          });
          
          // Auto-set the suggested category
          setUploadData(prev => ({ ...prev, categoryId: suggestedCategory.id.toString() }));
        }
      }
    } catch (error) {
      console.error("Failed to get category suggestion:", error);
    }
  };

  // Accept the suggested category
  const acceptSuggestion = () => {
    setCategorySuggestion(prev => prev ? { ...prev, isVisible: false } : null);
  };

  // Dismiss the suggestion
  const dismissSuggestion = () => {
    setCategorySuggestion(null);
    setUploadData(prev => ({ ...prev, categoryId: "" }));
  };

  // Handle creating new category
  const handleCreateCategory = () => {
    if (!newCategoryData.name.trim()) {
      toast({
        title: "Category name required",
        description: "Please enter a name for your category.",
        variant: "destructive",
      });
      return;
    }

    createCategoryMutation.mutate(newCategoryData);
  };

  // Get color classes for category display
  const getColorClasses = (color: string) => {
    const colorMap: { [key: string]: string } = {
      blue: "bg-blue-100 text-blue-800",
      green: "bg-green-100 text-green-800", 
      purple: "bg-purple-100 text-purple-800",
      orange: "bg-orange-100 text-orange-800",
      teal: "bg-teal-100 text-teal-800",
      indigo: "bg-indigo-100 text-indigo-800",
      yellow: "bg-yellow-100 text-yellow-800",
      red: "bg-red-100 text-red-800",
      pink: "bg-pink-100 text-pink-800",
      gray: "bg-gray-100 text-gray-800",
    };
    return colorMap[color] || colorMap.blue;
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

  // Find largest rectangle contour with improved document detection
  const findLargestRectangle = (edges: Uint8Array, width: number, height: number): { x: number, y: number, width: number, height: number } => {
    const threshold = 30; // Lower threshold for better edge detection
    const binary = edges.map(pixel => pixel > threshold ? 255 : 0);

    // Apply morphological operations to clean up edges
    const cleaned = applyMorphologicalOps(binary, width, height);

    // Find contours by detecting significant edge density regions
    const contours = findDocumentContours(cleaned, width, height);
    
    if (contours.length > 0) {
      // Return the largest contour (likely the document)
      return contours[0];
    }

    // More aggressive fallback - crop to center 70% instead of 80%
    const margin = 0.15;
    return {
      x: Math.floor(width * margin),
      y: Math.floor(height * margin),
      width: Math.floor(width * (1 - 2 * margin)),
      height: Math.floor(height * (1 - 2 * margin))
    };
  };

  // Apply morphological operations to clean up binary edges
  const applyMorphologicalOps = (binary: Uint8Array, width: number, height: number): Uint8Array => {
    // Apply closing operation to fill gaps in document edges
    const structuringElement = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1]
    ];

    const result = new Uint8Array(binary.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let hasEdge = false;
        
        // Check if any neighbor has an edge
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            if (structuringElement[ky + 1][kx + 1] && binary[(y + ky) * width + (x + kx)] > 0) {
              hasEdge = true;
              break;
            }
          }
          if (hasEdge) break;
        }
        
        result[y * width + x] = hasEdge ? 255 : 0;
      }
    }
    
    return result;
  };

  // Find document contours by analyzing edge density
  const findDocumentContours = (binary: Uint8Array, width: number, height: number): Array<{ x: number, y: number, width: number, height: number }> => {
    const contours: Array<{ x: number, y: number, width: number, height: number }> = [];
    
    // Scan for strong horizontal and vertical line segments
    const horizontalLines = findHorizontalLines(binary, width, height);
    const verticalLines = findVerticalLines(binary, width, height);
    
    // Find rectangles formed by these lines
    if (horizontalLines.length >= 2 && verticalLines.length >= 2) {
      const topLine = Math.min(...horizontalLines);
      const bottomLine = Math.max(...horizontalLines);
      const leftLine = Math.min(...verticalLines);
      const rightLine = Math.max(...verticalLines);
      
      // Ensure we have a reasonable rectangle
      const rectWidth = rightLine - leftLine;
      const rectHeight = bottomLine - topLine;
      
      if (rectWidth > width * 0.2 && rectHeight > height * 0.2) {
        const margin = 5; // Small margin
        contours.push({
          x: Math.max(0, leftLine - margin),
          y: Math.max(0, topLine - margin),
          width: Math.min(width - leftLine + margin, rectWidth + 2 * margin),
          height: Math.min(height - topLine + margin, rectHeight + 2 * margin)
        });
      }
    }
    
    // Sort by area (largest first)
    contours.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    
    return contours;
  };

  // Find horizontal line segments that could be document edges
  const findHorizontalLines = (binary: Uint8Array, width: number, height: number): number[] => {
    const lines: number[] = [];
    const minLineLength = width * 0.3; // At least 30% of width
    
    for (let y = 0; y < height; y++) {
      let lineLength = 0;
      let startX = -1;
      
      for (let x = 0; x < width; x++) {
        if (binary[y * width + x] > 0) {
          if (startX === -1) startX = x;
          lineLength++;
        } else {
          if (lineLength > minLineLength) {
            lines.push(y);
            break;
          }
          lineLength = 0;
          startX = -1;
        }
      }
      
      // Check if line extends to edge
      if (lineLength > minLineLength) {
        lines.push(y);
      }
    }
    
    return lines;
  };

  // Find vertical line segments that could be document edges
  const findVerticalLines = (binary: Uint8Array, width: number, height: number): number[] => {
    const lines: number[] = [];
    const minLineLength = height * 0.3; // At least 30% of height
    
    for (let x = 0; x < width; x++) {
      let lineLength = 0;
      let startY = -1;
      
      for (let y = 0; y < height; y++) {
        if (binary[y * width + x] > 0) {
          if (startY === -1) startY = y;
          lineLength++;
        } else {
          if (lineLength > minLineLength) {
            lines.push(x);
            break;
          }
          lineLength = 0;
          startY = -1;
        }
      }
      
      // Check if line extends to edge
      if (lineLength > minLineLength) {
        lines.push(x);
      }
    }
    
    return lines;
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

  const openAdvancedScanner = () => {
    setShowAdvancedScanner(true);
  };

  const handleAdvancedScannerCapture = (file: File) => {
    setSelectedFiles([file]);
    setShowUploadDialog(true);
    setShowAdvancedScanner(false);
  };

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.setAttribute('accept', 'application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx');
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
                    onClick={openAdvancedScanner}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50 w-full sm:w-auto order-2 sm:order-1"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Advanced Scanner
                  </Button>
                </div>
                
                {/* Mobile help text */}
                <p className="text-xs text-gray-400 sm:hidden mt-2">
                  📄 Auto edge detection + PDF conversion for scanned documents
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

            {/* AI Category Suggestion */}
            {categorySuggestion && categorySuggestion.isVisible && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-sm font-medium text-blue-800">AI Suggestion</span>
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                        {Math.round(categorySuggestion.confidence * 100)}% confident
                      </span>
                    </div>
                    <p className="text-sm text-blue-700 mb-2">
                      Suggested category: <strong>{categories.find(c => c.id.toString() === categorySuggestion.suggested)?.name}</strong>
                    </p>
                    <p className="text-xs text-blue-600">{categorySuggestion.reason}</p>
                  </div>
                  <div className="flex gap-1 ml-3">
                    <Button size="sm" variant="ghost" onClick={acceptSuggestion} className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50">
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={dismissSuggestion} className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Category Selection */}
            <div className="space-y-2">
              <Label htmlFor="category">Category {categorySuggestion ? '(You can change this)' : '(Optional)'}</Label>
              <Select value={uploadData.categoryId} onValueChange={(value) => {
                if (value === "create_new") {
                  setShowCreateCategory(true);
                  return;
                }
                setUploadData(prev => ({ ...prev, categoryId: value }));
                // Hide suggestion when user manually changes category
                if (categorySuggestion) {
                  setCategorySuggestion(prev => prev ? { ...prev, isVisible: false } : null);
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      <div className="flex items-center gap-2">
                        <i className={`${category.icon} text-sm`}></i>
                        {category.name}
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="create_new" className="text-blue-600 font-medium">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Create New Category
                    </div>
                  </SelectItem>
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

      {/* Inline Category Creation Dialog */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="categoryName">Category Name</Label>
              <Input
                id="categoryName"
                value={newCategoryData.name}
                onChange={(e) => setNewCategoryData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Vacation Home, Investment Property"
              />
            </div>
            
            <div>
              <Label>Icon</Label>
              <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto mt-2">
                {availableIcons.map((iconOption) => (
                  <button
                    key={iconOption.icon}
                    type="button"
                    onClick={() => setNewCategoryData(prev => ({ ...prev, icon: iconOption.icon }))}
                    className={`p-2 rounded border text-center hover:bg-gray-50 ${
                      newCategoryData.icon === iconOption.icon 
                        ? "border-blue-500 bg-blue-50" 
                        : "border-gray-200"
                    }`}
                  >
                    <i className={`${iconOption.icon} text-lg`}></i>
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <Label>Color</Label>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {availableColors.map((colorOption) => (
                  <button
                    key={colorOption.color}
                    type="button"
                    onClick={() => setNewCategoryData(prev => ({ ...prev, color: colorOption.color }))}
                    className={`p-3 rounded border text-center hover:opacity-80 ${
                      getColorClasses(colorOption.color)
                    } ${
                      newCategoryData.color === colorOption.color 
                        ? "ring-2 ring-offset-1 ring-blue-500" 
                        : ""
                    }`}
                  >
                    <div className="text-xs font-medium">{colorOption.label}</div>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button 
                onClick={handleCreateCategory} 
                disabled={createCategoryMutation.isPending || !newCategoryData.name.trim()}
                className="flex-1"
              >
                {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateCategory(false);
                  setNewCategoryData({ name: "", icon: "fas fa-folder", color: "blue" });
                }}
                className="flex-1"
              >
                Cancel
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

      {/* Advanced Document Scanner */}
      <AdvancedDocumentScanner
        isOpen={showAdvancedScanner}
        onClose={() => setShowAdvancedScanner(false)}
        onCapture={handleAdvancedScannerCapture}
      />
    </>
  );
}
