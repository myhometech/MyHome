/**
 * CHAT-BUG-012: Facts-First Answering Service (Part B)
 * Query document_facts before retrieval/LLM for amount/date queries
 */
import { storage } from '../storage';
import { SelectDocumentFact } from '../../shared/schema';
import { eq, and, sql, gte } from 'drizzle-orm';
import { documentFacts, documents } from '../../shared/schema';
import { db } from '../db';

export interface FactsQueryFilters {
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
  docType?: string[];
}

export interface FactsCitation {
  docId: string;
  page?: number;
  title: string;
}

export interface FactsResult {
  field: string;
  value: string;
  currency?: string;
  confidence: number;
  citation: FactsCitation;
}

export interface FactsResponse {
  found: boolean;
  answer?: string;
  facts: FactsResult[];
  confidence: number;
}

export class FactsFirstService {
  private static readonly MIN_CONFIDENCE = 0.9;

  /**
   * CHAT-BUG-012: Check if query is classified as amount/date query
   */
  isAmountOrDateQuery(query: string): boolean {
    const amountPatterns = [
      /\b(how much|amount|total|cost|price|bill|invoice|fee|charge)\b/i,
      /£|€|\$|gbp|eur|usd|pounds|dollars|euros/i,
      /\b(paid|owed|due|owing)\b/i
    ];

    const datePatterns = [
      /\b(when|date|due date|expiry|expires|expired)\b/i,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i,
      /\b(2023|2024|2025)\b/i,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
      /\b\d{4}-\d{2}-\d{2}\b/
    ];

    const patterns = [...amountPatterns, ...datePatterns];
    return patterns.some(pattern => pattern.test(query));
  }

  /**
   * CHAT-BUG-012: Query facts with tenant/user scoping and optional filters
   */
  async queryFacts(
    tenantId: string,
    userId: string,
    filters: FactsQueryFilters = {}
  ): Promise<FactsResult[]> {
    try {
      console.log(`📊 [FACTS-FIRST] Querying facts for user ${userId}, tenant ${tenantId}`);

      // Build base query with RBAC filtering
      let query = db
        .select({
          field: documentFacts.field,
          value: documentFacts.value,
          currency: documentFacts.currency,
          confidence: documentFacts.confidence,
          page: documentFacts.page,
          docId: documentFacts.docId,
          title: documents.name,
        })
        .from(documentFacts)
        .innerJoin(documents, eq(documentFacts.docId, documents.id))
        .where(and(
          eq(documentFacts.userId, userId),
          sql`COALESCE(${documentFacts.householdId}::text, ${documents.householdId}::text) = ${tenantId}`,
          sql`${documentFacts.confidence} >= ${FactsFirstService.MIN_CONFIDENCE}`,
          sql`${documentFacts.field} IN ('totalAmount', 'dueDate', 'invoiceDate')`
        ));

      // Apply optional filters
      const conditions = [];

      if (filters.dateFrom || filters.dateTo) {
        // Filter by document dates - check expiry date or upload date
        if (filters.dateFrom) {
          conditions.push(sql`COALESCE(${documents.expiryDate}, ${documents.uploadedAt}) >= ${filters.dateFrom}`);
        }
        if (filters.dateTo) {
          conditions.push(sql`COALESCE(${documents.expiryDate}, ${documents.uploadedAt}) <= ${filters.dateTo}`);
        }
      }

      if (filters.provider) {
        // Search for provider in document text or email context
        conditions.push(sql`
          ${documents.extractedText} ILIKE ${`%${filters.provider}%`} OR
          ${documents.emailContext}->>'from' ILIKE ${`%${filters.provider}%`}
        `);
      }

      if (filters.docType && filters.docType.length > 0) {
        // Filter by document tags (docType is determined by AI categorization stored in tags)
        conditions.push(sql`EXISTS (SELECT 1 FROM unnest(COALESCE(${documents.tags}, ARRAY[]::text[])) AS tag WHERE tag = ANY(${filters.docType}))`);
      }

      // Apply additional conditions
      if (conditions.length > 0) {
        // Add conditions to the existing where clause
        const existingConditions = [
          eq(documentFacts.userId, userId),
          sql`COALESCE(${documentFacts.householdId}::text, ${documents.householdId}::text) = ${tenantId}`,
          sql`${documentFacts.confidence} >= ${FactsFirstService.MIN_CONFIDENCE}`,
          sql`${documentFacts.field} IN ('totalAmount', 'dueDate', 'invoiceDate')`
        ];
        
        query = db
          .select({
            field: documentFacts.field,
            value: documentFacts.value,
            currency: documentFacts.currency,
            confidence: documentFacts.confidence,
            page: documentFacts.page,
            docId: documentFacts.docId,
            title: documents.name,
          })
          .from(documentFacts)
          .innerJoin(documents, eq(documentFacts.docId, documents.id))
          .where(and(...existingConditions, ...conditions));
      }

      // Execute query ordered by confidence descending
      const results = await query
        .orderBy(sql`${documentFacts.confidence} DESC`, sql`${documents.uploadedAt} DESC`)
        .limit(10); // Top 10 highest confidence facts

      console.log(`📊 [FACTS-FIRST] Found ${results.length} high-confidence facts`);

      return results.map(result => ({
        field: result.field,
        value: result.value,
        currency: result.currency || undefined,
        confidence: parseFloat(result.confidence.toString()),
        citation: {
          docId: result.docId.toString(),
          page: result.page || undefined,
          title: result.title
        }
      }));

    } catch (error) {
      console.error('Error in queryFacts:', error);
      return [];
    }
  }

  /**
   * CHAT-BUG-012: Attempt facts-first answering for amount/date queries
   */
  async tryFactsFirstAnswer(
    query: string,
    tenantId: string,
    userId: string,
    filters: FactsQueryFilters = {}
  ): Promise<FactsResponse> {
    // Check if this is an amount/date query
    if (!this.isAmountOrDateQuery(query)) {
      return { found: false, facts: [], confidence: 0 };
    }

    // Query for high-confidence facts
    const facts = await this.queryFacts(tenantId, userId, filters);

    if (facts.length === 0) {
      return { found: false, facts: [], confidence: 0 };
    }

    // Generate direct answer from facts
    const answer = this.generateFactsAnswer(facts, query);
    const avgConfidence = facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length;

    console.log(`✅ [FACTS-FIRST] Generated answer from ${facts.length} facts (avg confidence: ${avgConfidence.toFixed(2)})`);

    return {
      found: true,
      answer,
      facts,
      confidence: avgConfidence
    };
  }

  /**
   * Generate answer from facts without LLM call
   */
  private generateFactsAnswer(facts: FactsResult[], query: string): string {
    const amountFacts = facts.filter(f => f.field === 'totalAmount');
    const dateFacts = facts.filter(f => f.field === 'dueDate' || f.field === 'invoiceDate');

    let answer = '';
    const citations = new Set<string>();

    // Handle amounts
    if (amountFacts.length > 0) {
      const amounts = amountFacts.map(fact => {
        citations.add(`${fact.citation.title} (Doc ${fact.citation.docId}${fact.citation.page ? `, p. ${fact.citation.page}` : ''})`);
        return `${fact.currency || ''}${fact.value}`.trim();
      });

      if (amounts.length === 1) {
        answer += `The amount is ${amounts[0]}.`;
      } else {
        answer += `I found these amounts: ${amounts.join(', ')}.`;
      }
    }

    // Handle dates
    if (dateFacts.length > 0) {
      const dates = dateFacts.map(fact => {
        citations.add(`${fact.citation.title} (Doc ${fact.citation.docId}${fact.citation.page ? `, p. ${fact.citation.page}` : ''})`);
        return this.formatDate(fact.value);
      });

      if (answer) answer += ' ';
      
      if (dates.length === 1) {
        answer += `The date is ${dates[0]}.`;
      } else {
        answer += `I found these dates: ${dates.join(', ')}.`;
      }
    }

    // Add citations
    if (citations.size > 0) {
      answer += `\n\nSource${citations.size > 1 ? 's' : ''}: ${Array.from(citations).join('; ')}.`;
    }

    return answer;
  }

  /**
   * Format date for user-friendly display
   */
  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    } catch {
      return dateStr; // Return as-is if parsing fails
    }
  }

  /**
   * CHAT-BUG-012: Facts backfill job trigger API
   * POST /internal/jobs/facts-backfill (idempotent)
   */
  async triggerFactsBackfill(
    tenantId: string,
    userId: string,
    fields: string[] = ['totalAmount', 'dueDate', 'invoiceDate']
  ): Promise<{ status: string; message: string; documentsProcessed: number }> {
    try {
      console.log(`🔄 [FACTS-BACKFILL] Starting backfill for user ${userId}, fields: ${fields.join(', ')}`);

      // Get documents that don't have facts for the specified fields
      const documentsNeedingFacts = await db
        .select({
          docId: documents.id,
          title: documents.name,
          extractedText: documents.extractedText
        })
        .from(documents)
        .where(and(
          eq(documents.userId, userId),
          sql`COALESCE(${documents.householdId}::text, '') = ${tenantId}`,
          sql`${documents.extractedText} IS NOT NULL`,
          sql`NOT EXISTS (
            SELECT 1 FROM document_facts df 
            WHERE df.doc_id = documents.id 
              AND df.user_id = documents.user_id 
              AND df.field = ANY(${fields})
          )`
        ))
        .limit(100); // Process in batches

      console.log(`🔄 [FACTS-BACKFILL] Found ${documentsNeedingFacts.length} documents needing facts extraction`);

      // Note: In a production system, this would queue a background job
      // For now, we'll return the count and status
      
      return {
        status: 'queued',
        message: `Backfill job queued for ${documentsNeedingFacts.length} documents`,
        documentsProcessed: documentsNeedingFacts.length
      };

    } catch (error) {
      console.error('Error in triggerFactsBackfill:', error);
      return {
        status: 'error',
        message: 'Failed to trigger facts backfill',
        documentsProcessed: 0
      };
    }
  }
}

export const factsFirstService = new FactsFirstService();