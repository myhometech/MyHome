import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { compressImage, createThumbnail, isImageFile } from '@/lib/image-compression';
import { ImageProcessor, ProcessingResult } from '@/lib/image-processing';
import { ImageProcessingPanel } from '@/components/image-processing-panel';
import { ComponentErrorBoundary } from '@/components/error-boundary';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { 
  Upload, 
  File, 
  Image, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  WifiOff,
  Compress
} from 'lucide-react';

// Helper function to merge class names (assuming it's available globally or imported)
// If not, you'd need to define or import a `cn` function that handles string concatenation and conditional classes.
// For the purpose of this example, let's assume `cn` is available and works like:
// const cn = (...classes) => classes.filter(Boolean).join(' ');

// Placeholder for cn function if not globally available:
const cn = (...classes) => classes.filter(Boolean).join(' ');


interface UploadFile extends File {
  id: string;
  preview?: string;
  compressed?: File;
  thumbnail?: File;
  status: 'pending' | 'compressing' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  originalSize: number;
  compressedSize?: number;
}

interface EnhancedDocumentUploadProps {
  onUploadComplete?: () => void;
  onUploadStart?: () => void;
  categoryId?: number;
  maxFiles?: number;
}

export function EnhancedDocumentUpload({
  onUploadComplete,
  onUploadStart,
  categoryId,
  maxFiles = 10,
}: EnhancedDocumentUploadProps) {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showImageProcessor, setShowImageProcessor] = useState(false);
  const [processingFile, setProcessingFile] = useState<File | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();

  // Upload mutation with retry logic
  const uploadMutation = useMutation({
    mutationFn: async (file: UploadFile) => {
      const formData = new FormData();

      // Use compressed version if available
      const fileToUpload = file.compressed || file;
      formData.append('file', fileToUpload);

      if (categoryId) {
        formData.append('categoryId', categoryId.toString());
      }

      // Add thumbnail if available
      if (file.thumbnail) {
        formData.append('thumbnail', file.thumbnail);
      }

      const response = await fetch('/api/documents', {
        method: 'POST', 
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(error.message || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Show immediate processing notification
      toast({
        title: "Document uploaded successfully",
        description: "Your document is being processed and will appear shortly in your library.",
        duration: 5000,
      });

      // Refresh document list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/insights/metrics'] });

      // Call completion callback
      onUploadComplete?.();
    },
    retry: (failureCount, error: any) => {
      // Retry on network errors but not on client errors
      return failureCount < 2 && (!error.message?.includes('413') && !error.message?.includes('400'));
    },
  });

  const handleImageProcessingComplete = useCallback((result: ProcessingResult) => {
    if (!processingFile) return;

    // Replace the original file with the processed one
    const processedFile = new File([result.processedImage], `processed_${processingFile.name}`, {
      type: result.processedImage.type,
      lastModified: Date.now()
    });

    setShowImageProcessor(false);
    setProcessingFile(null);

    // Process the enhanced image
    processFiles([processedFile], true);
  }, [processingFile]);

  const processFiles = useCallback(async (files: File[], skipImageProcessing = false) => {
    // Check for images that might benefit from processing
    if (!skipImageProcessing) {
      const firstImageFile = files.find(file => isImageFile(file));
      if (firstImageFile && files.length === 1) {
        // Show image processing panel for single image uploads
        setProcessingFile(firstImageFile);
        setShowImageProcessor(true);
        return;
      }
    }

    const newUploadFiles: UploadFile[] = files.map(file => ({
      ...file,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending' as const,
      progress: 0,
      originalSize: file.size,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));

    setUploadFiles(prev => [...prev, ...newUploadFiles]);
    onUploadStart?.();

    // Process each file
    for (const uploadFile of newUploadFiles) {
      try {
        // Update status to compressing for images
        if (isImageFile(uploadFile)) {
          setUploadFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'compressing' }
              : f
          ));

          // Compress image
          console.log('Compressing image:', uploadFile.name);
          const compressed = await compressImage(uploadFile);
          const thumbnail = await createThumbnail(uploadFile);

          uploadFile.compressed = compressed;
          uploadFile.thumbnail = thumbnail;
          uploadFile.compressedSize = compressed.size;

          setUploadFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, compressed, thumbnail, compressedSize: compressed.size }
              : f
          ));
        }

        // Update status to uploading
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'uploading' }
            : f
        ));

        // Upload file
        await uploadMutation.mutateAsync(uploadFile);

        // Mark as completed
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'completed', progress: 100 }
            : f
        ));

      } catch (error: any) {
        console.error('Upload failed for file:', uploadFile.name, error);

        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'error', error: error.message }
            : f
        ));

        toast({
          title: 'Upload failed',
          description: `Failed to upload ${uploadFile.name}: ${error.message}`,
          variant: 'destructive',
        });
      }
    }

    setIsUploading(false);
  }, [uploadMutation, onUploadStart, onUploadComplete, categoryId, toast]);

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop: processFiles,
    maxFiles,
    disabled: !isOnline || isUploading,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
  });

  const clearCompleted = () => {
    setUploadFiles(prev => prev.filter(file => file.status !== 'completed'));
  };

  const retryFailed = () => {
    const failedFiles = uploadFiles.filter(file => file.status === 'error');
    if (failedFiles.length > 0) {
      const originalFiles = failedFiles.map(file => {
        const blob = new Blob([new ArrayBuffer(file.size)], { type: file.type });
        return new File([blob], file.name, { type: file.type });
      });
      processFiles(originalFiles);
    }
  };

  const removeFile = (fileId: string) => {
    setUploadFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCompressionRatio = (original: number, compressed?: number) => {
    if (!compressed || compressed >= original) return null;
    return Math.round(((original - compressed) / original) * 100);
  };

  return (
    <ComponentErrorBoundary componentName="Document Upload">
      <div className="space-y-4">
        {/* Drop Zone */}
        <Card>
          <CardContent className="p-6">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                isDragActive 
                  ? "border-accent-purple-300 bg-accent-purple-50" 
                  : "border-gray-300 hover:border-accent-purple-200"
              )}
            >
              <input {...getInputProps()} />

              {!isOnline ? (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <WifiOff className="w-12 h-12" />
                  <p className="text-lg font-medium">You're offline</p>
                  <p className="text-sm">Connect to the internet to upload documents</p>
                </div>
              ) : isUploading ? (
                <div className="flex flex-col items-center gap-2 text-gray-600">
                  <Loader2 className="w-12 h-12 animate-spin" />
                  <p className="text-lg font-medium">Processing uploads...</p>
                  <p className="text-sm">Please wait while we process your files</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-12 h-12 text-gray-400" />
                  <p className="text-lg font-medium">
                    {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
                  </p>
                  <p className="text-sm text-gray-500">
                    or click to select files (PDF, JPG, PNG, WebP)
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    Max {maxFiles} files
                  </Badge>
                  {/* Updated button styling */}
                  <Button type="button" onClick={open} className="mt-4 bg-accent-purple-600 hover:bg-accent-purple-700 text-white">
                    <Upload className="w-4 h-4 mr-2" />
                    Choose Files
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upload Progress */}
        {uploadFiles.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Upload Progress</h3>
                <div className="flex gap-2">
                  {uploadFiles.some(f => f.status === 'completed') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearCompleted}
                    >
                      Clear Completed
                    </Button>
                  )}
                  {uploadFiles.some(f => f.status === 'error') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={retryFailed}
                    >
                      Retry Failed
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {uploadFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    {/* File Icon */}
                    <div className="flex-shrink-0">
                      {file.preview ? (
                        <img 
                          src={file.preview} 
                          alt="" 
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : file.type.startsWith('image/') ? (
                        <Image className="w-10 h-10 text-gray-400" />
                      ) : (
                        <File className="w-10 h-10 text-gray-400" />
                      )}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{file.name}</p>
                        {file.status === 'completed' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {file.status === 'error' && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        {(file.status === 'compressing' || file.status === 'uploading') && (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                        <span>{formatFileSize(file.originalSize)}</span>

                        {file.compressedSize && (
                          <>
                            <Compress className="w-3 h-3" />
                            <span>{formatFileSize(file.compressedSize)}</span>
                            {getCompressionRatio(file.originalSize, file.compressedSize) && (
                              <Badge variant="secondary" className="text-xs">
                                -{getCompressionRatio(file.originalSize, file.compressedSize)}%
                              </Badge>
                            )}
                          </>
                        )}

                        <Badge variant={
                          file.status === 'completed' ? 'default' :
                          file.status === 'error' ? 'destructive' :
                          'secondary'
                        } className="text-xs">
                          {file.status === 'compressing' ? 'Compressing...' :
                           file.status === 'uploading' ? 'Uploading...' :
                           file.status}
                        </Badge>
                      </div>

                      {file.error && (
                        <p className="text-xs text-red-600 mt-1">{file.error}</p>
                      )}

                      {(file.status === 'uploading' || file.status === 'compressing') && (
                        <Progress value={file.progress} className="mt-2 h-1" />
                      )}
                    </div>

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.id)}
                      disabled={file.status === 'uploading' || file.status === 'compressing'}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Image Processing Panel */}
      {showImageProcessor && processingFile && (
        <ImageProcessingPanel
          originalFile={processingFile}
          onProcessed={handleImageProcessingComplete}
          onCancel={() => {
            setShowImageProcessor(false);
            setProcessingFile(null);
          }}
          autoProcess={true}
        />
      )}
    </ComponentErrorBoundary>
  );
}