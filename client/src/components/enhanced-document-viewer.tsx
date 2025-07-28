import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  X, 
  Download, 
  FileText, 
  Edit3, 
  Save, 
  XCircle, 
  Calendar, 
  FileIcon, 
  Tag, 
  Clock, 
  User,
  FolderIcon,
  Info,
  MoreHorizontal
} from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DocumentInsights } from "@/components/document-insights";

interface EnhancedDocumentViewerProps {
  document: {
    id: number;
    name: string;
    mimeType: string;
    fileSize: number;
  };
  onClose: () => void;
  onUpdate?: () => void;
}

interface FullDocumentDetails {
  id: number;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  categoryId?: number;
  tags?: string[];
  expiryDate?: string;
  extractedText?: string;
  summary?: string;
  ocrProcessed?: boolean;
  uploadedAt: string;
  userId: string;
}

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

export function EnhancedDocumentViewer({ document, onClose, onUpdate }: EnhancedDocumentViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [editExpiryDate, setEditExpiryDate] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch full document details
  const { data: fullDocument, isLoading: isLoadingDetails } = useQuery<FullDocumentDetails>({
    queryKey: [`/api/documents/${document.id}`],
    queryFn: async (): Promise<FullDocumentDetails> => {
      const response = await fetch(`/api/documents/${document.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch document details');
      return response.json();
    }
  });

  // Fetch categories for display
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
    queryFn: async (): Promise<Category[]> => {
      const response = await fetch('/api/categories', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    }
  });

  const category = categories.find(c => c.id === fullDocument?.categoryId);

  // Initialize edit values when document data loads
  useEffect(() => {
    if (fullDocument) {
      setEditName(fullDocument.name);
      setEditExpiryDate(fullDocument.expiryDate || "");
    }
  }, [fullDocument]);

  // Document update mutation
  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, name, expiryDate }: { id: number; name: string; expiryDate: string | null }) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expiryDate }),
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to update document');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document updated",
        description: "The document details have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${document.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setIsEditing(false);
      onUpdate?.();
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update the document. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const isImage = () => document.mimeType.startsWith('image/');
  const isPDF = () => document.mimeType === 'application/pdf';
  const getPreviewUrl = () => `/api/documents/${document.id}/preview`;

  const handleDownload = () => {
    window.open(`/api/documents/${document.id}/download`, '_blank');
  };

  const handleStartEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const hasNameChange = editName.trim() !== fullDocument?.name;
    const hasExpiryChange = editExpiryDate !== (fullDocument?.expiryDate || "");
    
    if (hasNameChange || hasExpiryChange) {
      updateDocumentMutation.mutate({ 
        id: document.id, 
        name: editName.trim(), 
        expiryDate: editExpiryDate || null 
      });
    } else {
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(fullDocument?.name || document.name);
    setEditExpiryDate(fullDocument?.expiryDate || "");
    setIsEditing(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { 
      year: "numeric",
      month: "long", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Initialize loading state for preview
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
      if (!error) {
        setError('Document loading took too long. Please try again.');
      }
    }, 5000);
    
    // For images, preload to ensure they work
    if (isImage()) {
      const img = new Image();
      img.onload = () => {
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      };
      img.onerror = () => {
        setError('Failed to load image');
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      };
      img.src = getPreviewUrl();
    } else {
      // For non-images, just stop loading immediately
      setIsLoading(false);
      clearTimeout(safetyTimeout);
    }
    
    return () => {
      clearTimeout(safetyTimeout);
    };
  }, [document.id, error]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-7xl w-full max-h-[95vh] overflow-hidden flex">
        {/* Document Preview Panel */}
        <div className="flex-1 flex flex-col">
          {/* Preview Header */}
          <div className="flex items-center justify-between p-4 border-b border-r">
            <div className="flex items-center gap-2">
              <FileIcon className="w-5 h-5 text-blue-600" />
              <span className="font-medium">Document Preview</span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleDownload} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>

          {/* Preview Content */}
          <div className="flex-1 p-4 overflow-auto">
            {isLoading && (
              <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading document...</p>
                </div>
              </div>
            )}
            
            {error && (
              <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium">Preview failed</p>
                  <p className="text-sm text-gray-600 mb-4">{error}</p>
                  <Button onClick={handleDownload} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download Instead
                  </Button>
                </div>
              </div>
            )}

            {!isLoading && !error && isImage() && (
              <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
                <img
                  src={getPreviewUrl()}
                  alt={document.name}
                  className="max-w-full max-h-full object-contain rounded"
                />
              </div>
            )}

            {!isLoading && !error && isPDF() && (
              <div className="h-full bg-gray-50 rounded-lg">
                <iframe
                  src={getPreviewUrl()}
                  className="w-full h-full border-0 rounded-lg"
                  title={document.name}
                />
              </div>
            )}

            {!isLoading && !error && !isImage() && !isPDF() && (
              <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium">Preview not available</p>
                  <p className="text-sm text-gray-600 mb-4">File type: {document.mimeType}</p>
                  <Button onClick={handleDownload} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download File
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Document Properties Panel */}
        <div className="w-96 border-l bg-gray-50 flex flex-col">
          {/* Properties Header */}
          <div className="flex items-center justify-between p-4 border-b bg-white">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              <span className="font-medium">Document Properties</span>
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleStartEdit}>
                    <Edit3 className="w-4 h-4 mr-2" />
                    Edit Properties
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={onClose} variant="ghost" size="sm">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Properties Content */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {/* Basic Information */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-700">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isEditing ? (
                    <div>
                      <Label htmlFor="edit-name" className="text-xs text-gray-600">Document Name</Label>
                      <Input
                        id="edit-name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1"
                        placeholder="Enter document name"
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs text-gray-600">Document Name</Label>
                      <p className="text-sm font-medium mt-1">{fullDocument?.name || document.name}</p>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs text-gray-600">File Name</Label>
                    <p className="text-sm mt-1">{fullDocument?.fileName || 'Loading...'}</p>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-600">File Type</Label>
                    <p className="text-sm mt-1">{document.mimeType}</p>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-600">File Size</Label>
                    <p className="text-sm mt-1">{formatFileSize(document.fileSize)}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Category and Tags */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-700">Organization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {category ? (
                    <div>
                      <Label className="text-xs text-gray-600">Category</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full flex items-center justify-center text-xs"
                          style={{ backgroundColor: category.color }}
                        >
                          <span className="text-white">{category.icon}</span>
                        </div>
                        <span className="text-sm">{category.name}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs text-gray-600">Category</Label>
                      <p className="text-sm mt-1 text-gray-500">No category assigned</p>
                    </div>
                  )}

                  {fullDocument?.tags && fullDocument.tags.length > 0 && (
                    <div>
                      <Label className="text-xs text-gray-600">Tags</Label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {fullDocument.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            <Tag className="w-3 h-3 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Dates */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-700">Important Dates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isEditing ? (
                    <div>
                      <Label htmlFor="edit-expiry" className="text-xs text-gray-600">Expiry Date (Optional)</Label>
                      <Input
                        id="edit-expiry"
                        type="date"
                        value={editExpiryDate}
                        onChange={(e) => setEditExpiryDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs text-gray-600">Expiry Date</Label>
                      <p className="text-sm mt-1">
                        {fullDocument?.expiryDate ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(fullDocument.expiryDate)}
                          </span>
                        ) : (
                          <span className="text-gray-500">No expiry date set</span>
                        )}
                      </p>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs text-gray-600">Upload Date</Label>
                    <p className="text-sm mt-1">
                      {fullDocument?.uploadedAt ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(fullDocument.uploadedAt)}
                        </span>
                      ) : (
                        'Loading...'
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Processing Information */}
              {fullDocument && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-700">Processing Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs text-gray-600">OCR Processed</Label>
                      <p className="text-sm mt-1">
                        <Badge variant={fullDocument.ocrProcessed ? "default" : "secondary"}>
                          {fullDocument.ocrProcessed ? "Yes" : "No"}
                        </Badge>
                      </p>
                    </div>

                    {fullDocument.summary && (
                      <div>
                        <Label className="text-xs text-gray-600">AI Summary</Label>
                        <div className="mt-1 p-2 bg-blue-50 rounded-md">
                          <p className="text-sm">{fullDocument.summary}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* AI Document Insights */}
              {fullDocument && (
                <DocumentInsights 
                  documentId={document.id}
                  documentName={fullDocument.name}
                />
              )}

              {/* Edit Actions */}
              {isEditing && (
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={handleSaveEdit} 
                    className="flex-1"
                    disabled={updateDocumentMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button 
                    onClick={handleCancelEdit} 
                    variant="outline"
                    disabled={updateDocumentMutation.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}