import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { 
  Brain, 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  TrendingUp, 
  RefreshCw, 
  Filter, 
  List, 
  Calendar as CalendarIcon,
  X,
  Grid,
  FileText,
  Folder
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InsightCard } from '@/components/insight-card';
import { InsightsCalendar } from '@/components/insights-calendar';
import DocumentCard from '@/components/document-card';
import CategoryFilter from '@/components/category-filter';
import UploadZone from '@/components/upload-zone';
import { useFeatures } from '@/hooks/useFeatures';
import type { Category, Document, DocumentInsight } from '@shared/schema';



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

interface UnifiedInsightsDashboardProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function UnifiedInsightsDashboard({ searchQuery = "", onSearchChange }: UnifiedInsightsDashboardProps) {
  const [, setLocation] = useLocation();
  const { hasFeature } = useFeatures();
  
  // No longer using tabs - insights and documents are in single view
  
  // Insights filters and view state
  const [activeTab, setActiveTab] = useState('open');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('priority');
  const [currentView, setCurrentView] = useState<'list' | 'calendar'>('list');
  
  // Document-related state
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Active dashboard filter state
  const [activeDashboardFilter, setActiveDashboardFilter] = useState<{
    type: string;
    value: string;
    label: string;
  } | null>(null);

  // Parse URL parameters to set initial filters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const filterParam = urlParams.get('filter');
      const tabParam = urlParams.get('tab');
      
      // No longer using tab state
      
      if (filterParam) {
        switch (filterParam) {
          case 'high-priority':
            setPriorityFilter('high');
            setActiveDashboardFilter({ type: 'priority', value: 'high', label: 'High Priority' });
            break;
          case 'medium-priority':
            setPriorityFilter('medium');
            setActiveDashboardFilter({ type: 'priority', value: 'medium', label: 'Medium Priority' });
            break;
          case 'resolved':
            setStatusFilter('resolved');
            setActiveDashboardFilter({ type: 'status', value: 'resolved', label: 'Resolved' });
            break;
          case 'open':
            setStatusFilter('open');
            setActiveDashboardFilter({ type: 'status', value: 'open', label: 'Open' });
            break;
        }
      }
    }
  }, []);

  // Update URL when filters change
  const updateURL = (filter?: string) => {
    const url = new URL(window.location.href);
    if (filter) {
      url.searchParams.set('filter', filter);
    } else {
      url.searchParams.delete('filter');
    }
    window.history.replaceState({}, '', url.toString());
  };

  // Map filters for API calls
  const getAPIStatusFilter = () => {
    if (activeTab === 'all') return statusFilter !== 'all' ? statusFilter : 'all';
    return activeTab;
  };

  // Fetch all insights for dashboard summary
  const { data: allInsightsData } = useQuery<InsightsResponse>({
    queryKey: ['/api/insights', 'all', 'all', 'all', 'priority'],
    queryFn: async () => {
      const response = await fetch('/api/insights?status=all');
      if (!response.ok) throw new Error('Failed to fetch insight counts');
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Fetch filtered insights
  const {
    data: insightsData,
    isLoading,
    error,
    refetch
  } = useQuery<InsightsResponse>({
    queryKey: ['/api/insights', getAPIStatusFilter(), typeFilter, priorityFilter, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      const apiStatus = getAPIStatusFilter();
      if (apiStatus && apiStatus !== 'all') params.append('status', apiStatus);
      if (typeFilter && typeFilter !== 'all') params.append('type', typeFilter);
      if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (sortBy) params.append('sort', sortBy);

      const response = await fetch(`/api/insights?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
  });

  // Fetch documents for document library
  const { data: documents = [], isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const insights = insightsData?.insights || [];
  const allInsights = allInsightsData?.insights || [];
  
  // Calculate dashboard statistics
  const openCount = allInsights.filter(i => i.status === 'open' || !i.status).length;
  const resolvedCount = allInsights.filter(i => i.status === 'resolved').length;
  const dismissedCount = allInsights.filter(i => i.status === 'dismissed').length;
  const highPriorityCount = allInsights.filter(i => i.priority === 'high' && (i.status === 'open' || !i.status)).length;
  const mediumPriorityCount = allInsights.filter(i => i.priority === 'medium' && (i.status === 'open' || !i.status)).length;

  // Handle dashboard card clicks
  const handleDashboardCardClick = (filterType: string, filterValue: string, label: string) => {
    // Apply the filter
    if (filterType === 'priority') {
      setPriorityFilter(filterValue);
      setStatusFilter('open'); // Show only open insights for priority filters
    } else if (filterType === 'status') {
      setStatusFilter(filterValue);
      setPriorityFilter('all');
    }
    
    // Set active filter for UI display
    setActiveDashboardFilter({ type: filterType, value: filterValue, label });
    
    // Update URL
    const urlFilter = filterType === 'priority' ? `${filterValue}-priority` : filterValue;
    updateURL(urlFilter);
  };

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setPriorityFilter('all');
    setSortBy('priority');
    setActiveDashboardFilter(null);
    updateURL();
  };

  // Handle status updates
  const handleStatusUpdate = (insightId: string, status: 'open' | 'dismissed' | 'resolved') => {
    refetch();
  };

  // Filter documents for document tab
  const filteredDocuments = documents.filter((doc) => {
    const matchesCategory = selectedCategory === null || doc.categoryId === selectedCategory;
    const matchesSearch = searchQuery === "" || 
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.summary && doc.summary.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

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
            <h1 className="text-2xl font-bold">AI Insights</h1>
            <p className="text-gray-600">Intelligent document analysis and management</p>
          </div>
        </div>
        <Button onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Interactive Dashboard Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card 
          className="cursor-pointer hover:shadow-md transition-all duration-200"
          onClick={() => handleDashboardCardClick('status', 'open', 'Open Items')}
        >
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Open Items</p>
                <p className="text-2xl font-bold">{openCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-all duration-200"
          onClick={() => handleDashboardCardClick('priority', 'high', 'High Priority')}
        >
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

        <Card 
          className="cursor-pointer hover:shadow-md transition-all duration-200"
          onClick={() => handleDashboardCardClick('priority', 'medium', 'Medium Priority')}
        >
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

        <Card 
          className="cursor-pointer hover:shadow-md transition-all duration-200"
          onClick={() => handleDashboardCardClick('status', 'resolved', 'Resolved')}
        >
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

      {/* Active Filter Display */}
      {activeDashboardFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="flex items-center gap-2">
            <Filter className="h-3 w-3" />
            Filtered by: {activeDashboardFilter.label}
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-transparent"
              onClick={clearFilters}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear Filter
          </Button>
        </div>
      )}

      {/* AI Insights Section */}
      <div className="space-y-4">
          {/* Insights Filters */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <CardTitle className="flex items-center space-x-2">
                    <Filter className="h-5 w-5" />
                    <span>Filters & View</span>
                  </CardTitle>
                  <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
                    <Button
                      variant={currentView === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCurrentView('list')}
                      className="h-8 px-3"
                    >
                      <List className="h-4 w-4 mr-1" />
                      List
                    </Button>
                    <Button
                      variant={currentView === 'calendar' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCurrentView('calendar')}
                      className="h-8 px-3"
                    >
                      <CalendarIcon className="h-4 w-4 mr-1" />
                      Calendar
                    </Button>
                  </div>
                </div>
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
                      <SelectItem value="all">All Statuses</SelectItem>
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
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="action_items">Action Items</SelectItem>
                      <SelectItem value="key_dates">Key Dates</SelectItem>
                      <SelectItem value="financial_info">Financial Info</SelectItem>
                      <SelectItem value="contacts">Contacts</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
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
                      <SelectItem value="all">All Priorities</SelectItem>
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
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="created_at">Date Created</SelectItem>
                      <SelectItem value="due_date">Due Date</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Insights Content */}
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
                <p>Loading insights...</p>
              </CardContent>
            </Card>
          ) : currentView === 'calendar' ? (
            <InsightsCalendar 
              statusFilter={statusFilter} 
              typeFilter={typeFilter} 
              priorityFilter={priorityFilter} 
            />
          ) : insights.length > 0 ? (
            <div className="space-y-4">
              {insights.map((insight) => (
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
                  {activeDashboardFilter 
                    ? `No insights match the "${activeDashboardFilter.label}" filter.`
                    : "Upload some documents to start generating AI insights."
                  }
                </p>
                {activeDashboardFilter && (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear Filter
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
      </div>

      {/* Document Library Section */}
      <div className="space-y-4">
        <div className="flex items-center space-x-3 pt-6 border-t">
          <FileText className="h-8 w-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold">Document Library</h2>
            <p className="text-gray-600">Manage and organize your documents</p>
          </div>
        </div>
          {/* Upload Zone */}
          <UploadZone onUpload={() => {}} />

          {/* Document Filters */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CategoryFilter
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
              />
            </div>
            <div className="flex items-center space-x-2">
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
          </div>

          {/* Documents Content */}
          {documentsLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
                <p>Loading documents...</p>
              </CardContent>
            </Card>
          ) : filteredDocuments.length > 0 ? (
            <div className={viewMode === "grid" 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "space-y-4"
            }>
              {filteredDocuments.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={{
                    ...document,
                    uploadedAt: document.uploadedAt ? new Date(document.uploadedAt).toISOString() : "",
                    expiryDate: document.expiryDate ? new Date(document.expiryDate).toISOString() : null
                  }}
                  onClick={() => setLocation(`/document/${document.id}`)}
                  viewMode={viewMode}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Folder className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Documents Found</h3>
                <p className="text-gray-600 mb-4">
                  {searchQuery 
                    ? `No documents match your search for "${searchQuery}".`
                    : selectedCategory
                    ? "No documents in this category."
                    : "Upload some documents to get started."
                  }
                </p>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}