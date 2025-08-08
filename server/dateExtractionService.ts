// Date extraction service using basic pattern matching (no external API required)

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
  if (!extractedText) {
    return [];
  }

  try {
    // Extracting expiry dates - debug logging removed for production
    
    // Use regex patterns to find dates
    const datePatterns = [
      // MM/DD/YYYY or MM-DD-YYYY
      /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g,
      // DD/MM/YYYY or DD-MM-YYYY  
      /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g,
      // Month DD, YYYY
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
      // DD Month YYYY
      /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi
    ];

    const expiryKeywords = [
      'expires', 'expiry', 'expiration', 'due', 'renewal', 'valid until', 'valid through'
    ];

    const dates: ExtractedDate[] = [];
    const lines = extractedText.split('\n');

    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      
      // Check if line contains expiry-related keywords
      const hasExpiryKeyword = expiryKeywords.some(keyword => lowerLine.includes(keyword));
      
      if (hasExpiryKeyword) {
        datePatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(line)) !== null) {
            try {
              let date: Date;
              let type: ExtractedDate['type'] = 'expires';
              
              if (match[0].includes('/') || match[0].includes('-')) {
                // Parse MM/DD/YYYY format
                const month = parseInt(match[1]) - 1;
                const day = parseInt(match[2]);
                const year = parseInt(match[3]);
                date = new Date(year, month, day);
              } else {
                // Parse text dates
                date = new Date(match[0]);
              }
              
              // Determine type based on context
              if (lowerLine.includes('due')) type = 'due';
              else if (lowerLine.includes('renewal')) type = 'renewal';
              else if (lowerLine.includes('valid until') || lowerLine.includes('valid through')) type = 'valid_until';
              
              // Only include future dates or recent past dates
              const now = new Date();
              const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
              
              if (date > oneYearAgo && !isNaN(date.getTime())) {
                dates.push({
                  date,
                  type,
                  context: line.trim(),
                  confidence: 0.7
                });
              }
            } catch (error) {
              // Skip invalid dates
            }
          }
        });
      }
    });

    return dates
      .filter((item: ExtractedDate) => 
        item.date && 
        !isNaN(item.date.getTime()) && 
        item.confidence > 0.7
      );

  } catch (error) {
    // Date extraction failed - error logging removed for production
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