/**
 * Category Suggestion API Routes
 * Provides AI-powered category suggestions for uploaded documents
 */

import type { Request, Response } from "express";

interface SuggestionRequest {
  fileName: string;
  fileType: string;
  ocrText?: string;
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

/**
 * Analyze document and suggest category using AI
 */
export async function suggestDocumentCategory(req: Request, res: Response) {
  try {
    const { fileName, fileType, ocrText } = req.body as SuggestionRequest;
    
    if (!fileName || !fileType) {
      return res.status(400).json({ 
        message: "fileName and fileType are required" 
      });
    }

    // Use OpenAI to analyze document content and suggest category
    const suggestion = await analyzeDocumentWithAI(fileName, fileType, ocrText);
    
    res.json(suggestion);
  } catch (error) {
    console.error("Category suggestion error:", error);
    
    // Always return a fallback suggestion instead of crashing
    try {
      const fallback = getFallbackSuggestion(req.body.fileName || 'unknown', req.body.fileType || 'unknown');
      res.json(fallback);
    } catch (fallbackError) {
      console.error("Fallback suggestion also failed:", fallbackError);
      
      // Last resort: return a generic suggestion
      res.json({
        suggested: {
          category: 'Other',
          confidence: 0.5,
          reason: 'Unable to analyze document, using default category'
        },
        alternatives: [
          { category: 'Personal', confidence: 0.3, reason: 'Alternative generic category' }
        ]
      });
    }
  }
}

/**
 * Use OpenAI to analyze document and suggest category
 */
async function analyzeDocumentWithAI(
  fileName: string, 
  fileType: string, 
  ocrText?: string
): Promise<SuggestionResult> {
  // Check if OpenAI is available
  if (!process.env.OPENAI_API_KEY) {
    return getFallbackSuggestion(fileName, fileType);
  }

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
Analyze this document and suggest the most appropriate category from these options:
- Bills & Utilities
- Insurance  
- Financial
- Legal
- Property
- Personal
- Medical
- Tax
- Other

Document details:
- Filename: ${fileName}
- File type: ${fileType}
- Content: ${ocrText || 'No text content available'}

Return a JSON response with:
{
  "suggested": {
    "category": "most likely category",
    "confidence": 0.0-1.0,
    "reason": "brief explanation"
  },
  "alternatives": [
    {
      "category": "alternative category",
      "confidence": 0.0-1.0, 
      "reason": "why this could also work"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate the response structure
    if (result.suggested && result.suggested.category) {
      return result as SuggestionResult;
    } else {
      throw new Error("Invalid AI response format");
    }
    
  } catch (error) {
    console.error("OpenAI analysis failed:", error);
    
    // Handle specific OpenAI errors gracefully
    if (error && typeof error === 'object' && 'status' in error) {
      if (error.status === 429) {
        console.warn("OpenAI quota exceeded, using fallback categorization");
      } else if (error.status === 401) {
        console.warn("OpenAI authentication failed, using fallback categorization");
      } else {
        console.warn(`OpenAI API error ${error.status}, using fallback categorization`);
      }
    }
    
    return getFallbackSuggestion(fileName, fileType);
  }
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