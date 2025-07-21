import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      const prompt = this.buildTagSuggestionPrompt(fileName, extractedText, mimeType, existingTags);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert document categorization assistant for a home document management system. Analyze documents and suggest relevant tags that would help homeowners organize and find their documents efficiently."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return this.validateAndFormatResponse(result);
    } catch (error) {
      console.error("Error suggesting tags:", error);
      return {
        suggestedTags: [],
        category: null,
        categoryConfidence: 0
      };
    }
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
    try {
      const prompt = `
Analyze the following document tags from a home document management system and provide suggestions for improvement:

${userTags.map(doc => `Document: ${doc.documentName}\nTags: ${doc.tags.join(', ')}`).join('\n\n')}

Please provide a JSON response with:
1. "duplicateTags": Array of objects with "original", "suggested", and "reason" for similar/duplicate tags that should be consolidated
2. "missingCommonTags": Array of common tags that might be missing across similar documents  
3. "tagHierarchy": Object showing suggested parent-child relationships between tags

Focus on home document categories like: bills, insurance, warranties, tax documents, medical records, property documents, etc.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a document organization expert. Help users maintain consistent and useful tagging systems."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      return JSON.parse(response.choices[0].message.content || "{}");
    } catch (error) {
      console.error("Error analyzing tag consistency:", error);
      return {
        duplicateTags: [],
        missingCommonTags: [],
        tagHierarchy: {}
      };
    }
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