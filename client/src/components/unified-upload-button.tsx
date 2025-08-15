import { useState, useRef, useEffect } from "react";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: any) => void;
  /** Optional context for prefilling modals (e.g., selected house/vehicle) */
  selectedAssetId?: string;
  selectedAssetName?: string;
}

export default function UnifiedUploadButton({ 
  open,
  onOpenChange,
  onSuccess,
  selectedAssetId, 
  selectedAssetName 
}: UnifiedUploadButtonProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Guard against late async completions trying to update UI after close
  const closedRef = useRef(false);
  
  // Track per-file upload states for bounded concurrency
  const [uploadStates, setUploadStates] = useState<Map<string, {
    status: 'pending' | 'uploading' | 'success' | 'error';
    error?: string;
    result?: any;
  }>>(new Map());

  // Reset states when modal opens fresh (no ongoing upload)
  useEffect(() => {
    if (open && selectedFiles.length === 0) {
      resetAllStates();
    }
  }, [open]);
  
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

  // Helper to close modal - never try to set internal open state
  const close = () => {
    closedRef.current = true;
    onOpenChange(false);
  };
  
  // Helper to reset all states - used for successful uploads or explicit clear
  const resetAllStates = () => {
    setUploadStates(new Map());
    setSelectedFiles([]);
    setUploadData({ categoryId: "", tags: "", expiryDate: "", customName: "" });
    setCategorySuggestion(null);
  };

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

  // Remove the old uploadMutation since we're handling uploads manually with bounded concurrency

  const handleFileSelect = async (files: File[]) => {
    // Deduplicate by name+size+lastModified before enqueue
    const createFileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;
    const existingKeys = new Set(selectedFiles.map(createFileKey));
    
    const validFiles = files.filter(file => {
      const fileKey = createFileKey(file);
      
      // Check for duplicates first
      if (existingKeys.has(fileKey)) {
        console.log(`Skipping duplicate file: ${file.name}`);
        return false;
      }
      
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
      // Preserve existing queue logic; push each file into upload queue
      setSelectedFiles(prev => [...prev, ...validFiles]);
      
      // Initialize upload states for new files (preserve existing states)
      setUploadStates(prev => {
        const newStates = new Map(prev);
        validFiles.forEach(file => {
          const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
          if (!newStates.has(fileKey)) {
            newStates.set(fileKey, { status: 'pending' });
          }
        });
        return newStates;
      });
      
      // Get category suggestion for first file if no category selected
      if (validFiles.length > 0 && !uploadData.categoryId) {
        await getSuggestion(validFiles[0]);
      }
      
      // Files are loaded, ready for upload form
      console.log(`Added ${validFiles.length} files to upload queue. Total: ${selectedFiles.length + validFiles.length}`);
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

  const uploadSingleFile = async (file: File) => {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    
    // Update state to uploading
    setUploadStates(prev => new Map(prev).set(fileKey, { status: 'uploading' }));
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", uploadData.customName || file.name);
      if (uploadData.categoryId) formData.append("categoryId", uploadData.categoryId);
      if (uploadData.tags) formData.append("tags", JSON.stringify(uploadData.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)));
      if (uploadData.expiryDate) formData.append("expiryDate", uploadData.expiryDate);

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Upload failed");
      }

      const result = await response.json();
      
      // Update state to success
      setUploadStates(prev => new Map(prev).set(fileKey, { status: 'success', result }));
      console.log(`✓ Successfully uploaded: ${file.name}`);
      
      return result;
    } catch (error: any) {
      // Update state to error
      setUploadStates(prev => new Map(prev).set(fileKey, { 
        status: 'error', 
        error: error.message || "Upload failed" 
      }));
      console.error(`✗ Failed to upload ${file.name}:`, error);
      throw error;
    }
  };

  const handleUpload = async () => {
    console.log(`Starting upload of ${selectedFiles.length} files with bounded concurrency (max 3)`);
    
    // Reset only status to pending (preserve existing states structure)
    setUploadStates(prev => {
      const newStates = new Map();
      selectedFiles.forEach(file => {
        const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
        newStates.set(fileKey, { status: 'pending' as const });
      });
      return newStates;
    });
    
    // Process files with bounded concurrency (3 uploads at a time)
    const concurrencyLimit = 3;
    const results: Array<{ file: File; success: boolean; result?: any; error?: string }> = [];
    
    for (let i = 0; i < selectedFiles.length; i += concurrencyLimit) {
      const batch = selectedFiles.slice(i, i + concurrencyLimit);
      console.log(`Processing batch ${Math.floor(i / concurrencyLimit) + 1}: ${batch.map(f => f.name).join(', ')}`);
      
      // Process batch concurrently
      const batchPromises = batch.map(async (file) => {
        try {
          const result = await uploadSingleFile(file);
          return { file, success: true, result };
        } catch (error: any) {
          return { file, success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    // Show final summary
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;
    
    console.log(`Upload process completed: ${successCount} successful, ${errorCount} failed`);
    
    if (errorCount === 0) {
      toast({
        title: "All uploads successful",
        description: `${successCount} documents uploaded successfully.`,
      });
      
      // Clear state and close modal only on complete success
      resetAllStates();
      close();
      onSuccess(results.map(r => r.result));
    } else {
      toast({
        title: "Some uploads failed",
        description: `${successCount} successful, ${errorCount} failed. Check individual file status below.`,
        variant: errorCount === results.length ? "destructive" : "default",
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
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Selected Files ({selectedFiles.length})</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedFiles([]);
              setUploadStates(new Map());
              setCategorySuggestion(null);
            }}
            className="text-xs h-6 px-2"
          >
            Clear All
          </Button>
        </div>
        {selectedFiles.map((file, index) => {
          const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
          const uploadState = uploadStates.get(fileKey);
          
          return (
            <div key={fileKey} className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-gray-600">
                  📄 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </span>
                {uploadState && (
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-1 rounded ${
                      uploadState.status === 'pending' ? 'bg-gray-100 text-gray-600' :
                      uploadState.status === 'uploading' ? 'bg-blue-100 text-blue-600' :
                      uploadState.status === 'success' ? 'bg-green-100 text-green-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {uploadState.status === 'pending' && 'Queued'}
                      {uploadState.status === 'uploading' && 'Uploading...'}
                      {uploadState.status === 'success' && '✓ Success'}
                      {uploadState.status === 'error' && '✗ Failed'}
                    </span>
                    {uploadState.status === 'error' && uploadState.error && (
                      <span className="text-xs text-red-600 max-w-xs truncate" title={uploadState.error}>
                        {uploadState.error}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {!uploadState || uploadState.status === 'pending' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const fileToRemove = selectedFiles[index];
                    const fileKey = `${fileToRemove.name}-${fileToRemove.size}-${fileToRemove.lastModified}`;
                    
                    // Remove from files list
                    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                    
                    // Remove from upload states
                    setUploadStates(prev => {
                      const newStates = new Map(prev);
                      newStates.delete(fileKey);
                      return newStates;
                    });
                  }}
                  className="text-xs h-6 px-2 text-red-600 hover:text-red-800"
                >
                  Remove
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

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
          onClick={() => close()}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button 
          onClick={handleUpload}
          disabled={Array.from(uploadStates.values()).some(state => state.status === 'uploading')}
          className="flex-1"
        >
          {Array.from(uploadStates.values()).some(state => state.status === 'uploading') ? "Uploading..." : "Upload"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* No inline content - only modal based */}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            const fileArray = Array.from(e.target.files);
            handleFileSelect(fileArray);
          }
        }}
        style={{ display: "none" }}
        accept="application/pdf,image/*"
      />

      {/* Fully controlled upload dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Documents</DialogTitle>
            </DialogHeader>
            {selectedFiles.length > 0 ? (
              uploadFormContent
            ) : (
              <div className="space-y-4">
                <Card 
                  className={`h-32 border-2 border-dashed transition-colors cursor-pointer hover:border-primary ${
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
                >
                  <CardContent className="p-4 h-full flex flex-col items-center justify-center text-center">
                    <CloudUpload className="h-6 w-6 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-2">Drop files here or click to browse</p>
                    <p className="text-xs text-gray-500">PDF, JPG, PNG, WebP (max 10MB)</p>
                  </CardContent>
                </Card>
                
                <div className="text-center">
                  <p className="text-sm text-gray-500 mb-3">Or choose files directly:</p>
                  <Button onClick={handleFileUpload} variant="outline" className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Choose Files
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

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