import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  FileText, 
  Image, 
  MoreHorizontal, 
  Download, 
  Trash2, 
  Eye, 
  Edit2, 
  Check, 
  X, 
  FileSearch, 
  Calendar, 
  AlertTriangle, 
  Clock, 
  CheckSquare, 
  Square,
  Brain,
  DollarSign,
  Users,
  Shield,
  ListTodo,
  Info,
  Zap,
  AlertCircle,
  FolderIcon,
  Tag,
  Type
} from "lucide-react";
import { ShareDocumentDialog } from "./share-document-dialog";
import { EnhancedDocumentViewer } from "./enhanced-document-viewer";
import { format } from "date-fns";

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
  status?: string | null;
  uploadSource?: string | null;
}

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

interface DocumentInsight {
  id: string;
  documentId: number;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  confidence: number;
  status: 'open' | 'resolved' | 'dismissed';
  dueDate?: string;
  createdAt: string;
}

interface UnifiedDocumentCardProps {
  document: Document;
  categories?: Category[];
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  onUpdate?: () => void;
  showInsights?: boolean;
  autoExpandCritical?: boolean;
  onClick?: (initialTab?: string) => void;
}

const insightTypeConfig = {
  summary: { icon: FileText, label: 'Summary', color: 'bg-accent-purple-100 text-accent-purple-800' },
  action_items: { icon: ListTodo, label: 'Action Items', color: 'bg-accent-purple-200 text-accent-purple-900' },
  key_dates: { icon: Calendar, label: 'Key Dates', color: 'bg-accent-purple-300 text-accent-purple-900' },
  financial_info: { icon: DollarSign, label: 'Financial Info', color: 'bg-accent-purple-400 text-white' },
  contacts: { icon: Users, label: 'Contacts', color: 'bg-accent-purple-500 text-white' },
  compliance: { icon: Shield, label: 'Compliance', color: 'bg-accent-purple-600 text-white' }
};

const priorityConfig = {
  high: { color: 'border-l-accent-purple-500 bg-accent-purple-50', badgeColor: 'bg-accent-purple-100 text-accent-purple-800', icon: AlertTriangle },
  medium: { color: 'border-l-accent-purple-400 bg-accent-purple-25', badgeColor: 'bg-accent-purple-100 text-accent-purple-700', icon: Clock },
  low: { color: 'border-l-accent-purple-300 bg-accent-purple-25', badgeColor: 'bg-accent-purple-50 text-accent-purple-600', icon: Info }
};

function formatDueDate(dateString?: string) {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays > 0 && diffDays <= 7) return `${diffDays} days`;
    if (diffDays < 0) return "Overdue";

    return format(date, "MMM dd");
  } catch {
    return null;
  }
}

function getPriorityIcon(priority: string, className = "w-4 h-4") {
  const config = priorityConfig[priority as keyof typeof priorityConfig];
  const IconComponent = config?.icon || Info;

  const colorClass = priority === 'high' ? 'text-accent-purple-500' : 
                    priority === 'medium' ? 'text-accent-purple-400' : 'text-accent-purple-300';

  return <IconComponent className={`${className} ${colorClass}`} />;
}

export default function UnifiedDocumentCard({ 
  document, 
  categories = [], 
  bulkMode = false,
  isSelected = false,
  onToggleSelection,
  onUpdate,
  showInsights = true,
  autoExpandCritical = true,
  onClick
}: UnifiedDocumentCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<string>("properties");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState(document.name);
  const [editImportantDate, setEditImportantDate] = useState(document.expiryDate || "");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [thumbnailBlobUrl, setThumbnailBlobUrl] = useState<string | null>(null);

  // Fetch thumbnail as blob with authentication
  useEffect(() => {
    // Guard against missing document ID
    if (!document?.id) {
      return;
    }

    const fetchThumbnail = async () => {
      try {
        console.log(`[THUMBNAIL] Fetching thumbnail for document ${document.id}`);
        const thumbnailUrl = `/api/documents/${document.id}/thumbnail`;
        const response = await fetch(thumbnailUrl, {
          credentials: 'include',
          headers: {
            'Accept': 'image/*,image/svg+xml'
          }
        });
        
        console.log(`[THUMBNAIL] Response status: ${response.status}`);
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          console.log(`[THUMBNAIL] Content-Type: ${contentType}`);
          
          // If response is a data URL (text/plain), use it directly
          if (contentType.includes('text/plain')) {
            const dataUrl = await response.text();
            console.log(`[THUMBNAIL] Got data URL: ${dataUrl.substring(0, 100)}...`);
            if (dataUrl.startsWith('data:image/svg+xml')) {
              setThumbnailBlobUrl(dataUrl);
              setThumbnailError(false);
              console.log(`[THUMBNAIL] Successfully set SVG data URL`);
            } else {
              console.warn(`[THUMBNAIL] Invalid data URL format`);
              setThumbnailError(true);
            }
          } else {
            // For binary image data, create blob URL
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            console.log(`[THUMBNAIL] Created blob URL: ${blobUrl}`);
            setThumbnailBlobUrl(blobUrl);
            setThumbnailError(false);
          }
        } else {
          console.warn(`[THUMBNAIL] Request failed with status: ${response.status}`);
          setThumbnailError(true);
        }
      } catch (error) {
        console.warn(`Failed to fetch thumbnail for document ${document.id}:`, error);
        setThumbnailError(true);
      }
    };

    fetchThumbnail();

    // Cleanup blob URL on unmount
    return () => {
      if (thumbnailBlobUrl) {
        URL.revokeObjectURL(thumbnailBlobUrl);
      }
    };
  }, [document?.id]);
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
      return response.json();
    },
    enabled: showInsights,
  });

  // Extract insights array from the response object
  const insights: DocumentInsight[] = insightsData?.insights || [];

  // Calculate insight summary - filter out unwanted types
  const openInsights = insights.filter(i => 
    i.status === 'open' && 
    !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(i.type)
  );

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
      queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
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

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete document");
      // DELETE responses often return 204 (no content), so don't try to parse JSON if empty
      if (response.status === 204) return null;
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "The document has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
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
        title: "Delete failed",
        description: "Failed to delete the document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditName(document.name);
    setEditImportantDate(document.expiryDate || "");
  };

  const handleStartRename = () => {
    setIsRenaming(true);
    setRenameName(document.name);
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

  const handleRenameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
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

  const handleDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
      deleteDocumentMutation.mutate(document.id);
    }
  };

  const handleDownload = () => {
    window.open(`/api/documents/${document.id}/download`, '_blank');
  };

  const getFileIcon = () => {
    if (document.mimeType?.startsWith("image/")) {
      return <Image className="h-6 w-6" />;
    }
    return <FileText className="h-6 w-6" />;
  };

  const getFileTypeIconColor = () => {
    if (document.mimeType?.startsWith("image/")) {
      return "bg-purple-100 text-purple-700 border-purple-200";
    } else if (document.mimeType === "application/pdf") {
      return "bg-purple-100 text-purple-700 border-purple-200";
    } else {
      return "bg-purple-100 text-purple-700 border-purple-200";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "MMM dd, yyyy");
  };

  // State for thumbnail management

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
          className="flex items-center justify-center w-4 h-4 bg-purple-600 text-white text-xs font-semibold rounded-full"
          data-testid={`insights-badge-${document.id}`}
        >
          {displayCount}
        </div>
      );
    } else {
      // Show brain icon
      return (
        <Brain 
          className="h-3 w-3 text-purple-400" 
          data-testid={`insights-brain-${document.id}`}
        />
      );
    }
  };

  const handleCardClick = () => {
    if (bulkMode && onToggleSelection) {
      onToggleSelection();
    } else if (!bulkMode && !isEditing && !isRenaming) {
      if (onClick) {
        onClick();
      } else {
        setModalInitialTab('properties');
        setShowModal(true);
      }
    }
  };

  return (
    <>
      <Card 
        className={`mobile-document-card group relative bg-gradient-to-br from-white to-purple-50/20 rounded-lg border border-purple-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer hover:border-purple-300 hover:bg-gradient-to-br hover:from-purple-50/30 hover:to-purple-100/20 h-48 w-full ${isSelected ? "ring-2 ring-purple-500" : ""}`}
        onClick={handleCardClick}
        data-testid={`document-card-${document.id}`}
      >
        <CardContent className="mobile-document-card-content p-0 h-full flex flex-col relative">
          {/* Bulk Selection Checkbox - positioned absolutely */}
          {bulkMode && (
            <div className="absolute top-2 left-2 z-10 bg-white/90 rounded-full p-1 shadow-sm">
              <div className="w-5 h-5 flex items-center justify-center">
                {isSelected ? (
                  <CheckSquare className="h-5 w-5 text-purple-600" />
                ) : (
                  <Square className="h-5 w-5 text-gray-400" />
                )}
              </div>
            </div>
          )}

          {/* Thumbnail Section - full width and height */}
          <div 
            className="w-full bg-gray-50 flex items-center justify-center overflow-hidden rounded-t-lg"
            style={{ height: '70%' }}
          >
            {thumbnailError || !thumbnailBlobUrl ? (
              <div className={`w-full h-full flex items-center justify-center ${getFileTypeIconColor()}`}>
                <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-white/80">
                  {getFileIcon()}
                </div>
              </div>
            ) : (
              <img 
                src={thumbnailBlobUrl}
                alt={document.name}
                className="w-full h-full object-cover rounded-t-lg"
                onError={() => setThumbnailError(true)}
                data-testid={`document-thumbnail-${document.id}`}
              />
            )}
          </div>

          {/* Bottom Section - title area with more space */}
          <div 
            className="px-3 pt-2 pb-6 bg-white flex items-start justify-center relative"
            style={{ height: '30%', minHeight: '48px' }}
          >
            {/* Title - Centered and higher up */}
            <div className="flex-1 min-w-0 text-center">
              {isRenaming ? (
                <div className="space-y-1">
                  <Input
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={handleRenameKeyPress}
                    className="text-sm h-6 text-gray-900"
                    autoFocus
                    placeholder="Enter new document name"
                  />
                  <div className="flex gap-1 justify-center">
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
                  className="font-medium text-sm text-gray-900 truncate leading-tight mt-1"
                  title={document.name}
                  data-testid={`document-title-${document.id}`}
                >
                  {document.name}
                </h3>
              )}
            </div>

            {/* Icons positioned at bottom corners of the bottom section */}
            {/* Insights Indicator - Bottom Left */}
            <div className="absolute bottom-2 left-2 z-20">
              {renderInsightsIndicator()}
            </div>

            {/* Overflow Menu - Bottom Right */}
            {!bulkMode && (
              <div className="absolute bottom-2 right-2 z-20">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-4 w-4 p-0 rounded-full hover:bg-purple-100 opacity-70 hover:opacity-100 transition-opacity bg-white/90 border border-purple-200"
                      data-testid={`document-menu-${document.id}`}
                    >
                      <MoreHorizontal className="h-2 w-2 text-purple-600" />
                    </Button>
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setModalInitialTab('properties');
                        setShowModal(true);
                      }}>
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
                      <DropdownMenuItem onClick={handleDownload}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <ShareDocumentDialog documentId={document.id} documentName={document.name} />
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(e);
                        }}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
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
                initialTab={modalInitialTab}
                showCloseButton={false}
              />
            </div>
          </div>
        </div>
      )}

      {showShareDialog && (
        <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
          <ShareDocumentDialog
            documentId={document.id}
            documentName={document.name}
          />
        </Dialog>
      )}
    </>
  );
}