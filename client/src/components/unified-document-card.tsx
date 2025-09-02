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
      return "bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200";
    } else {
      return "bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200";
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
    cardBorderClass = "border-l-4 border-l-accent-purple-500";
  } else if (openInsights.some(i => i.priority === 'medium')) {
    cardBorderClass = "border-l-4 border-l-accent-purple-400";
  } else if (openInsights.length > 0) {
    cardBorderClass = "border-l-4 border-l-accent-purple-300";
  }

  return (
    <>
      <Card 
        className={`mobile-document-card group dashboard-card hover:shadow-lg hover:scale-[1.01] transition-all duration-300 ${cardBorderClass} ${isSelected ? "ring-2 ring-accent-purple-500" : ""} cursor-pointer bg-gradient-to-br from-accent-purple-50/30 via-accent-purple-50/20 to-accent-purple-100/30 border-accent-purple-200/60 overflow-hidden shadow-sm`}
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
        <CardContent className={`p-2 sm:p-2.5 pb-2.5 relative mobile-document-card-content h-auto overflow-hidden card-content`}>
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

          {/* List View Layout */}
          <div className="flex items-center gap-2.5 min-h-0">
            {/* Document thumbnail */}
            <div className="relative w-9 h-9 flex-shrink-0 rounded-md border border-accent-purple-200/60 bg-gradient-to-br from-accent-purple-50 to-accent-purple-100/50 overflow-hidden shadow-sm">
              {thumbnailError ? (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-purple-200/80 to-accent-purple-300/70 text-accent-purple-700">
                  {getFileIcon()}
                </div>
              ) : (
                <img
                  src={`/api/documents/${document.id}/thumbnail`}
                  alt={document.name}
                  className="w-full h-full object-cover"
                  onError={() => setThumbnailError(true)}
                />
              )}
            </div>

            {/* Document info - main content */}
            <div className="flex-1 min-w-0">
              {isRenaming ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={handleRenameKeyPress}
                    className="text-sm h-7 flex-1"
                    autoFocus
                    placeholder="Enter new document name"
                  />
                  <Button size="sm" variant="ghost" onClick={handleSaveRename} disabled={updateDocumentMutation.isPending} className="h-7 w-7 p-0">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelRename} disabled={updateDocumentMutation.isPending} className="h-7 w-7 p-0">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Document title */}
                  <h3 className="font-medium text-sm leading-tight text-gray-900 truncate">
                    {document.name}
                  </h3>

                  {/* Document metadata */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span>{formatFileSize(document.fileSize)}</span>
                    <span>•</span>
                    <span>{formatDate(document.uploadedAt)}</span>
                    {category && (
                      <>
                        <span>•</span>
                        <span className="truncate max-w-[100px]">{category.name}</span>
                      </>
                    )}
                    {document.expiryDate && (
                      <>
                        <span>•</span>
                        <span className="text-orange-600">Due {formatDate(document.expiryDate)}</span>
                      </>
                    )}
                  </div>

                  {/* Insights section - on separate line */}
                  {showInsights && (
                    <div className="flex items-center gap-1.5">
                      {openInsights.length > 0 ? (
                        <>
                          {/* Priority indicators first */}
                          {criticalInsights.length > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 border border-red-200">
                                    <AlertTriangle className="h-3 w-3 text-red-600" />
                                    <span className="text-xs font-bold text-red-700">{criticalInsights.length}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{criticalInsights.length} Critical</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}

                          {openInsights.filter(i => i.priority === 'medium').length > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200">
                                    <Clock className="h-3 w-3 text-orange-600" />
                                    <span className="text-xs font-medium text-orange-700">{openInsights.filter(i => i.priority === 'medium').length}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{openInsights.filter(i => i.priority === 'medium').length} Medium</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}

                          {/* Total insights button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-5 px-1.5 bg-accent-purple-50 border-accent-purple-200 text-accent-purple-700 hover:bg-accent-purple-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalInitialTab('insights');
                              setShowModal(true);
                            }}
                          >
                            <Brain className="h-2.5 w-2.5 mr-1" />
                            <span className="text-xs font-medium">{openInsights.length} insight{openInsights.length > 1 ? 's' : ''}</span>
                          </Button>
                        </>
                      ) : (
                        // No insights - show generate button
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 px-1.5 bg-gradient-to-r from-accent-purple-500 to-accent-purple-600 text-white border-accent-purple-400 hover:from-accent-purple-600 hover:to-accent-purple-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateInsightsMutation.mutate();
                          }}
                          disabled={generateInsightsMutation.isPending || insightsLoading}
                        >
                          {generateInsightsMutation.isPending ? (
                            <>
                              <Clock className="h-2.5 w-2.5 mr-1 animate-spin" />
                              <span className="text-xs font-medium">Analyzing...</span>
                            </>
                          ) : (
                            <>
                              <Brain className="h-2.5 w-2.5 mr-1" />
                              <span className="text-xs font-medium">Generate Insights</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions dropdown for list view */}
            {!isEditing && !isRenaming && (
              <div className="flex-shrink-0 ml-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 bg-white/90 hover:bg-accent-purple-50 border-0 rounded-full shadow-sm hover:shadow-md transition-all duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3 text-gray-500 hover:text-accent-purple-600" />
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
                    }} className="text-accent-purple-600 hover:text-accent-purple-700">
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