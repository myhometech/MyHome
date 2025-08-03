import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/header';
import { UnifiedInsightsDashboard } from '@/components/unified-insights-dashboard';
import { ManualEventCard } from '@/components/manual-event-card';
import { InsightCard } from '@/components/insight-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Calendar, PenTool, FileText, Clock, AlertCircle, Filter, RefreshCw } from 'lucide-react';
import AddDropdownMenu from '@/components/add-dropdown-menu';
import type { DocumentInsight } from '@shared/schema';

// Manual Event interface
interface ManualEvent {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  repeat: 'none' | 'monthly' | 'quarterly' | 'annually';
  linkedAssetId?: number;
  linkedDocumentIds?: number[];
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface UserAsset {
  id: number;
  name: string;
  type: 'house' | 'car';
}

export function InsightsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Fetch document insights
  const { data: insightsData, isLoading: insightsLoading, refetch: refetchInsights } = useQuery<{insights: DocumentInsight[]}>({
    queryKey: ['/api/insights', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/insights?status=all');
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
  });

  // Fetch manual events
  const { data: manualEvents = [], isLoading: manualEventsLoading, refetch: refetchManualEvents } = useQuery<ManualEvent[]>({
    queryKey: ['/api/manual-events'],
    queryFn: async () => {
      const response = await fetch('/api/manual-events', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch manual events');
      return response.json();
    },
  });

  // Fetch user assets for linking manual events to assets
  const { data: userAssets = [] } = useQuery<UserAsset[]>({
    queryKey: ['/api/user-assets'],
    queryFn: async () => {
      const response = await fetch('/api/user-assets', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch user assets');
      return response.json();
    },
  });

  const insights = insightsData?.insights || [];

  // Filter insights based on filters and exclude unwanted types
  const filteredInsights = insights.filter(insight => {
    const matchesStatus = statusFilter === 'all' || insight.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || insight.priority === priorityFilter;
    const matchesSearch = searchQuery === "" || 
      insight.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      insight.content.toLowerCase().includes(searchQuery.toLowerCase());
    const notExcludedType = !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(insight.type);
    return matchesStatus && matchesPriority && matchesSearch && notExcludedType;
  });

  // Filter manual events based on search
  const filteredManualEvents = manualEvents.filter(event => {
    const matchesSearch = searchQuery === "" || 
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.notes && event.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  // Sort events by due date (upcoming first)
  const sortedManualEvents = [...filteredManualEvents].sort((a, b) => {
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const handleRefreshAll = () => {
    refetchInsights();
    refetchManualEvents();
  };

  const handleStatusUpdate = async (insightId: string, status: 'open' | 'dismissed' | 'resolved') => {
    try {
      const response = await fetch(`/api/insights/${insightId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update insight status');
      refetchInsights();
    } catch (error) {
      console.error('Failed to update insight status:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Insights & Events</h1>
              <p className="text-gray-600">AI insights and manually tracked events</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AddDropdownMenu />
            <Button onClick={handleRefreshAll} disabled={insightsLoading || manualEventsLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${(insightsLoading || manualEventsLoading) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Insights</p>
                  <p className="text-2xl font-bold">{insights.length}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Manual Events</p>
                  <p className="text-2xl font-bold">{manualEvents.length}</p>
                </div>
                <PenTool className="h-8 w-8 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">High Priority</p>
                  <p className="text-2xl font-bold">{insights.filter(i => i.priority === 'high').length}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Upcoming Events</p>
                  <p className="text-2xl font-bold">
                    {manualEvents.filter(e => new Date(e.dueDate) > new Date()).length}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-orange-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Main Content - Tabbed View */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              All ({insights.length + manualEvents.length})
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              AI Insights ({filteredInsights.length})
            </TabsTrigger>
            <TabsTrigger value="events" className="flex items-center gap-2">
              <PenTool className="h-4 w-4" />
              Manual Events ({filteredManualEvents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-6">
            {/* Mixed View - All insights and events */}
            <div className="grid gap-4">
              {/* Manual Events Section */}
              {sortedManualEvents.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <PenTool className="h-5 w-5 text-green-600" />
                    Manual Events ({sortedManualEvents.length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {sortedManualEvents.map((event) => {
                      const linkedAsset = event.linkedAssetId 
                        ? userAssets.find(asset => asset.id === event.linkedAssetId)
                        : undefined;
                      
                      return (
                        <ManualEventCard
                          key={event.id}
                          event={event}
                          linkedAsset={linkedAsset}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI Insights Section */}
              {filteredInsights.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Brain className="h-5 w-5 text-blue-600" />
                    AI Document Insights ({filteredInsights.length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredInsights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onStatusUpdate={handleStatusUpdate}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {filteredInsights.length === 0 && sortedManualEvents.length === 0 && (
                <div className="text-center py-12">
                  <Brain className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-medium mb-2">No Insights or Events Found</h3>
                  <p className="text-gray-600 mb-6">
                    {searchQuery ? 'Try adjusting your search or filters' : 'Upload documents to generate AI insights or create manual events for important dates.'}
                  </p>
                  <AddDropdownMenu />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            {filteredInsights.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredInsights.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onStatusUpdate={handleStatusUpdate}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium mb-2">No AI Insights Found</h3>
                <p className="text-gray-600 mb-6">
                  {searchQuery ? 'No insights match your search criteria.' : 'Upload documents to generate AI insights.'}
                </p>
                <AddDropdownMenu />
              </div>
            )}
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            {sortedManualEvents.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sortedManualEvents.map((event) => {
                  const linkedAsset = event.linkedAssetId 
                    ? userAssets.find(asset => asset.id === event.linkedAssetId)
                    : undefined;
                  
                  return (
                    <ManualEventCard
                      key={event.id}
                      event={event}
                      linkedAsset={linkedAsset}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <PenTool className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium mb-2">No Manual Events Found</h3>
                <p className="text-gray-600 mb-6">
                  {searchQuery ? 'No events match your search criteria.' : 'Create manual events to track important dates.'}
                </p>
                <AddDropdownMenu />
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Compact Dashboard View at Bottom */}
        <div className="mt-12 pt-8 border-t">
          <UnifiedInsightsDashboard searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        </div>
      </main>
    </div>
  );
}