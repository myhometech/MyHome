import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, File, Calendar, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import type { Document } from "@shared/schema";

interface SearchResult extends Document {
  categoryName?: string;
  matchType: 'name' | 'content' | 'tag' | 'category';
  snippet?: string;
}

interface SmartSearchProps {
  onDocumentSelect?: (document: Document) => void;
  onSearchChange?: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export function SmartSearch({ 
  onDocumentSelect, 
  onSearchChange, 
  placeholder = "Search documents...",
  className 
}: SmartSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounced search query
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      onSearchChange?.(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, onSearchChange]);

  // Search API call
  const { data: searchResults = [], isLoading } = useQuery<SearchResult[]>({
    queryKey: ["/api/documents/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      
      const response = await fetch(`/api/documents/search?q=${encodeURIComponent(debouncedQuery)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    },
    enabled: debouncedQuery.length > 0,
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || searchResults.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < searchResults.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : searchResults.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && searchResults[selectedIndex]) {
            handleDocumentSelect(searchResults[selectedIndex]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, searchResults, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setIsOpen(true);
    setSelectedIndex(-1);
  };

  const handleDocumentSelect = (document: Document) => {
    onDocumentSelect?.(document);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
    // Clear the search query to avoid filtering
    setQuery("");
    setDebouncedQuery("");
    onSearchChange?.("");
  };

  const clearSearch = () => {
    setQuery("");
    setDebouncedQuery("");
    setIsOpen(false);
    setSelectedIndex(-1);
    onSearchChange?.("");
    inputRef.current?.focus();
  };

  const getMatchIcon = (matchType: string) => {
    switch (matchType) {
      case 'name':
        return <File className="h-3 w-3" />;
      case 'content':
        return <Search className="h-3 w-3" />;
      case 'tag':
        return <Tag className="h-3 w-3" />;
      case 'category':
        return <Calendar className="h-3 w-3" />;
      default:
        return <File className="h-3 w-3" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          className="pl-10 pr-10"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (query.length > 0) && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 shadow-lg max-h-96 overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Searching...</p>
              </div>
            ) : searchResults.length > 0 ? (
              <div ref={resultsRef} className="max-h-80 overflow-y-auto">
                {searchResults.map((result, index) => (
                  <div
                    key={result.id}
                    className={cn(
                      "p-3 border-b last:border-b-0 cursor-pointer transition-colors",
                      selectedIndex === index 
                        ? "bg-blue-50 border-blue-200" 
                        : "hover:bg-gray-50"
                    )}
                    onClick={() => handleDocumentSelect(result)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getMatchIcon(result.matchType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm truncate">
                            {result.name}
                          </h4>
                          <Badge variant="outline" className="text-xs">
                            {result.matchType}
                          </Badge>
                        </div>
                        
                        {result.snippet && (
                          <p className="text-xs text-gray-600 mb-1 line-clamp-2">
                            {result.snippet}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {result.categoryName && (
                            <span>{result.categoryName}</span>
                          )}
                          <span>{formatFileSize(result.fileSize)}</span>
                          <span>{result.uploadedAt ? formatDate(result.uploadedAt.toString()) : 'Recently'}</span>
                        </div>
                        
                        {result.tags && result.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {result.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {result.tags.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{result.tags.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : debouncedQuery.length > 0 && !isLoading ? (
              <div className="p-4 text-center text-gray-500">
                <Search className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No documents found for "{debouncedQuery}"</p>
                <p className="text-xs mt-1">Try searching by document name, content, or tags</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}