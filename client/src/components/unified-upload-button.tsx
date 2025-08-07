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
// TICKET 7: Legacy scanner imports removed
import { useFeatures } from "@/hooks/useFeatures";

interface UnifiedUploadButtonProps {
  onUpload: (files: File[]) => void;
  /** Set to true when component is already inside a dialog to prevent nested dialogs */
  suppressDialog?: boolean;
}

export default function UnifiedUploadButton({ onUpload, suppressDialog = false }: UnifiedUploadButtonProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  // TICKET 7: Legacy scanner states removed
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
      
      // Get category suggestion for first file if no category selected
      if (validFiles.length > 0 && !uploadData.categoryId) {
        await getSuggestion(validFiles[0]);
      }
      
      // Only show dialog if not suppressed (when used inside another dialog)
      if (!suppressDialog) {
        setShowUploadDialog(true);
      }
    }
  };

  const getSuggestion = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/documents/suggest-category', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (response.ok) {
        const suggestion = await response.json();
        setCategorySuggestion({
          suggested: suggestion.suggested_category,
          confidence: suggestion.confidence,
          reason: suggestion.reason,
          isVisible: true
        });
      }
    } catch (error) {
      console.log('Category suggestion failed:', error);
    }
  };

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.setAttribute('accept', 'application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx');
      fileInputRef.current.click();
    }
  };

  // TICKET 7: Legacy scan handler removed

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFileSelect(files);
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

  const applySuggestion = () => {
    if (categorySuggestion) {
      const suggestedCategory = categories.find(cat => 
        cat.name.toLowerCase() === categorySuggestion.suggested.toLowerCase()
      );
      if (suggestedCategory) {
        setUploadData(prev => ({ ...prev, categoryId: suggestedCategory.id.toString() }));
      }
      setCategorySuggestion(prev => prev ? { ...prev, isVisible: false } : null);
    }
  };

  const dismissSuggestion = () => {
    setCategorySuggestion(prev => prev ? { ...prev, isVisible: false } : null);
  };

  // Extract the upload form content for reuse
  const uploadFormContent = (
    <div className="space-y-4">
      {selectedFiles.map((file, index) => (
        <div key={index} className="text-sm text-gray-600">
          📄 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
        </div>
      ))}

      {categorySuggestion?.isVisible && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                Suggested Category: {categorySuggestion.suggested}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                {categorySuggestion.reason} ({Math.round(categorySuggestion.confidence * 100)}% confidence)
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={dismissSuggestion}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={applySuggestion}
            className="mt-2 text-xs"
          >
            Use Suggestion
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label htmlFor="custom-name">Document Name (Optional)</Label>
          <Input
            id="custom-name"
            placeholder="Custom name for the document"
            value={uploadData.customName}
            onChange={(e) => setUploadData({ ...uploadData, customName: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="category">Category</Label>
          <div className="flex gap-2">
            <Select 
              value={uploadData.categoryId} 
              onValueChange={(value) => setUploadData({ ...uploadData, categoryId: value })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateCategory(true)}
              className="px-3"
              disabled={isFree}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {isFree && (
            <p className="text-xs text-muted-foreground mt-1">
              Custom categories available with Premium
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="tags">Tags (Optional)</Label>
          <Input
            id="tags"
            placeholder="Add tags separated by commas"
            value={uploadData.tags}
            onChange={(e) => setUploadData({ ...uploadData, tags: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <Button 
          variant="outline" 
          onClick={() => suppressDialog ? onUpload([]) : setShowUploadDialog(false)}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button 
          onClick={handleUpload}
          disabled={uploadMutation.isPending}
          className="flex-1"
        >
          {uploadMutation.isPending ? "Uploading..." : "Upload"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Show upload form inline when suppressDialog is true and files are selected */}
      {suppressDialog && selectedFiles.length > 0 ? (
        uploadFormContent
      ) : (
        <>
          {/* Compact Upload Button */}
          <Card 
            className={`w-full max-w-md h-48 border-2 border-dashed transition-colors cursor-pointer hover:border-primary ${
              isDragOver 
                ? "border-primary bg-blue-50" 
                : "border-gray-300"
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onClick={handleFileUpload}
            role="button"
            aria-label="Upload documents by clicking or dragging files"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleFileUpload();
              }
            }}
          >
            <CardContent className="p-6 h-full flex flex-col items-center justify-center text-center">
              <CloudUpload className="h-8 w-8 text-gray-400 mb-3" />
              <h3 className="text-sm font-medium mb-2">Upload Documents</h3>
              <p className="text-xs text-gray-500 mb-4">
                PDF, JPG, PNG, WebP (max 10MB)
              </p>
              
              {/* Primary Choose Files Button */}
              <Button 
                variant="default" 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFileUpload();
                }}
                className="mb-3 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Choose Files
              </Button>
              
              {/* TICKET 7: Legacy scanner buttons removed - scanning now handled via Add menu */}
            </CardContent>
          </Card>
        </>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          handleFileSelect(files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
        accept="application/pdf,image/*"
      />

      {/* Upload Dialog - only show when not suppressed */}
      {!suppressDialog && (
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Documents</DialogTitle>
            </DialogHeader>
            {uploadFormContent}
          </DialogContent>
        </Dialog>
      )}

      {/* Create Category Dialog */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="category-name">Category Name</Label>
              <Input
                id="category-name"
                placeholder="Enter category name"
                value={newCategoryData.name}
                onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="category-icon">Icon</Label>
              <Select 
                value={newCategoryData.icon} 
                onValueChange={(value) => setNewCategoryData({ ...newCategoryData, icon: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableIcons.map((iconOption) => (
                    <SelectItem key={iconOption.icon} value={iconOption.icon}>
                      {iconOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category-color">Color</Label>
              <Select 
                value={newCategoryData.color} 
                onValueChange={(value) => setNewCategoryData({ ...newCategoryData, color: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableColors.map((colorOption) => (
                    <SelectItem key={colorOption.color} value={colorOption.color}>
                      {colorOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setShowCreateCategory(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => createCategoryMutation.mutate(newCategoryData)}
                disabled={!newCategoryData.name || createCategoryMutation.isPending}
                className="flex-1"
              >
                {createCategoryMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* TICKET 7: Legacy scanner components removed - scanning now handled via Add dropdown menu */}
    </>
  );
}