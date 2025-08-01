import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import Header from "@/components/header";
import UnifiedUploadButton from "@/components/unified-upload-button";
import UnifiedDocumentCard from "@/components/unified-document-card";

import { useFeatures } from "@/hooks/useFeatures";
import { 
  Lightbulb, 
  FileText, 
  Plus, 
  Search, 
  Filter,
  AlertTriangle,
  Clock,
  CheckCircle,
  Calendar,
  DollarSign,
  Users,
  Shield,
  ListTodo,
  Grid,
  List,
  SortAsc
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { EnhancedDocumentViewer } from "@/components/enhanced-document-viewer";
import type { Category, Document } from "@shared/schema";

interface DocumentInsight {
  id: string;
  documentId: number;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'resolved' | 'dismissed';
  title: string;
  content: string;
  dueDate?: string;
  confidence: number;
  documentName?: string;
}

export default function InsightsFirstPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  // No longer using tabs - unified view
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [insightTypeFilter, setInsightTypeFilter] = useState<string>("all");
  const [insightPriorityFilter, setInsightPriorityFilter] = useState<string>("all");
  const [insightStatusFilter, setInsightStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("priority");

  const { hasFeature } = useFeatures();

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading, error: documentsError } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    retry: false,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  // Fetch all insights for dashboard totals (unfiltered)
  const { data: allInsightsResponse } = useQuery<{insights: DocumentInsight[], total: number}>({
    queryKey: ["/api/insights", "all"],
    queryFn: async () => {
      const response = await fetch('/api/insights?status=all');
      if (!response.ok) throw new Error('Failed to fetch all insights');
      return response.json();
    },
    retry: false,
  });

  // Fetch filtered insights for display
  const { data: insightsResponse, isLoading: insightsLoading } = useQuery<{insights: DocumentInsight[], total: number}>({
    queryKey: ["/api/insights", insightStatusFilter, insightTypeFilter !== "all" ? insightTypeFilter : undefined, insightPriorityFilter !== "all" ? insightPriorityFilter : undefined, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (insightStatusFilter && insightStatusFilter !== 'all') params.append('status', insightStatusFilter);
      if (insightTypeFilter && insightTypeFilter !== 'all') params.append('type', insightTypeFilter);
      if (insightPriorityFilter && insightPriorityFilter !== 'all') params.append('priority', insightPriorityFilter);
      if (sortBy) params.append('sort', sortBy);

      const response = await fetch(`/api/insights?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
    retry: false,
  });

  const insights = insightsResponse?.insights || [];
  const allInsights = allInsightsResponse?.insights || [];

  // Filter documents for library tab
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = !searchQuery || 
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.extractedText && doc.extractedText.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    
    const matchesCategory = !selectedCategory || doc.categoryId === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Upload dialog component
  const UploadDialog = () => (
    <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>
        <UnifiedUploadButton onUpload={(files) => {
          queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
          queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
          setShowUploadDialog(false);
          toast({
            title: "Upload Started",
            description: `${files.length} file(s) uploaded successfully.`,
          });
        }} />
      </DialogContent>
    </Dialog>
  );

  // Insights priority colors
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Insight type icons
  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'action_items': return <ListTodo className="h-4 w-4" />;
      case 'key_dates': return <Calendar className="h-4 w-4" />;
      case 'financial_info': return <DollarSign className="h-4 w-4" />;
      case 'contacts': return <Users className="h-4 w-4" />;
      case 'compliance': return <Shield className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  if (documentsError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Failed to Load Data</h3>
              <p className="text-gray-600 mb-4">There was an error loading your documents and insights.</p>
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Header with Add Document Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Lightbulb className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Insights & Documents</h1>
              <p className="text-gray-600">AI-powered insights with full document access</p>
            </div>
          </div>
          
          <Button onClick={() => setShowUploadDialog(true)} size="lg" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Document
          </Button>
        </div>

        {/* AI Insights Section */}
        <div className="space-y-6">
          {/* Priority Dashboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setInsightStatusFilter('open')}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Open Items</p>
                    <p className="text-2xl font-bold text-blue-600">{allInsights.filter(i => i.status === 'open' || !i.status).length}</p>
                  </div>
                  <ListTodo className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => {setInsightPriorityFilter('high'); setInsightStatusFilter('open');}}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">High Priority</p>
                    <p className="text-2xl font-bold text-red-600">{allInsights.filter(i => i.priority === 'high' && (i.status === 'open' || !i.status)).length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => {setInsightPriorityFilter('medium'); setInsightStatusFilter('open');}}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Medium Priority</p>
                    <p className="text-2xl font-bold text-yellow-600">{allInsights.filter(i => i.priority === 'medium' && (i.status === 'open' || !i.status)).length}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setInsightStatusFilter('resolved')}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Resolved</p>
                    <p className="text-2xl font-bold text-green-600">{allInsights.filter(i => i.status === 'resolved').length}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
          </div>
            {/* Insight Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Select value={insightStatusFilter} onValueChange={setInsightStatusFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={insightPriorityFilter} onValueChange={setInsightPriorityFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={insightTypeFilter} onValueChange={setInsightTypeFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="action_items">Action Items</SelectItem>
                      <SelectItem value="key_dates">Key Dates</SelectItem>
                      <SelectItem value="financial_info">Financial</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
                      <SelectItem value="contacts">Contacts</SelectItem>
                      <SelectItem value="summary">Summary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Insights Display */}
            {insightsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading insights...</p>
              </div>
            ) : insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {insights.map((insight) => (
                  <Card key={insight.id} className="hover:shadow-md transition-shadow h-fit">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getInsightIcon(insight.type)}
                          <Badge className={`${getPriorityColor(insight.priority)} text-xs px-2 py-1`}>
                            {insight.priority.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs px-2 py-1">
                            {insight.type.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        
                        {insight.dueDate && (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <Clock className="h-3 w-3" />
                            {new Date(insight.dueDate).toLocaleDateString()}
                          </Badge>
                        )}
                        
                        <div>
                          <h3 className="font-semibold text-base mb-2 line-clamp-2">{insight.title}</h3>
                          <p className="text-gray-600 text-sm mb-3 line-clamp-3">{insight.content}</p>
                        </div>
                        
                        {insight.documentName && (
                          <div className="text-xs text-gray-500 truncate">
                            Document: {insight.documentName}
                          </div>
                        )}
                        
                        <div className="flex gap-2 pt-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="flex-1 text-xs"
                            onClick={() => {
                              const doc = documents.find(d => d.id === insight.documentId);
                              if (doc) {
                                setSelectedDocument(doc);
                                setShowDocumentPreview(true);
                              }
                            }}
                          >
                            View Doc
                          </Button>
                          <Button size="sm" variant="ghost" className="flex-1 text-xs">
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </div>

        {/* Document Library Section */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3 pt-6 border-t">
            <FileText className="h-8 w-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold">Document Library</h2>
              <p className="text-gray-600">Manage and organize your documents</p>
            </div>
          </div>
            {/* Library Controls */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search documents, content, tags..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  <Select value={selectedCategory?.toString() || "all"} onValueChange={(value) => setSelectedCategory(value === "all" ? null : parseInt(value))}>
                    <SelectTrigger className="w-full lg:w-48">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
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
                  </div>
                </div>
              </CardContent>
            </Card>



            {/* Documents Display */}
            {documentsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading documents...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Documents Found</h3>
                  <p className="text-gray-600 mb-4">
                    {documents.length === 0 
                      ? "Upload your first document to get started."
                      : "Try adjusting your search or filters."
                    }
                  </p>
                  {documents.length === 0 && (
                    <Button onClick={() => setShowUploadDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Document
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className={viewMode === "grid" 
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                : "space-y-4"
              }>
                {filteredDocuments.map((document) => (
                  <UnifiedDocumentCard
                    key={document.id}
                    document={{
                      ...document,
                      uploadedAt: document.uploadedAt ? new Date(document.uploadedAt).toISOString() : new Date().toISOString(),
                      expiryDate: document.expiryDate ? new Date(document.expiryDate).toISOString() : null
                    }}
                    categories={categories}
                    viewMode={viewMode}
                    bulkMode={false}
                    isSelected={false}
                    onToggleSelection={() => {}}
                    onUpdate={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
                    }}
                    onClick={() => {
                      setSelectedDocument(document);
                      setShowDocumentPreview(true);
                    }}
                    showInsights={false} // No inline insights in library view
                    autoExpandCritical={false}
                  />
                ))}
              </div>
            )}
        </div>
      </main>

      <UploadDialog />
      
      {/* Document Preview Dialog */}
      <Dialog open={showDocumentPreview} onOpenChange={setShowDocumentPreview}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-lg font-semibold">{selectedDocument?.name}</DialogTitle>
            <DialogDescription>
              Document preview with AI insights and metadata
            </DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="flex-1 overflow-hidden">
              <EnhancedDocumentViewer 
                document={selectedDocument} 
                category={categories?.find(c => c.id === selectedDocument.categoryId)}
                onClose={() => setShowDocumentPreview(false)}
                onDownload={() => window.open(`/api/documents/${selectedDocument.id}/download`, '_blank')}
                onUpdate={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}