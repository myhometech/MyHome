import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  TrendingUp, 
  Brain,
  Calendar,
  DollarSign,
  Users,
  Shield,
  ListTodo,
  FileText
} from "lucide-react";

interface DocumentInsight {
  id: string;
  documentId: number;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  category: 'financial' | 'important_dates' | 'general';
  status: 'open' | 'resolved' | 'dismissed';
  title: string;
  content: string;
  dueDate?: string;
  confidence: number;
  documentName?: string;
}

interface InsightMetrics {
  total: number;
  open: number;
  highPriority: number;
  resolved: number;
  actionItems: number;
  keyDates: number;
  compliance: number;
  upcomingDeadlines: number;
  manualEvents: number;
  byType: {
    summary: number;
    action_items: number;
    key_dates: number;
    financial_info: number;
    contacts: number;
    compliance: number;
  };
  byCategory: {
    financial: number;
    important_dates: number;
    general: number;
  };
}

interface InsightsSummaryDashboardProps {
  onFilterChange: (filter: { status?: string; category?: string; type?: string }) => void;
  hideHeader?: boolean;
}

export default function InsightsSummaryDashboard({ onFilterChange, hideHeader }: InsightsSummaryDashboardProps) {
  // Fetch metrics from dedicated endpoint for better performance
  const { data: metrics, isLoading, error } = useQuery<InsightMetrics>({
    queryKey: ["/api/insights/metrics"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  });

  // Define category configurations
  const categoryConfig = {
    financial: { 
      icon: DollarSign, 
      label: 'Financial',
      color: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
      borderColor: 'border-emerald-200'
    },
    important_dates: { 
      icon: Calendar, 
      label: 'Important Dates',
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200'
    },
    general: { 
      icon: FileText, 
      label: 'General',
      color: 'from-gray-500 to-gray-600',
      bgColor: 'bg-gray-50',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-200'
    }
  };

  // Helper function to safely get category config
  const getCategoryConfig = (category: string | undefined | null) => {
    const validCategory = category && categoryConfig[category as keyof typeof categoryConfig] 
      ? category as keyof typeof categoryConfig 
      : 'general';
    return categoryConfig[validCategory];
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        {!hideHeader && (
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-purple-600" />
            <div>
              <h1 className="text-2xl font-bold">MyHome</h1>
              <p className="text-gray-600">Loading metrics...</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error || !metrics) {
    return (
      <div className="space-y-6">
        {!hideHeader && (
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-purple-600" />
            <div>
              <h1 className="text-2xl font-bold">MyHome</h1>
              <p className="text-gray-600">Unable to load metrics</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Mock insights data for demonstration purposes, replace with actual data fetching if needed
  // const insights: DocumentInsight[] = Array.from({ length: 50 }, (_, i) => ({
  //   id: `insight-${i}`,
  //   documentId: Math.floor(i / 5) + 1,
  //   type: ['summary', 'action_items', 'key_dates', 'financial_info', 'contacts'][i % 5] as any,
  //   category: ['financial', 'important_dates', 'general'][i % 3] as any,
  //   status: ['open', 'resolved', 'dismissed'][i % 3] as any,
  //   title: `Insight Title ${i + 1}`,
  //   content: `Insight content ${i + 1}. This is a sample insight to test the dashboard.`,
  //   dueDate: i % 4 === 0 ? new Date(Date.now() + i * 86400000).toISOString() : undefined,
  //   confidence: Math.random(),
  //   documentName: `Document ${Math.floor(i / 5) + 1}.pdf`,
  // }));

  // For now, we'll simulate insights based on metrics
  // This part needs to be replaced with actual fetching of insights data
  const insights: DocumentInsight[] = [];
  // Populate insights based on metrics to ensure categoryStats calculation works
  for (let i = 0; i < (metrics.byCategory?.financial || 0); i++) {
    insights.push({
      id: `financial-${i}`,
      documentId: i,
      type: 'financial_info',
      category: 'financial',
      status: 'open',
      title: `Financial Insight ${i}`,
      content: `Details about financial matter ${i}.`,
      confidence: 0.8,
    });
  }
  for (let i = 0; i < (metrics.byCategory?.important_dates || 0); i++) {
    insights.push({
      id: `date-${i}`,
      documentId: i,
      type: 'key_dates',
      category: 'important_dates',
      status: 'open',
      title: `Important Date ${i}`,
      content: `Details about important date ${i}.`,
      confidence: 0.7,
      dueDate: new Date(Date.now() + i * 86400000).toISOString(),
    });
  }
  for (let i = 0; i < (metrics.byCategory?.general || 0); i++) {
    insights.push({
      id: `general-${i}`,
      documentId: i,
      type: 'summary',
      category: 'general',
      status: 'open',
      title: `General Insight ${i}`,
      content: `General information ${i}.`,
      confidence: 0.6,
    });
  }


  // Process insights to get category statistics
  const categoryStats = insights.reduce((stats, insight) => {
    const categoryData = getCategoryConfig(insight.category);
    const category = insight.category && categoryConfig[insight.category as keyof typeof categoryConfig] 
      ? insight.category 
      : 'general';
    stats[category] = (stats[category] || 0) + 1;
    return stats;
  }, {} as Record<string, number>);

  const displayLimit = 5; // Number of insights to display initially

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex items-center space-x-3">
          <Brain className="h-8 w-8 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold">MyHome</h1>
            <p className="text-gray-600">Smart insights from your document library</p>
          </div>
        </div>
      )}

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        {/* Total Open Insights */}
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-accent-purple-500 to-accent-purple-600 text-white border-0 shadow-md">
          <CardContent className="p-3 md:p-4" onClick={() => onFilterChange({ status: 'open', category: 'all', type: 'all' })}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs md:text-sm font-medium text-white/90">Open Items</p>
                <p className="text-xl md:text-2xl font-bold text-white">{metrics.open}</p>
              </div>
              <div className="h-10 w-10 md:h-12 md:w-12 bg-white/20 rounded-xl flex items-center justify-center">
                <ListTodo className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 md:h-8 text-white hover:bg-white/20 rounded-lg font-medium"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange({ status: 'open', category: 'all', type: 'all' });
              }}
            >
              <span className="hidden sm:inline">View All Open</span>
              <span className="sm:hidden">View</span>
            </Button>
          </CardContent>
        </Card>

        {/* Financial */}
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-accent-purple-600 to-accent-purple-700 text-white border-0 shadow-md">
          <CardContent className="p-3 md:p-4" onClick={() => onFilterChange({ status: 'open', category: 'financial', type: 'all' })}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs md:text-sm font-medium text-white/90">Financial</p>
                <p className="text-xl md:text-2xl font-bold text-white">{metrics.byCategory?.financial || 0}</p>
              </div>
              <div className="h-10 w-10 md:h-12 md:w-12 bg-white/20 rounded-xl flex items-center justify-center">
                <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 md:h-8 text-white hover:bg-white/20 rounded-lg font-medium"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange({ status: 'open', category: 'financial', type: 'all' });
              }}
            >
              <span className="hidden sm:inline">View Financial</span>
              <span className="sm:hidden">View</span>
            </Button>
          </CardContent>
        </Card>

        {/* Important Dates */}
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-accent-purple-400 to-accent-purple-500 text-white border-0 shadow-md">
          <CardContent className="p-3 md:p-4" onClick={() => onFilterChange({ status: 'open', category: 'important_dates', type: 'all' })}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs md:text-sm font-medium text-white/90">Important Dates</p>
                <p className="text-xl md:text-2xl font-bold text-white">{metrics.byCategory?.important_dates || 0}</p>
              </div>
              <div className="h-10 w-10 md:h-12 md:w-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Calendar className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 md:h-8 text-white hover:bg-white/20 rounded-lg font-medium"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange({ status: 'open', category: 'important_dates', type: 'all' });
              }}
            >
              <span className="hidden sm:inline">View Dates</span>
              <span className="sm:hidden">View</span>
            </Button>
          </CardContent>
        </Card>

        {/* General */}
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-accent-purple-300 to-accent-purple-400 text-white border-0 shadow-md">
          <CardContent className="p-3 md:p-4" onClick={() => onFilterChange({ status: 'resolved', category: 'all', type: 'all' })}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs md:text-sm font-medium text-white/90">General</p>
                <p className="text-xl md:text-2xl font-bold text-white">{metrics.byCategory?.general || 0}</p>
              </div>
              <div className="h-10 w-10 md:h-12 md:w-12 bg-white/20 rounded-xl flex items-center justify-center">
                <CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 md:h-8 text-white hover:bg-white/20 rounded-lg font-medium"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange({ status: 'open', category: 'general', type: 'all' });
              }}
            >
              <span className="hidden sm:inline">View General</span>
              <span className="sm:hidden">View</span>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Insights List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Recent Insights</h2>
        {insights.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {insights.slice(0, displayLimit).map((insight) => {
              const categoryData = getCategoryConfig(insight.category);
              const IconComponent = categoryData?.icon || FileText; // Fallback to FileText if icon is missing
              return (
                <Card key={insight.id} className={`border-l-4 ${categoryData.bgColor} ${categoryData.borderColor} rounded-lg`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${categoryData.textColor} ${categoryData.bgColor}`}>
                        <IconComponent className={`h-4 w-4 mr-1 ${categoryData.textColor}`} />
                        {categoryData.label}
                      </div>
                      <Badge variant="outline" className="capitalize">{insight.status}</Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 truncate">{insight.title}</h3>
                    <p className="text-sm text-gray-600 line-clamp-2">{insight.content}</p>
                    {insight.dueDate && (
                      <div className="text-xs text-gray-500 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Due: {new Date(insight.dueDate).toLocaleDateString()}
                      </div>
                    )}
                    {/* Add more details or actions as needed */}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500">No insights available yet.</p>
        )}

        {insights.length > displayLimit && (
          <Button variant="outline" className="w-full" onClick={() => onFilterChange({})}>
            View All Insights
          </Button>
        )}
      </div>
    </div>
  );
}