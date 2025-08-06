import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { 
  X, 
  MoreHorizontal, 
  Edit2, 
  Trash2, 
  Calendar, 
  PenTool, 
  FileText, 
  Car, 
  Home,
  Clock,
  RefreshCw
} from 'lucide-react';
import { format, formatDistance, isPast, isToday, isTomorrow } from 'date-fns';
import { ManualEventModal } from './manual-event-modal';

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

interface UserAsset {
  id: number;
  name: string;
  type: 'house' | 'car';
}

interface ManualEventViewerProps {
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function ManualEventViewer({ eventId, isOpen, onClose, onUpdate }: ManualEventViewerProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch event details
  const { data: event, isLoading } = useQuery({
    queryKey: ['/api/manual-events', eventId],
    queryFn: async () => {
      const response = await fetch(`/api/manual-events/${eventId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch event');
      return response.json();
    },
    enabled: isOpen && !!eventId,
  });

  // Fetch user assets for linked asset display
  const { data: userAssets = [] } = useQuery({
    queryKey: ['/api/user-assets'],
    queryFn: async () => {
      const response = await fetch('/api/user-assets', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch assets');
      return response.json();
    }
  });

  // Delete mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/manual-events/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete event');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Event deleted',
        description: 'The manual event has been deleted successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/manual-events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      onClose();
      onUpdate?.();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete the event. Please try again.',
        variant: 'destructive',
      });
      console.error('Error deleting event:', error);
    },
  });

  const handleEdit = () => {
    setShowEditModal(true);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(true);
    try {
      await deleteEventMutation.mutateAsync(eventId);
    } catch (error) {
      // Error handling is done in the mutation
    } finally {
      setIsDeleting(false);
    }
  };

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

  const getDueDateInfo = (dueDate: string) => {
    const date = new Date(dueDate);
    
    if (isPast(date) && !isToday(date)) {
      return {
        text: `Overdue (${formatDistance(date, new Date(), { addSuffix: true })})`,
        color: 'text-red-700',
        bgColor: 'bg-red-50 border-red-200',
        badge: 'destructive' as const
      };
    } else if (isToday(date)) {
      return {
        text: 'Due Today',
        color: 'text-orange-700',
        bgColor: 'bg-orange-50 border-orange-200',
        badge: 'default' as const
      };
    } else if (isTomorrow(date)) {
      return {
        text: 'Due Tomorrow',
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-50 border-yellow-200',
        badge: 'secondary' as const
      };
    } else {
      return {
        text: `Due ${formatDistance(date, new Date(), { addSuffix: true })}`,
        color: 'text-green-700',
        bgColor: 'bg-green-50 border-green-200',
        badge: 'outline' as const
      };
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

  const linkedAsset = event?.linkedAssetId 
    ? userAssets.find((asset: UserAsset) => asset.id === event.linkedAssetId)
    : null;

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Loading event...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!event) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="text-center py-8">
            <p className="text-gray-600">Event not found</p>
            <Button onClick={onClose} className="mt-4">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const dueDateInfo = getDueDateInfo(event.dueDate);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <PenTool className="h-3 w-3 mr-1" />
                  Manual Event
                </Badge>
                <DialogTitle className="text-xl font-semibold">
                  <span className="mr-2">{getCategoryIcon(event.category)}</span>
                  {event.title}
                </DialogTitle>
              </div>
              
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleEdit}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Event
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {isDeleting ? 'Deleting...' : 'Delete Event'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onClose}>
                      <X className="h-4 w-4 mr-2" />
                      Close
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Event Details Card */}
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Due Date */}
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    <div>
                      <Badge variant={dueDateInfo.badge} className={dueDateInfo.color}>
                        {dueDateInfo.text}
                      </Badge>
                      <p className="text-sm text-gray-600 mt-1">
                        {format(new Date(event.dueDate), 'PPPP')}
                      </p>
                    </div>
                  </div>

                  {/* Category */}
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{getCategoryIcon(event.category)}</span>
                    <div>
                      <p className="font-medium">{event.category}</p>
                      {getRepeatText(event.repeat) && (
                        <Badge variant="outline" className="mt-1">
                          <RefreshCw className="h-3 w-3 mr-1" />
                          {getRepeatText(event.repeat)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Linked Asset */}
                  {linkedAsset && (
                    <div className="flex items-center gap-3">
                      {linkedAsset.type === 'car' ? (
                        <Car className="h-5 w-5 text-gray-500" />
                      ) : (
                        <Home className="h-5 w-5 text-gray-500" />
                      )}
                      <div>
                        <p className="font-medium">Linked to {linkedAsset.type}</p>
                        <p className="text-sm text-gray-600">{linkedAsset.name}</p>
                      </div>
                    </div>
                  )}

                  {/* Linked Documents */}
                  {event.linkedDocumentIds && event.linkedDocumentIds.length > 0 && (
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="font-medium">Documents attached</p>
                        <p className="text-sm text-gray-600">
                          {event.linkedDocumentIds.length} document{event.linkedDocumentIds.length !== 1 ? 's' : ''} linked
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            {event.notes && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-medium mb-3">Notes</h3>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-gray-700 whitespace-pre-wrap">{event.notes}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Event Metadata */}
            <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>Created {formatDistance(new Date(event.createdAt), new Date(), { addSuffix: true })}</span>
              </div>
              {event.updatedAt !== event.createdAt && (
                <div className="flex items-center gap-1">
                  <span>Updated {formatDistance(new Date(event.updatedAt), new Date(), { addSuffix: true })}</span>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <ManualEventModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          queryClient.invalidateQueries({ queryKey: ['/api/manual-events', eventId] });
          onUpdate?.();
        }}
        eventId={eventId}
        selectedAssetId={linkedAsset?.id.toString()}
        selectedAssetName={linkedAsset?.name}
      />
    </>
  );
}