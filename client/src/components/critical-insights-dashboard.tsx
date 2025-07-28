import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Clock, Info, CheckCircle, ArrowRight, Calendar, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const { data: insights = [], isLoading, error } = useQuery<CriticalInsight[]>({
    queryKey: ['/api/insights/critical'],
    queryFn: async () => {
      const response = await fetch('/api/insights/critical', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch critical insights');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute for critical insights
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
                  {insight.actionUrl && (
                    <Link href={insight.actionUrl}>
                      <Button size="sm" variant="outline" className="text-xs px-3 py-1">
                        <FileText className="w-3 h-3 mr-1" />
                        View
                      </Button>
                    </Link>
                  )}
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