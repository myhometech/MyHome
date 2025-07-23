import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Share, Trash2, FileText, Image, X, Edit2, Save, XCircle } from "lucide-react";
import { SmartTagSuggestions } from "@/components/smart-tag-suggestions";
import OCRSummaryPreview from "@/components/ocr-summary-preview";
import { PDFJSViewer } from "@/components/pdf-js-viewer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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

interface DocumentModalProps {
  document: Document;
  category?: Category;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

export default function DocumentModal({ 
  document, 
  category, 
  isOpen, 
  onClose, 
  onDownload, 
  onDelete 
}: DocumentModalProps) {
  const [currentTags, setCurrentTags] = useState(document.tags || []);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [editExpiryDate, setEditExpiryDate] = useState(document.expiryDate || "");
  const queryClient = useQueryClient();

  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, name, expiryDate }: { id: number; name: string; expiryDate: string | null }) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expiryDate }),
      });
      if (!response.ok) throw new Error('Failed to update document');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setIsEditing(false);
    },
  });
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

  const getFileIcon = () => {
    if (document.mimeType.startsWith('image/')) {
      return <Image className="h-8 w-8 text-yellow-600" />;
    }
    return <FileText className="h-8 w-8 text-red-600" />;
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.name,
          text: `Document: ${document.name}`,
          url: window.location.href,
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      // Fallback to copying link
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleDeleteConfirm = () => {
    if (confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      onDelete();
      onClose();
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditName(document.name);
    setEditExpiryDate(document.expiryDate || "");
  };

  const handleSaveEdit = () => {
    const hasNameChange = editName.trim() !== document.name;
    const hasExpiryChange = editExpiryDate !== (document.expiryDate || "");
    
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
    setEditName(document.name);
    setEditExpiryDate(document.expiryDate || "");
    setIsEditing(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] md:w-full max-h-[90vh] overflow-hidden mx-2">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-lg font-semibold"
                    placeholder="Document name"
                  />
                  <p className="text-sm text-gray-500">
                    {category?.name || "Uncategorized"} • {formatFileSize(document.fileSize)} • Uploaded {formatDate(document.uploadedAt)}
                  </p>
                </div>
              ) : (
                <div>
                  <DialogTitle className="text-lg font-semibold">{document.name}</DialogTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    {category?.name || "Uncategorized"} • {formatFileSize(document.fileSize)} • Uploaded {formatDate(document.uploadedAt)}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button variant="ghost" size="sm" onClick={handleSaveEdit} disabled={updateDocumentMutation.isPending}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleStartEdit}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="overflow-y-auto flex-1">
          {/* Document Preview */}
          <div className="mb-6">
            {document.mimeType === 'application/pdf' ? (
              <PDFJSViewer 
                documentId={document.id}
                documentName={document.name}
                onDownload={onDownload}
              />
            ) : document.mimeType.startsWith('image/') ? (
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-gray-100">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-gray-600 font-medium">Image Preview</span>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-center bg-white">
                  <img
                    src={`/api/documents/${document.id}/preview`}
                    alt={document.name}
                    className="max-w-full max-h-96 rounded shadow-sm"
                    onError={(e) => {
                      console.error('Image load error:', e);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-gray-100 rounded-lg p-8 text-center">
                {getFileIcon()}
                <h3 className="text-lg font-medium mt-4 mb-2">{document.fileName}</h3>
                <p className="text-gray-500 mb-4">
                  {document.mimeType.startsWith('image/') ? 'Image Document' : 'Document'}
                </p>
                <div className="bg-white rounded border-2 border-dashed border-gray-300 p-8 text-gray-500">
                  Preview not available for this file type
                </div>
              </div>
            )}
          </div>

          {/* Document Details */}
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-sm text-gray-700 mb-2">File Details</h4>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">File Name:</span>
                  <span className="font-medium">{document.fileName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">File Size:</span>
                  <span className="font-medium">{formatFileSize(document.fileSize)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">File Type:</span>
                  <span className="font-medium">{document.mimeType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Category:</span>
                  <span className="font-medium">{category?.name || "Uncategorized"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Upload Date:</span>
                  <span className="font-medium">{formatDate(document.uploadedAt)}</span>
                </div>
                {isEditing ? (
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-gray-500">Expiry Date:</span>
                    <Input
                      type="date"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      className="w-auto text-sm"
                    />
                  </div>
                ) : document.expiryDate ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Expiry Date:</span>
                    <span className="font-medium">{new Date(document.expiryDate).toLocaleDateString()}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* OCR Summary and Insights */}
            <OCRSummaryPreview document={document} className="mb-6" hideExtractedText={true} />

            {/* Tags and AI Suggestions */}
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Document Details</TabsTrigger>
                <TabsTrigger value="smart-tags">Smart Tags</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="mt-4">
                {currentTags && currentTags.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Current Tags</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {currentTags.map((tag, index) => (
                        <Badge key={index} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="smart-tags" className="mt-4">
                <SmartTagSuggestions
                  documentId={document.id}
                  existingTags={currentTags}
                  onTagsUpdated={(newTags) => {
                    setCurrentTags(newTags);
                    // Invalidate relevant queries to refresh data
                    queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
                  }}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Actions */}
          <div className="flex justify-center space-x-4 mt-8 pt-6 border-t">
            <Button 
              onClick={onDownload}
              className="bg-primary hover:bg-blue-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button 
              variant="outline" 
              onClick={handleShare}
              className="border-primary text-primary hover:bg-blue-50"
            >
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button 
              variant="outline"
              onClick={handleDeleteConfirm}
              className="border-red-600 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
