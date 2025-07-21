import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Navigation } from "@/components/navigation";
import DocumentCard from "@/components/document-card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, Clock, Calendar, FileText } from "lucide-react";
import type { Document } from "@shared/schema";

export default function ExpiryDocuments() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [expiryFilter, setExpiryFilter] = useState<'expired' | 'expiring-soon' | 'this-month' | null>(null);

  // Extract filter from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('filter') as 'expired' | 'expiring-soon' | 'this-month' | null;
    setExpiryFilter(filter);
  }, [location]);

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  interface Category {
    id: number;
    name: string;
    icon: string;
    color: string;
  }

  // Fetch filtered documents
  const { data: documents = [], isLoading, error } = useQuery({
    queryKey: ["/api/documents", null, null, expiryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (expiryFilter) params.append("expiryFilter", expiryFilter);
      
      const response = await fetch(`/api/documents?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    retry: false,
    enabled: !!expiryFilter,
  });

  // Handle errors manually since onError is deprecated in v5
  useEffect(() => {
    if (error) {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
    }
  }, [error, toast]);

  const getFilterTitle = () => {
    switch (expiryFilter) {
      case 'expired':
        return 'Expired Documents';
      case 'expiring-soon':
        return 'Documents Expiring Soon';
      case 'this-month':
        return 'Documents Expiring This Month';
      default:
        return 'Expiry Documents';
    }
  };

  const getFilterIcon = () => {
    switch (expiryFilter) {
      case 'expired':
        return <AlertTriangle className="h-6 w-6 text-red-600" />;
      case 'expiring-soon':
        return <Clock className="h-6 w-6 text-orange-600" />;
      case 'this-month':
        return <Calendar className="h-6 w-6 text-yellow-600" />;
      default:
        return <FileText className="h-6 w-6 text-gray-600" />;
    }
  };

  const getFilterDescription = () => {
    switch (expiryFilter) {
      case 'expired':
        return 'These documents have passed their expiry date and may need immediate attention.';
      case 'expiring-soon':
        return 'These documents will expire within the next 7 days.';
      case 'this-month':
        return 'These documents will expire sometime this month.';
      default:
        return 'Documents filtered by expiry status.';
    }
  };

  const getFilterColor = () => {
    switch (expiryFilter) {
      case 'expired':
        return 'border-red-200 bg-red-50';
      case 'expiring-soon':
        return 'border-orange-200 bg-orange-50';
      case 'this-month':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button 
              variant="ghost" 
              onClick={() => setLocation('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </div>
          
          <div className={`p-6 rounded-lg border ${getFilterColor()}`}>
            <div className="flex items-center gap-3 mb-2">
              {getFilterIcon()}
              <h1 className="text-2xl font-bold text-gray-900">
                {getFilterTitle()}
              </h1>
            </div>
            <p className="text-gray-600">
              {getFilterDescription()}
            </p>
          </div>
        </div>

        {/* Documents Grid */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {documents.length} {documents.length === 1 ? 'Document' : 'Documents'} Found
              </h2>
            </div>
          </div>

          <div className="p-6">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg mb-3"></div>
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded mb-2"></div>
                    <div className="flex justify-between">
                      <div className="h-3 bg-gray-200 rounded w-12"></div>
                      <div className="h-3 bg-gray-200 rounded w-12"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  {getFilterIcon()}
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No {expiryFilter === 'expired' ? 'expired' : expiryFilter === 'expiring-soon' ? 'expiring soon' : 'this month'} documents found
                </h3>
                <p className="text-gray-500 mb-6">
                  {expiryFilter === 'expired' 
                    ? "Great! You don't have any expired documents."
                    : expiryFilter === 'expiring-soon'
                    ? "No documents are expiring within the next 7 days."
                    : "No documents are expiring this month."
                  }
                </p>
                <Button onClick={() => setLocation('/')}>
                  View All Documents
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {documents.map((document: any) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    categories={categories}
                    viewMode="grid"
                    onUpdate={() => {
                      // Refresh the documents list when a document is updated
                      window.location.reload();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}