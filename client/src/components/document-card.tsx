import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Image, MoreHorizontal, Download, Trash2, Eye, Edit2, Check, X, FileSearch, Calendar, AlertTriangle, Clock, CheckSquare, Square, Brain, Type } from "lucide-react";
import { ShareDocumentDialog } from "./share-document-dialog";
import { EnhancedDocumentViewer } from "./enhanced-document-viewer";
import type { DocumentInsight } from "@shared/schema";
import { cn } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";

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
  summary: string | null;
  ocrProcessed: boolean | null;
  uploadedAt: string;
  expiryDate: string | null;
}

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

interface DocumentCardProps {
  document: Document;
  categories?: Category[];
  viewMode?: "grid" | "list";
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  onUpdate?: () => void;
  className?: string;
}

// Thumbnail component with error handling
function DocumentThumbnail({ 
  src, 
  alt, 
  documentId, 
  fallbackIcon, 
  fallbackIconColor 
}: {
  src: string;
  alt: string;
  documentId: number;
  fallbackIcon: React.ReactElement;
  fallbackIconColor: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${fallbackIconColor}`}>
        {fallbackIcon}
      </div>
    );
  }

  return (
    <img 
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setHasError(true)}
      data-testid={`document-thumbnail-${documentId}`}
    />
  );
}

export default function DocumentCard({ 
  document, 
  categories = [], 
  viewMode = "grid", 
  bulkMode = false,
  isSelected = false,
  onToggleSelection,
  onUpdate,
  className 
}: DocumentCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [renameName, setRenameName] = useState(document.name);
  const [editImportantDate, setEditImportantDate] = useState(document.expiryDate || "");
  const { toast } = useToast();

  const category = categories?.find(c => c.id === document.categoryId);

  // Fetch insights for this document
  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: [`/api/documents/${document.id}/insights`],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${document.id}/insights`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch insights');
      const data = await response.json();
      return data;
    },
  });

  // Extract insights array from the response object
  const insights: DocumentInsight[] = insightsData?.insights || [];

  // Calculate insight summary - filter out unwanted types
  const openInsights = insights.filter(i => 
    i.status === 'open' && 
    !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(i.type)
  );

  // Calculate insights count for badge
  const insightsCount = openInsights.length;
  const hasOcrCompleted = document.ocrProcessed;

  // Insights indicator component
  const renderInsightsIndicator = () => {
    if (insightsCount > 0 && hasOcrCompleted) {
      // Show circular badge with count (cap at 99+)
      const displayCount = insightsCount > 99 ? '99+' : insightsCount.toString();
      return (
        <div 
          className="flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-semibold rounded-full"
          data-testid={`insights-badge-${document.id}`}
        >
          {displayCount}
        </div>
      );
    } else {
      // Show brain icon
      return (
        <Brain 
          className="h-5 w-5 text-gray-400" 
          data-testid={`insights-brain-${document.id}`}
        />
      );
    }
  };

  // Get thumbnail URL for ALL documents (not just images)
  const thumbnailUrl = `/api/documents/${document.id}/thumbnail`;

  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, name, expiryDate }: { id: number; name: string; expiryDate: string | null }) => {
      const response = await apiRequest("PATCH", `/api/documents/${id}`, { 
        name, 
        expiryDate: expiryDate || null 
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document updated",
        description: "The document details have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/expiry-alerts"] });
      setIsEditing(false);
      setIsRenaming(false);
      onUpdate?.();
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
        title: "Update failed",
        description: "Failed to update the document. Please try again.",
        variant: "destructive",
      });
      setEditName(document.name);
      setEditImportantDate(document.expiryDate || "");
      setRenameName(document.name);
      setIsEditing(false);
      setIsRenaming(false);
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
          window.location.href = "/login";
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
      const response = await apiRequest("POST", `/api/documents/${id}/ocr`);
      return await response.json();
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
          window.location.href = "/login";
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
    if (document.mimeType === 'application/pdf') return 'text-red-600 bg-red-100 border-red-200';
    if (document.mimeType.startsWith('image/')) return 'text-emerald-600 bg-emerald-100 border-emerald-200';
    if (document.mimeType.includes('word') || document.mimeType.includes('document')) return 'text-blue-600 bg-blue-100 border-blue-200';
    return 'text-indigo-600 bg-indigo-100 border-indigo-200';
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

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditName(document.name);
    setEditImportantDate(document.expiryDate || "");
  };

  const handleStartRename = () => {
    setIsRenaming(true);
    setRenameName(document.name);
  };

  const handleSaveEdit = () => {
    const hasNameChange = editName.trim() !== document.name;
    const hasExpiryChange = editImportantDate !== (document.expiryDate || "");

    if (hasNameChange || hasExpiryChange) {
      updateDocumentMutation.mutate({ 
        id: document.id, 
        name: editName.trim(), 
        expiryDate: editImportantDate || null 
      });
    } else {
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(document.name);
    setEditImportantDate(document.expiryDate || "");
    setIsEditing(false);
  };

  const handleSaveRename = () => {
    if (renameName.trim() !== document.name && renameName.trim() !== "") {
      updateDocumentMutation.mutate({ 
        id: document.id, 
        name: renameName.trim(), 
        expiryDate: document.expiryDate 
      });
    }
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setRenameName(document.name);
    setIsRenaming(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleRenameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };

  const handleDownload = () => {
    window.open(`/api/documents/${document.id}/download`, '_blank');
  };

  const handleDelete = () => {
    const documentName = document.name.length > 30 ? document.name.substring(0, 30) + '...' : document.name;
    const confirmMessage = `Are you sure you want to delete "${documentName}"?\n\nThis action cannot be undone. The document will be permanently removed from your account.`;

    if (confirm(confirmMessage)) {
      deleteMutation.mutate(document.id);
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
        <Card className={cn(
        "group relative bg-gradient-to-r from-white to-accent-purple-50/15 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer",
        "hover:border-accent-purple-300 hover:bg-gradient-to-r hover:from-accent-purple-50/25 hover:to-accent-purple-100/15",
        className
      )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 flex-1" onClick={(isEditing || isRenaming) ? undefined : () => setShowModal(true)}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getFileIconColor()}`}>
                  {getFileIcon()}
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2 flex-1">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Document Name</label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={handleKeyPress}
                          className="text-sm h-7"
                          autoFocus
                          placeholder="Enter document name"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Important Date (Optional)</label>
                        <Input
                          type="date"
                          value={editImportantDate}
                          onChange={(e) => setEditImportantDate(e.target.value)}
                          className="text-sm h-7"
                          placeholder="Select important date"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={handleSaveEdit} disabled={updateDocumentMutation.isPending} className="h-7 w-7 p-0">
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={updateDocumentMutation.isPending} className="h-7 w-7 p-0">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : isRenaming ? (
                    <div className="space-y-2 flex-1">
                      <div>
                        <Input
                          value={renameName}
                          onChange={(e) => setRenameName(e.target.value)}
                          onKeyDown={handleRenameKeyPress}
                          className="text-sm h-7"
                          autoFocus
                          placeholder="Enter new document name"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={handleSaveRename} disabled={updateDocumentMutation.isPending} className="h-7 w-7 p-0">
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleCancelRename} disabled={updateDocumentMutation.isPending} className="h-7 w-7 p-0">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="font-medium text-sm truncate">{document.name}</h3>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <span>{category?.name || "Uncategorized"}</span>
                          <span>•</span>
                          <span>{formatFileSize(document.fileSize)}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <span>{formatDate(document.uploadedAt)}</span>
                          {supportsOCR() && document.ocrProcessed && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 ml-2">
                              Text Extracted
                            </Badge>
                          )}
                          {insightsLoading && (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 ml-2">
                              <div className="animate-spin h-2 w-2 border border-blue-400 border-t-transparent rounded-full"></div>
                              Generating
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center ml-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex items-center justify-center">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowModal(true)}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename();
                    }}>
                      <Type className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit();
                    }}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    <ShareDocumentDialog documentId={document.id} documentName={document.name} />
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
      </>
    );
  }

  const handleCardClick = () => {
    if (bulkMode && onToggleSelection) {
      onToggleSelection();
    } else if (!bulkMode && !isEditing) {
      setShowModal(true);
    }
  };

  return (
    <>
      <Card 
        className={cn(
          "group relative bg-gradient-to-br from-white to-accent-purple-50/20 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer",
          "hover:border-accent-purple-300 hover:bg-gradient-to-br hover:from-accent-purple-50/30 hover:to-accent-purple-100/20",
          "h-64", // Fixed height for consistent card sizing
          className
        )}
        onClick={handleCardClick}
        data-testid={`document-card-${document.id}`}
      >
        <CardContent className="p-0 h-full flex flex-col">
          {/* Bulk Selection Checkbox - positioned absolutely */}
          {bulkMode && (
            <div className="absolute top-2 left-2 z-10 bg-white/90 rounded-full p-1 shadow-sm">
              <div className="w-5 h-5 flex items-center justify-center">
                {isSelected ? (
                  <CheckSquare className="h-5 w-5 text-accent-purple-600" />
                ) : (
                  <Square className="h-5 w-5 text-gray-400" />
                )}
              </div>
            </div>
          )}

          {/* Thumbnail Section - 75% height */}
          <div 
            className="relative flex-1 bg-gray-50 flex items-center justify-center overflow-hidden rounded-t-lg"
            style={{ height: '75%' }}
            onClick={(isEditing || isRenaming) ? undefined : () => setShowModal(true)}
          >
            {thumbnailUrl ? (
              <DocumentThumbnail
                src={thumbnailUrl}
                alt={document.name}
                documentId={document.id}
                fallbackIcon={getFileIcon()}
                fallbackIconColor={getFileIconColor()}
              />
            ) : (
              <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${getFileIconColor()}`}>
                {getFileIcon()}
              </div>
            )}
          </div>

          {/* Bottom Row - 25% height */}
          <div 
            className="flex items-center justify-between px-3 py-2 bg-white"
            style={{ height: '25%', minHeight: '48px' }}
          >
            {/* Title - Left aligned */}
            <div className="flex-1 min-w-0 mr-2">
              {isEditing ? (
                <div className="space-y-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleKeyPress}
                    className="text-sm h-6 text-gray-900"
                    autoFocus
                    placeholder="Enter document name"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={handleSaveEdit} disabled={updateDocumentMutation.isPending} className="h-5 w-5 p-0">
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={updateDocumentMutation.isPending} className="h-5 w-5 p-0">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : isRenaming ? (
                <div className="space-y-1">
                  <Input
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={handleRenameKeyPress}
                    className="text-sm h-6 text-gray-900"
                    autoFocus
                    placeholder="Enter new document name"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={handleSaveRename} disabled={updateDocumentMutation.isPending} className="h-5 w-5 p-0">
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelRename} disabled={updateDocumentMutation.isPending} className="h-5 w-5 p-0">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <h3 
                  className="font-semibold text-sm text-gray-900 truncate leading-tight"
                  title={document.name}
                  data-testid={`document-title-${document.id}`}
                >
                  {document.name}
                </h3>
              )}
            </div>

            {/* Insights Indicator - Center */}
            <div className="flex-shrink-0 mx-2">
              {renderInsightsIndicator()}
            </div>

            {/* Overflow Menu - Right aligned */}
            {!bulkMode && (
              <div className="flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 rounded-full hover:bg-gray-100"
                      data-testid={`document-menu-${document.id}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowModal(true)}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename();
                    }}>
                      <Type className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit();
                    }}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    <ShareDocumentDialog documentId={document.id} documentName={document.name} />
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
            )}
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-white rounded-lg w-full max-w-[95vw] lg:max-w-[90vw] max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-end p-2 border-b bg-[#FAF4EF]">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowModal(false)}
                className="flex-shrink-0 modal-header-close-btn"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-full max-h-[calc(90vh-4rem)]">
              <EnhancedDocumentViewer
                document={document}
                onClose={() => setShowModal(false)}
                onUpdate={onUpdate}
                onDownload={handleDownload}
                showCloseButton={false}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Helper component for important date badge  
function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const getExpiryStatus = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        text: `Expired ${Math.abs(diffDays)} days ago`,
        variant: "destructive" as const,
        icon: <AlertTriangle className="h-3 w-3" />
      };
    } else if (diffDays === 0) {
      return {
        text: "Expires today",
        variant: "destructive" as const,
        icon: <AlertTriangle className="h-3 w-3" />
      };
    } else if (diffDays <= 7) {
      return {
        text: `Expires in ${diffDays} days`,
        variant: "secondary" as const,
        icon: <Clock className="h-3 w-3" />
      };
    } else if (diffDays <= 30) {
      return {
        text: `Expires in ${diffDays} days`,
        variant: "outline" as const,
        icon: <Calendar className="h-3 w-3" />
      };
    } else {
      return {
        text: `Expires ${expiry.toLocaleDateString()}`,
        variant: "outline" as const,
        icon: <Calendar className="h-3 w-3" />
      };
    }
  };

  const status = getExpiryStatus(expiryDate);

  return (
    <Badge variant={status.variant} className="text-xs flex items-center gap-1">
      {status.icon}
      {status.text}
    </Badge>
  );
}