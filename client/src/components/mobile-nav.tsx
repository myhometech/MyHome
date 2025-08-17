
import { Button } from "@/components/ui/button";
import { Home, Camera, Search, User } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function MobileNav() {
  const [location] = useLocation();

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
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-40 safe-area-padding">
      <div className="grid grid-cols-4 h-16">
        <Link href="/">
          <Button
            variant="ghost"
            className={`flex flex-col items-center justify-center space-y-1 h-full rounded-none ${
              location === "/" ? "text-primary bg-blue-50" : "text-gray-500 hover:text-primary"
            } transition-colors`}
          >
            <Home className="h-5 w-5" />
            <span className="text-xs font-medium">Smart Tips</span>
          </Button>
        </Link>
        
        <Button
          variant="ghost"
          onClick={handleCameraClick}
          className="flex flex-col items-center justify-center space-y-1 text-gray-500 hover:text-primary transition-colors h-full rounded-none"
        >
          <Camera className="h-5 w-5" />
          <span className="text-xs">Add Document</span>
        </Button>
        
        <Button
          variant="ghost"
          onClick={handleSearchClick}
          className="flex flex-col items-center justify-center space-y-1 text-gray-500 hover:text-primary transition-colors h-full rounded-none"
        >
          <Search className="h-5 w-5" />
          <span className="text-xs">Search</span>
        </Button>
        
        <Link href="/settings">
          <Button
            variant="ghost"
            className={`flex flex-col items-center justify-center space-y-1 h-full rounded-none ${
              location === "/settings" ? "text-primary bg-blue-50" : "text-gray-500 hover:text-primary"
            } transition-colors`}
          >
            <User className="h-5 w-5" />
            <span className="text-xs">Profile</span>
          </Button>
        </Link>
      </div>
    </nav>
  );
}
