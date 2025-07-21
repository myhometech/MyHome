import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Sparkles, Tag, Plus, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TagSuggestion {
  tag: string;
  confidence: number;
  category: string;
  reason: string;
}

interface TagSuggestionsResponse {
  suggestedTags: TagSuggestion[];
  existingTags: string[];
  recommendations: string[];
}

interface SmartTagSuggestionsProps {
  documentId: number;
  existingTags: string[] | null;
  onTagsUpdated: (newTags: string[]) => void;
  className?: string;
}

export function SmartTagSuggestions({ 
  documentId, 
  existingTags = [], 
  onTagsUpdated, 
  className = "" 
}: SmartTagSuggestionsProps) {
  const { toast } = useToast();
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [appliedTags, setAppliedTags] = useState<Set<string>>(new Set());
  
  const currentTags = existingTags || [];

  // Fetch AI-powered tag suggestions
  const { data: suggestions, isLoading: isLoadingSuggestions, refetch } = useQuery<TagSuggestionsResponse>({
    queryKey: [`/api/documents/${documentId}/suggest-tags`],
    enabled: false, // Don't auto-fetch, only when user clicks
  });

  // Apply selected tags to document
  const applyTagsMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      await apiRequest(`/api/documents/${documentId}/tags`, 'PATCH', { tags });
    },
    onSuccess: (_, newTags) => {
      toast({
        title: "Tags updated",
        description: `Successfully applied ${newTags.length} tags to the document.`,
      });
      setAppliedTags(new Set(newTags));
      onTagsUpdated(newTags);
    },
    onError: (error) => {
      toast({
        title: "Failed to apply tags",
        description: error instanceof Error ? error.message : "An error occurred while updating tags.",
        variant: "destructive",
      });
    },
  });

  const handleGetSuggestions = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleToggleSuggestion = useCallback((tag: string) => {
    setSelectedSuggestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  }, []);

  const handleApplySelectedTags = useCallback(() => {
    if (selectedSuggestions.size === 0) return;
    
    const newTags = [...currentTags, ...Array.from(selectedSuggestions)];
    // Remove duplicates
    const uniqueTags = Array.from(new Set(newTags));
    
    applyTagsMutation.mutate(uniqueTags);
  }, [selectedSuggestions, currentTags, applyTagsMutation]);

  const handleApplyAllSuggestions = useCallback(() => {
    if (!suggestions?.suggestedTags) return;
    
    const allSuggestedTags = suggestions.suggestedTags.map(s => s.tag);
    const newTags = [...currentTags, ...allSuggestedTags];
    const uniqueTags = Array.from(new Set(newTags));
    
    applyTagsMutation.mutate(uniqueTags);
  }, [suggestions, currentTags, applyTagsMutation]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "bg-green-100 text-green-800 border-green-200";
    if (confidence >= 0.6) return "bg-blue-100 text-blue-800 border-blue-200";
    if (confidence >= 0.4) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-gray-100 text-gray-800 border-gray-200";
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'document_type': return '📄';
      case 'subject_matter': return '🏠';
      case 'time_period': return '📅';
      case 'importance': return '⭐';
      case 'organization': return '📁';
      default: return '🏷️';
    }
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Smart Tag Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current tags display */}
        {currentTags.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Current Tags</h4>
            <div className="flex flex-wrap gap-2">
              {currentTags.map((tag) => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="bg-blue-50 text-blue-700 border-blue-200"
                >
                  <Tag className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button 
            onClick={handleGetSuggestions} 
            disabled={isLoadingSuggestions}
            variant="outline"
            className="flex-1"
          >
            {isLoadingSuggestions ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Get AI Suggestions
          </Button>
          
          {suggestions && selectedSuggestions.size > 0 && (
            <Button 
              onClick={handleApplySelectedTags}
              disabled={applyTagsMutation.isPending}
              className="flex-1"
            >
              {applyTagsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Apply Selected ({selectedSuggestions.size})
            </Button>
          )}
        </div>

        {/* Suggestions display */}
        {suggestions && (
          <div className="space-y-4">
            <Separator />
            
            {suggestions.suggestedTags.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">AI Suggestions</h4>
                  <Button
                    onClick={handleApplyAllSuggestions}
                    disabled={applyTagsMutation.isPending}
                    variant="ghost"
                    size="sm"
                  >
                    Apply All
                  </Button>
                </div>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {suggestions.suggestedTags.map((suggestion, index) => {
                    const isSelected = selectedSuggestions.has(suggestion.tag);
                    const isExisting = currentTags.includes(suggestion.tag);
                    const isApplied = appliedTags.has(suggestion.tag);
                    
                    return (
                      <div
                        key={index}
                        className={`
                          p-3 rounded-lg border cursor-pointer transition-all
                          ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
                          ${isExisting || isApplied ? 'opacity-50' : ''}
                        `}
                        onClick={() => !isExisting && !isApplied && handleToggleSuggestion(suggestion.tag)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {getCategoryIcon(suggestion.category)}
                              </span>
                              <Badge 
                                variant="outline" 
                                className={getConfidenceColor(suggestion.confidence)}
                              >
                                {suggestion.tag}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(suggestion.confidence * 100)}% confidence
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {suggestion.reason}
                            </p>
                          </div>
                          
                          <div className="flex items-center">
                            {isExisting || isApplied ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : isSelected ? (
                              <X className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Plus className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No new tag suggestions found for this document.</p>
              </div>
            )}

            {/* Recommendations */}
            {suggestions.recommendations && suggestions.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Recommendations
                </h4>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <ul className="text-sm space-y-1">
                    {suggestions.recommendations.map((rec, index) => (
                      <li key={index} className="text-blue-700">• {rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}