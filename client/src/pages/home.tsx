import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import Header from "@/components/header";
import AddDropdownMenu from "@/components/add-dropdown-menu";
import CategoryFilter from "@/components/category-filter";
import DocumentCard from "@/components/document-card";
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
  Calendar as CalendarIcon // Alias to avoid conflict if Calendar is used elsewhere
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

// Dashboard Overview Cards Component
function DashboardOverview({ onFilterChange }: { onFilterChange: (filter: any) => void }) {
  const { data: metricsData, isLoading } = useQuery({
    queryKey: ['/api/insights/metrics'],
    queryFn: async () => {
      const response = await fetch('/api/insights/metrics', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch metrics');
      return response.json();
    },
  });

  const { data: documentsData } = useQuery({
    queryKey: ['/api/documents'],
    queryFn: async () => {
      const response = await fetch('/api/documents', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['/api/categories'],
    queryFn: async () => {
      const response = await fetch('/api/categories', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-8 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metrics = metricsData || {};
  const totalDocuments = documentsData?.length || 0;
  const totalCategories = categoriesData?.length || 0;

  const overviewCards = [
    {
      title: "All Documents",
      value: totalDocuments,
      icon: FileText,
      color: "blue",
      description: "Total documents in your library",
      onClick: () => onFilterChange({ reset: true }),
      helpContent: helpContent.documentUpload
    },
    {
      title: "High Priority Items",
      value: metrics.highPriority || 0,
      icon: AlertCircle,
      color: "red",
      description: "Items requiring immediate attention",
      onClick: () => onFilterChange({ priority: 'high' }),
      helpContent: helpContent.aiInsights
    },
    {
      title: "Upcoming Deadlines",
      value: metrics.upcomingDeadlines || 0,
      icon: Clock,
      color: "orange",
      description: "Due dates within 30 days",
      onClick: () => onFilterChange({ upcoming: true }),
      helpContent: helpContent.manualEvents
    },
    {
      title: "Categories",
      value: totalCategories,
      icon: FolderOpen,
      color: "green",
      description: "Document organization categories",
      onClick: () => onFilterChange({ showCategories: true }),
      helpContent: helpContent.categories
    }
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400',
          hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/30'
        };
      case 'red':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400',
          hover: 'hover:bg-red-100 dark:hover:bg-red-900/30'
        };
      case 'orange':
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
          icon: 'text-orange-600 dark:text-orange-400',
          hover: 'hover:bg-orange-100 dark:hover:bg-orange-900/30'
        };
      case 'green':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          icon: 'text-green-600 dark:text-green-400',
          hover: 'hover:bg-green-100 dark:hover:bg-green-900/30'
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-900/20',
          border: 'border-gray-200 dark:border-gray-800',
          icon: 'text-gray-600 dark:text-gray-400',
          hover: 'hover:bg-gray-100 dark:hover:bg-gray-900/30'
        };
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {overviewCards.map((card, index) => {
        const colors = getColorClasses(card.color);
        const Icon = card.icon;

        return (
          <Card 
            key={index} 
            className={`cursor-pointer transition-all duration-200 ${colors.bg} ${colors.border} ${colors.hover} hover:shadow-md`}
            onClick={card.onClick}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center space-x-2">
                <Icon className={`h-5 w-5 ${colors.icon}`} />
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {card.title}
                </CardTitle>
              </div>
              <HelpBubble 
                title={card.helpContent.title}
                content={card.helpContent.content}
                characterTip={card.helpContent.characterTip}
                size="sm"
              />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-baseline space-x-2">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {card.value}
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Quick Action Cards Component
function QuickActionCards() {
  const { hasFeature } = useFeatures();

  const actionCards = [
    {
      title: "Upload Documents",
      description: "Add new documents to your library",
      icon: Plus,
      color: "blue",
      action: "upload",
      helpContent: helpContent.documentUpload
    },
    {
      title: "Add Important Date",
      description: "Track key dates and deadlines",
      icon: CalendarIcon,
      color: "purple",
      action: "manual_event",
      helpContent: helpContent.manualEvents
    },
    {
      title: "Smart Search",
      description: "Find documents by content or keywords",
      icon: Search,
      color: "green",
      action: "search",
      helpContent: helpContent.search
    },
    {
      title: "View Analytics",
      description: "See insights and document trends",
      icon: BarChart3,
      color: "orange",
      action: "analytics",
      feature: "ANALYTICS",
      helpContent: helpContent.aiInsights
    }
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return {
          bg: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20',
          border: 'border-blue-200 dark:border-blue-700',
          icon: 'text-blue-600 dark:text-blue-400',
          hover: 'hover:from-blue-100 hover:to-blue-200 dark:hover:from-blue-800/30 dark:hover:to-blue-700/30'
        };
      case 'purple':
        return {
          bg: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20',
          border: 'border-purple-200 dark:border-purple-700',
          icon: 'text-purple-600 dark:text-purple-400',
          hover: 'hover:from-purple-100 hover:to-purple-200 dark:hover:from-purple-800/30 dark:hover:to-purple-700/30'
        };
      case 'green':
        return {
          bg: 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20',
          border: 'border-green-200 dark:border-green-700',
          icon: 'text-green-600 dark:text-green-400',
          hover: 'hover:from-green-100 hover:to-green-200 dark:hover:from-green-800/30 dark:hover:to-green-700/30'
        };
      case 'orange':
        return {
          bg: 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20',
          border: 'border-orange-200 dark:border-orange-700',
          icon: 'text-orange-600 dark:text-orange-400',
          hover: 'hover:from-orange-100 hover:to-orange-200 dark:hover:from-orange-800/30 dark:hover:to-orange-700/30'
        };
      default:
        return {
          bg: 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20',
          border: 'border-gray-200 dark:border-gray-700',
          icon: 'text-gray-600 dark:text-gray-400',
          hover: 'hover:from-gray-100 hover:to-gray-200 dark:hover:from-gray-800/30 dark:hover:to-gray-700/30'
        };
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {actionCards.map((card, index) => {
        // Skip feature-gated cards if user doesn't have access
        if (card.feature && !hasFeature(card.feature as any)) {
          return null;
        }

        const colors = getColorClasses(card.color);
        const Icon = card.icon;

        return (
          <Card 
            key={index} 
            className={`cursor-pointer transition-all duration-200 ${colors.bg} ${colors.border} ${colors.hover} hover:shadow-lg hover:scale-105`}
          >
            <CardContent className="p-6 text-center">
              <div className="flex flex-col items-center space-y-3">
                <div className={`p-3 rounded-full bg-white/80 dark:bg-gray-800/80 shadow-sm`}>
                  <Icon className={`h-6 w-6 ${colors.icon}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {card.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {card.description}
                  </p>
                </div>
                <div className="pt-2">
                  <HelpBubble 
                    title={card.helpContent.title}
                    content={card.helpContent.content}
                    characterTip={card.helpContent.characterTip}
                    size="sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dashboardFilter, setDashboardFilter] = useState<any>(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());

  // Add toast hook
  const { toast } = useToast();

  // User authentication query - moved to top since it's used in useEffect hooks below
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      const response = await fetch('/api/auth/user', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          // Redirect to login if not authenticated
          window.location.href = '/login';
          return null;
        }
        throw new Error('Not authenticated');
      }
      return response.json();
    },
    retry: false,
  });

  console.log('Home component rendering with user:', user, 'loading:', userLoading);

  // Redirect to login if not authenticated
  if (!userLoading && !user) {
    window.location.href = '/login';
    return null;
  }

  // Handle dashboard card filter changes
  const handleDashboardFilter = (filter: any) => {
    if (filter.reset) {
      setSelectedCategory(null);
      setSearchQuery("");
      setDashboardFilter(null);
    } else if (filter.priority) {
      // Filter for high priority items - this would need backend support
      setDashboardFilter(filter);
    } else if (filter.upcoming) {
      // Filter for upcoming deadlines - this would need backend support
      setDashboardFilter(filter);
    } else if (filter.showCategories) {
      // Show category view
      setDashboardFilter(filter);
    }
  };

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

  // Bulk operations mutations
  const bulkDeleteMutation = useMutation({
    mutationFn: async (documentIds: number[]) => {
      console.log('Home bulk delete request:', { documentIds, count: documentIds.length });

      // Validate document IDs are numbers
      const validIds = documentIds.filter(id => Number.isInteger(id) && id > 0);
      if (validIds.length === 0) {
        throw new Error('No valid document IDs provided');
      }

      const response = await fetch('/api/documents/bulk-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ documentIds: validIds }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Home bulk delete failed:', errorData);
        throw new Error(`Failed to delete documents: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }

      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setSelectedDocuments(new Set());
      setBulkMode(false);

      const successMessage = result.success 
        ? `Successfully deleted ${result.success} documents${result.failed > 0 ? `, ${result.failed} failed` : ''}`
        : `Successfully deleted ${selectedDocuments.size} documents.`;

      toast({
        title: "Bulk Delete Complete",
        description: successMessage,
        variant: result.failed > 0 ? "destructive" : "default",
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
    // Force immediate document fetch
    console.log('[HOME] Component mounted, forcing document fetch...');
    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
  }, []);

  // Ensure documents are refetched when user is confirmed
  useEffect(() => {
    if (user) {
      console.log('[HOME] User authenticated, ensuring documents are fetched...');
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    }
  }, [user, queryClient]);

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
    const allIds = new Set<number>(documents.map((doc: Document) => doc.id));
    setSelectedDocuments(allIds);
  };

  const clearSelection = () => {
    setSelectedDocuments(new Set());
  };

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading, error: documentsError, refetch: refetchDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents", { search: searchQuery, category: selectedCategory }],
    queryFn: async () => {
      console.log('[DOCUMENTS] Fetching documents with filters:', { searchQuery, selectedCategory });

      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedCategory) params.append("category", selectedCategory);

      const response = await fetch(`/api/documents?${params.toString()}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        console.error('[DOCUMENTS] Fetch failed:', response.status, response.statusText);
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error(`Failed to fetch documents: ${response.status}`);
      }

      const data = await response.json();
      console.log('[DOCUMENTS] Fetched documents:', data.length, 'items');
      return data;
    },
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('401') || error?.message?.includes('Authentication')) {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    enabled: true, // Always try to fetch
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  // Debug logging for documents
  console.log('[HOME DEBUG] Documents state:', {
    documents: documents,
    documentsLength: documents?.length,
    documentsLoading: documentsLoading,
    documentsError: documentsError,
    selectedCategory: selectedCategory,
    searchQuery: searchQuery
  });

  // Force refetch documents if they're empty but should exist (with debounce)
  useEffect(() => {
    if (!documentsLoading && (!documents || documents.length === 0) && !documentsError && user) {
      console.log('[HOME] No documents found for authenticated user, attempting single refetch...');
      const timeoutId = setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["/api/documents"] });
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [documentsLoading, documents?.length, documentsError, queryClient, user]);

  // Mock components for demonstration purposes, replace with actual imports
  const CriticalInsightsDashboard = () => <div className="bg-gray-100 p-4 rounded-lg">Critical Insights Dashboard</div>;
  const TopInsightsWidget = () => <div className="bg-gray-100 p-4 rounded-lg">Top Insights Widget</div>;
  const UnifiedInsightsDashboard = ({ filter }: { filter: any }) => <div className="bg-gray-100 p-4 rounded-lg">Unified Insights Dashboard (Filter: {JSON.stringify(filter)})</div>;
  const YourAssetsSection = () => <div className="bg-gray-100 p-4 rounded-lg">Your Assets Section</div>;

  const handleFilterChange = (filter: any) => {
    // This is the filter for the UnifiedInsightsDashboard, not the main dashboard overview cards
    // It's currently a placeholder and might need adjustment based on how UnifiedInsightsDashboard uses filters.
  };
  if (!userLoading && !user) {
    window.location.href = '/login';
    return null;
  }

  if (userLoading) {
    return (
      <div className="min-h-screen bg-surface space-y-8">
        <Header searchQuery="" onSearchChange={() => {}} /> {/* Pass dummy props to Header */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 bg-gray-200 rounded w-64 mb-2 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-96 animate-pulse"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 mt-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Render the main dashboard content
  return (
    <div className="min-h-screen bg-surface">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20 md:pb-8">
        {/* Mobile Search */}
        <div className="md:hidden mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Quick Action Cards */}
        <QuickActionCards />

        {/* TICKET 17: Show AI insight generation status */}
        <FeatureGate feature="AI_INSIGHTS">
          <InsightJobStatus />
        </FeatureGate>

        {/* Search and Filter Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <SmartSearch
              onSearchChange={setSearchQuery}
              onDocumentSelect={(document) => {
                // Optionally open document modal or navigate to document
                console.log('Selected document:', document);
              }}
              placeholder="Search documents by name, content, or tags..."
              className="w-full"
            />
          </div>
        </div>

        {/* Category Filter */}
        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />

        {/* Dashboard Overview Cards - Moved above Document Library */}
        <DashboardOverview onFilterChange={handleDashboardFilter} />

        {/* Documents Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Document Library
                {documents.length > 0 && (
                  <span className="text-sm text-muted-foreground">({documents.length})</span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {documents.length > 0 && (
                  <Button
                    variant={bulkMode ? "default" : "outline"}
                    size="sm"
                    onClick={toggleBulkMode}
                  >
                    {bulkMode ? <X className="h-4 w-4 mr-1" /> : <CheckSquare className="h-4 w-4 mr-1" />}
                    {bulkMode ? "Cancel" : "Select"}
                  </Button>
                )}
                <UnifiedUploadButton onUploadComplete={handleUploadComplete} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Debug Info */}
            <div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
              Documents: {documents.length} | Loading: {documentsLoading ? 'Yes' : 'No'} | Error: {documentsError ? 'Yes' : 'No'}
            </div>

            {/* Search and Filter Controls */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <SmartSearch 
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  documents={documents}
                />
              </div>
              <CategoryFilter
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
              />
            </div>

            {/* Bulk Operations Bar */}
            {bulkMode && selectedDocuments.size > 0 && (
              <BulkOperationsEnhanced
                selectedDocuments={selectedDocuments}
                onClearSelection={() => setSelectedDocuments(new Set())}
                onSelectAll={() => setSelectedDocuments(new Set(documents.map(doc => doc.id)))}
                onBulkDelete={handleBulkDelete}
                onBulkTag={handleBulkTag}
                onBulkShare={handleBulkShare}
                onBulkDownload={handleBulkDownload}
                onCategoryUpdate={handleBulkCategoryUpdate}
                categories={categories}
                isDeleting={bulkDeleteMutation.isPending}
              />
            )}

            {/* Loading State */}
            {documentsLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-muted-foreground">Loading documents...</span>
              </div>
            )}

            {/* Error State */}
            {documentsError && (
              <div className="text-center py-8">
                <p className="text-sm text-red-600 mb-2">
                  Failed to load documents: {documentsError.message}
                </p>
                <div className="flex gap-2 justify-center">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => refetchDocuments()}
                  >
                    Retry
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => window.location.reload()}
                  >
                    Refresh Page
                  </Button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!documentsLoading && !documentsError && documents.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  No documents yet
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery || selectedCategory 
                    ? "No documents match your current filters."
                    : "Start by uploading your first document to get organized."}
                </p>
                {!searchQuery && !selectedCategory && (
                  <UnifiedUploadButton 
                    onUploadComplete={handleUploadComplete}
                    variant="default"
                  />
                )}
              </div>
            )}

            {/* Documents Grid - Always render when we have documents */}
            {documents.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map((document) => (
                  <UnifiedDocumentCard
                    key={document.id}
                    document={document}
                    bulkMode={bulkMode}
                    isSelected={selectedDocuments.has(document.id)}
                    onToggleSelect={() => toggleDocumentSelection(document.id)}
                    onUpdate={handleDocumentUpdate}
                    onDelete={handleDocumentDelete}
                    categories={categories}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Placeholder for UnifiedUploadButton - replace with actual component import
const UnifiedUploadButton = ({ onUploadComplete, variant }: { onUploadComplete: () => void; variant?: "default" | "outline" }) => (
  <Button variant={variant || "outline"} size="sm" onClick={() => alert("Upload functionality not implemented in this snippet.")}>
    <Plus className="h-4 w-4 mr-1" /> Upload
  </Button>
);

// Placeholder for BulkOperationsEnhanced - replace with actual component import
const BulkOperationsEnhanced = ({
  selectedDocuments,
  onClearSelection,
  onSelectAll,
  onBulkDelete,
  onBulkTag,
  onBulkShare,
  onBulkDownload,
  onCategoryUpdate,
  categories,
  isDeleting,
}: any) => (
  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between gap-4">
    <span className="text-sm font-medium text-blue-900">
      {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
    </span>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onSelectAll}>Select All</Button>
      <Button variant="outline" size="sm" onClick={onClearSelection}>Deselect All</Button>
      
      <Select onValueChange={onCategoryUpdate}>
        <SelectTrigger className="w-40">
          <FolderOpen className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Move to..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="uncategorized">
            <div className="flex items-center gap-2">
              <Square className="h-4 w-4 text-gray-400" /> Uncategorized
            </div>
          </SelectItem>
          {categories.filter((cat: Category) => cat.id && cat.id > 0).map((category: Category) => (
            <SelectItem key={category.id} value={category.id.toString()}>
              <div className="flex items-center gap-2">
                <i className={`${category.icon} text-${category.color}-500`}></i>
                {category.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <BatchTagManager
        selectedDocuments={Array.from(selectedDocuments).map(id => ({ id, name: `Doc ${id}` }))}
        onComplete={() => {}} // Placeholder
      />
      <Button variant="outline" size="sm" disabled><Share2 className="h-4 w-4 mr-2" /> Share</Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedDocuments.size} documents?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onBulkDelete(Array.from(selectedDocuments))} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
);

// Placeholder for UnifiedDocumentCard - replace with actual component import
const UnifiedDocumentCard = ({ document, bulkMode, isSelected, onToggleSelect, onUpdate, onDelete, categories }: any) => (
  <Card className="relative p-4 hover:shadow-lg transition-shadow">
    {bulkMode && (
      <div className="absolute top-2 left-2 z-10">
        <Button size="sm" variant="ghost" className="p-0 h-6 w-6" onClick={onToggleSelect}>
          {isSelected ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-gray-400" />}
        </Button>
      </div>
    )}
    <CardHeader className="pb-3 px-0 pt-0">
      <div className="flex items-center justify-between">
        <CardTitle className="text-base font-semibold truncate max-w-xs">
          {document.name}
        </CardTitle>
        <div className="flex items-center space-x-1">
          {document.expiryDate && <Clock className="h-4 w-4 text-orange-500" />}
          {document.priority && <AlertCircle className="h-4 w-4 text-red-500" />}
        </div>
      </div>
    </CardHeader>
    <CardContent className="p-0 space-y-2">
      <p className="text-xs text-gray-500 truncate">
        Category: {categories?.find((cat: Category) => cat.id === document.categoryId)?.name || 'Uncategorized'}
      </p>
      <p className="text-xs text-gray-500">
        {new Date(document.createdAt).toLocaleDateString()}
      </p>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" onClick={() => alert("View document logic needed")}>
            <FileText className="h-4 w-4 text-gray-600" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => alert("Download document logic needed")}>
            <Download className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4 text-gray-600" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => alert("Edit logic needed")}>
              <Pencil className="h-4 w-4 mr-2" /> Edit Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => alert("Tagging logic needed")}>
              <Tag className="h-4 w-4 mr-2" /> Add Tags
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => alert("Share logic needed")}>
              <Share2 className="h-4 w-4 mr-2" /> Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(document.id)}>
              <Trash2 className="h-4 w-4 mr-2 text-red-500" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CardContent>
  </Card>
);

// Placeholder for handleUploadComplete - replace with actual function
const handleUploadComplete = () => {
  queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
};

// Placeholder for handleDocumentUpdate - replace with actual function
const handleDocumentUpdate = () => {
  queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
};

// Placeholder for handleDocumentDelete - replace with actual function
const handleDocumentDelete = (id: number) => {
  console.log(`Delete document ${id}`);
  // Implement delete logic, likely using a mutation
};

// Placeholder for handleBulkDelete - replace with actual function
const handleBulkDelete = (ids: number[]) => {
  console.log(`Bulk delete documents: ${ids}`);
  // Implement bulk delete logic
};

// Placeholder for handleBulkTag - replace with actual function
const handleBulkTag = (data: any) => {
  console.log("Bulk tag:", data);
};

// Placeholder for handleBulkShare - replace with actual function
const handleBulkShare = (data: any) => {
  console.log("Bulk share:", data);
};

// Placeholder for handleBulkDownload - replace with actual function
const handleBulkDownload = (data: any) => {
  console.log("Bulk download:", data);
};

// Placeholder for handleBulkCategoryUpdate - replace with actual function
const handleBulkCategoryUpdate = (data: any) => {
  console.log("Bulk category update:", data);
};

// Mock components for demonstration purposes - replace with actual imports if they exist
import { Pencil, Tag, MoreVertical, Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";