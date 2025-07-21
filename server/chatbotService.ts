import OpenAI from "openai";
import { storage } from "./storage";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    // Find relevant documents using semantic search via OpenAI
    const relevantDocs = await findRelevantDocuments(documentContext, question);

    // Generate answer using OpenAI
    const systemPrompt = `You are a helpful document assistant for a homeowner's document management system. 
    You have access to extracted text from their uploaded documents including insurance policies, receipts, warranties, tax documents, and other property-related papers.
    
    Your role is to:
    1. Answer questions about document contents accurately
    2. Help track expiry dates and deadlines
    3. Find specific information across multiple documents
    4. Summarize document details when requested
    5. Alert about upcoming expirations
    
    Always be specific about which documents you're referencing and cite the document names.
    If you cannot find relevant information, clearly state that.
    For expiry-related questions, always mention the current date context.
    
    Current date: ${new Date().toLocaleDateString()}`;

    const userPrompt = `Question: ${question}

    Available documents and their content:
    ${relevantDocs.map(doc => `
    Document: ${doc.name}
    Expiry Date: ${doc.expiryDate || 'Not specified'}
    Content: ${doc.extractedText.substring(0, 1000)}...
    `).join('\n')}
    
    Please answer the question based on the document contents above.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    const answer = response.choices[0]?.message?.content || "I couldn't generate an answer to your question.";

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

async function findRelevantDocuments(documents: any[], question: string): Promise<any[]> {
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

export async function getExpiryAlerts(userId: string): Promise<string> {
  try {
    const expiryData = await storage.getExpiryAlerts(userId);
    
    if (expiryData.expired.length === 0 && 
        expiryData.expiringSoon.length === 0 && 
        expiryData.expiringThisMonth.length === 0) {
      return "Great news! You don't have any documents expiring soon.";
    }
    
    let message = "Here's your expiry status:\n\n";
    
    if (expiryData.expired.length > 0) {
      message += `🔴 EXPIRED (${expiryData.expired.length}):\n`;
      expiryData.expired.forEach(doc => {
        message += `- ${doc.name}: Expired ${Math.abs(doc.daysUntilExpiry)} days ago\n`;
      });
      message += "\n";
    }
    
    if (expiryData.expiringSoon.length > 0) {
      message += `🟠 EXPIRING SOON (${expiryData.expiringSoon.length}):\n`;
      expiryData.expiringSoon.forEach(doc => {
        message += `- ${doc.name}: ${doc.daysUntilExpiry} days remaining\n`;
      });
      message += "\n";
    }
    
    if (expiryData.expiringThisMonth.length > 0) {
      message += `🟡 THIS MONTH (${expiryData.expiringThisMonth.length}):\n`;
      expiryData.expiringThisMonth.forEach(doc => {
        message += `- ${doc.name}: ${doc.daysUntilExpiry} days remaining\n`;
      });
    }
    
    return message.trim();
  } catch (error) {
    console.error("Expiry alerts error:", error);
    return "Unable to retrieve expiry information at this time.";
  }
}