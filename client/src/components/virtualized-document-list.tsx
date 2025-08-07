import { useState, useEffect, useMemo, useCallback } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { useQuery } from '@tanstack/react-query';
import { DocumentTile } from '@/components/document-tile';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface Document {
  id: number;
  name: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date | null;
  expiryDate: Date | null;
  summary: string | null;
  extractedText: string | null;
  tags: string[] | null;
  categoryId: number | null;
}

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

interface VirtualizedDocumentListProps {
  searchQuery?: string;
  selectedCategory?: number | null;
  viewMode: 'grid' | 'list';
  onDocumentSelect: (document: Document) => void;
  onDocumentUpdate: () => void;
}

const ITEM_HEIGHT = 280; // Height for grid items
const ITEMS_PER_PAGE = 20;

export function VirtualizedDocumentList({
  searchQuery = '',
  selectedCategory,
  viewMode,
  onDocumentSelect,
  onDocumentUpdate,
}: VirtualizedDocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { toast } = useToast();

  // Fetch categories for document display
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  // Initial document load
  const { data: initialDocuments, isLoading, error } = useQuery<Document[]>({
    queryKey: ['/api/documents', { 
      search: searchQuery, 
      category: selectedCategory,
      page: 1,
      limit: ITEMS_PER_PAGE 
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory) params.append('category', selectedCategory.toString());
      params.append('page', '1');
      params.append('limit', ITEMS_PER_PAGE.toString());

      const response = await fetch(`/api/documents?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
  });

  // Update documents when initial data changes
  useEffect(() => {
    if (initialDocuments) {
      setDocuments(initialDocuments);
      setHasNextPage(initialDocuments.length === ITEMS_PER_PAGE);
    }
  }, [initialDocuments]);

  // Load more documents
  const loadMoreItems = useCallback(async (startIndex: number, stopIndex: number) => {
    if (isLoadingMore) return;
    
    setIsLoadingMore(true);
    try {
      const page = Math.floor(startIndex / ITEMS_PER_PAGE) + 1;
      const params = new URLSearchParams();
      
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory) params.append('category', selectedCategory.toString());
      params.append('page', page.toString());
      params.append('limit', ITEMS_PER_PAGE.toString());

      const response = await fetch(`/api/documents?${params}`, {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to load more documents');
      const newDocuments = await response.json();

      setDocuments(prev => {
        // Avoid duplicates by checking IDs
        const existingIds = new Set(prev.map(doc => doc.id));
        const uniqueNewDocs = newDocuments.filter((doc: Document) => !existingIds.has(doc.id));
        return [...prev, ...uniqueNewDocs];
      });

      setHasNextPage(newDocuments.length === ITEMS_PER_PAGE);
    } catch (error: any) {
      console.error('Failed to load more documents:', error);
      toast({
        title: 'Error loading documents',
        description: error.message || 'Failed to load more documents',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [searchQuery, selectedCategory, isLoadingMore, toast]);

  // Check if item is loaded
  const isItemLoaded = useCallback((index: number) => {
    return !!documents[index];
  }, [documents]);

  // Get category for document
  const getCategoryForDocument = useCallback((categoryId: number | null) => {
    return categories.find(cat => cat.id === categoryId);
  }, [categories]);

  // Render individual document item
  const DocumentItem = useCallback(({ index, style }: ListChildComponentProps) => {
    const document = documents[index];
    
    if (!document) {
      return (
        <div style={style} className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      );
    }

    const category = getCategoryForDocument(document.categoryId);

    return (
      <div style={style} className="p-2">
        <DocumentTile
          document={document}
          category={category}
          onSelect={() => onDocumentSelect(document)}
          onUpdate={onDocumentUpdate}
          viewMode={viewMode}
        />
      </div>
    );
  }, [documents, getCategoryForDocument, onDocumentSelect, onDocumentUpdate, viewMode]);

  // Calculate dimensions based on view mode
  const itemHeight = viewMode === 'grid' ? ITEM_HEIGHT : 120;
  const itemsPerRow = viewMode === 'grid' ? 
    Math.floor((window.innerWidth - 64) / 320) || 1 : 1; // Responsive grid
  const rowHeight = viewMode === 'grid' ? itemHeight : itemHeight;

  // Calculate total item count for infinite loader
  const itemCount = hasNextPage ? documents.length + 1 : documents.length;

  // Memoized list height calculation
  const listHeight = useMemo(() => {
    return Math.min(800, window.innerHeight - 200); // Responsive height
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading documents...</span>
        </div>
      </div>
    );
  }

  if (error) {
    console.error('Document loading error:', error);
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-gray-600">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-medium">Failed to load documents</p>
          <p className="text-sm mt-2 mb-4">
            {error instanceof Error ? error.message : 'Please check your connection and try again'}
          </p>
          <div className="space-x-2">
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              size="sm"
            >
              Refresh Page
            </Button>
            <Button 
              onClick={() => {
                console.log('Retrying document fetch...');
                // Trigger refetch if available
                if (typeof refetch === 'function') refetch();
              }} 
              variant="default"
              size="sm"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-gray-600">
          <p className="text-lg font-medium">No documents found</p>
          <p className="text-sm mt-1">
            {searchQuery ? 'Try adjusting your search terms' : 'Upload your first document to get started'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <InfiniteLoader
        isItemLoaded={isItemLoaded}
        itemCount={itemCount}
        loadMoreItems={loadMoreItems}
        threshold={5} // Load more when 5 items from the end
      >
        {({ onItemsRendered, ref }) => (
          <List
            ref={ref}
            height={listHeight}
            itemCount={itemCount}
            itemSize={rowHeight}
            onItemsRendered={onItemsRendered}
            overscanCount={5} // Render extra items for smooth scrolling
            className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
          >
            {DocumentItem}
          </List>
        )}
      </InfiniteLoader>

      {isLoadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
          <span className="text-sm text-gray-600">Loading more documents...</span>
        </div>
      )}
    </div>
  );
}