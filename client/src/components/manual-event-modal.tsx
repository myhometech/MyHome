import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Upload, X, FileText, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import * as z from 'zod';

// Schema for form validation
const manualEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  category: z.string().min(1, 'Category is required'),
  dueDate: z.date({
    required_error: 'Due date is required',
  }),
  repeat: z.enum(['none', 'monthly', 'quarterly', 'annually']),
  linkedAssetId: z.string().optional(),
  notes: z.string().optional(),
});

type ManualEventForm = z.infer<typeof manualEventSchema>;

interface ManualEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string; // For editing existing events
  selectedAssetId?: string; // Prefill asset from context
  selectedAssetName?: string; // For display purposes
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  file: File;
}

export function ManualEventModal({ 
  isOpen, 
  onClose, 
  eventId, 
  selectedAssetId, 
  selectedAssetName 
}: ManualEventModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Categories for the dropdown (mapped to schema values)
  const categories = [
    { label: 'Insurance Renewal', value: 'insurance' },
    { label: 'Vehicle Registration', value: 'vehicle' },
    { label: 'Utilities Bill', value: 'utilities' },
    { label: 'Mortgage Payment', value: 'mortgage' },
    { label: 'Maintenance Due', value: 'maintenance' },
    { label: 'Other', value: 'other' }
  ];

  // Repeat options
  const repeatOptions = [
    { value: 'none', label: 'No Repeat' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Every 3 Months' },
    { value: 'annually', label: 'Yearly' }
  ];

  const form = useForm<ManualEventForm>({
    resolver: zodResolver(manualEventSchema),
    defaultValues: {
      title: '',
      category: '',
      dueDate: undefined,
      repeat: 'none',
      linkedAssetId: selectedAssetId || '',
      notes: '',
    },
  });

  // Fetch user assets for linking
  const { data: assets = [] } = useQuery({
    queryKey: ['/api/user-assets'],
    queryFn: async () => {
      const res = await fetch('/api/user-assets', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch assets');
      return res.json();
    },
    enabled: isOpen,
  });

  // Fetch existing event data for editing
  const { data: existingEvent } = useQuery({
    queryKey: ['/api/manual-events', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/manual-events/${eventId}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch event');
      return res.json();
    },
    enabled: isOpen && !!eventId,
  });

  // Pre-fill form when editing existing event
  useEffect(() => {
    if (existingEvent) {
      form.reset({
        title: existingEvent.title,
        category: existingEvent.category,
        dueDate: new Date(existingEvent.dueDate),
        repeat: existingEvent.repeat || 'none',
        linkedAssetId: existingEvent.linkedAssetId?.toString() || '',
        notes: existingEvent.notes || '',
      });
    }
  }, [existingEvent, form]);

  // File upload handler
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    // Validate file size (10MB max per file)
    const validFiles = files.filter(file => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 10MB limit`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    });

    // Add to uploaded files list
    const newFiles: UploadedFile[] = validFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      file,
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  // Remove uploaded file
  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Upload files to server
  const uploadFiles = async (): Promise<number[]> => {
    if (uploadedFiles.length === 0) return [];

    setIsUploading(true);
    const uploadedDocumentIds: number[] = [];

    try {
      for (const uploadedFile of uploadedFiles) {
        const formData = new FormData();
        formData.append('files', uploadedFile.file);
        formData.append('categoryId', ''); // No category for manual event attachments
        formData.append('tags', 'manual-event-attachment');

        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${uploadedFile.name}`);
        }

        const result = await response.json();
        if (result.documents && result.documents[0]) {
          uploadedDocumentIds.push(result.documents[0].id);
        }
      }
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload files',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsUploading(false);
    }

    return uploadedDocumentIds;
  };

  // Create manual event mutation
  const createEventMutation = useMutation({
    mutationFn: async (data: ManualEventForm & { linkedDocumentIds?: number[] }) => {
      const url = eventId ? `/api/manual-events/${eventId}` : '/api/manual-events';
      const method = eventId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          linkedAssetId: data.linkedAssetId && data.linkedAssetId !== 'none' ? parseInt(data.linkedAssetId) : null,
          linkedDocumentIds: data.linkedDocumentIds || [],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to save event');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manual-events'] });
      toast({
        title: eventId ? 'Event updated' : 'Event created',
        description: eventId ? 'Manual event updated successfully' : 'Manual event created successfully',
      });
      onClose();
      resetForm();
    },
    onError: (error) => {
      toast({
        title: 'Failed to save event',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    },
  });

  // Form submission handler
  const onSubmit = async (data: ManualEventForm) => {
    try {
      // Upload files first
      const linkedDocumentIds = await uploadFiles();
      
      // Create/update the event
      await createEventMutation.mutateAsync({
        ...data,
        linkedDocumentIds,
      });
    } catch (error) {
      // Error handling is done in the upload function
    }
  };

  // Reset form and state
  const resetForm = () => {
    form.reset();
    setUploadedFiles([]);
    setIsUploading(false);
  };

  // Handle modal close
  const handleClose = () => {
    if (form.formState.isDirty && !window.confirm('You have unsaved changes. Are you sure you want to close?')) {
      return;
    }
    onClose();
    resetForm();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            {eventId ? 'Edit Manual Event' : 'Add Important Date'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Home Insurance Renewal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Due Date */}
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Due Date *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Repeat */}
            <FormField
              control={form.control}
              name="repeat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repeat</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {repeatOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Linked Asset */}
            <FormField
              control={form.control}
              name="linkedAssetId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link to Asset (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={selectedAssetName || "Select an asset"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No asset</SelectItem>
                      {assets.map((asset: any) => (
                        <SelectItem key={asset.id} value={asset.id.toString()}>
                          {asset.type === 'house' ? '🏠' : '🚗'} {asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* File Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Attach Documents (Optional)</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2 text-gray-600 hover:text-gray-800"
                >
                  <Upload className="h-8 w-8" />
                  <span className="text-sm">Click to upload documents</span>
                  <span className="text-xs text-gray-500">Max 10MB per file</span>
                </label>
              </div>

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 p-2 bg-gray-50 rounded border"
                    >
                      <FileText className="h-4 w-4 text-gray-600" />
                      <span className="flex-grow text-sm truncate">{file.name}</span>
                      <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(file.id)}
                        className="h-6 w-6"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any additional notes or details..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={createEventMutation.isPending || isUploading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createEventMutation.isPending || isUploading}
              >
                {createEventMutation.isPending || isUploading
                  ? (isUploading ? 'Uploading...' : 'Saving...')
                  : (eventId ? 'Update Event' : 'Create Event')
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}