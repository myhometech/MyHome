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
  const { toast } = useToast();
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
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dashboardFilter, setDashboardFilter] = useState<any>(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());

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
      await Promise.all(
        documentIds.map(id => fetch(`/api/documents/${id}`, {
          method: "DELETE",
          credentials: "include",
        }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
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
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/documents", selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("categoryId", selectedCategory.toString());
      if (searchQuery) params.append("search", searchQuery);

      const response = await fetch(`/api/documents?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    retry: false,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  // Mock components for demonstration purposes, replace with actual imports
  const CriticalInsightsDashboard = () => <div className="bg-gray-100 p-4 rounded-lg">Critical Insights Dashboard</div>;
  const TopInsightsWidget = () => <div className="bg-gray-100 p-4 rounded-lg">Top Insights Widget</div>;
  const UnifiedInsightsDashboard = ({ filter }: { filter: any }) => <div className="bg-gray-100 p-4 rounded-lg">Unified Insights Dashboard (Filter: {JSON.stringify(filter)})</div>;
  const YourAssetsSection = () => <div className="bg-gray-100 p-4 rounded-lg">Your Assets Section</div>;

  const handleFilterChange = (filter: any) => {
    // This is the filter for the UnifiedInsightsDashboard, not the main dashboard overview cards
    // It's currently a placeholder and might need adjustment based on how UnifiedInsightsDashboard uses filters.
  };

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      const response = await fetch('/api/auth/user', { credentials: 'include' });
      if (!response.ok) throw new Error('Not authenticated');
      return response.json();
    },
  });

  console.log('Home component rendering with user:', user, 'loading:', userLoading);

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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="p-3 md:p-6 border-b border-gray-200 dark:border-gray-700">
            {bulkMode && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    Multi-Select Mode Active - Click documents to select them
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Document Library</h2>
                <HelpBubble
                  title={helpContent.search.title}
                  content={helpContent.search.content}
                  characterTip={helpContent.search.characterTip}
                  size="sm"
                />
              </div>
              <div className="flex items-center space-x-2">
                {documents.length > 0 && (
                  <Button
                    variant={bulkMode ? "default" : "outline"}
                    size="sm"
                    onClick={toggleBulkMode}
                    className={bulkMode 
                      ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-md" 
                      : "border-2 border-blue-500 text-blue-600 hover:bg-blue-50 hover:border-blue-600 font-medium shadow-sm"
                    }
                  >
                    {bulkMode ? <X className="h-4 w-4 mr-2" /> : <CheckSquare className="h-4 w-4 mr-2" />}
                    <span className="hidden sm:inline">{bulkMode ? "Cancel Multi-Select" : "Multi-Select"}</span>
                    <span className="sm:hidden">{bulkMode ? "Cancel" : "Select"}</span>
                  </Button>
                )}
                <div className="flex items-center space-x-1">
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
                  <Button variant="outline" size="sm">
                    <SortAsc className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Bulk operations bar */}
            {bulkMode && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-blue-900">
                      {selectedDocuments.size > 0 
                        ? `${selectedDocuments.size} document${selectedDocuments.size !== 1 ? 's' : ''} selected`
                        : "Click on documents below to select them for bulk operations"
                      }
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllDocuments}
                        disabled={documents.length === 0}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearSelection}
                        disabled={selectedDocuments.size === 0}
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>

                  {selectedDocuments.size > 0 && (
                    <div className="flex items-center gap-2">
                      {/* Move to Category */}
                      <Select onValueChange={(value) => bulkMoveCategoryMutation.mutate({ documentIds: Array.from(selectedDocuments), categoryId: value === "uncategorized" ? null : parseInt(value) })}>
                        <SelectTrigger className="w-40">
                          <FolderOpen className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Move to..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uncategorized">
                            <div className="flex items-center gap-2">
                              <Square className="h-4 w-4 text-gray-400" />
                              Uncategorized
                            </div>
                          </SelectItem>
                          {categories.filter((category: Category) => category.id && category.id > 0).map((category: Category) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              <div className="flex items-center gap-2">
                                <i className={`${category.icon} text-${category.color}-500`}></i>
                                {category.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Smart Tag Suggestions */}
                      <BatchTagManager
                        selectedDocuments={Array.from(selectedDocuments).map(id => {
                          const doc = documents.find((d: Document) => d.id === id);
                          return { id, name: doc?.name || 'Unknown' };
                        })}
                        onComplete={() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                          setBulkMode(false);
                          setSelectedDocuments(new Set());
                        }}
                      />

                      {/* Share Multiple */}
                      <Button variant="outline" size="sm" disabled>
                        <Share2 className="h-4 w-4 mr-2" />
                        Share (Coming Soon)
                      </Button>

                      {/* Delete Multiple */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="mx-2 max-w-sm md:max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Documents</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedDocuments))}
                              className="bg-red-600 hover:bg-red-700"
                              disabled={bulkDeleteMutation.isPending}
                            >
                              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 md:p-6">
            {documentsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg mb-3"></div>
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded mb-2"></div>
                    <div className="flex justify-between">
                      <div className="h-3 bg-gray-200 rounded w-12"></div>
                      <div className="h-3 bg-gray-200 rounded w-12"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (() => {
              console.log('[DEBUG] Documents check - length:', documents.length, 'array:', documents);
              return documents.length === 0;
            })() ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <Search className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
                <p className="text-gray-500 mb-6">
                  {searchQuery || selectedCategory
                    ? "Try adjusting your search or filters"
                    : "Upload your first document to get started"}
                </p>
                {!searchQuery && !selectedCategory && (
                  <Button
                    onClick={() => document.querySelector('[data-upload-zone]')?.scrollIntoView({ behavior: 'smooth' })}
                    className="bg-primary hover:bg-blue-700"
                  >
                    Upload Your First Document
                  </Button>
                )}
              </div>
            ) : (
              <div className={
                viewMode === "grid"
                  ? "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4 auto-rows-fr"
                  : "space-y-3 md:space-y-4"
              }>
                {(() => {
                  console.log('[DEBUG] About to render documents:', documents);
                  console.log('[DEBUG] Documents length:', documents.length);
                  console.log('[DEBUG] Documents loading:', documentsLoading);
                  return documents.map((document: any) => {
                    console.log('[DEBUG] Rendering document:', document.id, document.name);
                    return (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    categories={categories}
                    viewMode={viewMode}
                    bulkMode={bulkMode}
                    isSelected={selectedDocuments.has(document.id)}
                    onToggleSelection={() => toggleDocumentSelection(document.id)}
                    onUpdate={() => {
                      // Refresh queries when documents are updated
                      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/documents/expiry-alerts"] });
                    }}
                  />
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}