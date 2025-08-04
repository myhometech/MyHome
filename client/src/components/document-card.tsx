import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileText, Image, MoreHorizontal, Download, Trash2, Eye, Edit2, Check, X, FileSearch, Calendar, AlertTriangle, Clock, CheckSquare, Square, Brain, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { ShareDocumentDialog } from "./share-document-dialog";
import { EnhancedDocumentViewer } from "./enhanced-document-viewer";
import type { DocumentInsight } from "@shared/schema";

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
}

export default function DocumentCard({ 
  document, 
  categories = [], 
  viewMode = "grid", 
  bulkMode = false,
  isSelected = false,
  onToggleSelection,
  onUpdate 
}: DocumentCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [editImportantDate, setEditImportantDate] = useState(document.expiryDate || "");
  const [insightsExpanded, setInsightsExpanded] = useState(false);
  const { toast } = useToast();

  const category = categories?.find(c => c.id === document.categoryId);

  // Fetch insights for this document - always log query attempts
  console.log('[DEBUG] Setting up insights query for document:', document.id);
  
  const { data: insightsData, isLoading: insightsLoading, error: insightsError } = useQuery({
    queryKey: [`/api/documents/${document.id}/insights`],
    queryFn: async () => {
      console.log('[DEBUG] Fetching insights for document:', document.id);
      const response = await fetch(`/api/documents/${document.id}/insights`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch insights');
      const data = await response.json();
      console.log('[DEBUG] Insights response for document', document.id, ':', data);
      return data;
    },
  });

  // Extract insights array from the response object
  const insights: DocumentInsight[] = insightsData?.insights || [];
  
  // Debug logging for all documents now
  console.log('[DEBUG] Document', document.id, '- Component rendered');
  console.log('[DEBUG] Document', document.id, 'insights:', insights);
  console.log('[DEBUG] Document', document.id, 'insightsData:', insightsData);
  console.log('[DEBUG] Document', document.id, 'insightsLoading:', insightsLoading);
  console.log('[DEBUG] Document', document.id, 'insightsError:', insightsError);
  
  // Calculate insight summary - filter out unwanted types
  const openInsights = insights.filter(i => 
    i.status === 'open' && 
    !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(i.type)
  );
  const criticalInsights = openInsights.filter(i => i.priority === 'high');
  
  // More debug logging for document 28
  if (document.id === 28) {
    console.log('[DEBUG] Document 28 openInsights:', openInsights);
    console.log('[DEBUG] Document 28 criticalInsights:', criticalInsights);
  }

  // Insight dismiss mutation - copied from working critical insights dashboard
  const dismissInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      console.log('[DEBUG] Dismissing insight:', insightId);
      const response = await fetch(`/api/insights/${insightId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.error('[DEBUG] Failed to dismiss insight:', response.status, response.statusText);
        throw new Error('Failed to dismiss insight');
      }
      
      return response.json();
    },
    onMutate: async (insightId: string) => {
      console.log('[DEBUG] Optimistically removing insight:', insightId);
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: [`/api/documents/${document.id}/insights`] });
      
      // Snapshot the previous value
      const previousInsights = queryClient.getQueryData([`/api/documents/${document.id}/insights`]);
      
      // Optimistically update to the new value by removing the dismissed insight
      queryClient.setQueryData([`/api/documents/${document.id}/insights`], (old: any) => {
        if (!old?.insights) return old;
        return {
          ...old,
          insights: old.insights.filter((insight: any) => insight.id !== insightId)
        };
      });
      
      // Return a context object with the snapshotted value
      return { previousInsights };
    },
    onSuccess: () => {
      console.log('[DEBUG] Insight dismissed successfully');
      // Invalidate and refetch insights queries to refresh the list immediately
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${document.id}/insights`] });
      queryClient.refetchQueries({ queryKey: [`/api/documents/${document.id}/insights`] });
      // Also invalidate the main insights query to keep all views synchronized
      queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      queryClient.refetchQueries({ queryKey: ['/api/insights'] });
      toast({
        title: "Insight dismissed",
        description: "The insight has been successfully dismissed.",
      });
    },
    onError: (error, insightId, context) => {
      console.error('[DEBUG] Failed to dismiss insight:', error);
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData([`/api/documents/${document.id}/insights`], context?.previousInsights);
      toast({
        title: "Failed to dismiss insight",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to sync with server
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${document.id}/insights`] });
    }
  });

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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };





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
    // Enhanced confirmation dialog with details
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
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 flex-1" onClick={isEditing ? undefined : () => setShowModal(true)}>
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
      console.log('Opening document modal for:', document.id, document.name);
      setShowModal(true);
    }
  };



  return (
    <>
      <Card 
        className={`border border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer ${
          bulkMode && isSelected ? "ring-2 ring-blue-500 bg-blue-50" : ""
        }`}
        onClick={handleCardClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            {/* Bulk Selection Checkbox */}
            {bulkMode && (
              <div className="flex items-center mr-3">
                <div className="w-5 h-5 flex items-center justify-center">
                  {isSelected ? (
                    <CheckSquare className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Square className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
            )}
            
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getFileIconColor()}`}>
              {getFileIcon()}
            </div>
            {!bulkMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
            )}
          </div>
          
          <div onClick={isEditing ? undefined : () => setShowModal(true)}>
            {isEditing ? (
              <div className="mb-2 space-y-2">
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
                  <Button size="sm" variant="ghost" onClick={handleSaveEdit} disabled={updateDocumentMutation.isPending} className="h-6 w-6 p-0">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={updateDocumentMutation.isPending} className="h-6 w-6 p-0">
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
            
            {/* Important Date Display */}
            {document.expiryDate && (
              <div className="mb-2">
                <ExpiryBadge expiryDate={document.expiryDate} />
              </div>
            )}

            {/* AI Insights Section - Force show insights for debugging */}
            {(openInsights.length > 0 || true) && (
              <div className="mt-3 border-t pt-3 space-y-2" style={{ backgroundColor: document.id === 28 ? '#f0f9ff' : 'transparent' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700">
                      AI Insights {document.id === 28 ? `(${openInsights.length} found)` : ''}
                    </span>
                    {criticalInsights.length > 0 && (
                      <Badge variant="destructive" className="text-xs h-5">
                        {criticalInsights.length}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInsightsExpanded(!insightsExpanded);
                    }}
                    className="h-6 w-6 p-0"
                  >
                    {insightsExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <Collapsible open={true} onOpenChange={setInsightsExpanded}>
                  <CollapsibleContent className="space-y-2">
                    <div className="p-3 bg-purple-100 border-2 border-purple-500 rounded mb-2">
                      <div className="text-purple-800 font-bold">DEBUG INFO FOR DOC {document.id}</div>
                      <div className="text-xs">Open Insights Count: {openInsights.length}</div>
                      <div className="text-xs">All Insights Count: {insights.length}</div>
                      {openInsights.length > 0 && (
                        <div className="text-xs">First Insight ID: {openInsights[0].id}</div>
                      )}
                      <button 
                        className="mt-2 px-4 py-2 bg-purple-500 text-white rounded font-bold"
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('DEBUG BUTTON CLICKED FOR DOC:', document.id, 'Open insights:', openInsights.length);
                        }}
                      >
                        DEBUG BUTTON - CLICK ME
                      </button>
                    </div>
                    {openInsights.slice(0, 3).map((insight) => (
                      <div
                        key={insight.id}
                        className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg mb-2"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <div className="text-sm font-bold text-blue-800 mb-1">
                              {insight.type.replace('_', ' ').toUpperCase()}
                            </div>
                            <div className="text-sm text-gray-700 mb-2">{insight.content}</div>
                            <div className="text-xs text-blue-600">Priority: {insight.priority}</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('🔥 DISMISS CLICKED for insight:', insight.id, 'type:', insight.type);
                              dismissInsightMutation.mutate(String(insight.id));
                            }}
                            className="px-4 py-2 bg-red-500 text-white font-bold rounded hover:bg-red-600 border-2 border-red-700"
                            disabled={dismissInsightMutation.isPending}
                            style={{ minWidth: '80px', minHeight: '36px' }}
                          >
                            {dismissInsightMutation.isPending ? 'DISMISSING...' : 'DISMISS'}
                          </button>
                        </div>
                      </div>
                    ))}
                    {openInsights.length > 3 && (
                      <div className="text-xs text-gray-500 text-center">
                        +{openInsights.length - 3} more insights
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
            

          </div>
        </CardContent>
      </Card>

      {showModal && (
        <EnhancedDocumentViewer
          document={document}
          onClose={() => {
            console.log('Closing document viewer for document:', document.id);
            setShowModal(false);
          }}
          onUpdate={onUpdate}
        />
      )}

      {/* Old modal for reference - can be removed */}
      {false && showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{document.name}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Category:</span> {category?.name || "Uncategorized"}
                </div>
                <div>
                  <span className="font-medium">File Size:</span> {formatFileSize(document.fileSize)}
                </div>
                <div>
                  <span className="font-medium">Uploaded:</span> {formatDate(document.uploadedAt)}
                </div>
                {document.expiryDate && (
                  <div>
                    <span className="font-medium">Important Date:</span> {document.expiryDate ? new Date(document.expiryDate).toLocaleDateString() : 'N/A'}
                  </div>
                )}
              </div>
              {document.extractedText && (
                <div>
                  <h3 className="font-medium mb-2">Extracted Text:</h3>
                  <div className="bg-gray-50 p-3 rounded text-sm max-h-40 overflow-y-auto">
                    {document.extractedText}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={handleDownload} size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button onClick={handleDelete} variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
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
