import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { 
  Brain, 
  AlertCircle, 
  AlertTriangle,
  Clock, 
  CheckCircle, 
  TrendingUp, 
  RefreshCw, 
  Filter, 
  List, 
  Calendar as CalendarIcon,
  Calendar,
  DollarSign,
  Users,
  Shield,
  X,
  Grid,
  FileText,
  MoreHorizontal,
  Trash2,
  Plus
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InsightCard } from '@/components/insight-card';
import { InsightsCalendar } from '@/components/insights-calendar';
import { ManualEventCard, CompactManualEventCard } from '@/components/manual-event-card';
import { ManualEventViewer } from '@/components/manual-event-viewer';
import SmartHelpTooltip, { HelpBadge } from '@/components/smart-help-tooltip';
import { EnhancedDocumentViewer } from '@/components/enhanced-document-viewer';
import '@/styles/pinterest-cards.css';

import { useFeatures } from '@/hooks/useFeatures';
import type { DocumentInsight } from '@shared/schema';
import { queryClient } from '@/lib/queryClient';

// Manual Event interface for TypeScript
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

// Compact insight button component for button-style layout
interface CompactInsightButtonProps {
  insight: DocumentInsight;
  onStatusUpdate: (insightId: string, status: 'open' | 'dismissed' | 'resolved') => void;
}

function CompactInsightButton({ insight, onStatusUpdate }: CompactInsightButtonProps) {
  // Icon mapping for different insight types
  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'contacts': return <Users className="h-4 w-4" />;
      case 'summary': return <Brain className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  // Priority color mapping
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100';
      case 'medium': return 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100';
      case 'low': return 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100';
      default: return 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100';
    }
  };

  // Status indicator
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-green-500';
      case 'dismissed': return 'bg-gray-500';
      default: return 'bg-purple-500';
    }
  };

  return (
    <div 
      className={`relative inline-flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-2 text-xs md:text-sm font-medium border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-sm ${getPriorityColor(insight.priority || 'medium')}`}
      onClick={() => {
        // Toggle between open and resolved status when clicked
        const newStatus = insight.status === 'resolved' ? 'open' : 'resolved';
        onStatusUpdate(insight.id.toString(), newStatus);
      }}
    >
      {/* Status indicator dot */}
      <div 
        className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${getStatusColor(insight.status || 'open')}`} 
        title={`Status: ${insight.status || 'open'}`}
      />
      
      {/* Insight icon */}
      <div className="flex-shrink-0">
        <Brain className="h-3 w-3 md:h-4 md:w-4" />
      </div>
      
      {/* Insight title */}
      <span className="truncate max-w-[120px] md:max-w-[200px] text-xs md:text-sm" title={insight.title}>
        {insight.title}
      </span>
      
      {/* Priority badge */}
      {insight.priority === 'high' && (
        <div className="flex-shrink-0">
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full" title="High Priority" />
        </div>
      )}
    </div>
  );
}

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
  
  // Simple state for insights
  const [statusFilter] = useState<string>('all');
  
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('high');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showMoreInsights, setShowMoreInsights] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [selectedInsight, setSelectedInsight] = useState<DocumentInsight | null>(null);
  const [selectedManualEvent, setSelectedManualEvent] = useState<string | null>(null);
  
  // Display limits
  const INITIAL_DISPLAY_LIMIT = 8;

  






  // Fetch insights with pagination support
  const {
    data: insightsData,
    isLoading,
    error,
    refetch
  } = useQuery<InsightsResponse>({
    queryKey: ['/api/insights', statusFilter, priorityFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: statusFilter,
        priority: priorityFilter !== 'all' ? priorityFilter : '',
        type: typeFilter !== 'all' ? typeFilter : '',
        limit: '50' // Get more insights for local filtering
      });
      const response = await fetch(`/api/insights?${params}`);
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
  });



  // Fetch manual events
  const { data: manualEvents = [], isLoading: manualEventsLoading } = useQuery<ManualEvent[]>({
    queryKey: ['/api/manual-events'],
    queryFn: async () => {
      const response = await fetch('/api/manual-events', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch manual events');
      return response.json();
    },
  });

  // State variables first

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
  const { data: documentDetails, isLoading: documentLoading } = useQuery({
    queryKey: ['/api/documents', selectedDocumentId],
    queryFn: async () => {
      if (!selectedDocumentId) return null;
      const response = await fetch(`/api/documents/${selectedDocumentId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch document details');
      return response.json();
    },
    enabled: !!selectedDocumentId,
  });

  // Fetch categories for the document viewer
  const { data: categories = [] } = useQuery({
    queryKey: ['/api/categories'],
    queryFn: async () => {
      const response = await fetch('/api/categories', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
  });

  const insights = insightsData?.insights || [];

  // Filter insights based on selected filters and exclude resolved/deleted insights
  const filteredInsights = insights.filter(insight => {
    const matchesPriority = priorityFilter === 'all' || insight.priority === priorityFilter;
    const matchesType = typeFilter === 'all' || insight.type === typeFilter;
    const isActive = insight.status !== 'resolved'; // Only show active insights
    return matchesPriority && matchesType && isActive;
  });

  // Get unique types for filter dropdown
  const insightTypes = ['all', ...Array.from(new Set(insights.map(i => i.type)))];

  // Handle opening document viewer
  const handleOpenDocument = (documentId: number) => {
    setSelectedDocumentId(documentId);
  };

  // Handle closing document viewer
  const handleCloseDocument = () => {
    setSelectedDocumentId(null);
    setSelectedDocument(null);
  };

  // Handle clicking on an insight card
  const handleInsightClick = (insight: DocumentInsight) => {
    if (insight.documentId) {
      // Open document modal if insight has associated document
      handleOpenDocument(insight.documentId);
    } else {
      // Show insight details modal for standalone insights
      setSelectedInsight(insight);
    }
  };

  // Handle closing insight modal
  const handleCloseInsight = () => {
    setSelectedInsight(null);
  };

  // Handle document click from insight card
  const handleDocumentClick = (documentId: number) => {
    setSelectedDocumentId(documentId);
  };

  // Handle document download
  const handleDocumentDownload = () => {
    if (selectedDocumentId) {
      window.open(`/api/documents/${selectedDocumentId}/download`, '_blank');
    }
  };

  // Handle status updates
  const handleStatusUpdate = async (insightId: string, status: 'open' | 'dismissed' | 'resolved') => {
    try {
      console.log(`[DEBUG] Current insights before update:`, insights.map(i => ({ id: i.id, title: i.title, status: i.status })));
      console.log(`[DEBUG] Updating insight ${insightId} to status: ${status}`);
      
      const response = await fetch(`/api/insights/${insightId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update insight status: ${errorText}`);
      }

      const updatedInsight = await response.json();
      console.log(`[DEBUG] Successfully updated insight:`, updatedInsight);
      
      // Invalidate and refetch insights
      await queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      await refetch();
      
      console.log(`[DEBUG] Insights after refetch:`, insightsData?.insights?.map(i => ({ id: i.id, title: i.title, status: i.status })));
    } catch (error) {
      console.error('Error updating insight status:', error);
    }
  };

  // Handle insight deletion  
  const handleDeleteInsight = async (insightId: string) => {
    try {
      console.log(`Deleting insight ${insightId}`);
      
      const response = await fetch(`/api/insights/${insightId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete insight');
      }

      console.log(`Successfully deleted insight ${insightId}`);
      
      // Invalidate and refetch insights
      await queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      await refetch();
    } catch (error) {
      console.error('Error deleting insight:', error);
    }
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
      {/* High-Level Summary Cards - Mobile Optimized */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1">
        {/* All Items */}
        <Card 
          className={`border-l-4 border-l-purple-500 cursor-pointer hover:shadow-lg transition-all duration-300 ${
            priorityFilter === 'all' ? 'ring-2 ring-purple-500' : ''
          }`}
          style={{
            background: 'linear-gradient(135deg, #9333ea 0%, #7c3aed 50%, #6b21a8 100%)',
            color: 'white'
          }}
          onClick={() => setPriorityFilter('all')}
        >
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white">All Items</p>
                <p className="text-lg sm:text-2xl font-bold text-white">
                  {insights.filter(i => i.status !== 'resolved').length}
                </p>
                <p className="text-xs text-white/80 hidden sm:block">Total active</p>
              </div>
              <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
        {/* High Priority Items */}
        <Card 
          className={`border-l-4 border-l-purple-600 cursor-pointer hover:shadow-lg transition-all duration-300 ${
            priorityFilter === 'high' ? 'ring-2 ring-purple-600' : ''
          }`}
          style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 50%, #7c3aed 100%)',
            color: 'white'
          }}
          onClick={() => setPriorityFilter('high')}
        >
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white">High Priority</p>
                <p className="text-lg sm:text-2xl font-bold text-white">
                  {insights.filter(i => i.priority === 'high' && i.status !== 'resolved').length}
                </p>
                <p className="text-xs text-white/80 hidden sm:block">Urgent items</p>
              </div>
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
          </CardContent>
        </Card>

        {/* Medium Priority Items */}
        <Card 
          className={`border-l-4 border-l-purple-400 cursor-pointer hover:shadow-lg transition-all duration-300 ${
            priorityFilter === 'medium' ? 'ring-2 ring-purple-400' : ''
          }`}
          style={{
            background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #8b5cf6 100%)',
            color: 'white'
          }}
          onClick={() => setPriorityFilter('medium')}
        >
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white">Medium</p>
                <p className="text-lg sm:text-2xl font-bold text-white">
                  {insights.filter(i => i.priority === 'medium' && i.status !== 'resolved').length}
                </p>
                <p className="text-xs text-white/80 hidden sm:block">Important items</p>
              </div>
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
          </CardContent>
        </Card>

        {/* Low Priority Items */}
        <Card 
          className={`border-l-4 border-l-purple-300 cursor-pointer hover:shadow-lg transition-all duration-300 ${
            priorityFilter === 'low' ? 'ring-2 ring-purple-300' : ''
          }`}
          style={{
            background: 'linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 50%, #a78bfa 100%)',
            color: '#4c1d95'
          }}
          onClick={() => setPriorityFilter('low')}
        >
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-purple-900">Low</p>
                <p className="text-lg sm:text-2xl font-bold text-purple-900">
                  {insights.filter(i => i.priority === 'low' && i.status !== 'resolved').length}
                </p>
                <p className="text-xs text-purple-700 hidden sm:block">General items</p>
              </div>
              <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-purple-700" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights Section - Mobile Optimized */}
      <div className="space-y-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-semibold">AI Insights</h3>
                <SmartHelpTooltip helpKey="ai-insights" variant="detailed" />
              </div>
              <Button onClick={() => refetch()} disabled={isLoading} variant="outline" size="sm">
                <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
            
            {isLoading || manualEventsLoading ? (
              <div className="text-center py-4 sm:py-6">
                <RefreshCw className="h-6 w-6 sm:h-8 sm:w-8 animate-spin mx-auto mb-2 sm:mb-4 text-purple-500" />
                <p className="text-sm">Loading insights...</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {/* Improved Filter Interface */}
                <div className="flex items-center justify-between mb-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Filter className="h-4 w-4 text-gray-500" />
                    
                    {/* Priority Filter */}
                    <Select value={priorityFilter} onValueChange={(value: any) => setPriorityFilter(value)}>
                      <SelectTrigger className="w-28 h-8">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priority</SelectItem>
                        <SelectItem value="high">High Only</SelectItem>
                        <SelectItem value="medium">Medium Only</SelectItem>
                        <SelectItem value="low">Low Only</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Type Filter */}
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="financial_info">Financial</SelectItem>
                        <SelectItem value="key_dates">Key Dates</SelectItem>
                        <SelectItem value="action_items">Action Items</SelectItem>
                        <SelectItem value="contacts">Contacts</SelectItem>
                        <SelectItem value="compliance">Compliance</SelectItem>
                        <SelectItem value="summary">Summary</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Clear filters button */}
                    {(priorityFilter !== 'high' || typeFilter !== 'all') && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { setPriorityFilter('high'); setTypeFilter('all'); }}
                        className="h-8 px-2 text-xs text-gray-500 hover:text-gray-700"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  
                  {/* Results count */}
                  <Badge variant="outline" className="text-xs">
                    {filteredInsights.length} insights
                  </Badge>
                </div>

                {/* AI Document Insights Cards - Show all insights on mobile */}
                {filteredInsights.length > 0 && (
                  <div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-1">
                      {filteredInsights.slice(0, showMoreInsights ? undefined : INITIAL_DISPLAY_LIMIT).map((insight) => (
                        <InsightCard
                          key={insight.id}
                          insight={insight}
                          onStatusUpdate={handleStatusUpdate}
                          onDocumentClick={handleDocumentClick}
                        />
                      ))}
                      {!showMoreInsights && filteredInsights.length > INITIAL_DISPLAY_LIMIT && (
                        <Button
                          variant="outline"
                          className="border-dashed min-h-[120px] text-sm"
                          onClick={() => setShowMoreInsights(true)}
                        >
                          <div className="text-center">
                            <Plus className="h-4 w-4 mx-auto mb-1" />
                            <div>Show {filteredInsights.length - INITIAL_DISPLAY_LIMIT} more</div>
                          </div>
                        </Button>
                      )}

                    {showMoreInsights && filteredInsights.length > INITIAL_DISPLAY_LIMIT && (
                      <Button 
                        variant="ghost" 
                        className="mt-3 w-full" 
                        onClick={() => setShowMoreInsights(false)}
                      >
                        Show Less
                      </Button>
                    )}
                    </div>

                    {showMoreInsights && filteredInsights.length > INITIAL_DISPLAY_LIMIT && (
                      <Button 
                        variant="ghost" 
                        className="mt-3 w-full" 
                        onClick={() => setShowMoreInsights(false)}
                      >
                        Show Less
                      </Button>
                    )}
                  </div>
                )}

                {/* Manual Events */}
                {manualEvents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-md font-medium text-gray-700">Manual Events</h4>
                      <SmartHelpTooltip helpKey="manual-events" />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {manualEvents.slice(0, 6).map((event) => {
                        const linkedAsset = event.linkedAssetId 
                          ? userAssets.find(asset => asset.id === event.linkedAssetId)
                          : undefined;
                        
                        return (
                          <CompactManualEventCard
                            key={event.id}
                            event={event}
                            linkedAsset={linkedAsset}
                            onClick={() => setSelectedManualEvent(event.id)}
                          />
                        );
                      })}
                      {manualEvents.length > 6 && (
                        <Button
                          variant="outline"
                          className="border-dashed"
                          onClick={() => setLocation('/')}
                        >
                          +{manualEvents.length - 6} more events
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {filteredInsights.length === 0 && manualEvents.length === 0 && (
                  <div className="text-center py-8">
                    <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">
                      {insights.length === 0 ? 'No Insights or Events Found' : 'No Insights Match Your Filters'}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {insights.length === 0 
                        ? 'Upload documents to generate AI insights or create manual events for important dates.'
                        : 'Try adjusting your filters to see more insights, or upload more documents.'
                      }
                    </p>
                    {insights.length > 0 && (
                      <Button variant="outline" onClick={() => { setPriorityFilter('all'); setTypeFilter('all'); }}>
                        Clear Filters
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insight Details Modal */}
      {selectedInsight && (
        <Dialog open={!!selectedInsight} onOpenChange={handleCloseInsight}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedInsight.type === 'summary' && <Brain className="h-4 w-4 text-purple-600" />}
                {selectedInsight.type === 'contacts' && <Users className="h-4 w-4 text-green-600" />}
                {selectedInsight.type === 'financial_info' && <DollarSign className="h-4 w-4 text-green-600" />}
                {selectedInsight.type === 'compliance' && <Shield className="h-4 w-4 text-orange-600" />}
                {selectedInsight.type === 'key_dates' && <Calendar className="h-4 w-4 text-purple-600" />}
                {selectedInsight.type === 'action_items' && <CheckCircle className="h-4 w-4 text-purple-600" />}
                {selectedInsight.type.startsWith('vehicle:') && <FileText className="h-4 w-4 text-red-600" />}
                {selectedInsight.title}
              </DialogTitle>
              <DialogDescription>
                View detailed information and take action on this AI-generated insight
              </DialogDescription>
              <div className="mb-2">
                <Badge variant={selectedInsight.priority === 'high' ? 'destructive' : selectedInsight.priority === 'medium' ? 'default' : 'secondary'} className="text-xs">
                  {selectedInsight.priority.toUpperCase()} PRIORITY
                </Badge>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {selectedInsight.content}
                </p>
              </div>
              {selectedInsight.dueDate && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Due Date</p>
                    <p className="text-sm text-gray-600">
                      {new Date(selectedInsight.dueDate).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                </div>
              )}
              {selectedInsight.actionUrl && (
                <div className="flex gap-2">
                  <Button 
                    className="flex-1" 
                    onClick={() => selectedInsight.actionUrl && window.open(selectedInsight.actionUrl, '_blank')}
                  >
                    Take Action
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      handleStatusUpdate(selectedInsight.id, 'resolved');
                      handleCloseInsight();
                    }}
                  >
                    Mark as Done
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Document Viewer Modal */}
      {selectedDocumentId && documentDetails && (
        <Dialog open={true} onOpenChange={handleCloseDocument}>
          <DialogContent className="max-w-[100vw] w-full max-h-[100vh] h-full p-0" aria-describedby="document-viewer-description">
            <DialogTitle className="sr-only">Document Viewer</DialogTitle>
            <DialogDescription id="document-viewer-description" className="sr-only">
              View document details and content
            </DialogDescription>
            <EnhancedDocumentViewer
              document={documentDetails}
              category={categories.find((cat: any) => cat.id === documentDetails.categoryId)}
              onClose={handleCloseDocument}
              onDownload={handleDocumentDownload}
              showCloseButton={false}
              onUpdate={() => {
                // Refetch data when document is updated
                refetch();
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

      {/* Manual Event Viewer Modal */}
      {selectedManualEvent && (
        <ManualEventViewer
          eventId={selectedManualEvent}
          isOpen={!!selectedManualEvent}
          onClose={() => setSelectedManualEvent(null)}
          onUpdate={() => {
            // Refetch data when event is updated
            refetch();
          }}
        />
      )}

    </div>
  );
}