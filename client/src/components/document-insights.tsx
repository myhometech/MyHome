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
  Trash2,
  Flag,
  FlagOff
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
  // Flagging system for incorrect insights
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
  // INSIGHT-102: Add tier breakdown
  tierBreakdown?: {
    primary: number;
    secondary: number;
  };
}

const insightTypeConfig = {
  summary: { icon: FileText, label: 'Summary', color: 'bg-accent-purple-100 text-accent-purple-800' },
  contacts: { icon: Users, label: 'Contacts', color: 'bg-accent-purple-200 text-accent-purple-900' },
  action_items: { icon: Brain, label: 'Actions', color: 'bg-accent-purple-300 text-accent-purple-900' },
  key_dates: { icon: Clock, label: 'Dates', color: 'bg-accent-purple-400 text-accent-purple-900' },
  financial_info: { icon: FileText, label: 'Financial', color: 'bg-accent-purple-500 text-white' },
  compliance: { icon: FileText, label: 'Compliance', color: 'bg-accent-purple-600 text-white' }
};

const priorityConfig = {
  high: { 
    color: 'bg-accent-purple-100 text-accent-purple-800 border-accent-purple-200', 
    label: 'High Priority',
    cardBorder: 'border-l-accent-purple-700',
    cardBg: '',
    cardStyle: { 
      background: 'linear-gradient(135deg, var(--accent-purple-600) 0%, var(--accent-purple-700) 50%, var(--accent-purple-800) 100%)',
      backgroundColor: 'var(--accent-purple-600)',
      color: 'white'
    }
  },
  medium: { 
    color: 'bg-accent-purple-50 text-accent-purple-700 border-accent-purple-200', 
    label: 'Medium Priority',
    cardBorder: 'border-l-accent-purple-500',
    cardBg: '',
    cardStyle: { 
      background: 'linear-gradient(135deg, var(--accent-purple-400) 0%, var(--accent-purple-500) 50%, var(--accent-purple-600) 100%)',
      backgroundColor: 'var(--accent-purple-400)',
      color: 'white'
    }
  },
  low: { 
    color: 'bg-accent-purple-50 text-accent-purple-600 border-accent-purple-100', 
    label: 'Low Priority',
    cardBorder: 'border-l-accent-purple-300',
    cardBg: '',
    cardStyle: { 
      background: 'linear-gradient(135deg, var(--accent-purple-200) 0%, var(--accent-purple-300) 50%, var(--accent-purple-400) 100%)',
      backgroundColor: 'var(--accent-purple-200)',
      color: 'var(--accent-purple-900)'
    }
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

  // Optimized mobile detection with debouncing and AbortController
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });

  // AbortController for cleanup
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create new AbortController for this effect
    abortControllerRef.current = new AbortController();
    
    let resizeTimer: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Check if component is still mounted
        if (abortControllerRef.current?.signal.aborted) return;
        
        const newIsMobile = window.innerWidth <= 768;
        setIsMobile(prev => prev !== newIsMobile ? newIsMobile : prev);
        resizeTimer = null;
      }, 150); // Debounce resize events
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
  }, []);

  // INSIGHT-102: Fetch insights with reasonable limits
  const limit = React.useMemo(() => isMobile ? 5 : 10, [isMobile]);

  const { data: insightData, isLoading, error } = useQuery({
    queryKey: ['/api/documents', documentId, 'insights', 'primary', limit],
    queryFn: async ({ signal }) => {
      // Use React Query's built-in signal that handles component unmounting
      const response = await fetch(`/api/documents/${documentId}/insights?tier=primary&limit=${limit}`, {
        signal, // Use React Query's abort signal instead of custom timeout
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
    // Optimized caching for memory efficiency
    staleTime: 5 * 60 * 1000, // 5 minutes (reduced from 10)
    gcTime: 2 * 60 * 1000, // 2 minutes garbage collection (reduced from 5)
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    // Memory-optimized data selection with size limit
    select: React.useCallback((data) => {
      if (!data?.insights) return { insights: [] };
      // Further limit insights to prevent memory bloat
      const limitedInsights = data.insights.slice(0, Math.min(limit, 20));
      return {
        ...data,
        insights: limitedInsights
      };
    }, [limit])
  });

  const insights = insightData?.insights || [];

  // Generate new insights mutation with memory optimization
  const generateInsightsMutation = useMutation({
    mutationFn: async ({ signal }: { signal?: AbortSignal }): Promise<InsightResponse> => {
      console.log(`🔍 [INSIGHT-DEBUG] Starting insight generation for document ${documentId}`);
      
      // Use component's AbortController or passed signal
      const requestSignal = signal || abortControllerRef.current?.signal;
      
      const response = await fetch(`/api/documents/${documentId}/insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: requestSignal
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
      // Check if component is still mounted
      if (abortControllerRef.current?.signal.aborted) return;
      
      toast({
        title: "Insights Generated",
        description: `Generated ${data.insights.length} insights`
      });
      // Targeted cache invalidation with memory cleanup
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'insights']
      });
      setIsGenerating(false);
    }, [documentId, toast, queryClient]),
    onError: React.useCallback((error: any) => {
      // Check if component is still mounted and error is not due to abort
      if (abortControllerRef.current?.signal.aborted || error.name === 'AbortError') {
        return; // Don't show error for intentional cancellations
      }
      
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

  // Flag/unflag insight mutation
  const flagInsightMutation = useMutation({
    mutationFn: async ({ insightId, flagged, reason }: { insightId: string; flagged: boolean; reason?: string }) => {
      const response = await fetch(`/api/documents/${documentId}/insights/${insightId}/flag`, {
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
      // Targeted cache invalidation
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'insights']
      });
    }, [documentId, toast, queryClient]),
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

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      // Cancel any pending requests
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort();
      }
      
      // Clear any pending timeouts
      setIsGenerating(false);
    };
  }, []);

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
    <div className="space-y-4">
      {/* Always show header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className={`${isMobile ? 'h-5 w-5' : 'h-4 w-4'} text-accent-purple-600`} />
          <span className={`${isMobile ? 'text-base' : 'text-sm'} font-medium`}>AI Insights</span>
          {insights.length > 0 && (
            <span className={`${isMobile ? 'text-sm' : 'text-xs'} text-gray-500 bg-gray-100 px-2 py-1 rounded-full`}>
              {insights.length} insight{insights.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        
        {/* Show generate/regenerate button */}
        <Button 
          onClick={handleGenerateInsights} 
          disabled={isGenerating || generateInsightsMutation.isPending}
          size={isMobile ? "default" : "sm"}
          variant="outline"
          className={`${isMobile ? 'text-sm' : 'text-xs'} touch-target hover:bg-gradient-to-r hover:from-accent-purple-50 hover:to-accent-purple-100 hover:border-accent-purple-300 transition-all duration-300 shadow-sm hover:shadow-md border-accent-purple-200 text-accent-purple-700`}
          style={{ minHeight: '44px', minWidth: isMobile ? 'auto' : '44px' }}
        >
          {isGenerating || generateInsightsMutation.isPending ? (
            <>
              <Loader2 className={`mr-2 ${isMobile ? 'h-4 w-4' : 'h-3 w-3'} animate-spin`} />
              {isMobile ? 'Analyzing...' : 'Analyzing...'}
            </>
          ) : (
            <>
              <Brain className={`mr-2 ${isMobile ? 'h-4 w-4' : 'h-3 w-3'}`} />
              {insights.length > 0 ? (isMobile ? 'Refresh' : 'Refresh') : (isMobile ? 'Generate' : 'Generate')}
            </>
          )}
        </Button>
      </div>

      {/* Content Area */}
      {insights.length === 0 && !isGenerating && !generateInsightsMutation.isPending ? (
        <div className="text-center py-12 px-4">
          <div className="relative mb-6">
            <div className="relative z-10 bg-white rounded-full p-3 shadow-lg mx-auto w-fit">
              <Brain className="h-8 w-8 text-accent-purple-600 mx-auto" />
            </div>
          </div>
          <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-gray-900 mb-3`}>Generate AI Insights</h3>
          <p className="text-gray-600 mb-6 text-sm max-w-md mx-auto leading-relaxed">
            Click "Generate" to analyze this document and extract key insights like dates, contacts, summaries, and action items.
          </p>
          <div className="bg-accent-purple-50 rounded-lg p-4 border border-accent-purple-200/50 max-w-sm mx-auto">
            <div className="text-left">
              <p className="text-sm font-medium text-accent-purple-900 mb-2">Analysis will find:</p>
              <div className="grid grid-cols-1 gap-1 text-xs text-accent-purple-700">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent-purple-400 rounded-full"></div>
                  <span>Important dates & deadlines</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent-purple-500 rounded-full"></div>
                  <span>Key contacts & companies</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent-purple-600 rounded-full"></div>
                  <span>Document summaries</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent-purple-700 rounded-full"></div>
                  <span>Financial information</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : isGenerating || generateInsightsMutation.isPending ? (
        <div className="text-center py-12 px-4">
          <div className="relative mb-6">
            <div className="relative z-10 bg-white rounded-full p-3 shadow-lg mx-auto w-fit">
              <Loader2 className="h-8 w-8 text-accent-purple-600 mx-auto animate-spin" />
            </div>
          </div>
          <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-gray-900 mb-3`}>Analyzing Document</h3>
          <p className="text-gray-600 mb-4 text-sm max-w-md mx-auto">
            Our AI is reading through your document to find key insights and important information...
          </p>
          <div className="bg-accent-purple-50 rounded-lg p-3 border border-accent-purple-200/50 max-w-xs mx-auto">
            <div className="text-xs text-accent-purple-700 text-center">
              This usually takes 5-15 seconds
            </div>
          </div>
        </div>
      ) : (
        <div className={`space-y-2 ${isMobile ? 'space-y-2' : 'space-y-3'} max-w-full`}>
          {insights.map((insight: DocumentInsight, index: number) => {
            const config = insightTypeConfig[insight.type as keyof typeof insightTypeConfig] || insightTypeConfig.summary;
            const priorityStyle = priorityConfig[insight.priority];
            const IconComponent = config.icon;

            const handleCardClick = (e: React.MouseEvent) => {
              // Don't navigate if clicking on buttons or interactive elements
              const target = e.target as HTMLElement;
              if (target.closest('button') || 
                  target.closest('[role="button"]') || 
                  target.closest('[data-radix-dropdown-menu-trigger]') ||
                  target.closest('[data-radix-dropdown-menu-content]')) {
                return;
              }
              
              // Open document viewer using callback
              if (onDocumentClick) {
                onDocumentClick(documentId);
              }
            };

            return (
              <div 
                key={insight.id} 
                className={`group relative border border-gray-200/60 shadow-sm rounded-lg ${isMobile ? 'p-3 mb-2' : 'p-4 space-y-3 mb-3'} insight-content hover:shadow-lg hover:border-gray-300/80 transition-all duration-200 border-l-4 ${priorityStyle.cardBorder} overflow-hidden max-w-full cursor-pointer`}
                style={priorityStyle.cardStyle}
                onClick={handleCardClick}
              >
                {/* Mobile-first compact header */}
                <div className={`${isMobile ? 'space-y-2' : 'flex items-start justify-between mb-3'}`}>
                  {/* Top row: Icon, type, and actions */}
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className={`${isMobile ? 'p-1 rounded-md' : 'p-1.5 rounded-lg'} bg-white/20 border border-white/30`}>
                        <IconComponent className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} text-white`} />
                      </div>
                      <Badge className={`${config.color} ${isMobile ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1'} font-medium rounded-md`}>
                        {config.label}
                      </Badge>
                      {insight.priority !== 'low' && (
                        <Badge 
                          variant="outline" 
                          className={`${priorityStyle.color} ${isMobile ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1'} font-medium rounded-md`}
                        >
                          {insight.priority === 'high' ? '🔥' : '⚡'}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Right side actions */}
                    <div className="flex items-center gap-1">
                      <div className={`flex items-center gap-1 bg-gray-50 rounded-md ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        <span className={`${isMobile ? 'text-xs' : 'text-xs'} font-medium text-gray-600`}>
                          {Math.round(insight.confidence * 100)}%
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFlagInsight(insight.id, !insight.flagged, insight.flagged ? undefined : "Incorrect information")}
                        disabled={flagInsightMutation.isPending}
                        className={`${insight.flagged ? 'text-orange-500 hover:text-orange-600' : 'text-gray-400 hover:text-orange-500'} hover:bg-orange-50 ${isMobile ? 'h-6 w-6' : 'h-6 w-6'} p-0 ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-all duration-200 rounded-md`}
                        title={insight.flagged ? "Remove flag (this insight is correct)" : "Flag as incorrect"}
                      >
                        {insight.flagged ? <FlagOff className="h-3 w-3" /> : <Flag className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteInsight(insight.id)}
                        disabled={deleteInsightMutation.isPending}
                        className={`text-gray-400 hover:text-red-600 hover:bg-red-50 ${isMobile ? 'h-6 w-6' : 'h-6 w-6'} p-0 ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-all duration-200 rounded-md`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Content section */}
                <div className={`${isMobile ? 'space-y-1.5' : 'space-y-2'}`} style={{ color: priorityStyle.cardStyle?.color || 'inherit' }}>
                  {/* Document name */}
                  <div className={`flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-xs'} mb-1`} style={{ color: priorityStyle.cardStyle?.color || '#6b7280' }}>
                    <FileText className="h-3 w-3" />
                    <span className="truncate">{documentName}</span>
                  </div>
                  
                  {/* Short title */}
                  <h4 className={`font-semibold ${isMobile ? 'text-sm' : 'text-sm'} leading-tight`} style={{ color: priorityStyle.cardStyle?.color || '#111827' }}>
                    {insight.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 25)}
                  </h4>
                  <div className={`${isMobile ? 'text-sm leading-snug p-2' : 'text-sm leading-relaxed p-3'} bg-white/20 rounded-md border border-white/30`} style={{ color: priorityStyle.cardStyle?.color || '#374151' }}>
                    {insight.content}
                  </div>
                </div>

                {/* Footer */}
                <div className={`flex items-center justify-between ${isMobile ? 'pt-2 mt-2' : 'pt-2'} border-t border-white/20`}>
                  <div className={`flex items-center gap-1 ${isMobile ? 'text-xs' : 'text-xs'}`} style={{ color: priorityStyle.cardStyle?.color || '#6b7280' }}>
                    <Clock className={`${isMobile ? 'h-3 w-3' : 'h-3 w-3'}`} />
                    <span>
                      {new Date(insight.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {insight.priority === 'high' && (
                    <div className={`flex items-center gap-1 bg-white/30 rounded-md ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'}`} style={{ color: priorityStyle.cardStyle?.color || '#dc2626' }}>
                      <span className={`${isMobile ? 'text-xs' : 'text-xs'} font-medium`}>🔥 Urgent</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}