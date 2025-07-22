import { Link, useLocation } from "wouter";
import { Home, Users, FileText, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { Document } from "@shared/schema";

export function Navigation() {
  const [location] = useLocation();
  
  // Get shared documents count
  const { data: sharedDocuments = [] } = useQuery<Document[]>({
    queryKey: ["/api/shared-with-me"],
  });

  const navigationItems = [
    {
      href: "/",
      label: "My Documents",
      icon: Home,
      isActive: location === "/",
    },
    {
      href: "/shared-with-me",
      label: "Shared with Me",
      icon: Users,
      isActive: location === "/shared-with-me",
      badge: sharedDocuments.length > 0 ? sharedDocuments.length : undefined,
    },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/">
          <div className="flex items-center space-x-1 cursor-pointer hover:opacity-80 transition-opacity">
            <FileText className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">MyHome</span>
          </div>
        </Link>
        
        <div className="flex items-center space-x-1">
          {navigationItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={item.isActive ? "default" : "ghost"}
                size="sm"
                className="relative"
              >
                <item.icon className="h-4 w-4 mr-2" />
                {item.label}
                {item.badge && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {item.badge}
                  </Badge>
                )}
              </Button>
            </Link>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.location.href = "/api/logout"}
          className="text-gray-600 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </nav>
  );
}