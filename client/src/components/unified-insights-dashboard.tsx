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
  Trash2
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
import SmartHelpTooltip, { HelpBadge } from '@/components/smart-help-tooltip';
import { EnhancedDocumentViewer } from '@/components/enhanced-document-viewer';

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
      default: return 'bg-blue-500';
    }
  };

  return (
    <div 
      className={`relative inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-sm ${getPriorityColor(insight.priority || 'medium')}`}
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
        <Brain className="h-4 w-4" />
      </div>
      
      {/* Insight title */}
      <span className="truncate max-w-[200px]" title={insight.title}>
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
  

  






  // Fetch all insights (simplified)
  const {
    data: insightsData,
    isLoading,
    error,
    refetch
  } = useQuery<InsightsResponse>({
    queryKey: ['/api/insights', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/insights?status=all');
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
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('high');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [selectedInsight, setSelectedInsight] = useState<DocumentInsight | null>(null);

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
  const { data: documentDetails } = useQuery({
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
    console.log('handleOpenDocument called with documentId:', documentId);
    setSelectedDocumentId(documentId);
    console.log('selectedDocumentId state updated to:', documentId);
  };

  // Handle closing document viewer
  const handleCloseDocument = () => {
    setSelectedDocumentId(null);
    setSelectedDocument(null);
  };

  // Handle clicking on an insight card
  const handleInsightClick = (insight: DocumentInsight) => {
    console.log('Insight clicked:', insight);
    console.log('Has documentId:', insight.documentId);
    
    if (insight.documentId) {
      // Open document modal if insight has associated document
      console.log('Opening document viewer for documentId:', insight.documentId);
      handleOpenDocument(insight.documentId);
    } else {
      // Show insight details modal for standalone insights
      console.log('Opening insight details modal');
      setSelectedInsight(insight);
    }
  };

  // Handle closing insight modal
  const handleCloseInsight = () => {
    setSelectedInsight(null);
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
      {/* High-Level Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* All Items */}
        <Card 
          className={`border-l-4 border-l-blue-500 bg-blue-50/50 cursor-pointer hover:bg-blue-50 transition-colors ${
            priorityFilter === 'all' ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => setPriorityFilter('all')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">All Items</p>
                <p className="text-2xl font-bold text-blue-900">
                  {insights.filter(i => i.status !== 'resolved').length}
                </p>
                <p className="text-xs text-blue-600">Total active</p>
              </div>
              <Brain className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        {/* High Priority Items */}
        <Card 
          className={`border-l-4 border-l-red-500 bg-red-50/50 cursor-pointer hover:bg-red-50 transition-colors ${
            priorityFilter === 'high' ? 'ring-2 ring-red-500' : ''
          }`}
          onClick={() => setPriorityFilter('high')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700">High Priority</p>
                <p className="text-2xl font-bold text-red-900">
                  {insights.filter(i => i.priority === 'high' && i.status !== 'resolved').length}
                </p>
                <p className="text-xs text-red-600">Urgent items</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        {/* Medium Priority Items */}
        <Card 
          className={`border-l-4 border-l-yellow-500 bg-yellow-50/50 cursor-pointer hover:bg-yellow-50 transition-colors ${
            priorityFilter === 'medium' ? 'ring-2 ring-yellow-500' : ''
          }`}
          onClick={() => setPriorityFilter('medium')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-700">Medium Priority</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {insights.filter(i => i.priority === 'medium' && i.status !== 'resolved').length}
                </p>
                <p className="text-xs text-yellow-600">Important items</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        {/* Low Priority Items */}
        <Card 
          className={`border-l-4 border-l-green-500 bg-green-50/50 cursor-pointer hover:bg-green-50 transition-colors ${
            priorityFilter === 'low' ? 'ring-2 ring-green-500' : ''
          }`}
          onClick={() => setPriorityFilter('low')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">Low Priority</p>
                <p className="text-2xl font-bold text-green-900">
                  {insights.filter(i => i.priority === 'low' && i.status !== 'resolved').length}
                </p>
                <p className="text-xs text-green-600">General items</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights Section - Simple Horizontal Buttons */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">AI Insights</h3>
                <SmartHelpTooltip helpKey="ai-insights" variant="detailed" />
              </div>
              <Button onClick={() => refetch()} disabled={isLoading} variant="outline" size="sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            
            {isLoading || manualEventsLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
                <p>Loading insights...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Priority Filter Buttons */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-medium text-gray-700">Priority:</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={priorityFilter === 'high' ? 'default' : 'outline'}
                      onClick={() => setPriorityFilter('high')}
                      className="h-7 px-3 text-xs"
                    >
                      High Priority
                    </Button>
                    <Button
                      size="sm"
                      variant={priorityFilter === 'all' ? 'default' : 'outline'}
                      onClick={() => setPriorityFilter('all')}
                      className="h-7 px-3 text-xs"
                    >
                      All
                    </Button>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Type:</span>
                    <div className="flex gap-1 flex-wrap">
                      <Button
                        size="sm"
                        variant={typeFilter === 'all' ? 'default' : 'outline'}
                        onClick={() => setTypeFilter('all')}
                        className="h-7 px-3 text-xs"
                      >
                        All Types
                      </Button>
                      <Button
                        size="sm"
                        variant={typeFilter === 'financial_info' ? 'default' : 'outline'}
                        onClick={() => setTypeFilter('financial_info')}
                        className="h-7 px-3 text-xs"
                      >
                        Financial
                      </Button>
                      <Button
                        size="sm"
                        variant={typeFilter === 'key_dates' ? 'default' : 'outline'}
                        onClick={() => setTypeFilter('key_dates')}
                        className="h-7 px-3 text-xs"
                      >
                        Dates
                      </Button>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {filteredInsights.length} insights
                  </Badge>
                </div>

                {/* AI Document Insights Cards */}
                {filteredInsights.length > 0 && (
                  <div>
                    <div className="grid grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-2">
                      {filteredInsights.slice(0, 9).map((insight) => (
                        <Card 
                          key={insight.id} 
                          className={`border-l-2 hover:shadow-sm transition-shadow cursor-pointer ${
                            insight.priority === 'high' ? 'border-l-red-500 bg-red-50' :
                            insight.priority === 'medium' ? 'border-l-yellow-500 bg-yellow-50' :
                            'border-l-green-500 bg-green-50'
                          }`}
                          onClick={() => handleInsightClick(insight)}
                        >
                          <CardContent className="p-2">
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-1">
                                {insight.type === 'summary' && <Brain className="h-2 w-2 text-blue-600" />}
                                {insight.type === 'contacts' && <Users className="h-2 w-2 text-green-600" />}
                                {insight.type === 'financial_info' && <DollarSign className="h-2 w-2 text-green-600" />}
                                {insight.type === 'compliance' && <Shield className="h-2 w-2 text-orange-600" />}
                                {insight.type === 'key_dates' && <Calendar className="h-2 w-2 text-purple-600" />}
                                {insight.type === 'action_items' && <CheckCircle className="h-2 w-2 text-blue-600" />}
                                {insight.type.startsWith('vehicle:') && <FileText className="h-2 w-2 text-red-600" />}
                                {!['summary', 'contacts', 'financial_info', 'compliance', 'key_dates', 'action_items'].includes(insight.type) && !insight.type.startsWith('vehicle:') && <FileText className="h-2 w-2 text-gray-600" />}
                                <Badge variant={insight.priority === 'high' ? 'destructive' : insight.priority === 'medium' ? 'default' : 'secondary'} className="text-xs h-3 px-1">
                                  {insight.priority.charAt(0).toUpperCase()}
                                </Badge>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-4 w-4 p-0 opacity-60 hover:opacity-100"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-2 w-2" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log(`[DEBUG] Clicked insight:`, { id: insight.id, title: insight.title, type: typeof insight.id });
                                      handleStatusUpdate(insight.id, 'resolved');
                                    }}
                                  >
                                    <CheckCircle className="h-3 w-3 mr-2" />
                                    Mark as Done
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <h5 className="font-medium text-xs mb-1 line-clamp-1 leading-tight">{insight.title}</h5>
                            <p className="text-xs text-gray-600 line-clamp-2 mb-1 leading-tight">
                              {insight.content.length > 45 ? `${insight.content.substring(0, 45)}...` : insight.content}
                            </p>
                            {insight.dueDate && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                                <Calendar className="h-2 w-2" />
                                <span className="text-xs">{new Date(insight.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                              </div>
                            )}
                            <div className="text-xs text-gray-500 capitalize truncate">
                              {insight.type.replace('_', ' ').replace(':', ' ')}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {filteredInsights.length > 9 && (
                        <Card className="border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                          <CardContent className="p-2 text-center">
                            <div className="text-gray-500">
                              <FileText className="h-3 w-3 mx-auto mb-1" />
                              <p className="text-xs">+{filteredInsights.length - 9}</p>
                              <Button variant="ghost" size="sm" className="h-4 text-xs mt-1 px-1" onClick={() => setPriorityFilter('all')}>
                                View All
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
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
                {selectedInsight.type === 'summary' && <Brain className="h-4 w-4 text-blue-600" />}
                {selectedInsight.type === 'contacts' && <Users className="h-4 w-4 text-green-600" />}
                {selectedInsight.type === 'financial_info' && <DollarSign className="h-4 w-4 text-green-600" />}
                {selectedInsight.type === 'compliance' && <Shield className="h-4 w-4 text-orange-600" />}
                {selectedInsight.type === 'key_dates' && <Calendar className="h-4 w-4 text-purple-600" />}
                {selectedInsight.type === 'action_items' && <CheckCircle className="h-4 w-4 text-blue-600" />}
                {selectedInsight.type.startsWith('vehicle:') && <FileText className="h-4 w-4 text-red-600" />}
                {selectedInsight.title}
              </DialogTitle>
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
                    onClick={() => window.open(selectedInsight.actionUrl, '_blank')}
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
        <EnhancedDocumentViewer
          document={documentDetails}
          category={categories.find((cat: any) => cat.id === documentDetails.categoryId)}
          onClose={handleCloseDocument}
          onDownload={handleDocumentDownload}
          onUpdate={() => {
            // Refetch data when document is updated
            refetch();
          }}
        />
      )}

    </div>
  );
}