import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, Tag, Calendar, Mail, AlignLeft, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface SearchResult {
  id: number;
  name: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  extractedText: string | null;
  summary: string | null;
  tags: string[] | null;
  categoryId: number | null;
  emailContext?: {
    subject?: string;
    from?: string;
  };
  relevanceScore?: number;
  matchType?: string;
}

interface SearchAsYouTypeProps {
  onDocumentSelect?: (documentId: number) => void;
  onSearchChange?: (query: string, results: SearchResult[]) => void;
  placeholder?: string;
  showFullResults?: boolean;
  maxResults?: number;
  className?: string;
}

export default function SearchAsYouType({
  onDocumentSelect,
  onSearchChange,
  placeholder = "Search documents by title, content, tags...",
  showFullResults = false,
  maxResults = 10,
  className
}: SearchAsYouTypeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounced search query
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search API call
  const { data: searchData, isLoading, error } = useQuery({
    queryKey: ["/api/documents/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return { results: [], count: 0, message: "" };
      }

      const response = await fetch(
        `/api/documents/search?q=${encodeURIComponent(debouncedQuery)}&limit=${maxResults}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      return response.json();
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000, // Cache results for 30 seconds
  });

  const results = searchData?.results || [];

  // Notify parent of search changes
  useEffect(() => {
    onSearchChange?.(debouncedQuery, results);
  }, [debouncedQuery, results, onSearchChange]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isSearchFocused || results.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && results[selectedIndex]) {
            handleDocumentSelect(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsSearchFocused(false);
          setSelectedIndex(-1);
          inputRef.current?.blur();
          break;
      }
    };

    if (isSearchFocused) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isSearchFocused, results, selectedIndex]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  const handleDocumentSelect = (result: SearchResult) => {
    onDocumentSelect?.(result.id);
    setIsSearchFocused(false);
    setSelectedIndex(-1);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setIsSearchFocused(false);
    setSelectedIndex(-1);
  };

  const getMatchTypeIcon = (matchType?: string) => {
    switch (matchType) {
      case 'title':
        return <FileText className="w-3 h-3" />;
      case 'tags':
        return <Tag className="w-3 h-3" />;
      case 'email':
        return <Mail className="w-3 h-3" />;
      case 'summary':
      case 'content':
        return <AlignLeft className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  };

  const getMatchTypeLabel = (matchType?: string) => {
    switch (matchType) {
      case 'title':
        return 'Title match';
      case 'tags':
        return 'Tag match';
      case 'email':
        return 'Email match';
      case 'summary':
        return 'Summary match';
      case 'content':
        return 'Content match';
      default:
        return 'Match';
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query || !text) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-0 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  const shouldShowResults = isSearchFocused && debouncedQuery.length >= 2 && (results.length > 0 || isLoading || error);

  return (
    <div className={cn("relative w-full", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={(e) => {
            // Delay hiding results to allow clicking on them
            setTimeout(() => {
              if (!resultsRef.current?.contains(e.relatedTarget as Node)) {
                setIsSearchFocused(false);
                setSelectedIndex(-1);
              }
            }, 200);
          }}
          className="pl-10 pr-10"
        />
        
        {/* Clear button */}
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Search Results Dropdown */}
      {shouldShowResults && (
        <Card 
          ref={resultsRef}
          className="absolute top-full left-0 right-0 mt-2 z-50 max-h-96 overflow-auto shadow-lg"
        >
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                Searching documents...
              </div>
            ) : error ? (
              <div className="p-4 text-center text-destructive">
                Search failed. Please try again.
              </div>
            ) : results.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No documents found for "{debouncedQuery}"
              </div>
            ) : (
              <div className="divide-y">
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    onClick={() => handleDocumentSelect(result)}
                    className={cn(
                      "w-full p-4 text-left hover:bg-muted/50 focus:bg-muted/50 transition-colors",
                      selectedIndex === index && "bg-muted/50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Document title */}
                        <div className="flex items-center gap-2 mb-1">
                          {getMatchTypeIcon(result.matchType)}
                          <h4 className="font-medium text-sm truncate">
                            {highlightMatch(result.name, debouncedQuery)}
                          </h4>
                        </div>

                        {/* Match details */}
                        <div className="flex items-center gap-2 mb-2">
                          <Badge 
                            variant="outline" 
                            className="text-xs"
                            title={getMatchTypeLabel(result.matchType)}
                          >
                            {result.matchType || 'match'}
                          </Badge>
                          {result.relevanceScore && (
                            <span className="text-xs text-muted-foreground">
                              {result.relevanceScore}% relevant
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(result.uploadedAt), 'MMM d, yyyy')}
                          </span>
                        </div>

                        {/* Preview text */}
                        {(result.summary || result.extractedText) && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {highlightMatch(
                              result.summary || 
                              (result.extractedText?.substring(0, 150) + '...') || 
                              'No preview available',
                              debouncedQuery
                            )}
                          </p>
                        )}

                        {/* Email context */}
                        {result.emailContext && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {result.emailContext.subject && (
                                <span>
                                  Subject: {highlightMatch(result.emailContext.subject, debouncedQuery)}
                                </span>
                              )}
                            </div>
                            {result.emailContext.from && (
                              <div className="ml-4">
                                From: {highlightMatch(result.emailContext.from, debouncedQuery)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tags */}
                        {result.tags && result.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {result.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {highlightMatch(tag, debouncedQuery)}
                              </Badge>
                            ))}
                            {result.tags.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{result.tags.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}

                {/* Footer with result count */}
                <div className="p-3 bg-muted/30 text-center text-xs text-muted-foreground border-t">
                  {searchData?.message || `Found ${results.length} result(s)`}
                  {results.length === maxResults && (
                    <span className="ml-2">• Showing top {maxResults} results</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}