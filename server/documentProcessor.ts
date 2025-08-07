import { extractTextFromImage, extractTextFromPDF, isImageFile, isPDFFile } from './ocrService.js';
import { generateDocumentSummary, extractExpiryDatesFromText } from './ocrService.js';

/**
 * Check if file is a DOCX document
 */
function isDocxFile(mimeType: string): boolean {
  const docxMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-word.document.macroEnabled.12',
    'application/msword' // Legacy DOC files
  ];
  return docxMimeTypes.includes(mimeType);
}

export interface ProcessedDocument {
  extractedText: string;
  summary: string | null;
  expiryDate: string | null;
  confidence: number;
  processingType: 'pdf' | 'image' | 'scanned_document';
}

export class DocumentProcessor {
  /**
   * Process a document file with enhanced OCR and analysis
   */
  async processDocument(filePath: string, fileName: string, mimeType: string): Promise<ProcessedDocument> {
    try {
      console.log(`Processing document: ${fileName} (${mimeType})`);
      
      let extractedText = '';
      let processingType: 'pdf' | 'image' | 'scanned_document' = 'image';
      
      if (isPDFFile(mimeType)) {
        // Process PDF files
        extractedText = await extractTextFromPDF(filePath);
        processingType = 'pdf';
        
        // If PDF text extraction failed or returned minimal text, it might be a scanned PDF
        if (extractedText.length < 50 || extractedText.includes('image-based') || extractedText.includes('scanned PDF')) {
          console.log('PDF appears to be scanned, applying enhanced OCR...');
          // Note: For scanned PDFs, would need to convert to images first
          // This is a limitation that could be addressed with pdf2pic or similar
          processingType = 'scanned_document';
        }
      } else if (isImageFile(mimeType)) {
        // Process image files with enhanced OCR
        extractedText = await extractTextFromImage(filePath, mimeType);
        processingType = 'scanned_document';
      } else if (isDocxFile(mimeType)) {
        // Process DOCX files - extract text directly using Mammoth
        const docxConversionService = await import('./docxConversionService');
        const textExtractionResult = await docxConversionService.default.extractTextFromDocx(filePath);
        
        if (textExtractionResult.success && textExtractionResult.extractedText) {
          extractedText = textExtractionResult.extractedText;
          processingType = 'pdf'; // Treat as structured document like PDF
          
          console.log(`✅ DOCX text extracted: ${extractedText.length} characters from ${fileName}`);
        } else {
          // Fallback: try PDF conversion approach
          console.log(`Falling back to PDF conversion for DOCX: ${fileName}`);
          const conversionResult = await docxConversionService.default.convertDocxToPdf(filePath);
          
          if (conversionResult.success && conversionResult.pdfPath) {
            const { extractTextFromPDF } = await import('./ocrService');
            extractedText = await extractTextFromPDF(conversionResult.pdfPath);
            processingType = 'pdf';
            
            // Clean up temporary PDF file
            setTimeout(() => {
              docxConversionService.default.cleanup([conversionResult.pdfPath!]);
            }, 5000);
            
            console.log(`✅ DOCX processed via PDF conversion fallback: ${fileName}`);
          } else {
            throw new Error(`DOCX processing failed: ${textExtractionResult.error}`);
          }
        }
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Generate AI summary if we have sufficient text
      let summary: string | null = null;
      if (extractedText.length > 20) {
        try {
          summary = await generateDocumentSummary(extractedText, fileName);
        } catch (summaryError) {
          console.warn('Summary generation failed:', summaryError);
          summary = null;
        }
      }

      // Extract expiry dates
      let expiryDate: string | null = null;
      try {
        const extractedDates = extractExpiryDatesFromText(extractedText);
        if (extractedDates.length > 0) {
          // Use the first detected date as the primary expiry date
          expiryDate = extractedDates[0].date;
        }
      } catch (dateError) {
        console.warn('Date extraction failed:', dateError);
      }

      // Calculate confidence based on text length and processing type
      const confidence = this.calculateConfidence(extractedText, processingType);

      return {
        extractedText,
        summary,
        expiryDate,
        confidence,
        processingType
      };

    } catch (error: any) {
      console.error(`Document processing failed for ${fileName}:`, error);
      throw new Error(`Failed to process document: ${error.message}`);
    }
  }

  /**
   * Calculate processing confidence based on extracted text quality
   */
  private calculateConfidence(text: string, processingType: 'pdf' | 'image' | 'scanned_document'): number {
    let baseConfidence = 0.5;

    // Adjust base confidence by processing type
    switch (processingType) {
      case 'pdf':
        baseConfidence = 0.9; // High confidence for text-based PDFs
        break;
      case 'image':
        baseConfidence = 0.7; // Medium-high for image files
        break;
      case 'scanned_document':
        baseConfidence = 0.6; // Medium for OCR'd documents
        break;
    }

    // Adjust based on text length (more text = higher confidence)
    if (text.length > 500) {
      baseConfidence += 0.1;
    } else if (text.length > 100) {
      baseConfidence += 0.05;
    } else if (text.length < 20) {
      baseConfidence -= 0.2;
    }

    // Adjust based on text quality indicators
    const wordCount = text.split(/\s+/).length;
    const avgWordLength = text.length / wordCount;
    
    if (avgWordLength > 2 && avgWordLength < 8) {
      baseConfidence += 0.05; // Good average word length
    }

    // Check for common OCR artifacts (reduce confidence)
    const ocrArtifacts = /[^\w\s.,!?@#$%^&*()_+=\-[\]{}|;':"<>?/~`]/g;
    const artifactCount = (text.match(ocrArtifacts) || []).length;
    const artifactRatio = artifactCount / text.length;
    
    if (artifactRatio > 0.05) {
      baseConfidence -= 0.1; // High artifact ratio indicates poor OCR
    }

    // Ensure confidence stays within bounds
    return Math.max(0.1, Math.min(1.0, baseConfidence));
  }

  /**
   * Validate if a document contains meaningful content
   */
  isValidDocument(text: string): boolean {
    if (!text || text.trim().length < 10) {
      return false;
    }

    // Check if it contains actual words (not just artifacts)
    const words = text.split(/\s+/).filter(word => word.length > 2);
    return words.length >= 3;
  }
}

export const documentProcessor = new DocumentProcessor();