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

  // Get forwarding address for email functionality
  const { data: forwardingInfo } = useQuery<{
    address: string;
    instructions: string;
  }>({
    queryKey: ["/api/email/forwarding-address"],
  });

  const copyEmailToClipboard = async () => {
    if (!forwardingInfo?.address) return;
    
    try {
      await navigator.clipboard.writeText(forwardingInfo.address);
      toast({
        title: "Email copied!",
        description: "Forward documents to this address",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy manually: " + forwardingInfo.address,
        variant: "destructive",
      });
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
            {/* Email forwarding button */}
            {forwardingInfo?.address && (
              <Button
                variant="ghost"
                size="sm"
                onClick={copyEmailToClipboard}
                className="flex items-center space-x-2"
                title="Copy email address for document forwarding"
              >
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline text-sm">Email</span>
              </Button>
            )}
            
            {user && (
              <Link href="/settings">
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">
                    {(user as Record<string, any>)?.firstName || 'Profile'}
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