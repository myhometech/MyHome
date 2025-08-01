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

// Compact insight button component for button-style layout
interface CompactInsightButtonProps {
  insight: DocumentInsight;
  onStatusUpdate: (insightId: string, status: 'open' | 'dismissed' | 'resolved') => void;
}

function CompactInsightButton({ insight, onStatusUpdate }: CompactInsightButtonProps) {
  // Icon mapping for different insight types
  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'action_items': return <AlertCircle className="h-4 w-4" />;
      case 'key_dates': return <Clock className="h-4 w-4" />;
      case 'financial_info': return <TrendingUp className="h-4 w-4" />;
      case 'contacts': return <FileText className="h-4 w-4" />;
      case 'compliance': return <CheckCircle className="h-4 w-4" />;
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
        {getInsightIcon(insight.type || 'summary')}
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
  
  // Document-related state
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  






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

  // Fetch documents for document library
  const { data: documents = [], isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const insights = insightsData?.insights || [];
  

  




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



      {/* AI Insights Section - Simple Horizontal Buttons */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">AI Insights</h3>
              <Button onClick={() => refetch()} disabled={isLoading} variant="outline" size="sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            
            {isLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
                <p>Loading insights...</p>
              </div>
            ) : insights.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {/* Group insights by type and create category buttons */}
                {Array.from(new Set(insights.map(i => i.type))).map((type) => {
                  const typeInsights = insights.filter(i => i.type === type);
                  const count = typeInsights.length;
                  const hasHighPriority = typeInsights.some(i => i.priority === 'high');
                  
                  return (
                    <Button
                      key={type}
                      variant="outline"
                      className={`flex items-center gap-2 ${hasHighPriority ? 'border-red-200 bg-red-50 hover:bg-red-100' : ''}`}
                    >
                      {type === 'action_items' && <CheckCircle className="h-4 w-4" />}
                      {type === 'key_dates' && <Calendar className="h-4 w-4" />}
                      {type === 'financial_info' && <DollarSign className="h-4 w-4" />}
                      {type === 'contacts' && <Users className="h-4 w-4" />}
                      {type === 'compliance' && <Shield className="h-4 w-4" />}
                      {type === 'summary' && <FileText className="h-4 w-4" />}
                      <span className="capitalize">{type.replace('_', ' ')}</span>
                      <Badge variant="secondary" className="ml-1">{count}</Badge>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Insights Found</h3>
                <p className="text-gray-600">Upload some documents to start generating AI insights.</p>
              </div>
            )}
          </CardContent>
        </Card>
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