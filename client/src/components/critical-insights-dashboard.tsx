import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Clock, Info, CheckCircle, ArrowRight, Calendar, FileText, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface CriticalInsight {
  id: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  type: string;
  dueDate?: string;
  actionUrl?: string;
  documentId: number;
  title: string;
}

function getPriorityIcon(priority: string) {
  switch (priority) {
    case 'high':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case 'medium':
      return <Clock className="w-4 h-4 text-yellow-500" />;
    default:
      return <Info className="w-4 h-4 text-blue-500" />;
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'high':
      return 'border-l-red-500 bg-red-50';
    case 'medium':
      return 'border-l-yellow-500 bg-yellow-50';
    default:
      return 'border-l-blue-500 bg-blue-50';
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'expiration':
      return 'Expiring Soon';
    case 'missing_data':
      return 'Missing Info';
    case 'event':
      return 'Time-Sensitive';
    default:
      return 'Action Required';
  }
}

function formatDueDate(dateString?: string) {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays > 0 && diffDays <= 7) return `${diffDays} days`;
    if (diffDays < 0) return "Overdue";
    
    return format(date, "MMM dd");
  } catch {
    return null;
  }
}

export default function CriticalInsightsDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  console.log('[DEBUG] CriticalInsightsDashboard component rendered');
  
  const { data: insights = [], isLoading, error } = useQuery<CriticalInsight[]>({
    queryKey: ['/api/insights/critical'],
    queryFn: async () => {
      console.log('[DEBUG] Fetching critical insights...');
      const response = await fetch('/api/insights/critical', {
        credentials: 'include',
      });
      console.log('[DEBUG] Critical insights response status:', response.status);
      if (!response.ok) {
        console.error('[DEBUG] Failed to fetch critical insights:', response.status, response.statusText);
        throw new Error('Failed to fetch critical insights');
      }
      const data = await response.json();
      console.log('[DEBUG] Critical insights data:', data);
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds for critical insights
    staleTime: 0, // Always consider data stale to force fresh fetches
  });

  // TICKET 8: Dismiss insight mutation
  const dismissInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await fetch(`/api/insights/${insightId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to dismiss insight');
      }
      
      return response.json();
    },
    onMutate: async (insightId: string) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['/api/insights/critical'] });
      
      // Snapshot the previous value
      const previousInsights = queryClient.getQueryData(['/api/insights/critical']);
      
      // Optimistically update to the new value by removing the dismissed insight
      queryClient.setQueryData(['/api/insights/critical'], (old: CriticalInsight[] | undefined) => {
        return old?.filter(insight => insight.id !== insightId) ?? [];
      });
      
      // Return a context object with the snapshotted value
      return { previousInsights };
    },
    onSuccess: () => {
      // Invalidate and refetch critical insights query to refresh the list immediately
      queryClient.invalidateQueries({ queryKey: ['/api/insights/critical'] });
      queryClient.refetchQueries({ queryKey: ['/api/insights/critical'] });
      // Also invalidate the main insights query to keep all views synchronized
      queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      queryClient.refetchQueries({ queryKey: ['/api/insights'] });
      toast({
        title: "Insight dismissed",
        description: "The insight has been successfully dismissed.",
      });
    },
    onError: (error, insightId, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(['/api/insights/critical'], context?.previousInsights);
      console.error('Failed to dismiss insight:', error);
      toast({
        title: "Failed to dismiss insight",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to sync with server
      queryClient.invalidateQueries({ queryKey: ['/api/insights/critical'] });
    }
  });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            ⚠️ Urgent Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            ⚠️ Urgent Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-gray-600 mb-2">Failed to load critical insights</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle className="w-5 h-5 text-green-600" />
            All Clear
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-600 mb-2">All clear — nothing needs your attention.</p>
            <p className="text-sm text-gray-500">Your documents are up to date</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          ⚠️ Urgent Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight) => {
          const dueDate = formatDueDate(insight.dueDate);
          
          return (
            <div
              key={insight.id}
              className={`border-l-4 rounded-lg p-4 ${getPriorityColor(insight.priority)} transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {getPriorityIcon(insight.priority)}
                    <Badge variant="secondary" className="text-xs">
                      {getTypeLabel(insight.type)}
                    </Badge>
                    {dueDate && (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Calendar className="w-3 h-3" />
                        {dueDate}
                      </div>
                    )}
                  </div>
                  
                  <p className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                    {insight.message}
                  </p>
                  
                  {insight.title && (
                    <p className="text-xs text-gray-600 truncate">
                      {insight.title}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/document/${insight.documentId}`}>
                    <Button size="sm" variant="outline" className="text-xs px-3 py-1">
                      <FileText className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  </Link>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                    onClick={() => {
                      console.log('[DEBUG] Dismissing insight:', insight.id, insight);
                      dismissInsightMutation.mutate(insight.id);
                    }}
                    disabled={dismissInsightMutation.isPending}
                  >
                    <X className="w-3 h-3 mr-1" />
                    {dismissInsightMutation.isPending ? 'Dismissing...' : 'Dismiss'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Footer CTA */}
        <div className="pt-2 border-t border-gray-200">
          <Link href="/insights">
            <Button variant="ghost" className="w-full justify-between text-sm">
              View All Insights
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}