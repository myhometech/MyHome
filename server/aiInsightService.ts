import { llmClient } from './services/llmClient.js';

interface DocumentInsight {
  id: string;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  title: string;
  content: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
  createdAt: Date;
}

interface InsightAnalysisResult {
  insights: DocumentInsight[];
  processingTime: number;
  confidence: number;
  documentType: string;
  recommendedActions: string[];
}

class AIInsightService {
  private isAvailable: boolean = false;

  constructor() {
    this.isAvailable = llmClient.isAvailable();
    if (this.isAvailable) {
      const status = llmClient.getStatus();
      console.log(`✅ AI Insight Service initialized with ${status.provider} (${status.model})`);
    } else {
      console.log('⚠️ AI Insight Service disabled - LLM API key not found');
    }
  }

  /**
   * Generate comprehensive insights for a document (TICKET 15: Feature flag protected)
   */
  async generateDocumentInsights(
    documentName: string,
    extractedText: string,
    mimeType: string,
    userId: string
  ): Promise<InsightAnalysisResult> {
    if (!this.isAvailable) {
      throw new Error('AI Insight Service not available - LLM API key required');
    }

    // TICKET 15: Check if AI insights are enabled for this user
    const { featureFlagService } = await import('./featureFlagService');
    const { storage } = await import('./storage');
    
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const hasAIInsights = await featureFlagService.isFeatureEnabled('ai_insights', {
        userId,
        userTier: user.subscriptionTier as 'free' | 'premium',
        sessionId: '', 
        userAgent: '',
        ipAddress: ''
      });

      if (!hasAIInsights) {
        console.log(`[DOC-501] AI Insights disabled for user ${userId} - returning empty result`);
        return {
          insights: [],
          processingTime: 0,
          confidence: 0,
          documentType: 'unknown',
          recommendedActions: []
        };
      }
    } catch (error) {
      console.warn('Failed to check AI insights feature flag, proceeding with default behavior:', error);
    }

    const startTime = Date.now();
    const requestId = `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      console.log(`[${requestId}] DOC-501: Starting insight analysis for document: ${documentName}`);

      const flattened_prompt = this.buildMistralInsightPrompt(documentName, extractedText, mimeType);
      
      const response = await llmClient.createChatCompletion({
        messages: [{ role: "user", content: flattened_prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for consistent analysis
        max_tokens: 1500 // TICKET 15: Reduced from 2000 to cut token costs by 25%
      }, {
        userId,
        route: '/api/insights/generate'
      });

      const aiResponse = response.content;
      if (!aiResponse) {
        throw new Error('Empty response from LLM API');
      }

      // Log LLM usage for admin tracking
      const status = llmClient.getStatus();
      console.log(`[${requestId}] Model: ${status.model}, Provider: ${status.provider}, Tokens: ${response.usage?.total_tokens || 'unknown'}`)

      console.log(`[${requestId}] DOC-501: Received AI response (${aiResponse.length} chars)`);

      const analysisResult = this.parseInsightResponse(aiResponse, requestId);
      const processingTime = Date.now() - startTime;

      console.log(`[${requestId}] DOC-501: Generated ${analysisResult.insights.length} insights in ${processingTime}ms`);

      return {
        insights: analysisResult.insights,
        processingTime,
        confidence: analysisResult.confidence,
        documentType: analysisResult.documentType,
        recommendedActions: analysisResult.recommendedActions
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error(`[${requestId}] DOC-501: Insight generation failed:`, error);

      if (error.type === 'rate_limit') {
        throw new Error('LLM API quota exceeded. Please check your billing and usage limits.');
      }

      throw new Error(`AI insight generation failed: ${error.message}`);
    }
  }

  /**
   * Build flattened prompt for Mistral insight analysis (TICKET 2)
   */
  private buildMistralInsightPrompt(documentName: string, extractedText: string, mimeType: string): string {
    const documentType = this.inferDocumentType(documentName, mimeType);
    const textPreview = extractedText.substring(0, 4000); // Limit text to avoid token limits

    return `You are an expert document analyst. Analyze documents and provide structured insights in JSON format. Focus on actionable information, key dates, financial details, and compliance requirements.

Analyze this document and provide structured insights in JSON format.

Document Information:
- Name: ${documentName}
- Type: ${documentType}
- Content Preview: ${textPreview}

Please analyze and return a JSON object with this exact structure:
{
  "documentType": "inferred document category",
  "confidence": 0.85,
  "insights": [
    {
      "id": "unique-id-1",
      "type": "summary|action_items|key_dates|financial_info|contacts|compliance",
      "title": "Brief insight title",
      "content": "Detailed insight content",
      "confidence": 0.9,
      "priority": "low|medium|high",
      "metadata": {}
    }
  ],
  "recommendedActions": [
    "Action item 1",
    "Action item 2"
  ]
}

Analysis Guidelines:
1. SUMMARY: Provide a concise 2-3 sentence summary of the document's purpose
2. ACTION_ITEMS: Extract any tasks, deadlines, or required actions
3. KEY_DATES: Identify important dates (expiry, renewal, due dates)
4. FINANCIAL_INFO: Extract amounts, costs, payment terms, account numbers
5. CONTACTS: Identify people, companies, phone numbers, emails
6. COMPLIANCE: Note any regulatory requirements, certifications, or legal obligations

Prioritize insights by importance:
- HIGH: Urgent deadlines, large financial amounts, compliance requirements
- MEDIUM: Important dates, contact information, significant terms
- LOW: General information, background details

Ensure all insights are actionable and provide real value to the user.`;
  }

  /**
   * Parse AI response into structured insights
   */
  private parseInsightResponse(response: string, requestId: string): {
    insights: DocumentInsight[];
    confidence: number;
    documentType: string;
    recommendedActions: string[];
  } {
    try {
      // Use LLM client's robust JSON parsing (TICKET 2)
      const parsed = llmClient.parseJSONResponse(response);
      
      const insights: DocumentInsight[] = (parsed.insights || []).map((insight: any, index: number) => ({
        id: insight.id || `insight-${Date.now()}-${index}`,
        type: this.validateInsightType(insight.type),
        title: insight.title || 'Untitled Insight',
        content: insight.content || '',
        confidence: Math.max(0, Math.min(1, insight.confidence || 0.5)),
        priority: this.validatePriority(insight.priority),
        metadata: insight.metadata || {},
        createdAt: new Date()
      }));

      console.log(`[${requestId}] DOC-501: Parsed ${insights.length} insights successfully`);

      return {
        insights,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        documentType: parsed.documentType || 'Unknown',
        recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : []
      };

    } catch (parseError) {
      console.error(`[${requestId}] DOC-501: Failed to parse AI response:`, parseError);
      throw new Error('Failed to parse AI insight response');
    }
  }

  /**
   * Validate insight type
   */
  private validateInsightType(type: string): DocumentInsight['type'] {
    const validTypes: DocumentInsight['type'][] = ['summary', 'action_items', 'key_dates', 'financial_info', 'contacts', 'compliance'];
    return validTypes.includes(type as DocumentInsight['type']) ? type as DocumentInsight['type'] : 'summary';
  }

  /**
   * Validate priority level
   */
  private validatePriority(priority: string): DocumentInsight['priority'] {
    const validPriorities: DocumentInsight['priority'][] = ['low', 'medium', 'high'];
    return validPriorities.includes(priority as DocumentInsight['priority']) ? priority as DocumentInsight['priority'] : 'medium';
  }

  /**
   * Infer document type from filename and mime type
   */
  private inferDocumentType(filename: string, mimeType: string): string {
    const lowerName = filename.toLowerCase();
    
    if (lowerName.includes('invoice') || lowerName.includes('bill')) return 'Invoice/Bill';
    if (lowerName.includes('contract') || lowerName.includes('agreement')) return 'Contract';
    if (lowerName.includes('insurance') || lowerName.includes('policy')) return 'Insurance';
    if (lowerName.includes('tax') || lowerName.includes('receipt')) return 'Tax/Receipt';
    if (lowerName.includes('medical') || lowerName.includes('health')) return 'Medical';
    if (lowerName.includes('legal') || lowerName.includes('court')) return 'Legal';
    if (lowerName.includes('bank') || lowerName.includes('statement')) return 'Financial';
    if (lowerName.includes('utility') || lowerName.includes('electric')) return 'Utility';
    if (lowerName.includes('mortgage') || lowerName.includes('loan')) return 'Mortgage/Loan';
    if (lowerName.includes('warranty') || lowerName.includes('manual')) return 'Warranty/Manual';

    if (mimeType === 'application/pdf') return 'PDF Document';
    if (mimeType.startsWith('image/')) return 'Scanned Document';
    
    return 'General Document';
  }

  /**
   * Check if service is available
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

  /**
   * TICKET 4: Generate user-facing message for dashboard insights
   */
  generateInsightMessage(insight: DocumentInsight): string {
    const docName = insight.title.length > 30 ? 
      insight.title.substring(0, 30) + '...' : 
      insight.title;

    switch (insight.type) {
      case 'key_dates':
        return `Important dates found in ${docName}`;
      case 'action_items':
        return `Action required for ${docName}`;
      case 'financial_info':
        return `Financial details in ${docName}`;
      case 'compliance':
        return `Compliance check needed for ${docName}`;
      case 'summary':
        return `Summary available for ${docName}`;
      default:
        return `Review ${docName}`;
    }
  }

  /**
   * TICKET 4: Extract due date from insight content
   */
  extractDueDate(content: string): Date | null {
    const datePatterns = [
      /(?:due|expires?|deadline|expiry).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}).*?(?:due|expires?|deadline|expiry)/i,
      /(?:by|before|until).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
    ];

    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          const dateStr = match[1];
          const date = new Date(dateStr);
          
          // Validate date is reasonable (not too far in past/future)
          const now = new Date();
          const yearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
          const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          
          if (date >= yearAgo && date <= yearFromNow) {
            return date;
          }
        } catch (error) {
          // Continue to next pattern
        }
      }
    }

    // If priority is high, set due date for next week
    if (content.toLowerCase().includes('urgent') || content.toLowerCase().includes('important')) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }

    return null;
  }
}

// Export singleton instance
export const aiInsightService = new AIInsightService();
export type { DocumentInsight, InsightAnalysisResult };