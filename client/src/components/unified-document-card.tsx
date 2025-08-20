import { useState } from "react";
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
  viewMode?: "grid" | "list";
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  onUpdate?: () => void;
  showInsights?: boolean;
  autoExpandCritical?: boolean;
  onClick?: (initialTab?: string) => void;
}

const insightTypeConfig = {
  summary: { icon: FileText, label: 'Summary', color: 'bg-blue-100 text-blue-800' },
  action_items: { icon: ListTodo, label: 'Action Items', color: 'bg-orange-100 text-orange-800' },
  key_dates: { icon: Calendar, label: 'Key Dates', color: 'bg-purple-100 text-purple-800' },
  financial_info: { icon: DollarSign, label: 'Financial Info', color: 'bg-green-100 text-green-800' },
  contacts: { icon: Users, label: 'Contacts', color: 'bg-indigo-100 text-indigo-800' },
  compliance: { icon: Shield, label: 'Compliance', color: 'bg-red-100 text-red-800' }
};

const priorityConfig = {
  high: { color: 'border-l-red-500 bg-red-50', badgeColor: 'bg-red-100 text-red-800', icon: AlertTriangle },
  medium: { color: 'border-l-yellow-500 bg-yellow-50', badgeColor: 'bg-yellow-100 text-yellow-800', icon: Clock },
  low: { color: 'border-l-blue-500 bg-blue-50', badgeColor: 'bg-blue-100 text-blue-800', icon: Info }
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

  const colorClass = priority === 'high' ? 'text-red-500' : 
                    priority === 'medium' ? 'text-yellow-500' : 'text-blue-500';

  return <IconComponent className={`${className} ${colorClass}`} />;
}

export default function UnifiedDocumentCard({ 
  document, 
  categories = [], 
  viewMode = "grid", 
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
  const { toast } = useToast();

  const category = categories?.find(c => c.id === document.categoryId);

  // Generate insights mutation with auto-OCR support
  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/documents/${document.id}/insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const responseData = await response.json();

      // Handle OCR processing response (202 status)
      if (response.status === 202) {
        return {
          status: 'processing',
          message: responseData.message,
          ocrJobId: responseData.ocrJobId,
          estimatedTime: responseData.estimatedTime
        };
      }

      if (!response.ok) {
        throw new Error(responseData.message || 'Failed to generate insights');
      }

      return responseData;
    },
    onSuccess: (data) => {
      if (data.status === 'processing') {
        // Handle OCR processing status
        toast({
          title: "Processing Document",
          description: data.message || "Text extraction in progress. Insights will be available shortly.",
          duration: 5000
        });

        // Set up polling to check when OCR is complete
        const pollForCompletion = () => {
          const interval = setInterval(async () => {
            try {
              // Refetch document to check if extractedText is now available
              const docResponse = await fetch(`/api/documents/${document.id}`, {
                credentials: 'include'
              });

              if (docResponse.ok) {
                const docData = await docResponse.json();
                if (docData.extractedText && docData.extractedText.trim()) {
                  clearInterval(interval);

                  // Retry insights generation now that OCR is complete
                  setTimeout(() => {
                    generateInsightsMutation.mutate();
                  }, 1000);
                }
              }
            } catch (error) {
              console.error('Error polling for OCR completion:', error);
            }
          }, 3000); // Poll every 3 seconds

          // Stop polling after 2 minutes
          setTimeout(() => clearInterval(interval), 120000);
        };

        pollForCompletion();
      } else {
        // Handle successful insights generation
        toast({
          title: "Insights Generated",
          description: `Generated ${data.insights?.length || 0} insights in ${data.processingTime || 0}ms`
        });

        // Invalidate insights queries to refresh the data
        queryClient.invalidateQueries({
          queryKey: [`/api/documents/${document.id}/insights`]
        });
        queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
      }
    },
    onError: (error: any) => {
      console.error('Error generating insights:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate document insights",
        variant: "destructive"
      });
    }
  });

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
  const criticalInsights = openInsights.filter(i => i.priority === 'high');
  const highestPriorityInsight = openInsights.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  })[0];

  // Auto-expand critical insights
  const shouldAutoExpand = autoExpandCritical && criticalInsights.length > 0;

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

  const updateInsightStatusMutation = useMutation({
    mutationFn: async ({ insightId, status }: { insightId: string; status: 'open' | 'resolved' | 'dismissed' }) => {
      console.log('[DEBUG] Updating insight status:', insightId, 'to', status);
      const response = await fetch(`/api/insights/${insightId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include',
      });
      if (!response.ok) {
        console.error('[DEBUG] Failed to update insight status:', response.status, response.statusText);
        throw new Error('Failed to update insight status');
      }
      console.log('[DEBUG] Successfully updated insight status');
      return response.json();
    },
    onSuccess: () => {
      console.log('[DEBUG] Insight status update successful, invalidating queries');
      // Invalidate the specific document insights query
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${document.id}/insights`] });
      queryClient.refetchQueries({ queryKey: [`/api/documents/${document.id}/insights`] });
      // Also invalidate global insights queries
      queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      toast({
        title: "Insight dismissed",
        description: "The insight has been successfully dismissed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: "Failed to update insight status. Please try again.",
        variant: "destructive",
      });
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
      return <Image className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const getFileTypeIconColor = () => {
    if (document.mimeType?.startsWith("image/")) {
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    } else if (document.mimeType === "application/pdf") {
      return "bg-red-100 text-red-700 border-red-200";
    } else {
      return "bg-blue-100 text-blue-700 border-blue-200";
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

  // Determine card border color based on highest priority insight
  let cardBorderClass = "";
  if (criticalInsights.length > 0) {
    cardBorderClass = "border-l-4 border-l-red-500";
  } else if (openInsights.some(i => i.priority === 'medium')) {
    cardBorderClass = "border-l-4 border-l-yellow-500";
  } else if (openInsights.length > 0) {
    cardBorderClass = "border-l-4 border-l-blue-500";
  }

  return (
    <>
      <Card 
        className={`mobile-document-card group hover:shadow-md hover:scale-[1.01] transition-all duration-200 ${cardBorderClass} ${isSelected ? "ring-2 ring-blue-500" : ""} cursor-pointer bg-white border-gray-200 overflow-hidden`}
        onClick={() => {
          if (isRenaming || isEditing) {
            // Prevent modal from opening when in edit/rename mode
            return;
          }
          if (bulkMode) {
            onToggleSelection?.();
          } else if (onClick) {
            onClick();
          } else {
            setModalInitialTab('properties');
            setShowModal(true);
          }
        }}
      >
        <CardContent className="p-2 sm:p-3 pb-3 relative mobile-document-card-content h-full flex flex-col overflow-hidden">
            {/* Bulk selection checkbox */}
            {bulkMode && (
              <div className="absolute top-0.5 left-0.5 z-10">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection?.();
                  }}
                  className="w-4 h-4 p-0"
                >
                  {isSelected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                </Button>
              </div>
            )}

          <div className="h-full flex flex-col justify-between gap-1">
            {/* Compact header */}
            <div className="flex items-start justify-between min-h-0">
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-sm font-medium"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                    />
                    <Input
                      type="date"
                      value={editImportantDate}
                      onChange={(e) => setEditImportantDate(e.target.value)}
                      className="text-sm"
                      placeholder="Important date"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit} disabled={updateDocumentMutation.isPending}>
                        <Check className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-start gap-2">
                      <div className={`p-1 rounded ${getFileTypeIconColor()} border flex-shrink-0`}>
                        <div className="scale-75">
                          {getFileIcon()}
                        </div>
                      </div>
                      {isRenaming ? (
                        <div className="flex-1 space-y-2">
                          <Input
                            value={renameName}
                            onChange={(e) => setRenameName(e.target.value)}
                            onKeyDown={handleRenameKeyPress}
                            className="text-sm h-7"
                            autoFocus
                            placeholder="Enter new document name"
                          />
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={handleSaveRename} disabled={updateDocumentMutation.isPending} className="h-6 w-6 p-0">
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleCancelRename} disabled={updateDocumentMutation.isPending} className="h-6 w-6 p-0">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <h3 className="font-medium text-sm leading-tight text-gray-900 line-clamp-3 flex-1 min-w-0">
                          {document.name}
                        </h3>
                      )}
                    </div>
                    {document.expiryDate && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 ml-8 hidden-on-mobile">
                        <Calendar className="h-3 w-3" />
                        <span className="text-xs truncate">{formatDate(document.expiryDate)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions dropdown */}
              {!isEditing && !isRenaming && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 flex-shrink-0 opacity-60 hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      if (onClick) {
                        onClick();
                      } else {
                        setModalInitialTab('properties');
                        setShowModal(true);
                      }
                    }}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleDownload();
                    }}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
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
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setShowShareDialog(true);
                    }}>
                      <FileSearch className="h-4 w-4 mr-2" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(e);
                    }} className="text-red-600">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Insights Banner */}
            {showInsights && openInsights.length > 0 && (
              <div 
                className={`mb-2 px-2 py-1.5 rounded text-xs font-medium flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity ${
                  criticalInsights.length > 0 
                    ? 'bg-red-50 text-red-800 border border-red-200' 
                    : openInsights.some(i => i.priority === 'medium')
                    ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClick) {
                    // Open document viewer with insights tab
                    onClick('insights');
                  } else {
                    setModalInitialTab('insights');
                    setShowModal(true);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <Brain className="h-3.5 w-3.5" />
                  <span>
                    {openInsights.length} insight{openInsights.length !== 1 ? 's' : ''}
                    {criticalInsights.length > 0 && (
                      <span className="ml-1 text-red-600 font-semibold">• {criticalInsights.length} critical</span>
                    )}
                  </span>
                </div>
                <div className="text-xs opacity-70">Tap to view</div>
              </div>
            )}

            {/* Rich footer with metadata */}
            <div className="mt-auto mb-1">
              {/* Bottom row with file size and category */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 text-xs">{formatFileSize(document.fileSize)}</span>
                
                {category && (
                  <Badge variant="outline" className="text-xs bg-gray-50 border-gray-300 px-1 py-0 badge">
                    <FolderIcon className="h-2.5 w-2.5 mr-0.5" />
                    <span className="truncate max-w-[40px]">{category.name}</span>
                  </Badge>
                )}
              </div>
            </div>

            {/* Tags positioned at same level as brain icon */}
            {document.tags && document.tags.length > 0 && (
              <div className="absolute bottom-7 left-2">
                <div className="flex items-center gap-1 flex-wrap">
                  {document.tags.slice(0, 2).map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs bg-gray-100 px-1 py-0 badge">
                      <Tag className="h-2.5 w-2.5 mr-0.5" />
                      <span className="truncate max-w-[40px]">{tag}</span>
                    </Badge>
                  ))}
                  {document.tags.length > 2 && (
                    <Badge variant="secondary" className="text-xs bg-gray-100 px-1 py-0 badge">
                      +{document.tags.length - 2}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* No insights state - brain icon in bottom right */}
            {showInsights && openInsights.length === 0 && !insightsLoading && (
              <div className="absolute bottom-8 right-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 rounded-full hover:bg-blue-50 hover:text-blue-600 opacity-60 hover:opacity-100 transition-all"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          generateInsightsMutation.mutate();
                        }}
                        disabled={generateInsightsMutation.isPending}
                      >
                        {generateInsightsMutation.isPending ? (
                          <Clock className="h-4 w-4 animate-spin" />
                        ) : (
                          <Brain className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{generateInsightsMutation.isPending ? 'Generating insights...' : 'Generate AI insights'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="w-full h-full bg-white overflow-hidden">
            <EnhancedDocumentViewer
              document={document}
              onClose={() => setShowModal(false)}
              onUpdate={onUpdate}
              onDownload={handleDownload}
              initialTab={modalInitialTab}
            />
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