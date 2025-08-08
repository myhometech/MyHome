import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import Header from "@/components/header";
import AddDropdownMenu from "@/components/add-dropdown-menu";
import CategoryFilter from "@/components/category-filter";
import UnifiedDocumentCard from "@/components/unified-document-card";
import HelpBubble, { helpContent } from "@/components/help-bubble";
import { FeatureGate, FeatureLimitAlert } from "@/components/feature-gate";
import { useFeatures } from "@/hooks/useFeatures";
import { 
  Grid, 
  List, 
  SortAsc, 
  Search, 
  CheckSquare, 
  Square, 
  Trash2, 
  FolderOpen, 
  X, 
  Calendar, 
  DollarSign, 
  Users, 
  Shield, 
  CheckCircle, 
  FileText, 
  Brain,
  AlertCircle,
  Clock,
  TrendingUp,
  Filter,
  Plus,
  BarChart3,
  Zap,
  Share2,
  AlertTriangle,
  Folder,
  Calendar as CalendarIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { SmartSearch } from "@/components/smart-search";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ShareDocumentDialog } from "@/components/share-document-dialog";
import { BatchTagManager } from "@/components/batch-tag-manager";
import { InsightJobStatus } from "@/components/InsightJobStatus";
import { Badge } from "@/components/ui/badge";

import type { Category, Document, DocumentInsight } from "@shared/schema";

export default function UnifiedDocuments() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState("uploadedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showBatchTagManager, setShowBatchTagManager] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data: documents = [], isLoading: documentsLoading, error, refetch: refetchDocuments } = useQuery<Document[]>({
    queryKey: ['/api/documents', selectedCategory, searchQuery, sortBy, sortOrder, dateFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== null) params.append('categoryId', selectedCategory.toString());
      if (searchQuery) params.append('search', searchQuery);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);
      if (dateFilter) params.append('dateFilter', dateFilter);
      if (statusFilter) params.append('statusFilter', statusFilter);

      const response = await fetch(`/api/documents?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          setLocation('/login');
          return [];
        }
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    retry: (failureCount, error: any) => {
      if (error?.status === 401) {
        setLocation('/login');
        return false;
      }
      return failureCount < 3;
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
    retry: false,
  });

  const { data: insights = [] } = useQuery<DocumentInsight[]>({
    queryKey: ['/api/insights'],
    retry: false,
  });

  const deleteDocumentsMutation = useMutation({
    mutationFn: async (documentIds: number[]) => {
      const response = await apiRequest('/api/documents/bulk-delete', 'POST', {
        documentIds,
      });
      if (!response.ok) throw new Error('Failed to delete documents');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Documents deleted successfully" });
      setSelectedDocuments([]);
      setBulkMode(false);
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting documents", description: error.message, variant: "destructive" });
    },
  });

  const filteredDocuments = documents.filter(doc => {
    if (selectedTags.length > 0) {
      return selectedTags.every(tag => doc.tags?.includes(tag));
    }
    return true;
  });

  const handleDocumentToggle = (documentId: number) => {
    setSelectedDocuments(prev => 
      prev.includes(documentId) 
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const handleSelectAll = () => {
    if (selectedDocuments.length === filteredDocuments.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(filteredDocuments.map(doc => doc.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedDocuments.length > 0) {
      deleteDocumentsMutation.mutate(selectedDocuments);
    }
  };

  const handleSearchFromSmartSearch = (document: Document) => {
    setLocation(`/document/${document.id}`);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <div className="max-w-7xl mx-auto p-6">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error loading documents</h2>
            <p className="text-gray-600 mb-4">There was a problem loading your documents.</p>
            <Button onClick={() => refetchDocuments()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              All Documents
            </h1>
            <p className="text-gray-600">
              {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}
              {selectedCategory && categories.find(c => c.id === selectedCategory) && 
                ` in ${categories.find(c => c.id === selectedCategory)?.name}`
              }
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AddDropdownMenu onDocumentUpload={refetchDocuments} />
            
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant={bulkMode ? "default" : "outline"}
              size="sm"
              onClick={() => setBulkMode(!bulkMode)}
            >
              <CheckSquare className="h-4 w-4 mr-1" />
              Select
            </Button>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-wrap gap-4 mb-6">
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />

          <SmartSearch
            onDocumentSelect={handleSearchFromSmartSearch}
            placeholder="Search documents..."
            className="w-64"
          />

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uploadedAt">Upload Date</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="fileSize">File Size</SelectItem>
              <SelectItem value="expiryDate">Expiry Date</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          >
            <SortAsc className={`h-4 w-4 ${sortOrder === "desc" ? "rotate-180" : ""}`} />
          </Button>
        </div>

        {/* Bulk Actions */}
        {bulkMode && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedDocuments.length === filteredDocuments.length ? (
                    <Square className="h-4 w-4 mr-1" />
                  ) : (
                    <CheckSquare className="h-4 w-4 mr-1" />
                  )}
                  {selectedDocuments.length === filteredDocuments.length ? "Deselect All" : "Select All"}
                </Button>
                <span className="text-sm text-gray-600">
                  {selectedDocuments.length} selected
                </span>
              </div>

              {selectedDocuments.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBatchTagManager(true)}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Manage Tags
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowShareDialog(true)}
                  >
                    <Share2 className="h-4 w-4 mr-1" />
                    Share
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Selected Documents</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete {selectedDocuments.length} selected document{selectedDocuments.length !== 1 ? 's' : ''}? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleBulkDelete}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {documentsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Documents Grid/List */}
        {!documentsLoading && filteredDocuments.length > 0 && (
          <div className={
            viewMode === "grid" 
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              : "space-y-4"
          }>
            {filteredDocuments.map((document) => (
              <UnifiedDocumentCard
                key={document.id}
                document={document}
                categories={categories}
                viewMode={viewMode}
                bulkMode={bulkMode}
                isSelected={selectedDocuments.includes(document.id)}
                onToggleSelection={() => handleDocumentToggle(document.id)}
                onUpdate={refetchDocuments}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!documentsLoading && filteredDocuments.length === 0 && (
          <div className="text-center py-12">
            <FolderOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || selectedCategory || selectedTags.length > 0
                ? "Try adjusting your filters or search terms"
                : "Upload your first document to get started"
              }
            </p>
            {(!searchQuery && !selectedCategory && selectedTags.length === 0) && (
              <AddDropdownMenu onDocumentUpload={refetchDocuments} />
            )}
          </div>
        )}

        {/* Feature Gates and Help */}
        <FeatureGate feature="ai_insights">
          <HelpBubble 
            content={helpContent.aiInsights}
          />
        </FeatureGate>
      </div>

      {/* Dialogs */}
      <ShareDocumentDialog
        documentIds={selectedDocuments}
        onClose={() => setShowShareDialog(false)}
      />

      <BatchTagManager
        documentIds={selectedDocuments}
        onClose={() => setShowBatchTagManager(false)}
        onUpdate={refetchDocuments}
      />

      <InsightJobStatus />
    </div>
  );
}