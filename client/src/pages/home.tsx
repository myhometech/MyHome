import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import Header from "@/components/header";
import UploadZone from "@/components/upload-zone";
import StatsGrid from "@/components/stats-grid";
import CategoryFilter from "@/components/category-filter";
import DocumentCard from "@/components/document-card";
import MobileNav from "@/components/mobile-nav";
import { ExpiryDashboard } from "@/components/expiry-dashboard";
import Chatbot from "@/components/chatbot";
import { Navigation } from "@/components/navigation";
import { EmailForwarding } from "@/components/email-forwarding";
import { useState } from "react";
import { Grid, List, SortAsc, MessageCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartSearch } from "@/components/smart-search";
import type { Category, Document } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [expiryFilter, setExpiryFilter] = useState<'expired' | 'expiring-soon' | 'this-month' | null>(null);

  // Initialize categories on first load
  const initCategoriesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/init-categories", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to initialize categories");
      return response.json();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
    },
  });

  useEffect(() => {
    initCategoriesMutation.mutate();
  }, []);

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/documents", selectedCategory, searchQuery, expiryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("categoryId", selectedCategory.toString());
      if (searchQuery) params.append("search", searchQuery);
      if (expiryFilter) params.append("expiryFilter", expiryFilter);
      
      const response = await fetch(`/api/documents?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    retry: false,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  // Fetch stats
  const { data: stats } = useQuery<{
    totalDocuments: number;
    totalSize: number;
    categoryCounts: { categoryId: number; count: number }[];
  }>({
    queryKey: ["/api/documents/stats"],
    retry: false,
  });

  const handleFileUpload = (files: File[]) => {
    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/documents/stats"] });
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navigation />
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20 md:pb-8">
        {/* Mobile Search */}
        <div className="md:hidden mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Expiry Dashboard */}
        <ExpiryDashboard onExpiryFilterChange={(filter) => {
          setExpiryFilter(filter);
          setSelectedCategory(null); // Clear category filter when using expiry filter
          setSearchQuery(""); // Clear search when using expiry filter
        }} />

        {/* Upload Zone */}
        <UploadZone onUpload={handleFileUpload} />

        {/* Email Forwarding */}
        <EmailForwarding />

        {/* Stats Grid */}
        <StatsGrid stats={stats} />

        {/* Active Expiry Filter Indicator */}
        {expiryFilter && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Showing {expiryFilter === 'expired' ? 'expired' : expiryFilter === 'expiring-soon' ? 'expiring soon' : 'this month'} documents
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpiryFilter(null)}
                className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
              >
                Clear filter
              </Button>
            </div>
          </div>
        )}

        {/* Search and Filter Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <SmartSearch
              onSearchChange={setSearchQuery}
              onDocumentSelect={(document) => {
                // Optionally open document modal or navigate to document
                console.log('Selected document:', document);
              }}
              placeholder="Search documents by name, content, or tags..."
              className="w-full"
            />
          </div>
        </div>

        {/* Category Filter */}
        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />

        {/* Documents Section */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Recent Documents</h2>
              <div className="flex items-center space-x-2">
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm">
                  <SortAsc className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {documentsLoading ? (
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
                  <Search className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
                <p className="text-gray-500 mb-6">
                  {searchQuery || selectedCategory
                    ? "Try adjusting your search or filters"
                    : "Upload your first document to get started"}
                </p>
                {!searchQuery && !selectedCategory && (
                  <Button
                    onClick={() => document.querySelector('[data-upload-zone]')?.scrollIntoView({ behavior: 'smooth' })}
                    className="bg-primary hover:bg-blue-700"
                  >
                    Upload Your First Document
                  </Button>
                )}
              </div>
            ) : (
              <div className={
                viewMode === "grid"
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  : "space-y-4"
              }>
                {documents.map((document: any) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    categories={categories}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileNav />

      {/* Floating Chatbot Button */}
      <Button
        onClick={() => setIsChatbotOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-6 rounded-full w-14 h-14 shadow-lg bg-primary hover:bg-blue-700 z-40"
        size="icon"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Chatbot Modal */}
      <Chatbot isOpen={isChatbotOpen} onClose={() => setIsChatbotOpen(false)} />
    </div>
  );
}
