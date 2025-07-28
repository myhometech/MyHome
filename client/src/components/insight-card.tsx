import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertCircle, Calendar, CheckCircle, Clock, ExternalLink, MoreVertical, Target, User, Zap } from 'lucide-react';
import { DocumentInsight } from '@shared/schema';
import { useLocation } from 'wouter';
import { formatDistance } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface InsightCardProps {
  insight: DocumentInsight;
  onStatusUpdate?: (insightId: string, status: 'open' | 'dismissed' | 'resolved') => void;
}

export function InsightCard({ insight, onStatusUpdate }: InsightCardProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ insightId, status }: { insightId: string; status: 'open' | 'dismissed' | 'resolved' }) => {
      const response = await fetch(`/api/insights/${insightId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update insight status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
    },
  });

  const handleStatusUpdate = async (status: 'open' | 'dismissed' | 'resolved') => {
    setIsUpdating(true);
    try {
      await updateStatusMutation.mutateAsync({ insightId: insight.id, status });
      onStatusUpdate?.(insight.id, status);
    } catch (error) {
      console.error('Failed to update insight status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <Target className="h-4 w-4 text-yellow-500" />;
      case 'low':
        return <Zap className="h-4 w-4 text-green-500" />;
      default:
        return <Target className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'key_dates':
        return <Calendar className="h-4 w-4" />;
      case 'action_items':
        return <CheckCircle className="h-4 w-4" />;
      case 'financial_info':
        return <Target className="h-4 w-4" />;
      case 'contacts':
        return <User className="h-4 w-4" />;
      case 'compliance':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'resolved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'dismissed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)} days ago`, color: 'text-red-600' };
    } else if (diffDays === 0) {
      return { text: 'Today', color: 'text-red-600' };
    } else if (diffDays <= 7) {
      return { text: `${diffDays} days`, color: 'text-yellow-600' };
    } else {
      return { text: formatDistance(date, now, { addSuffix: true }), color: 'text-gray-600' };
    }
  };

  const dueInfo = formatDueDate(insight.dueDate);

  return (
    <Card className={`transition-all duration-200 hover:shadow-md ${insight.status === 'dismissed' ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-2">
            {getPriorityIcon(insight.priority)}
            <div className="flex-1">
              <CardTitle className="text-sm font-medium leading-tight">
                {insight.message || insight.title}
              </CardTitle>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="outline" className={`text-xs ${getPriorityColor(insight.priority)}`}>
                  {insight.priority}
                </Badge>
                <Badge variant="outline" className={`text-xs ${getStatusColor(insight.status || 'open')}`}>
                  {insight.status || 'open'}
                </Badge>
                {getTypeIcon(insight.type)}
                <span className="text-xs text-gray-500 capitalize">{insight.type.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={isUpdating}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleStatusUpdate('resolved')}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Resolved
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusUpdate('dismissed')}>
                <Clock className="h-4 w-4 mr-2" />
                Dismiss
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusUpdate('open')}>
                <AlertCircle className="h-4 w-4 mr-2" />
                Reopen
              </DropdownMenuItem>
              {insight.actionUrl && (
                <DropdownMenuItem onClick={() => setLocation(insight.actionUrl!)}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Document
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {insight.content && (
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
            {insight.content}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-2">
            {dueInfo && (
              <div className={`flex items-center space-x-1 ${dueInfo.color}`}>
                <Calendar className="h-3 w-3" />
                <span>Due {dueInfo.text}</span>
              </div>
            )}
            {insight.confidence && (
              <div className="flex items-center space-x-1">
                <Target className="h-3 w-3" />
                <span>{insight.confidence}% confidence</span>
              </div>
            )}
          </div>
          {insight.createdAt && (
            <span>
              {formatDistance(new Date(insight.createdAt), new Date(), { addSuffix: true })}
            </span>
          )}
        </div>
        {insight.actionUrl && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => setLocation(insight.actionUrl!)}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Take Action
          </Button>
        )}
      </CardContent>
    </Card>
  );
}