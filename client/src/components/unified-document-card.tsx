import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  ChevronDown,
  ChevronRight,
  Brain,
  DollarSign,
  Users,
  Shield,
  ListTodo,
  Info,
  Zap,
  AlertCircle,
  FolderIcon,
  Tag
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
  onClick?: () => void;
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
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [editImportantDate, setEditImportantDate] = useState(document.expiryDate || "");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [insightsExpanded, setInsightsExpanded] = useState(false);
  const { toast } = useToast();

  const category = categories?.find(c => c.id === document.categoryId);

  // Generate insights mutation - same as in DocumentInsights component
  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/documents/${document.id}/insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate insights');
      }
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Insights Generated",
        description: `Generated ${data.insights?.length || 0} insights in ${data.processingTime || 0}ms`
      });
      // Invalidate insights queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: [`/api/documents/${document.id}/insights`]
      });
      queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
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
  
  // Remove debug logging since we found the issue

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
      setIsEditing(false);
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
        className={`group hover:shadow-md hover:scale-[1.01] transition-all duration-200 ${cardBorderClass} ${isSelected ? "ring-2 ring-blue-500" : ""} cursor-pointer bg-white border-gray-200`}
        onClick={() => {
          if (bulkMode) {
            onToggleSelection?.();
          } else if (onClick) {
            onClick();
          } else {
            setShowModal(true);
          }
        }}
      >
        <CardContent className="p-4 relative">
          {/* Bulk selection checkbox */}
          {bulkMode && (
            <div className="absolute top-2 left-2 z-10">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelection?.();
                }}
                className="w-6 h-6 p-0"
              >
                {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {/* Header with title and actions */}
            <div className="flex items-start justify-between">
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
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${getFileTypeIconColor()} border shadow-sm`}>
                        {getFileIcon()}
                      </div>
                      <h3 className="font-semibold text-sm leading-tight text-gray-900 truncate flex-1">
                        {document.name}
                      </h3>
                    </div>
                    {document.expiryDate && (
                      <div className="flex items-center gap-1 text-xs text-gray-600 ml-7">
                        <Calendar className="h-3 w-3" />
                        <span>Due: {formatDate(document.expiryDate)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions dropdown */}
              {!isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0"
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
                        setShowModal(true);
                      }
                    }}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
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
                      handleDownload();
                    }}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
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

            {/* Document metadata */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                  <span className="font-medium text-gray-600">{formatFileSize(document.fileSize)}</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-full">
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-500">{formatDate(document.uploadedAt)}</span>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-1 ml-auto">
                {category && (
                  <Badge variant="outline" className="text-xs bg-gray-50 border-gray-300">
                    <FolderIcon className="h-3 w-3 mr-1" />
                    {category.name}
                  </Badge>
                )}
                {document.tags && document.tags.length > 0 && (
                  <>
                    {document.tags.slice(0, 2).map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs bg-gray-100">
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                    {document.tags.length > 2 && (
                      <Badge variant="secondary" className="text-xs bg-gray-100">
                        +{document.tags.length - 2}
                      </Badge>
                    )}
                  </>
                )}
                
                {/* TICKET 6: OCR failure badge for browser scans */}
                {document.status === 'ocr_failed' && document.uploadSource === 'browser_scan' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="destructive" className="text-xs bg-red-100 text-red-800 border-red-200 cursor-help">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          OCR failed
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>We couldn't read text from this scan – try rescanning.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            {/* Insight summary badges */}
            {showInsights && openInsights.length > 0 && (
              <div 
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors border border-gray-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setInsightsExpanded(!insightsExpanded);
                }}
              >
                <div className="flex items-center gap-1">
                  <Brain className="h-3 w-3 text-blue-600" />
                  <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    {openInsights.length} insight{openInsights.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                {criticalInsights.length > 0 && (
                  <Badge className="text-xs bg-red-100 text-red-800 border-red-200">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {criticalInsights.length} critical
                  </Badge>
                )}
                {highestPriorityInsight && (
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-700 truncate font-medium">
                      {highestPriorityInsight.title}
                    </span>
                    {highestPriorityInsight.dueDate && (
                      <span className="text-xs text-orange-600 ml-2 font-medium">
                        {formatDueDate(highestPriorityInsight.dueDate)}
                      </span>
                    )}
                  </div>
                )}
                <div className="ml-auto">
                  {insightsExpanded || shouldAutoExpand ? 
                    <ChevronDown className="h-3 w-3 text-gray-500" /> : 
                    <ChevronRight className="h-3 w-3 text-gray-500" />
                  }
                </div>
              </div>
            )}

            {/* Expandable insights panel */}
            {showInsights && openInsights.length > 0 && (
              <Collapsible 
                open={insightsExpanded || shouldAutoExpand} 
                onOpenChange={setInsightsExpanded}
              >
                <CollapsibleContent className="space-y-2 mt-1">
                  {insightsLoading ? (
                    <div className="text-xs text-gray-500 p-2">Loading insights...</div>
                  ) : (
                    openInsights.map((insight) => {
                      const config = insightTypeConfig[insight.type] || insightTypeConfig.summary;
                      const priorityStyle = priorityConfig[insight.priority];
                      const IconComponent = config.icon;
                      
                      return (
                        <div 
                          key={insight.id} 
                          className={`p-2 rounded border-l-2 ${priorityStyle.color}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={`text-xs ${config.color}`}>
                                  <IconComponent className="h-3 w-3 mr-1" />
                                  {config.label}
                                </Badge>
                                <Badge variant="outline" className={`text-xs ${priorityStyle.badgeColor}`}>
                                  {insight.priority.toUpperCase()}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {Math.round(insight.confidence * 100)}%
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-700 mb-1">{insight.title}</p>
                              <p className="text-xs text-gray-600">{insight.message}</p>
                              {insight.dueDate && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Calendar className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-500">
                                    Due: {formatDueDate(insight.dueDate)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateInsightStatusMutation.mutate({
                                    insightId: insight.id,
                                    status: 'resolved'
                                  });
                                }}
                                disabled={updateInsightStatusMutation.isPending}
                              >
                                {updateInsightStatusMutation.isPending ? 'Processing...' : 'Done'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('[DEBUG] Dismiss button clicked for insight:', insight.id);
                                  updateInsightStatusMutation.mutate({
                                    insightId: insight.id,
                                    status: 'dismissed'
                                  });
                                }}
                                disabled={updateInsightStatusMutation.isPending}
                              >
                                {updateInsightStatusMutation.isPending ? 'Dismissing...' : 'Dismiss'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* No insights state */}
            {showInsights && openInsights.length === 0 && !insightsLoading && (
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                <span className="text-gray-500">No insights yet</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    generateInsightsMutation.mutate();
                  }}
                  disabled={generateInsightsMutation.isPending}
                >
                  {generateInsightsMutation.isPending ? (
                    <>
                      <Clock className="h-3 w-3 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap className="h-3 w-3 mr-1" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            )}


          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {showModal && (
        <EnhancedDocumentViewer
          document={document}
          onClose={() => setShowModal(false)}
          onUpdate={onUpdate}
          onDownload={handleDownload}
        />
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