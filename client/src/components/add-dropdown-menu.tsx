import { useState } from "react";
import { Plus, Upload, Calendar, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import UnifiedUploadButton from "@/components/unified-upload-button";
import { ManualEventModal } from "@/components/manual-event-modal";

import ScanDocumentFlow from "@/components/scan-document-flow";
import { trackAddMenuSelection } from "@/lib/analytics";

interface AddDropdownMenuProps {
  /** Optional context for prefilling modals (e.g., selected house/vehicle) */
  selectedAssetId?: string;
  selectedAssetName?: string;
  /** Callback when document upload is initiated */
  onDocumentUpload?: () => void;
  /** Callback when manual date creation is initiated */
  onManualDateCreate?: () => void;
  /** Custom CSS classes */
  className?: string;
  /** Button size variant */
  size?: "default" | "sm" | "lg" | "icon";
  /** Button style variant */
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

export function AddDropdownMenu({
  selectedAssetId,
  selectedAssetName,
  onDocumentUpload,
  onManualDateCreate,
  className = "",
  size = "default",
  variant = "default"
}: AddDropdownMenuProps) {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showManualDateDialog, setShowManualDateDialog] = useState(false);
  const [showScanFlow, setShowScanFlow] = useState(false);

  // TICKET 8: Track scan document selection
  const handleScanDocument = () => {
    trackAddMenuSelection('scan_document', {
      selectedAssetId,
      selectedAssetName
    });
    setShowScanFlow(true);
  };

  const handleDocumentUpload = () => {
    trackAddMenuSelection('document_upload');
    setShowUploadDialog(true);
    onDocumentUpload?.();
  };

  const handleManualDateCreate = () => {
    trackAddMenuSelection('important_date');
    setShowManualDateDialog(true);
    onManualDateCreate?.();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant={variant} 
            size={size} 
            className={`${className}`}
            aria-label="Add new item - document or important date"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent 
          align="end" 
          className="w-48"
          sideOffset={5}
        >
          <DropdownMenuItem 
            onClick={handleManualDateCreate}
            className="cursor-pointer focus:bg-accent focus:text-accent-foreground"
          >
            <Calendar className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">Add Important Date</span>
              <span className="text-xs text-muted-foreground">Track renewals, taxes, etc.</span>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={handleDocumentUpload}
            className="cursor-pointer focus:bg-accent focus:text-accent-foreground"
          >
            <Upload className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">Upload Document</span>
              <span className="text-xs text-muted-foreground">PDF, images, existing files</span>
            </div>
          </DropdownMenuItem>
          
          {/* TICKET 7: New browser-native scanner */}
          <DropdownMenuItem 
            onClick={handleScanDocument}
            className="cursor-pointer focus:bg-accent focus:text-accent-foreground"
          >
            <Camera className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">Scan Document</span>
              <span className="text-xs text-muted-foreground">Browser-native multi-page scanning</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Document Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <UnifiedUploadButton onUpload={() => setShowUploadDialog(false)} suppressDialog={true} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Event Modal */}
      <ManualEventModal
        isOpen={showManualDateDialog}
        onClose={() => setShowManualDateDialog(false)}
        selectedAssetId={selectedAssetId}
        selectedAssetName={selectedAssetName}
      />
      
      {/* TICKET 7: Browser-native scanner flow */}
      <ScanDocumentFlow
        isOpen={showScanFlow}
        onClose={() => setShowScanFlow(false)}
        onCapture={(files) => {
          setShowScanFlow(false);
          onDocumentUpload?.();
        }}
      />
    </>
  );
}

export default AddDropdownMenu;