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
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-2 md:p-3" onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'all' })}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-gray-600">Open Items</p>
                <p className="text-xl md:text-2xl font-bold">{metrics.open}</p>
              </div>
              <div className="h-8 w-8 md:h-12 md:w-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <ListTodo className="h-4 w-4 md:h-6 md:w-6 text-blue-600" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-1 md:mt-2 text-xs h-6 md:h-8"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange({ status: 'open', priority: 'all', type: 'all' });
              }}
            >
              <span className="hidden sm:inline">View All Open</span>
              <span className="sm:hidden">View</span>
            </Button>
          </CardContent>
        </Card>

        {/* Financial */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-2 md:p-3" onClick={() => onFilterChange({ status: 'open', category: 'financial', type: 'all' })}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-gray-600">Financial</p>
                <p className="text-xl md:text-2xl font-bold text-blue-600">{metrics.byCategory?.financial || 0}</p>
              </div>
              <div className="h-8 w-8 md:h-12 md:w-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <DollarSign className="h-4 w-4 md:h-6 md:w-6 text-blue-600" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-1 md:mt-2 text-xs h-6 md:h-8"
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

        {/* Manual Events */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-2 md:p-3" onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'manual_event' })}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-gray-600">Manual Events</p>
                <p className="text-xl md:text-2xl font-bold text-green-600">{metrics.manualEvents}</p>
              </div>
              <div className="h-8 w-8 md:h-12 md:w-12 bg-green-50 rounded-lg flex items-center justify-center">
                <Calendar className="h-4 w-4 md:h-6 md:w-6 text-green-600" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-1 md:mt-2 text-xs h-6 md:h-8"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange({ status: 'open', priority: 'all', type: 'manual_event' });
              }}
            >
              <span className="hidden sm:inline">View Events</span>
              <span className="sm:hidden">View</span>
            </Button>
          </CardContent>
        </Card>

        {/* Resolved */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-2 md:p-3" onClick={() => onFilterChange({ status: 'resolved', priority: 'all', type: 'all' })}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-gray-600">Resolved</p>
                <p className="text-xl md:text-2xl font-bold text-green-600">{metrics.resolved}</p>
              </div>
              <div className="h-8 w-8 md:h-12 md:w-12 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-4 w-4 md:h-6 md:w-6 text-green-600" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-1 md:mt-2 text-xs h-6 md:h-8"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange({ status: 'resolved', priority: 'all', type: 'all' });
              }}
            >
              <span className="hidden sm:inline">View Resolved</span>
              <span className="sm:hidden">View</span>
            </Button>
          </CardContent>
        </Card>
      </div>




    </div>
  );
}