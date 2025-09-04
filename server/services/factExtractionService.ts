import { LLMClient } from './llmClient';
import { InsertDocumentFact } from '../../shared/schema';
import { storage } from '../storage';

/**
 * CHAT-008: Service for extracting structured facts from document text
 * Integrates with existing OCR pipeline to extract key fields like amounts, dates, account numbers
 */
export class FactExtractionService {
  private llmClient: LLMClient;

  constructor() {
    this.llmClient = new LLMClient();
  }

  /**
   * Extract structured facts from document text using LLM
   */
  async extractFacts(
    extractedText: string,
    fileName: string,
    userId: string,
    householdId: string | null = null
  ): Promise<ExtractedFact[]> {
    if (!extractedText || extractedText.length < 20) {
      console.log('Insufficient text for fact extraction, skipping');
      return [];
    }

    const requestId = `fact-extract-${Date.now()}`;
    console.log(`[${requestId}] Starting fact extraction for: ${fileName}`);

    try {
      const prompt = this.buildExtractionPrompt(extractedText, fileName);
      
      const response = await this.llmClient.createChatCompletion({
        messages: [
          {
            role: 'system',
            content: 'You are an expert document analysis assistant. Extract structured facts from documents with high precision. Always respond with valid JSON.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistency
        max_tokens: 2000,
        model: 'mistral-small-latest'
      }, {
        userId,
        householdId,
        documentName: fileName
      });

      const facts = this.parseLLMResponse(response.content, requestId);
      console.log(`[${requestId}] Extracted ${facts.length} facts with confidence >= 0.5`);
      
      return facts;

    } catch (error: any) {
      console.error(`[${requestId}] Fact extraction failed:`, error);
      // Don't throw - return empty array so document processing can continue
      return [];
    }
  }

  /**
   * Store extracted facts in database with proper RBAC
   */
  async storeFacts(
    docId: number,
    userId: string,
    householdId: string | null,
    facts: ExtractedFact[]
  ): Promise<void> {
    if (facts.length === 0) {
      return;
    }

    // Use imported storage instance
    const requestId = `fact-store-${Date.now()}`;
    console.log(`[${requestId}] Storing ${facts.length} facts for document ${docId}`);

    try {
      // Convert to database format
      const documentFacts: InsertDocumentFact[] = facts.map(fact => ({
        householdId,
        userId,
        docId,
        field: fact.field,
        value: fact.value,
        currency: fact.currency || null,
        confidence: fact.confidence.toFixed(2),
        page: fact.page || null,
        bbox: fact.bbox || null
      }));

      // Use upsert pattern to handle duplicates
      for (const fact of documentFacts) {
        await storage.createDocumentFact(fact);
      }

      console.log(`[${requestId}] Successfully stored facts for document ${docId}`);

      // Log extraction for audit trail
      await this.logFactExtraction(docId, userId, facts.length, requestId);

    } catch (error: any) {
      console.error(`[${requestId}] Failed to store facts:`, error);
      throw error;
    }
  }

  /**
   * Extract and store facts for a document (main entry point)
   */
  async processDocumentFacts(
    docId: number,
    extractedText: string,
    fileName: string,
    userId: string,
    householdId: string | null = null
  ): Promise<{ factsExtracted: number; confidence: number }> {
    const facts = await this.extractFacts(extractedText, fileName, userId, householdId);
    
    if (facts.length > 0) {
      await this.storeFacts(docId, userId, householdId, facts);
      
      // Calculate average confidence
      const avgConfidence = facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length;
      return { factsExtracted: facts.length, confidence: avgConfidence };
    }

    return { factsExtracted: 0, confidence: 0 };
  }

  /**
   * Build the LLM prompt for fact extraction
   */
  private buildExtractionPrompt(text: string, fileName: string): string {
    return `
Analyze this document and extract key structured facts. Focus on financial information, dates, and identifiers commonly found in bills, invoices, statements, and official documents.

Document: ${fileName}

Extract the following fields if present (return null for missing fields):

1. **totalAmount**: The main total/final amount due (decimal number only, no currency symbol)
2. **dueDate**: Payment due date (ISO format: YYYY-MM-DD)
3. **invoiceDate**: Invoice/statement date (ISO format: YYYY-MM-DD)  
4. **billingPeriodStart**: Start of billing period (ISO format: YYYY-MM-DD)
5. **billingPeriodEnd**: End of billing period (ISO format: YYYY-MM-DD)
6. **accountNumber**: Account/customer number (string)
7. **provider**: Company/service provider name (string)
8. **currency**: Currency code (GBP, USD, EUR, etc.)

For each fact found, provide:
- field: field name
- value: extracted value 
- confidence: 0-1 score (only include facts with confidence >= 0.5)
- page: page number if known (optional)

Return valid JSON in this exact format:
{
  "facts": [
    {
      "field": "totalAmount", 
      "value": "54.20",
      "currency": "GBP",
      "confidence": 0.95,
      "page": 1
    }
  ]
}

Document text:
${text.substring(0, 4000)}
`.trim();
  }

  /**
   * Parse LLM response and extract facts
   */
  private parseLLMResponse(response: string, requestId: string): ExtractedFact[] {
    try {
      const parsed = this.llmClient.parseJSONResponse(response, requestId);
      
      if (!parsed.facts || !Array.isArray(parsed.facts)) {
        console.warn(`[${requestId}] Invalid response format - no facts array`);
        return [];
      }

      return parsed.facts
        .filter((fact: any) => {
          // Validate fact structure and confidence threshold
          return fact.field && fact.value && fact.confidence >= 0.5;
        })
        .map((fact: any) => ({
          field: String(fact.field),
          value: String(fact.value),
          currency: fact.currency ? String(fact.currency) : undefined,
          confidence: Number(fact.confidence),
          page: fact.page ? Number(fact.page) : undefined,
          bbox: fact.bbox || undefined
        }));

    } catch (error: any) {
      console.error(`[${requestId}] Failed to parse LLM response:`, error);
      return [];
    }
  }

  /**
   * Log fact extraction for audit purposes
   */
  private async logFactExtraction(
    docId: number,
    userId: string,
    factsCount: number,
    requestId: string
  ): Promise<void> {
    try {
      // Log to console for now - audit system integration can be added later
      console.log(`[AUDIT] Fact extraction completed: docId=${docId}, userId=${userId}, facts=${factsCount}, requestId=${requestId}`);
    } catch (error) {
      // Don't fail if audit logging fails
      console.warn(`[${requestId}] Audit logging failed:`, error);
    }
  }
}

/**
 * Types for extracted facts
 */
export interface ExtractedFact {
  field: string;
  value: string;
  currency?: string;
  confidence: number;
  page?: number;
  bbox?: [number, number, number, number]; // [x1, y1, x2, y2]
}

// Singleton instance
export const factExtractionService = new FactExtractionService();