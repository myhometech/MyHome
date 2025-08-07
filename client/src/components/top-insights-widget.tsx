import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Brain, Calendar, AlertTriangle, Info, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface Insight {
  id: number;
  message: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  actionUrl?: string;
  type: string;
  title: string;
}

interface InsightResponse {
  insights: Insight[];
  total: number;
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
      return 'bg-red-50 border-red-200 text-red-800';
    case 'medium':
      return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    default:
      return 'bg-blue-50 border-blue-200 text-blue-800';
  }
}

function formatDueDate(dateString?: string) {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Due today";
    if (diffDays === 1) return "Due tomorrow";
    if (diffDays > 0 && diffDays <= 7) return `Due in ${diffDays} days`;
    if (diffDays < 0) return "Overdue";
    
    return format(date, "MMM dd, yyyy");
  } catch {
    return null;
  }
}

export default function TopInsightsWidget() {
  const { data, isLoading, error } = useQuery<InsightResponse>({
    queryKey: ['/api/insights', { status: 'open', limit: 5, sort: 'priority' }],
    queryFn: async () => {
      const response = await fetch('/api/insights?status=open&limit=5&sort=priority', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-blue-600" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-100 rounded w-3/4"></div>
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
            <Brain className="w-5 h-5 text-blue-600" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm">Unable to load insights at this time.</p>
        </CardContent>
      </Card>
    );
  }

  const insights = data?.insights || [];

  // TICKET 10: Show friendly empty state with CTA instead of hiding widget
  if (insights.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-blue-600" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">All clear!</h3>
            <p className="text-gray-600 mb-4">
              No actions needed right now — but we're keeping an eye out for anything important.
            </p>
            <Link href="/">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Brain className="w-4 h-4 mr-2" />
                Go to AI Insights Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-blue-600" />
            AI Insights
            <Badge variant="secondary" className="ml-2">
              {insights.length}
            </Badge>
          </CardTitle>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-sm">
              View All →
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {insights.map((insight) => {
            const dueText = formatDueDate(insight.dueDate);
            return (
              <div
                key={insight.id}
                className={`p-3 rounded-lg border transition-all hover:shadow-sm ${getPriorityColor(insight.priority)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getPriorityIcon(insight.priority)}
                      <Badge
                        variant="outline"
                        className={`text-xs ${getPriorityColor(insight.priority)} border-current`}
                      >
                        {insight.priority.toUpperCase()}
                      </Badge>
                      {dueText && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          {dueText}
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                      {insight.message}
                    </p>
                    <p className="text-xs text-gray-600 truncate">
                      {insight.title}
                    </p>
                  </div>
                  <Link href={`/document/${insight.documentId}`}>
                    <Button size="sm" variant="outline" className="shrink-0 text-xs">
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        
        {insights.length >= 5 && (
          <div className="mt-4 pt-3 border-t">
            <Link href="/">
              <Button variant="outline" className="w-full" size="sm">
                <Brain className="w-4 h-4 mr-2" />
                View All Insights
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}