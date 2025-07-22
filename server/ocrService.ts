import fs from "fs";
import { createWorker } from 'tesseract.js';
import { extractExpiryDatesFromText, type ExtractedDate } from "./dateExtractionService";

// Free OCR using Tesseract.js
async function extractTextWithTesseract(filePath: string): Promise<string> {
  try {
    console.log('Initializing Tesseract worker...');
    const worker = await createWorker('eng');
    
    try {
      console.log(`Processing image with Tesseract: ${filePath}`);
      const { data: { text } } = await worker.recognize(filePath);
      
      if (!text || text.trim() === '') {
        return 'No text detected';
      }
      
      return text.trim();
    } finally {
      await worker.terminate();
    }
  } catch (error: any) {
    console.error('Tesseract OCR failed:', error);
    throw new Error(`Tesseract OCR failed: ${error.message}`);
  }
}



export async function extractTextFromImage(filePath: string, mimeType?: string): Promise<string> {
  try {
    console.log(`Starting Tesseract OCR for file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Use Tesseract.js for OCR
    const extractedText = await extractTextWithTesseract(filePath);
    console.log(`Tesseract OCR completed, extracted ${extractedText.length} characters`);
    return extractedText;
  } catch (error: any) {
    console.error("Tesseract OCR extraction failed:", error);
    throw new Error(`Failed to extract text from image: ${error?.message || 'Unknown error'}`);
  }
}

export function isImageFile(mimeType: string): boolean {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mimeType);
}

export function isPDFFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

export async function generateDocumentSummary(extractedText: string, fileName: string): Promise<string> {
  try {
    console.log(`Generating basic summary for document: ${fileName}`);
    
    if (!extractedText || extractedText.trim() === '' || extractedText.trim() === 'No text detected') {
      return `Document: ${fileName}. No text content available for summarization.`;
    }

    // Create a basic summary from extracted text
    const lines = extractedText.split('\n').filter(line => line.trim() !== '');
    const firstFewLines = lines.slice(0, 3).join(' ').substring(0, 200);
    
    // Try to identify document type based on common keywords
    const lowerText = extractedText.toLowerCase();
    let docType = 'Document';
    
    if (lowerText.includes('invoice') || lowerText.includes('bill')) docType = 'Invoice/Bill';
    else if (lowerText.includes('receipt')) docType = 'Receipt';
    else if (lowerText.includes('insurance') || lowerText.includes('policy')) docType = 'Insurance Document';
    else if (lowerText.includes('contract') || lowerText.includes('agreement')) docType = 'Contract';
    else if (lowerText.includes('mortgage') || lowerText.includes('loan')) docType = 'Financial Document';
    else if (lowerText.includes('medical') || lowerText.includes('health')) docType = 'Medical Document';
    
    return `${docType}: ${fileName}. Content preview: ${firstFewLines}${firstFewLines.length >= 200 ? '...' : ''}`;
  } catch (error: any) {
    console.error("Summary generation failed:", error);
    return `Document: ${fileName}. Summary generation failed.`;
  }
}

export async function processDocumentOCRAndSummary(filePath: string, fileName: string, mimeType?: string): Promise<{extractedText: string, summary: string}> {
  try {
    console.log(`Processing OCR and summary for: ${fileName}`);
    
    let extractedText = '';
    
    // Extract text if it's an image
    if (isImageFile(mimeType || '')) {
      extractedText = await extractTextFromImage(filePath, mimeType);
    } else if (isPDFFile(mimeType || '')) {
      // For PDFs, we'll provide a basic summary without OCR for now
      console.log(`PDF file detected: ${fileName}. Skipping OCR extraction.`);
      extractedText = 'PDF document - text extraction not currently supported';
    } else {
      extractedText = 'No text detected';
    }
    
    // Generate summary based on extracted text and filename
    const summary = await generateDocumentSummary(extractedText, fileName);
    
    return {
      extractedText,
      summary
    };
  } catch (error: any) {
    console.error("OCR and summary processing failed:", error);
    return {
      extractedText: 'OCR processing failed',
      summary: `Document: ${fileName}. Automatic processing failed.`
    };
  }
}

export function supportsOCR(mimeType: string): boolean {
  // Currently only image files support OCR extraction
  // PDFs are accepted but don't use OCR processing
  return isImageFile(mimeType);
}

export async function processDocumentWithDateExtraction(
  documentId: number,
  documentName: string,
  filePath: string,
  mimeType: string,
  storage: any
): Promise<void> {
  try {
    let extractedText = '';
    
    // Extract text based on file type
    if (isImageFile(mimeType)) {
      extractedText = await extractTextFromImage(filePath, mimeType);
    } else if (isPDFFile(mimeType)) {
      // For PDFs, we'll provide a basic summary without OCR for now
      console.log(`PDF file detected: ${documentName}. Skipping OCR extraction.`);
      extractedText = 'PDF document - text extraction not currently supported';
    } else {
      extractedText = 'No text detected';
    }
    
    // Generate summary
    const summaryResult = await generateDocumentSummary(extractedText, documentName);
    
    // Extract dates from the text (only for image files with actual extracted text)
    let extractedDates: ExtractedDate[] = [];
    if (isImageFile(mimeType) && extractedText && extractedText !== 'No text detected') {
      extractedDates = await extractExpiryDatesFromText(documentName, extractedText);
    }
    
    // Update document with OCR and summary
    await storage.updateDocumentOCRAndSummary(documentId, "system", extractedText, summaryResult);
    
    // If we found expiry dates, update the document with the most relevant one
    if (extractedDates.length > 0) {
      // Sort by confidence and take the highest confidence expiry date
      const bestDate = extractedDates
        .filter(d => ['expiry', 'expires', 'due', 'renewal', 'valid_until'].includes(d.type))
        .sort((a, b) => b.confidence - a.confidence)[0];
      
      if (bestDate) {
        const expiryDate = bestDate.date.toISOString().split('T')[0]; // YYYY-MM-DD format
        await storage.updateDocument(documentId, "system", { 
          expiryDate,
          name: documentName // Keep existing name
        });
        console.log(`Auto-detected expiry date for ${documentName}: ${expiryDate} (${bestDate.context})`);
      }
    }
    
  } catch (error) {
    console.error(`Error processing document with date extraction:`, error);
    throw error;
  }
}