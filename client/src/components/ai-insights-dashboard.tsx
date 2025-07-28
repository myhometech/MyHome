import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, Filter, RefreshCw, TrendingUp, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { InsightCard } from './insight-card';
import { DocumentInsight } from '@shared/schema';

interface InsightsResponse {
  insights: DocumentInsight[];
  total: number;
  filters: {
    status?: string;
    type?: string;
    priority?: string;
    sort?: string;
  };
}

export function AIInsightsDashboard() {
  const [activeTab, setActiveTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('priority');

  const {
    data: insightsData,
    isLoading,
    error,
    refetch
  } = useQuery<InsightsResponse>({
    queryKey: ['/api/insights', statusFilter, typeFilter, priorityFilter, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (typeFilter && typeFilter !== 'all') params.append('type', typeFilter);
      if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (sortBy) params.append('sort', sortBy);

      const response = await fetch(`/api/insights?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const insights = insightsData?.insights || [];
  
  // Filter insights by tab
  const getInsightsByTab = (tab: string) => {
    switch (tab) {
      case 'open':
        return insights.filter(insight => insight.status === 'open' || !insight.status);
      case 'resolved':
        return insights.filter(insight => insight.status === 'resolved');
      case 'dismissed':
        return insights.filter(insight => insight.status === 'dismissed');
      default:
        return insights;
    }
  };

  const tabInsights = getInsightsByTab(activeTab);

  // Count insights by status
  const openCount = insights.filter(i => i.status === 'open' || !i.status).length;
  const resolvedCount = insights.filter(i => i.status === 'resolved').length;
  const dismissedCount = insights.filter(i => i.status === 'dismissed').length;

  // Count insights by priority
  const highPriorityCount = insights.filter(i => i.priority === 'high' && (i.status === 'open' || !i.status)).length;
  const mediumPriorityCount = insights.filter(i => i.priority === 'medium' && (i.status === 'open' || !i.status)).length;

  const handleStatusUpdate = (insightId: string, status: 'open' | 'dismissed' | 'resolved') => {
    // Optimistically update the local state
    refetch();
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setPriorityFilter('all');
    setSortBy('priority');
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Failed to Load Insights</h3>
          <p className="text-gray-600 mb-4">There was an error loading your AI insights.</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Brain className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">AI Insights Dashboard</h1>
            <p className="text-gray-600">Intelligent document analysis and recommendations</p>
          </div>
        </div>
        <Button onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Total Insights</p>
                <p className="text-2xl font-bold">{insights.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">High Priority</p>
                <p className="text-2xl font-bold text-red-600">{highPriorityCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Medium Priority</p>
                <p className="text-2xl font-bold text-yellow-600">{mediumPriorityCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Resolved</p>
                <p className="text-2xl font-bold text-green-600">{resolvedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filters</span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="action_items">Action Items</SelectItem>
                  <SelectItem value="key_dates">Key Dates</SelectItem>
                  <SelectItem value="financial_info">Financial Info</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="contacts">Contacts</SelectItem>
                  <SelectItem value="summary">Summary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Priority</label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Sort By</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="created">Created Date</SelectItem>
                  <SelectItem value="due_date">Due Date</SelectItem>
                  <SelectItem value="type">Type</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all" className="flex items-center space-x-2">
            <span>All</span>
            <Badge variant="secondary" className="ml-1">{insights.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="open" className="flex items-center space-x-2">
            <span>Open</span>
            <Badge variant="secondary" className="ml-1">{openCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="resolved" className="flex items-center space-x-2">
            <span>Resolved</span>
            <Badge variant="secondary" className="ml-1">{resolvedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="dismissed" className="flex items-center space-x-2">
            <span>Dismissed</span>
            <Badge variant="secondary" className="ml-1">{dismissedCount}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : tabInsights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tabInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onStatusUpdate={handleStatusUpdate}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Insights Found</h3>
                <p className="text-gray-600 mb-4">
                  {activeTab === 'all' 
                    ? "Upload some documents to start generating AI insights."
                    : `No ${activeTab} insights match your current filters.`
                  }
                </p>
                {activeTab !== 'all' && (
                  <Button variant="outline" onClick={() => setActiveTab('all')}>
                    View All Insights
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}