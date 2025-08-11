import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Mail, 
  FileText, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp,
  RefreshCw,
  AlertCircle
} from "lucide-react";

interface DocumentReference {
  type: string;
  relation: string;
  documentId: number;
  metadata?: {
    messageId?: string;
  };
}

interface ReferencedDocument {
  id: number;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  source: string;
  uploadedAt: string;
  isEmailBodyPdf?: boolean;
  bodyHash?: string;
}

interface DocumentReferencesProps {
  documentId: number;
  references?: DocumentReference[];
  className?: string;
  onDocumentClick?: (documentId: number) => void;
  onNavigate?: (documentId: number) => void;
}

export default function DocumentReferences({ 
  documentId, 
  references: propReferences, 
  className = "",
  onDocumentClick,
  onNavigate 
}: DocumentReferencesProps) {
  const [expanded, setExpanded] = useState(false);
  const [hasViewedReferences, setHasViewedReferences] = useState(false);

  // Fetch references if not provided
  const { data: fetchedReferences, isLoading: referencesLoading, error: referencesError, refetch: refetchReferences } = useQuery<DocumentReference[]>({
    queryKey: [`/api/documents/${documentId}/references`],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/references`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch document references');
      const data = await response.json();
      return data.references || [];
    },
    enabled: !propReferences
  });

  const references = propReferences || fetchedReferences || [];

  // Extract document IDs from references
  const referencedDocIds = references.map(ref => ref.documentId);

  // Fetch referenced document details
  const { data: referencedDocs, isLoading: docsLoading, error: docsError } = useQuery<ReferencedDocument[]>({
    queryKey: [`/api/documents/batch-summary`, referencedDocIds],
    queryFn: async () => {
      if (referencedDocIds.length === 0) return [];
      
      const response = await fetch('/api/documents/batch-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: referencedDocIds }),
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch referenced documents');
      return response.json();
    },
    enabled: referencedDocIds.length > 0
  });

  // Analytics: Track when references are viewed
  useEffect(() => {
    if (references.length > 0 && !hasViewedReferences) {
      console.log(`[ANALYTICS] references_viewed: { documentId: ${documentId}, count: ${references.length} }`);
      setHasViewedReferences(true);
    }
  }, [documentId, references.length, hasViewedReferences]);

  const handleDocumentClick = (referencedDocId: number, referenceType: string) => {
    console.log(`[ANALYTICS] reference_clicked: { documentId: ${documentId}, referencedId: ${referencedDocId}, type: ${referenceType} }`);
    
    // Try both callback methods for flexibility
    if (onDocumentClick) {
      onDocumentClick(referencedDocId);
    } else if (onNavigate) {
      onNavigate(referencedDocId);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { 
      year: "numeric",
      month: "short", 
      day: "numeric"
    });
  };

  const getDocumentIcon = (doc: ReferencedDocument, reference: DocumentReference) => {
    if (reference.type === 'email') {
      return <Mail className="w-4 h-4 text-blue-600" />;
    }
    return <FileText className="w-4 h-4 text-gray-600" />;
  };

  const getDocumentLabel = (doc: ReferencedDocument, reference: DocumentReference) => {
    if (reference.type === 'email') {
      // Check if this is an email body PDF
      if (doc.source === 'email' && (doc.isEmailBodyPdf || doc.bodyHash)) {
        return "Email body (PDF)";
      }
      return "Email attachment";
    }
    return "Related document";
  };

  const getDocumentBadgeColor = (doc: ReferencedDocument, reference: DocumentReference) => {
    if (reference.type === 'email') {
      if (doc.source === 'email' && (doc.isEmailBodyPdf || doc.bodyHash)) {
        return "bg-blue-100 text-blue-800";
      }
      return "bg-green-100 text-green-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  if (references.length === 0 && !referencesLoading) {
    return null; // Don't show the component if no references
  }

  const isLoading = referencesLoading || docsLoading;
  const hasError = referencesError || docsError;
  const displayReferences = expanded ? references : references.slice(0, 5);

  return (
    <Card className={`${className}`}>
      <CardHeader className="pb-3">
        <CardTitle 
          className="text-sm font-medium flex items-center gap-2"
          id={`references-${documentId}`}
        >
          <Mail className="w-4 h-4 text-blue-600" />
          References ({references.length})
        </CardTitle>
      </CardHeader>
      
      <CardContent 
        className="pt-0 space-y-2"
        role="region"
        aria-labelledby={`references-${documentId}`}
      >
        {isLoading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="w-4 h-4" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-1" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="w-6 h-6" />
              </div>
            ))}
          </div>
        )}

        {hasError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-800">Failed to load references</p>
              <p className="text-xs text-red-600">Please try again</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchReferences()}
              className="text-red-600 hover:text-red-700"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}

        {!isLoading && !hasError && references.length === 0 && (
          <p className="text-sm text-gray-500 py-2">No references yet.</p>
        )}

        {!isLoading && !hasError && referencedDocs && (
          <div className="space-y-1">
            {displayReferences.map((reference, index) => {
              const doc = referencedDocs.find(d => d.id === reference.documentId);
              if (!doc) return null;

              const label = getDocumentLabel(doc, reference);
              const icon = getDocumentIcon(doc, reference);
              const badgeColor = getDocumentBadgeColor(doc, reference);

              return (
                <div
                  key={`${reference.documentId}-${index}`}
                  className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg group transition-colors"
                  role="listitem"
                >
                  <div className="flex-shrink-0">
                    {icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate">
                        {doc.name}
                      </p>
                      <Badge 
                        variant="secondary" 
                        className={`text-xs px-2 py-0 ${badgeColor}`}
                      >
                        {label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{formatDate(doc.uploadedAt)}</span>
                      <span>•</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDocumentClick(doc.id, reference.type)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                    aria-label={`Open ${doc.name}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Expand/Collapse for >5 references */}
        {references.length > 5 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full mt-2 text-xs text-gray-600 hover:text-gray-800"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" />
                Show all ({references.length})
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}