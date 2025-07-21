import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Image, MoreHorizontal, Download, Trash2, Eye, Edit2, Check, X, FileSearch } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import DocumentModal from "./document-modal";

interface Document {
  id: number;
  userId: string;
  categoryId: number | null;
  name: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  tags: string[] | null;
  extractedText: string | null;
  ocrProcessed: boolean | null;
  uploadedAt: string;
}

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

interface DocumentCardProps {
  document: Document;
  categories: Category[];
  viewMode: "grid" | "list";
}

export default function DocumentCard({ document, categories, viewMode }: DocumentCardProps) {
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);

  const category = categories.find(c => c.id === document.categoryId);

  const updateNameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      return await apiRequest(`/api/documents/${id}/name`, "PATCH", { name });
    },
    onSuccess: () => {
      toast({
        title: "Document renamed",
        description: "The document name has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setIsEditing(false);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Rename failed",
        description: "Failed to rename the document. Please try again.",
        variant: "destructive",
      });
      setEditName(document.name);
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete document");
    },
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "The document has been successfully removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/stats"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Delete failed",
        description: "Failed to delete the document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const ocrMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/documents/${id}/ocr`, "POST");
    },
    onSuccess: (data: any) => {
      toast({
        title: "Text extracted",
        description: `Successfully extracted ${data.extractedText?.length || 0} characters of text.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "OCR failed",
        description: "Failed to extract text from the document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getFileIcon = () => {
    if (document.mimeType.startsWith('image/')) {
      return <Image className="h-6 w-6" />;
    }
    return <FileText className="h-6 w-6" />;
  };

  const getFileIconColor = () => {
    if (document.mimeType === 'application/pdf') return 'text-red-600 bg-red-100';
    if (document.mimeType.startsWith('image/')) return 'text-yellow-600 bg-yellow-100';
    return 'text-blue-600 bg-blue-100';
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
      month: "short", 
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
    });
  };

  const handleDownload = () => {
    window.open(`/api/documents/${document.id}/download`, '_blank');
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this document?')) {
      deleteMutation.mutate(document.id);
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditName(document.name);
  };

  const handleSaveEdit = () => {
    if (editName.trim() && editName.trim() !== document.name) {
      updateNameMutation.mutate({ id: document.id, name: editName.trim() });
    } else {
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(document.name);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const supportsOCR = () => {
    return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'].includes(document.mimeType);
  };

  const handleProcessOCR = () => {
    ocrMutation.mutate(document.id);
  };

  if (viewMode === "list") {
    return (
      <>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 flex-1" onClick={isEditing ? undefined : () => setShowModal(true)}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getFileIconColor()}`}>
                  {getFileIcon()}
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={handleKeyPress}
                        className="text-sm h-7"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" onClick={handleSaveEdit} disabled={updateNameMutation.isPending} className="h-7 w-7 p-0">
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={updateNameMutation.isPending} className="h-7 w-7 p-0">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <h3 className="font-medium text-sm truncate">{document.name}</h3>
                  )}
                  <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                    <span>{category?.name || "Uncategorized"}</span>
                    <span>•</span>
                    <span>{formatFileSize(document.fileSize)}</span>
                    <span>•</span>
                    <span>{formatDate(document.uploadedAt)}</span>
                    {supportsOCR() && document.ocrProcessed && (
                      <>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          Text Extracted
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {document.tags && document.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {document.tags.slice(0, 2).map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {document.tags.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{document.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowModal(true)}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleStartEdit}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    {supportsOCR() && (
                      <DropdownMenuItem 
                        onClick={handleProcessOCR}
                        disabled={ocrMutation.isPending}
                      >
                        <FileSearch className="h-4 w-4 mr-2" />
                        {document.ocrProcessed ? 'Re-extract Text' : 'Extract Text'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem 
                      onClick={handleDelete}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>

        <DocumentModal
          document={document}
          category={category}
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      </>
    );
  }

  return (
    <>
      <Card className="border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getFileIconColor()}`}>
              {getFileIcon()}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowModal(true)}>
                  <Eye className="h-4 w-4 mr-2" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleStartEdit}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </DropdownMenuItem>
                {supportsOCR() && (
                  <DropdownMenuItem 
                    onClick={handleProcessOCR}
                    disabled={ocrMutation.isPending}
                  >
                    <FileSearch className="h-4 w-4 mr-2" />
                    {document.ocrProcessed ? 'Re-extract Text' : 'Extract Text'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <div onClick={isEditing ? undefined : () => setShowModal(true)}>
            {isEditing ? (
              <div className="mb-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="text-sm h-7 mb-2"
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={handleSaveEdit} disabled={updateNameMutation.isPending} className="h-6 w-6 p-0">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={updateNameMutation.isPending} className="h-6 w-6 p-0">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <h3 className="font-medium text-sm mb-1 truncate">{document.name}</h3>
            )}
            <p className="text-xs text-gray-500 mb-2">{category?.name || "Uncategorized"}</p>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>{formatFileSize(document.fileSize)}</span>
              <span>{formatDate(document.uploadedAt)}</span>
            </div>
            
            {supportsOCR() && document.ocrProcessed && (
              <div className="mb-2">
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  Text Extracted
                </Badge>
              </div>
            )}
            
            {document.tags && document.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {document.tags.slice(0, 2).map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {document.tags.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{document.tags.length - 2}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <DocumentModal
        document={document}
        category={category}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onDownload={handleDownload}
        onDelete={handleDelete}
      />
    </>
  );
}
