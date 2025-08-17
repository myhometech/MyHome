import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Home, 
  Lightbulb,
  User,
  Settings
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

export function Header() {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-6">
            <Link href="/">
              <div className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity">
                <Home className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold text-slate-900">MyHome</h1>
              </div>
            </Link>

            {/* Simplified Desktop Navigation */}
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

          {/* User Profile */}
          <div className="flex items-center space-x-3">
            {user && (
              <Link href="/settings">
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">
                    {(user as any)?.firstName || 'Profile'}
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