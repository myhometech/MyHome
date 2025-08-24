import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
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
  contacts: { icon: Users, label: 'Contacts', color: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20' },
  action_items: { icon: Brain, label: 'Actions', color: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20' },
  key_dates: { icon: Clock, label: 'Dates', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  financial_info: { icon: FileText, label: 'Financial', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  compliance: { icon: FileText, label: 'Compliance', color: 'bg-rose-100 text-rose-800 border-rose-200' }
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

  // Optimized mobile detection with debouncing
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    let resizeTimer: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newIsMobile = window.innerWidth <= 768;
        setIsMobile(prev => prev !== newIsMobile ? newIsMobile : prev);
        resizeTimer = null;
      }, 150); // Debounce resize events
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
    };
  }, []);

  // Show all insights without artificial limits

  const { data: insightData, isLoading, error } = useQuery({
    queryKey: ['/api/documents', documentId, 'insights'],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/insights`, {
        signal: AbortSignal.timeout(10000) // 10s timeout to prevent hanging requests
      });
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to fetch insights:', errorData);
        throw new Error('Failed to fetch insights');
      }
      const data = await response.json();
      console.log('Fetched insights data:', data);
      return data;
    },
    // Aggressive caching with memory optimization
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnWindowFocus: false,
    refetchOnReconnect: false, // Disable automatic refetching
    retry: 1, // Limit retries to prevent memory pressure
    // Return all insights without artificial limits
    select: (data) => {
      if (!data?.insights) return { insights: [] };
      return data;
    }
  });

  const insights = insightData?.insights || [];

  // Generate new insights mutation with memory optimization
  const generateInsightsMutation = useMutation({
    mutationFn: async (): Promise<InsightResponse> => {
      console.log(`🔍 [INSIGHT-DEBUG] Starting insight generation for document ${documentId}`);
      
      const response = await fetch(`/api/documents/${documentId}/insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(30000) // 30s timeout
      });
      
      console.log(`📡 [INSIGHT-DEBUG] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ [INSIGHT-DEBUG] Server error:`, errorData);
        throw new Error(errorData.message || 'Failed to generate insights');
      }
      
      const result = await response.json();
      console.log(`✅ [INSIGHT-DEBUG] Insights received:`, {
        success: result.success,
        insightsCount: result.insights?.length || 0,
        documentType: result.documentType,
        confidence: result.confidence
      });
      
      return result;
    },
    onSuccess: React.useCallback((data: InsightResponse) => {
      toast({
        title: "Insights Generated",
        description: `Generated ${data.insights.length} insights`
      });
      // Targeted cache invalidation
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'insights']
      });
      setIsGenerating(false);
    }, [documentId, toast, queryClient]),
    onError: React.useCallback((error: any) => {
      console.error('❌ [INSIGHT-DEBUG] Insight generation error:', {
        message: error.message,
        stack: error.stack,
        documentId,
        documentName,
        timestamp: new Date().toISOString()
      });
      
      // Provide specific error messages based on common issues
      let errorMessage = error.message || "Failed to generate document insights";
      
      if (error.message?.includes('API key')) {
        errorMessage = "AI service not configured. Please contact support.";
      } else if (error.message?.includes('quota exceeded')) {
        errorMessage = "AI service temporarily unavailable. Please try again later.";
      } else if (error.message?.includes('feature flag') || error.message?.includes('disabled')) {
        errorMessage = "AI insights feature not available for your account.";
      } else if (error.message?.includes('extracted text') || error.message?.includes('insufficient text')) {
        errorMessage = "Document text not clear enough for AI analysis. Try OCR retry first.";
      }
      
      toast({
        title: "Generation Failed",
        description: errorMessage,
        variant: "destructive"
      });
      setIsGenerating(false);
    }, [toast, documentId, documentName]),
    onSettled: React.useCallback(() => {
      setIsGenerating(false);
    }, [])
  });

  // Delete insight mutation with memory optimization
  const deleteInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await fetch(`/api/documents/${documentId}/insights/${insightId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000) // 10s timeout
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete insight');
      }
      return await response.json();
    },
    onSuccess: React.useCallback(() => {
      toast({
        title: "Insight Deleted",
        description: "The insight has been removed"
      });
      // Targeted cache invalidation
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'insights']
      });
    }, [documentId, toast, queryClient]),
    onError: React.useCallback((error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete insight",
        variant: "destructive"
      });
    }, [toast])
  });

  const handleGenerateInsights = React.useCallback(() => {
    setIsGenerating(true);
    generateInsightsMutation.mutate();
  }, [generateInsightsMutation]);

  const handleDeleteInsight = React.useCallback((insightId: string) => {
    deleteInsightMutation.mutate(insightId);
  }, [deleteInsightMutation]);

  

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
                          (error as any)?.code === 'INSIGHT_ERROR';

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
            onRetryUpload={handleGenerateInsights}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Simple, user-friendly header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">AI Insights</span>
          {insights.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {insights.length}
            </Badge>
          )}
        </div>
        
        {insights.length === 0 && (
          <Button 
            onClick={handleGenerateInsights} 
            disabled={isGenerating || generateInsightsMutation.isPending}
            size="sm"
            className="text-xs"
          >
            {isGenerating || generateInsightsMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-3 w-3" />
                Generate
              </>
            )}
          </Button>
        )}
      </div>

      {/* Simple Content Area */}
      {insights.length === 0 && !isGenerating && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <Brain className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-3">No insights generated yet</p>
          <p className="text-xs text-gray-400">Click "Generate" to analyze this document with AI</p>
        </div>
      )}
      
      {isGenerating && (
        <div className="text-center py-8 bg-blue-50 rounded-lg border border-blue-200">
          <Loader2 className="w-8 h-8 text-blue-600 mx-auto mb-2 animate-spin" />
          <p className="text-sm text-blue-700 mb-1">Analyzing document...</p>
          <p className="text-xs text-blue-600">This may take up to 30 seconds</p>
        </div>
      )}
      
      {insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insightItem: DocumentInsight, index: number) => {
            const config = insightTypeConfig[insightItem.type as keyof typeof insightTypeConfig] || insightTypeConfig.summary;
            const IconComponent = config.icon;

            return (
              <div 
                key={insightItem.id} 
                className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <IconComponent className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-medium text-gray-600">{config.label}</span>
                    {insightItem.priority === 'high' && (
                      <Badge variant="destructive" className="text-xs px-1 py-0">High</Badge>
                    )}
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                    onClick={() => handleDeleteInsight(insightItem.id)}
                    disabled={deleteInsightMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                
                <h4 className="font-medium text-sm text-gray-900 mb-1">
                  {insightItem.title}
                </h4>
                
                <p className="text-xs text-gray-600 leading-relaxed">
                  {insightItem.content}
                </p>
                
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {Math.round(insightItem.confidence * 100)}% confidence
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}