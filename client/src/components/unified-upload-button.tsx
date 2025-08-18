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

  // Enhanced per-file upload tracking with progress and error handling
  type UploadItem = {
    id: string;            // stable UUID generated on enqueue
    file: File;
    status: 'queued' | 'uploading' | 'success' | 'error' | 'canceled';
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
    }
  }, [open, uploadItems.length]);

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

  const uploadSingleFileWithProgress = (itemId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const item = uploadItems.find(i => i.id === itemId);
      if (!item) {
        reject(new Error('Upload item not found'));
        return;
      }

      const abortController = new AbortController();
      updateItem(itemId, { status: 'uploading', abortController });

      const xhr = new XMLHttpRequest();

      // Prepare form data
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("name", uploadData.customName || item.file.name);
      if (uploadData.categoryId) formData.append("categoryId", uploadData.categoryId);
      if (uploadData.tags) formData.append("tags", JSON.stringify(uploadData.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)));
      if (uploadData.expiryDate) formData.append("expiryDate", uploadData.expiryDate);

      // Progress tracking
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          updateItem(itemId, {
            progress,
            bytesUploaded: e.loaded
          });
        }
      });

      // Success handler
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            updateItem(itemId, {
              status: 'success',
              progress: 100,
              bytesUploaded: item.file.size,
              serverId: result.id
            });
            console.log(`✓ Successfully uploaded: ${item.file.name}`);
            resolve(result);
          } catch (e) {
            const error = new Error('Invalid server response');
            updateItem(itemId, {
              status: 'error',
              errorCode: 'SERVER',
              errorMessage: 'Invalid server response'
            });
            reject(error);
          }
        } else {
          // Map HTTP status to error codes
          let errorCode: UploadItem['errorCode'] = 'UNKNOWN';
          let errorMessage = 'Upload failed';

          if (xhr.status === 408 || xhr.status === 504) {
            errorCode = 'TIMEOUT';
            errorMessage = 'Request timed out. Please try again.';
          } else if (xhr.status === 429) {
            errorCode = 'RATE_LIMITED';
            errorMessage = 'Too many requests. Please wait and try again.';
          } else if (xhr.status === 413) {
            errorCode = 'VALIDATION';
            errorMessage = 'File too large (max 10MB)';
          } else if (xhr.status === 415) {
            errorCode = 'VALIDATION';
            errorMessage = 'File type not supported';
          } else if (xhr.status >= 400 && xhr.status < 500) {
            errorCode = 'VALIDATION';
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              errorMessage = errorResponse.message || `Validation error (${xhr.status})`;
            } catch {
              errorMessage = `Validation error (${xhr.status})`;
            }
          } else if (xhr.status >= 500) {
            errorCode = 'SERVER';
            errorMessage = 'Server error. Please try again.';
          }

          updateItem(itemId, {
            status: 'error',
            errorCode,
            errorMessage
          });

          console.error(`✗ Failed to upload ${item.file.name}: ${errorMessage}`);
          reject(new Error(errorMessage));
        }
      });

      // Network error handler
      xhr.addEventListener('error', () => {
        updateItem(itemId, {
          status: 'error',
          errorCode: 'NETWORK',
          errorMessage: 'Network error. Check your connection.'
        });
        reject(new Error('Network error'));
      });

      // Abort handler
      xhr.addEventListener('abort', () => {
        updateItem(itemId, {
          status: 'canceled',
          errorMessage: 'Upload canceled'
        });
        reject(new Error('Upload canceled'));
      });

      // Timeout handler
      xhr.addEventListener('timeout', () => {
        updateItem(itemId, {
          status: 'error',
          errorCode: 'TIMEOUT',
          errorMessage: 'Upload timed out. Please try again.'
        });
        reject(new Error('Upload timed out'));
      });

      // Abort signal handling
      abortController.signal.addEventListener('abort', () => {
        xhr.abort();
      });

      // Configure and send request
      xhr.open('POST', '/api/documents');
      xhr.timeout = 120000; // 2 minute timeout
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    const queuedItems = uploadItems.filter(item => item.status === 'queued' || item.status === 'error');
    console.log(`Starting upload of ${queuedItems.length} files`);

    if (queuedItems.length === 0) return;

    // Reset any error items back to queued
    queuedItems.forEach(item => {
      if (item.status === 'error') {
        updateItem(item.id, {
          status: 'queued',
          progress: 0,
          bytesUploaded: 0,
          errorCode: undefined,
          errorMessage: undefined,
          abortController: undefined
        });
      }
    });

    // Process files sequentially to avoid overwhelming the server
    const results: Array<{ item: UploadItem; success: boolean; result?: any; error?: string }> = [];

    for (const item of queuedItems) {
      console.log(`Uploading: ${item.file.name}`);
      
      try {
        const result = await uploadSingleFileWithProgress(item.id);
        results.push({ item, success: true, result });
        
        // Refresh queries after each successful upload
        queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/insights/metrics"] });
        
      } catch (error: any) {
        console.error(`Failed to upload ${item.file.name}:`, error);
        results.push({ item, success: false, error: error.message });
      }
    }

    // Show final summary
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;

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
        {/* Aggregate header with counts */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Files ({uploadItems.length})</span>
            <div className="flex items-center gap-2 text-xs">
              {uploadItems.filter(i => i.status === 'uploading').length > 0 && (
                <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded">
                  {uploadItems.filter(i => i.status === 'uploading').length} uploading
                </span>
              )}
              {uploadItems.filter(i => i.status === 'success').length > 0 && (
                <span className="bg-green-100 text-green-600 px-2 py-1 rounded">
                  {uploadItems.filter(i => i.status === 'success').length} success
                </span>
              )}
              {uploadItems.filter(i => i.status === 'error').length > 0 && (
                <span className="bg-red-100 text-red-600 px-2 py-1 rounded">
                  {uploadItems.filter(i => i.status === 'error').length} failed
                </span>
              )}
              {uploadItems.filter(i => i.status === 'canceled').length > 0 && (
                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  {uploadItems.filter(i => i.status === 'canceled').length} canceled
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Cancel any ongoing uploads
              uploadItems.forEach(item => {
                if (item.abortController) {
                  item.abortController.abort();
                }
              });
              setSelectedFiles([]);
              setUploadItems([]);
              setCategorySuggestion(null);
            }}
            className="text-xs h-6 px-2"
          >
            Clear All
          </Button>
        </div>

        {/* Per-file rows with progress */}
        {uploadItems.map((item) => (
          <div key={item.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-gray-600">📄</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" title={item.file.name}>
                    {item.file.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    {item.status === 'uploading' && (
                      <span> • {(item.bytesUploaded / 1024 / 1024).toFixed(1)} MB uploaded</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${
                    item.status === 'queued' ? 'bg-gray-100 text-gray-600' :
                    item.status === 'uploading' ? 'bg-blue-100 text-blue-600' :
                    item.status === 'success' ? 'bg-green-100 text-green-600' :
                    item.status === 'error' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {item.status === 'queued' && 'Queued'}
                    {item.status === 'uploading' && `${item.progress}%`}
                    {item.status === 'success' && '✓ Success'}
                    {item.status === 'error' && '✗ Failed'}
                    {item.status === 'canceled' && 'Canceled'}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                {item.status === 'uploading' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (item.abortController) {
                        item.abortController.abort();
                      }
                    }}
                    className="text-xs h-6 px-2"
                    aria-label={`Cancel upload for ${item.file.name}`}
                  >
                    Cancel
                  </Button>
                )}
                {item.status === 'error' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      updateItem(item.id, {
                        status: 'queued',
                        progress: 0,
                        bytesUploaded: 0,
                        errorCode: undefined,
                        errorMessage: undefined,
                        abortController: undefined
                      });
                    }}
                    className="text-xs h-6 px-2 text-blue-600 hover:text-blue-800"
                    aria-label={`Retry upload for ${item.file.name}`}
                  >
                    Retry
                  </Button>
                )}
                {(item.status === 'queued' || item.status === 'error' || item.status === 'canceled') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Remove from both lists
                      setUploadItems(prev => prev.filter(i => i.id !== item.id));
                      setSelectedFiles(prev => prev.filter(f =>
                        f !== item.file
                      ));
                    }}
                    className="text-xs h-6 px-2 text-red-600 hover:text-red-800"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Progress bar for uploading files */}
            {item.status === 'uploading' && (
              <div className="space-y-1">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-200 ease-out"
                    style={{ width: `${item.progress}%` }}
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Upload progress for ${item.file.name}: ${item.progress}%`}
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {item.status === 'error' && item.errorMessage && (
              <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded" role="alert">
                {item.errorMessage}
              </div>
            )}
          </div>
        ))}
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
          onClick={() => {
            resetAllStates(); // Ensure all states are reset before closing
            close();
          }}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleUpload}
          disabled={uploadItems.filter(item => item.status === 'queued' || item.status === 'error').length === 0 || uploadItems.some(item => item.status === 'uploading')}
          className="flex-1"
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