/**
 * DOC-303: Auto-Categorize Documents via Rules and AI Fallback
 * Enhanced categorization system with Mistral fallback for improved accuracy (TICKET 4)
 */

import { llmClient } from './services/llmClient.js';
import { storage } from './storage';
import type { Category } from '@shared/schema';

interface CategorizationResult {
  categoryId: number | null;
  source: 'rules' | 'ai' | 'fallback';
  confidence: number;
  reasoning?: string;
  aiResponse?: string;
}

interface CategorizationContext {
  filename: string;
  mimeType?: string;
  emailSubject?: string;
  extractedText?: string;
  userId: string;
}

export class CategorizationService {
  private categoriesCache: Map<string, Category[]> = new Map();

  constructor() {
    // TICKET 4: Using unified LLM client (Mistral via Together.ai)
    console.log('✅ Categorization Service initialized with LLM client');
  }

  /**
   * Check if AI categorization is available
   */
  private get isAIAvailable(): boolean {
    return llmClient.isAvailable();
  }

  /**
   * DOC-303: Main categorization method with rules-first, AI fallback
   */
  async categorizeDocument(context: CategorizationContext): Promise<CategorizationResult> {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    console.log(`[${requestId}] Starting categorization for: ${context.filename}`);

    // Step 1: Try rules-based categorization first
    const rulesResult = await this.applyRuleBasedCategorization(context);
    
    if (rulesResult.categoryId && rulesResult.confidence >= 0.8) {
      console.log(`[${requestId}] Rules-based categorization successful: ${rulesResult.categoryId} (confidence: ${rulesResult.confidence})`);
      return rulesResult;
    }

    // Step 2: Fallback to AI-based categorization
    console.log(`[${requestId}] Rules-based categorization insufficient (confidence: ${rulesResult.confidence}), trying AI fallback`);
    
    if (!this.isAIAvailable) {
      console.warn(`[${requestId}] LLM client not configured, using fallback categorization`);
      return {
        categoryId: rulesResult.categoryId,
        source: 'fallback',
        confidence: rulesResult.confidence,
        reasoning: 'LLM client not configured'
      };
    }

    try {
      const aiResult = await this.applyAIBasedCategorization(context, requestId);
      
      if (aiResult.categoryId && aiResult.confidence >= 0.7) {
        console.log(`[${requestId}] AI-based categorization successful: ${aiResult.categoryId} (confidence: ${aiResult.confidence})`);
        return aiResult;
      }

      // If AI also fails, return the best available result
      const bestResult = aiResult.confidence > rulesResult.confidence ? aiResult : rulesResult;
      console.log(`[${requestId}] Both methods had low confidence, using best result: ${bestResult.source} (confidence: ${bestResult.confidence})`);
      
      return {
        ...bestResult,
        source: 'fallback'
      };

    } catch (error) {
      console.error(`[${requestId}] AI categorization failed:`, error);
      return {
        categoryId: rulesResult.categoryId,
        source: 'fallback', 
        confidence: rulesResult.confidence,
        reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * DOC-303: Enhanced rules-based categorization
   */
  private async applyRuleBasedCategorization(context: CategorizationContext): Promise<CategorizationResult> {
    const categories = await this.getUserCategories(context.userId);
    const filename = context.filename.toLowerCase();
    const emailSubject = context.emailSubject?.toLowerCase() || '';
    const content = context.extractedText?.toLowerCase() || '';
    
    // Enhanced categorization rules with confidence scoring
    const rules = [
      // Financial documents
      {
        patterns: ['invoice', 'bill', 'receipt', 'payment', 'charge', 'statement', 'billing'],
        categoryNames: ['financial', 'receipts', 'bills'],
        confidence: 0.9
      },
      // Insurance documents
      {
        patterns: ['insurance', 'policy', 'coverage', 'claim', 'premium', 'deductible'],
        categoryNames: ['insurance'],
        confidence: 0.95
      },
      // Tax documents
      {
        patterns: ['tax', 'irs', '1099', 'w2', 'w-2', '1040', 'refund', 'withholding'],
        categoryNames: ['taxes', 'tax'],
        confidence: 0.95
      },
      // Legal documents
      {
        patterns: ['contract', 'agreement', 'legal', 'lawsuit', 'court', 'attorney', 'lawyer'],
        categoryNames: ['legal', 'contracts'],
        confidence: 0.9
      },
      // Utilities
      {
        patterns: ['utility', 'electric', 'gas', 'water', 'internet', 'phone', 'cable'],
        categoryNames: ['utilities', 'bills'],
        confidence: 0.85
      },
      // Property/Real Estate
      {
        patterns: ['mortgage', 'deed', 'property', 'real estate', 'lease', 'rent', 'hoa'],
        categoryNames: ['property', 'real estate', 'home'],
        confidence: 0.9
      },
      // Medical/Health
      {
        patterns: ['medical', 'health', 'doctor', 'hospital', 'prescription', 'pharmacy'],
        categoryNames: ['medical', 'health', 'healthcare'],
        confidence: 0.9
      },
      // Warranties
      {
        patterns: ['warranty', 'manual', 'instruction', 'guide', 'user guide'],
        categoryNames: ['warranty', 'manuals'],
        confidence: 0.85
      }
    ];

    let bestMatch: { categoryId: number; confidence: number; reasoning: string } | null = null;

    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        // Check filename, email subject, and content
        const sources = [
          { text: filename, weight: 1.0, name: 'filename' },
          { text: emailSubject, weight: 0.8, name: 'email subject' },
          { text: content.substring(0, 500), weight: 0.6, name: 'content' }
        ];

        let patternFound = false;
        let matchSource = '';

        for (const source of sources) {
          if (source.text.includes(pattern)) {
            patternFound = true;
            matchSource = source.name;
            
            // Find matching category
            for (const categoryName of rule.categoryNames) {
              const category = categories.find(c => 
                c.name.toLowerCase() === categoryName || 
                c.name.toLowerCase().includes(categoryName)
              );
              
              if (category) {
                const confidence = rule.confidence * source.weight;
                if (!bestMatch || confidence > bestMatch.confidence) {
                  bestMatch = {
                    categoryId: category.id,
                    confidence,
                    reasoning: `Pattern "${pattern}" found in ${matchSource}, mapped to category "${category.name}"`
                  };
                }
              }
            }
          }
        }
      }
    }

    if (bestMatch) {
      return {
        categoryId: bestMatch.categoryId,
        source: 'rules',
        confidence: bestMatch.confidence,
        reasoning: bestMatch.reasoning
      };
    }

    // No rules matched
    return {
      categoryId: null,
      source: 'rules',
      confidence: 0.0,
      reasoning: 'No matching patterns found in filename, subject, or content'
    };
  }

  /**
   * DOC-303: AI-based categorization using Mistral (TICKET 4)
   */
  private async applyAIBasedCategorization(context: CategorizationContext, requestId: string): Promise<CategorizationResult> {
    const categories = await this.getUserCategories(context.userId);
    const categoryNames = categories.map(c => c.name).join(', ');

    // Construct flattened prompt for Mistral
    const flattened_prompt = this.buildMistralCategorizationPrompt(context, categoryNames);
    
    console.log(`[${requestId}] Sending AI categorization request to Mistral`);

    try {
      const response = await llmClient.createChatCompletion({
        messages: [{ role: "user", content: flattened_prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for consistent categorization
        max_tokens: 300
      }, {
        userId: context.userId,
        route: '/api/documents/categorize'
      });

      const aiResponse = response.content;
      if (!aiResponse) {
        throw new Error('Empty response from LLM client');
      }

      // Log LLM usage for admin tracking (TICKET 4)
      const status = llmClient.getStatus();
      console.log(`[${requestId}] Model: ${status.model}, Provider: ${status.provider}, Tokens: ${response.usage?.total_tokens || 'unknown'}`);

      // Log the AI interaction for audit trail
      console.log(`[${requestId}] AI response received:`, {
        prompt: flattened_prompt.substring(0, 200) + '...',
        response: aiResponse,
        tokensUsed: response.usage?.total_tokens || 0
      });

      // Parse AI response using LLM client's enhanced parser
      const parsed = llmClient.parseJSONResponse(aiResponse);
      const suggestedCategory = parsed.category;
      const confidence = parsed.confidence || 0.7;
      const reasoning = parsed.reasoning || 'AI-based categorization';

      // Find matching category in user's categories
      const matchedCategory = categories.find(c => 
        c.name.toLowerCase() === suggestedCategory?.toLowerCase() ||
        c.name.toLowerCase().includes(suggestedCategory?.toLowerCase()) ||
        suggestedCategory?.toLowerCase().includes(c.name.toLowerCase())
      );

      if (matchedCategory) {
        return {
          categoryId: matchedCategory.id,
          source: 'ai',
          confidence: Math.min(confidence, 0.95), // Cap AI confidence at 95%
          reasoning,
          aiResponse
        };
      } else {
        console.warn(`[${requestId}] AI suggested category "${suggestedCategory}" not found in user categories`);
        return {
          categoryId: null,
          source: 'ai',
          confidence: 0.3,
          reasoning: `AI suggested "${suggestedCategory}" but no matching category found`,
          aiResponse
        };
      }

    } catch (error) {
      console.error(`[${requestId}] LLM client error:`, error);
      throw error;
    }
  }

  /**
   * Build flattened prompt for Mistral categorization (TICKET 4)
   */
  private buildMistralCategorizationPrompt(context: CategorizationContext, categoryNames: string): string {
    return `You are a document categorization expert. Analyze the provided document information and categorize it using only the available categories. Respond with valid JSON only.

Given the document name, email subject, and content, return the best matching document category from the user's list.

Available Categories: ${categoryNames}

Document Information:
- Filename: ${context.filename}
- File Type: ${context.mimeType || 'unknown'}
${context.emailSubject ? `- Email Subject: ${context.emailSubject}` : ''}
${context.extractedText ? `- Content Preview: ${context.extractedText.substring(0, 300)}...` : ''}

Requirements:
1. Choose ONLY from these available categories: ${categoryNames}
2. If none fit perfectly, choose the closest match
3. Provide a confidence score between 0.0 and 1.0
4. Explain your reasoning briefly

Respond with JSON in this exact format:
{
  "category": "chosen_category_name",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this category fits"
}`;
  }

  /**
   * Get user categories with caching
   */
  private async getUserCategories(userId: string): Promise<Category[]> {
    if (this.categoriesCache.has(userId)) {
      return this.categoriesCache.get(userId)!;
    }

    const categories = await storage.getCategories(userId);
    
    // If no categories exist, create default ones
    if (categories.length === 0) {
      console.log(`Creating default categories for user ${userId}`);
      const defaultCategories = [
        { name: 'Financial', icon: 'fas fa-dollar-sign', color: 'green' },
        { name: 'Insurance', icon: 'fas fa-shield-alt', color: 'blue' },
        { name: 'Tax', icon: 'fas fa-file-invoice-dollar', color: 'purple' },
        { name: 'Legal', icon: 'fas fa-gavel', color: 'red' },
        { name: 'Utilities', icon: 'fas fa-bolt', color: 'orange' },
        { name: 'Medical', icon: 'fas fa-heartbeat', color: 'pink' },
        { name: 'Property', icon: 'fas fa-home', color: 'brown' },
        { name: 'Warranty', icon: 'fas fa-certificate', color: 'teal' },
        { name: 'Other', icon: 'fas fa-folder', color: 'gray' }
      ];

      for (const categoryData of defaultCategories) {
        try {
          await storage.createCategory({ ...categoryData, userId });
        } catch (error) {
          console.error(`Failed to create category ${categoryData.name}:`, error);
        }
      }
      
      // Fetch the newly created categories
      const newCategories = await storage.getCategories(userId);
      this.categoriesCache.set(userId, newCategories);
      return newCategories;
    }
    
    this.categoriesCache.set(userId, categories);
    
    // Clear cache after 5 minutes
    setTimeout(() => {
      this.categoriesCache.delete(userId);
    }, 300000);

    return categories;
  }

  /**
   * Get categorization statistics for monitoring
   */
  async getCategorizationStats(userId: string): Promise<{
    total: number;
    bySource: { rules: number; ai: number; manual: number; fallback: number };
    successRate: number;
  }> {
    // This would query the database for categorization statistics
    // Implementation depends on your analytics needs
    return {
      total: 0,
      bySource: { rules: 0, ai: 0, manual: 0, fallback: 0 },
      successRate: 0
    };
  }

  /**
   * Clear categories cache for user (useful when categories are updated)
   */
  clearUserCache(userId: string): void {
    this.categoriesCache.delete(userId);
  }
}

export const categorizationService = new CategorizationService();