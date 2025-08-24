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
import { useToast } from '@/hooks/use-toast';

interface InsightCardProps {
  insight: DocumentInsight;
  onStatusUpdate?: (insightId: string, status: 'open' | 'dismissed' | 'resolved') => void;
}

export function InsightCard({ insight, onStatusUpdate }: InsightCardProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      const actionText = variables.status === 'dismissed' ? 'dismissed' : 
                        variables.status === 'resolved' ? 'marked as resolved' : 'reopened';
      toast({
        title: "Insight updated",
        description: `The insight has been ${actionText}.`,
      });
    },
    onError: (error) => {
      console.error('Failed to update insight status:', error);
      toast({
        title: "Failed to update insight",
        description: "Please try again later.",
        variant: "destructive",
      });
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

  // Handle card click to open document
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on buttons, dropdown menus, or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || 
        target.closest('[role="button"]') || 
        target.closest('[data-radix-dropdown-menu-trigger]') ||
        target.closest('[data-radix-dropdown-menu-content]')) {
      return;
    }
    
    // Navigate to document using documentId
    if (insight.documentId) {
      setLocation(`/documents/${insight.documentId}`);
    }
  };

  return (
    <Card 
      className={`compact-insight-card transition-all duration-200 hover:shadow-md cursor-pointer border-l-2 ${
        insight.priority === 'high' ? 'border-l-red-500 bg-red-50/30' :
        insight.priority === 'medium' ? 'border-l-yellow-500 bg-yellow-50/30' :
        'border-l-green-500 bg-green-50/30'
      } ${insight.status === 'dismissed' ? 'opacity-60' : ''}`}
      onClick={handleCardClick}
    >
      <CardContent className="p-1 md:p-1.5">
        {/* Header with title, status indicator, and menu */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {/* Priority and type indicator */}
            <div className="flex items-center space-x-1">
              {getPriorityIcon(insight.priority)}
              {getTypeIcon(insight.type)}
            </div>
            
            {/* Title */}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-medium text-gray-900 leading-tight truncate max-w-20">
                {insight.message || insight.title}
              </h4>
            </div>
          </div>
          
          {/* Status and menu */}
          <div className="flex items-center space-x-1">
            {/* Compact status indicator */}
            <div className={`w-2 h-2 rounded-full ${
              insight.status === 'resolved' ? 'bg-green-500' :
              insight.status === 'dismissed' ? 'bg-gray-400' :
              'bg-blue-500'
            }`} title={`Status: ${insight.status || 'open'}`} />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={isUpdating} data-radix-dropdown-menu-trigger className="h-4 w-4 p-0">
                  <MoreVertical className="h-2.5 w-2.5" />
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
        </div>
        
        {/* Compact Summary with Context */}
        <p className="text-xs text-gray-600 mb-1 line-clamp-1">
          {(() => {
            const message = insight.message || insight.title;
            // Extract document name for context if message is generic
            if (message.includes(': ')) {
              const parts = message.split(': ');
              if (parts.length > 1) {
                // Get document name from first part and action from second
                const docName = parts[0].replace(/\.(pdf|jpg|jpeg|png|webp).*$/i, '');
                const action = parts[1];
                return action.includes('payment') || action.includes('due') ? 
                  `${docName} payment due` : 
                  action;
              }
            }
            return message;
          })()}
        </p>
        
        {/* Compact Footer */}
        <div className="flex items-center justify-between text-xs">
          <span className="capitalize text-gray-500 text-xs truncate">
            {insight.type.replace('_', ' ')}
          </span>
          {dueInfo && (
            <span className={`text-xs ${dueInfo.color}`}>
              {dueInfo.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}