import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Home, Search, Bell, LogOut, Settings, Shield } from "lucide-react";
import { Link } from "wouter";
import type { User } from "@shared/schema";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function Header({ searchQuery, onSearchChange }: HeaderProps) {
  const { user } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) return firstName[0].toUpperCase();
    if ((user as any)?.email) return (user as any).email[0].toUpperCase();
    return "U";
  };

  const getDisplayName = () => {
    if ((user as any)?.firstName && (user as any)?.lastName) {
      return `${(user as any).firstName} ${(user as any).lastName}`;
    }
    if ((user as any)?.firstName) return (user as any).firstName;
    return (user as any)?.email || "User";
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <div className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity">
                <Home className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold text-slate-900">MyHome</h1>
              </div>
            </Link>
          </div>
          
          {/* Search Bar - Hidden on mobile */}
          <div className="flex-1 max-w-2xl mx-8 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Mobile Search Button */}
          <div className="flex items-center space-x-2 md:hidden">
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-2"
              onClick={() => {
                const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
                if (searchInput) {
                  searchInput.focus();
                  searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
            >
              <Search className="h-4 w-4 text-gray-500" />
            </Button>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-2 md:space-x-4">
            <Button variant="ghost" size="sm" className="p-2 hidden md:flex">
              <Bell className="h-4 w-4 text-gray-500" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 p-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={(user as any)?.profileImageUrl} alt="Profile" />
                    <AvatarFallback className="text-sm">
                      {getInitials((user as any)?.firstName, (user as any)?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:block">
                    {getDisplayName()}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <Link href="/settings">
                  <DropdownMenuItem>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                </Link>
                {(user as any)?.role === 'admin' && (
                  <>
                    <DropdownMenuSeparator />
                    <Link href="/admin">
                      <DropdownMenuItem>
                        <Shield className="h-4 w-4 mr-2" />
                        Admin Dashboard
                      </DropdownMenuItem>
                    </Link>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
