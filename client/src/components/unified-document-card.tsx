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
        className={`mobile-document-card group dashboard-card hover:shadow-lg ${viewMode === "list" ? "hover:scale-[1.01]" : "hover:scale-[1.02]"} transition-all duration-300 ${cardBorderClass} ${isSelected ? "ring-2 ring-accent-purple-500" : ""} cursor-pointer bg-gradient-to-br from-white via-accent-purple-50/10 to-accent-purple-100/20 border-accent-purple-200/50 overflow-hidden`}
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
        <CardContent className={`p-3 sm:p-4 pb-4 relative mobile-document-card-content ${viewMode === "list" ? "h-auto" : "h-full flex flex-col"} overflow-hidden card-content`}>
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
          {viewMode === "list" ? (
            <div className="flex items-center gap-4 min-h-0">
              {/* Document thumbnail */}
              <div className="relative w-12 h-12 flex-shrink-0 rounded-lg border-2 border-accent-purple-200/60 bg-gradient-to-br from-accent-purple-50 to-accent-purple-100/50 overflow-hidden shadow-sm">
                {thumbnailError ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-purple-100 to-accent-purple-200 text-accent-purple-600">
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
                      className="text-sm h-8 flex-1"
                      autoFocus
                      placeholder="Enter new document name"
                    />
                    <Button size="sm" variant="ghost" onClick={handleSaveRename} disabled={updateDocumentMutation.isPending} className="h-8 w-8 p-0">
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelRename} disabled={updateDocumentMutation.isPending} className="h-8 w-8 p-0">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-semibold text-base leading-tight text-gray-900 truncate mb-1">
                      {document.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>{formatFileSize(document.fileSize)}</span>
                      <span>•</span>
                      <span>{formatDate(document.uploadedAt)}</span>
                      {category && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <FolderIcon className="h-3 w-3" />
                            <span className="truncate max-w-[80px]">{category.name}</span>
                          </div>
                        </>
                      )}
                      {document.expiryDate && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1 text-orange-600">
                            <Calendar className="h-3 w-3" />
                            <span>Due {formatDate(document.expiryDate)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Insights section for list view */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {showInsights && (
                  <div className="flex items-center gap-2">
                    {openInsights.length > 0 ? (
                      <>
                        {/* Insight type breakdown */}
                        <div className="flex items-center gap-1">
                          {(() => {
                            const insightsByType = openInsights.reduce((acc, insight) => {
                              acc[insight.type] = (acc[insight.type] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>);

                            const typeConfigs = {
                              summary: { icon: FileText, color: 'text-accent-purple-600', label: 'Summary' },
                              action_items: { icon: ListTodo, color: 'text-accent-purple-600', label: 'Actions' },
                              key_dates: { icon: Calendar, color: 'text-accent-purple-600', label: 'Dates' },
                              financial_info: { icon: DollarSign, color: 'text-accent-purple-600', label: 'Financial' },
                              contacts: { icon: Users, color: 'text-accent-purple-600', label: 'Contacts' },
                              compliance: { icon: Shield, color: 'text-accent-purple-600', label: 'Compliance' }
                            };

                            return Object.entries(insightsByType).slice(0, 4).map(([type, count]) => {
                              const config = typeConfigs[type as keyof typeof typeConfigs] || typeConfigs.summary;
                              const IconComponent = config.icon;
                              
                              return (
                                <TooltipProvider key={type}>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent-purple-50 border border-accent-purple-200">
                                        <IconComponent className={`h-3 w-3 ${config.color}`} />
                                        <span className="text-xs font-medium text-accent-purple-700">{count}</span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{count} {config.label}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            });
                          })()}
                        </div>

                        {/* Priority indicators */}
                        <div className="flex items-center gap-1">
                          {criticalInsights.length > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 border border-red-200">
                                    <AlertTriangle className="h-3 w-3 text-red-600" />
                                    <span className="text-xs font-bold text-red-700">{criticalInsights.length}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{criticalInsights.length} Critical Insight{criticalInsights.length > 1 ? 's' : ''}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}

                          {openInsights.filter(i => i.priority === 'medium').length > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 border border-orange-200">
                                    <Clock className="h-3 w-3 text-orange-600" />
                                    <span className="text-xs font-medium text-orange-700">{openInsights.filter(i => i.priority === 'medium').length}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{openInsights.filter(i => i.priority === 'medium').length} Medium Priority</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>

                        {/* Total insights badge */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 bg-accent-purple-50 border-accent-purple-200 text-accent-purple-700 hover:bg-accent-purple-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalInitialTab('insights');
                            setShowModal(true);
                          }}
                        >
                          <Brain className="h-3 w-3 mr-1" />
                          <span className="text-xs font-medium">{openInsights.length} Insight{openInsights.length > 1 ? 's' : ''}</span>
                        </Button>
                      </>
                    ) : (
                      // No insights - show generate button
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 bg-gradient-to-r from-accent-purple-500 to-accent-purple-600 text-white border-accent-purple-400 hover:from-accent-purple-600 hover:to-accent-purple-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateInsightsMutation.mutate();
                        }}
                        disabled={generateInsightsMutation.isPending || insightsLoading}
                      >
                        {generateInsightsMutation.isPending ? (
                          <>
                            <Clock className="h-3 w-3 mr-1 animate-spin" />
                            <span className="text-xs font-medium">Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <Brain className="h-3 w-3 mr-1" />
                            <span className="text-xs font-medium">Generate Insights</span>
                          </>
                        )}
                      </Button>
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
                        className="h-8 w-8 p-0 bg-white/90 hover:bg-accent-purple-50 border-0 rounded-full shadow-sm hover:shadow-md transition-all duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4 text-gray-500 hover:text-accent-purple-600" />
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
          ) : (
            /* Grid View Layout (existing) */
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
                    <div className="space-y-2">
                      {isRenaming ? (
                        <div className="space-y-2">
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
                        <div className="space-y-2 pr-8">
                          <h3 className="font-semibold text-lg leading-tight text-gray-900 line-clamp-3">
                            {document.name}
                          </h3>
                          
                          {/* Document metadata */}
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="font-medium">{formatFileSize(document.fileSize)}</span>
                            <span>•</span>
                            <span>{formatDate(document.uploadedAt)}</span>
                            {document.expiryDate && (
                              <>
                                <span>•</span>
                                <div className="flex items-center gap-1 text-orange-600">
                                  <Calendar className="h-3 w-3" />
                                  <span>Due {formatDate(document.expiryDate)}</span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Insights with type-specific icons */}
                          {showInsights && openInsights.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {(() => {
                                // Group insights by type and count them
                                const insightsByType = openInsights.reduce((acc, insight) => {
                                  acc[insight.type] = (acc[insight.type] || 0) + 1;
                                  return acc;
                                }, {} as Record<string, number>);

                                // Use consistent accent-purple theme for all badges
                                const typeConfigs = {
                                  summary: { icon: FileText, color: 'bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200', label: 'Summary' },
                                  action_items: { icon: ListTodo, color: 'bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200', label: 'Actions' },
                                  key_dates: { icon: Calendar, color: 'bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200', label: 'Dates' },
                                  financial_info: { icon: DollarSign, color: 'bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200', label: 'Financial' },
                                  contacts: { icon: Users, color: 'bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200', label: 'Contacts' },
                                  compliance: { icon: Shield, color: 'bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200', label: 'Compliance' }
                                };

                                return Object.entries(insightsByType).slice(0, 4).map(([type, count]) => {
                                  const config = typeConfigs[type as keyof typeof typeConfigs] || typeConfigs.summary;
                                  const IconComponent = config.icon;
                                  
                                  return (
                                    <div 
                                      key={type}
                                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${config.color} shadow-sm`}
                                    >
                                      <IconComponent className="h-3 w-3" />
                                      <span>{count}</span>
                                    </div>
                                  );
                                });
                              })()}
                              {Object.keys(openInsights.reduce((acc, insight) => {
                                acc[insight.type] = true;
                                return acc;
                              }, {} as Record<string, boolean>)).length > 4 && (
                                <div className="flex items-center px-2 py-1 rounded-full text-xs font-medium bg-accent-purple-50 text-accent-purple-600 border border-accent-purple-200 shadow-sm">
                                  <span>+{Object.keys(openInsights.reduce((acc, insight) => {
                                    acc[insight.type] = true;
                                    return acc;
                                  }, {} as Record<string, boolean>)).length - 4}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>


            {/* Rich footer with metadata */}
              <div className="mt-auto mb-1">
                {/* Bottom row with file size and category */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-accent-purple-600 text-xs font-medium">{formatFileSize(document.fileSize)}</span>

                  {category && (
                    <Badge variant="outline" className="text-xs bg-accent-purple-50 border-accent-purple-300 text-accent-purple-700 px-2 py-1 badge font-medium">
                      <FolderIcon className="h-3 w-3 mr-1" />
                      <span className="truncate max-w-[50px]">{category.name}</span>
                    </Badge>
                  )}
                </div>
              </div>

              {/* Smart contextual info - positioned at same level as brain icon */}
              {(() => {
                // Priority 1: Generate Insights (when no insights exist)
                if (showInsights && openInsights.length === 0 && !insightsLoading) {
                  return (
                    <div className="absolute bottom-2 left-2 right-12">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div 
                              className="flex items-center justify-center gap-2 cursor-pointer rounded-xl px-3 py-2 bg-gradient-to-r from-accent-purple-500 to-accent-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] border border-accent-purple-400/50"
                              onClick={(e) => {
                                e.stopPropagation();
                                generateInsightsMutation.mutate();
                              }}
                            >
                              {generateInsightsMutation.isPending ? (
                                <>
                                  <Clock className="h-4 w-4 animate-spin" />
                                  <span className="text-sm font-medium">Analyzing...</span>
                                </>
                              ) : (
                                <>
                                  <Brain className="h-4 w-4" />
                                  <span className="text-sm font-medium">Generate AI Insights</span>
                                </>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{generateInsightsMutation.isPending ? 'AI is analyzing this document...' : 'Click to generate AI insights'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  );
                }

                // Priority 2: Insights Count (highest priority - clickable)
                if (openInsights.length > 0) {
                  return (
                    <div className="absolute bottom-2 left-2 right-12">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {(() => {
                              const priorityCounts = openInsights.reduce((acc, insight) => {
                                acc[insight.priority] = (acc[insight.priority] || 0) + 1;
                                return acc;
                              }, {} as Record<string, number>);

                              const priorityOrder = ['high', 'medium', 'low'];
                              const priorityColors: Record<string, string> = {
                                high: 'bg-white text-accent-purple-600 border-accent-purple-200',
                                medium: 'bg-orange-100 text-orange-700 border-orange-200', 
                                low: 'bg-accent-purple-100 text-accent-purple-600 border-accent-purple-200'
                              };

                              return (
                                <div 
                                  className="flex items-center justify-between gap-2 cursor-pointer rounded-xl px-3 py-2 bg-gradient-to-r from-accent-purple-500 to-accent-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] border border-accent-purple-400/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModalInitialTab('insights');
                                    setShowModal(true);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <Brain className="h-4 w-4" />
                                    <span className="text-sm font-medium">AI Insights</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {priorityOrder.map(priority => {
                                      const count = priorityCounts[priority];
                                      if (!count) return null;
                                      return (
                                        <div 
                                          key={priority}
                                          className={`px-2 py-1 rounded-full text-xs font-bold border ${priorityColors[priority]}`}
                                        >
                                          {count}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Click to view {openInsights.length} insight{openInsights.length > 1 ? 's' : ''}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  );
                }

                // Priority 3: Expiry/Due Date
                if (document.expiryDate) {
                  const expiryDate = new Date(document.expiryDate);
                  const isValid = !isNaN(expiryDate.getTime());
                  if (isValid) {
                    return (
                      <div className="absolute bottom-2 left-2 right-12">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg border border-orange-400/50">
                                <Calendar className="h-4 w-4" />
                                <span className="text-sm font-medium">Due {format(expiryDate, 'MMM dd')}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Due: {format(expiryDate, 'MMM dd, yyyy')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    );
                  }
                }

                // Priority 4: Upload Source  
                if (document.uploadSource) {
                  const sourceIcons: Record<string, { icon: React.ReactNode; label: string; gradient: string }> = {
                    'camera': { icon: <Type className="h-4 w-4" />, label: 'Scanned', gradient: 'from-green-500 to-green-600' },
                    'email': { icon: <FileText className="h-4 w-4" />, label: 'Email', gradient: 'from-blue-500 to-blue-600' },
                    'upload': { icon: <FileText className="h-4 w-4" />, label: 'Uploaded', gradient: 'from-gray-500 to-gray-600' }
                  };

                  const sourceInfo = sourceIcons[document.uploadSource] || sourceIcons['upload'];
                  return (
                    <div className="absolute bottom-2 left-2 right-12">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 bg-gradient-to-r ${sourceInfo.gradient} text-white shadow-lg border border-white/20`}>
                              {sourceInfo.icon}
                              <span className="text-sm font-medium">{sourceInfo.label}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{sourceInfo.label}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  );
                }

                // No contextual info to show
                return null;
              })()}


              {/* Actions dropdown - positioned in top corner */}
              {!isEditing && !isRenaming && (
                <div className="absolute top-1 right-1 z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 bg-white/90 hover:bg-accent-purple-50 border-0 rounded-full shadow-sm hover:shadow-md transition-all duration-200 opacity-70 hover:opacity-100"
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

              {/* Rich footer with metadata */}
              <div className="mt-auto mb-1">
                {/* Bottom row with file size and category */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-accent-purple-600 text-xs font-medium">{formatFileSize(document.fileSize)}</span>

                  {category && (
                    <Badge variant="outline" className="text-xs bg-accent-purple-50 border-accent-purple-300 text-accent-purple-700 px-2 py-1 badge font-medium">
                      <FolderIcon className="h-3 w-3 mr-1" />
                      <span className="truncate max-w-[50px]">{category.name}</span>
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
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