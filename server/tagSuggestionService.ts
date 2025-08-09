// Tag suggestion service using basic text analysis (no external API required)

export interface TagSuggestion {
  tag: string;
  confidence: number;
  reasoning: string;
}

export interface TagSuggestionResponse {
  suggestedTags: TagSuggestion[];
  category: string | null;
  categoryConfidence: number;
}

export class TagSuggestionService {
  /**
   * Analyze document content and suggest relevant tags
   */
  async suggestTags(
    fileName: string,
    extractedText?: string,
    mimeType?: string,
    existingTags: string[] = []
  ): Promise<TagSuggestionResponse> {
    try {
      // Use basic keyword analysis instead of AI
      const suggestions = this.analyzeWithKeywords(fileName, extractedText);
      return {
        suggestedTags: suggestions.tags,
        category: suggestions.category,
        categoryConfidence: suggestions.confidence
      };
    } catch (error) {
      console.error("Error suggesting tags:", error);
      return {
        suggestedTags: [],
        category: null,
        categoryConfidence: 0
      };
    }
  }

  private analyzeWithKeywords(fileName: string, extractedText?: string): {tags: TagSuggestion[], category: string | null, confidence: number} {
    const text = `${fileName} ${extractedText || ''}`.toLowerCase();
    const tags: TagSuggestion[] = [];
    let category: string | null = null;
    let confidence = 0.7;

    // Insurance-related keywords
    if (text.includes('insurance') || text.includes('policy') || text.includes('premium')) {
      tags.push({tag: 'insurance', confidence: 0.9, reasoning: 'Contains insurance-related terms'});
      category = 'Insurance';
      confidence = 0.9;
    }
    
    // Bills and utilities
    if (text.includes('bill') || text.includes('electric') || text.includes('water') || text.includes('gas')) {
      tags.push({tag: 'utility', confidence: 0.8, reasoning: 'Contains utility bill terms'});
      if (!category) { category = 'Utilities'; confidence = 0.8; }
    }
    
    // Financial documents
    if (text.includes('mortgage') || text.includes('loan') || text.includes('bank')) {
      tags.push({tag: 'financial', confidence: 0.8, reasoning: 'Contains financial terms'});
      if (!category) { category = 'Financial'; confidence = 0.8; }
    }
    
    // Car-related
    if (text.includes('car') || text.includes('vehicle') || text.includes('auto')) {
      tags.push({tag: 'vehicle', confidence: 0.8, reasoning: 'Contains vehicle-related terms'});
      if (!category) { category = 'Car'; confidence = 0.8; }
    }
    
    // Receipts
    if (text.includes('receipt') || text.includes('purchase') || text.includes('total')) {
      tags.push({tag: 'receipt', confidence: 0.7, reasoning: 'Contains receipt terms'});
      if (!category) { category = 'Receipts'; confidence = 0.7; }
    }

    return {tags, category, confidence};
  }

  /**
   * Get tag suggestions for multiple documents at once
   */
  async suggestTagsForBatch(documents: Array<{
    id: number;
    fileName: string;
    extractedText?: string;
    mimeType?: string;
    existingTags?: string[];
  }>): Promise<Record<number, TagSuggestionResponse>> {
    const results: Record<number, TagSuggestionResponse> = {};
    
    // Process in parallel batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const promises = batch.map(async (doc) => {
        const suggestions = await this.suggestTags(
          doc.fileName,
          doc.extractedText,
          doc.mimeType,
          doc.existingTags || []
        );
        return { id: doc.id, suggestions };
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ id, suggestions }) => {
        results[id] = suggestions;
      });
    }
    
    return results;
  }

  /**
   * Analyze existing tags across all user documents and suggest improvements
   */
  async analyzeTagConsistency(userTags: Array<{
    documentName: string;
    tags: string[];
  }>): Promise<{
    duplicateTags: Array<{ original: string; suggested: string; reason: string }>;
    missingCommonTags: string[];
    tagHierarchy: Record<string, string[]>;
  }> {
    // Basic tag analysis without external API
    return {
      duplicateTags: [],
      missingCommonTags: ['financial', 'important', 'annual'],
      tagHierarchy: {
        'financial': ['mortgage', 'loan', 'bank'],
        'utilities': ['electric', 'water', 'gas'],
        'insurance': ['auto', 'home', 'health']
      }
    };
  }

  private buildTagSuggestionPrompt(
    fileName: string,
    extractedText?: string,
    mimeType?: string,
    existingTags: string[] = []
  ): string {
    let prompt = `
Analyze this document and suggest relevant tags for a home document management system.

Document Information:
- Filename: ${fileName}
- File Type: ${mimeType || 'unknown'}
${existingTags.length > 0 ? `- Existing Tags: ${existingTags.join(', ')}` : ''}

${extractedText ? `Document Content (first 2000 chars):\n${extractedText.substring(0, 2000)}` : ''}

Please provide a JSON response with:
1. "suggestedTags": Array of objects with "tag", "confidence" (0-1), and "reasoning" for each suggested tag
2. "category": Best category for this document (or null if uncertain)
3. "categoryConfidence": Confidence in category suggestion (0-1)

Focus on tags that would help homeowners organize and find documents efficiently. Consider:
- Document type (bill, receipt, warranty, insurance, tax, medical, etc.)
- Service provider or company name
- Time period if relevant (monthly, annual, etc.)
- Importance level (urgent, important, reference, etc.)
- Action required (pay, renew, file, review, etc.)

Avoid suggesting tags that are already in the existing tags list.
Limit to 3-6 most relevant and useful tags.
`;

    return prompt;
  }

  private validateAndFormatResponse(result: any): TagSuggestionResponse {
    const suggestedTags: TagSuggestion[] = (result.suggestedTags || [])
      .filter((tag: any) => tag.tag && typeof tag.confidence === 'number')
      .map((tag: any) => ({
        tag: tag.tag.toLowerCase().trim(),
        confidence: Math.max(0, Math.min(1, tag.confidence)),
        reasoning: tag.reasoning || ''
      }))
      .slice(0, 6); // Limit to 6 tags

    return {
      suggestedTags,
      category: result.category || null,
      categoryConfidence: Math.max(0, Math.min(1, result.categoryConfidence || 0))
    };
  }
}

export const tagSuggestionService = new TagSuggestionService();