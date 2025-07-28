import { storage } from "./storage";

// Chatbot service using basic text search (no external API required)

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ChatResponse {
  answer: string;
  relevantDocuments: Array<{
    id: number;
    name: string;
    extractedText: string;
    relevance: string;
  }>;
}

export async function answerDocumentQuestion(
  userId: string,
  question: string
): Promise<ChatResponse> {
  try {
    // Get all user documents with extracted text
    const documents = await storage.getDocuments(userId);
    const documentsWithText = documents.filter(doc => 
      doc.ocrProcessed && doc.extractedText && doc.extractedText.trim().length > 0
    );

    if (documentsWithText.length === 0) {
      return {
        answer: "I don't have any documents with extracted text to search through. Please upload some documents with text content first.",
        relevantDocuments: []
      };
    }

    // Create a context from all documents
    const documentContext = documentsWithText.map(doc => ({
      id: doc.id,
      name: doc.name,
      category: doc.categoryId,
      expiryDate: doc.expiryDate,
      extractedText: doc.extractedText,
      uploadedAt: doc.uploadedAt
    }));

    // Find relevant documents using basic text search
    const relevantDocs = findRelevantDocumentsBasic(documentContext, question);

    // Generate a basic answer using text search
    const answer = generateBasicAnswer(question, relevantDocs);

    return {
      answer,
      relevantDocuments: relevantDocs.map(doc => ({
        id: doc.id,
        name: doc.name,
        extractedText: doc.extractedText.substring(0, 200) + "...",
        relevance: "High relevance based on content analysis"
      }))
    };

  } catch (error) {
    console.error("Chatbot error:", error);
    throw new Error("Failed to process your question. Please try again.");
  }
}

function findRelevantDocumentsBasic(documents: any[], question: string): any[] {
  // Simple relevance scoring based on keyword matching and semantic similarity
  const questionLower = question.toLowerCase();
  const keywords = questionLower.split(' ').filter(word => word.length > 2);
  
  const scoredDocs = documents.map(doc => {
    const textLower = doc.extractedText.toLowerCase();
    let score = 0;
    
    // Keyword matching
    keywords.forEach(keyword => {
      const matches = (textLower.match(new RegExp(keyword, 'g')) || []).length;
      score += matches * 2;
    });
    
    // Expiry-related scoring
    if (questionLower.includes('expir') || questionLower.includes('due') || questionLower.includes('renew')) {
      if (doc.expiryDate) score += 10;
    }
    
    // Policy/insurance scoring
    if (questionLower.includes('policy') || questionLower.includes('insurance')) {
      if (textLower.includes('policy') || textLower.includes('insurance')) score += 5;
    }
    
    return { ...doc, relevanceScore: score };
  });
  
  // Return top 3 most relevant documents
  return scoredDocs
    .filter(doc => doc.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);
}

function generateBasicAnswer(question: string, relevantDocs: any[]): string {
  if (relevantDocs.length === 0) {
    return "I couldn't find any relevant documents to answer your question. Please try rephrasing your question or upload more documents.";
  }

  const questionLower = question.toLowerCase();
  
  // Handle specific question types
  if (questionLower.includes('expir') || questionLower.includes('due') || questionLower.includes('renew')) {
    const docsWithExpiry = relevantDocs.filter(doc => doc.expiryDate);
    if (docsWithExpiry.length > 0) {
      let answer = "Based on your documents, here are the expiry dates I found:\n\n";
      docsWithExpiry.forEach(doc => {
        const expiryDate = new Date(doc.expiryDate).toLocaleDateString();
        answer += `• ${doc.name}: Expires on ${expiryDate}\n`;
      });
      return answer;
    }
  }
  
  if (questionLower.includes('insurance') || questionLower.includes('policy')) {
    const insuranceDocs = relevantDocs.filter(doc => 
      doc.extractedText.toLowerCase().includes('insurance') || 
      doc.extractedText.toLowerCase().includes('policy')
    );
    if (insuranceDocs.length > 0) {
      let answer = "I found these insurance-related documents:\n\n";
      insuranceDocs.forEach(doc => {
        answer += `• ${doc.name}\n`;
      });
      return answer;
    }
  }
  
  // Generic answer with document references
  let answer = `I found ${relevantDocs.length} relevant document(s) for your question:\n\n`;
  relevantDocs.forEach(doc => {
    answer += `• ${doc.name}\n`;
  });
  answer += "\nPlease be more specific about what you'd like to know about these documents.";
  
  return answer;
}

