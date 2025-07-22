import OpenAI from "openai";
import fs from "fs";
import FormData from 'form-data';
import fetch from 'node-fetch';
import { createWorker } from 'tesseract.js';
import { extractExpiryDatesFromText } from "./dateExtractionService";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// OCR.Space API (free tier: 25,000 requests/month)
async function extractTextWithOCRSpace(filePath: string): Promise<string> {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('apikey', process.env.OCR_SPACE_API_KEY);
    form.append('language', 'eng');
    form.append('detectOrientation', 'true');
    form.append('scale', 'true');
    form.append('OCREngine', '2'); // Use OCR Engine 2 for better accuracy
    
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json() as any;
    
    if (!result.IsErroredOnProcessing && result.ParsedResults && result.ParsedResults.length > 0) {
      const extractedText = result.ParsedResults[0].ParsedText;
      return extractedText && extractedText.trim() !== '' ? extractedText.trim() : 'No text detected';
    } else {
      throw new Error(result.ErrorMessage || 'OCR.Space processing failed');
    }
  } catch (error: any) {
    console.error('OCR.Space API failed:', error);
    throw new Error(`OCR.Space API failed: ${error.message}`);
  }
}

export async function extractTextFromImage(filePath: string, mimeType?: string): Promise<string> {
  try {
    console.log(`Starting OCR for file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Try free OCR methods first (Tesseract.js), then fallback to paid services
    try {
      console.log('Attempting free OCR with Tesseract.js...');
      const tesseractText = await extractTextWithTesseract(filePath);
      if (tesseractText && tesseractText.trim() !== '' && tesseractText !== 'No text detected') {
        console.log(`Tesseract OCR successful, extracted ${tesseractText.length} characters`);
        return tesseractText;
      }
    } catch (tesseractError: any) {
      console.warn('Tesseract OCR failed, trying other methods:', tesseractError.message);
    }

    // Try OCR.Space API if available
    if (process.env.OCR_SPACE_API_KEY) {
      try {
        console.log('Attempting OCR with OCR.Space API...');
        const ocrSpaceText = await extractTextWithOCRSpace(filePath);
        if (ocrSpaceText && ocrSpaceText.trim() !== '' && ocrSpaceText !== 'No text detected') {
          console.log(`OCR.Space successful, extracted ${ocrSpaceText.length} characters`);
          return ocrSpaceText;
        }
      } catch (ocrSpaceError: any) {
        console.warn('OCR.Space failed, trying OpenAI:', ocrSpaceError.message);
      }
    }

    // Check if we have a valid OpenAI API key before processing
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
      console.log('No OpenAI API key configured, OCR processing unavailable');
      return 'OCR requires API key configuration (Tesseract failed)';
    }

    // Read the image file and convert to base64
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');
    
    console.log(`File read successfully, size: ${imageBuffer.length} bytes`);

    // Determine the correct MIME type for the data URL
    let dataUrlMimeType = 'image/jpeg'; // default
    if (mimeType) {
      if (mimeType === 'image/png') dataUrlMimeType = 'image/png';
      else if (mimeType === 'image/webp') dataUrlMimeType = 'image/webp';
      else if (mimeType === 'image/jpg') dataUrlMimeType = 'image/jpeg';
    }
    
    console.log(`Using MIME type: ${dataUrlMimeType}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text from this document image. Return only the extracted text, preserving line breaks and formatting as much as possible. If no text is found, return 'No text detected'."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${dataUrlMimeType};base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 2000,
    });

    const extractedText = response.choices[0]?.message?.content || 'No text detected';
    console.log(`OCR completed successfully, extracted ${extractedText.length} characters`);
    return extractedText.trim();
  } catch (error: any) {
    console.error("OCR extraction failed:", error);
    console.error("Error details:", {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      filePath,
      mimeType
    });
    
    // Provide more helpful error message for quota issues
    if (error?.status === 429) {
      throw new Error(`OCR failed due to OpenAI quota limits. Please check your OpenAI billing and usage: ${error?.message || 'Unknown error'}`);
    }
    
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
    console.log(`Generating summary for document: ${fileName}`);
    
    if (!extractedText || extractedText.trim() === '' || extractedText.trim() === 'No text detected') {
      return `Document: ${fileName}. No text content available for summarization.`;
    }

    // Check if we have a valid API key before making the request
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
      console.log('No OpenAI API key configured, skipping AI summarization');
      return `Document: ${fileName}. Contains ${extractedText.length} characters of extracted text. AI summarization requires OpenAI API key.`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing and summarizing documents. Create concise, searchable summaries that capture the key information, entities, dates, amounts, and context that someone might search for later. Focus on actionable details and important facts."
        },
        {
          role: "user",
          content: `Please create a comprehensive but concise summary of this document that will be used for search purposes. Include key details like dates, amounts, names, addresses, document type, and main purpose. 

Document content:
${extractedText.substring(0, 4000)} // Limit to avoid token limits

Document filename: ${fileName}

Respond with JSON in this exact format: { "summary": "your summary here" }`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{"summary": ""}');
    const summary = result.summary || `Document: ${fileName}. Content extracted but summary generation failed.`;
    
    console.log(`Summary generated successfully for ${fileName}, length: ${summary.length} characters`);
    return summary;
  } catch (error: any) {
    console.error("Summary generation failed:", error);
    console.error("Error details:", {
      message: error?.message || 'Unknown error',
      fileName,
      textLength: extractedText?.length || 0
    });
    
    // Provide more helpful error message for quota issues
    if (error?.status === 429) {
      return `Document: ${fileName}. Text extracted successfully (${extractedText?.length || 0} characters) but AI summarization failed due to OpenAI quota limits. Please check your OpenAI billing and usage.`;
    }
    
    // Return a basic summary as fallback for other errors
    return `Document: ${fileName}. Text extracted (${extractedText?.length || 0} characters) but automatic summarization failed. Error: ${error?.message || 'Unknown error'}`;
  }
}

export async function processDocumentOCRAndSummary(filePath: string, fileName: string, mimeType?: string): Promise<{extractedText: string, summary: string}> {
  try {
    console.log(`Processing OCR and summary for: ${fileName}`);
    
    let extractedText = '';
    
    // Extract text if it's an image
    if (isImageFile(mimeType || '')) {
      extractedText = await extractTextFromImage(filePath, mimeType);
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
  return isImageFile(mimeType) || isPDFFile(mimeType);
}

export async function processDocumentWithDateExtraction(
  documentId: number,
  documentName: string,
  filePath: string,
  mimeType: string,
  storage: any
): Promise<void> {
  try {
    // Extract text first
    const extractedText = await extractTextFromImage(filePath, mimeType);
    
    // Generate summary
    const summaryResult = await generateDocumentSummary(extractedText, documentName);
    
    // Extract dates from the text
    const extractedDates = await extractExpiryDatesFromText(documentName, extractedText);
    
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