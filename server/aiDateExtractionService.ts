import { llmClient } from './services/llmClient.js';

// DOC-304: AI-powered date extraction service
export interface ExtractedDate {
  type: 'expiry' | 'due' | 'renewal' | 'valid_until' | 'expires';
  date: string; // ISO 8601 format
  confidence: number; // 0-1
  source: 'ai' | 'ocr';
  context?: string; // Additional context about where the date was found
}

export class AIDateExtractionService {
  private isAvailable: boolean = false;

  constructor() {
    // Check LLM client availability (TICKET 3)
    const status = llmClient.getStatus();
    this.isAvailable = status.available;
    
    if (this.isAvailable) {
      console.log(`✅ AI Date Extraction Service initialized with ${status.provider} (${status.model})`);
    } else {
      console.warn('⚠️ AI Date Extraction Service: LLM client not available');
    }
  }

  /**
   * TICKET 15: Enhanced regex-based date extraction for common patterns
   */
  private extractDatesWithRegex(text: string): ExtractedDate[] {
    const extractedDates: ExtractedDate[] = [];
    const datePatterns = [
      // Expiry patterns
      { pattern: /expir(?:es?|y|ation)?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi, type: 'expiry' as const },
      { pattern: /exp(?:ires?|iry)?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi, type: 'expiry' as const },
      // Due patterns
      { pattern: /due\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi, type: 'due' as const },
      { pattern: /payment\s*due\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi, type: 'due' as const },
      // Valid until patterns
      { pattern: /valid\s*until\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi, type: 'valid_until' as const },
      { pattern: /valid\s*through\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi, type: 'valid_until' as const },
      // Renewal patterns
      { pattern: /renew(?:al)?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi, type: 'renewal' as const }
    ];

    for (const { pattern, type } of datePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const dateStr = match[1];
        try {
          // Parse and normalize date
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
            const isoDate = parsedDate.toISOString().split('T')[0];
            extractedDates.push({
              type,
              date: isoDate,
              confidence: 0.85, // High confidence for regex matches
              source: 'ai',
              context: `Regex pattern: ${match[0]}`
            });
          }
        } catch (error) {
          // Skip invalid dates
        }
      }
    }

    return extractedDates;
  }

  /**
   * DOC-304: Extract dates from OCR text using GPT-3.5-turbo with regex fallback (TICKET 15: Feature flag protected)
   */
  async extractDatesFromText(text: string, documentName?: string, userId?: string): Promise<ExtractedDate[]> {
    if (!this.isAvailable || !text?.trim()) {
      return [];
    }

    const requestId = Math.random().toString(36).substring(2, 8);
    console.log(`[${requestId}] DOC-304: Starting date extraction for document: ${documentName}`);

    // TICKET 15: Try regex-based extraction first
    const regexDates = this.extractDatesWithRegex(text);
    if (regexDates.length > 0) {
      console.log(`[${requestId}] DOC-304: Found ${regexDates.length} dates with regex patterns, skipping AI call`);
      return regexDates;
    }

    console.log(`[${requestId}] DOC-304: No regex matches found, checking AI extraction availability`);

    // TICKET 15: Check if AI date extraction is enabled for this user
    if (userId) {
      try {
        const { featureFlagService } = await import('./featureFlagService');
        const { storage } = await import('./storage');
        
        const user = await storage.getUser(userId);
        if (user) {
          const hasAIDateExtraction = await featureFlagService.isFeatureEnabled('ai_date_extraction', {
            userId,
            userTier: user.subscriptionTier as 'free' | 'premium',
            sessionId: '', 
            userAgent: '',
            ipAddress: ''
          });

          if (!hasAIDateExtraction) {
            console.log(`[${requestId}] DOC-304: AI date extraction disabled for user ${userId} - using regex results only`);
            return regexDates; // Return empty array if no regex matches and AI disabled
          }
        }
      } catch (error) {
        console.warn('Failed to check AI date extraction feature flag, proceeding with AI extraction:', error);
      }
    }

    console.log(`[${requestId}] DOC-304: Using AI extraction`);

    try {
      const flattened_prompt = this.buildMistralDateExtractionPrompt(text, documentName);
      
      const response = await llmClient.createChatCompletion({
        messages: [{ role: "user", content: flattened_prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1000
      }, {
        userId,
        route: '/api/documents/process'
      });

      const result = llmClient.parseJSONResponse(response.content);
      
      // Log LLM usage for admin tracking (TICKET 3)
      const status = llmClient.getStatus();
      console.log(`[${requestId}] Model: ${status.model}, Provider: ${status.provider}, Tokens: ${response.usage?.total_tokens || 'unknown'}`);
      
      console.log(`[${requestId}] DOC-304: AI response received:`, {
        datesFound: result.dates?.length || 0,
        reasoning: result.reasoning?.substring(0, 100) + '...' || 'No reasoning provided'
      });

      return this.parseAIResponse(result, requestId);

    } catch (error) {
      console.error(`[${requestId}] DOC-304: AI date extraction failed:`, error);
      
      // Log error details for debugging
      if (error instanceof Error) {
        console.error(`[${requestId}] Error details:`, {
          message: error.message,
          name: error.name,
          stack: error.stack?.substring(0, 200)
        });
      }

      return [];
    }
  }

  /**
   * TICKET 15: Truncate text to top/bottom 1000 characters for cost optimization
   */
  private truncateTextForAI(text: string): string {
    if (text.length <= 2000) {
      return text;
    }
    
    const firstPart = text.substring(0, 1000);
    const lastPart = text.substring(text.length - 1000);
    return `${firstPart}\n\n...(truncated for cost optimization)...\n\n${lastPart}`;
  }

  /**
   * Build flattened prompt for Mistral date extraction (TICKET 3)
   */
  private buildMistralDateExtractionPrompt(text: string, documentName?: string): string {
    return `You are an expert document analyzer specializing in extracting important dates from business documents. Analyze the provided text and identify key dates with their types and confidence levels.

Your task is to extract due, expiry, or renewal dates from a document's text. Return dates as YYYY-MM-DD and use structured JSON format.

Analyze this document text and extract important dates. Focus on dates that indicate when something expires, is due, needs renewal, or has a deadline.

Document name: ${documentName || 'Unknown'}

Document text:
"""
${this.truncateTextForAI(text)}
"""

Instructions:
1. Look for dates associated with these contexts:
   - Expiry dates (expires, expiration, exp date)
   - Due dates (due, payment due, deadline)
   - Renewal dates (renewal, renew by, renewal date)
   - Valid until dates (valid until, valid through, good until)
   - Other important deadlines

2. For each date found, determine:
   - The exact date in ISO 8601 format (YYYY-MM-DD)
   - The type of date (expiry_date, due_date, renewal_date)
   - Confidence level (0.0 to 1.0) based on clarity and context
   - Brief context explaining where/how the date was found

3. Only include dates that are:
   - Clearly identifiable and parseable
   - Related to important document events
   - Not historical dates (like document creation dates)

4. Prioritize dates that appear near relevant keywords and in structured formats

Return your analysis as JSON in this exact format:
[
  {
    "type": "expiry_date",
    "date": "2025-12-31",
    "confidence": 0.85,
    "context": "Payment due on or before August 15, 2025"
  }
]`;
  }

  /**
   * Parse and validate AI response (TICKET 3: Updated for Mistral array format)
   */
  private parseAIResponse(result: any, requestId: string): ExtractedDate[] {
    const extractedDates: ExtractedDate[] = [];

    // Handle both array format (Mistral) and object format (legacy)
    const datesArray = Array.isArray(result) ? result : (result.dates || []);
    
    if (!Array.isArray(datesArray)) {
      console.warn(`[${requestId}] DOC-304: Invalid AI response format - no dates array`);
      return extractedDates;
    }

    for (const dateObj of datesArray) {
      try {
        // Validate required fields
        if (!dateObj.type || !dateObj.date || typeof dateObj.confidence !== 'number') {
          console.warn(`[${requestId}] DOC-304: Invalid date object:`, dateObj);
          continue;
        }

        // Validate date format and parse
        const parsedDate = new Date(dateObj.date);
        if (isNaN(parsedDate.getTime())) {
          console.warn(`[${requestId}] DOC-304: Invalid date format: ${dateObj.date}`);
          continue;
        }

        // Validate and normalize date type (TICKET 3: Handle Mistral format)
        const validTypes = ['expiry', 'due', 'renewal', 'valid_until', 'expires', 'expiry_date', 'due_date', 'renewal_date'];
        if (!validTypes.includes(dateObj.type)) {
          console.warn(`[${requestId}] DOC-304: Invalid date type: ${dateObj.type}`);
          continue;
        }
        
        // Normalize date types from Mistral format to legacy format
        const normalizedType = dateObj.type.replace('_date', '') as ExtractedDate['type'];

        // Validate confidence range
        const confidence = Math.max(0, Math.min(1, dateObj.confidence));

        // Only include dates with reasonable confidence (TICKET 3: preserve ≥0.5 threshold)
        if (confidence >= 0.5) {
          extractedDates.push({
            type: normalizedType,
            date: dateObj.date,
            confidence,
            source: 'ai',
            context: dateObj.context || 'AI-extracted date'
          });

          console.log(`[${requestId}] DOC-304: Valid date extracted:`, {
            type: normalizedType,
            date: dateObj.date,
            confidence,
            context: dateObj.context?.substring(0, 50) + '...' || 'No context'
          });
        } else {
          console.log(`[${requestId}] DOC-304: Low confidence date rejected: ${dateObj.date} (confidence: ${confidence})`);
        }

      } catch (parseError) {
        console.error(`[${requestId}] DOC-304: Error parsing date object:`, parseError, dateObj);
      }
    }

    console.log(`[${requestId}] DOC-304: Successfully parsed ${extractedDates.length} dates from AI response`);
    return extractedDates;
  }

  /**
   * Check if AI date extraction is available
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Get service status for debugging
   */
  getServiceStatus(): { available: boolean; reason?: string } {
    if (this.isAvailable) {
      return { available: true };
    }

    return {
      available: false,
      reason: 'LLM client not configured'
    };
  }
}

// Export singleton instance
export const aiDateExtractionService = new AIDateExtractionService();