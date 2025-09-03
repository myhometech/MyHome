/**
 * Category Suggestion API Routes
 * Provides AI-powered category suggestions for uploaded documents
 * TICKET 5: Migrated from OpenAI GPT-4o-mini to Mistral via LLM client
 */

import type { Request, Response } from "express";
import { llmClient } from "../services/llmClient.js";

interface SuggestionRequest {
  fileName: string;
  fileType: string;
  size: number;
  ocrText?: string;
  documentId?: string; // Optional for existing documents
}

interface CategorySuggestion {
  category: string;
  confidence: number;
  reason: string;
}

interface SuggestionResult {
  suggested: CategorySuggestion;
  alternatives: CategorySuggestion[];
}

// TICKET 5: Enhanced suggestion interface for Mistral compatibility
interface MistralSuggestionResponse {
  suggested_category: string;
  confidence: number;
  reason: string;
  alternative_categories: Array<{
    category: string;
    confidence: number;
    reason: string;
  }>;
}

/**
 * DOC-SUG-01: Analyze document and suggest category using AI with proper validation
 */
export async function suggestDocumentCategory(req: Request, res: Response) {
  // DOC-SUG-01: Set JSON headers for consistent responses
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  try {
    const { fileName, fileType, size, ocrText, documentId } = req.body as SuggestionRequest;
    
    // DOC-SUG-01: Comprehensive validation with specific error codes
    const validationErrors: string[] = [];
    
    if (!fileName || typeof fileName !== 'string') {
      validationErrors.push('fileName is required and must be a string');
    } else if (fileName.length > 255) {
      validationErrors.push('fileName must be 255 characters or less');
    }
    
    if (!fileType || typeof fileType !== 'string') {
      validationErrors.push('fileType is required and must be a string');
    } else if (!/^[a-z-]+\/[a-z0-9\-\.+]+$/i.test(fileType)) {
      validationErrors.push('fileType must be a valid MIME type');
    }
    
    if (typeof size !== 'number' || size <= 0) {
      validationErrors.push('size is required and must be a positive number');
    } else if (size > 10_000_000) {
      validationErrors.push('size cannot exceed 10MB (10,000,000 bytes)');
    }
    
    if (ocrText !== undefined && typeof ocrText !== 'string') {
      validationErrors.push('ocrText must be a string if provided');
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        errorCode: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: validationErrors
      });
    }

    // TICKET 5: Use Mistral to analyze document content and suggest category
    const suggestion = await analyzeDocumentWithMistral(fileName, fileType, ocrText);
    
    // DOC-SUG-01: Return consistent response format
    res.status(200).json({
      ...suggestion,
      modelVersion: 'mistral-v1.0'
    });
  } catch (error) {
    console.error("Category suggestion error:", error);
    
    // Always return a fallback suggestion instead of crashing
    try {
      const fallback = getFallbackSuggestion(fileName || 'unknown', fileType || 'unknown');
      res.status(200).json({
        ...fallback,
        modelVersion: 'fallback-v1.0'
      });
    } catch (fallbackError) {
      console.error("Fallback suggestion also failed:", fallbackError);
      
      // DOC-SUG-01: Last resort with proper error structure
      res.status(200).json({
        suggested: {
          category: 'Other',
          confidence: 0.5,
          reason: 'Unable to analyze document, using default category'
        },
        alternatives: [
          { category: 'Personal', confidence: 0.3, reason: 'Alternative generic category' }
        ],
        modelVersion: 'default-v1.0'
      });
    }
  }
}

/**
 * TICKET 5: Use Mistral to analyze document and suggest category
 */
async function analyzeDocumentWithMistral(
  fileName: string, 
  fileType: string, 
  ocrText?: string
): Promise<SuggestionResult> {
  // Generate unique request ID for tracking
  const requestId = `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`[${requestId}] Starting category suggestion for: ${fileName}`);
  
  // Check if Mistral LLM client is available
  if (!llmClient.isAvailable()) {
    console.log(`[${requestId}] LLM client not available, using fallback suggestion`);
    return getFallbackSuggestion(fileName, fileType);
  }

  try {
    const startTime = Date.now();
    
    // TICKET 5: Build flattened prompt for Mistral compatibility
    const prompt = buildMistralSuggestionPrompt(fileName, fileType, ocrText);
    
    const response = await llmClient.createChatCompletion({
      model: process.env.MISTRAL_MODEL_NAME || 'mistralai/Mistral-7B-Instruct-v0.1',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.1, // Low temperature for consistent categorization
    }, {
      userId: 'anonymous', // Category suggestions can be anonymous
      route: '/api/documents/suggest-category'
    });

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] LLM response received in ${duration}ms`);
    
    // TICKET 5: Parse response using enhanced LLM client parser
    const parsed = await llmClient.parseJSONResponse(response.content, requestId);
    
    // Handle both legacy and new response formats for backward compatibility
    const result = normalizeAISuggestionResponse(parsed, requestId);
    
    // TICKET 5: Confidence threshold validation (≥0.6 as specified)
    if (result.suggested.confidence >= 0.6) {
      console.log(`[${requestId}] AI suggestion accepted (confidence: ${result.suggested.confidence})`);
      
      // Log usage for admin monitoring
      console.log(`[${requestId}] Usage: model=${response.model || 'mistral'}, tokens=${response.usage?.total_tokens || 'unknown'}, source=ai`);
      
      return result;
    } else {
      console.log(`[${requestId}] AI confidence too low (${result.suggested.confidence}), using fallback`);
      return getFallbackSuggestion(fileName, fileType);
    }
    
  } catch (error) {
    console.error(`[${requestId}] Mistral analysis failed:`, error);
    
    // TICKET 5: Handle LLM client error types gracefully
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'rate_limit') {
        console.warn(`[${requestId}] LLM rate limit exceeded, using fallback categorization`);
      } else if (error.type === 'api_error') {
        console.warn(`[${requestId}] LLM API error, using fallback categorization`);
      } else if (error.type === 'network_error') {
        console.warn(`[${requestId}] LLM network error, using fallback categorization`);
      } else {
        console.warn(`[${requestId}] LLM error ${error.type}, using fallback categorization`);
      }
    }
    
    return getFallbackSuggestion(fileName, fileType);
  }
}

/**
 * TICKET 5: Build flattened prompt for Mistral compatibility
 */
function buildMistralSuggestionPrompt(fileName: string, fileType: string, ocrText?: string): string {
  return `Analyze the document's filename, type, and OCR text, then return the most appropriate document category.

Available categories:
- Bills & Utilities
- Insurance
- Financial
- Legal
- Property
- Personal
- Medical
- Tax
- Other

Document context:
- Filename: ${fileName}
- File type: ${fileType}
- OCR text: ${ocrText || 'No text content available'}

Return a JSON response with this exact structure:
{
  "suggested_category": "most appropriate category name",
  "confidence": 0.85,
  "reason": "brief explanation of why this category fits",
  "alternative_categories": [
    {
      "category": "alternative category name",
      "confidence": 0.65,
      "reason": "why this could also work"
    }
  ]
}

Requirements:
- confidence must be a number between 0.0 and 1.0
- suggested_category must be exactly one of the available categories listed above
- reason should be concise and explain the categorization logic
- alternative_categories should contain 1-2 alternatives with lower confidence scores`;
}

/**
 * TICKET 5: Normalize AI response to standard format for backward compatibility
 */
function normalizeAISuggestionResponse(parsed: any, requestId: string): SuggestionResult {
  // Handle Mistral format (TICKET 5)
  if (parsed.suggested_category) {
    const mistralResponse = parsed as MistralSuggestionResponse;
    
    return {
      suggested: {
        category: mistralResponse.suggested_category,
        confidence: mistralResponse.confidence,
        reason: mistralResponse.reason
      },
      alternatives: mistralResponse.alternative_categories?.map(alt => ({
        category: alt.category,
        confidence: alt.confidence,
        reason: alt.reason
      })) || []
    };
  }
  
  // Handle legacy OpenAI format for backward compatibility
  if (parsed.suggested && parsed.suggested.category) {
    return parsed as SuggestionResult;
  }
  
  // Invalid format
  throw new Error(`[${requestId}] Invalid AI response format: missing required fields`);
}

/**
 * Fallback category suggestion based on filename patterns
 */
function getFallbackSuggestion(fileName: string, fileType: string): SuggestionResult {
  const name = fileName.toLowerCase();
  
  if (name.includes('bill') || name.includes('invoice') || name.includes('utility')) {
    return {
      suggested: {
        category: 'Bills & Utilities',
        confidence: 0.7,
        reason: 'Filename contains billing-related keywords'
      },
      alternatives: [
        { category: 'Financial', confidence: 0.6, reason: 'Alternative billing category' }
      ]
    };
  }
  
  if (name.includes('insurance') || name.includes('policy')) {
    return {
      suggested: {
        category: 'Insurance',
        confidence: 0.8,
        reason: 'Filename contains insurance keywords'
      },
      alternatives: [
        { category: 'Legal', confidence: 0.4, reason: 'Alternative for policy documents' }
      ]
    };
  }
  
  if (name.includes('receipt') || name.includes('purchase') || name.includes('payment')) {
    return {
      suggested: {
        category: 'Financial',
        confidence: 0.7,
        reason: 'Filename indicates financial transaction'
      },
      alternatives: [
        { category: 'Other', confidence: 0.3, reason: 'General category' }
      ]
    };
  }
  
  if (name.includes('contract') || name.includes('agreement') || name.includes('legal')) {
    return {
      suggested: {
        category: 'Legal',
        confidence: 0.8,
        reason: 'Filename contains legal keywords'
      },
      alternatives: [
        { category: 'Other', confidence: 0.2, reason: 'General category' }
      ]
    };
  }
  
  if (name.includes('tax') || name.includes('irs') || name.includes('return')) {
    return {
      suggested: {
        category: 'Tax',
        confidence: 0.8,
        reason: 'Filename contains tax-related keywords'
      },
      alternatives: [
        { category: 'Financial', confidence: 0.6, reason: 'Alternative financial category' }
      ]
    };
  }
  
  if (name.includes('medical') || name.includes('health') || name.includes('doctor')) {
    return {
      suggested: {
        category: 'Medical',
        confidence: 0.8,
        reason: 'Filename contains medical keywords'
      },
      alternatives: [
        { category: 'Personal', confidence: 0.4, reason: 'Alternative personal category' }
      ]
    };
  }
  
  // Default suggestion
  return {
    suggested: {
      category: 'Other',
      confidence: 0.3,
      reason: 'Unable to determine specific category from filename'
    },
    alternatives: [
      { category: 'Personal', confidence: 0.2, reason: 'General personal category' }
    ]
  };
}