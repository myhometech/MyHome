import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Home, Search, Bell, LogOut, Settings, Shield, Mail, Brain } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SmartSearch } from "@/components/smart-search";
import { EnhancedDocumentViewer } from "@/components/enhanced-document-viewer";
import type { User, Document } from "@shared/schema";
import { useState } from "react";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function Header({ searchQuery, onSearchChange }: HeaderProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  
  // Get notification count for imported documents
  const { data: importedDocsCount = 0 } = useQuery<number>({
    queryKey: ["/api/documents/imported-count"],
    refetchInterval: 30000, // Check every 30 seconds
    retry: false,
  });

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        window.location.href = "/";
      }
    } catch (error) {
      console.error("Logout error:", error);
      window.location.href = "/api/logout"; // Fallback to GET route
    }
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
          <div className="flex items-center space-x-6">
            <Link href="/">
              <div className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity">
                <Home className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold text-slate-900">MyHome</h1>
              </div>
            </Link>
            {/* TICKET 10: Add AI Insights to primary navigation */}
            <nav className="hidden md:flex items-center space-x-2">
              <Link href="/">
                <Button 
                  variant={location === "/" ? "default" : "ghost"} 
                  size="sm" 
                  className={location === "/" ? "" : "text-gray-600 hover:text-gray-900"}
                >
                  <Home className="h-4 w-4 mr-2" />
                  Documents
                </Button>
              </Link>
              <Link href="/insights">
                <Button 
                  variant={location === "/insights" ? "default" : "ghost"} 
                  size="sm" 
                  className={location === "/insights" ? "" : "text-gray-600 hover:text-gray-900"}
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Insights
                </Button>
              </Link>
            </nav>
          </div>
          
          {/* Search Bar - Hidden on mobile */}
          <div className="flex-1 max-w-2xl mx-8 hidden md:block">
            <div className="flex gap-2">
              <div className="flex-1">
                <SmartSearch
                  onDocumentSelect={(document) => {
                    console.log('Document selected from search:', document);
                    // Convert the document to match DocumentPreview interface  
                    const previewDocument = {
                      id: document.id,
                      name: document.name,
                      fileName: document.fileName,
                      filePath: document.filePath,
                      mimeType: document.mimeType,
                      fileSize: document.fileSize,
                      extractedText: document.extractedText,
                      summary: document.summary,
                      uploadedAt: document.uploadedAt ? document.uploadedAt.toString() : new Date().toISOString(),
                      expiryDate: document.expiryDate ? document.expiryDate.toString() : null
                    };
                    setSelectedDocument(previewDocument);
                  }}
                  onSearchChange={onSearchChange}
                  placeholder="Search documents..."
                />
              </div>
              {/* Debug button - temporary */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log('Test modal button clicked');
                  setSelectedDocument({
                    id: 999,
                    name: "Test Document",
                    fileName: "test.pdf",
                    filePath: "/test/path",
                    mimeType: "application/pdf",
                    fileSize: 12345,
                    extractedText: "Test content",
                    summary: "Test summary",
                    uploadedAt: new Date().toISOString(),
                    expiryDate: null
                  });
                }}
                className="bg-red-100 text-red-800"
              >
                Test Modal
              </Button>
            </div>
          </div>

          {/* Mobile Navigation and Search */}
          <div className="flex items-center space-x-2 md:hidden">
            <Link href="/">
              <Button 
                variant={location === "/" ? "default" : "ghost"} 
                size="sm" 
                className="p-2"
              >
                <Home className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/insights">
              <Button 
                variant={location === "/insights" ? "default" : "ghost"} 
                size="sm" 
                className="p-2"
              >
                <Brain className="h-4 w-4" />
              </Button>
            </Link>
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
            {/* Email import notification */}
            <div className="relative hidden md:flex">
              <Button variant="ghost" size="sm" className="p-2 relative">
                <Mail className="h-4 w-4 text-gray-500" />
                {importedDocsCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center p-0 text-[10px] min-w-[16px]"
                  >
                    {importedDocsCount}
                  </Badge>
                )}
              </Button>
            </div>
            
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
                <Link href="/insights">
                  <DropdownMenuItem>
                    <Brain className="h-4 w-4 mr-2" />
                    AI Insights
                  </DropdownMenuItem>
                </Link>
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
      
      {/* Enhanced Document Viewer Modal */}
      {selectedDocument && (
        <EnhancedDocumentViewer
          document={selectedDocument}
          onClose={() => {
            console.log('Closing document viewer modal');
            setSelectedDocument(null);
          }}
          onUpdate={() => {
            console.log('Document updated, refreshing');
            setSelectedDocument(null);
          }}
        />
      )}
    </header>
  );
}
