import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  X, 
  Download, 
  FileText, 
  Edit3, 
  Save, 
  XCircle, 
  Calendar, 
  FileIcon, 
  Tag, 
  Clock, 
  User,
  FolderIcon,
  Info,
  MoreHorizontal,
  Image,
  Brain,
  AlertTriangle,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Mail,
  ExternalLink
} from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DocumentInsights } from "@/components/document-insights";
import { Document, Page, pdfjs } from 'react-pdf';

// Set up PDF.js worker with correct extension
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface EnhancedDocumentViewerProps {
  document: {
    id: number;
    name: string;
    mimeType: string;
    fileSize: number;
    categoryId?: number | null;
  };
  category?: {
    id: number;
    name: string;
    icon: string;
    color: string;
  };
  onClose: () => void;
  onDownload: () => void;
  onUpdate?: () => void;
}

interface FullDocumentDetails {
  id: number;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  categoryId?: number;
  tags?: string[];
  expiryDate?: string;
  extractedText?: string;
  summary?: string;
  ocrProcessed?: boolean;
  uploadedAt: string;
  userId: string;
  uploadSource?: string;
  messageId?: string;
  emailContext?: string;
  documentReferences?: string;
}

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

export function EnhancedDocumentViewer({ document, category: propCategory, onClose, onDownload, onUpdate }: EnhancedDocumentViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [useReactPdf, setUseReactPdf] = useState(false);
  const [pdfLoadTimeout, setPdfLoadTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch full document details
  const { data: fullDocument, isLoading: isLoadingDetails } = useQuery<FullDocumentDetails>({
    queryKey: [`/api/documents/${document.id}`],
    queryFn: async (): Promise<FullDocumentDetails> => {
      const response = await fetch(`/api/documents/${document.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch document details');
      return response.json();
    }
  });

  // Fetch categories for display
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
    queryFn: async (): Promise<Category[]> => {
      const response = await fetch('/api/categories', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    }
  });

  const category = propCategory || categories.find(c => c.id === fullDocument?.categoryId);

  // Initialize edit values when document data loads
  useEffect(() => {
    if (fullDocument) {
      setEditName(fullDocument.name);
      setEditExpiryDate(fullDocument.expiryDate || "");
    }
  }, [fullDocument]);

  // Document update mutation
  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, name, expiryDate }: { id: number; name: string; expiryDate: string | null }) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expiryDate }),
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to update document');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document updated",
        description: "The document details have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${document.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setIsEditing(false);
      onUpdate?.();
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast({
        title: "Update failed", 
        description: "Failed to update document. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const isImage = () => document.mimeType.startsWith('image/');
  const isPDF = () => document.mimeType === 'application/pdf';
  const getPreviewUrl = () => `/api/documents/${document.id}/preview`;

  const handleStartEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const hasNameChange = editName.trim() !== fullDocument?.name;
    const hasExpiryChange = editExpiryDate !== (fullDocument?.expiryDate || "");
    
    if (hasNameChange || hasExpiryChange) {
      updateDocumentMutation.mutate({ 
        id: document.id, 
        name: editName.trim(), 
        expiryDate: editExpiryDate || null 
      });
    } else {
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(fullDocument?.name || document.name);
    setEditExpiryDate(fullDocument?.expiryDate || "");
    setIsEditing(false);
  };

  // Email Body PDF functionality
  const renderEmailToPdfMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await fetch('/api/email/render-to-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create email PDF');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.created ? "Email saved as PDF" : "Email PDF already exists",
        description: data.created 
          ? `Created PDF with ${data.linkedCount} linked documents`
          : "Opening existing email PDF",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      // Could optionally navigate to the email PDF document
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create email PDF",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Check if document is from email and can show "Store email as PDF" action
  const canStoreEmailAsPdf = () => {
    return fullDocument?.uploadSource === 'email' && 
           fullDocument?.messageId && 
           !hasEmailBodyReference();
  };

  // Check if document already has email body reference
  const hasEmailBodyReference = () => {
    if (!fullDocument?.documentReferences) return false;
    try {
      const refs = JSON.parse(fullDocument.documentReferences);
      return refs.some((ref: any) => ref.type === 'email' && ref.relation === 'source');
    } catch {
      return false;
    }
  };

  // Parse and display document references
  const getDocumentReferences = () => {
    if (!fullDocument?.documentReferences) return [];
    try {
      return JSON.parse(fullDocument.documentReferences);
    } catch {
      return [];
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
      month: "long", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Initialize loading state for preview
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
      if (!error) {
        setError('Document loading took too long. Please try again.');
      }
    }, 5000);
    
    // For images, preload to ensure they work
    if (isImage()) {
      const img = new (globalThis as any).Image();
      img.onload = () => {
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      };
      img.onerror = () => {
        setError('Failed to load image');
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      };
      img.src = getPreviewUrl();
    } else {
      // For non-images, just stop loading immediately
      setIsLoading(false);
      clearTimeout(safetyTimeout);
    }
    
    return () => {
      clearTimeout(safetyTimeout);
    };
  }, [document.id, error]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Mobile-first responsive layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Document Preview Section */}
        <div className="flex-1 flex flex-col min-h-0 lg:w-2/3">
          {/* Preview Header */}
          <div className="flex items-center justify-between p-3 border-b bg-gray-50">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="font-medium text-sm truncate">Preview</span>
            </div>
            <div className="flex items-center gap-1">
              <Button 
                onClick={onDownload} 
                variant="outline" 
                size="sm" 
                className="text-xs preview-download-btn"
              >
                <Download className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </div>
          </div>

          {/* Preview Content */}
          <div className="flex-1 p-2 sm:p-4 overflow-auto bg-gray-100">
            {isLoading && (
              <div className="flex items-center justify-center h-full bg-white rounded-lg">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading document...</p>
                </div>
              </div>
            )}
            
            {error && (
              <div className="flex items-center justify-center h-full bg-white rounded-lg">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium">Preview failed</p>
                  <p className="text-sm text-gray-600 mb-4">{error}</p>
                  <Button onClick={onDownload} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download Instead
                  </Button>
                </div>
              </div>
            )}

            {!isLoading && !error && isImage() && (
              <div className="flex items-center justify-center h-full bg-white rounded-lg p-4">
                <img
                  src={getPreviewUrl()}
                  alt={document.name}
                  className="max-w-full max-h-full object-contain rounded"
                />
              </div>
            )}

            {!isLoading && !error && isPDF() && (
              <div className="h-full bg-white rounded-lg">
                <div className="flex items-center justify-between p-2 border-b bg-gray-50">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium">PDF Document</span>
                    {numPages && (
                      <Badge variant="outline" className="text-xs">
                        {numPages} pages
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {useReactPdf && numPages && numPages > 1 && (
                      <div className="flex items-center gap-1">
                        <Button
                          onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                          disabled={pageNumber <= 1}
                          variant="outline"
                          size="sm"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </Button>
                        <span className="text-xs px-2">
                          {pageNumber} / {numPages}
                        </span>
                        <Button
                          onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                          disabled={pageNumber >= numPages}
                          variant="outline"
                          size="sm"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    <Button
                      onClick={() => {
                        // Clear any existing timeout
                        if (pdfLoadTimeout) {
                          clearTimeout(pdfLoadTimeout);
                        }
                        
                        setUseReactPdf(!useReactPdf);
                        if (!useReactPdf) {
                          setPageNumber(1);
                          setNumPages(null);
                          
                          // Set a timeout to fall back if loading takes too long
                          const timeout = setTimeout(() => {
                            console.log('PDF loading timeout - falling back to browser view');
                            setUseReactPdf(false);
                            toast({
                              title: "Loading timeout",
                              description: "Using browser view instead",
                            });
                          }, 10000); // 10 second timeout
                          
                          setPdfLoadTimeout(timeout);
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      {useReactPdf ? 'Browser View' : 'Page View'}
                    </Button>
                    <Button
                      onClick={onDownload}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span className="text-xs">Download</span>
                    </Button>
                  </div>
                </div>
                
                {useReactPdf ? (
                  <div className="h-full overflow-auto bg-gray-100 p-4" style={{ height: 'calc(100% - 60px)' }}>
                    <div className="flex justify-center">
                      <Document
                        file={getPreviewUrl()}
                        onLoadSuccess={({ numPages }) => {
                          // Clear timeout on successful load
                          if (pdfLoadTimeout) {
                            clearTimeout(pdfLoadTimeout);
                            setPdfLoadTimeout(null);
                          }
                          setNumPages(numPages);
                          console.log(`📄 PDF loaded successfully with ${numPages} pages`);
                        }}
                        onLoadError={(error) => {
                          // Clear timeout on error
                          if (pdfLoadTimeout) {
                            clearTimeout(pdfLoadTimeout);
                            setPdfLoadTimeout(null);
                          }
                          console.error('PDF load error:', error);
                          toast({
                            title: "Enhanced view failed",
                            description: "Using browser view instead",
                          });
                          setUseReactPdf(false);
                        }}
                        error={
                          <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                              <p className="text-sm text-gray-600">Failed to load PDF</p>
                              <Button 
                                onClick={() => setUseReactPdf(false)}
                                variant="outline" 
                                size="sm" 
                                className="mt-2"
                              >
                                Use Browser View
                              </Button>
                            </div>
                          </div>
                        }
                        loading={
                          <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                              <FileText className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                              <p className="text-sm text-gray-600">Loading PDF...</p>
                              <Button 
                                onClick={() => setUseReactPdf(false)}
                                variant="ghost" 
                                size="sm" 
                                className="mt-2"
                              >
                                Cancel & Use Browser View
                              </Button>
                            </div>
                          </div>
                        }
                      >
                        <Page
                          pageNumber={pageNumber}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          className="shadow-lg"
                          width={Math.min(600, window.innerWidth - 150)}
                        />
                      </Document>
                    </div>
                  </div>
                ) : (
                  <iframe
                    src={`${getPreviewUrl()}#toolbar=1&navpanes=1&scrollbar=1`}
                    className="w-full h-full border-0 rounded-lg"
                    title={document.name}
                    style={{ height: 'calc(100% - 60px)' }}
                    allow="fullscreen"
                  />
                )}
              </div>
            )}

            {!isLoading && !error && !isImage() && !isPDF() && (
              <div className="flex items-center justify-center h-full bg-white rounded-lg">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium">Preview not available</p>
                  <p className="text-sm text-gray-600 mb-4">File type: {document.mimeType}</p>
                  <Button onClick={onDownload} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download File
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Document Properties Panel - Mobile Tab Layout */}
        <div className="lg:w-1/3 lg:border-l bg-gray-50 flex flex-col min-h-0">
          <Tabs defaultValue="properties" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2 mx-3 mt-3">
              <TabsTrigger value="properties" className="text-xs">
                <Info className="w-3 h-3 mr-1" />
                Properties
              </TabsTrigger>
              <TabsTrigger value="insights" className="text-xs">
                <Brain className="w-3 h-3 mr-1" />
                Insights
              </TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="flex-1 m-0 flex flex-col">
              <div className="flex items-center justify-between p-3 border-b bg-white">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-sm">Document Info</span>
                </div>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleStartEdit}>
                        <Edit3 className="w-3 h-3 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {canStoreEmailAsPdf() && (
                        <DropdownMenuItem 
                          onClick={() => renderEmailToPdfMutation.mutate(document.id)}
                          disabled={renderEmailToPdfMutation.isPending}
                        >
                          <Mail className="w-3 h-3 mr-2" />
                          Store email as PDF
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex-1 p-3 ios-scroll">
                <div className="space-y-3">
                  {/* Basic Information */}
                  <Card className="border-0 shadow-none bg-white">
                    <CardHeader className="pb-2 px-3 pt-3">
                      <CardTitle className="text-xs font-medium text-gray-700">Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 px-3 pb-3">
                      {isEditing ? (
                        <div>
                          <Label htmlFor="edit-name" className="text-xs text-gray-600">Document Name</Label>
                          <Input
                            id="edit-name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="mt-1 text-xs"
                            placeholder="Enter document name"
                          />
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs text-gray-600">Document Name</Label>
                          <p className="text-xs font-medium mt-1">{fullDocument?.name || document.name}</p>
                        </div>
                      )}

                      <div>
                        <Label className="text-xs text-gray-600">File Name</Label>
                        <p className="text-xs mt-1">{fullDocument?.fileName || 'Loading...'}</p>
                      </div>

                      <div>
                        <Label className="text-xs text-gray-600">File Type</Label>
                        <p className="text-xs mt-1">{document.mimeType}</p>
                      </div>

                      <div>
                        <Label className="text-xs text-gray-600">File Size</Label>
                        <p className="text-xs mt-1">{formatFileSize(document.fileSize)}</p>
                      </div>

                      {category && (
                        <div>
                          <Label className="text-xs text-gray-600">Category</Label>
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs">
                              {category.name}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {isEditing ? (
                        <div>
                          <Label htmlFor="edit-expiry" className="text-xs text-gray-600">Important Date</Label>
                          <Input
                            id="edit-expiry"
                            type="date"
                            value={editExpiryDate}
                            onChange={(e) => setEditExpiryDate(e.target.value)}
                            className="mt-1 text-xs"
                          />
                        </div>
                      ) : fullDocument?.expiryDate && (
                        <div>
                          <Label className="text-xs text-gray-600">Important Date</Label>
                          <p className="text-xs mt-1">{new Date(fullDocument.expiryDate).toLocaleDateString()}</p>
                        </div>
                      )}

                      {fullDocument?.uploadedAt && (
                        <div>
                          <Label className="text-xs text-gray-600">Uploaded</Label>
                          <p className="text-xs mt-1">{formatDate(fullDocument.uploadedAt)}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Document References */}
                  {fullDocument && getDocumentReferences().length > 0 && (
                    <Card className="border-0 shadow-none bg-white">
                      <CardHeader className="pb-2 px-3 pt-3">
                        <CardTitle className="text-xs font-medium text-gray-700">
                          References ({getDocumentReferences().length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 px-3 pb-3">
                        {getDocumentReferences().map((ref: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                            <div className="flex items-center gap-2">
                              <Mail className="w-3 h-3 text-blue-600" />
                              <div>
                                <p className="text-xs font-medium">
                                  {ref.relation === 'source' ? 'Email body (PDF)' : 
                                   ref.relation === 'attachment' ? 'Email attachment' : 'Related document'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {new Date(ref.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                // Would navigate to the referenced document
                                console.log('Navigate to document:', ref.documentId);
                              }}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Processing Information */}
                  {fullDocument && (
                    <Card className="border-0 shadow-none bg-white">
                      <CardHeader className="pb-2 px-3 pt-3">
                        <CardTitle className="text-xs font-medium text-gray-700">Processing Status</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 px-3 pb-3">
                        <div>
                          <Label className="text-xs text-gray-600">OCR Processed</Label>
                          <p className="text-xs mt-1">
                            <Badge variant={fullDocument.ocrProcessed ? "default" : "secondary"} className="text-xs">
                              {fullDocument.ocrProcessed ? "Yes" : "No"}
                            </Badge>
                          </p>
                        </div>

                        {fullDocument.summary && (
                          <div>
                            <Label className="text-xs text-gray-600">AI Summary</Label>
                            <div className="mt-1 p-2 bg-blue-50 rounded-md">
                              <p className="text-xs">{fullDocument.summary}</p>
                            </div>
                          </div>
                        )}

                        {fullDocument.uploadSource === 'email' && (
                          <div>
                            <Label className="text-xs text-gray-600">Source</Label>
                            <p className="text-xs mt-1">
                              <Badge variant="outline" className="text-xs">
                                <Mail className="w-2 h-2 mr-1" />
                                Email Import
                              </Badge>
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Edit Actions */}
                  {isEditing && (
                    <div className="flex gap-2 pt-2">
                      <Button 
                        onClick={handleSaveEdit} 
                        className="flex-1 text-xs"
                        size="sm"
                        disabled={updateDocumentMutation.isPending}
                      >
                        <Save className="w-3 h-3 mr-1" />
                        Save
                      </Button>
                      <Button 
                        onClick={handleCancelEdit} 
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={updateDocumentMutation.isPending}
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="insights" className="flex-1 m-0 flex flex-col">
              <div className="flex items-center justify-between p-3 border-b bg-white">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-sm">AI Insights</span>
                </div>
              </div>

              <div 
                ref={scrollContainerRef}
                className="flex-1 p-3 mobile-modal-height insights-scroll-container safe-area-padding"
                onScroll={(e) => {
                  const scrollTop = e.currentTarget.scrollTop;
                  setShowBackToTop(scrollTop > 200);
                }}
              >
                {fullDocument && (
                  <DocumentInsights 
                    documentId={document.id}
                    documentName={fullDocument.name}
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Back to Top Button */}
      {showBackToTop && (
        <Button
          className={`back-to-top-button ${showBackToTop ? '' : 'hidden'}`}
          size="sm"
          onClick={() => {
            scrollContainerRef.current?.scrollTo({
              top: 0,
              behavior: 'smooth'
            });
          }}
          variant="outline"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}