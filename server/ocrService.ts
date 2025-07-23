import fs from "fs";
import { createWorker } from 'tesseract.js';
import { extractExpiryDatesFromText, type ExtractedDate } from "./dateExtractionService";
import PDFParser from "pdf2json";

// Extract text from PDF using pdf2json for text-based PDFs
async function extractTextFromPDF(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`Starting PDF text extraction for: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      reject(new Error(`PDF file not found: ${filePath}`));
      return;
    }
    
    const pdfParser = new (PDFParser as any)(null, 1);
    
    pdfParser.on("pdfParser_dataError", (errData: any) => {
      console.error('PDF parsing error:', errData.parserError);
      resolve('PDF text extraction failed - this may be a scanned PDF, password-protected, or corrupted file. Consider converting to images for OCR processing.');
    });
    
    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      try {
        let extractedText = '';
        
        // Extract text from all pages
        if (pdfData.Pages && Array.isArray(pdfData.Pages)) {
          for (const page of pdfData.Pages) {
            if (page.Texts && Array.isArray(page.Texts)) {
              for (const text of page.Texts) {
                if (text.R && Array.isArray(text.R)) {
                  for (const run of text.R) {
                    if (run.T) {
                      // Decode URI component to handle special characters
                      const decodedText = decodeURIComponent(run.T);
                      extractedText += decodedText + ' ';
                    }
                  }
                }
              }
            }
            extractedText += '\n'; // Add line break between pages
          }
        }
        
        const cleanedText = extractedText.trim();
        
        if (cleanedText.length > 10) {
          console.log(`PDF text extraction successful: ${cleanedText.length} characters`);
          resolve(cleanedText);
        } else {
          console.log('PDF appears to be image-based or empty');
          resolve('PDF document processed but contains no extractable text. This appears to be an image-based or scanned PDF. Consider converting pages to images for OCR processing.');
        }
        
      } catch (processingError: any) {
        console.error('PDF text processing error:', processingError);
        resolve(`PDF text processing failed: ${processingError.message}`);
      }
    });
    
    // Load and parse the PDF file
    pdfParser.loadPDF(filePath);
  });
}

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
    console.log(`Generating intelligent summary for document: ${fileName}`);
    
    if (!extractedText || extractedText.trim() === '' || extractedText.trim() === 'No text detected') {
      return `${fileName} - No readable content`;
    }

    const text = extractedText.toLowerCase();
    const lines = extractedText.split('\n').filter(line => line.trim() !== '');
    
    // Extract key information intelligently
    let summary = '';
    
    // Phone/Mobile bills
    if (text.includes('bill') && (text.includes('phone') || text.includes('mobile') || text.includes('three') || text.includes('vodafone') || text.includes('ee') || text.includes('o2'))) {
      const provider = extractProvider(text);
      const amount = extractAmount(text);
      const period = extractBillingPeriod(text);
      summary = `${provider} mobile bill${period ? ` for ${period}` : ''}${amount ? ` - ${amount}` : ''}`;
    }
    
    // Utility bills (gas, electric, water)
    else if (text.includes('bill') && (text.includes('gas') || text.includes('electric') || text.includes('water') || text.includes('utility'))) {
      const provider = extractProvider(text);
      const amount = extractAmount(text);
      const period = extractBillingPeriod(text);
      summary = `${provider} utility bill${period ? ` for ${period}` : ''}${amount ? ` - ${amount}` : ''}`;
    }
    
    // Invoices
    else if (text.includes('invoice')) {
      const company = extractCompanyName(text);
      const amount = extractAmount(text);
      summary = `Invoice from ${company}${amount ? ` - ${amount}` : ''}`;
    }
    
    // Receipts
    else if (text.includes('receipt')) {
      const store = extractStore(text);
      const amount = extractAmount(text);
      summary = `Receipt from ${store}${amount ? ` - ${amount}` : ''}`;
    }
    
    // Insurance documents
    else if (text.includes('insurance') || text.includes('policy')) {
      const type = extractInsuranceType(text);
      const company = extractCompanyName(text);
      summary = `${type} insurance policy${company ? ` with ${company}` : ''}`;
    }
    
    // Medical documents
    else if (text.includes('medical') || text.includes('health') || text.includes('hospital') || text.includes('clinic')) {
      summary = `Medical document from ${extractMedicalProvider(text)}`;
    }
    
    // Membership/subscription
    else if (text.includes('membership') || text.includes('subscription') || text.includes('peloton') || text.includes('gym')) {
      const company = extractCompanyName(text);
      const amount = extractAmount(text);
      summary = `${company} membership${amount ? ` - ${amount}` : ''}`;
    }
    
    // Fallback: Use first meaningful line
    else {
      const meaningfulLine = lines.find(line => 
        line.length > 10 && 
        !line.match(/^\d+$/) && 
        !line.match(/^page \d+/i)
      ) || lines[0] || '';
      summary = meaningfulLine.substring(0, 50).trim();
      if (meaningfulLine.length > 50) summary += '...';
    }
    
    return summary || `${fileName} - Content available`;
  } catch (error: any) {
    console.error("Summary generation failed:", error);
    return `${fileName} - Processing error`;
  }
}

// Helper functions for intelligent text extraction
function extractProvider(text: string): string {
  const providers = ['three', 'vodafone', 'ee', 'o2', 'british gas', 'eon', 'octopus', 'bulb', 'sse', 'scottish power'];
  const found = providers.find(p => text.includes(p));
  return found ? found.charAt(0).toUpperCase() + found.slice(1) : 'Provider';
}

function extractAmount(text: string): string | null {
  const amounts = text.match(/£[\d,]+\.?\d*/g) || text.match(/\$[\d,]+\.?\d*/g) || text.match(/€[\d,]+\.?\d*/g);
  return amounts ? amounts[amounts.length - 1] : null; // Get last amount (likely total)
}

function extractBillingPeriod(text: string): string | null {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthMatch = months.find(m => text.includes(m));
  if (monthMatch) {
    const yearMatch = text.match(/20\d{2}/);
    return monthMatch.charAt(0).toUpperCase() + monthMatch.slice(1) + (yearMatch ? ` ${yearMatch[0]}` : '');
  }
  return null;
}

function extractCompanyName(text: string): string {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  // Look for company names in first few lines
  for (const line of lines.slice(0, 5)) {
    if (line.includes('ltd') || line.includes('inc') || line.includes('corp') || line.includes('limited')) {
      return line.trim().substring(0, 30);
    }
  }
  return lines[0]?.substring(0, 20) || 'Company';
}

function extractStore(text: string): string {
  const stores = ['tesco', 'sainsbury', 'asda', 'morrisons', 'waitrose', 'aldi', 'lidl', 'amazon', 'argos'];
  const found = stores.find(s => text.includes(s));
  return found ? found.charAt(0).toUpperCase() + found.slice(1) : 'Store';
}

function extractInsuranceType(text: string): string {
  if (text.includes('car') || text.includes('auto') || text.includes('vehicle')) return 'Car';
  if (text.includes('home') || text.includes('house') || text.includes('building')) return 'Home';
  if (text.includes('health') || text.includes('medical')) return 'Health';
  if (text.includes('life')) return 'Life';
  return 'Insurance';
}

function extractMedicalProvider(text: string): string {
  if (text.includes('nhs')) return 'NHS';
  if (text.includes('hospital')) return 'Hospital';
  if (text.includes('clinic')) return 'Clinic';
  return 'Healthcare provider';
}

export async function processDocumentOCRAndSummary(filePath: string, fileName: string, mimeType?: string): Promise<{extractedText: string, summary: string}> {
  try {
    console.log(`Processing OCR and summary for: ${fileName}`);
    
    let extractedText = '';
    
    // Extract text based on file type
    if (isImageFile(mimeType || '')) {
      extractedText = await extractTextFromImage(filePath, mimeType);
    } else if (isPDFFile(mimeType || '')) {
      extractedText = await extractTextFromPDF(filePath);
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
  // Support OCR for both image files and PDFs
  return isImageFile(mimeType) || isPDFFile(mimeType);
}

export async function processDocumentWithDateExtraction(
  documentId: number,
  documentName: string,
  filePath: string,
  mimeType: string,
  userId: string,
  storage: any
): Promise<void> {
  try {
    let extractedText = '';
    
    // Extract text based on file type
    if (isImageFile(mimeType)) {
      extractedText = await extractTextFromImage(filePath, mimeType);
    } else if (isPDFFile(mimeType)) {
      extractedText = await extractTextFromPDF(filePath);
    } else {
      extractedText = 'No text detected';
    }
    
    // Generate summary
    const summaryResult = await generateDocumentSummary(extractedText, documentName);
    
    // Extract dates from the text (for both images and PDFs with extracted text)
    let extractedDates: ExtractedDate[] = [];
    if ((isImageFile(mimeType) || isPDFFile(mimeType)) && extractedText && 
        extractedText !== 'No text detected' && 
        !extractedText.includes('extraction attempted but no readable text found')) {
      extractedDates = await extractExpiryDatesFromText(documentName, extractedText);
    }
    
    // Update document with OCR and summary
    await storage.updateDocumentOCRAndSummary(documentId, userId, extractedText, summaryResult);
    
    // If we found expiry dates, update the document with the most relevant one
    if (extractedDates.length > 0) {
      // Sort by confidence and take the highest confidence expiry date
      const bestDate = extractedDates
        .filter(d => ['expiry', 'expires', 'due', 'renewal', 'valid_until'].includes(d.type))
        .sort((a, b) => b.confidence - a.confidence)[0];
      
      if (bestDate) {
        const expiryDate = bestDate.date.toISOString().split('T')[0]; // YYYY-MM-DD format
        await storage.updateDocument(documentId, userId, { 
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