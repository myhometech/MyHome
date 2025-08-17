import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Home, 
  Lightbulb,
  User,
  Settings,
  Search,
  Mail,
  Copy
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { MobileHamburgerMenu } from '@/components/mobile-hamburger-menu';

interface HeaderProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Header({ searchQuery = '', onSearchChange }: HeaderProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // Email forwarding functionality - use the correct formats expected by Mailgun
  const getEmailAddress = () => {
    if (user && (user as any).id) {
      // Use the production format: u[userID]@uploads.myhome-tech.com
      // This matches the format expected by extractUserIdFromRecipient function
      return `u${(user as any).id}@uploads.myhome-tech.com`;
    }
    return 'upload@myhome-tech.com'; // Generic fallback
  };

  const copyEmailToClipboard = async () => {
    const emailAddress = getEmailAddress();
    console.log('Attempting to copy email:', emailAddress);
    
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }
      
      await navigator.clipboard.writeText(emailAddress);
      console.log('Email successfully copied to clipboard');
      toast({
        title: "Copied to clipboard",
        description: "Email address copied successfully",
      });
    } catch (error) {
      console.error('Failed to copy email:', error);
      
      // Fallback method for older browsers
      try {
        const textArea = document.createElement('textarea');
        textArea.value = emailAddress;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
        
        toast({
          title: "Copied to clipboard",
          description: "Email address copied successfully",
        });
      } catch (fallbackError) {
        toast({
          title: "Copy failed",
          description: `Please copy manually: ${emailAddress}`,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Logo and Mobile hamburger menu */}
          <div className="flex items-center space-x-4">
            {/* Mobile Hamburger Menu */}
            <div className="md:hidden">
              <MobileHamburgerMenu />
            </div>
            
            <Link href="/">
              <div className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity">
                <Home className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold text-slate-900">MyHome</h1>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-2">
              <Link href="/">
                <Button 
                  variant={location === "/" ? "default" : "ghost"} 
                  size="sm" 
                  className={location === "/" ? "" : "text-gray-600 hover:text-gray-900"}
                >
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Smart Tips
                </Button>
              </Link>
              <Link href="/settings">
                <Button 
                  variant={location === "/settings" ? "default" : "ghost"} 
                  size="sm"
                  className={location === "/settings" ? "" : "text-gray-600 hover:text-gray-900"}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </Link>
            </nav>
          </div>

          {/* Center - Search Bar */}
          <div className="flex-1 max-w-lg mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pl-10 pr-4 w-full"
              />
            </div>
          </div>

          {/* Right side - Email and User Profile */}
          <div className="flex items-center space-x-3">
            {/* Email forwarding button - always show */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyEmailToClipboard()}
              className="flex items-center space-x-2"
              title="Copy email address for document forwarding"
            >
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Email</span>
            </Button>
            
            {user && (
              <Link href="/settings">
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">
                    {user && typeof user === 'object' && 'firstName' in user ? (user as any).firstName : 'Profile'}
                  </span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;