import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ContentEntity {
  type: 'date' | 'amount' | 'person' | 'location' | 'contact' | 'document_type' | 'urgency' | 'reference';
  label: string;
  value: string;
  confidence: number;
}

interface ContentInsight {
  type: 'date' | 'amount' | 'person' | 'location' | 'contact' | 'document_type' | 'urgency' | 'reference';
  label: string;
  value: string;
  confidence: number;
}

interface ContentAnalysisResult {
  entities: ContentEntity[];
  insights: ContentInsight[];
  documentType: string;
  priority: 'low' | 'medium' | 'high';
  summary: string;
}

export class ContentAnalysisService {
  async analyzeDocumentContent(
    extractedText: string | null,
    summary: string | null,
    fileName: string,
    mimeType: string
  ): Promise<ContentAnalysisResult> {
    try {
      const content = extractedText || summary || '';
      
      if (!content || content.length < 10) {
        return this.getFallbackAnalysis(fileName, mimeType);
      }

      const prompt = this.buildAnalysisPrompt(content, fileName);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert document analysis AI. Analyze documents and extract key information into structured preview chips. Focus on dates, amounts, people, locations, contact info, and document types. Respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1000,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return this.validateAndEnhanceResult(result, fileName);
      
    } catch (error) {
      console.error('Error in content analysis:', error);
      return this.getFallbackAnalysis(fileName, mimeType);
    }
  }

  private buildAnalysisPrompt(content: string, fileName: string): string {
    return `Analyze this document content and extract key information for preview chips:

FILENAME: ${fileName}
CONTENT: ${content.substring(0, 2000)}

Extract and return JSON with the following structure:
{
  "entities": [
    {
      "type": "date|amount|person|location|contact|document_type|urgency|reference",
      "label": "Brief label",
      "value": "Extracted value",
      "confidence": 0.0-1.0
    }
  ],
  "insights": [
    {
      "type": "date|amount|person|location|contact|document_type|urgency|reference",
      "label": "Insight label",
      "value": "Derived insight",
      "confidence": 0.0-1.0
    }
  ],
  "documentType": "Detected document type",
  "priority": "low|medium|high",
  "summary": "Brief analysis summary"
}

Focus on:
- Important dates (due dates, expiry, appointments)
- Monetary amounts (bills, payments, costs)
- People names and titles
- Addresses and locations
- Phone numbers and emails
- Document type identification
- Urgency indicators
- Reference numbers

Limit entities and insights to 3-4 each. Prioritize the most important information.`;
  }

  private validateAndEnhanceResult(result: any, fileName: string): ContentAnalysisResult {
    const validated: ContentAnalysisResult = {
      entities: [],
      insights: [],
      documentType: result.documentType || this.detectDocumentTypeFromFileName(fileName),
      priority: ['low', 'medium', 'high'].includes(result.priority) ? result.priority : 'medium',
      summary: result.summary || 'Document analyzed successfully'
    };

    // Validate and filter entities
    if (Array.isArray(result.entities)) {
      validated.entities = result.entities
        .filter((entity: any) => 
          entity.type && entity.label && entity.value && 
          typeof entity.confidence === 'number'
        )
        .slice(0, 4);
    }

    // Validate and filter insights
    if (Array.isArray(result.insights)) {
      validated.insights = result.insights
        .filter((insight: any) => 
          insight.type && insight.label && insight.value && 
          typeof insight.confidence === 'number'
        )
        .slice(0, 4);
    }

    return validated;
  }

  private getFallbackAnalysis(fileName: string, mimeType: string): ContentAnalysisResult {
    return {
      entities: [],
      insights: [
        {
          type: 'document_type',
          label: 'File Type',
          value: this.detectDocumentTypeFromFileName(fileName),
          confidence: 0.9
        }
      ],
      documentType: this.detectDocumentTypeFromFileName(fileName),
      priority: 'medium',
      summary: 'Limited analysis available - document may need manual review'
    };
  }

  private detectDocumentTypeFromFileName(fileName: string): string {
    const lower = fileName.toLowerCase();
    
    if (lower.includes('invoice')) return 'Invoice';
    if (lower.includes('receipt')) return 'Receipt';
    if (lower.includes('contract')) return 'Contract';
    if (lower.includes('policy')) return 'Insurance Policy';
    if (lower.includes('bill')) return 'Bill';
    if (lower.includes('statement')) return 'Statement';
    if (lower.includes('boarding')) return 'Boarding Pass';
    if (lower.includes('ticket')) return 'Ticket';
    if (lower.includes('report')) return 'Report';
    if (lower.includes('letter')) return 'Letter';
    
    return 'Document';
  }
}

export const contentAnalysisService = new ContentAnalysisService();