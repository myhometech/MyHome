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

import Chatbot from "@/components/chatbot";

import { EmailForwarding } from "@/components/email-forwarding";
import { FeatureGate, FeatureLimitAlert } from "@/components/feature-gate";
import { useFeatures } from "@/hooks/useFeatures";
import { useState } from "react";
import { Grid, List, SortAsc, MessageCircle, Search, CheckSquare, Square, Trash2, FolderOpen, Share2, X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { SmartSearch } from "@/components/smart-search";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ShareDocumentDialog } from "@/components/share-document-dialog";
import { BatchTagManager } from "@/components/batch-tag-manager";
import type { Category, Document } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const { hasFeature, features } = useFeatures();
  const limits = { documents: features.BULK_OPERATIONS ? 999999 : 50 }; // Simple limits logic
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());


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
          window.location.href = "/login";
        }, 500);
        return;
      }
    },
  });

  // Bulk operations mutations
  const bulkDeleteMutation = useMutation({
    mutationFn: async (documentIds: number[]) => {
      await Promise.all(
        documentIds.map(id => fetch(`/api/documents/${id}`, {
          method: "DELETE",
          credentials: "include",
        }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/expiry-alerts"] });
      setSelectedDocuments(new Set());
      setBulkMode(false);
      toast({
        title: "Documents deleted",
        description: `Successfully deleted ${selectedDocuments.size} documents.`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Failed to delete documents",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const bulkMoveCategoryMutation = useMutation({
    mutationFn: async ({ documentIds, categoryId }: { documentIds: number[]; categoryId: number | null }) => {
      await Promise.all(
        documentIds.map(id => 
          fetch(`/api/documents/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ categoryId })
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/stats"] });
      setSelectedDocuments(new Set());
      setBulkMode(false);
      toast({
        title: "Documents moved",
        description: `Successfully moved ${selectedDocuments.size} documents.`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Failed to move documents",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    initCategoriesMutation.mutate();
  }, []);

  // Bulk operation handlers
  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedDocuments(new Set());
  };

  const toggleDocumentSelection = (documentId: number) => {
    const newSelection = new Set(selectedDocuments);
    if (newSelection.has(documentId)) {
      newSelection.delete(documentId);
    } else {
      newSelection.add(documentId);
    }
    setSelectedDocuments(newSelection);
  };

  const selectAllDocuments = () => {
    const allIds = new Set<number>(documents.map((doc: Document) => doc.id));
    setSelectedDocuments(allIds);
  };

  const deselectAllDocuments = () => {
    setSelectedDocuments(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedDocuments.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedDocuments));
  };

  const handleBulkMoveCategory = (categoryId: number | null) => {
    if (selectedDocuments.size === 0) return;
    bulkMoveCategoryMutation.mutate({
      documentIds: Array.from(selectedDocuments),
      categoryId
    });
  };

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/documents", selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("categoryId", selectedCategory.toString());
      if (searchQuery) params.append("search", searchQuery);
      
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



        {/* Upload Zone */}
        <UploadZone onUpload={handleFileUpload} />



        {/* Stats Grid */}
        <StatsGrid stats={stats} />

        {/* Discrete Email Forwarding Option */}
        <FeatureGate feature="emailForwarding" hideCompletely={true}>
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Mail className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-blue-900">Email Import</h3>
                    <p className="text-sm text-blue-700">Forward emails to automatically import documents</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setLocation('/settings?tab=email')}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  Setup Email Import
                </Button>
              </div>
            </CardContent>
          </Card>
        </FeatureGate>



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
          <div className="p-3 md:p-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Recent Documents</h2>
              <div className="flex items-center space-x-2">
                <Button
                  variant={bulkMode ? "default" : "outline"}
                  size="sm"
                  onClick={toggleBulkMode}
                >
                  {bulkMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                  {bulkMode ? "Cancel" : "Select"}
                </Button>
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
            
            {/* Bulk Operations Bar */}
            {bulkMode && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-blue-900">
                      {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllDocuments}
                        disabled={documents.length === 0}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={deselectAllDocuments}
                        disabled={selectedDocuments.size === 0}
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  
                  {selectedDocuments.size > 0 && (
                    <div className="flex items-center gap-2">
                      {/* Move to Category */}
                      <Select onValueChange={(value) => handleBulkMoveCategory(value === "uncategorized" ? null : parseInt(value))}>
                        <SelectTrigger className="w-40">
                          <FolderOpen className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Move to..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uncategorized">
                            <div className="flex items-center gap-2">
                              <Square className="h-4 w-4 text-gray-400" />
                              Uncategorized
                            </div>
                          </SelectItem>
                          {categories.map((category: Category) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              <div className="flex items-center gap-2">
                                <i className={`${category.icon} text-${category.color}-500`}></i>
                                {category.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Smart Tag Suggestions */}
                      <BatchTagManager
                        selectedDocuments={Array.from(selectedDocuments).map(id => {
                          const doc = documents.find((d: Document) => d.id === id);
                          return { id, name: doc?.name || 'Unknown' };
                        })}
                        onComplete={() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                          setBulkMode(false);
                          setSelectedDocuments(new Set());
                        }}
                      />

                      {/* Share Multiple */}
                      <Button variant="outline" size="sm" disabled>
                        <Share2 className="h-4 w-4 mr-2" />
                        Share (Coming Soon)
                      </Button>

                      {/* Delete Multiple */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="mx-2 max-w-sm md:max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Documents</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleBulkDelete}
                              className="bg-red-600 hover:bg-red-700"
                              disabled={bulkDeleteMutation.isPending}
                            >
                              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 md:p-6">
            {documentsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
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
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4"
                  : "space-y-3 md:space-y-4"
              }>
                {documents.map((document: any) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    categories={categories}
                    viewMode={viewMode}
                    bulkMode={bulkMode}
                    isSelected={selectedDocuments.has(document.id)}
                    onToggleSelection={() => toggleDocumentSelection(document.id)}
                    onUpdate={() => {
                      // Refresh queries when documents are updated
                      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/documents/expiry-alerts"] });
                    }}
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
