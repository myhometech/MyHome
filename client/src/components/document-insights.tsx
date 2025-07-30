import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Brain, 
  CheckCircle, 
  Clock, 
  DollarSign,
  FileText, 
  ListTodo, 
  Calendar,
  Users,
  Shield,
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
  action_items: { icon: ListTodo, label: 'Action Items', color: 'bg-orange-100 text-orange-800' },
  key_dates: { icon: Calendar, label: 'Key Dates', color: 'bg-purple-100 text-purple-800' },
  financial_info: { icon: DollarSign, label: 'Financial Info', color: 'bg-green-100 text-green-800' },
  contacts: { icon: Users, label: 'Contacts', color: 'bg-indigo-100 text-indigo-800' },
  compliance: { icon: Shield, label: 'Compliance', color: 'bg-red-100 text-red-800' }
};

const priorityConfig = {
  high: { color: 'bg-red-100 text-red-800 border-red-200', label: 'High Priority' },
  medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Medium Priority' },
  low: { color: 'bg-gray-100 text-gray-800 border-gray-200', label: 'Low Priority' }
};

interface DocumentInsightsProps {
  documentId: number;
  documentName: string;
}

export function DocumentInsights({ documentId, documentName }: DocumentInsightsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // INSIGHT-102: Fetch only primary insights (no secondary access)
  const { data: insightData, isLoading, error } = useQuery({
    queryKey: ['/api/documents', documentId, 'insights', 'primary'],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/insights?tier=primary`);
      if (!response.ok) throw new Error('Failed to fetch insights');
      return await response.json();
    }
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Document Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading insights...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Document Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">Failed to load insights</p>
            <Button onClick={handleGenerateInsights} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Generate AI Insights
                </>
              )}
            </Button>
          </div>
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
          className="text-xs"
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
        <div className="text-center py-8">
          <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4 text-sm">No key insights detected for this document</p>
          <p className="text-xs text-gray-500 mb-6">
            Click "Generate" to analyze this document with AI and extract actionable insights, deadlines, and important details
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight: DocumentInsight, index: number) => {
            const config = insightTypeConfig[insight.type];
            const priorityStyle = priorityConfig[insight.priority];
            const IconComponent = config.icon;
            
            return (
              <div 
                key={insight.id} 
                className="border-0 shadow-none bg-white rounded-lg p-4 space-y-3 mb-4 insight-content"
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

                    <Badge variant="secondary" className="text-xs">
                      {Math.round(insight.confidence * 100)}% confidence
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteInsight(insight.id)}
                    disabled={deleteInsightMutation.isPending}
                    className="text-gray-500 hover:text-red-600 h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
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