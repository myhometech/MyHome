import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  AlertCircle, 
  Calendar, 
  CheckCircle, 
  Clock, 
  ExternalLink, 
  MoreVertical, 
  Target, 
  User, 
  Zap,
  DollarSign,
  Users,
  Brain,
  FileText,
  Shield,
  Star,
  TrendingUp,
  AlertTriangle // Added AlertTriangle import
} from 'lucide-react';
import { DocumentInsight } from '@shared/schema';
import { useLocation, setLocation } from "wouter";
import { formatDistance } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface InsightCardProps {
  insight: DocumentInsight;
  onStatusUpdate?: (insightId: string, status: 'open' | 'dismissed' | 'resolved') => void;
  onDocumentClick?: (documentId: number) => void;
  onDelete?: (insightId: string) => void; // Added onDelete prop
}

// Enhanced type configurations with Pinterest-style gradients and styling
const insightTypeConfig = {
  summary: { 
    icon: Brain, 
    label: 'Summary', 
    gradient: 'from-purple-500 to-purple-600',
    bgGradient: 'from-purple-50 via-purple-50 to-purple-100',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    accentColor: 'bg-purple-500'
  },
  contacts: { 
    icon: Users, 
    label: 'Contacts', 
    gradient: 'from-purple-500 to-purple-600',
    bgGradient: 'from-purple-50 via-purple-50 to-purple-100',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    accentColor: 'bg-purple-500'
  },
  action_items: { 
    icon: CheckCircle, 
    label: 'Action Items', 
    gradient: 'from-purple-500 to-purple-600',
    bgGradient: 'from-purple-50 via-purple-50 to-purple-100',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    accentColor: 'bg-purple-500'
  },
  key_dates: { 
    icon: Calendar, 
    label: 'Key Dates', 
    gradient: 'from-purple-500 to-purple-600',
    bgGradient: 'from-purple-50 via-purple-50 to-purple-100',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    accentColor: 'bg-purple-500'
  },
  financial_info: { 
    icon: DollarSign, 
    label: 'Financial', 
    gradient: 'from-purple-600 to-purple-700',
    bgGradient: 'from-purple-50 via-purple-50 to-purple-100',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    accentColor: 'bg-purple-600'
  },
  compliance: { 
    icon: Shield, 
    label: 'Compliance', 
    gradient: 'from-purple-700 to-purple-800',
    bgGradient: 'from-purple-50 via-purple-50 to-purple-100',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    accentColor: 'bg-purple-700'
  }
};

const priorityConfig = {
  high: { 
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: AlertCircle,
    label: 'High Priority',
    dotColor: 'bg-purple-500',
    ringColor: 'ring-purple-200'
  },
  medium: { 
    badge: 'bg-purple-50 text-purple-700 border-purple-150',
    icon: TrendingUp,
    label: 'Medium Priority',
    dotColor: 'bg-purple-400',
    ringColor: 'ring-purple-150'
  },
  low: { 
    badge: 'bg-purple-25 text-purple-600 border-purple-100',
    icon: CheckCircle,
    label: 'Low Priority',
    dotColor: 'bg-purple-300',
    ringColor: 'ring-purple-100'
  }
};

export function InsightCard({ insight, onStatusUpdate, onDocumentClick, onDelete }: InsightCardProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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

  const config = insightTypeConfig[insight.type as keyof typeof insightTypeConfig] || insightTypeConfig.summary;
  const priorityData = priorityConfig[insight.priority || 'medium'];
  const IconComponent = config.icon;

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)} days ago`, color: 'text-red-600', urgent: true };
    } else if (diffDays === 0) {
      return { text: 'Today', color: 'text-red-600', urgent: true };
    } else if (diffDays <= 7) {
      return { text: `${diffDays} days`, color: 'text-yellow-600', urgent: false };
    } else {
      return { text: formatDistance(date, now, { addSuffix: true }), color: 'text-gray-600', urgent: false };
    }
  };

  const dueInfo = formatDueDate(insight.dueDate);

  // Handle card click to open document or call document click handler
  const handleCardClick = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || 
        target.closest('[role="button"]') || 
        target.closest('[data-radix-dropdown-menu-trigger]') ||
        target.closest('[data-radix-dropdown-menu-content]')) {
      return;
    }

    console.log(`[INSIGHT-CARD] Clicked insight ${insight.id} with documentId:`, insight.documentId);

    // Enhanced documentId validation with type checking
    const documentId = insight.documentId;
    
    // Check for null, undefined, empty string, or non-positive numbers
    if (!documentId || 
        documentId === null || 
        documentId === undefined || 
        documentId === '' || 
        documentId === '0' ||
        (typeof documentId === 'string' && documentId.trim() === '') ||
        (typeof documentId === 'number' && (isNaN(documentId) || documentId <= 0)) ||
        (typeof documentId === 'string' && (isNaN(Number(documentId)) || Number(documentId) <= 0))) {
      
      console.warn(`[INSIGHT-CARD] Invalid documentId for insight ${insight.id}:`, {
        raw: insight.documentId,
        type: typeof insight.documentId,
        converted: Number(insight.documentId),
        isNaN: isNaN(Number(insight.documentId))
      });

      // Check if this is a manual event type insight
      if (insight.id && (insight.id.startsWith('manual-') || insight.type === 'manual_event')) {
        toast({
          title: "Manual Event",
          description: "This is a manually created event, not linked to a document.",
        });
      } else {
        toast({
          title: "Unable to open document",
          description: "This insight is not properly linked to a document. Please contact support if this persists.",
          variant: "destructive",
        });
      }
      return;
    }

    const numericDocumentId = Number(documentId);
    
    // First verify the document exists before navigating
    try {
      console.log(`[INSIGHT-CARD] Verifying document ${numericDocumentId} exists`);
      const response = await fetch(`/api/documents/${numericDocumentId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        console.warn(`[INSIGHT-CARD] Document ${numericDocumentId} verification failed:`, {
          status: response.status,
          statusText: response.statusText,
          insightId: insight.id,
          documentId: numericDocumentId
        });
        
        if (response.status === 404) {
          // Log for potential cleanup
          console.error(`[ORPHANED-INSIGHT] Found insight ${insight.id} referencing non-existent document ${numericDocumentId}`);
          
          toast({
            title: "Document not found",
            description: "This document no longer exists. The insight will be cleaned up automatically.",
            variant: "destructive",
          });
          
          // Optionally trigger cleanup for this specific insight
          try {
            await fetch(`/api/insights/${insight.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            console.log(`[INSIGHT-CARD] Auto-deleted orphaned insight ${insight.id}`);
            // Refresh the insights list
            queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
          } catch (deleteError) {
            console.warn(`[INSIGHT-CARD] Failed to auto-delete orphaned insight:`, deleteError);
          }
          
        } else if (response.status === 401 || response.status === 403) {
          toast({
            title: "Access denied",
            description: "You don't have permission to view this document.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Unable to access document",
            description: `Server error (${response.status}). Please try again later.`,
            variant: "destructive",
          });
        }
        return;
      }

      const documentData = await response.json();
      console.log(`[INSIGHT-CARD] Document ${numericDocumentId} verified:`, documentData.name);

      // Navigate to document if verification successful
      if (onDocumentClick) {
        console.log(`[INSIGHT-CARD] Using parent document click handler`);
        onDocumentClick(numericDocumentId);
      } else {
        console.log(`[INSIGHT-CARD] Navigating to document page`);
        setLocation(`/document/${numericDocumentId}`);
      }

    } catch (error) {
      console.error(`[INSIGHT-CARD] Error verifying document ${numericDocumentId}:`, error);
      toast({
        title: "Connection error",
        description: "Unable to verify document access. Please check your connection.",
        variant: "destructive",
      });
    }
  };

  // Status indicator
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-purple-500';
      case 'dismissed': return 'bg-gray-400';
      default: return 'bg-purple-600';
    }
  };

  return (
    <Card 
      className={`group relative overflow-hidden rounded-xl transition-all duration-300 cursor-pointer transform hover:scale-[1.02] hover:shadow-xl ${config.borderColor} border-2 ${
        insight.status === 'dismissed' ? 'opacity-60' : ''
      } ${
        insight.priority === 'high' ? 'ring-2 ring-red-100' : ''
      }`}
      style={{ minHeight: '200px' }}
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Gradient Background Header */}
      <div className={`absolute top-0 left-0 right-0 h-16 bg-gradient-to-r ${config.gradient} opacity-90`}>
        <div className="absolute inset-0 bg-white/10"></div>
      </div>

      {/* Content Background */}
      <div className={`absolute top-12 left-0 right-0 bottom-0 bg-gradient-to-br ${config.bgGradient}`}>
        <div className="absolute inset-0 bg-white/60"></div>
      </div>

      <CardContent className="relative p-4 h-full flex flex-col">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-3 relative z-10">
          <div className="flex items-center space-x-3">
            {/* Icon with enhanced styling */}
            <div className={`p-2.5 bg-white rounded-xl shadow-lg ${config.borderColor} border`}>
              <IconComponent className={`h-5 w-5 ${config.textColor}`} />
            </div>

            {/* Category Badge */}
            <div>
              <Badge className={`${config.textColor} bg-white/80 border ${config.borderColor} font-medium text-xs px-2 py-1`}>
                {config.label}
              </Badge>
            </div>
          </div>

          {/* Priority Indicator & Menu */}
          <div className="flex items-center space-x-2">
            {/* Priority dot with enhanced visibility */}
            <div className={`w-3 h-3 rounded-full ${priorityData.dotColor} ${insight.priority === 'high' ? 'animate-pulse' : ''}`} 
                 title={`${priorityData.label}`} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={isUpdating} 
                  className="h-8 w-8 p-0 bg-white/80 hover:bg-white border border-gray-200 rounded-lg"
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-sm">
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
                {(() => {
                  const documentId = Number(insight.documentId);
                  return !isNaN(documentId) && documentId > 0;
                })() && (
                  <DropdownMenuItem onClick={async (e) => {
                    e.stopPropagation();
                    const documentId = Number(insight.documentId);
                    console.log(`[INSIGHT-CARD] Dropdown: Opening document ${documentId}`);

                    // Verify document exists before navigating
                    try {
                      const response = await fetch(`/api/documents/${documentId}`, {
                        credentials: 'include',
                        headers: {
                          'Accept': 'application/json',
                        }
                      });

                      if (!response.ok) {
                        if (response.status === 404) {
                          toast({
                            title: "Document not found",
                            description: "This document no longer exists.",
                            variant: "destructive",
                          });
                        } else {
                          toast({
                            title: "Unable to access document",
                            description: "There was an error accessing the document.",
                            variant: "destructive",
                          });
                        }
                        return;
                      }

                      // Navigate if document exists
                      if (onDocumentClick) {
                        onDocumentClick(documentId);
                      } else {
                        setLocation(`/document/${documentId}`);
                      }
                    } catch (error) {
                      toast({
                        title: "Connection error",
                        description: "Unable to verify document access.",
                        variant: "destructive",
                      });
                    }
                  }}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Document
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Title Section */}
        <div className="mb-3 relative z-10">
          <h4 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 mb-1">
            {insight.message || insight.title}
          </h4>

          {/* Status indicator */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(insight.status || 'open')}`} />
            <span className="text-xs text-gray-600 capitalize">
              {insight.status || 'open'}
            </span>
          </div>
        </div>

        {/* Content Summary */}
        <div className="flex-1 mb-3 relative z-10">
          <p className="text-xs text-gray-700 line-clamp-3 leading-relaxed">
            {(() => {
              const content = insight.content.toLowerCase();

              // Extract actionable information instead of showing generic AI text
              if (content.includes('payment') || content.includes('bill') || content.includes('due')) {
                const amountMatch = insight.content.match(/[£$]\s*[\d,]+\.?\d*/);
                const dateMatch = insight.content.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
                let result = '';
                if (amountMatch) result += `Amount: ${amountMatch[0]}. `;
                if (dateMatch) result += `Due: ${dateMatch[0]}. `;
                if (result) return result + 'Payment action required.';
              }

              if (content.includes('expire') || content.includes('renewal')) {
                const dateMatch = insight.content.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
                if (dateMatch) return `Document expires on ${dateMatch[0]}. Renewal action needed.`;
                return 'Document renewal required. Check expiry date and initiate renewal process.';
              }

              if (insight.type === 'contacts') {
                const phoneMatch = insight.content.match(/\+?[\d\s\-\(\)]{10,}/);
                const emailMatch = insight.content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
                let result = 'Contact information found: ';
                if (phoneMatch) result += `Phone: ${phoneMatch[0].trim()}. `;
                if (emailMatch) result += `Email: ${emailMatch[0]}. `;
                return result || insight.content;
              }

              if (insight.type === 'financial_info') {
                const amountMatch = insight.content.match(/[£$]\s*[\d,]+\.?\d*/);
                if (amountMatch) return `Financial amount identified: ${amountMatch[0]}. Review for accuracy and take appropriate action.`;
                return 'Important financial information detected. Review document for monetary details and account information.';
              }

              // For other types, show first meaningful sentence
              const sentences = insight.content.split('.').filter(s => s.trim().length > 20);
              if (sentences.length > 0) {
                return sentences[0].trim() + '.';
              }

              return insight.content;
            })()}
          </p>
        </div>

        {/* Footer Section */}
        <div className="space-y-2 relative z-10">
          {/* Due Date */}
          {dueInfo && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
              dueInfo.urgent ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'
            }`}>
              <Calendar className="w-3 h-3 text-gray-500" />
              <span className={`text-xs font-medium ${dueInfo.color}`}>
                {dueInfo.text}
              </span>
            </div>
          )}

          {/* Confidence & Type */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 text-yellow-500 fill-current" />
              <span className="text-gray-600 font-medium">
                {Math.round((insight.confidence || 0.9) * 100)}%
              </span>
            </div>

            <span className="text-gray-500 capitalize">
              {insight.type.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Hover effect overlay */}
        <div className={`absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 transition-opacity duration-300 ${
          isHovered ? 'opacity-100' : ''
        }`} />

        {/* Left accent border */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.accentColor} transition-all duration-300 ${
          isHovered ? 'w-2' : ''
        }`} />
      </CardContent>
    </Card>
  );
}