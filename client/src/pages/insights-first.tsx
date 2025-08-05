import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Header from "@/components/header";
import UnifiedUploadButton from "@/components/unified-upload-button";
import UnifiedDocumentCard from "@/components/unified-document-card";
import AddDropdownMenu from "@/components/add-dropdown-menu";
import { UnifiedInsightsDashboard } from "@/components/unified-insights-dashboard";

import { useFeatures } from "@/hooks/useFeatures";
import { 
  Lightbulb, 
  FileText, 
  Plus, 
  Search, 
  Filter,
  AlertTriangle,
  Clock,
  CheckCircle,
  Calendar,
  DollarSign,
  Users,
  Shield,
  ListTodo,
  Grid,
  List,
  SortAsc,
  FolderOpen,
  Brain,
  CheckSquare,
  Square,
  Trash2,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { EnhancedDocumentViewer } from "@/components/enhanced-document-viewer";
import type { Category, Document } from "@shared/schema";

interface DocumentInsight {
  id: string;
  documentId: number;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'resolved' | 'dismissed';
  title: string;
  content: string;
  dueDate?: string;
  confidence: number;
  documentName?: string;
}

export default function InsightsFirstPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  // No longer using tabs - unified view
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [insightTypeFilter, setInsightTypeFilter] = useState<string>("all");
  const [insightPriorityFilter, setInsightPriorityFilter] = useState<string>("all");
  const [insightStatusFilter, setInsightStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("priority");
  
  // Multi-select state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());

  const { hasFeature } = useFeatures();

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/documents/bulk-delete", {
        documentIds: Array.from(selectedDocuments),
      });
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Bulk Delete Complete",
        description: `${result.success} documents deleted successfully${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
      setSelectedDocuments(new Set());
      setBulkMode(false);
    },
    onError: (error) => {
      toast({
        title: "Bulk Delete Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  // Selection helper functions
  const toggleSelectAll = () => {
    if (selectedDocuments.size === filteredDocuments.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(filteredDocuments.map(doc => doc.id)));
    }
  };

  const toggleSelectDocument = (documentId: number) => {
    const newSelection = new Set(selectedDocuments);
    if (newSelection.has(documentId)) {
      newSelection.delete(documentId);
    } else {
      newSelection.add(documentId);
    }
    setSelectedDocuments(newSelection);
  };

  const handleExitBulkMode = () => {
    setBulkMode(false);
    setSelectedDocuments(new Set());
  };

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading, error: documentsError } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    retry: false,
  });

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  // Fetch insights - handle authentication errors gracefully
  const { data: allInsights = [], isLoading: insightsLoading, error: insightsError } = useQuery<DocumentInsight[]>({
    queryKey: ["/api/insights"],
    retry: false,
    meta: {
      // Don't show error toasts for authentication failures
      suppressErrorToast: true,
    },
  });

  // Filter documents based on search and category
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = !searchQuery || 
      doc.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === null || doc.categoryId === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Filter and sort insights - ensure allInsights is an array
  const insights = Array.isArray(allInsights) ? allInsights
    .filter(insight => {
      const matchesType = insightTypeFilter === "all" || insight.type === insightTypeFilter;
      const matchesPriority = insightPriorityFilter === "all" || insight.priority === insightPriorityFilter;
      const matchesStatus = insightStatusFilter === "all" || insight.status === insightStatusFilter;
      return matchesType && matchesPriority && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "priority") {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      if (sortBy === "confidence") {
        return b.confidence - a.confidence;
      }
      if (sortBy === "date" && a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return 0;
    }) : [];

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'action_items': return <ListTodo className="h-4 w-4" />;
      case 'key_dates': return <Calendar className="h-4 w-4" />;
      case 'financial_info': return <DollarSign className="h-4 w-4" />;
      case 'contacts': return <Users className="h-4 w-4" />;
      case 'compliance': return <Shield className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (documentsError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Unable to load documents</h3>
              <p className="text-gray-600 mb-4">Please try refreshing the page.</p>
              <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/documents"] })}>
                Retry
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Header with MyHome Title and Add Document Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-purple-600" />
            <div>
              <h1 className="text-2xl font-bold">MyHome</h1>
              <p className="text-gray-600">Smart insights from your document library</p>
            </div>
          </div>
          
          <AddDropdownMenu 
            size="lg" 
            className="bg-blue-600 hover:bg-blue-700"
            onDocumentUpload={() => setShowUploadDialog(true)}
            onManualDateCreate={() => {
              // This will be handled by the AddDropdownMenu component
              console.log('Manual date creation requested');
            }}
          />
        </div>

        {/* AI Insights Dashboard */}
        <UnifiedInsightsDashboard />

        {/* Document Library Section */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3 pt-6 border-t">
            <FileText className="h-8 w-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold">Document Library</h2>
              <p className="text-gray-600">Manage and organize your documents</p>
            </div>
          </div>

          {/* Document Category Navigation Buttons */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold">Document Categories</h3>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedCategory === null ? 'default' : 'outline'}
                  size="sm"
                  className="flex items-center gap-1.5 px-3 py-1.5"
                  onClick={() => setSelectedCategory(null)}
                >
                  <FolderOpen className="h-5 w-5" />
                  <span className="font-medium">All Documents</span>
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                    {documents.length}
                  </Badge>
                </Button>

                {categories.map((category) => {
                  const categoryDocs = documents.filter(doc => doc.categoryId === category.id);
                  return (
                    <Button
                      key={category.id}
                      variant={selectedCategory === category.id ? 'default' : 'outline'}
                      size="sm"
                      className="flex items-center gap-1.5 px-3 py-1.5"
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      <span className="font-medium">{category.name}</span>
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                        {categoryDocs.length}
                      </Badge>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* View Mode Toggle and Bulk Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">View:</span>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="h-8 w-8 p-0"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
              <div className="border-l border-gray-300 h-6 mx-2" />
              <Button
                variant={bulkMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBulkMode(!bulkMode)}
                className="h-8"
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                Select
              </Button>
            </div>
            
            <div className="text-sm text-gray-600">
              {bulkMode && selectedDocuments.size > 0 
                ? `${selectedDocuments.size} selected`
                : `${filteredDocuments.length} of ${documents.length} documents`
              }
            </div>
          </div>

          {/* Bulk Operations Toolbar */}
          {bulkMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="h-8"
                  >
                    {selectedDocuments.size === filteredDocuments.length ? (
                      <>
                        <Square className="h-4 w-4 mr-1" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <CheckSquare className="h-4 w-4 mr-1" />
                        Select All
                      </>
                    )}
                  </Button>
                  
                  {selectedDocuments.size > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8"
                          disabled={bulkDeleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Selected ({selectedDocuments.size})
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Selected Documents</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {selectedDocuments.size} selected document{selectedDocuments.size !== 1 ? 's' : ''}? 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => bulkDeleteMutation.mutate()}
                            className="bg-red-600 hover:bg-red-700"
                            disabled={bulkDeleteMutation.isPending}
                          >
                            {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExitBulkMode}
                  className="h-8"
                >
                  <X className="h-4 w-4 mr-1" />
                  Exit
                </Button>
              </div>
            </div>
          )}

          {/* Documents Display */}
          {documentsLoading || categoriesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-20 bg-gray-200 rounded mb-3"></div>
                    <div className="flex gap-2">
                      <div className="h-6 bg-gray-200 rounded flex-1"></div>
                      <div className="h-6 bg-gray-200 rounded flex-1"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No documents found</h3>
                <p className="text-gray-600 mb-4">
                  {searchQuery 
                    ? "Try adjusting your search terms or filters." 
                    : "Upload your first document to get started."}
                </p>
                <Button onClick={() => setShowUploadDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className={viewMode === 'grid' 
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" 
              : "space-y-3"
            }>
              {filteredDocuments.map((document) => (
                <UnifiedDocumentCard
                  key={document.id}
                  document={document as any}
                  viewMode={viewMode}
                  bulkMode={bulkMode}
                  isSelected={selectedDocuments.has(document.id)}
                  onToggleSelection={() => toggleSelectDocument(document.id)}
                  onClick={() => {
                    if (!bulkMode) {
                      setSelectedDocument(document as any);
                      setShowDocumentPreview(true);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Select a document to upload to your library
            </DialogDescription>
          </DialogHeader>
          <UnifiedUploadButton 
            onUpload={() => {
              setShowUploadDialog(false);
              queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
              toast({
                title: "Upload successful",
                description: "Your document has been uploaded and processed.",
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={showDocumentPreview} onOpenChange={setShowDocumentPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          {selectedDocument && (
            <EnhancedDocumentViewer
              document={selectedDocument}
              onClose={() => setShowDocumentPreview(false)}
              onDownload={() => {
                // Download functionality
                window.open(`/api/documents/${selectedDocument.id}/download`, '_blank');
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}