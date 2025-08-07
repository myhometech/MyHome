import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { OCRErrorHandler } from './OCRErrorHandler';
import '@/styles/insights.css';
import { 
  Brain, 
  Clock, 
  FileText, 
  Users,
  Loader2,
  Trash2
} from 'lucide-react';

interface DocumentInsight {
  id: string;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  title: string;
  content: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
  createdAt: string;
  // INSIGHT-101: Add tier classification
  tier?: 'primary' | 'secondary';
}

interface InsightResponse {
  success: boolean;
  insights: DocumentInsight[];
  documentType: string;
  recommendedActions: string[];
  processingTime: number;
  confidence: number;
  // INSIGHT-102: Add tier breakdown
  tierBreakdown?: {
    primary: number;
    secondary: number;
  };
}

const insightTypeConfig = {
  summary: { icon: FileText, label: 'Summary', color: 'bg-blue-100 text-blue-800' },
  contacts: { icon: Users, label: 'Contacts', color: 'bg-indigo-100 text-indigo-800' }
};

const priorityConfig = {
  high: { 
    color: 'bg-red-100 text-red-800 border-red-200', 
    label: 'High Priority',
    cardBorder: 'border-l-red-500',
    cardBg: 'bg-red-50/30'
  },
  medium: { 
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
    label: 'Medium Priority',
    cardBorder: 'border-l-yellow-500',
    cardBg: 'bg-yellow-50/30'
  },
  low: { 
    color: 'bg-gray-100 text-gray-800 border-gray-200', 
    label: 'Low Priority',
    cardBorder: 'border-l-gray-400',
    cardBg: 'bg-gray-50/30'
  }
};

interface DocumentInsightsProps {
  documentId: number;
  documentName: string;
}

export function DocumentInsights({ documentId, documentName }: DocumentInsightsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Add delay to prevent simultaneous requests overwhelming memory
  const [shouldFetch, setShouldFetch] = useState(false);
  
  React.useEffect(() => {
    const delay = Math.random() * 2000; // Random delay 0-2 seconds
    const timer = setTimeout(() => setShouldFetch(true), delay);
    return () => clearTimeout(timer);
  }, [documentId]);

  // INSIGHT-102: Fetch only primary insights (no secondary access)
  const { data: insightData, isLoading, error } = useQuery({
    queryKey: ['/api/documents', documentId, 'insights', { tier: 'primary' }],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/insights?tier=primary&limit=5`);
      if (!response.ok) throw new Error('Failed to fetch insights');
      return await response.json();
    },
    // Aggressive caching to reduce memory pressure
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Enable memory optimization
    select: (data) => ({
      ...data,
      insights: data.insights?.slice(0, 5) || [] // Limit insights to reduce memory
    }),
    // Only fetch when ready to prevent parallel overload
    enabled: shouldFetch
  });

  const insights = insightData?.insights || [];

  // Generate new insights mutation
  const generateInsightsMutation = useMutation({
    mutationFn: async (): Promise<InsightResponse> => {
      const response = await fetch(`/api/documents/${documentId}/insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate insights');
      }
      return await response.json();
    },
    onSuccess: (data: InsightResponse) => {
      toast({
        title: "Insights Generated",
        description: `Generated ${data.insights.length} insights in ${data.processingTime}ms`
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'insights']
      });
      setIsGenerating(false);
    },
    onError: (error: any) => {
      console.error('Error generating insights:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate document insights",
        variant: "destructive"
      });
      setIsGenerating(false);
    }
  });

  // Delete insight mutation
  const deleteInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await fetch(`/api/documents/${documentId}/insights/${insightId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete insight');
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Insight Deleted",
        description: "The insight has been removed"
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'insights']
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete insight",
        variant: "destructive"
      });
    }
  });

  const handleGenerateInsights = () => {
    setIsGenerating(true);
    generateInsightsMutation.mutate();
  };

  const handleDeleteInsight = (insightId: string) => {
    deleteInsightMutation.mutate(insightId);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>

        {/* Insight Cards Skeleton */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg p-4 space-y-3 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-6 w-6" />
            </div>
            <div>
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    // ANDROID-303: Handle insight generation errors and provide appropriate feedback
    const errorMessage = error?.message || 'Unknown error';
    const isInsightError = errorMessage.toLowerCase().includes('insight') || 
                          errorMessage.includes('INSIGHT_') ||
                          error?.code === 'INSIGHT_ERROR';
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Key Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OCRErrorHandler
            error={isInsightError ? 'INSIGHT_GENERATION_FAILED' : 'OCR_PROCESSING_FAILED'}
            documentName={documentName}
            onRetryUpload={() => handleGenerateInsights()}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Generate Button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">Key Insights</span>
        </div>
        <Button 
          onClick={handleGenerateInsights} 
          disabled={isGenerating || generateInsightsMutation.isPending}
          size="sm"
          variant="outline"
          className="text-xs sm:text-xs touch-target hover:bg-blue-50 hover:border-blue-200 transition-colors"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          {isGenerating || generateInsightsMutation.isPending ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Brain className="mr-1 h-3 w-3" />
              {insights.length > 0 ? 'Regenerate' : 'Generate'}
            </>
          )}
        </Button>
      </div>

      {/* Content Area */}
      {insights.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full opacity-50 animate-pulse"></div>
            </div>
            <Brain className="h-12 w-12 text-blue-600 mx-auto relative z-10" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Discover Key Insights</h3>
          <p className="text-gray-600 mb-6 text-sm max-w-md mx-auto leading-relaxed">
            No insights detected yet for this document. Our AI can extract important deadlines, contacts, summaries, and actionable items automatically.
          </p>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-6 border border-blue-100">
            <div className="flex items-start gap-3 text-left">
              <div className="bg-blue-600 rounded-full p-1 mt-0.5">
                <Brain className="h-3 w-3 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">AI Analysis includes:</p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• Key dates and deadlines</li>
                  <li>• Important contacts and entities</li>
                  <li>• Document summaries</li>
                  <li>• Actionable insights</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.filter((insight: DocumentInsight) => 
            !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(insight.type)
          ).map((insight: DocumentInsight, index: number) => {
            const config = insightTypeConfig[insight.type as keyof typeof insightTypeConfig] || insightTypeConfig.summary;
            const priorityStyle = priorityConfig[insight.priority];
            const IconComponent = config.icon;
            
            return (
              <div 
                key={insight.id} 
                className={`group border border-gray-100 shadow-sm bg-white rounded-lg p-4 space-y-3 mb-4 insight-content hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-4 ${priorityStyle.cardBorder} ${priorityStyle.cardBg}`}
                style={{
                  animationDelay: `${index * 100}ms`
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${config.color} text-xs`}>
                      <IconComponent className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                    <Badge variant="outline" className={`${priorityStyle.color} text-xs`}>
                      {priorityStyle.label}
                    </Badge>

                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(insight.confidence * 100)}%
                      </Badge>
                      <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-1000 ease-out"
                          style={{ 
                            width: `${insight.confidence * 100}%`,
                            animationDelay: `${index * 200}ms`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteInsight(insight.id)}
                    disabled={deleteInsightMutation.isPending}
                    className="text-gray-500 hover:text-red-600 h-8 w-8 p-0 sm:h-6 sm:w-6 opacity-0 group-hover:opacity-100 transition-opacity touch-target"
                    style={{ minHeight: '44px', minWidth: '44px' }}
                  >
                    <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
                  </Button>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2 text-sm">{insight.title}</h4>
                  <p className="text-gray-700 text-sm leading-relaxed insight-content">{insight.content}</p>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  {new Date(insight.createdAt).toLocaleDateString()} at {new Date(insight.createdAt).toLocaleTimeString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}