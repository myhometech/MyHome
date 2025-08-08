/**
 * Enhanced Bulk Operations Component
 * Provides improved bulk operations using the new dedicated API endpoints
 */

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { CheckSquare, Square, Trash2, FolderOpen, Tags, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Category } from "@shared/schema";

interface BulkOperationsEnhancedProps {
  selectedDocuments: Set<number>;
  categories: Category[];
  onSelectionChange: (selectedIds: Set<number>) => void;
  onOperationComplete: () => void;
  totalDocuments: number;
}

interface BulkResult {
  success: number;
  failed: number;
  errors: string[];
  message: string;
}

export function BulkOperationsEnhanced({
  selectedDocuments,
  categories,
  onSelectionChange,
  onOperationComplete,
  totalDocuments,
}: BulkOperationsEnhancedProps) {
  const { toast } = useToast();
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [operationProgress, setOperationProgress] = useState(0);

  // Enhanced bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async (updates: { categoryId?: number | null; tags?: string[]; name?: string }) => {
      const response = await apiRequest("PATCH", "/api/documents/bulk-update", {
        documentIds: Array.from(selectedDocuments),
        updates,
      });
      return response.json() as Promise<BulkResult>;
    },
    onSuccess: (result) => {
      setShowProgress(false);
      toast({
        title: "Bulk Update Complete",
        description: `${result.success} documents updated successfully${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });

      if (result.errors.length > 0) {
        // Bulk update errors - no logging in production
      }

      onOperationComplete();
      onSelectionChange(new Set());
    },
    onError: (error) => {
      setShowProgress(false);
      toast({
        title: "Bulk Update Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  // Enhanced bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/documents/bulk-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ documentIds: Array.from(selectedDocuments) }),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete documents: ${response.status}`);
      }

      return response.json() as Promise<BulkResult>;
    },
    onSuccess: (result) => {
      setShowProgress(false);
      toast({
        title: "Bulk Delete Complete",
        description: `${result.success} documents deleted successfully${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });

      if (result.errors.length > 0) {
        // Bulk delete errors - no logging in production
      }

      onOperationComplete();
      onSelectionChange(new Set());
    },
    onError: (error) => {
      setShowProgress(false);
      toast({
        title: "Bulk Delete Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const handleBulkMoveCategory = (categoryId: number | null) => {
    setShowProgress(true);
    setOperationProgress(25);
    bulkUpdateMutation.mutate({ categoryId });
  };

  const handleBulkAddTags = () => {
    if (!bulkTagInput.trim()) return;

    const newTags = bulkTagInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    if (newTags.length === 0) return;

    setShowProgress(true);
    setOperationProgress(25);
    bulkUpdateMutation.mutate({ tags: newTags });
    setBulkTagInput("");
  };

  const handleBulkDelete = () => {
    setShowProgress(true);
    setOperationProgress(25);
    bulkDeleteMutation.mutate();
  };

  const selectAll = () => {
    const allIds = new Set<number>();
    for (let i = 1; i <= totalDocuments; i++) {
      allIds.add(i);
    }
    onSelectionChange(allIds);
  };

  const deselectAll = () => {
    onSelectionChange(new Set());
  };

  if (selectedDocuments.size === 0) {
    return null;
  }

  return (
    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex flex-col space-y-4">
        {/* Selection Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="px-3 py-1">
              {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
            </Badge>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAll}
                disabled={totalDocuments === 0}
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={deselectAll}
              >
                <Square className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange(new Set())}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress Bar */}
        {showProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Processing bulk operation...</span>
              <span>{operationProgress}%</span>
            </div>
            <Progress value={operationProgress} className="h-2" />
          </div>
        )}

        {/* Bulk Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Move to Category */}
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-gray-500" />
            <Select onValueChange={(value) => handleBulkMoveCategory(value === "uncategorized" ? null : parseInt(value))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Move to..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add Tags */}
          <div className="flex items-center gap-2">
            <Tags className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Add tags (comma-separated)"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              className="px-3 py-1 border rounded-md text-sm w-48"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleBulkAddTags();
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleBulkAddTags}
              disabled={!bulkTagInput.trim() || bulkUpdateMutation.isPending}
            >
              Add Tags
            </Button>
          </div>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Selected Documents</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {selectedDocuments.size} selected document{selectedDocuments.size !== 1 ? 's' : ''}? 
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleBulkDelete}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete {selectedDocuments.size} Document{selectedDocuments.size !== 1 ? 's' : ''}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}