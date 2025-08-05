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
  Calendar,
  DollarSign,
  Users,
  Shield,
  X,
  Grid,
  FileText
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InsightCard } from '@/components/insight-card';
import { InsightsCalendar } from '@/components/insights-calendar';
import { ManualEventCard, CompactManualEventCard } from '@/components/manual-event-card';
import SmartHelpTooltip, { HelpBadge } from '@/components/smart-help-tooltip';

import { useFeatures } from '@/hooks/useFeatures';
import type { DocumentInsight } from '@shared/schema';

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
  
  // Add filtering state
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('high');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Filter insights based on selected filters
  const filteredInsights = insights.filter(insight => {
    const matchesPriority = priorityFilter === 'all' || insight.priority === priorityFilter;
    const matchesType = typeFilter === 'all' || insight.type === typeFilter;
    return matchesPriority && matchesType;
  });

  // Get unique types for filter dropdown
  const insightTypes = ['all', ...Array.from(new Set(insights.map(i => i.type)))];

  




  // Handle status updates
  const handleStatusUpdate = async (insightId: string, status: 'open' | 'dismissed' | 'resolved') => {
    try {
      const response = await fetch(`/api/insights/${insightId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update insight status');
      }

      // Refetch insights to update the UI
      refetch();
    } catch (error) {
      console.error('Error updating insight status:', error);
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



      {/* AI Insights Section - Simple Horizontal Buttons */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">AI Insights</h3>
                <SmartHelpTooltip helpKey="ai-insights" variant="detailed" />
              </div>
              <div className="flex items-center gap-2">
                <Select value={priorityFilter} onValueChange={(value: 'all' | 'high' | 'medium' | 'low') => setPriorityFilter(value)}>
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
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {insightTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type === 'all' ? 'All Types' : type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => refetch()} disabled={isLoading} variant="outline" size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
            
            {isLoading || manualEventsLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
                <p>Loading insights...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* AI Document Insights Cards */}
                {filteredInsights.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-md font-medium text-gray-700">Document Insights</h4>
                        <SmartHelpTooltip helpKey="document-insights" />
                        <Badge variant="outline" className="text-xs">
                          {filteredInsights.length} of {insights.length}
                        </Badge>
                      </div>
                      {priorityFilter === 'high' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPriorityFilter('all')}
                          className="text-xs text-gray-500"
                        >
                          Show All
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                      {filteredInsights.slice(0, 18).map((insight) => (
                        <Card key={insight.id} className={`border-l-4 hover:shadow-sm transition-shadow ${
                          insight.priority === 'high' ? 'border-l-red-500 bg-red-50' :
                          insight.priority === 'medium' ? 'border-l-yellow-500 bg-yellow-50' :
                          'border-l-green-500 bg-green-50'
                        }`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-1">
                                {insight.type === 'summary' && <Brain className="h-3 w-3 text-blue-600" />}
                                {insight.type === 'contacts' && <Users className="h-3 w-3 text-green-600" />}
                                {insight.type === 'financial_info' && <DollarSign className="h-3 w-3 text-green-600" />}
                                {insight.type === 'compliance' && <Shield className="h-3 w-3 text-orange-600" />}
                                {insight.type === 'key_dates' && <Calendar className="h-3 w-3 text-purple-600" />}
                                {insight.type === 'action_items' && <CheckCircle className="h-3 w-3 text-blue-600" />}
                                {insight.type.startsWith('vehicle:') && <FileText className="h-3 w-3 text-red-600" />}
                                {!['summary', 'contacts', 'financial_info', 'compliance', 'key_dates', 'action_items'].includes(insight.type) && !insight.type.startsWith('vehicle:') && <FileText className="h-3 w-3 text-gray-600" />}
                                <Badge variant={insight.priority === 'high' ? 'destructive' : insight.priority === 'medium' ? 'default' : 'secondary'} className="text-xs h-4 px-1">
                                  {insight.priority.charAt(0).toUpperCase()}
                                </Badge>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-5 w-5 p-0 opacity-60 hover:opacity-100"
                                onClick={() => handleStatusUpdate(insight.id, 'resolved')}
                              >
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                            </div>
                            <h5 className="font-medium text-xs mb-1 line-clamp-2 leading-tight">{insight.title}</h5>
                            <p className="text-xs text-gray-600 line-clamp-2 mb-2 leading-tight">
                              {insight.content.length > 60 ? `${insight.content.substring(0, 60)}...` : insight.content}
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
                      {filteredInsights.length > 18 && (
                        <Card className="border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                          <CardContent className="p-3 text-center">
                            <div className="text-gray-500">
                              <FileText className="h-4 w-4 mx-auto mb-1" />
                              <p className="text-xs">+{filteredInsights.length - 18}</p>
                              <Button variant="ghost" size="sm" className="h-5 text-xs mt-1" onClick={() => setPriorityFilter('all')}>
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


    </div>
  );
}