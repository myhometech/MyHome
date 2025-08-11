import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, FileText, Image, File, ExternalLink, ChevronDown, ChevronUp, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Reference type from backend
interface Reference {
  type: 'email';
  relation: 'source' | 'attachment';
  documentId: number;
  createdAt: string;
}

// Document metadata for referenced documents
interface ReferencedDocument {
  id: number;
  name: string;
  mimeType: string;
  fileSize?: number;
  uploadSource?: string;
  createdAt: string;
  categoryId?: number;
}

interface DocumentReferencesProps {
  documentId: number;
  references?: Reference[];
  className?: string;
  onNavigate?: (documentId: number) => void;
}

const DocumentReferences: React.FC<DocumentReferencesProps> = ({
  documentId,
  references: prehydratedReferences,
  className,
  onNavigate
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Fetch references if not prehydrated
  const { data: references, isLoading: referencesLoading, error: referencesError, refetch: refetchReferences } = useQuery({
    queryKey: [`/api/documents/${documentId}/references`],
    enabled: !prehydratedReferences,
    staleTime: 30000, // Cache for 30 seconds
    keepPreviousData: true
  });

  // Use prehydrated references or fetched references
  const finalReferences = prehydratedReferences || references || [];

  // Extract referenced document IDs
  const referencedDocumentIds = useMemo(() => 
    finalReferences.map(ref => ref.documentId), 
    [finalReferences]
  );

  // Batch fetch referenced document metadata
  const { data: referencedDocuments, isLoading: documentsLoading, error: documentsError, refetch: refetchDocuments } = useQuery({
    queryKey: [`/api/documents/batch`, referencedDocumentIds],
    queryFn: async () => {
      if (referencedDocumentIds.length === 0) return [];
      
      // Fetch documents in parallel with concurrency limit
      const batchSize = 5;
      const results: ReferencedDocument[] = [];
      
      for (let i = 0; i < referencedDocumentIds.length; i += batchSize) {
        const batch = referencedDocumentIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (docId) => {
          try {
            const response = await fetch(`/api/documents/${docId}`, {
              credentials: 'include'
            });
            if (!response.ok) {
              console.warn(`Failed to fetch document ${docId}: ${response.status}`);
              return null;
            }
            return await response.json();
          } catch (error) {
            console.warn(`Error fetching document ${docId}:`, error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(Boolean));
      }
      
      return results;
    },
    enabled: referencedDocumentIds.length > 0,
    staleTime: 60000, // Cache document metadata for 1 minute
    keepPreviousData: true
  });

  // Combine references with document metadata
  const referencesWithMetadata = useMemo(() => {
    if (!referencedDocuments) return [];
    
    return finalReferences
      .map(ref => {
        const doc = referencedDocuments.find(d => d.id === ref.documentId);
        return doc ? { reference: ref, document: doc } : null;
      })
      .filter(Boolean);
  }, [finalReferences, referencedDocuments]);

  // Determine display items (with expand/collapse for >5 items)
  const displayItems = isExpanded 
    ? referencesWithMetadata 
    : referencesWithMetadata.slice(0, 5);
  
  const hasMoreItems = referencesWithMetadata.length > 5;

  // Helper functions
  const getDocumentIcon = (mimeType: string, uploadSource?: string) => {
    if (uploadSource === 'email' && mimeType === 'application/pdf') {
      return <Mail className="w-4 h-4 text-blue-600" />;
    }
    if (mimeType.startsWith('image/')) {
      return <Image className="w-4 h-4 text-green-600" />;
    }
    if (mimeType === 'application/pdf') {
      return <FileText className="w-4 h-4 text-red-600" />;
    }
    return <File className="w-4 h-4 text-gray-600" />;
  };

  const getDocumentTypeBadge = (relation: string, mimeType: string, uploadSource?: string) => {
    if (relation === 'source' && uploadSource === 'email') {
      return <Badge variant="secondary" className="text-xs">Email body (PDF)</Badge>;
    }
    if (relation === 'attachment') {
      return <Badge variant="outline" className="text-xs">Email attachment</Badge>;
    }
    return <Badge variant="outline" className="text-xs">Reference</Badge>;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleDocumentClick = (docId: number, position: number) => {
    // Analytics
    console.log(`📊 reference_clicked: documentId=${documentId}, referencedId=${docId}, type=email, position=${position}`);
    
    if (onNavigate) {
      onNavigate(docId);
    } else {
      // Default navigation
      window.location.href = `/documents?id=${docId}`;
    }
  };

  const handleRetry = () => {
    if (referencesError) {
      refetchReferences();
    }
    if (documentsError) {
      refetchDocuments();
    }
  };

  // Analytics - track when references are viewed
  React.useEffect(() => {
    if (referencesWithMetadata.length > 0) {
      console.log(`📊 references_viewed: documentId=${documentId}, count=${referencesWithMetadata.length}`);
    }
  }, [documentId, referencesWithMetadata.length]);

  const isLoading = referencesLoading || documentsLoading;
  const hasError = referencesError || documentsError;

  // Don't render if no references and not loading
  if (!isLoading && !hasError && finalReferences.length === 0) {
    return null;
  }

  return (
    <Card className={cn("mt-6", className)}>
      <CardHeader className="pb-3">
        <CardTitle 
          className="text-lg font-semibold flex items-center gap-2"
          id={`references-${documentId}`}
        >
          <Mail className="w-5 h-5 text-gray-600" />
          References {referencesWithMetadata.length > 0 && `(${referencesWithMetadata.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent 
        className="space-y-3"
        role="region"
        aria-labelledby={`references-${documentId}`}
      >
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="w-16 h-8 rounded" />
              </div>
            ))}
          </div>
        )}

        {hasError && (
          <div className="flex items-center gap-3 p-4 border border-red-200 rounded-lg bg-red-50">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-800">Couldn't load references.</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRetry}
              className="flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !hasError && referencesWithMetadata.length === 0 && (
          <div className="flex items-center gap-2 p-4 text-gray-500 bg-gray-50 rounded-lg">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-help">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">No references yet.</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>References show related documents like email attachments and body PDFs</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {!isLoading && !hasError && displayItems.map((item, index) => {
          const { reference, document } = item;
          return (
            <div 
              key={`${reference.documentId}-${reference.relation}`}
              className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors group"
            >
              {/* Document icon */}
              <div className="flex-shrink-0">
                {getDocumentIcon(document.mimeType, document.uploadSource)}
              </div>
              
              {/* Document info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span 
                    className="font-medium text-gray-900 truncate"
                    title={document.name}
                  >
                    {document.name}
                  </span>
                  {getDocumentTypeBadge(reference.relation, document.mimeType, document.uploadSource)}
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <span>{formatDate(document.createdAt)}</span>
                  {document.fileSize && (
                    <>
                      <span>•</span>
                      <span>{formatFileSize(document.fileSize)}</span>
                    </>
                  )}
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleDocumentClick(document.id, index)}
                  aria-label={`Open ${document.name}`}
                  className="min-h-[44px] sm:min-h-auto" // Touch target for mobile
                >
                  Open
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDocumentClick(document.id, index)}
                  aria-label={`Open ${document.name} in new context`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity min-h-[44px] sm:min-h-auto"
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}

        {/* Expand/collapse for >5 items */}
        {hasMoreItems && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-center gap-2 mt-2"
            aria-expanded={isExpanded}
            aria-controls={`references-list-${documentId}`}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show all ({referencesWithMetadata.length})
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentReferences;