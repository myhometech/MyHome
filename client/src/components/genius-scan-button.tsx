import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ExternalLink, Download, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  launchGeniusScan, 
  detectPlatform, 
  showGeniusScanInstallPrompt,
  GENIUS_SCAN_CONFIG 
} from "@/utils/genius-scan-launcher";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GeniusScanButtonProps {
  /** Button text - defaults to "Scan with Genius Scan" */
  children?: React.ReactNode;
  /** Button variant */
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  /** Button size */
  size?: "default" | "sm" | "lg" | "icon";
  /** Custom className */
  className?: string;
  /** Called when scan is initiated */
  onScanInitiated?: () => void;
  /** Show as icon only */
  iconOnly?: boolean;
  /** Disable the button */
  disabled?: boolean;
}

export function GeniusScanButton({
  children,
  variant = "outline",
  size = "default",
  className = "",
  onScanInitiated,
  iconOnly = false,
  disabled = false
}: GeniusScanButtonProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [installMessage, setInstallMessage] = useState("");
  const { toast } = useToast();

  const platform = detectPlatform();

  const handleScanClick = async () => {
    if (disabled || isLaunching) return;

    setIsLaunching(true);
    onScanInitiated?.();

    try {
      const result = await launchGeniusScan();
      
      if (result.success) {
        if (result.action === 'launched') {
          toast({
            title: "Genius Scan Launched",
            description: result.message,
          });
        } else if (result.action === 'app_store') {
          setInstallMessage(result.message);
          setShowInstallDialog(true);
        }
      } else {
        // Show install dialog for web or failed attempts
        setInstallMessage(result.message);
        setShowInstallDialog(true);
      }
    } catch (error) {
      console.error('Error launching Genius Scan:', error);
      toast({
        title: "Launch Failed",
        description: "Unable to launch Genius Scan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLaunching(false);
    }
  };

  const getButtonContent = () => {
    if (iconOnly) {
      return <Camera className="h-4 w-4" />;
    }

    if (children) {
      return children;
    }

    return (
      <>
        <Camera className="h-4 w-4 mr-2" />
        {isLaunching ? "Launching..." : "Scan with Genius Scan"}
      </>
    );
  };

  const getInstallLinks = () => {
    switch (platform) {
      case 'ios':
        return [
          {
            label: "Download from App Store",
            url: GENIUS_SCAN_CONFIG.iosAppStoreUrl,
            icon: <Download className="h-4 w-4 mr-2" />
          }
        ];
      
      case 'android':
        return [
          {
            label: "Download from Google Play",
            url: GENIUS_SCAN_CONFIG.androidPlayStoreUrl,
            icon: <Download className="h-4 w-4 mr-2" />
          }
        ];
      
      default:
        return [
          {
            label: "iOS App Store",
            url: GENIUS_SCAN_CONFIG.iosAppStoreUrl,
            icon: <Download className="h-4 w-4 mr-2" />
          },
          {
            label: "Google Play Store", 
            url: GENIUS_SCAN_CONFIG.androidPlayStoreUrl,
            icon: <Download className="h-4 w-4 mr-2" />
          }
        ];
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleScanClick}
        disabled={disabled || isLaunching}
        aria-label={iconOnly ? "Scan document with Genius Scan" : undefined}
      >
        {getButtonContent()}
      </Button>

      {/* Install Dialog */}
      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Install Genius Scan
            </DialogTitle>
            <DialogDescription>
              {installMessage}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Why Genius Scan?</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Professional document scanning</li>
                <li>• Automatic edge detection</li>
                <li>• Multi-page PDF creation</li>
                <li>• Advanced image enhancement</li>
              </ul>
            </div>

            <div className="space-y-2">
              {getInstallLinks().map((link, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    window.open(link.url, '_blank');
                    setShowInstallDialog(false);
                  }}
                >
                  {link.icon}
                  {link.label}
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </Button>
              ))}
            </div>

            <p className="text-xs text-center text-muted-foreground mt-4">
              After installing, come back and try scanning again.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default GeniusScanButton;