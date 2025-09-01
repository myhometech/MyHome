import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/header";
import { EnhancedDocumentViewer } from "@/components/enhanced-document-viewer";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

export default function DocumentPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const documentId = params.id;

  console.log(`[DOCUMENT-PAGE] DocumentPage component loaded with params:`, params);
  console.log(`[DOCUMENT-PAGE] DocumentId extracted:`, documentId);
  console.log(`[DOCUMENT-PAGE] Current window location:`, window.location.pathname);

  const { data: document, isLoading: documentLoading, error: documentError } = useQuery<Document>({
    queryKey: [`/api/documents/${documentId}`],
    enabled: !!documentId,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  useEffect(() => {
    if (documentError) {
      console.error('Document not found or error loading:', documentError);
      setLocation('/');
    }
  }, [documentError, setLocation]);

  if (documentLoading) {
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

  if (!document) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Document not found</p>
            <Button onClick={() => setLocation('/')} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Documents
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <div className="w-full">
        <div className="px-4 py-2">
          <Button onClick={() => setLocation('/')} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Documents
          </Button>
        </div>
        
        <EnhancedDocumentViewer
          document={document}
          onClose={() => setLocation('/')}
          onUpdate={() => {
            // Refresh document data when updated
            window.location.reload();
          }}
          onDownload={() => {
            // Create download link for the current document
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