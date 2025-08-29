import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar, Edit, MoreVertical, Trash2, FileText, Home, Car, PenTool } from 'lucide-react';
import { formatDistance, format, isPast, isToday, isTomorrow } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { ManualEventModal } from '@/components/manual-event-modal';

interface ManualEvent {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  repeat: 'none' | 'monthly' | 'quarterly' | 'annually';
  linkedAssetId?: number;
  linkedDocumentIds?: number[];
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ManualEventCardProps {
  event: ManualEvent;
  linkedAsset?: {
    id: number;
    name: string;
    type: 'house' | 'car';
  };
  onEdit?: (eventId: string) => void;
  onDelete?: (eventId: string) => void;
  onClick?: () => void;
  showAssetInfo?: boolean;
}

export function ManualEventCard({ 
  event, 
  linkedAsset, 
  onEdit, 
  onDelete, 
  onClick,
  showAssetInfo = true 
}: ManualEventCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const response = await fetch(`/api/manual-events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete event');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manual-events'] });
      toast({
        title: 'Event deleted',
        description: 'Manual event deleted successfully',
      });
      onDelete?.(event.id);
    },
    onError: (error) => {
      toast({
        title: 'Failed to delete event',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const handleEdit = () => {
    setShowEditModal(true);
    onEdit?.(event.id);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(true);
    try {
      await deleteEventMutation.mutateAsync(event.id);
    } catch (error) {
      // Error handling is done in the mutation
    } finally {
      setIsDeleting(false);
    }
  };

  const getDueDateInfo = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();
    
    if (isPast(date) && !isToday(date)) {
      return {
        text: `Overdue (${format(date, 'MMM dd, yyyy')})`,
        color: 'text-red-600',
        bgColor: 'bg-red-50 border-red-200',
        badge: 'destructive' as const
      };
    } else if (isToday(date)) {
      return {
        text: 'Due Today',
        color: 'text-orange-600',
        bgColor: 'bg-orange-50 border-orange-200',
        badge: 'default' as const
      };
    } else if (isTomorrow(date)) {
      return {
        text: 'Due Tomorrow',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50 border-yellow-200',
        badge: 'secondary' as const
      };
    } else {
      const distance = formatDistance(date, now, { addSuffix: true });
      return {
        text: `Due ${distance}`,
        color: 'text-green-600',
        bgColor: 'bg-green-50 border-green-200',
        badge: 'outline' as const
      };
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'insurance renewal':
        return '🛡️';
      case 'tax deadline':
        return '📊';
      case 'maintenance due':
        return '🔧';
      case 'license renewal':
        return '📋';
      case 'contract expiry':
        return '📄';
      case 'warranty expiry':
        return '🏷️';
      case 'inspection due':
        return '🔍';
      case 'payment due':
        return '💳';
      case 'registration renewal':
        return '📝';
      default:
        return '📌';
    }
  };

  const getRepeatText = (repeat: string) => {
    switch (repeat) {
      case 'monthly': return 'Monthly';
      case 'quarterly': return 'Quarterly';
      case 'annually': return 'Yearly';
      default: return null;
    }
  };

  const dueDateInfo = getDueDateInfo(event.dueDate);

  return (
    <>
      <Card 
        className={`group hover:shadow-md transition-all duration-200 ${dueDateInfo.bgColor} cursor-pointer`}
        onClick={onClick || (() => setShowEditModal(true))}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {/* Manual Event Indicator */}
              <div className="flex-shrink-0 mt-1">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <PenTool className="h-3 w-3 mr-1" />
                  Manual
                </Badge>
              </div>
              
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base font-semibold text-gray-900 mb-1 leading-tight">
                  <span className="mr-2">{getCategoryIcon(event.category)}</span>
                  {event.title}
                </CardTitle>
                
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  <Badge variant={dueDateInfo.badge} className={dueDateInfo.color}>
                    <Calendar className="h-3 w-3 mr-1" />
                    {dueDateInfo.text}
                  </Badge>
                  
                  {getRepeatText(event.repeat) && (
                    <Badge variant="outline" className="text-gray-600">
                      {getRepeatText(event.repeat)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(); }}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Event
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  className="text-red-600 focus:text-red-600"
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDeleting ? 'Deleting...' : 'Delete Event'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Category */}
          <div className="mb-3">
            <span className="text-sm font-medium text-gray-700">{event.category}</span>
          </div>

          {/* Asset Link */}
          {showAssetInfo && linkedAsset && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-white/80 rounded border">
              {linkedAsset.type === 'house' ? (
                <Home className="h-4 w-4 text-purple-600" />
              ) : (
                <Car className="h-4 w-4 text-green-600" />
              )}
              <span className="text-sm font-medium text-gray-700">
                {linkedAsset.name}
              </span>
            </div>
          )}

          {/* Linked Documents */}
          {event.linkedDocumentIds && event.linkedDocumentIds.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
              <FileText className="h-4 w-4" />
              <span>{event.linkedDocumentIds.length} document{event.linkedDocumentIds.length !== 1 ? 's' : ''} linked</span>
            </div>
          )}

          {/* Notes Preview */}
          {event.notes && (
            <div className="mt-3 p-2 bg-white/80 rounded border">
              <p className="text-sm text-gray-600 line-clamp-2">{event.notes}</p>
            </div>
          )}

          {/* Created Date */}
          <div className="mt-3 text-xs text-gray-500">
            Created {formatDistance(new Date(event.createdAt), new Date(), { addSuffix: true })}
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <ManualEventModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        eventId={event.id}
        selectedAssetId={linkedAsset?.id.toString()}
        selectedAssetName={linkedAsset?.name}
      />
    </>
  );
}

// Compact version for dashboard summary
export function CompactManualEventCard({ event, linkedAsset, onEdit, onClick }: ManualEventCardProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  
  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'insurance renewal': return '🛡️';
      case 'tax deadline': return '📊';
      case 'maintenance due': return '🔧';
      case 'license renewal': return '📋';
      case 'contract expiry': return '📄';
      case 'warranty expiry': return '🏷️';
      case 'inspection due': return '🔍';
      case 'payment due': return '💳';
      case 'registration renewal': return '📝';
      default: return '📌';
    }
  };

  const getCompactDueDateInfo = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();
    
    if (isPast(date) && !isToday(date)) {
      return {
        text: `Overdue`,
        color: 'text-red-600',
        bgColor: 'bg-red-50 border-red-200'
      };
    } else if (isToday(date)) {
      return {
        text: 'Today',
        color: 'text-orange-600',
        bgColor: 'bg-orange-50 border-orange-200'
      };
    } else if (isTomorrow(date)) {
      return {
        text: 'Tomorrow',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50 border-yellow-200'
      };
    } else {
      const distance = formatDistance(date, now, { addSuffix: true });
      return {
        text: distance.replace('in ', ''),
        color: 'text-green-600',
        bgColor: 'bg-green-50 border-green-200'
      };
    }
  };

  const dueDateInfo = getCompactDueDateInfo(event.dueDate);

  return (
    <>
      <Button
        variant="outline"
        className={`h-auto p-3 justify-start text-left ${dueDateInfo.bgColor} hover:shadow-sm`}
        onClick={onClick || (() => setShowEditModal(true))}
      >
        <div className="flex items-center gap-3 w-full">
          <div className="flex items-center gap-2">
            <PenTool className="h-3 w-3 text-blue-600" />
            <span className="text-lg">{getCategoryIcon(event.category)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{event.title}</div>
            <div className={`text-xs ${dueDateInfo.color}`}>{dueDateInfo.text}</div>
          </div>
          {linkedAsset && (
            <div className="flex-shrink-0">
              {linkedAsset.type === 'house' ? (
                <Home className="h-3 w-3 text-gray-500" />
              ) : (
                <Car className="h-3 w-3 text-gray-500" />
              )}
            </div>
          )}
        </div>
      </Button>

      <ManualEventModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        eventId={event.id}
        selectedAssetId={linkedAsset?.id.toString()}
        selectedAssetName={linkedAsset?.name}
      />
    </>
  );
}