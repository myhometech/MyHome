
import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/header";
import { EnhancedDocumentViewer } from "@/components/enhanced-document-viewer";
import { Loader2, ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Document {
  id: number;
  userId: string;
  categoryId: number | null;
  name: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  tags: string[] | null;
  extractedText: string | null;
  summary: string | null;
  ocrProcessed: boolean | null;
  uploadedAt: string;
  expiryDate: string | null;
}

export default function DocumentPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const documentId = params.id;

  console.log(`[DOCUMENT-PAGE] Loading document ${documentId}`);

  const { data: document, isLoading, error } = useQuery<Document>({
    queryKey: [`/api/documents/${documentId}`],
    enabled: !!documentId,
    retry: false,
  });

  // Simple error handling - show toast and redirect
  useEffect(() => {
    if (error) {
      console.error(`[DOCUMENT-PAGE] Error loading document ${documentId}:`, error);
      toast({
        title: "Document not found",
        description: "This document may have been deleted or moved.",
        variant: "destructive",
      });

      const timer = setTimeout(() => {
        setLocation('/');
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [error, setLocation, toast, documentId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <div className="flex items-center justify-center h-96">
          <div className="flex items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading document...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !document) {
    console.log(`[DOCUMENT-PAGE] Document ${documentId} not found or error occurred`);
    return (
      <div className="min-h-screen bg-gray-50">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <div className="flex items-center justify-center h-96">
          <div className="text-center max-w-md mx-auto px-4">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-xl font-semibold mb-3">Document Not Found</h2>
            <p className="text-gray-600 mb-6 leading-relaxed">
              The document you're looking for is no longer available. It may have been deleted or moved.
            </p>
            <div className="space-x-3">
              <Button onClick={() => setLocation('/')} variant="default">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Insights
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  console.log(`[DOCUMENT-PAGE] Successfully loaded document ${documentId}: ${document.name}`);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <div className="w-full">
        <div className="px-4 py-2">
          <Button onClick={() => setLocation('/')} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Insights
          </Button>
        </div>

        <EnhancedDocumentViewer
          document={document}
          onClose={() => setLocation('/')}
          onUpdate={() => window.location.reload()}
          onDownload={() => {
            const link = window.document.createElement('a');
            link.href = `/api/documents/${document.id}/download`;
            link.download = document.fileName;
            link.click();
          }}
        />
      </div>
    </div>
  );
}
