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
    const content = extractedText || summary || '';
    
    try {
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
      
    } catch (error: any) {
      console.error('Error in content analysis:', error);
      
      // Handle OpenAI quota exceeded specifically
      if (error?.status === 429 || error?.code === 'insufficient_quota') {
        console.log('OpenAI quota exceeded, using enhanced fallback analysis');
        return this.getEnhancedFallbackAnalysis(fileName, mimeType, content);
      }
      
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

  private getEnhancedFallbackAnalysis(fileName: string, mimeType: string, content: string): ContentAnalysisResult {
    const entities: ContentEntity[] = [];
    const insights: ContentInsight[] = [];
    
    // Enhanced regex-based extraction when AI is unavailable
    const dateRegex = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{2,4}[-\/]\d{1,2}[-\/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{2,4})/gi;
    const amountRegex = /[£$€¥₹][\d,]+\.?\d*|\$\d+|\d+\.\d{2}(?:\s*(?:USD|GBP|EUR|CAD))?/gi;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;
    const phoneRegex = /(?:\+44\s?|0)(?:\d{4}\s?\d{6}|\d{3}\s?\d{3}\s?\d{4})/gi;

    // Extract dates
    const dates = content.match(dateRegex);
    if (dates && dates.length > 0) {
      dates.slice(0, 2).forEach(date => {
        entities.push({
          type: 'date',
          label: 'Date Found',
          value: date,
          confidence: 0.8
        });
      });
    }

    // Extract amounts
    const amounts = content.match(amountRegex);
    if (amounts && amounts.length > 0) {
      amounts.slice(0, 2).forEach(amount => {
        entities.push({
          type: 'amount',
          label: 'Amount',
          value: amount,
          confidence: 0.75
        });
      });
    }

    // Extract emails
    const emails = content.match(emailRegex);
    if (emails && emails.length > 0) {
      emails.slice(0, 2).forEach(email => {
        entities.push({
          type: 'contact',
          label: 'Email',
          value: email,
          confidence: 0.9
        });
      });
    }

    // Extract phone numbers
    const phones = content.match(phoneRegex);
    if (phones && phones.length > 0) {
      phones.slice(0, 2).forEach(phone => {
        entities.push({
          type: 'contact',
          label: 'Phone',
          value: phone,
          confidence: 0.8
        });
      });
    }

    // Determine document type from filename
    let documentType = 'document';
    if (fileName.toLowerCase().includes('invoice')) documentType = 'invoice';
    else if (fileName.toLowerCase().includes('receipt')) documentType = 'receipt';
    else if (fileName.toLowerCase().includes('contract')) documentType = 'contract';
    else if (fileName.toLowerCase().includes('policy')) documentType = 'insurance policy';

    entities.push({
      type: 'document_type',
      label: 'Document Type',
      value: documentType,
      confidence: 0.7
    });

    insights.push({
      type: 'document_type',
      label: 'Content Analysis',
      value: `Enhanced offline analysis completed - found ${entities.length} key elements`,
      confidence: 0.6
    });

    return {
      entities: entities.slice(0, 8),
      insights,
      documentType,
      priority: amounts && amounts.length > 0 ? 'medium' : 'low',
      summary: `Document analyzed offline - ${entities.length} key elements identified`
    };
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