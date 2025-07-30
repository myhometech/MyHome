import fs from "fs";
import { createWorker } from 'tesseract.js';
import { extractExpiryDatesFromText, type ExtractedDate } from "./dateExtractionService";
import { aiDateExtractionService, type ExtractedDate as AIExtractedDate } from "./aiDateExtractionService";
import { reminderSuggestionService } from "./reminderSuggestionService";
import PDFParser from "pdf2json";
import { storageProvider } from './storage/StorageService';
import path from 'path';
import os from 'os';

// MEMORY OPTIMIZED: Extract text from PDF using GCS streaming or local path
async function extractTextFromPDF(filePathOrGCSKey: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    console.log(`Starting PDF text extraction for: ${filePathOrGCSKey}`);
    
    let tempFilePath: string | null = null;
    let isGCSFile = false;
    
    try {
      // Detect if this is a GCS key (contains user ID path structure)
      if (filePathOrGCSKey.includes('/') && !filePathOrGCSKey.startsWith('/') && !filePathOrGCSKey.startsWith('\\')) {
        isGCSFile = true;
        console.log('Detected GCS file, downloading for OCR processing...');
        
        // Download file from GCS to temporary location for OCR processing
        const storage = storageProvider();
        const fileBuffer = await storage.download(filePathOrGCSKey);
        
        // Create temporary file for PDF processing
        tempFilePath = path.join(os.tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).substring(2)}.pdf`);
        await fs.promises.writeFile(tempFilePath, fileBuffer);
        
        console.log(`Downloaded GCS file to temporary location: ${tempFilePath}`);
        filePathOrGCSKey = tempFilePath; // Use temp file for processing
      } else {
        // Local file path - check if exists
        if (!fs.existsSync(filePathOrGCSKey)) {
          reject(new Error(`PDF file not found: ${filePathOrGCSKey}`));
          return;
        }
      }
    
    const pdfParser = new (PDFParser as any)(null, 1);
    
    pdfParser.on("pdfParser_dataError", async (errData: any) => {
      console.error('PDF parsing error:', errData.parserError);
      // Clean up temporary file if it was created
      if (tempFilePath && isGCSFile) {
        try {
          await fs.promises.unlink(tempFilePath);
        } catch (cleanupError) {
          console.warn(`Failed to cleanup temporary file: ${cleanupError}`);
        }
      }
      resolve('PDF text extraction failed - this may be a scanned PDF, password-protected, or corrupted file. Consider converting to images for OCR processing.');
    });
    
    pdfParser.on("pdfParser_dataReady", async (pdfData: any) => {
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
          // Clean up temporary file if it was created
          if (tempFilePath && isGCSFile) {
            try {
              await fs.promises.unlink(tempFilePath);
              console.log(`Cleaned up temporary OCR file: ${tempFilePath}`);
            } catch (cleanupError) {
              console.warn(`Failed to cleanup temporary file: ${cleanupError}`);
            }
          }
          resolve(cleanedText);
        } else {
          console.log('PDF appears to be image-based or empty');
          // Clean up temporary file if it was created
          if (tempFilePath && isGCSFile) {
            try {
              await fs.promises.unlink(tempFilePath);
            } catch (cleanupError) {
              console.warn(`Failed to cleanup temporary file: ${cleanupError}`);
            }
          }
          resolve('PDF document processed but contains no extractable text. This appears to be an image-based or scanned PDF. Consider converting pages to images for OCR processing.');
        }
        
      } catch (processingError: any) {
        console.error('PDF text processing error:', processingError);
        // Clean up temporary file if it was created
        if (tempFilePath && isGCSFile) {
          try {
            await fs.promises.unlink(tempFilePath);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup temporary file: ${cleanupError}`);
          }
        }
        resolve(`PDF text processing failed: ${processingError.message}`);
      }
    });
    
    // Load and parse the PDF file
    pdfParser.loadPDF(filePathOrGCSKey);
    
    } catch (gcsError: any) {
      console.error('GCS file processing error:', gcsError);
      reject(new Error(`Failed to process GCS file: ${gcsError.message}`));
    }
  });
}

// MEMORY OPTIMIZED: Enhanced OCR using Tesseract.js with GCS streaming support
async function extractTextWithTesseract(filePathOrGCSKey: string): Promise<string> {
  let tempFilePath: string | null = null;
  let isGCSFile = false;

  try {
    console.log('Initializing Tesseract worker with enhanced document recognition...');
    
    // Handle GCS files
    if (filePathOrGCSKey.includes('/') && !filePathOrGCSKey.startsWith('/') && !filePathOrGCSKey.startsWith('\\')) {
      isGCSFile = true;
      console.log('Detected GCS file, downloading for OCR processing...');
      
      // Download file from GCS to temporary location for OCR processing
      const storage = storageProvider();
      const fileBuffer = await storage.download(filePathOrGCSKey);
      
      // Create temporary file for OCR processing
      tempFilePath = path.join(os.tmpdir(), `tesseract_${Date.now()}_${Math.random().toString(36).substring(2)}.tmp`);
      await fs.promises.writeFile(tempFilePath, fileBuffer);
      
      console.log(`Downloaded GCS file to temporary location: ${tempFilePath}`);
      filePathOrGCSKey = tempFilePath; // Use temp file for processing
    }
    
    const worker = await createWorker('eng');
    
    try {
      // Configure Tesseract for better document recognition
      await worker.setParameters({
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD (Orientation and Script Detection)
        tessedit_ocr_engine_mode: '2', // Use both legacy and LSTM engines
        preserve_interword_spaces: '1', // Better space preservation
        tessjs_create_hocr: '1', // Create hierarchical OCR output
        tessjs_create_tsv: '1', // Create tab-separated values output
      });

      console.log(`Processing scanned document with enhanced OCR: ${filePathOrGCSKey}`);
      
      const { data: { text, confidence } } = await worker.recognize(filePathOrGCSKey, {
        rectangle: undefined, // Process full image
      });
      
      console.log(`OCR completed with confidence: ${confidence}%`);
      
      // ANDROID-303: Enhanced error detection and fallback handling
      if (!text || text.trim() === '') {
        console.warn(`❌ OCR failed: No text detected (confidence: ${confidence}%)`);
        // Clean up temporary file and worker
        if (tempFilePath && isGCSFile) {
          try {
            await fs.promises.unlink(tempFilePath);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup temporary file: ${cleanupError}`);
          }
        }
        await worker.terminate();
        throw new Error('OCR_NO_TEXT_DETECTED');
      }
      
      // ANDROID-303: Check for low confidence OCR results
      if (confidence < 30) {
        console.warn(`⚠️ OCR low confidence: ${confidence}% - text may be unreliable`);
        // Still return text but flag as low confidence
        throw new Error('OCR_LOW_CONFIDENCE');
      }
      
      // Clean up the extracted text for better readability
      const cleanedText = cleanupOCRText(text);
      
      // Clean up temporary file if it was created
      if (tempFilePath && isGCSFile) {
        try {
          await fs.promises.unlink(tempFilePath);
          console.log(`Cleaned up temporary OCR file: ${tempFilePath}`);
        } catch (cleanupError) {
          console.warn(`Failed to cleanup temporary file: ${cleanupError}`);
        }
      }
      
      return cleanedText;
    } finally {
      // CRITICAL: Ensure worker is always terminated
      try {
        await worker.terminate();
        console.log('✅ Tesseract worker terminated successfully');
      } catch (workerError) {
        console.error('❌ Failed to terminate Tesseract worker:', workerError);
      }
      
      // Additional cleanup for temporary file in case of exceptions
      if (tempFilePath && isGCSFile) {
        try {
          await fs.promises.unlink(tempFilePath);
          console.log('🧹 Cleaned up temporary OCR file');
        } catch (cleanupError) {
          console.warn('⚠️ Failed to cleanup temporary file:', cleanupError);
        }
      }
      
      // Force GC after OCR processing if available
      if (global.gc) {
        const beforeMem = process.memoryUsage();
        global.gc();
        const afterMem = process.memoryUsage();
        const freed = (beforeMem.heapUsed - afterMem.heapUsed) / 1024 / 1024;
        console.log(`🗑️ Post-OCR GC freed ${freed.toFixed(1)}MB`);
      }
    }
  } catch (error: any) {
    console.error('Enhanced Tesseract OCR failed:', error);
    throw new Error(`Enhanced OCR processing failed: ${error.message}`);
  }
}

// Clean up OCR text output for better readability and accuracy
function cleanupOCRText(text: string): string {
  // Remove excessive whitespace and normalize line breaks
  let cleaned = text
    .replace(/\n{3,}/g, '\n\n') // Replace multiple line breaks with double
    .replace(/[ \t]{2,}/g, ' ') // Replace multiple spaces with single space
    .replace(/^\s+|\s+$/gm, '') // Trim each line
    .trim();

  // Fix common OCR errors
  cleaned = cleaned
    .replace(/[|]/g, 'I') // Common | to I confusion
    .replace(/0/g, 'O') // In text contexts, 0 might be O
    .replace(/rn/g, 'm') // Common rn to m confusion
    .replace(/\b1\b/g, 'l') // Standalone 1 to l in text
    .replace(/([a-z])([A-Z])/g, '$1 $2'); // Add space between lowercase and uppercase

  return cleaned;
}



export async function extractTextFromImage(filePathOrGCSKey: string, mimeType?: string): Promise<string> {
  try {
    console.log(`Starting Tesseract OCR for file: ${filePathOrGCSKey}`);
    
    // Use Tesseract.js for OCR with GCS support
    const extractedText = await extractTextWithTesseract(filePathOrGCSKey);
    console.log(`Tesseract OCR completed, extracted ${extractedText.length} characters`);
    return extractedText;
  } catch (error: any) {
    console.error("Tesseract OCR extraction failed:", error);
    
    // ANDROID-303: Enhanced error classification for better user feedback
    if (error.message === 'OCR_NO_TEXT_DETECTED') {
      throw new Error('OCR_NO_TEXT_DETECTED');
    } else if (error.message === 'OCR_LOW_CONFIDENCE') {
      throw new Error('OCR_LOW_CONFIDENCE');
    } else {
      throw new Error(`OCR_PROCESSING_FAILED: ${error?.message || 'Unknown error'}`);
    }
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
      const previousAmount = extractPreviousAmount(text);
      const paymentHistory = extractPaymentHistory(text);
      
      summary = `${provider} mobile bill${period ? ` for ${period}` : ''}${amount ? ` - Amount due: ${amount}` : ''}`;
      if (previousAmount && previousAmount !== amount) {
        summary += `. Previous: ${previousAmount}`;
      }
      if (paymentHistory) {
        summary += `. ${paymentHistory}`;
      }
    }
    
    // Utility bills (gas, electric, water)
    else if (text.includes('bill') && (text.includes('gas') || text.includes('electric') || text.includes('water') || text.includes('utility'))) {
      const provider = extractProvider(text);
      const amount = extractAmount(text);
      const period = extractBillingPeriod(text);
      const previousAmount = extractPreviousAmount(text);
      const paymentHistory = extractPaymentHistory(text);
      
      summary = `${provider} utility bill${period ? ` for ${period}` : ''}${amount ? ` - Amount due: ${amount}` : ''}`;
      if (previousAmount && previousAmount !== amount) {
        summary += `. Previous: ${previousAmount}`;
      }
      if (paymentHistory) {
        summary += `. ${paymentHistory}`;
      }
    }
    
    // Invoices
    else if (text.includes('invoice')) {
      const company = extractCompanyName(text);
      const amount = extractAmount(text);
      const dueDate = extractDueDate(text);
      const invoiceNumber = extractInvoiceNumber(text);
      summary = `Invoice from ${company}${amount ? ` - Amount: ${amount}` : ''}${dueDate ? ` (Due: ${dueDate})` : ''}${invoiceNumber ? ` #${invoiceNumber}` : ''}`;
    }
    
    // Receipts
    else if (text.includes('receipt')) {
      const store = extractStore(text);
      const amount = extractAmount(text);
      const date = extractReceiptDate(text);
      summary = `Receipt from ${store}${amount ? ` - ${amount}` : ''}${date ? ` (${date})` : ''}`;
    }
    
    // Insurance documents
    else if (text.includes('insurance') || text.includes('policy')) {
      const type = extractInsuranceType(text);
      const company = extractCompanyName(text);
      const renewalDate = extractRenewalDate(text);
      const premium = extractPremium(text);
      summary = `${type} insurance policy${company ? ` with ${company}` : ''}${premium ? ` - Premium: ${premium}` : ''}${renewalDate ? ` (Renewal: ${renewalDate})` : ''}`;
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
  // Look for total amounts first (most important)
  const totalRegex = /total\s+(?:due|amount|charges?|after\s+vat|bill)?\s*[:\-]?\s*£([\d,]+\.?\d*)/gi;
  const totalMatch = text.match(totalRegex);
  if (totalMatch && totalMatch.length > 0) {
    const amount = totalMatch[totalMatch.length - 1].match(/£([\d,]+\.?\d*)/i);
    if (amount) return `£${amount[1]}`;
  }
  
  // Look for "total due" or "amount due" patterns
  const dueRegex = /(?:total\s+due|amount\s+due|balance\s+due)\s+(?:by\s+[\d\/]+\s+)?£([\d,]+\.?\d*)/gi;
  const dueMatch = text.match(dueRegex);
  if (dueMatch && dueMatch.length > 0) {
    const amount = dueMatch[0].match(/£([\d,]+\.?\d*)/i);
    if (amount) return `£${amount[1]}`;
  }
  
  // Fallback: find all currency amounts and take the largest one (likely the total)
  const amounts = text.match(/£([\d,]+\.?\d*)/g) || text.match(/\$([\d,]+\.?\d*)/g) || text.match(/€([\d,]+\.?\d*)/g);
  if (amounts && amounts.length > 0) {
    // Convert to numbers, find max, return formatted
    const numericAmounts = amounts.map(a => {
      const num = parseFloat(a.replace(/[£$€,]/g, ''));
      return { text: a, value: num };
    });
    const maxAmount = numericAmounts.reduce((max, curr) => curr.value > max.value ? curr : max);
    return maxAmount.text;
  }
  
  return null;
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

function extractPreviousAmount(text: string): string | null {
  // Look for patterns like "previous bill £45.00", "last month £50", "last payment £40"
  const previousRegex = /(?:previous\s+(?:bill|payment|amount)|last\s+(?:bill|payment|month))\s*[:\-]?\s*£([\d,]+\.?\d*)/gi;
  const match = text.match(previousRegex);
  if (match && match.length > 0) {
    const amount = match[0].match(/£([\d,]+\.?\d*)/i);
    if (amount) return `£${amount[1]}`;
  }
  
  // Look for payment history in statements
  const paymentRegex = /payment\s+received\s+£([\d,]+\.?\d*)/gi;
  const paymentMatch = text.match(paymentRegex);
  if (paymentMatch && paymentMatch.length > 0) {
    const amount = paymentMatch[paymentMatch.length - 1].match(/£([\d,]+\.?\d*)/i);
    if (amount) return `£${amount[1]}`;
  }
  
  return null;
}

function extractPaymentHistory(text: string): string | null {
  // Look for recent payment information
  const lines = text.split('\n');
  
  // Find payment confirmation patterns
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Payment received with date
    if (lowerLine.includes('payment received') || lowerLine.includes('payment confirmed')) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4})/i);
      const amountMatch = line.match(/£([\d,]+\.?\d*)/);
      if (dateMatch && amountMatch) {
        return `Last payment: £${amountMatch[1]} (${dateMatch[0]})`;
      }
    }
    
    // Direct debit setup
    if (lowerLine.includes('direct debit') && lowerLine.includes('date')) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i);
      if (dateMatch) {
        return `Direct debit scheduled: ${dateMatch[0]}`;
      }
    }
    
    // Monthly payment pattern
    if (lowerLine.includes('monthly') && lowerLine.includes('£')) {
      const amountMatch = line.match(/£([\d,]+\.?\d*)/);
      if (amountMatch) {
        return `Monthly payment: £${amountMatch[1]}`;
      }
    }
  }
  
  return null;
}

function extractDueDate(text: string): string | null {
  const dueDateRegex = /(?:due\s+date|payment\s+due)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4})/gi;
  const match = text.match(dueDateRegex);
  if (match && match.length > 0) {
    const dateMatch = match[0].match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4})/i);
    if (dateMatch) return dateMatch[0];
  }
  return null;
}

function extractInvoiceNumber(text: string): string | null {
  const invoiceRegex = /(?:invoice\s+(?:no|number)|ref(?:erence)?)\s*[:\-#]?\s*([A-Z0-9\-]+)/gi;
  const match = text.match(invoiceRegex);
  if (match && match.length > 0) {
    const numberMatch = match[0].match(/([A-Z0-9\-]+)$/i);
    if (numberMatch) return numberMatch[1];
  }
  return null;
}

function extractReceiptDate(text: string): string | null {
  const lines = text.split('\n');
  for (const line of lines.slice(0, 10)) { // Check first 10 lines
    const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4})/i);
    if (dateMatch) return dateMatch[0];
  }
  return null;
}

function extractRenewalDate(text: string): string | null {
  const renewalRegex = /(?:renewal\s+date|renews\s+on|expires?\s+on)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4})/gi;
  const match = text.match(renewalRegex);
  if (match && match.length > 0) {
    const dateMatch = match[0].match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4})/i);
    if (dateMatch) return dateMatch[0];
  }
  return null;
}

function extractPremium(text: string): string | null {
  const premiumRegex = /(?:premium|annual\s+cost|yearly\s+cost)\s*[:\-]?\s*£([\d,]+\.?\d*)/gi;
  const match = text.match(premiumRegex);
  if (match && match.length > 0) {
    const amountMatch = match[0].match(/£([\d,]+\.?\d*)/i);
    if (amountMatch) return `£${amountMatch[1]}`;
  }
  return null;
}

export async function processDocumentOCRAndSummary(filePathOrGCSKey: string, fileName: string, mimeType?: string): Promise<{extractedText: string, summary: string, ocrStatus?: string}> {
  try {
    console.log(`Processing OCR and summary for: ${fileName}`);
    
    let extractedText = '';
    let ocrStatus = 'success';
    
    // Extract text based on file type
    if (isImageFile(mimeType || '')) {
      try {
        extractedText = await extractTextFromImage(filePathOrGCSKey, mimeType);
      } catch (ocrError: any) {
        // ANDROID-303: Handle OCR failures with specific error types
        if (ocrError.message === 'OCR_NO_TEXT_DETECTED') {
          ocrStatus = 'no_text_detected';
          extractedText = '';
        } else if (ocrError.message === 'OCR_LOW_CONFIDENCE') {
          ocrStatus = 'low_confidence';
          extractedText = 'Text detected but quality is poor';
        } else {
          ocrStatus = 'processing_failed';
          extractedText = '';
        }
        console.warn(`OCR issue for ${fileName}: ${ocrError.message}`);
      }
    } else if (isPDFFile(mimeType || '')) {
      extractedText = await extractTextFromPDF(filePathOrGCSKey);
      if (extractedText.includes('PDF text extraction failed')) {
        ocrStatus = 'pdf_processing_failed';
      }
    } else {
      extractedText = '';
      ocrStatus = 'unsupported_format';
    }
    
    // Generate summary based on extracted text and filename
    const summary = await generateDocumentSummary(extractedText, fileName);
    
    return {
      extractedText,
      summary,
      ocrStatus
    };
  } catch (error: any) {
    console.error("OCR and summary processing failed:", error);
    return {
      extractedText: '',
      summary: `Document: ${fileName}. Automatic processing failed.`,
      ocrStatus: 'processing_failed'
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
  filePathOrGCSKey: string,
  mimeType: string,
  userId: string,
  storage: any
): Promise<void> {
  try {
    let extractedText = '';
    
    // Extract text based on file type
    if (isImageFile(mimeType)) {
      extractedText = await extractTextFromImage(filePathOrGCSKey, mimeType);
    } else if (isPDFFile(mimeType)) {
      extractedText = await extractTextFromPDF(filePathOrGCSKey);
    } else {
      extractedText = 'No text detected';
    }
    
    // Generate summary
    const summaryResult = await generateDocumentSummary(extractedText, documentName);
    
    // DOC-304: Enhanced date extraction using both OCR patterns and AI
    let extractedDates: ExtractedDate[] = [];
    let aiDates: AIExtractedDate[] = [];
    
    if ((isImageFile(mimeType) || isPDFFile(mimeType)) && extractedText && 
        extractedText !== 'No text detected' && 
        !extractedText.includes('extraction attempted but no readable text found')) {
      
      // Get OCR-based dates using pattern matching
      const ocrDates = await extractExpiryDatesFromText(documentName, extractedText);
      console.log(`DOC-304: OCR-based date extraction found ${ocrDates.length} dates`);
      
      // Get AI-based dates using GPT-4
      try {
        aiDates = await aiDateExtractionService.extractDatesFromText(extractedText, documentName, userId);
        console.log(`DOC-304: AI-based date extraction found ${aiDates.length} dates`);
      } catch (aiError) {
        console.error('DOC-304: AI date extraction failed, using OCR-only:', aiError);
      }
      
      // Combine and prioritize dates by confidence
      extractedDates = combineDateSources(ocrDates, aiDates, documentName);
    }
    
    // Update document with OCR and summary
    await storage.updateDocumentOCRAndSummary(documentId, userId, extractedText, summaryResult);
    
    // DOC-304: Update document with the highest confidence date from combined sources
    if (extractedDates.length > 0) {
      // Sort by confidence and take the highest confidence expiry date
      const bestDate = extractedDates
        .filter(d => ['expiry', 'expires', 'due', 'renewal', 'valid_until'].includes(d.type))
        .sort((a, b) => b.confidence - a.confidence)[0];
      
      if (bestDate) {
        const expiryDate = typeof bestDate.date === 'string' ? bestDate.date : bestDate.date.toISOString().split('T')[0];
        await storage.updateDocument(documentId, userId, { 
          expiryDate,
          name: documentName // Keep existing name
        });
        
        const source = (bestDate as any).source || 'ocr';
        console.log(`DOC-304: Auto-detected expiry date for ${documentName}: ${expiryDate} (source: ${source}, confidence: ${bestDate.confidence})`);
        console.log(`DOC-304: Date context: ${bestDate.context || 'No context available'}`);
        
        // DOC-305: Create reminder suggestion for this document
        try {
          const expiryDateObj = new Date(expiryDate);
          await reminderSuggestionService.processDocumentForReminders(
            documentId,
            userId,
            expiryDateObj,
            source
          );
        } catch (reminderError) {
          console.error(`DOC-305: Failed to create reminder suggestion for document ${documentId}:`, reminderError);
          // Don't fail the OCR process if reminder creation fails
        }
      }
    } else {
      console.log(`DOC-304: No expiry dates found for ${documentName}`);
    }
    
  } catch (error) {
    console.error(`Error processing document with date extraction:`, error);
    throw error;
  }
}

/**
 * DOC-304: Combine OCR-based and AI-based date extraction results
 * Prioritizes dates by confidence and removes duplicates
 */
function combineDateSources(
  ocrDates: ExtractedDate[], 
  aiDates: AIExtractedDate[], 
  documentName: string
): ExtractedDate[] {
  const allDates: ExtractedDate[] = [];
  const dateMap = new Map<string, ExtractedDate>();

  // Add OCR dates with source tracking
  for (const ocrDate of ocrDates) {
    const dateKey = ocrDate.date.toISOString().split('T')[0];
    const enhancedDate: ExtractedDate = {
      ...ocrDate,
      source: 'ocr' as any
    };
    
    dateMap.set(`${dateKey}-${ocrDate.type}`, enhancedDate);
  }

  // Add AI dates, potentially overriding OCR dates if confidence is higher
  for (const aiDate of aiDates) {
    const dateKey = aiDate.date;
    const mapKey = `${dateKey}-${aiDate.type}`;
    
    // Convert AI date format to match OCR format
    const convertedDate: ExtractedDate = {
      date: new Date(aiDate.date),
      type: aiDate.type,
      context: aiDate.context || `AI-extracted from ${documentName}`,
      confidence: aiDate.confidence,
      source: 'ai' as any
    };

    const existingDate = dateMap.get(mapKey);
    if (!existingDate || aiDate.confidence > existingDate.confidence) {
      dateMap.set(mapKey, convertedDate);
      
      if (existingDate) {
        console.log(`DOC-304: AI date (confidence: ${aiDate.confidence}) replaced OCR date (confidence: ${existingDate.confidence}) for ${dateKey}`);
      }
    } else {
      console.log(`DOC-304: OCR date (confidence: ${existingDate.confidence}) retained over AI date (confidence: ${aiDate.confidence}) for ${dateKey}`);
    }
  }

  // Convert map back to array and sort by confidence
  const combinedDates = Array.from(dateMap.values())
    .sort((a, b) => b.confidence - a.confidence);

  console.log(`DOC-304: Combined date extraction results:`, {
    ocrDates: ocrDates.length,
    aiDates: aiDates.length,
    finalDates: combinedDates.length,
    bestSource: combinedDates[0]?.source || 'none',
    bestConfidence: combinedDates[0]?.confidence || 0
  });

  return combinedDates;
}