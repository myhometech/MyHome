import OpenAI from 'openai';

// DOC-304: AI-powered date extraction service
export interface ExtractedDate {
  type: 'expiry' | 'due' | 'renewal' | 'valid_until' | 'expires';
  date: string; // ISO 8601 format
  confidence: number; // 0-1
  source: 'ai' | 'ocr';
  context?: string; // Additional context about where the date was found
}

export class AIDateExtractionService {
  private openai!: OpenAI;
  private isAvailable: boolean = false;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY 
      });
      this.isAvailable = true;
      console.log('✅ AI Date Extraction Service initialized with OpenAI API');
    } else {
      console.warn('⚠️ AI Date Extraction Service: OpenAI API key not available');
    }
  }

  /**
   * DOC-304: Extract dates from OCR text using GPT-4
   */
  async extractDatesFromText(text: string, documentName?: string): Promise<ExtractedDate[]> {
    if (!this.isAvailable || !text?.trim()) {
      return [];
    }

    const requestId = Math.random().toString(36).substring(2, 8);
    console.log(`[${requestId}] DOC-304: Starting AI date extraction for document: ${documentName}`);

    try {
      const prompt = this.buildDateExtractionPrompt(text, documentName);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert document analyzer specializing in extracting important dates from business documents. Analyze the provided text and identify key dates with their types and confidence levels."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1000
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
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
   * Build comprehensive prompt for GPT-4 date extraction
   */
  private buildDateExtractionPrompt(text: string, documentName?: string): string {
    return `Analyze this document text and extract important dates. Focus on dates that indicate when something expires, is due, needs renewal, or has a deadline.

Document name: ${documentName || 'Unknown'}

Document text:
"""
${text.substring(0, 2000)} ${text.length > 2000 ? '...(truncated)' : ''}
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
   - The type of date (expiry, due, renewal, valid_until, expires)
   - Confidence level (0.0 to 1.0) based on clarity and context
   - Brief context explaining where/how the date was found

3. Only include dates that are:
   - Clearly identifiable and parseable
   - Related to important document events
   - Not historical dates (like document creation dates)

4. Prioritize dates that appear near relevant keywords and in structured formats

Return your analysis as JSON in this exact format:
{
  "dates": [
    {
      "type": "expiry",
      "date": "2024-12-31",
      "confidence": 0.95,
      "context": "Policy expires December 31, 2024"
    }
  ],
  "reasoning": "Brief explanation of your analysis and why these dates were selected"
}`;
  }

  /**
   * Parse and validate AI response
   */
  private parseAIResponse(result: any, requestId: string): ExtractedDate[] {
    const extractedDates: ExtractedDate[] = [];

    if (!result.dates || !Array.isArray(result.dates)) {
      console.warn(`[${requestId}] DOC-304: Invalid AI response format - no dates array`);
      return extractedDates;
    }

    for (const dateObj of result.dates) {
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

        // Validate date type
        const validTypes = ['expiry', 'due', 'renewal', 'valid_until', 'expires'];
        if (!validTypes.includes(dateObj.type)) {
          console.warn(`[${requestId}] DOC-304: Invalid date type: ${dateObj.type}`);
          continue;
        }

        // Validate confidence range
        const confidence = Math.max(0, Math.min(1, dateObj.confidence));

        // Only include dates with reasonable confidence
        if (confidence >= 0.5) {
          extractedDates.push({
            type: dateObj.type,
            date: dateObj.date,
            confidence,
            source: 'ai',
            context: dateObj.context || 'AI-extracted date'
          });

          console.log(`[${requestId}] DOC-304: Valid date extracted:`, {
            type: dateObj.type,
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
      reason: 'OpenAI API key not configured'
    };
  }
}

// Export singleton instance
export const aiDateExtractionService = new AIDateExtractionService();