import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Sparkles, Tags, Check, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BatchTagSuggestion {
  documentId: number;
  documentName: string;
  suggestedTags: string[];
  confidence: number;
  reasoning: string;
}

interface BatchTagManagerProps {
  selectedDocuments: { id: number; name: string }[];
  onComplete: () => void;
}

export function BatchTagManager({ selectedDocuments, onComplete }: BatchTagManagerProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [appliedTags, setAppliedTags] = useState<Set<number>>(new Set());

  const documentIds = selectedDocuments.map(doc => doc.id);

  // Fetch batch suggestions
  const { data: batchSuggestions, isLoading, refetch } = useQuery<BatchTagSuggestion[]>({
    queryKey: [`/api/documents/batch-suggest-tags`],
    queryFn: async () => {
      const response = await fetch('/api/documents/batch-suggest-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documentIds }),
      });
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      return response.json();
    },
    enabled: false,
  });

  // Apply tags to selected documents
  const applyTagsMutation = useMutation({
    mutationFn: async (suggestions: BatchTagSuggestion[]) => {
      const promises = suggestions.map(async (suggestion) => {
        await apiRequest(`/api/documents/${suggestion.documentId}/tags`, 'PATCH', {
          tags: suggestion.suggestedTags
        });
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      toast({
        title: "Batch tags applied",
        description: `Successfully applied AI-suggested tags to ${selectedSuggestions.size} documents.`,
      });
      setAppliedTags(new Set(Array.from(selectedSuggestions)));
      onComplete();
    },
    onError: (error) => {
      toast({
        title: "Failed to apply batch tags",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleGetBatchSuggestions = async () => {
    if (documentIds.length === 0) return;
    refetch();
  };

  const handleToggleSuggestion = (documentId: number) => {
    setSelectedSuggestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  };

  const handleApplySelected = () => {
    if (!batchSuggestions || selectedSuggestions.size === 0) return;
    
    const selectedBatch = batchSuggestions.filter(suggestion => 
      selectedSuggestions.has(suggestion.documentId)
    );
    
    applyTagsMutation.mutate(selectedBatch);
  };

  const handleApplyAll = () => {
    if (!batchSuggestions || batchSuggestions.length === 0) return;
    applyTagsMutation.mutate(batchSuggestions);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Smart Tag Suggestions
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-[95vw] lg:max-w-[90vw] max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-purple-500" />
            Batch AI Tag Suggestions
            <Badge variant="secondary" className="ml-2">
              {selectedDocuments.length} documents
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Get AI-powered tag suggestions for multiple documents and apply them in batch
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 overflow-y-auto flex-1">
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={handleGetBatchSuggestions}
              disabled={isLoading || documentIds.length === 0}
              variant="outline"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Get AI Suggestions
            </Button>
            
            {batchSuggestions && batchSuggestions.length > 0 && (
              <>
                <Button
                  onClick={handleApplySelected}
                  disabled={selectedSuggestions.size === 0 || applyTagsMutation.isPending}
                  className="gap-2"
                >
                  {applyTagsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Apply Selected ({selectedSuggestions.size})
                </Button>
                
                <Button
                  onClick={handleApplyAll}
                  disabled={applyTagsMutation.isPending}
                  variant="secondary"
                  className="gap-2"
                >
                  Apply All ({batchSuggestions.length})
                </Button>
              </>
            )}
          </div>

          {/* Results */}
          {batchSuggestions && (
            <div className="space-y-4">
              {batchSuggestions.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">AI Tag Suggestions</h4>
                  
                  {batchSuggestions.map((suggestion) => {
                    const isSelected = selectedSuggestions.has(suggestion.documentId);
                    const isApplied = appliedTags.has(suggestion.documentId);
                    
                    return (
                      <Card 
                        key={suggestion.documentId} 
                        className={`
                          transition-all cursor-pointer
                          ${isSelected ? 'border-blue-300 bg-blue-50' : 'hover:border-gray-300'}
                          ${isApplied ? 'border-green-300 bg-green-50' : ''}
                        `}
                        onClick={() => !isApplied && handleToggleSuggestion(suggestion.documentId)}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">
                              {suggestion.documentName}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              {isApplied ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Checkbox 
                                  checked={isSelected}
                                  onCheckedChange={() => handleToggleSuggestion(suggestion.documentId)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1">
                              {suggestion.suggestedTags.map((tag, index) => (
                                <Badge 
                                  key={index} 
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                            
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Confidence: {Math.round(suggestion.confidence * 100)}%</span>
                            </div>
                            
                            {suggestion.reasoning && (
                              <p className="text-xs text-muted-foreground">
                                {suggestion.reasoning}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Tags className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No tag suggestions found for the selected documents.</p>
                </div>
              )}
            </div>
          )}

          {/* Selected documents list */}
          {selectedDocuments.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Selected Documents</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1">
                  {selectedDocuments.map((doc) => (
                    <Badge key={doc.id} variant="secondary" className="text-xs">
                      {doc.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}