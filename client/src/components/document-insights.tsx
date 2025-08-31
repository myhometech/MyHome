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
  priority: 'low' | 'medium' | 'high';
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

const priorityConfig = {
  high: { 
    badge: 'bg-gradient-to-r from-accent-purple-100 to-accent-purple-200 text-accent-purple-600 border-accent-purple-200',
    icon: AlertCircle,
    label: 'High Priority',
    glow: 'shadow-accent-purple-200/50',
    cardGradient: 'bg-gradient-to-br from-accent-purple-600 via-accent-purple-600 to-accent-purple-700'
  },
  medium: { 
    badge: 'bg-gradient-to-r from-accent-purple-50 to-accent-purple-100 text-accent-purple-500 border-accent-purple-200',
    icon: TrendingUp,
    label: 'Medium Priority',
    glow: 'shadow-accent-purple-200/50',
    cardGradient: 'bg-gradient-to-br from-accent-purple-400 via-accent-purple-500 to-accent-purple-600'
  },
  low: { 
    badge: 'bg-gradient-to-r from-accent-purple-50 to-accent-purple-100 text-accent-purple-400 border-accent-purple-200',
    icon: CheckCircle,
    label: 'Low Priority',
    glow: 'shadow-accent-purple-100/50',
    cardGradient: 'bg-gradient-to-br from-accent-purple-200 via-accent-purple-300 to-accent-purple-400'
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

  const { data: insightData, isLoading, error } = useQuery({
    queryKey: ['/api/documents', documentId, 'insights', 'primary', limit],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/documents/${documentId}/insights?tier=primary&limit=${limit}`, {
        signal,
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
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    select: React.useCallback((data: any) => {
      if (!data?.insights) return { insights: [] };
      const limitedInsights = data.insights.slice(0, Math.min(limit, 20));
      return {
        ...data,
        insights: limitedInsights
      };
    }, [limit])
  });

  const insights = insightData?.insights || [];

  const generateInsightsMutation = useMutation({
    mutationFn: async ({ signal }: { signal?: AbortSignal }): Promise<InsightResponse> => {
      console.log(`🔍 [INSIGHT-DEBUG] Starting insight generation for document ${documentId}`);

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
      if (abortControllerRef.current?.signal.aborted) return;

      toast({
        title: "Insights Generated",
        description: `Generated ${data.insights.length} insights`
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'insights']
      });
      setIsGenerating(false);
    }, [documentId, toast, queryClient]),
    onError: React.useCallback((error: any) => {
      if (abortControllerRef.current?.signal.aborted || error.name === 'AbortError') {
        return;
      }

      console.error('❌ [INSIGHT-DEBUG] Insight generation error:', {
        message: error.message,
        stack: error.stack,
        documentId,
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
      const response = await fetch(`/api/documents/${documentId}/insights/${insightId}`, {
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
    generateInsightsMutation.mutate({});
  }, [generateInsightsMutation]);

  const handleDeleteInsight = React.useCallback((insightId: string) => {
    deleteInsightMutation.mutate(insightId);
  }, [deleteInsightMutation]);

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

  if (error) {
    const errorMessage = error?.message || 'Unknown error';
    const isInsightError = errorMessage.toLowerCase().includes('insight') || 
                          errorMessage.includes('INSIGHT_') ||
                          (error as any)?.code === 'INSIGHT_ERROR';

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Document Insights
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
        <div className="text-center py-8 px-6">
          {/* Feature Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-accent-purple-50 to-accent-purple-100 rounded-xl p-4 border border-accent-purple-200">
              <Calendar className="h-6 w-6 text-accent-purple-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-accent-purple-600">Key Dates</p>
            </div>
            <div className="bg-gradient-to-br from-accent-purple-50 to-accent-purple-100 rounded-xl p-4 border border-accent-purple-200">
              <Users className="h-6 w-6 text-accent-purple-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-accent-purple-600">Contacts</p>
            </div>
            <div className="bg-gradient-to-br from-accent-purple-50 to-accent-purple-100 rounded-xl p-4 border border-accent-purple-200">
              <CheckCircle className="h-6 w-6 text-accent-purple-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-accent-purple-600">Action Items</p>
            </div>
            <div className="bg-gradient-to-br from-accent-purple-50 to-accent-purple-100 rounded-xl p-4 border border-accent-purple-200">
              <DollarSign className="h-6 w-6 text-accent-purple-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-accent-purple-600">Financial Data</p>
            </div>
          </div>
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
            const config = insightTypeConfig[insight.type as keyof typeof insightTypeConfig] || insightTypeConfig.summary;
            const priorityData = priorityConfig[insight.priority];
            const IconComponent = config.icon;
            const PriorityIcon = priorityData.icon;

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
              if (target.closest('button') || 
                  target.closest('[role="button"]') || 
                  target.closest('[data-radix-dropdown-menu-trigger]') ||
                  target.closest('[data-radix-dropdown-menu-content]')) {
                return;
              }

              if (onDocumentClick) {
                onDocumentClick(documentId);
              }
            };

            return (
              <div 
                key={insight.id} 
                className={`group relative ${priorityData.cardGradient} rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02] overflow-hidden cursor-pointer border ${config.accent} ${priorityData.glow} hover:${priorityData.glow} text-white`}
                onClick={handleCardClick}
                style={{ minHeight: isMobile ? '140px' : '160px' }}
              >
                {/* Header Section */}
                <div className={`${config.bgPattern} p-3 relative`}>
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
                      className="bg-white/90 backdrop-blur-sm hover:bg-white text-gray-600 hover:text-gray-800 rounded-full h-7 w-7 p-0 shadow-sm hover:shadow-md transition-all duration-200"
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
                      className="bg-white/90 backdrop-blur-sm hover:bg-red-50 hover:text-red-600 text-gray-600 rounded-full h-7 w-7 p-0 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Icon and Type */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`p-2 bg-gradient-to-r ${config.color} rounded-lg shadow-md`}>
                      <IconComponent className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <Badge className={`${priorityData.badge} border text-xs font-medium`}>
                        <PriorityIcon className="h-2 w-2 mr-1" />
                        {insight.priority.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className={`font-semibold text-sm text-white leading-tight mb-1`}>
                    {getSpecificTitle(insight)}
                  </h3>

                  {/* Type Label */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white/90">
                      {config.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <Star className="h-2 w-2 text-yellow-300 fill-current" />
                      <span className="text-xs text-white/80 font-medium">
                        {Math.round(insight.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-3 pt-2 flex-1">
                  <p className="text-white/90 text-xs leading-relaxed line-clamp-3 mb-3">
                    {insight.content}
                  </p>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-xs text-white/70 mb-2">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(insight.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="border-t border-white/20 p-2 bg-black/10">
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onDocumentClick) onDocumentClick(documentId);
                      }}
                      className="text-white/90 hover:text-white hover:bg-white/20 backdrop-blur-sm rounded-md px-3 py-1.5 transition-all duration-200 text-xs font-medium"
                    >
                      <Eye className="h-3 w-3 mr-1.5" />
                      View
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/document/${documentId}`);
                      }}
                      className="text-white/90 hover:text-white hover:bg-white/20 backdrop-blur-sm rounded-md px-3 py-1.5 transition-all duration-200 text-xs font-medium"
                    >
                      Details
                      <ArrowRight className="h-3 w-3 ml-1.5" />
                    </Button>
                  </div>
                </div>

                {/* Priority Accent Border */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${config.color}`}></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}