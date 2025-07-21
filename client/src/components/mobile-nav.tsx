import { Button } from "@/components/ui/button";
import { Home, Camera, Search, Settings } from "lucide-react";

export default function MobileNav() {
  const handleCameraClick = () => {
    // Trigger the upload zone camera functionality
    const uploadZone = document.querySelector('[data-upload-zone]');
    if (uploadZone) {
      uploadZone.scrollIntoView({ behavior: 'smooth' });
      // Then trigger camera
      setTimeout(() => {
        const cameraButton = document.querySelector('[data-camera-btn]') as HTMLButtonElement;
        if (cameraButton) {
          cameraButton.click();
        }
      }, 500);
    }
  };

  const handleSearchClick = () => {
    const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-40">
      <div className="grid grid-cols-4 h-16">
        <Button
          variant="ghost"
          className="flex flex-col items-center justify-center space-y-1 text-primary h-full rounded-none"
        >
          <Home className="h-5 w-5" />
          <span className="text-xs font-medium">Home</span>
        </Button>
        
        <Button
          variant="ghost"
          onClick={handleCameraClick}
          className="flex flex-col items-center justify-center space-y-1 text-gray-500 hover:text-primary transition-colors h-full rounded-none"
        >
          <Camera className="h-5 w-5" />
          <span className="text-xs">Scan</span>
        </Button>
        
        <Button
          variant="ghost"
          onClick={handleSearchClick}
          className="flex flex-col items-center justify-center space-y-1 text-gray-500 hover:text-primary transition-colors h-full rounded-none"
        >
          <Search className="h-5 w-5" />
          <span className="text-xs">Search</span>
        </Button>
        
        <Button
          variant="ghost"
          className="flex flex-col items-center justify-center space-y-1 text-gray-500 hover:text-primary transition-colors h-full rounded-none"
        >
          <Settings className="h-5 w-5" />
          <span className="text-xs">Settings</span>
        </Button>
      </div>
    </nav>
  );
}
