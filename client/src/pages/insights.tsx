import React, { useState } from 'react';
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
import { Brain, Calendar, PenTool, FileText, Clock, AlertCircle, Filter, RefreshCw, X } from 'lucide-react';
import AddDropdownMenu from '@/components/add-dropdown-menu';
import { EnhancedDocumentViewer } from '@/components/enhanced-document-viewer';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLocation } from 'wouter';
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
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(12); // Show 12 insights per page
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [location] = useLocation();

  // Check for documentId in URL params and auto-open document viewer
  React.useEffect(() => {
    const urlParams = new URLSearchParams(location.split('?')[1] || '');
    const documentIdParam = urlParams.get('documentId');
    if (documentIdParam) {
      const docId = parseInt(documentIdParam, 10);
      if (!isNaN(docId)) {
        console.log('Opening document from insight URL param:', docId);
        setSelectedDocumentId(docId);
        // Clean URL after opening document to prevent issues on refresh
        const cleanUrl = location.split('?')[0];
        if (window.history.replaceState) {
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }
    }
  }, [location]);

  // Fetch document insights with pagination
  const { data: insightsData, isLoading: insightsLoading, refetch: refetchInsights } = useQuery<{insights: DocumentInsight[], totalCount: number}>({
    queryKey: ['/api/insights', statusFilter, priorityFilter, typeFilter, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: statusFilter,
        priority: priorityFilter !== 'all' ? priorityFilter : '',
        type: typeFilter !== 'all' ? typeFilter : '',
        page: currentPage.toString(),
        limit: pageSize.toString()
      });
      const response = await fetch(`/api/insights?${params}`);
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

  // Fetch document details when selectedDocumentId changes
  const { data: documentDetails, isLoading: documentLoading, error: documentError } = useQuery({
    queryKey: ['/api/documents', selectedDocumentId],
    queryFn: async () => {
      if (!selectedDocumentId) return null;
      console.log(`Fetching document details for ID: ${selectedDocumentId}`);
      const response = await fetch(`/api/documents/${selectedDocumentId}`, { credentials: 'include' });
      if (!response.ok) {
        console.error(`Failed to fetch document ${selectedDocumentId}: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch document details: ${response.status}`);
      }
      const data = await response.json();
      console.log(`Document ${selectedDocumentId} fetched successfully:`, data.name);
      return data;
    },
    enabled: !!selectedDocumentId,
    retry: (failureCount, error) => {
      // Don't retry on 404 errors
      if (error.message.includes('404')) return false;
      return failureCount < 2;
    }
  });

  const insights = insightsData?.insights || [];

  // Filter insights based on search query (other filters handled by API)
  const filteredInsights = insights.filter(insight => {
    return searchQuery === "" || 
      insight.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      insight.content.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Calculate pagination info
  const totalPages = Math.ceil((insightsData?.totalCount || 0) / pageSize);
  const totalInsights = insightsData?.totalCount || 0;

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

  const handleDocumentClick = (documentId: number) => {
    setSelectedDocumentId(documentId);
  };

  const handleCloseDocument = () => {
    setSelectedDocumentId(null);
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

        {/* Enhanced Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setCurrentPage(1); }}>
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
              <Select value={priorityFilter} onValueChange={(value) => { setPriorityFilter(value); setCurrentPage(1); }}>
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
              <Select value={typeFilter} onValueChange={(value) => { setTypeFilter(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="summary">Summary</SelectItem>
                  <SelectItem value="action_items">Action Items</SelectItem>
                  <SelectItem value="key_dates">Key Dates</SelectItem>
                  <SelectItem value="financial_info">Financial</SelectItem>
                  <SelectItem value="contacts">Contacts</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                </SelectContent>
              </Select>
              {(statusFilter !== 'all' || priorityFilter !== 'all' || typeFilter !== 'all') && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setStatusFilter('all');
                    setPriorityFilter('all');
                    setTypeFilter('all');
                    setCurrentPage(1);
                  }}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Showing {Math.min(pageSize, filteredInsights.length)} of {totalInsights} insights</span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || insightsLoading}
                  >
                    Previous
                  </Button>
                  <span className="text-xs px-2">Page {currentPage} of {totalPages}</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || insightsLoading}
                  >
                    Next
                  </Button>
                </div>
              )}
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
                        onDocumentClick={handleDocumentClick}
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
                    onDocumentClick={handleDocumentClick}
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

        {/* Document Viewer Modal */}
        {selectedDocumentId && documentDetails && (
          <Dialog open={true} onOpenChange={handleCloseDocument}>
            <DialogContent className="max-w-[100vw] w-full max-h-[100vh] h-full p-0" aria-describedby="document-viewer-description">
              <DialogTitle className="absolute -top-[9999px] left-0 w-1 h-1 overflow-hidden opacity-0">Document Viewer</DialogTitle>
              <DialogDescription id="document-viewer-description" className="absolute -top-[9999px] left-0 w-1 h-1 overflow-hidden opacity-0">
                View document details and content
              </DialogDescription>
              <EnhancedDocumentViewer
                document={documentDetails}
                onClose={handleCloseDocument}
                onDownload={() => {
                  // Handle document download
                  const link = document.createElement('a');
                  link.href = `/api/documents/${documentDetails.id}/download`;
                  link.download = documentDetails.name;
                  link.click();
                }}
                onUpdate={() => {
                  // Refetch data when document is updated
                  refetchInsights();
                }}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Loading modal for when document is being fetched */}
        {selectedDocumentId && documentLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCloseDocument}>
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600 mb-4">Loading document...</p>
                <Button variant="outline" onClick={handleCloseDocument}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error modal for when document fails to load */}
        {selectedDocumentId && documentError && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCloseDocument}>
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
              <div className="text-center">
                <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Document Not Found</h3>
                <p className="text-gray-600 mb-4">
                  The document you're trying to view is not available or may have been deleted.
                </p>
                <Button onClick={handleCloseDocument}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}