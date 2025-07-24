/**
 * Category Suggestion Service
 * Uses AI to analyze document content and suggest appropriate categories
 */

import { apiRequest } from "@/lib/queryClient";

export interface CategorySuggestion {
  category: string;
  confidence: number;
  reason: string;
}

export interface SuggestionResult {
  suggested: CategorySuggestion;
  alternatives: CategorySuggestion[];
}

/**
 * Analyze document content and suggest category
 */
export async function suggestCategory(
  fileName: string,
  fileType: string,
  ocrText?: string
): Promise<SuggestionResult> {
  try {
    const response = await apiRequest("POST", "/api/documents/suggest-category", {
      fileName,
      fileType,
      ocrText: ocrText || ""
    });
    
    if (!response.ok) {
      throw new Error("Failed to get category suggestion");
    }
    
    return await response.json();
  } catch (error) {
    console.error("Category suggestion error:", error);
    
    // Fallback to basic filename-based suggestion
    return getFallbackSuggestion(fileName, fileType);
  }
}

/**
 * Fallback category suggestion based on filename patterns
 */
function getFallbackSuggestion(fileName: string, fileType: string): SuggestionResult {
  const name = fileName.toLowerCase();
  
  // Simple pattern matching for common document types
  if (name.includes('bill') || name.includes('invoice') || name.includes('utility')) {
    return {
      suggested: {
        category: 'Bills & Utilities',
        confidence: 0.7,
        reason: 'Filename contains billing-related keywords'
      },
      alternatives: [
        { category: 'Financial', confidence: 0.6, reason: 'Alternative billing category' }
      ]
    };
  }
  
  if (name.includes('insurance') || name.includes('policy')) {
    return {
      suggested: {
        category: 'Insurance',
        confidence: 0.8,
        reason: 'Filename contains insurance keywords'
      },
      alternatives: [
        { category: 'Legal', confidence: 0.4, reason: 'Alternative for policy documents' }
      ]
    };
  }
  
  if (name.includes('receipt') || name.includes('purchase')) {
    return {
      suggested: {
        category: 'Financial',
        confidence: 0.7,
        reason: 'Filename indicates financial transaction'
      },
      alternatives: [
        { category: 'Other', confidence: 0.3, reason: 'General category' }
      ]
    };
  }
  
  if (name.includes('contract') || name.includes('agreement') || name.includes('legal')) {
    return {
      suggested: {
        category: 'Legal',
        confidence: 0.8,
        reason: 'Filename contains legal keywords'
      },
      alternatives: [
        { category: 'Other', confidence: 0.2, reason: 'General category' }
      ]
    };
  }
  
  if (fileType.includes('image') || name.includes('photo') || name.includes('scan')) {
    return {
      suggested: {
        category: 'Other',
        confidence: 0.5,
        reason: 'Image file - content analysis needed'
      },
      alternatives: [
        { category: 'Personal', confidence: 0.4, reason: 'Possible personal document' }
      ]
    };
  }
  
  // Default suggestion
  return {
    suggested: {
      category: 'Other',
      confidence: 0.3,
      reason: 'Unable to determine from filename'
    },
    alternatives: [
      { category: 'Personal', confidence: 0.2, reason: 'General personal category' }
    ]
  };
}