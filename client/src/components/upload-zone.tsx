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

  const handleFileSelect = (files: File[]) => {
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
      setSelectedFiles(validFiles);
      setShowUploadDialog(true);
    }
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
                  💡 "Scan with Camera" opens your phone's camera app
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
