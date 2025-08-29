import { db } from "./db";
import { PostgresStorage } from "./storage";
import { 
  ChatRequest, 
  ChatResponse, 
  LLMChatResponse,
  llmChatResponseSchema,
  SearchSnippetsRequest 
} from "../shared/schema";
import { LLMAdapter } from "./services/llmAdapter";

export class ChatOrchestrationService {
  private storage = new PostgresStorage(db);
  private llmAdapter = new LLMAdapter();

  /**
   * Handle complete chat flow: search → LLM → verify → persist
   */
  async processChat(
    request: ChatRequest,
    userId: string,
    tenantId: string
  ): Promise<ChatResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`🤖 [CHAT] Processing query: "${request.message}" for user ${userId}`);

      // Step 1: Validate conversation exists and user has access
      const conversation = await this.storage.getConversation(request.conversationId, tenantId);
      if (!conversation) {
        throw new Error("Conversation not found or access denied");
      }

      // Step 2: Persist user message first
      const userMessage = await this.storage.createMessage({
        conversationId: request.conversationId,
        tenantId,
        userId,
        role: 'user',
        content: request.message,
      });

      // Step 3: Search for relevant documents
      const searchRequest: SearchSnippetsRequest = {
        query: request.message,
        filters: request.filters,
        limit: 20,
        snippetLimit: 3,
        snippetCharWindow: 300,
      };

      const searchResults = await this.storage.searchDocumentSnippets(searchRequest, tenantId);
      console.log(`🔍 [CHAT] Found ${searchResults.results.length} relevant documents`);

      // CHAT-008: Step 3.5: Gather structured facts for relevant documents
      const structuredFacts = await this.gatherStructuredFacts(searchResults.results, userId);
      console.log(`📊 [CHAT] Gathered ${structuredFacts.length} structured facts`);

      // Step 4: Build LLM prompt with context and structured facts
      const prompt = this.buildLLMPrompt(request.message, searchResults, structuredFacts);

      // Step 5: Call LLM with retry logic
      let llmResponse: LLMChatResponse;
      try {
        const llmRequest = {
          model: 'mistral-large',
          messages: [{ role: 'user' as const, content: prompt }],
          max_tokens: 500,
          temperature: 0.1, // Lower temperature for factual responses
          stop: [] // Add required stop parameter
        };
        const rawResponse = await this.llmAdapter.generate(llmRequest);
        
        llmResponse = await this.parseLLMResponse(rawResponse.text, prompt);
      } catch (llmError: any) {
        console.error(`❌ [CHAT] LLM failed:`, llmError);
        llmResponse = {
          answer: "INSUFFICIENT_EVIDENCE",
          citations: [],
          confidence: 0.0,
        };
      }

      // Step 6: Verify numeric/date accuracy
      const verifiedResponse = this.verifyResponseAccuracy(llmResponse, searchResults);

      // Step 7: Persist assistant message
      const docIdsTouched = searchResults.results.map(r => parseInt(r.docId)).filter(id => !isNaN(id));
      
      const assistantMessage = await this.storage.createMessage({
        conversationId: request.conversationId,
        tenantId,
        userId: null, // Assistant messages don't have a userId
        role: 'assistant',
        content: verifiedResponse.answer,
        citations: verifiedResponse.citations.map(c => ({
          docId: parseInt(c.docId),
          page: c.page
        })),
        verdict: {
          confidence: verifiedResponse.confidence,
          grounded: verifiedResponse.confidence >= 0.7,
          slots: verifiedResponse.slots || {}
        },
        usage: {
          model: 'mistral-large',
          prompt_tokens: Math.floor(prompt.length / 4), // Rough estimate
          completion_tokens: Math.floor(verifiedResponse.answer.length / 4),
        },
      });

      const duration = Date.now() - startTime;
      console.log(`✅ [CHAT] Completed in ${duration}ms with confidence ${verifiedResponse.confidence}`);

      return {
        conversationId: request.conversationId,
        answer: verifiedResponse.answer,
        citations: verifiedResponse.citations,
        slots: verifiedResponse.slots,
        confidence: verifiedResponse.confidence,
      };

    } catch (error: any) {
      console.error(`❌ [CHAT] Processing failed:`, error);
      
      // Return fallback response on error
      return {
        conversationId: request.conversationId,
        answer: "INSUFFICIENT_EVIDENCE",
        citations: [],
        confidence: 0.0,
      };
    }
  }

  /**
   * CHAT-008: Gather structured facts from relevant documents
   */
  private async gatherStructuredFacts(searchResults: any[], userId: string): Promise<any[]> {
    try {
      const allFacts = [];
      
      // Get unique document IDs from search results
      const docIds = Array.from(new Set(searchResults.map(result => parseInt(result.docId)).filter(id => !isNaN(id))));
      
      if (docIds.length === 0) {
        return [];
      }

      // Gather facts for each document
      for (const docId of docIds) {
        try {
          const documentFacts = await this.storage.getDocumentFacts(docId, userId);
          
          // Add document context to facts
          const documentTitle = searchResults.find(r => parseInt(r.docId) === docId)?.title || `Document ${docId}`;
          
          for (const fact of documentFacts) {
            allFacts.push({
              docId: fact.docId,
              documentTitle,
              field: fact.field,
              value: fact.value,
              currency: fact.currency,
              confidence: fact.confidence,
              page: fact.page
            });
          }
        } catch (error) {
          console.warn(`Failed to get facts for document ${docId}:`, error);
          // Continue with other documents
        }
      }

      return allFacts;
    } catch (error) {
      console.error('Error gathering structured facts:', error);
      return [];
    }
  }

  /**
   * Build structured LLM prompt with search context and structured facts
   */
  private buildLLMPrompt(question: string, searchResults: any, structuredFacts: any[] = []): string {
    const systemPrompt = `You are a document assistant. Answer ONLY from the provided context.
- Quote exact figures/dates verbatim.
- PRIORITIZE structured facts when available - they are pre-extracted and highly accurate.
- Always return JSON:
  { "answer": "...", "citations":[{"docId":"...", "page":1}], "slots":{"amount":"...", "currency":"...", "dueDate":"..."}, "confidence":0.95 }
- If you cannot ground the answer, return:
  {"answer":"INSUFFICIENT_EVIDENCE","citations":[], "confidence":0.0}`;

    let contextSection = "\n\nContext:\n";
    
    // CHAT-008: Add structured facts section first (higher priority)
    if (structuredFacts.length > 0) {
      contextSection += "\n=== STRUCTURED FACTS (High Accuracy) ===\n";
      
      for (const fact of structuredFacts) {
        contextSection += `Document ${fact.docId} (${fact.documentTitle}):\n`;
        contextSection += `  ${fact.field}: ${fact.value}`;
        if (fact.currency) contextSection += ` ${fact.currency}`;
        if (fact.page) contextSection += ` (Page ${fact.page})`;
        contextSection += ` [Confidence: ${(fact.confidence * 100).toFixed(1)}%]\n`;
      }
      contextSection += "\n";
    }
    
    // Add document snippets
    if (searchResults.results.length > 0) {
      contextSection += "=== DOCUMENT SNIPPETS ===\n";
      for (const result of searchResults.results) {
        contextSection += `\n--- Document ${result.docId} (${result.title}) ---\n`;
        for (const snippet of result.snippets) {
          contextSection += `Page ${snippet.page}: ${snippet.text}\n`;
        }
      }
    } else {
      contextSection += "No relevant documents found.";
    }

    return `${systemPrompt}\n\nUser: ${question}${contextSection}`;
  }

  /**
   * Parse LLM response with retry logic
   */
  private async parseLLMResponse(rawResponse: string, originalPrompt: string): Promise<LLMChatResponse> {
    try {
      // Try to parse the JSON response
      const parsed = JSON.parse(rawResponse);
      return llmChatResponseSchema.parse(parsed);
    } catch (parseError) {
      console.warn(`⚠️ [CHAT] Invalid JSON response, retrying with format instruction`);
      
      // Retry with explicit format instruction
      const retryPrompt = `${originalPrompt}\n\nIMPORTANT: Format your response as valid JSON only. No other text.`;
      
      try {
        const retryRequest = {
          model: 'mistral-large',
          messages: [{ role: 'user' as const, content: retryPrompt }],
          max_tokens: 500,
          temperature: 0.0, // Even lower temperature for retry
          stop: [] // Add required stop parameter
        };
        const retryResponse = await this.llmAdapter.generate(retryRequest);
        
        const parsed = JSON.parse(retryResponse.text);
        return llmChatResponseSchema.parse(parsed);
      } catch (retryError) {
        console.error(`❌ [CHAT] Retry also failed:`, retryError);
        
        // Return fallback response
        return {
          answer: "INSUFFICIENT_EVIDENCE",
          citations: [],
          confidence: 0.0,
        };
      }
    }
  }

  /**
   * Verify numeric/date accuracy against search results
   */
  private verifyResponseAccuracy(llmResponse: LLMChatResponse, searchResults: any): LLMChatResponse {
    if (llmResponse.answer === "INSUFFICIENT_EVIDENCE") {
      return llmResponse;
    }

    let verified = { ...llmResponse };
    
    // Extract amounts and dates from search snippets
    const snippetText = searchResults.results
      .flatMap((r: any) => r.snippets)
      .map((s: any) => s.text)
      .join(' ');

    // Check amount accuracy
    if (llmResponse.slots?.amount) {
      const amountPattern = new RegExp(`£?\\s*${llmResponse.slots.amount}`, 'i');
      if (!amountPattern.test(snippetText)) {
        console.warn(`⚠️ [CHAT] Amount ${llmResponse.slots.amount} not found in snippets`);
        verified.confidence = Math.max(0.1, verified.confidence * 0.5);
        verified.answer = "INSUFFICIENT_EVIDENCE";
      }
    }

    // Check date accuracy
    if (llmResponse.slots?.dueDate) {
      const dateStr = llmResponse.slots.dueDate;
      const datePattern = new RegExp(dateStr.replace(/-/g, '[-\\s]'), 'i');
      if (!datePattern.test(snippetText)) {
        console.warn(`⚠️ [CHAT] Date ${dateStr} not found in snippets`);
        verified.confidence = Math.max(0.1, verified.confidence * 0.5);
        if (verified.answer !== "INSUFFICIENT_EVIDENCE") {
          verified.answer = "INSUFFICIENT_EVIDENCE";
        }
      }
    }

    return verified;
  }
}

export const chatOrchestrationService = new ChatOrchestrationService();