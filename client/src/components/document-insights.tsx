import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
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
  Trash2,
  Flag,
  FlagOff,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Star,
  ArrowRight,
  Eye
} from 'lucide-react';

interface DocumentInsight {
  id: string;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  title: string;
  content: string;
  confidence: number;
  category: 'financial' | 'important_dates' | 'general';
  metadata?: Record<string, any>;
  createdAt: string;
  tier?: 'primary' | 'secondary';
  flagged?: boolean;
  flaggedReason?: string;
  flaggedAt?: string;
}

interface InsightResponse {
  success: boolean;
  insights: DocumentInsight[];
  documentType: string;
  recommendedActions: string[];
  processingTime: number;
  confidence: number;
  tierBreakdown?: {
    primary: number;
    secondary: number;
  };
}

const insightTypeConfig = {
  summary: { 
    icon: FileText, 
    label: 'Summary', 
    color: 'from-accent-purple-400 to-accent-purple-500',
    bgPattern: 'bg-gradient-to-br from-accent-purple-50 to-accent-purple-100',
    textColor: 'text-accent-purple-600',
    accent: 'border-accent-purple-200'
  },
  contacts: { 
    icon: Users, 
    label: 'Contacts', 
    color: 'from-accent-purple-400 to-accent-purple-500',
    bgPattern: 'bg-gradient-to-br from-accent-purple-50 to-accent-purple-100',
    textColor: 'text-accent-purple-600',
    accent: 'border-accent-purple-200'
  },
  action_items: { 
    icon: CheckCircle, 
    label: 'Actions', 
    color: 'from-accent-purple-400 to-accent-purple-500',
    bgPattern: 'bg-gradient-to-br from-accent-purple-50 to-accent-purple-100',
    textColor: 'text-accent-purple-600',
    accent: 'border-accent-purple-200'
  },
  key_dates: { 
    icon: Calendar, 
    label: 'Important Dates', 
    color: 'from-accent-purple-400 to-accent-purple-500',
    bgPattern: 'bg-gradient-to-br from-accent-purple-50 to-accent-purple-100',
    textColor: 'text-accent-purple-600',
    accent: 'border-accent-purple-200'
  },
  financial_info: { 
    icon: DollarSign, 
    label: 'Financial', 
    color: 'from-accent-purple-500 to-accent-purple-600',
    bgPattern: 'bg-gradient-to-br from-accent-purple-50 to-accent-purple-100',
    textColor: 'text-accent-purple-600',
    accent: 'border-accent-purple-200'
  },
  compliance: { 
    icon: AlertCircle, 
    label: 'Compliance', 
    color: 'from-accent-purple-600 to-accent-purple-700',
    bgPattern: 'bg-gradient-to-br from-accent-purple-50 to-accent-purple-100',
    textColor: 'text-accent-purple-600',
    accent: 'border-accent-purple-200'
  }
};

const categoryConfig = {
  financial: { 
    badge: 'bg-accent-purple-100 text-accent-purple-700 border-accent-purple-200',
    icon: DollarSign,
    label: 'Financial',
    glow: 'shadow-accent-purple-200/50',
    cardGradient: 'bg-white'
  },
  important_dates: { 
    badge: 'bg-accent-purple-200 text-accent-purple-800 border-accent-purple-300',
    icon: Calendar,
    label: 'Important Dates',
    glow: 'shadow-accent-purple-300/50',
    cardGradient: 'bg-white'
  },
  general: { 
    badge: 'bg-accent-purple-50 text-accent-purple-600 border-accent-purple-200',
    icon: CheckCircle,
    label: 'General',
    glow: 'shadow-accent-purple-100/50',
    cardGradient: 'bg-white'
  }
};

interface DocumentInsightsProps {
  documentId: number;
  documentName: string;
  onDocumentClick?: (documentId: number) => void;
}

export function DocumentInsights({ documentId, documentName, onDocumentClick }: DocumentInsightsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Validate documentId prop
  const validDocumentId = React.useMemo(() => {
    if (!documentId && documentId !== 0) {
      console.error('DocumentInsights: Missing documentId prop:', documentId);
      return null;
    }
    
    const numericId = typeof documentId === 'string' ? parseInt(documentId, 10) : documentId;
    
    if (isNaN(numericId) || numericId < 0) {
      console.error('DocumentInsights: Invalid documentId prop:', documentId, 'converted to:', numericId);
      return null;
    }
    
    return numericId;
  }, [documentId]);

  if (validDocumentId === null) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">Invalid document ID: {documentId}</p>
      </div>
    );
  }

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });

  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      abortControllerRef.current = new AbortController();

      let resizeTimer: NodeJS.Timeout | null = null;
      const handleResize = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (abortControllerRef.current?.signal.aborted) return;

          const newIsMobile = window.innerWidth <= 768;
          setIsMobile(prev => prev !== newIsMobile ? newIsMobile : prev);
          resizeTimer = null;
        }, 150);
      };

      window.addEventListener('resize', handleResize, { 
        passive: true,
        signal: abortControllerRef.current.signal 
      });

      return () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        if (resizeTimer) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
      };
    }
  }, []);

  const limit = React.useMemo(() => isMobile ? 5 : 10, [isMobile]);

  const { data: insightData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/documents', validDocumentId, 'insights', 'primary', limit],
    queryFn: async ({ signal }) => {
      try {
        console.log(`🔍 Fetching insights for document ${validDocumentId}`);
        const response = await fetch(`/api/documents/${validDocumentId}/insights?tier=primary&limit=${limit}`, {
          signal,
          credentials: 'include',
        });
        
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`📝 No insights found for document ${validDocumentId}`);
            return { insights: [], success: true };
          }
          if (response.status === 401) {
            console.error('🔒 Authentication required for insights');
            throw new Error('Authentication required');
          }
          if (response.status === 403) {
            console.error('🚫 Access denied to document insights');
            throw new Error('Access denied to document');
          }
          const errorData = await response.text().catch(() => '');
          console.error('❌ Failed to fetch insights:', errorData);
          throw new Error(`Failed to fetch insights: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ Fetched ${data.insights?.length || 0} insights for document ${validDocumentId}`);
        return data;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('🔄 Insights fetch aborted');
          throw error;
        }
        console.error('❌ Insight fetch error:', error);
        
        // For network errors, return empty state to prevent crashes
        if (!navigator.onLine || error.name === 'TypeError') {
          return { insights: [], success: false, error: 'Network error' };
        }
        
        throw error;
      }
    },
    staleTime: 1 * 60 * 1000, // Reduced stale time for more frequent updates
    gcTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true, // Enable refetch on focus
    refetchOnReconnect: true, // Enable refetch on reconnect
    retry: (failureCount, error) => {
      // Don't retry on authentication or client errors
      if (error?.message?.includes('404') || 
          error?.message?.includes('401') || 
          error?.message?.includes('403') || 
          error?.message?.includes('400')) {
        return false;
      }
      return failureCount < 2;
    },
    select: React.useCallback((data: any) => {
      if (!data || typeof data !== 'object') {
        return { insights: [], success: false };
      }
      if (!data.insights || !Array.isArray(data.insights)) {
        return { insights: [], success: data.success || false };
      }
      const limitedInsights = data.insights.slice(0, Math.min(limit, 20));
      return {
        ...data,
        insights: limitedInsights
      };
    }, [limit])
  });

  // Add a refetch after successful generation
  React.useEffect(() => {
    if (generateInsightsMutation.isSuccess && !generateInsightsMutation.isPending) {
      const timer = setTimeout(() => {
        refetch();
      }, 500); // Small delay to ensure server has processed
      return () => clearTimeout(timer);
    }
  }, [generateInsightsMutation.isSuccess, generateInsightsMutation.isPending, refetch]);

  const insights = React.useMemo(() => {
    const rawInsights = insightData?.insights || [];
    // Filter out any insights that don't have required fields and provide fallback category
    return rawInsights.filter((insight: any) => 
      insight && 
      typeof insight === 'object' && 
      insight.id && 
      insight.type && 
      insight.title && 
      insight.content
    ).map((insight: any) => ({
      ...insight,
      // Ensure category field exists with fallback
      category: insight.category || 'general',
      // Ensure confidence is properly formatted
      confidence: typeof insight.confidence === 'number' ? insight.confidence : 0.8,
      // Ensure createdAt exists
      createdAt: insight.createdAt || new Date().toISOString()
    }));
  }, [insightData?.insights]);

  const generateInsightsMutation = useMutation({
    mutationFn: async ({ signal }: { signal?: AbortSignal }): Promise<InsightResponse> => {
      console.log(`🔍 [INSIGHT-DEBUG] Starting insight generation for document ${validDocumentId}`);

      const requestSignal = signal || abortControllerRef.current?.signal;

      try {
        const response = await fetch(`/api/documents/${validDocumentId}/insights`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          signal: requestSignal
        });

        console.log(`📡 [INSIGHT-DEBUG] Response status: ${response.status}`);

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch {
            errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
          }
          console.error(`❌ [INSIGHT-DEBUG] Server error:`, errorData);
          throw new Error(errorData.message || 'Failed to generate insights');
        }

        const result = await response.json();
        
        // Validate the response structure
        if (!result || typeof result !== 'object') {
          throw new Error('Invalid response format from server');
        }

        console.log(`✅ [INSIGHT-DEBUG] Insights received:`, {
          success: result.success,
          insightsCount: result.insights?.length || 0,
          documentType: result.documentType,
          confidence: result.confidence
        });

        return result;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw error;
        }
        console.error(`❌ [INSIGHT-DEBUG] Request failed:`, error);
        throw new Error(error.message || 'Network error during insight generation');
      }
    },
    onSuccess: React.useCallback((data: InsightResponse) => {
      if (abortControllerRef.current?.signal.aborted) return;

      const actualInsightCount = data.insights?.length || 0;
      toast({
        title: "Insights Generated",
        description: `Generated ${actualInsightCount} insight${actualInsightCount === 1 ? '' : 's'}`
      });
      
      // Invalidate all related queries to refresh data
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', validDocumentId, 'insights']
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/insights']
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/documents']
      });
      
      setIsGenerating(false);
    }, [validDocumentId, toast, queryClient]),
    onError: React.useCallback((error: any) => {
      if (abortControllerRef.current?.signal.aborted || error.name === 'AbortError') {
        return;
      }

      console.error('❌ [INSIGHT-DEBUG] Insight generation error:', {
        message: error.message,
        stack: error.stack,
        documentId: validDocumentId,
        documentName,
        timestamp: new Date().toISOString()
      });

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

  const deleteInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await fetch(`/api/documents/${validDocumentId}/insights/${insightId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
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
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', validDocumentId, 'insights']
      });
    }, [validDocumentId, toast, queryClient]),
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
    generateInsightsMutation.mutate({});
  }, [generateInsightsMutation]);

  const handleDeleteInsight = React.useCallback((insightId: string) => {
    deleteInsightMutation.mutate(insightId);
  }, [deleteInsightMutation]);

  const flagInsightMutation = useMutation({
    mutationFn: async ({ insightId, flagged, reason }: { insightId: string; flagged: boolean; reason?: string }) => {
      const response = await fetch(`/api/documents/${validDocumentId}/insights/${insightId}/flag`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ flagged, reason }),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error('Failed to update insight flag');
      }

      return response.json();
    },
    onSuccess: React.useCallback((data: any, variables: any) => {
      const action = variables.flagged ? 'flagged' : 'unflagged';
      toast({
        title: `Insight ${action}`,
        description: variables.flagged 
          ? "Thanks for the feedback! This insight has been flagged for review." 
          : "Insight flag has been removed."
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', validDocumentId, 'insights']
      });
    }, [validDocumentId, toast, queryClient]),
    onError: React.useCallback((error: any) => {
      toast({
        title: "Flag Failed",
        description: error.message || "Failed to update insight flag",
        variant: "destructive"
      });
    }, [toast])
  });

  const handleFlagInsight = React.useCallback((insightId: string, flagged: boolean, reason?: string) => {
    flagInsightMutation.mutate({ insightId, flagged, reason });
  }, [flagInsightMutation]);

  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort();
      }
      setIsGenerating(false);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>

        {/* Modern Dashboard Skeleton */}
        <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-3'}`}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <div>
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !insightData) {
    const errorMessage = error?.message || 'Unknown error';
    console.error('Insight error details:', { error, errorMessage, documentId: validDocumentId, documentName });

    // Don't crash on category-related errors, show recovery UI
    const isCategoryError = errorMessage.includes('category') || errorMessage.includes('undefined');
    
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-accent-purple-400 to-accent-purple-500 rounded-xl shadow-sm">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Smart Insights</h2>
              <p className="text-xs text-gray-500">AI-powered document analysis</p>
            </div>
          </div>

          <Button 
            onClick={handleGenerateInsights} 
            disabled={isGenerating || generateInsightsMutation.isPending}
            className="bg-gradient-to-r from-accent-purple-400 to-accent-purple-500 hover:from-accent-purple-500 hover:to-accent-purple-600 text-white shadow-sm hover:shadow-lg border-0 rounded-lg px-4 py-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            size="sm"
          >
            <Brain className="mr-2 h-4 w-4" />
            <span className="text-sm">Generate Insights</span>
          </Button>
        </div>

        {/* Enhanced error state with category error handling */}
        <Card className={`border-orange-200 bg-orange-50 ${isCategoryError ? 'border-blue-200 bg-blue-50' : ''}`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <AlertCircle className={`h-5 w-5 ${isCategoryError ? 'text-blue-600' : 'text-orange-600'}`} />
              <h3 className={`font-medium ${isCategoryError ? 'text-blue-900' : 'text-orange-900'}`}>
                {isCategoryError ? 'Insights need updating' : 'Unable to load insights'}
              </h3>
            </div>
            <p className={`text-sm mb-4 ${isCategoryError ? 'text-blue-700' : 'text-orange-700'}`}>
              {isCategoryError 
                ? 'Your insights need to be updated to the new category system. Click "Regenerate" to fix this.'
                : (errorMessage.includes('404') 
                  ? 'No insights found for this document yet.'
                  : 'There was an issue loading insights for this document.')
              }
            </p>
            <Button 
              onClick={handleGenerateInsights}
              className={`text-white ${isCategoryError ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}`}
              size="sm"
            >
              {isCategoryError ? 'Regenerate Insights' : 'Try Generating Insights'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-accent-purple-400 to-accent-purple-500 rounded-xl shadow-sm">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Smart Insights</h2>
            <p className="text-xs text-gray-500">AI-powered document analysis</p>
          </div>
        </div>

        <Button 
          onClick={handleGenerateInsights} 
          disabled={isGenerating || generateInsightsMutation.isPending}
          className="bg-gradient-to-r from-accent-purple-400 to-accent-purple-500 hover:from-accent-purple-500 hover:to-accent-purple-600 text-white shadow-sm hover:shadow-lg border-0 rounded-lg px-4 py-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          size="sm"
        >
          {isGenerating || generateInsightsMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-sm">Analyzing...</span>
            </>
          ) : (
            <>
              <Brain className="mr-2 h-4 w-4" />
              <span className="text-sm">{insights.length > 0 ? 'Refresh' : 'Generate'}</span>
            </>
          )}
        </Button>
      </div>

      {/* Content Area */}
      {insights.length === 0 && !isGenerating && !generateInsightsMutation.isPending ? (
        <div className="text-center py-4">
          <p className="text-gray-500 text-sm">No insights generated yet. Click "Generate" to analyze this document.</p>
        </div>
      ) : isGenerating || generateInsightsMutation.isPending ? (
        <div className="text-center py-16 px-6">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-gradient-to-r from-accent-purple-100 to-accent-purple-200 rounded-full blur-3xl opacity-30 animate-pulse"></div>
            <div className="relative bg-white rounded-2xl p-6 shadow-lg mx-auto w-fit">
              <Loader2 className="h-12 w-12 text-accent-purple-600 mx-auto animate-spin" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-4">AI Analysis in Progress</h3>
          <p className="text-gray-600 mb-6 text-lg max-w-md mx-auto">
            Our AI is carefully reading through your document to extract valuable insights...
          </p>
          <div className="bg-accent-purple-50 rounded-xl p-4 border border-accent-purple-200 max-w-xs mx-auto">
            <div className="text-sm text-accent-purple-600 text-center font-medium">
              Usually takes 5-15 seconds
            </div>
          </div>
        </div>
      ) : (
        <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-3'}`}>
          {insights.map((insight: DocumentInsight, index: number) => {
            // Safer config resolution with fallbacks
            const config = insightTypeConfig[insight.type as keyof typeof insightTypeConfig] || insightTypeConfig.summary;
            
            // Enhanced category validation with fallback
            const safeCategory = insight.category && typeof insight.category === 'string' 
              ? insight.category 
              : 'general';
            const categoryData = categoryConfig[safeCategory as keyof typeof categoryConfig] || categoryConfig.general;
            
            const IconComponent = config?.icon || FileText;
            const CategoryIcon = categoryData?.icon || CheckCircle;

            // Skip invalid insights entirely to prevent crashes
            if (!insight.id || !insight.type || !insight.title || !insight.content) {
              console.warn('Skipping invalid insight:', insight);
              return null;
            }

            // Extract more specific title from content or metadata
            const getSpecificTitle = (insight: DocumentInsight) => {
              const content = insight.content.toLowerCase();
              const title = insight.title.toLowerCase();

              // For payment/bill related insights
              if (content.includes('payment') || content.includes('bill') || content.includes('due')) {
                if (content.includes('peloton')) return 'Peloton Bill Due';
                if (content.includes('netflix')) return 'Netflix Payment';
                if (content.includes('spotify')) return 'Spotify Subscription';
                if (content.includes('mortgage')) return 'Mortgage Payment';
                if (content.includes('credit card')) return 'Credit Card Bill';
                if (content.includes('utilities') || content.includes('electric') || content.includes('gas')) return 'Utility Bill';
                if (content.includes('phone') || content.includes('mobile')) return 'Phone Bill';
                if (content.includes('internet') || content.includes('broadband')) return 'Internet Bill';
                if (content.includes('insurance')) return 'Insurance Payment';
                if (content.includes('three') || content.includes('three uk')) return 'Three UK Bill';
              }

              // For document expiry/renewal insights
              if (content.includes('expire') || content.includes('renewal') || content.includes('renew')) {
                if (content.includes('passport')) return 'Passport Renewal';
                if (content.includes('license') || content.includes('driving')) return 'License Renewal';
                if (content.includes('insurance')) return 'Insurance Renewal';
                if (content.includes('registration')) return 'Registration Due';
                if (content.includes('membership')) return 'Membership Renewal';
                if (content.includes('subscription')) return 'Subscription Renewal';
              }

              // For contact-related insights
              if (insight.type === 'contacts') {
                if (content.includes('doctor')) return 'Doctor Contact';
                if (content.includes('lawyer') || content.includes('attorney')) return 'Legal Contact';
                if (content.includes('insurance')) return 'Insurance Agent';
                if (content.includes('bank')) return 'Bank Contact';
                if (content.includes('contractor')) return 'Contractor Info';
              }

              // For financial insights
              if (insight.type === 'financial_info') {
                if (content.includes('tax')) return 'Tax Information';
                if (content.includes('loan')) return 'Loan Details';
                if (content.includes('investment')) return 'Investment Info';
                if (content.includes('refund')) return 'Refund Due';
              }

              // Fallback to original title if no specific match
              return insight.title;
            };

            const handleCardClick = (e: React.MouseEvent) => {
              const target = e.target as HTMLElement;
              
              // Prevent navigation if clicking on interactive elements
              if (target.closest('button') || 
                  target.closest('[role="button"]') || 
                  target.closest('[data-radix-dropdown-menu-trigger]') ||
                  target.closest('[data-radix-dropdown-menu-content]')) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }

              // Only navigate if callback is provided and document exists
              if (onDocumentClick && validDocumentId) {
                try {
                  e.preventDefault();
                  console.log('Opening document from insight card:', validDocumentId);
                  onDocumentClick(validDocumentId);
                } catch (navError) {
                  console.error('Navigation error from insight card:', navError);
                }
              }
            };

            return (
              <Card 
                key={insight.id} 
                className={`group relative overflow-hidden cursor-pointer border-2 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg ${config.bgPattern} ${config.accent} hover:border-accent-purple-300`}
                onClick={handleCardClick}
                style={{ minHeight: isMobile ? '140px' : '160px' }}
              >
                {/* Header Section with Purple Background */}
                <CardHeader className={`bg-gradient-to-r ${config.color} text-white p-4 relative`}>
                  {/* Top Actions */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFlagInsight(insight.id, !insight.flagged, insight.flagged ? undefined : "Incorrect information");
                      }}
                      disabled={flagInsightMutation.isPending}
                      className="bg-white/20 hover:bg-white/30 text-white hover:text-white rounded-full h-7 w-7 p-0 shadow-sm hover:shadow-md transition-all duration-200"
                      title={insight.flagged ? "Remove flag" : "Flag as incorrect"}
                    >
                      {insight.flagged ? <FlagOff className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteInsight(insight.id);
                      }}
                      disabled={deleteInsightMutation.isPending}
                      className="bg-white/20 hover:bg-red-500 hover:text-white text-white rounded-full h-7 w-7 p-0 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Icon and Category Badge */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-white/20 rounded-lg shadow-sm">
                      <IconComponent className="h-5 w-5 text-white" />
                    </div>
                    <Badge className="bg-white/20 text-white border-white/30 text-xs font-medium">
                      <CategoryIcon className="h-3 w-3 mr-1" />
                      {categoryData.label.toUpperCase()}
                    </Badge>
                  </div>

                  {/* Title */}
                  <CardTitle className="text-sm text-white leading-tight mb-2">
                    {getSpecificTitle(insight)}
                  </CardTitle>

                  {/* Type and Confidence */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/90">
                      {config.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-300 fill-current" />
                      <span className="text-xs text-white/90 font-medium">
                        {Math.round(insight.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </CardHeader>

                {/* Content Section */}
                <CardContent className="p-4 flex-1 bg-white">
                  <p className={`text-sm leading-relaxed line-clamp-3 mb-3 ${config.textColor}`}>
                    {insight.content}
                  </p>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(insight.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          console.log('View button clicked for document:', validDocumentId);
                          if (onDocumentClick && validDocumentId) {
                            onDocumentClick(validDocumentId);
                          }
                        } catch (viewError) {
                          console.error('Error opening document viewer:', viewError);
                        }
                      }}
                      className={`${config.textColor} hover:bg-accent-purple-100 rounded-md px-3 py-1.5 transition-all duration-200 text-xs font-medium`}
                    >
                      <Eye className="h-3 w-3 mr-1.5" />
                      View
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          console.log('Details button clicked, navigating to:', `/document/${validDocumentId}`);
                          if (validDocumentId) {
                            setLocation(`/document/${validDocumentId}`);
                          }
                        } catch (navError) {
                          console.error('Error navigating to document details:', navError);
                        }
                      }}
                      className={`${config.textColor} hover:bg-accent-purple-100 rounded-md px-3 py-1.5 transition-all duration-200 text-xs font-medium`}
                    >
                      Details
                      <ArrowRight className="h-3 w-3 ml-1.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}