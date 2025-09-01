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
import FloatingChatWidget from "@/components/floating-chat-widget";
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
  Calendar as CalendarIcon, // Alias to avoid conflict if Calendar is used elsewhere
  Download // Import Download icon
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

// Added import for UnifiedInsightsDashboard and InsightsSummaryDashboard
import { UnifiedInsightsDashboard } from "@/components/unified-insights-dashboard";
import InsightsSummaryDashboard from "@/components/insights-summary-dashboard";


type Category = {
  id: number;
  name: string;
  icon?: string;
  color?: string;
};

type Document = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  categoryId: number | null;
  tags: string[];
  path: string;
  // Add other relevant properties
};

type DocumentInsight = {
  id: number;
  documentId: number;
  insight: string;
  type: string;
  createdAt: string;
  // Add other relevant properties
};

// Component to show insights from all documents
function InsightsFromAllDocuments() {
  const [, setLocation] = useLocation();

  // Fetch all documents to get their insights
  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const response = await fetch("/api/documents", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
  });

  // Get insights for first few documents
  const documentInsights = documents.slice(0, 5).map((doc: Document) => {
    const { data: insights } = useQuery({
      queryKey: ['/api/documents', doc.id, 'insights', 'primary'],
      queryFn: async () => {
        const response = await fetch(`/api/documents/${doc.id}/insights?tier=primary&limit=5`, {
          credentials: 'include'
        });
        if (!response.ok) return { insights: [] };
        return response.json();
      },
      enabled: !!doc.id,
      staleTime: 30 * 1000, // 30 seconds
      refetchOnWindowFocus: true,
    });
    return { document: doc, insights: insights?.insights || [] };
  });

  const allInsights = documentInsights.flatMap(item => 
    item.insights.map((insight: any) => ({
      ...insight,
      documentName: item.document.name,
      documentId: item.document.id
    }))
  ).slice(0, 12); // Show max 12 insights

  if (allInsights.length === 0) {
    return (
      <div className="text-center py-8">
        <Brain className="h-12 w-12 text-accent-purple-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No AI Insights Yet</h3>
        <p className="text-gray-600 mb-4">
          Upload documents and generate insights to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {allInsights.map((insight: any, index: number) => {
        const getCategoryGradient = (category: string) => {
          switch (category) {
            case 'financial': 
              return 'bg-gradient-to-br from-accent-purple-600 to-accent-purple-700 text-white border-accent-purple-500';
            case 'important_dates': 
              return 'bg-gradient-to-br from-accent-purple-500 to-accent-purple-600 text-white border-accent-purple-400';
            case 'general': 
              return 'bg-gradient-to-br from-accent-purple-400 to-accent-purple-500 text-white border-accent-purple-300';
            default: 
              return 'bg-gradient-to-br from-accent-purple-500 to-accent-purple-600 text-white border-accent-purple-400';
          }
        };

        const getInsightIcon = (type: string) => {
          switch (type) {
            case 'contacts': return <Users className="h-4 w-4" />;
            case 'financial_info': return <DollarSign className="h-4 w-4" />;
            case 'key_dates': return <Calendar className="h-4 w-4" />;
            case 'action_items': return <CheckCircle className="h-4 w-4" />;
            case 'compliance': return <Shield className="h-4 w-4" />;
            default: return <Brain className="h-4 w-4" />;
          }
        };

        return (
          <Card 
            key={`${insight.documentId}-${insight.id || index}`}
            className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-105 border-2 ${getCategoryGradient(insight.category || 'general')}`}
            onClick={() => setLocation(`/document/${insight.documentId}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {getInsightIcon(insight.type)}
                  <span className="text-sm font-medium text-white/90">
                    {insight.type?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Insight'}
                  </span>
                </div>
                <Badge className="bg-white/20 text-white border-white/30 text-xs">
                  {insight.category?.replace('_', ' ').toUpperCase() || 'GENERAL'}
                </Badge>
              </div>

              <h3 className="font-semibold text-white mb-2 line-clamp-2">
                {insight.title || 'Document Insight'}
              </h3>

              <p className="text-sm text-white/90 line-clamp-2 mb-3">
                {insight.content || 'AI-generated insight from your document'}
              </p>

              <div className="flex items-center justify-between text-xs text-white/80">
                <span>{insight.documentName}</span>
                <span>{insight.confidence ? `${Math.round(insight.confidence * 100)}%` : '95%'}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

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
          bg: 'bg-gradient-to-r from-accent-purple-50/60 to-accent-purple-100/40 dark:bg-accent-purple-900/20',
          border: 'border-accent-purple-200 dark:border-accent-purple-800',
          icon: 'text-accent-purple-600 dark:text-accent-purple-400',
          hover: 'hover:bg-gradient-to-r hover:from-accent-purple-100/70 hover:to-accent-purple-200/50 dark:hover:bg-accent-purple-900/30'
        };
      case 'red':
        return {
          bg: 'bg-gradient-to-r from-accent-purple-100/70 to-accent-purple-200/50 dark:bg-accent-purple-900/30',
          border: 'border-accent-purple-300 dark:border-accent-purple-700',
          icon: 'text-accent-purple-700 dark:text-accent-purple-300',
          hover: 'hover:bg-gradient-to-r hover:from-accent-purple-200/80 hover:to-accent-purple-300/60 dark:hover:bg-accent-purple-800/40'
        };
      case 'orange':
        return {
          bg: 'bg-gradient-to-r from-accent-purple-75/55 to-accent-purple-125/35 dark:bg-accent-purple-900/25',
          border: 'border-accent-purple-250 dark:border-accent-purple-750',
          icon: 'text-accent-purple-650 dark:text-accent-purple-350',
          hover: 'hover:bg-gradient-to-r hover:from-accent-purple-125/65 hover:to-accent-purple-175/45 dark:hover:bg-accent-purple-825/35'
        };
      case 'green':
        return {
          bg: 'bg-gradient-to-r from-accent-purple-50/50 to-accent-purple-100/30 dark:bg-accent-purple-900/20',
          border: 'border-accent-purple-200 dark:border-accent-purple-800',
          icon: 'text-accent-purple-600 dark:text-accent-purple-400',
          hover: 'hover:bg-gradient-to-r hover:from-accent-purple-100/60 hover:to-accent-purple-200/40 dark:hover:bg-accent-purple-900/30'
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-accent-purple-50/40 to-accent-purple-100/20 dark:bg-accent-purple-900/20',
          border: 'border-accent-purple-200 dark:border-accent-purple-800',
          icon: 'text-accent-purple-500 dark:text-accent-purple-400',
          hover: 'hover:bg-gradient-to-r hover:from-accent-purple-100/50 hover:to-accent-purple-200/30 dark:hover:bg-accent-purple-900/30'
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
  const [, setLocation] = useLocation();

  const actionCards = [
    {
      title: "Chat Assistant",
      description: "Ask questions about your documents",
      icon: FolderOpen,
      color: "purple",
      action: "chat",
      feature: "CHAT_ENABLED", 
      helpContent: helpContent.aiInsights
    },
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
      color: "green",
      action: "manual_event",
      helpContent: helpContent.manualEvents
    },
    {
      title: "Smart Search",
      description: "Find documents by content or keywords",
      icon: Search,
      color: "orange",
      action: "search",
      helpContent: helpContent.search
    }
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return {
          bg: 'bg-gradient-to-br from-accent-purple-50 to-accent-purple-100 dark:from-accent-purple-900/20 dark:to-accent-purple-800/20',
          border: 'border-accent-purple-200 dark:border-accent-purple-700',
          icon: 'text-accent-purple-600 dark:text-accent-purple-400',
          hover: 'hover:from-accent-purple-100 hover:to-accent-purple-200 dark:hover:from-accent-purple-800/30 dark:hover:to-accent-purple-700/30'
        };
      case 'purple':
        return {
          bg: 'bg-gradient-to-br from-accent-purple-100 to-accent-purple-200 dark:from-accent-purple-900/30 dark:to-accent-purple-800/30',
          border: 'border-accent-purple-300 dark:border-accent-purple-600',
          icon: 'text-accent-purple-700 dark:text-accent-purple-300',
          hover: 'hover:from-accent-purple-200 hover:to-accent-purple-300 dark:hover:from-accent-purple-800/40 dark:hover:to-accent-purple-700/40'
        };
      case 'green':
        return {
          bg: 'bg-gradient-to-br from-accent-purple-25 to-accent-purple-75 dark:from-accent-purple-900/15 dark:to-accent-purple-850/15',
          border: 'border-accent-purple-150 dark:border-accent-purple-750',
          icon: 'text-accent-purple-550 dark:text-accent-purple-450',
          hover: 'hover:from-accent-purple-75 hover:to-accent-purple-125 dark:hover:from-accent-purple-850/25 dark:hover:to-accent-purple-800/25'
        };
      case 'orange':
        return {
          bg: 'bg-gradient-to-br from-accent-purple-75 to-accent-purple-125 dark:from-accent-purple-900/25 dark:to-accent-purple-825/25',
          border: 'border-accent-purple-250 dark:border-accent-purple-725',
          icon: 'text-accent-purple-625 dark:text-accent-purple-375',
          hover: 'hover:from-accent-purple-125 hover:to-accent-purple-175 dark:hover:from-accent-purple-825/35 dark:hover:to-accent-purple-775/35'
        };
      default:
        return {
          bg: 'bg-gradient-to-br from-accent-purple-25 to-accent-purple-50 dark:from-accent-purple-900/10 dark:to-accent-purple-875/10',
          border: 'border-accent-purple-100 dark:border-accent-purple-800',
          icon: 'text-accent-purple-500 dark:text-accent-purple-500',
          hover: 'hover:from-accent-purple-50 hover:to-accent-purple-100 dark:hover:from-accent-purple-875/20 dark:hover:to-accent-purple-850/20'
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

        const handleClick = () => {
          switch (card.action) {
            case 'chat':
              setLocation('/chat');
              break;
            case 'upload':
              // Handle upload action
              break;
            case 'manual_event':
              // Handle manual event action
              break;
            case 'search':
              // Handle search action
              break;
            default:
              break;
          }
        };

        return (
          <Card 
            key={index} 
            className={`cursor-pointer transition-all duration-200 ${colors.bg} ${colors.border} ${colors.hover} hover:shadow-lg hover:scale-105`}
            onClick={handleClick}
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

  // Add near the top with other query hooks
  const { data: insightsData, isLoading: insightsLoading, error: insightsError } = useQuery({
    queryKey: ['/api/insights/critical'],
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    retry: (failureCount, error) => {
      // Don't retry on category-related errors
      if (error?.message?.includes('category') || error?.message?.includes('undefined')) {
        return false;
      }
      return failureCount < 2;
    },
    select: (data: any) => {
      // Ensure insights have proper category field
      if (!data || !Array.isArray(data)) return [];
      return data.map((insight: any) => ({
        ...insight,
        category: insight.category || 'general',
        confidence: typeof insight.confidence === 'number' ? insight.confidence : 0.8
      }));
    }
  });

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
  // These were previously placeholders but now we have actual components imported.
  // Removed the mock components definition.

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
        {/* Financial, Important Dates, and General Cards - Top Priority Section */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Financial Card */}
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-green-600 to-green-700 text-white border-0 shadow-md"
              onClick={() => setSelectedCategory(categories.find((c: Category) => c.name.toLowerCase().includes('financial'))?.id || null)}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xl font-bold text-white">Financial</p>
                    <p className="text-sm text-white/90">Bills, payments & money matters</p>
                  </div>
                  <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-white hover:bg-white/20 rounded-lg font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCategory(categories.find((c: Category) => c.name.toLowerCase().includes('financial'))?.id || null);
                  }}
                >
                  View Financial Documents
                </Button>
              </CardContent>
            </Card>

            {/* Important Dates Card */}
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-red-600 to-red-700 text-white border-0 shadow-md"
              onClick={() => setSelectedCategory(categories.find((c: Category) => c.name.toLowerCase().includes('important'))?.id || null)}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xl font-bold text-white">Important Dates</p>
                    <p className="text-sm text-white/90">Deadlines & key events</p>
                  </div>
                  <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-white hover:bg-white/20 rounded-lg font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCategory(categories.find((c: Category) => c.name.toLowerCase().includes('important'))?.id || null);
                  }}
                >
                  View Important Dates
                </Button>
              </CardContent>
            </Card>

            {/* General Card */}
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0 shadow-md"
              onClick={() => setSelectedCategory(categories.find((c: Category) => c.name.toLowerCase().includes('general'))?.id || null)}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xl font-bold text-white">General</p>
                    <p className="text-sm text-white/90">All other documents</p>
                  </div>
                  <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-white hover:bg-white/20 rounded-lg font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCategory(null);
                  }}
                >
                  View All Documents
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* AI Insights Section */}
        <div className="mb-8">
          <Card className="bg-white border border-gray-200">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-accent-purple-400 to-accent-purple-500 rounded-xl shadow-sm">
                    <Brain className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-semibold text-gray-900">AI Insights</CardTitle>
                    <p className="text-sm text-gray-600">Recent insights from your documents</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <InsightsFromAllDocuments />
            </CardContent>
          </Card>
        </div>

        {/* TICKET 17: Show AI insight generation status */}
        <FeatureGate feature="AI_INSIGHTS">
          <InsightJobStatus />
        </FeatureGate>

        {/* Category Filter */}
        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />


        {/* Documents Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mt-8">
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
                      ? "bg-accent-purple-600 text-white border-accent-purple-600 hover:bg-accent-purple-700 shadow-md" 
                      : "border-2 border-accent-purple-500 text-accent-purple-600 hover:bg-accent-purple-50 hover:border-accent-purple-600 font-medium shadow-sm"
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
              <div className="mt-4 p-4 bg-accent-purple-50 rounded-lg border border-accent-purple-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-accent-purple-900">
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

          <div className="p-4 md:p-6">
            {documentsLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                    className="bg-accent-purple-600 hover:bg-accent-purple-700 text-white"
                  >
                    Upload Your First Document
                  </Button>
                )}
              </div>
            ) : (
              <div className={
                viewMode === "grid"
                  ? "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                  : "space-y-4"
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

      {/* Floating Chat Widget */}
      <FloatingChatWidget />
    </div>
  );
}