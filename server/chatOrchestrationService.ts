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
import { LLMProviderFactory } from "./services/llmProviderFactory";
import { LlamaProvider } from "./services/llamaProvider";
import { featureFlagService } from "./featureFlagService";
import { llmUsageLogger } from "./llmUsageLogger";
import { modelEscalationAuditor } from "./services/modelEscalationAuditor";
import { factsFirstService } from "./services/factsFirstService";

export class ChatOrchestrationService {
  private storage = new PostgresStorage(db);
  private llmAdapter = LLMProviderFactory.getInstance();

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

      // CHAT-BUG-012 Step 2.5: Facts-first answering for amount/date queries
      const factsResponse = await factsFirstService.tryFactsFirstAnswer(
        request.message,
        tenantId,
        userId,
        {
          dateFrom: request.filters?.dateFrom,
          dateTo: request.filters?.dateTo,
          provider: request.filters?.provider,
          docType: request.filters?.docType
        }
      );

      if (factsResponse.found && factsResponse.answer) {
        console.log(`🎯 [FACTS-FIRST] Direct answer from ${factsResponse.facts.length} high-confidence facts`);
        
        // Create direct response from facts (no LLM needed)
        const factsCitations = factsResponse.facts.map(fact => ({
          docId: fact.citation.docId,
          page: fact.citation.page || undefined,
          title: fact.citation.title
        }));

        const assistantMessage = await this.storage.createMessage({
          conversationId: request.conversationId,
          tenantId,
          userId: null, // Assistant messages don't have a userId
          role: 'assistant',
          content: factsResponse.answer,
          citations: factsCitations.map(c => ({
            docId: parseInt(c.docId),
            page: c.page
          })),
          verdict: {
            confidence: factsResponse.confidence,
            grounded: true, // Facts are always grounded
            slots: {}
          },
          usage: {
            model: 'facts-first',
            prompt_tokens: 0,
            completion_tokens: 0,
          },
        });

        console.log(`✅ [FACTS-FIRST] Direct response completed with confidence ${factsResponse.confidence.toFixed(2)}`);

        return {
          conversationId: request.conversationId,
          answer: factsResponse.answer,
          citations: factsCitations,
          slots: {},
          confidence: factsResponse.confidence,
        };
      }

      // Step 3: Search for relevant documents (CHAT-BUG-012: Updated limits and window)
      const searchRequest: SearchSnippetsRequest = {
        query: request.message,
        filters: request.filters,
        limit: 50, // CHAT-BUG-012: Increased from 20
        snippetLimit: 4, // CHAT-BUG-012: Increased from 3
        snippetCharWindow: 320, // CHAT-BUG-012: Increased from 300 to ensure context isn't cut off
      };

      const searchResults = await this.storage.searchDocumentSnippets(searchRequest, tenantId);
      console.log(`🔍 [CHAT] Found ${searchResults.results.length} relevant documents`);

      // CHAT-BUG-012 Part D: Handle zero search results - don't escalate to 70B, provide document suggestions
      if (searchResults.results.length === 0) {
        console.log(`📋 [CHAT] Zero search results - generating document suggestions instead of LLM escalation`);
        
        // Get keyword-only document suggestions (title/date only)
        const documentSuggestions = await this.getDocumentSuggestions(request.message, tenantId, userId);
        
        let suggestionsText = '';
        if (documentSuggestions.length > 0) {
          const suggestionsList = documentSuggestions
            .slice(0, 3) // Top 3 suggestions
            .map((doc, index) => `${index + 1}. ${doc.title}${doc.date ? ` (${doc.date})` : ''}`)
            .join('\n');
          
          suggestionsText = `\n\nHere are some related documents that might help:\n${suggestionsList}`;
        }

        const noResultsResponse = `INSUFFICIENT_EVIDENCE${suggestionsText}`;

        // Persist the response without LLM processing
        const assistantMessage = await this.storage.createMessage({
          conversationId: request.conversationId,
          tenantId,
          userId: null,
          role: 'assistant',
          content: noResultsResponse,
          citations: [],
          verdict: {
            confidence: 0.0,
            grounded: false,
            slots: {}
          },
          usage: {
            model: 'no-escalation',
            prompt_tokens: 0,
            completion_tokens: 0,
          },
        });

        console.log(`✅ [CHAT] Zero-results response completed with document suggestions`);

        return {
          conversationId: request.conversationId,
          answer: noResultsResponse,
          citations: [],
          slots: {},
          confidence: 0.0,
        };
      }

      // CHAT-008: Step 3.5: Gather structured facts for relevant documents
      const structuredFacts = await this.gatherStructuredFacts(searchResults.results, userId);
      console.log(`📊 [CHAT] Gathered ${structuredFacts.length} structured facts`);

      // Step 4: Build LLM prompt with context and structured facts
      const prompt = this.buildLLMPrompt(request.message, searchResults, structuredFacts);

      // Step 5: Smart model selection and LLM call with escalation
      const { llmResponse, auditData } = await this.processLLMWithEscalation(
        prompt, 
        request, 
        userId, 
        tenantId, 
        searchResults.results
      );

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
          model: auditData.finalModel,
          prompt_tokens: auditData.tokensIn,
          completion_tokens: auditData.tokensOut,
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
          model: 'mistral-large', // Note: Do not auto-escalate on formatting-only failures per spec
          messages: [{ role: 'user' as const, content: retryPrompt }],
          max_tokens: parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '512'),
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
   * CHAT-BUG-012 Part C: Enhanced verifier with strong cues, better currency parsing, and credit handling
   */
  private verifyResponseAccuracy(llmResponse: LLMChatResponse, searchResults: any): LLMChatResponse {
    if (llmResponse.answer === "INSUFFICIENT_EVIDENCE") {
      return llmResponse;
    }

    let verified = { ...llmResponse };
    
    // Extract amounts and dates from search snippets
    const allSnippets = searchResults.results.flatMap((r: any) => r.snippets);
    const snippetText = allSnippets.map((s: any) => s.text).join(' ');

    // CHAT-BUG-012: Strong-cue rule - look for "total due", "amount due", "balance due" patterns
    const strongCuePattern = /total\s+due|amount\s+due|balance\s+due/i;
    const hasStrongCue = strongCuePattern.test(snippetText);

    // CHAT-BUG-012: Enhanced currency parsing - support £, GBP, EUR, €, USD, US$
    const currencyPattern = /(£|GBP:?|EUR|€|USD|US\$)\s*(\d+(?:[,.]\d{2})?)/gi;
    const foundAmounts = [...snippetText.matchAll(currencyPattern)];

    // CHAT-BUG-012: Negative/credit handling - ignore credit/adjustment/refund lines unless explicitly asked
    const creditPattern = /\b(credit|adjustment|refund|reversal|cancelled|void)\b/i;
    const filteredSnippets = allSnippets.filter((snippet: any) => {
      // Keep snippet if it doesn't contain credit terms, or if user query explicitly mentions them
      const hasCredit = creditPattern.test(snippet.text);
      const userAskedForCredits = /\b(credit|adjustment|refund|reversal)\b/i.test(verified.answer || '');
      return !hasCredit || userAskedForCredits;
    });

    console.log(`🔍 [VERIFIER] Strong cue: ${hasStrongCue}, Amounts found: ${foundAmounts.length}, Filtered snippets: ${filteredSnippets.length}/${allSnippets.length}`);

    // Check amount accuracy with enhanced logic
    if (llmResponse.slots?.amount) {
      const slotAmount = llmResponse.slots.amount.replace(/[^\d.,]/g, ''); // Extract numeric part
      
      // Build comprehensive amount pattern with multiple currency formats
      const amountPatterns = [
        new RegExp(`£\\s*${slotAmount}`, 'i'),
        new RegExp(`GBP:?\\s*${slotAmount}`, 'i'), 
        new RegExp(`€\\s*${slotAmount}`, 'i'),
        new RegExp(`EUR\\s*${slotAmount}`, 'i'),
        new RegExp(`USD\\s*${slotAmount}`, 'i'),
        new RegExp(`US\\$\\s*${slotAmount}`, 'i'),
        new RegExp(`${slotAmount}\\s*(£|GBP|EUR|€|USD|US\\$)`, 'i') // Amount before currency
      ];

      const amountFound = amountPatterns.some(pattern => pattern.test(snippetText));
      
      if (!amountFound) {
        console.warn(`⚠️ [VERIFIER] Amount ${llmResponse.slots.amount} not found in snippets`);
        
        // CHAT-BUG-012: Apply strong-cue rule - accept with confidence ≥ 0.6 if strong cue + currency found
        if (hasStrongCue && foundAmounts.length > 0) {
          console.log(`✅ [VERIFIER] Strong cue rule applied - accepting despite amount mismatch`);
          verified.confidence = Math.max(0.6, verified.confidence);
        } else {
          verified.confidence = Math.max(0.1, verified.confidence * 0.5);
          verified.answer = "INSUFFICIENT_EVIDENCE";
        }
      } else {
        console.log(`✅ [VERIFIER] Amount verification passed`);
        // CHAT-BUG-012: Boost confidence for strong cues
        if (hasStrongCue) {
          verified.confidence = Math.min(1.0, verified.confidence * 1.1);
        }
      }
    }

    // CHAT-BUG-012: Enhanced date accuracy with GB locale (dd/mm/yyyy)
    if (llmResponse.slots?.dueDate) {
      const dateStr = llmResponse.slots.dueDate;
      
      // Build comprehensive date patterns supporting GB format (dd/mm/yyyy)
      const datePatterns = [
        new RegExp(dateStr.replace(/-/g, '[-\\s/.]'), 'i'), // ISO format with separators
        new RegExp(this.convertToGBDateFormat(dateStr), 'i'), // Convert to dd/mm/yyyy
        new RegExp(dateStr.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3[/.-]$2[/.-]$1'), 'i'), // dd/mm/yyyy
        new RegExp(dateStr.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2[/.-]$1'), 'i'), // mm/yyyy
      ];

      const dateFound = datePatterns.some(pattern => pattern.test(snippetText));
      
      if (!dateFound) {
        console.warn(`⚠️ [VERIFIER] Date ${dateStr} not found in snippets`);
        verified.confidence = Math.max(0.1, verified.confidence * 0.5);
        if (verified.answer !== "INSUFFICIENT_EVIDENCE") {
          verified.answer = "INSUFFICIENT_EVIDENCE";
        }
      } else {
        console.log(`✅ [VERIFIER] Date verification passed`);
      }
    }

    // CHAT-BUG-012: Final confidence adjustment based on citation quality
    if (llmResponse.citations && llmResponse.citations.length > 0) {
      verified.confidence = Math.min(1.0, verified.confidence * 1.05); // Small boost for citations
    }

    console.log(`📊 [VERIFIER] Final confidence: ${verified.confidence.toFixed(3)}, Strong cue: ${hasStrongCue}`);
    return verified;
  }

  /**
   * CHAT-BUG-012: Convert ISO date to GB format (dd/mm/yyyy) for pattern matching
   */
  private convertToGBDateFormat(isoDate: string): string {
    const match = isoDate.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${day}[/.-]${month}[/.-]${year}`;
    }
    return isoDate;
  }

  /**
   * CHAT-BUG-012 Part D: Get document suggestions for zero search results (keyword-only, title/date)
   */
  private async getDocumentSuggestions(
    query: string, 
    tenantId: string, 
    userId: string
  ): Promise<Array<{title: string, date?: string}>> {
    try {
      // Extract keywords from query (remove common words)
      const commonWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'my', 'what', 'how', 'when', 'where', 'much', 'many', 'is', 'was', 'are', 'were']);
      const keywords = query.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2 && !commonWords.has(word))
        .slice(0, 5); // Top 5 keywords

      if (keywords.length === 0) {
        return [];
      }

      console.log(`🔍 [DOC-SUGGESTIONS] Searching for keywords: ${keywords.join(', ')}`);

      // Query recent documents using getDocuments with recent sort
      const suggestions = await this.storage.getDocuments(userId, undefined, undefined, undefined, {tenantId}, 'recent');
      
      // Filter and score by keyword relevance
      const scoredSuggestions = suggestions
        .map(doc => {
          let score = 0;
          const title = doc.name.toLowerCase();
          
          // Score by keyword matches in title
          keywords.forEach(keyword => {
            if (title.includes(keyword)) {
              score += 2; // Higher weight for title matches
            }
          });
          
          // Slight boost for recent documents
          const daysOld = doc.uploadedAt ? 
            Math.floor((Date.now() - new Date(doc.uploadedAt).getTime()) / (1000 * 60 * 60 * 24)) : 
            999;
          if (daysOld < 30) score += 0.5;
          if (daysOld < 7) score += 0.5;
          
          return {
            title: doc.name,
            date: doc.expiryDate ? 
              new Date(doc.expiryDate).toLocaleDateString('en-GB') : 
              new Date(doc.uploadedAt).toLocaleDateString('en-GB'),
            score
          };
        })
        .filter(item => item.score > 0) // Only include items with some relevance
        .sort((a, b) => b.score - a.score); // Sort by relevance score

      console.log(`📋 [DOC-SUGGESTIONS] Found ${scoredSuggestions.length} relevant documents`);
      return scoredSuggestions;

    } catch (error) {
      console.error('Error getting document suggestions:', error);
      return [];
    }
  }

  /**
   * CHAT-011: Smart model selection with escalation logic
   */
  private async processLLMWithEscalation(
    prompt: string,
    request: ChatRequest,
    userId: string,
    tenantId: string,
    docIdsTouched: any[]
  ): Promise<{
    llmResponse: LLMChatResponse;
    auditData: {
      conversationId: string;
      messageId: string;
      tenantId: string;
      userId: string;
      model: string;
      finalModel: string;
      latencyMs_total: number;
      latencyMs_llm: number;
      tokensIn: number;
      tokensOut: number;
      docIdsTouched: number[];
      verifierConfidence: number;
      fallbackTo70B: boolean;
    };
  }> {
    const startTime = Date.now();
    
    // Check feature flags
    const useLlama = await featureFlagService.isFeatureEnabled('CHAT_USE_LLAMA', {
      userId,
      userTier: 'premium' // Simplified for now
    });
    
    const useLlamaAccurate = await featureFlagService.isFeatureEnabled('CHAT_USE_LLAMA_ACCURATE', {
      userId,
      userTier: 'premium'
    });

    // Determine initial model based on feature flags and request
    let initialModel: string;
    let provider: 'mistral' | 'together' = 'mistral';
    
    if (useLlama) {
      provider = 'together';
      initialModel = process.env.LLM_MODEL_STANDARD || 'meta-llama/Llama-3.1-8B-Instruct-Turbo';
    } else {
      initialModel = 'mistral-large';
    }
    
    // Check if user requested accurate model tier
    if ((request as any).modelTier === 'accurate' && useLlamaAccurate && useLlama) {
      initialModel = process.env.LLM_MODEL_ACCURATE || 'meta-llama/Llama-3.3-70B-Instruct';
    }

    let finalModel = initialModel;
    let fallbackTo70B = false;
    let llmStartTime = Date.now();
    let llmResponse: LLMChatResponse;
    let tokensIn = 0;
    let tokensOut = 0;
    let escalationTrigger: 'low_confidence' | 'insufficient_evidence' | 'complex_query' | undefined;
    let initialConfidence: number | undefined;

    try {
      // Initial LLM call
      const llmRequest = {
        model: initialModel,
        messages: [{ role: 'user' as const, content: prompt }],
        max_tokens: parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '512'),
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
        stop: []
      };
      
      tokensIn = Math.floor(prompt.length / 4); // Rough estimate
      const rawResponse = await this.llmAdapter.generate(llmRequest);
      tokensOut = Math.floor(rawResponse.text.length / 4);
      
      llmResponse = await this.parseLLMResponse(rawResponse.text, prompt);
      
      // Check if escalation to 70B is needed
      const shouldEscalate = useLlama && useLlamaAccurate && 
        initialModel.includes('8B') && (
          llmResponse.confidence < 0.7 ||
          llmResponse.answer === "INSUFFICIENT_EVIDENCE" ||
          this.isComplexQuery(request.message)
        );
      
      if (shouldEscalate) {
        // Determine escalation trigger for audit logging
        if (llmResponse.confidence < 0.7) {
          escalationTrigger = 'low_confidence';
        } else if (llmResponse.answer === "INSUFFICIENT_EVIDENCE") {
          escalationTrigger = 'insufficient_evidence';
        } else {
          escalationTrigger = 'complex_query';
        }
        
        console.log(`🔄 [CHAT] Escalating to 70B due to: ${escalationTrigger} (confidence=${llmResponse.confidence})`);
        
        initialConfidence = llmResponse.confidence;
        fallbackTo70B = true;
        finalModel = process.env.LLM_MODEL_ACCURATE || 'meta-llama/Llama-3.3-70B-Instruct';
        llmStartTime = Date.now();
        
        const accurateRequest = {
          ...llmRequest,
          model: finalModel
        };
        
        const accurateResponse = await this.llmAdapter.generate(accurateRequest);
        tokensOut = Math.floor(accurateResponse.text.length / 4);
        llmResponse = await this.parseLLMResponse(accurateResponse.text, prompt);
      }
      
    } catch (llmError: any) {
      console.error(`❌ [CHAT] LLM failed:`, llmError);
      llmResponse = {
        answer: "INSUFFICIENT_EVIDENCE",
        citations: [],
        confidence: 0.0,
      };
    }

    const llmLatency = Date.now() - llmStartTime;
    const totalLatency = Date.now() - startTime;
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Prepare audit data for return value (original format)
    const auditData = {
      conversationId: request.conversationId,
      messageId,
      tenantId,
      userId,
      model: initialModel,
      finalModel,
      latencyMs_total: totalLatency,
      latencyMs_llm: llmLatency,
      tokensIn,
      tokensOut,
      docIdsTouched: docIdsTouched.map(r => parseInt(r.docId)).filter(id => !isNaN(id)),
      verifierConfidence: llmResponse.confidence,
      fallbackTo70B
    };

    // Log to LLM usage logger
    await llmUsageLogger.logUsage({
      userId,
      route: '/api/chat',
      model: finalModel,
      provider
    }, {
      tokensUsed: tokensIn + tokensOut,
      durationMs: llmLatency,
      status: llmResponse.answer !== "INSUFFICIENT_EVIDENCE" ? 'success' : 'error',
      costUsd: provider === 'together' ? llmUsageLogger.calculateTogetherCost(finalModel, tokensIn + tokensOut) : undefined
    });

    // Prepare escalation audit data (new format)
    const escalationAuditData = {
      conversationId: request.conversationId,
      messageId,
      tenantId,
      userId,
      initialModel,
      finalModel,
      latencyMsTotal: totalLatency,
      latencyMsLlm: llmLatency,
      tokensIn,
      tokensOut,
      docIdsTouched: docIdsTouched.map(r => parseInt(r.docId)).filter(id => !isNaN(id)),
      finalConfidence: llmResponse.confidence,
      escalated: fallbackTo70B,
      escalationTrigger,
      initialConfidence,
      costUsd: provider === 'together' ? llmUsageLogger.calculateTogetherCost(finalModel, tokensIn + tokensOut) : undefined
    };

    // Log model escalation audit data
    await modelEscalationAuditor.logEscalation(escalationAuditData);

    return { llmResponse, auditData };
  }

  /**
   * Determine if a query is complex and should use accurate model
   */
  private isComplexQuery(message: string): boolean {
    const complexPatterns = [
      /compar(e|ing|ison)/i,
      /\b(vs|versus|against|between)\b/i,
      /\b(multi|multiple)\b.*\b(month|provider|year|document)/i,
      /\b(analyze|analysis|breakdown|summary)\b/i,
      /\b(trend|pattern|correlation)\b/i,
      /\b(calculate|computation|total|sum)\b/i
    ];
    
    return complexPatterns.some(pattern => pattern.test(message));
  }

}

export const chatOrchestrationService = new ChatOrchestrationService();