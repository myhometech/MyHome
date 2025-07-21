import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Share, Trash2, FileText, Image, X } from "lucide-react";

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
  uploadedAt: string;
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold">{document.name}</DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                {category?.name || "Uncategorized"} • {formatFileSize(document.fileSize)} • Uploaded {formatDate(document.uploadedAt)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="overflow-y-auto flex-1">
          {/* Document Preview */}
          <div className="bg-gray-100 rounded-lg p-8 text-center mb-6">
            {getFileIcon()}
            <h3 className="text-lg font-medium mt-4 mb-2">{document.fileName}</h3>
            <p className="text-gray-500 mb-4">
              {document.mimeType.startsWith('image/') ? 'Image Document' : 'PDF Document'}
            </p>
            
            {/* Preview would go here - for now showing placeholder */}
            <div className="bg-white rounded border-2 border-dashed border-gray-300 p-8 text-gray-500">
              Document preview would be displayed here
            </div>
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
              </div>
            </div>

            {/* Tags */}
            {document.tags && document.tags.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-2">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {document.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
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
