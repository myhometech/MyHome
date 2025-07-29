import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import Header from "@/components/header";
import UnifiedUploadButton from "@/components/unified-upload-button";
import UnifiedDocumentCard from "@/components/unified-document-card";
import MobileNav from "@/components/mobile-nav";
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
  Share2, 
  X, 
  Filter,
  Brain,
  AlertTriangle,
  Clock,
  Info,
  Calendar,
  FileText,
  DollarSign,
  Users,
  Shield,
  ListTodo,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ShareDocumentDialog } from "@/components/share-document-dialog";
import { BatchTagManager } from "@/components/batch-tag-manager";
// import { InsightJobStatus } from "@/components/InsightJobStatus"; // Temporarily disabled
import type { Category, Document } from "@shared/schema";

interface DocumentInsight {
  id: string;
  documentId: number;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'resolved' | 'dismissed';
  title: string;
  message: string;
  confidence: number;
  dueDate?: string;
  createdAt: string;
}

export default function UnifiedDocuments() {
  const { toast } = useToast();
  const { hasFeature, features } = useFeatures();
  const limits = { documents: features.BULK_OPERATIONS ? 999999 : 50 };
  const [, setLocation] = useLocation();
  
  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<string>("priority"); // priority, date, name, category
  
  // Insight filters
  const [hasInsightsFilter, setHasInsightsFilter] = useState<string>("all"); // all, critical, any, none
  const [insightTypeFilter, setInsightTypeFilter] = useState<string>("all");
  const [insightStatusFilter, setInsightStatusFilter] = useState<string>("open");
  
  // Bulk operations
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());

  // Initialize categories on first load
  const initCategoriesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/init-categories", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to initialize categories");
      return response.json();
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
    },
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const response = await fetch("/api/categories", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading, error: documentsError } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const response = await fetch("/api/documents", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
  });

  // Fetch all insights for filtering
  const { data: allInsights = [] } = useQuery<DocumentInsight[]>({
    queryKey: ["/api/insights", "all"],
    queryFn: async () => {
      const response = await fetch("/api/insights?status=all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch insights");
      const data = await response.json();
      return data.insights || [];
    },
  });

  // Bulk operations mutations
  const bulkDeleteMutation = useMutation({
    mutationFn: async (documentIds: number[]) => {
      await Promise.all(
        documentIds.map(id => fetch(`/api/documents/${id}`, {
          method: "DELETE",
          credentials: "include",
        }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
      setSelectedDocuments(new Set());
      setBulkMode(false);
      toast({
        title: "Documents deleted",
        description: `Successfully deleted ${selectedDocuments.size} documents.`,
      });
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
        title: "Failed to delete documents",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const bulkMoveCategoryMutation = useMutation({
    mutationFn: async ({ documentIds, categoryId }: { documentIds: number[]; categoryId: number | null }) => {
      await Promise.all(
        documentIds.map(id => 
          fetch(`/api/documents/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ categoryId })
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setSelectedDocuments(new Set());
      setBulkMode(false);
      toast({
        title: "Documents moved",
        description: `Successfully moved ${selectedDocuments.size} documents.`,
      });
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
        title: "Failed to move documents",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    initCategoriesMutation.mutate();
  }, []);

  // Create insight lookup for efficient filtering
  const insightsByDocument = new Map<number, DocumentInsight[]>();
  allInsights.forEach(insight => {
    if (!insightsByDocument.has(insight.documentId)) {
      insightsByDocument.set(insight.documentId, []);
    }
    insightsByDocument.get(insight.documentId)!.push(insight);
  });

  // Filter and sort documents
  const filteredAndSortedDocuments = documents
    .filter(doc => {
      // Category filter
      if (selectedCategory !== null && doc.categoryId !== selectedCategory) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesName = doc.name.toLowerCase().includes(searchLower);
        const matchesFileName = doc.fileName.toLowerCase().includes(searchLower);
        const matchesTags = doc.tags?.some(tag => tag.toLowerCase().includes(searchLower)) || false;
        const matchesText = doc.extractedText?.toLowerCase().includes(searchLower) || false;
        
        if (!matchesName && !matchesFileName && !matchesTags && !matchesText) {
          return false;
        }
      }

      // Insight filters
      const docInsights = insightsByDocument.get(doc.id) || [];
      const openInsights = docInsights.filter(i => i.status === 'open');
      const criticalInsights = openInsights.filter(i => i.priority === 'high');

      if (hasInsightsFilter === 'critical' && criticalInsights.length === 0) {
        return false;
      }
      if (hasInsightsFilter === 'any' && openInsights.length === 0) {
        return false;
      }
      if (hasInsightsFilter === 'none' && openInsights.length > 0) {
        return false;
      }

      // Insight type filter
      if (insightTypeFilter !== 'all') {
        const hasType = openInsights.some(i => i.type === insightTypeFilter);
        if (!hasType) return false;
      }

      // Insight status filter (when showing insights)
      if (insightStatusFilter !== 'all') {
        const statusInsights = docInsights.filter(i => i.status === insightStatusFilter);
        if (statusInsights.length === 0) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aInsights = insightsByDocument.get(a.id) || [];
      const bInsights = insightsByDocument.get(b.id) || [];
      const aOpenInsights = aInsights.filter(i => i.status === 'open');
      const bOpenInsights = bInsights.filter(i => i.status === 'open');
      const aCritical = aOpenInsights.filter(i => i.priority === 'high').length;
      const bCritical = bOpenInsights.filter(i => i.priority === 'high').length;

      switch (sortBy) {
        case 'priority':
          // Sort by: Critical insights → Medium priority → Low priority → Upload date
          if (aCritical !== bCritical) return bCritical - aCritical;
          
          const aMedium = aOpenInsights.filter(i => i.priority === 'medium').length;
          const bMedium = bOpenInsights.filter(i => i.priority === 'medium').length;
          if (aMedium !== bMedium) return bMedium - aMedium;
          
          const aLow = aOpenInsights.filter(i => i.priority === 'low').length;
          const bLow = bOpenInsights.filter(i => i.priority === 'low').length;
          if (aLow !== bLow) return bLow - aLow;
          
          // Fallback to expiry date, then upload date
          if (a.expiryDate && b.expiryDate) {
            const aExpiry = typeof a.expiryDate === 'string' ? new Date(a.expiryDate) : a.expiryDate;
            const bExpiry = typeof b.expiryDate === 'string' ? new Date(b.expiryDate) : b.expiryDate;
            return aExpiry.getTime() - bExpiry.getTime();
          }
          if (a.expiryDate) return -1;
          if (b.expiryDate) return 1;
          
          const fallbackAUpload = a.uploadedAt ? (typeof a.uploadedAt === 'string' ? new Date(a.uploadedAt) : a.uploadedAt) : new Date();
          const fallbackBUpload = b.uploadedAt ? (typeof b.uploadedAt === 'string' ? new Date(b.uploadedAt) : b.uploadedAt) : new Date();
          return fallbackBUpload.getTime() - fallbackAUpload.getTime();

        case 'date':
          const aUpload = a.uploadedAt ? (typeof a.uploadedAt === 'string' ? new Date(a.uploadedAt) : a.uploadedAt) : new Date();
          const bUpload = b.uploadedAt ? (typeof b.uploadedAt === 'string' ? new Date(b.uploadedAt) : b.uploadedAt) : new Date();
          return bUpload.getTime() - aUpload.getTime();

        case 'name':
          return a.name.localeCompare(b.name);

        case 'category':
          const aCat = categories.find(c => c.id === a.categoryId)?.name || 'Uncategorized';
          const bCat = categories.find(c => c.id === b.categoryId)?.name || 'Uncategorized';
          return aCat.localeCompare(bCat);

        default:
          return 0;
      }
    });

  // Bulk operation handlers
  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedDocuments(new Set());
  };

  const toggleDocumentSelection = (documentId: number) => {
    const newSelection = new Set(selectedDocuments);
    if (newSelection.has(documentId)) {
      newSelection.delete(documentId);
    } else {
      newSelection.add(documentId);
    }
    setSelectedDocuments(newSelection);
  };

  const selectAllDocuments = () => {
    const allIds = new Set<number>(filteredAndSortedDocuments.map((doc: Document) => doc.id));
    setSelectedDocuments(allIds);
  };

  const clearSelection = () => {
    setSelectedDocuments(new Set());
  };

  const clearAllFilters = () => {
    setSelectedCategory(null);
    setSearchQuery("");
    setHasInsightsFilter("all");
    setInsightTypeFilter("all");
    setInsightStatusFilter("open");
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (searchQuery) count++;
    if (hasInsightsFilter !== "all") count++;
    if (insightTypeFilter !== "all") count++;
    if (insightStatusFilter !== "open") count++;
    return count;
  };

  if (documentsError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Failed to Load Documents</h3>
              <p className="text-gray-600 mb-4">There was an error loading your documents.</p>
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Documents & Insights</h1>
              <p className="text-gray-600">Unified document management with intelligent insights</p>
            </div>
          </div>
        </div>



        {/* Insight Job Status - Temporarily disabled */}
        {/* <InsightJobStatus /> */}

        {/* Smart Filter Toolbar */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              {/* Search and primary filters */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search documents, content, tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                <Select value={selectedCategory?.toString() || "all"} onValueChange={(value) => setSelectedCategory(value === "all" ? null : parseInt(value))}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Insights
                      {getActiveFilterCount() > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {getActiveFilterCount()}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="p-2">
                      <div className="text-sm font-medium mb-2">Has Insights</div>
                      <Select value={hasInsightsFilter} onValueChange={setHasInsightsFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Documents</SelectItem>
                          <SelectItem value="critical">Critical Insights</SelectItem>
                          <SelectItem value="any">Any Insights</SelectItem>
                          <SelectItem value="none">No Insights</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="p-2">
                      <div className="text-sm font-medium mb-2">Insight Type</div>
                      <Select value={insightTypeFilter} onValueChange={setInsightTypeFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="summary">Summary</SelectItem>
                          <SelectItem value="action_items">Action Items</SelectItem>
                          <SelectItem value="key_dates">Key Dates</SelectItem>
                          <SelectItem value="financial_info">Financial Info</SelectItem>
                          <SelectItem value="contacts">Contacts</SelectItem>
                          <SelectItem value="compliance">Compliance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="p-2">
                      <div className="text-sm font-medium mb-2">Status</div>
                      <Select value={insightStatusFilter} onValueChange={setInsightStatusFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="dismissed">Dismissed</SelectItem>
                          <SelectItem value="all">All Status</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {getActiveFilterCount() > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={clearAllFilters}>
                          <X className="h-4 w-4 mr-2" />
                          Clear Filters
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* View controls and bulk actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Sort by:</span>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="priority">Priority</SelectItem>
                        <SelectItem value="date">Upload Date</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="category">Category</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center border rounded-md">
                    <Button
                      variant={viewMode === "grid" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className="rounded-r-none"
                    >
                      <Grid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className="rounded-l-none"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hasFeature("BULK_OPERATIONS") && (
                    <Button
                      variant={bulkMode ? "default" : "outline"}
                      size="sm"
                      onClick={toggleBulkMode}
                    >
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Bulk Mode
                    </Button>
                  )}
                  
                  <span className="text-sm text-gray-600">
                    {filteredAndSortedDocuments.length} document{filteredAndSortedDocuments.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Bulk actions bar */}
              {bulkMode && selectedDocuments.size > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
                    </span>
                    <Button size="sm" variant="outline" onClick={selectAllDocuments}>
                      Select All
                    </Button>
                    <Button size="sm" variant="outline" onClick={clearSelection}>
                      Clear
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(categoryId) => {
                      bulkMoveCategoryMutation.mutate({
                        documentIds: Array.from(selectedDocuments),
                        categoryId: categoryId === "uncategorized" ? null : parseInt(categoryId)
                      });
                    }}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Move to category..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uncategorized">Uncategorized</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id.toString()}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <BatchTagManager
                      selectedDocuments={Array.from(selectedDocuments).map(id => ({ 
                        id, 
                        name: filteredAndSortedDocuments.find(d => d.id === id)?.name || 'Unknown' 
                      }))}
                      onComplete={() => {
                        setSelectedDocuments(new Set());
                        setBulkMode(false);
                      }}
                    />

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Selected Documents</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''}? 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => bulkDeleteMutation.mutate(Array.from(selectedDocuments))}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Documents Grid/List */}
        {documentsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    <div className="flex gap-2">
                      <div className="h-5 bg-gray-200 rounded w-16"></div>
                      <div className="h-5 bg-gray-200 rounded w-12"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredAndSortedDocuments.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {documents.length === 0 ? "No documents yet" : "No documents match your filters"}
              </h3>
              <p className="text-gray-600 mb-6">
                {documents.length === 0 
                  ? "Upload your first document to get started with AI-powered insights and organization."
                  : "Try adjusting your search terms or filters to find what you're looking for."
                }
              </p>
              {documents.length > 0 && (
                <Button onClick={clearAllFilters} variant="outline">
                  Clear All Filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className={viewMode === "grid" 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            : "space-y-4"
          }>
            {filteredAndSortedDocuments.map((document) => (
              <UnifiedDocumentCard
                key={document.id}
                document={{
                  ...document,
                  uploadedAt: document.uploadedAt ? new Date(document.uploadedAt).toISOString() : new Date().toISOString(),
                  expiryDate: document.expiryDate ? (typeof document.expiryDate === 'string' ? document.expiryDate : new Date(document.expiryDate).toISOString()) : null
                }}
                categories={categories}
                viewMode={viewMode}
                bulkMode={bulkMode}
                isSelected={selectedDocuments.has(document.id)}
                onToggleSelection={() => toggleDocumentSelection(document.id)}
                onUpdate={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
                }}
                showInsights={true}
                autoExpandCritical={true}
              />
            ))}
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}