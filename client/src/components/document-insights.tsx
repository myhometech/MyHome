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

  // INSIGHT-102: Fetch only primary insights with memory optimization
  const limit = React.useMemo(() => isMobile ? 3 : 5, [isMobile]);

  const { data: insightData, isLoading, error } = useQuery({
    queryKey: ['/api/documents', documentId, 'insights', 'primary', limit],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/insights?tier=primary&limit=${limit}`, {
        signal: AbortSignal.timeout(10000) // 10s timeout to prevent hanging requests
      });
      if (!response.ok) throw new Error('Failed to fetch insights');
      return await response.json();
    },
    // Aggressive caching with memory optimization
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnWindowFocus: false,
    refetchOnReconnect: false, // Disable automatic refetching
    retry: 1, // Limit retries to prevent memory pressure
    // Memory-optimized data selection
    select: (data) => {
      if (!data?.insights) return { insights: [] };
      return {
        ...data,
        insights: data.insights.slice(0, limit)
      };
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
    <div className="space-y-4">
      {/* Header - Show generate button only if no insights exist or generation failed */}
      {insights.length === 0 && (
        <div className={`flex items-center justify-between mb-4 ${isMobile ? 'flex-col gap-3 sm:flex-col' : ''}`}>
          <div className="flex items-center gap-2">
            <Brain className={`${isMobile ? 'h-5 w-5' : 'h-4 w-4'} text-blue-600`} />
            <span className={`${isMobile ? 'text-base' : 'text-sm'} font-medium`}>Smart Tips</span>
          </div>
          <Button 
            onClick={handleGenerateInsights} 
            disabled={isGenerating || generateInsightsMutation.isPending}
            size={isMobile ? "default" : "sm"}
            variant="outline"
            className={`${isMobile ? 'w-full sm:w-auto text-sm' : 'text-xs'} touch-target hover:bg-gradient-to-r hover:from-blue-50 hover:to-accent-purple/10 hover:border-accent-purple/30 transition-all duration-300 shadow-sm hover:shadow-md`}
            style={{ minHeight: '44px', minWidth: isMobile ? 'auto' : '44px' }}
          >
            {isGenerating || generateInsightsMutation.isPending ? (
              <>
                <Loader2 className={`mr-2 ${isMobile ? 'h-4 w-4' : 'h-3 w-3'} animate-spin`} />
                {isMobile ? 'Finding Tips...' : 'Finding...'}
              </>
            ) : (
              <>
                <Brain className={`mr-2 ${isMobile ? 'h-4 w-4' : 'h-3 w-3'}`} />
                {isMobile ? 'Generate Insights' : 'Generate'}
              </>
            )}
          </Button>
        </div>
      )}
      
      {/* Header for existing insights - no generate button */}
      {insights.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Brain className={`${isMobile ? 'h-5 w-5' : 'h-4 w-4'} text-blue-600`} />
          <span className={`${isMobile ? 'text-base' : 'text-sm'} font-medium`}>Smart Tips</span>
        </div>
      )}

      {/* Content Area */}
      {insights.length === 0 ? (
        <div className="text-center py-16 px-6">
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-100 via-purple-100 to-cyan-100 rounded-full opacity-40 animate-pulse"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 bg-gradient-to-tr from-purple-200/40 to-cyan-200/40 rounded-full opacity-30 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
            </div>
            <div className="relative z-10 bg-white rounded-full p-4 shadow-lg">
              <Brain className="h-12 w-12 text-blue-600 mx-auto" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Discover Key Insights</h3>
          <p className="text-gray-600 mb-8 text-base max-w-lg mx-auto leading-relaxed">
            No insights detected yet for this document. Our AI can extract important deadlines, contacts, summaries, and actionable items automatically.
          </p>
          <div className="bg-gradient-to-r from-blue-50 via-purple-50/50 to-cyan-50 rounded-xl p-6 mb-8 border border-blue-200/50 shadow-sm max-w-md mx-auto">
            <div className="flex items-start gap-4 text-left">
              <div className="bg-blue-600 rounded-full p-2 mt-1 shadow-sm">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-base font-semibold text-blue-900 mb-3">AI Analysis includes:</p>
                <div className="grid grid-cols-1 gap-2 text-sm text-blue-700">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                    <span>Key dates and deadlines</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                    <span>Important contacts and entities</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full"></div>
                    <span>Document summaries</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span>Actionable insights</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`space-y-4 ${isMobile ? 'space-y-3' : 'space-y-4'}`}>
          {insights.filter((insight: DocumentInsight) => 
            !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(insight.type)
          ).map((insight: DocumentInsight, index: number) => {
            const config = insightTypeConfig[insight.type as keyof typeof insightTypeConfig] || insightTypeConfig.summary;
            const priorityStyle = priorityConfig[insight.priority];
            const IconComponent = config.icon;

            return (
              <div 
                key={insight.id} 
                className={`group relative border border-gray-200/60 shadow-sm bg-white rounded-xl ${isMobile ? 'p-4 space-y-3 mb-3' : 'p-6 space-y-4 mb-4'} insight-content hover:shadow-xl hover:border-gray-300/80 ${isMobile ? 'active:scale-[0.98]' : 'hover:-translate-y-2'} hover:shadow-blue-200/30 transition-all duration-300 cursor-pointer border-l-4 ${priorityStyle.cardBorder} ${priorityStyle.cardBg} overflow-hidden`}
                style={{
                  animationDelay: `${index * 100}ms`
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`flex items-center gap-3 flex-wrap ${isMobile ? 'gap-2' : 'gap-3'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${config.color.includes('blue') ? 'bg-blue-50' : config.color.includes('green') ? 'bg-green-50' : config.color.includes('purple') ? 'bg-purple-50' : 'bg-gray-50'}`}>
                        <IconComponent className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} ${config.color.split(' ')[1]}`} />
                      </div>
                      <Badge className={`${config.color} ${isMobile ? 'text-xs px-3 py-1' : 'text-sm px-3 py-1'} font-medium rounded-full shadow-sm`}>
                        {config.label}
                      </Badge>
                    </div>
                    
                    <Badge 
                      variant="outline" 
                      className={`${priorityStyle.color} ${isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'} font-medium rounded-full border-2`}
                    >
                      {insight.priority === 'high' ? '🔥' : insight.priority === 'medium' ? '⚡' : '📝'} {priorityStyle.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-medium text-gray-600">
                          {Math.round(insight.confidence * 100)}%
                        </span>
                      </div>
                      <div className={`${isMobile ? 'w-12 h-2' : 'w-16 h-2'} bg-gray-200 rounded-full overflow-hidden`}>
                        <div 
                          className="h-full bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 rounded-full transition-all duration-1000 ease-out"
                          style={{ 
                            width: `${insight.confidence * 100}%`,
                            animationDelay: `${index * 200}ms`
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteInsight(insight.id)}
                      disabled={deleteInsightMutation.isPending}
                      className={`text-gray-400 hover:text-red-500 hover:bg-red-50 ${isMobile ? 'opacity-100 h-8 w-8 p-0' : 'h-8 w-8 p-0 opacity-0 group-hover:opacity-100'} transition-all duration-200 rounded-full`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className={`font-semibold text-gray-900 ${isMobile ? 'text-base leading-tight' : 'text-lg'} tracking-tight`}>
                    {insight.title}
                  </h4>
                  <div className={`text-gray-600 ${isMobile ? 'text-sm leading-relaxed' : 'text-base leading-relaxed'} insight-content bg-gray-50/50 rounded-lg p-3 border-l-2 border-gray-300`}>
                    {insight.content}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className={`flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-sm'} text-gray-500 bg-gray-50 rounded-full px-3 py-1`}>
                    <Clock className="h-3 w-3" />
                    <span className="font-medium">
                      {isMobile ? 
                        new Date(insight.createdAt).toLocaleDateString() : 
                        `${new Date(insight.createdAt).toLocaleDateString()} at ${new Date(insight.createdAt).toLocaleTimeString()}`
                      }
                    </span>
                  </div>
                  {insight.priority === 'high' && (
                    <div className="flex items-center gap-1 text-red-600 bg-red-50 rounded-full px-2 py-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-medium">Urgent</span>
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