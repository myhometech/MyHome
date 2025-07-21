import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ExtractedDate {
  date: Date;
  type: 'expiry' | 'due' | 'renewal' | 'valid_until' | 'expires';
  context: string;
  confidence: number;
}

export async function extractExpiryDatesFromText(
  documentName: string,
  extractedText: string
): Promise<ExtractedDate[]> {
  if (!extractedText || !process.env.OPENAI_API_KEY) {
    return [];
  }

  try {
    console.log(`Extracting expiry dates from document: ${documentName}`);
    
    const prompt = `
    Analyze the following document text and extract any expiry, due, or renewal dates.
    Document name: ${documentName}
    
    Look for dates related to:
    - Policy expiry dates
    - Insurance renewal dates  
    - Bill due dates
    - Service expiry dates
    - Contract end dates
    - License expiry dates
    - Warranty expiry dates
    - Valid until dates

    For each date found, determine:
    1. The actual date (in ISO format YYYY-MM-DD)
    2. The type of date (expiry, due, renewal, valid_until, expires)
    3. The context (what is expiring/due)
    4. Confidence score (0-1)

    Return a JSON array with this structure:
    [
      {
        "date": "2025-03-15",
        "type": "expiry",
        "context": "Car Insurance Policy",
        "confidence": 0.9
      }
    ]

    Only return dates that are clearly future dates or recent past dates (within 1 year).
    
    Document text:
    ${extractedText}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at extracting dates from documents. Be precise and only extract dates with high confidence. Return valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const result = response.choices[0]?.message?.content;
    if (!result) return [];

    const parsed = JSON.parse(result);
    const dates = parsed.dates || parsed || [];
    
    return dates
      .map((item: any) => ({
        date: new Date(item.date),
        type: item.type,
        context: item.context,
        confidence: item.confidence
      }))
      .filter((item: ExtractedDate) => 
        item.date && 
        !isNaN(item.date.getTime()) && 
        item.confidence > 0.7
      );

  } catch (error) {
    console.error("Date extraction failed:", error);
    return [];
  }
}

export function generateDescriptiveExpiryText(
  documentName: string,
  extractedDate: ExtractedDate
): string {
  const now = new Date();
  const diffTime = extractedDate.date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const context = extractedDate.context || documentName;
  
  if (diffDays < 0) {
    const daysOverdue = Math.abs(diffDays);
    if (daysOverdue === 1) {
      return `${context} expired yesterday`;
    } else if (daysOverdue <= 7) {
      return `${context} expired ${daysOverdue} days ago`;
    } else if (daysOverdue <= 30) {
      return `${context} expired ${Math.floor(daysOverdue / 7)} week${Math.floor(daysOverdue / 7) > 1 ? 's' : ''} ago`;
    } else {
      return `${context} expired ${Math.floor(daysOverdue / 30)} month${Math.floor(daysOverdue / 30) > 1 ? 's' : ''} ago`;
    }
  } else if (diffDays === 0) {
    return `${context} ${extractedDate.type === 'due' ? 'is due' : 'expires'} today`;
  } else if (diffDays === 1) {
    return `${context} ${extractedDate.type === 'due' ? 'is due' : 'expires'} tomorrow`;
  } else if (diffDays <= 7) {
    return `${context} ${extractedDate.type === 'due' ? 'is due' : 'expires'} in ${diffDays} days`;
  } else if (diffDays <= 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${context} ${extractedDate.type === 'due' ? 'is due' : 'expires'} in ${weeks} week${weeks > 1 ? 's' : ''}`;
  } else {
    const months = Math.floor(diffDays / 30);
    return `${context} ${extractedDate.type === 'due' ? 'is due' : 'expires'} in ${months} month${months > 1 ? 's' : ''}`;
  }
}