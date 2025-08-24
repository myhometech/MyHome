import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CloudUpload, Camera, Plus, X, Upload, Check } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
// TICKET 7: Legacy scanner imports removed
import { useFeatures } from "@/hooks/useFeatures";

interface UnifiedUploadButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: any) => void; // Changed to optional
  /** Optional context for prefilling modals (e.g., selected house/vehicle) */
  selectedAssetId?: string;
  selectedAssetName?: string;
}

export default function UnifiedUploadButton({
  open,
  onOpenChange,
  onSuccess: onUploadComplete, // Renamed for clarity
  selectedAssetId,
  selectedAssetName
}: UnifiedUploadButtonProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Guard against late async completions trying to update UI after close
  const closedRef = useRef(false);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    return false;
  });

  // Enhanced per-file upload tracking with progress and error handling
  type UploadItem = {
    id: string;            // stable UUID generated on enqueue
    file: File;
    status: 'queued' | 'uploading' | 'success' | 'error' | 'canceled' | 'completed'; // Added 'completed' for the state after uploadMutation success
    progress: number;      // 0–100
    bytesUploaded: number; // running byte count
    errorCode?: 'TIMEOUT' | 'NETWORK' | 'RATE_LIMITED' | 'VALIDATION' | 'SERVER' | 'UNKNOWN';
    errorMessage?: string; // user-friendly text
    serverId?: string;     // set on success
    abortController?: AbortController; // for cancellation
  };

  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);

  // Sync internal dialog state with external open prop
  useEffect(() => {
    setShowUploadDialog(open);
    if (open && uploadItems.length === 0) {
      resetAllStates();
      
      // On mobile, auto-trigger file picker when dialog opens
      if (isMobile && selectedFiles.length === 0) {
        setTimeout(() => {
          handleFileUpload();
        }, 100); // Small delay to ensure dialog is rendered
      }
    }
  }, [open, uploadItems.length, isMobile, selectedFiles.length]);

  // Helper function to update a specific upload item
  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setUploadItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...patch } : item
    ));
  };

  // Generate stable UUID for upload items
  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

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

  // Show/Hide upload dialog state
  const [showUploadDialog, setShowUploadDialog] = useState(open);

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

  // Helper to close modal - use external onOpenChange and sync internal state
  const close = () => {
    closedRef.current = true;
    setShowUploadDialog(false);
    onOpenChange(false);
  };

  // Update mobile detection on resize
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const newIsMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(newIsMobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Helper to reset all states - used for successful uploads or explicit clear
  const resetAllStates = () => {
    // Cancel any ongoing uploads
    uploadItems.forEach(item => {
      if (item.abortController) {
        item.abortController.abort();
      }
    });

    setUploadItems([]);
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

  // Upload Mutation for handling file uploads, now with improved error handling and notifications
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch("/api/documents", {
          method: "POST",
          body: formData,
          credentials: "include",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Upload failed' }));
          throw new Error(error.message || 'Upload failed');
        }

        return response.json();
      } catch (error: any) { // Explicitly type error as 'any' to access 'name' property
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Upload timed out. Your document may still be processing.');
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      // Show processing notification
      toast({
        title: "Document uploaded successfully",
        description: "Your document is being processed and will appear shortly in your library.",
        duration: 5000,
      });

      // Invalidate queries to refresh the document list
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insights/metrics"] });

      // Reset form state
      setSelectedFiles([]);
      setUploadData({ categoryId: "", tags: "", expiryDate: "", customName: "" });

      // Close the modal and notify parent
      close();

      // Call completion callback
      onUploadComplete?.(data);
    },
    onError: (error: any) => { // Explicitly type error as 'any' to access message property safely
      toast({
        title: "Upload failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });


  const handleFileSelect = async (files: File[]): Promise<void> => {
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

      // Create upload items for new files with deduplication
      const newUploadItems: UploadItem[] = validFiles.map(file => ({
        id: generateId(),
        file,
        status: 'queued' as const,
        progress: 0,
        bytesUploaded: 0
      }));

      setUploadItems(prev => [...prev, ...newUploadItems]);

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

  const uploadSingleFileWithProgress = async (itemId: string): Promise<any> => {
    const item = uploadItems.find(i => i.id === itemId);
    if (!item) throw new Error('Upload item not found');

    setUploadItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, status: 'uploading', progress: 0 } : i
    ));

    try {
      const formData = new FormData();
      formData.append("file", item.file);
      if (uploadData.customName) formData.append("name", uploadData.customName);
      if (uploadData.categoryId) formData.append("categoryId", uploadData.categoryId);
      if (uploadData.tags) formData.append("tags", JSON.stringify(uploadData.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)));
      if (uploadData.expiryDate) formData.append("expiryDate", uploadData.expiryDate);

      console.log(`📤 Starting upload: ${item.file.name} (${(item.file.size / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`📝 Upload data:`, {
        name: uploadData.customName || item.file.name,
        categoryId: uploadData.categoryId,
        tags: uploadData.tags,
        fileType: item.file.type
      });

      // Add timeout and better error handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error(`⏰ Upload timeout for ${item.file.name}`);
        controller.abort();
      }, 60000); // 60 second timeout

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`📡 Response status for ${item.file.name}: ${response.status}`);

      if (!response.ok) {
        let errorMessage = `Upload failed with status ${response.status}`;

        try {
          const errorData = await response.text();
          console.error(`❌ Server error response for ${item.file.name}:`, errorData);

          // Try to parse as JSON first
          try {
            const parsedError = JSON.parse(errorData);
            errorMessage = parsedError.message || parsedError.error || errorMessage;
          } catch {
            // If not JSON, use the text response
            errorMessage = errorData || errorMessage;
          }
        } catch (textError) {
          console.error(`❌ Failed to read error response for ${item.file.name}:`, textError);
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log(`✅ Upload successful for ${item.file.name}:`, result);

      setUploadItems(prev => prev.map(i => 
        i.id === itemId ? { ...i, status: 'completed', progress: 100 } : i
      ));

      // Invalidate queries to refresh the document list
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insights/metrics"] });

      return result;
    } catch (error: any) {
      console.error(`❌ Upload failed for ${item.file.name}:`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
        fileSize: item.file.size,
        fileType: item.file.type
      });

      let friendlyMessage = error.message;

      // Provide more specific error messages
      if (error.name === 'AbortError') {
        friendlyMessage = 'Upload timed out. Please try again with a smaller file or check your connection.';
      } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        friendlyMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.message.includes('413')) {
        friendlyMessage = 'File is too large. Maximum file size is 10MB.';
      } else if (error.message.includes('415')) {
        friendlyMessage = 'File type not supported. Please use PDF, JPG, PNG, or WebP files.';
      }

      setUploadItems(prev => prev.map(i => 
        i.id === itemId ? { ...i, status: 'error', progress: 0, errorMessage: friendlyMessage } : i
      ));

      throw new Error(friendlyMessage);
    }
  };

  const handleUpload = async () => {
    const queuedItems = uploadItems.filter(item => item.status === 'queued');
    console.log(`Starting upload of ${queuedItems.length} files`);

    if (queuedItems.length === 0) return;

    // Process files sequentially to avoid overwhelming the server
    const results: Array<{ item: UploadItem; success: boolean; result?: any; error?: string }> = [];

    for (const item of queuedItems) {
      console.log(`Uploading: ${item.file.name}`);

      try {
        const result = await uploadSingleFileWithProgress(item.id);
        results.push({ item, success: true, result });

        // Refresh queries after each successful upload
        // Moved to uploadSingleFileWithProgress for immediate feedback
        // queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
        // queryClient.invalidateQueries({ queryKey: ["/api/insights/metrics"] });

      } catch (error: any) {
        console.error(`Failed to upload ${item.file.name}:`, error);
        results.push({ item, success: false, error: error.message });
      }
    }

    // Show final summary
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;

    console.log(`Upload process completed: ${successCount} successful, ${errorCount} failed`);

    if (successCount > 0) {
      toast({
        title: successCount === results.length ? "All uploads successful" : "Some uploads completed",
        description: errorCount === 0 
          ? `${successCount} documents uploaded successfully.`
          : `${successCount} successful, ${errorCount} failed. Check failed items below.`,
        variant: errorCount === 0 ? "default" : "destructive",
      });

      // If all succeeded, close modal and reset
      if (errorCount === 0) {
        resetAllStates();
        close();
        onUploadComplete?.(results.filter(r => r.success).map(r => r.result));
      }
    } else {
      toast({
        title: "All uploads failed",
        description: "Please check the errors and try again.",
        variant: "destructive",
      });
    }
  };

  const uploadSingleFileInBackground = async (itemId: string) => {
    try {
      const item = uploadItems.find(i => i.id === itemId);
      if (!item) return;

      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("name", uploadData.customName || item.file.name);
      if (uploadData.categoryId) formData.append("categoryId", uploadData.categoryId);
      if (uploadData.tags) formData.append("tags", JSON.stringify(uploadData.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)));
      if (uploadData.expiryDate) formData.append("expiryDate", uploadData.expiryDate);

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (response.ok) {
        // Refresh document list on successful upload
        queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/insights/metrics"] });
        console.log(`✅ Successfully uploaded: ${item.file.name}`);
      } else {
        console.error(`❌ Failed to upload ${item.file.name}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ Error uploading file: ${error.message}`);
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

  const removeFile = (indexToRemove: number) => {
    setUploadItems(prev => prev.filter((_, index) => index !== indexToRemove));
    setSelectedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleCreateCategory = () => {
    // Ensure name is not empty
    if (!newCategoryData.name.trim()) {
      toast({
        title: "Category name is required",
        variant: "destructive",
      });
      return;
    }
    createCategoryMutation.mutate(newCategoryData);
  };

  // Utility function to get Tailwind classes for color previews
  const getColorClasses = (color: string) => {
    switch (color) {
      case "blue": return "bg-blue-500";
      case "green": return "bg-green-500";
      case "purple": return "bg-purple-500";
      case "orange": return "bg-orange-500";
      case "teal": return "bg-teal-500";
      case "indigo": return "bg-indigo-500";
      case "yellow": return "bg-yellow-500";
      case "red": return "bg-red-500";
      case "pink": return "bg-pink-500";
      case "gray": return "bg-gray-500";
      default: return "bg-gray-300";
    }
  };

  // Extract the upload form content for reuse
  const uploadFormContent = (
    <div className="space-y-4">
      {/* File List */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Selected Files</Label>
        <div className="max-h-32 overflow-y-auto space-y-2">
          {selectedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
              <div className="flex-1 min-w-0 mr-3">
                <span className="text-sm font-medium truncate block">{file.name}</span>
                <span className="text-xs text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
                className="h-8 w-8 p-0 flex-shrink-0 hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
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
        {/* Custom Document Title */}
        <div className="space-y-2">
          <Label htmlFor="customName" className="text-sm font-medium">Document Title (Optional)</Label>
          <Input
            id="customName"
            placeholder="Enter a custom title for your document"
            value={uploadData.customName}
            onChange={(e) => setUploadData(prev => ({ ...prev, customName: e.target.value }))}
            className="w-full"
          />
          <p className="text-xs text-gray-500 leading-relaxed">
            Leave blank to use the original filename
          </p>
        </div>

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="category" className="text-sm font-medium">
            Category {categorySuggestion ? '(You can change this)' : '(Optional)'}
          </Label>
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
            <SelectTrigger className="w-full">
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
          <Label htmlFor="tags" className="text-sm font-medium">Tags (Optional)</Label>
          <Input
            id="tags"
            placeholder="Enter tags separated by commas"
            value={uploadData.tags}
            onChange={(e) => setUploadData(prev => ({ ...prev, tags: e.target.value }))}
            className="w-full"
          />
          <p className="text-xs text-gray-500">
            Example: invoice, important, 2024
          </p>
        </div>

        {/* Expiry Date */}
        <div className="space-y-2">
          <Label htmlFor="expiryDate" className="text-sm font-medium">Expiry Date (Optional)</Label>
          <Input
            id="expiryDate"
            type="date"
            value={uploadData.expiryDate}
            onChange={(e) => setUploadData(prev => ({ ...prev, expiryDate: e.target.value }))}
            className="w-full"
          />
        </div>
      </div>

      {/* Upload Button */}
      <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            resetAllStates(); // Ensure all states are reset before closing
            close();
          }}
          disabled={uploadItems.some(item => item.status === 'uploading')}
          className="w-full sm:w-auto order-2 sm:order-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleUpload}
          disabled={uploadItems.filter(item => item.status === 'queued' || item.status === 'error').length === 0 || uploadItems.some(item => item.status === 'uploading')}
          className="bg-primary hover:bg-blue-700 w-full sm:w-auto order-1 sm:order-2"
        >
          {uploadItems.some(item => item.status === 'uploading') ? "Uploading..." :
           uploadItems.filter(item => item.status === 'queued' || item.status === 'error').length === 0 ? "No Files to Upload" : "Upload"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
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
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto w-[calc(100vw-2rem)] sm:w-full">
            <DialogHeader>
              <DialogTitle>Upload Documents</DialogTitle>
              <DialogDescription>
                Upload PDF, JPG, PNG, or WebP files to your document library
              </DialogDescription>
            </DialogHeader>
            {selectedFiles.length > 0 ? (
              uploadFormContent
            ) : (
              <div className="space-y-4">
                {/* Show simplified interface on mobile */}
                {isMobile ? (
                  <div className="text-center py-8">
                    <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-900 mb-2">Select Files to Upload</p>
                    <p className="text-sm text-gray-600 mb-6">Choose documents from your device</p>
                    <Button onClick={handleFileUpload} className="w-full bg-primary hover:bg-blue-700 text-white py-3">
                      <Upload className="h-5 w-5 mr-2" />
                      Choose Files from Device
                    </Button>
                    <p className="text-xs text-gray-500 mt-3">PDF, JPG, PNG, WebP (max 10MB)</p>
                  </div>
                ) : (
                  // Desktop drag-and-drop interface
                  <>
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
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

      {/* Create Category Dialog */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent className="max-w-md mx-4 sm:mx-auto w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="categoryName" className="text-sm font-medium">Category Name</Label>
              <Input
                id="categoryName"
                value={newCategoryData.name}
                onChange={(e) => setNewCategoryData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Vacation Home, Investment Property"
                className="w-full mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Icon</Label>
              <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto mt-2 p-1">
                {availableIcons.map((iconOption) => (
                  <button
                    key={iconOption.icon}
                    type="button"
                    onClick={() => setNewCategoryData(prev => ({ ...prev, icon: iconOption.icon }))}
                    className={`p-3 rounded-lg border text-center hover:bg-gray-50 transition-colors ${
                      newCategoryData.icon === iconOption.icon
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                        : "border-gray-200"
                    }`}
                  >
                    <i className={`${iconOption.icon} text-lg`}></i>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Color</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                {availableColors.map((colorOption) => (
                  <button
                    key={colorOption.color}
                    type="button"
                    onClick={() => setNewCategoryData(prev => ({ ...prev, color: colorOption.color }))}
                    className={`p-3 rounded-lg border text-center hover:opacity-80 transition-all ${
                      getColorClasses(colorOption.color)
                    } ${
                      newCategoryData.color === colorOption.color
                        ? "ring-2 ring-offset-1 ring-blue-500 scale-105"
                        : ""
                    }`}
                  >
                    <div className="text-xs font-medium">{colorOption.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button
                onClick={handleCreateCategory}
                disabled={createCategoryMutation.isPending || !newCategoryData.name.trim()}
                className="flex-1 order-1"
              >
                {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateCategory(false);
                  setNewCategoryData({ name: "", icon: "fas fa-folder", color: "blue" });
                }}
                className="flex-1 order-2"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* TICKET 7: Legacy scanner components removed - scanning now handled via Add dropdown menu */}
    </>
  );
}