
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

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

export function useMemoryOptimizedInsights(documentId: number, documentName: string) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMobile] = useState(() => window.innerWidth <= 768);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Use ref to prevent stale closures
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;

  // Optimized insights query
  const insightsQuery = useQuery({
    queryKey: ['/api/documents', documentId, 'insights', 'primary', isMobile ? 'mobile' : 'desktop'],
    queryFn: async () => {
      const limit = isMobile ? 3 : 5;
      const controller = new AbortController();
      
      // Set timeout for request
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(
          `/api/documents/${documentIdRef.current}/insights?tier=primary&limit=${limit}`,
          { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error('Failed to fetch insights');
        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    select: useCallback((data: any) => {
      if (!data?.insights) return { insights: [] };
      return {
        ...data,
        insights: data.insights.slice(0, isMobile ? 3 : 5)
      };
    }, [isMobile])
  });

  // Generate insights mutation
  const generateMutation = useMutation({
    mutationFn: async (): Promise<InsightResponse> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        const response = await fetch(`/api/documents/${documentIdRef.current}/insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to generate insights');
        }
        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
    onSuccess: useCallback((data: InsightResponse) => {
      toast({
        title: "Insights Generated",
        description: `Generated ${data.insights.length} insights`
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentIdRef.current, 'insights']
      });
      setIsGenerating(false);
    }, [toast, queryClient]),
    onError: useCallback((error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate document insights",
        variant: "destructive"
      });
      setIsGenerating(false);
    }, [toast]),
    onSettled: useCallback(() => {
      setIsGenerating(false);
    }, [])
  });

  // Delete insight mutation
  const deleteMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(
          `/api/documents/${documentIdRef.current}/insights/${insightId}`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
          }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to delete insight');
        }
        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
    onSuccess: useCallback(() => {
      toast({
        title: "Insight Deleted",
        description: "The insight has been removed"
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentIdRef.current, 'insights']
      });
    }, [toast, queryClient]),
    onError: useCallback((error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete insight",
        variant: "destructive"
      });
    }, [toast])
  });

  // Optimized handlers
  const handleGenerateInsights = useCallback(() => {
    setIsGenerating(true);
    generateMutation.mutate();
  }, [generateMutation]);

  const handleDeleteInsight = useCallback((insightId: string) => {
    deleteMutation.mutate(insightId);
  }, [deleteMutation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      generateMutation.reset();
      deleteMutation.reset();
    };
  }, [generateMutation, deleteMutation]);

  return {
    insights: insightsQuery.data?.insights || [],
    isLoading: insightsQuery.isLoading,
    error: insightsQuery.error,
    isGenerating,
    isMobile,
    handleGenerateInsights,
    handleDeleteInsight,
    generateMutation,
    deleteMutation
  };
}
