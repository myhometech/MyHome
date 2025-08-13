/**
 * TICKET 4: Unified Email Conversion Service
 * 
 * This service handles both email body and attachment conversion through a unified pipeline
 * using either CloudConvert or Puppeteer based on the PDF_CONVERTER_ENGINE feature flag.
 */

import { CloudConvertService, ConvertInput, ConvertResult } from './cloudConvertService.js';
import { renderAndCreateEmailBodyPdf, EmailBodyPdfInput } from './emailBodyPdfService.js';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { storage } from './storage.js';
import { insertDocumentSchema } from '../shared/schema.js';

// Initialize DOMPurify for server-side HTML sanitization
const window = new JSDOM('').window;
const purify = DOMPurify(window);

export interface EmailContent {
  strippedHtml?: string;
  bodyHtml?: string;
  bodyPlain?: string;
}

export interface AttachmentData {
  filename: string;
  content: string; // base64
  contentType: string;
  size: number;
}

export interface EmailMetadata {
  from: string;
  to: string[];
  subject?: string;
  messageId?: string;
  receivedAt: string;
}

export interface UnifiedConversionInput {
  tenantId: string;
  emailContent: EmailContent;
  attachments: AttachmentData[];
  emailMetadata: EmailMetadata;
  categoryId?: number | null;
  tags?: string[];
}

export interface ConversionResult {
  emailBodyPdf?: {
    documentId: number;
    filename: string;
    created: boolean;
  };
  attachmentResults: Array<{
    success: boolean;
    filename: string;
    documentId?: number;
    converted?: boolean;
    classification?: string;
    error?: string;
  }>;
  cloudConvertJobId?: string;
  conversionEngine: 'cloudconvert' | 'puppeteer';
}

export class UnifiedEmailConversionService {
  private cloudConvertService?: CloudConvertService;

  constructor() {
    // Initialize CloudConvert service only if API key is available
    try {
      if (process.env.CLOUDCONVERT_API_KEY) {
        this.cloudConvertService = new CloudConvertService();
      }
    } catch (error) {
      console.warn('⚠️ CloudConvert service initialization failed:', error);
    }
  }

  /**
   * TICKET 4: Main conversion method with feature flag support
   */
  async convertEmail(input: UnifiedConversionInput): Promise<ConversionResult> {
    const useCloudConvert = this.shouldUseCloudConvert();
    
    console.log(`🔄 Starting email conversion using ${useCloudConvert ? 'CloudConvert' : 'Puppeteer'} engine`);
    
    if (useCloudConvert) {
      return await this.convertWithCloudConvert(input);
    } else {
      return await this.convertWithPuppeteer(input);
    }
  }

  /**
   * TICKET 4: Check if CloudConvert should be used based on feature flag
   */
  private shouldUseCloudConvert(): boolean {
    const pdfEngine = process.env.PDF_CONVERTER_ENGINE?.toLowerCase();
    const hasApiKey = !!process.env.CLOUDCONVERT_API_KEY;
    
    if (pdfEngine === 'cloudconvert' && !hasApiKey) {
      console.warn('⚠️ PDF_CONVERTER_ENGINE=cloudconvert but no CLOUDCONVERT_API_KEY found, falling back to Puppeteer');
      return false;
    }
    
    return pdfEngine === 'cloudconvert' && hasApiKey;
  }

  /**
   * TICKET 4: Convert email using CloudConvert (new pathway)
   */
  private async convertWithCloudConvert(input: UnifiedConversionInput): Promise<ConversionResult> {
    if (!this.cloudConvertService) {
      throw new Error('CloudConvert service not available');
    }

    try {
      // Build ConvertInput array as specified in Ticket 4
      const convertInputs = await this.buildConvertInputArray(input);
      
      console.log(`📊 Built CloudConvert input array: ${convertInputs.length} items`);
      console.log(`   - Email body: ${convertInputs.filter(i => i.kind === 'html').length}`);
      console.log(`   - Attachments: ${convertInputs.filter(i => i.kind === 'file').length}`);

      // Convert all inputs through CloudConvert
      const cloudConvertResult = await this.cloudConvertService.convertToPdf(convertInputs);
      
      console.log(`✅ CloudConvert job ${cloudConvertResult.jobId} completed with ${cloudConvertResult.files.length} PDFs`);

      // Process results and create documents
      const result = await this.processCloudConvertResults(
        cloudConvertResult,
        input,
        convertInputs
      );

      return {
        ...result,
        cloudConvertJobId: cloudConvertResult.jobId,
        conversionEngine: 'cloudconvert'
      };

    } catch (error) {
      console.error('❌ CloudConvert conversion failed:', error);
      // Fallback to Puppeteer on CloudConvert failure
      console.log('🔄 Falling back to Puppeteer conversion...');
      return await this.convertWithPuppeteer(input);
    }
  }

  /**
   * TICKET 4: Convert email using existing Puppeteer pathway (fallback)
   */
  private async convertWithPuppeteer(input: UnifiedConversionInput): Promise<ConversionResult> {
    const result: ConversionResult = {
      attachmentResults: [],
      conversionEngine: 'puppeteer'
    };

    try {
      // Create email body PDF using existing Puppeteer service
      const emailBodyInput: EmailBodyPdfInput = {
        tenantId: input.tenantId,
        messageId: input.emailMetadata.messageId || `mailgun-${Date.now()}`,
        subject: this.generateEmailTitle(input.emailMetadata),
        from: input.emailMetadata.from,
        to: input.emailMetadata.to,
        receivedAt: input.emailMetadata.receivedAt,
        html: input.emailContent.strippedHtml || input.emailContent.bodyHtml || null,
        text: input.emailContent.bodyPlain || null,
        ingestGroupId: null,
        categoryId: input.categoryId,
        tags: [...(input.tags || []), 'email', 'email-body']
      };

      const emailBodyResult = await renderAndCreateEmailBodyPdf(emailBodyInput);
      
      result.emailBodyPdf = {
        documentId: emailBodyResult.documentId,
        filename: emailBodyResult.name,
        created: emailBodyResult.created
      };

      console.log(`✅ Puppeteer email body PDF: Document ID ${emailBodyResult.documentId}`);

      // Process attachments using existing enhanced processor
      if (input.attachments.length > 0) {
        const { enhancedAttachmentProcessor } = await import('./enhancedAttachmentProcessor.js');
        
        const processingResult = await enhancedAttachmentProcessor.processEmailAttachments(
          input.attachments,
          input.tenantId,
          {
            from: input.emailMetadata.from,
            subject: input.emailMetadata.subject || 'No Subject',
            messageId: input.emailMetadata.messageId || `mailgun-${Date.now()}`,
            timestamp: input.emailMetadata.receivedAt
          }
        );

        // Convert enhanced processor result to our expected format
        result.attachmentResults = processingResult.processedAttachments.map((processed: any) => ({
          success: processed.success || false,
          filename: processed.originalFilename || processed.filename || 'unknown',
          documentId: processed.originalDocumentId || processed.documentId,
          converted: processed.converted || false,
          classification: processed.classification || 'unknown',
          error: processed.error
        }));
        
        const successCount = result.attachmentResults.filter(r => r.success).length;
        const conversionCount = result.attachmentResults.filter(r => r.converted).length;
        console.log(`📁 Puppeteer processed ${successCount}/${input.attachments.length} attachments (${conversionCount} converted)`);
      }

      return result;

    } catch (error) {
      console.error('❌ Puppeteer conversion failed:', error);
      throw error;
    }
  }

  /**
   * TICKET 4: Build ConvertInput array for CloudConvert
   * - One 'html' input for email body
   * - 'file' inputs for non-PDF attachments (Office/Images)
   * - Exclude PDFs (they are stored as-is)
   */
  private async buildConvertInputArray(input: UnifiedConversionInput): Promise<ConvertInput[]> {
    const convertInputs: ConvertInput[] = [];

    // 1. Add email body as HTML input
    const emailHtml = await this.prepareEmailBodyHtml(input);
    if (emailHtml) {
      convertInputs.push({
        kind: 'html',
        filename: 'body.html',
        html: emailHtml
      });
    }

    // 2. Add non-PDF attachments as file inputs
    const { attachmentClassificationService } = await import('./attachmentClassificationService.js');
    
    for (const attachment of input.attachments) {
      const classification = attachmentClassificationService.classifyAttachment(attachment);
      
      // Include only attachments that need conversion (exclude PDFs and unsupported)
      if (classification.action === 'convert_to_pdf') {
        convertInputs.push({
          kind: 'file',
          filename: attachment.filename,
          mime: attachment.contentType,
          buffer: Buffer.from(attachment.content, 'base64')
        });
      }
    }

    return convertInputs;
  }

  /**
   * TICKET 4: Prepare sanitized HTML for email body conversion
   */
  private async prepareEmailBodyHtml(input: UnifiedConversionInput): Promise<string | null> {
    const { emailContent, emailMetadata } = input;
    
    // Use stripped-html first, then body-html, then convert plain text
    let htmlContent = emailContent.strippedHtml || emailContent.bodyHtml;
    
    if (!htmlContent && emailContent.bodyPlain) {
      // Convert plain text to HTML
      htmlContent = this.wrapTextInHtml(emailContent.bodyPlain, emailMetadata.subject, emailMetadata.from);
    }
    
    if (!htmlContent) {
      return null;
    }

    // Sanitize HTML content
    const sanitizedHtml = purify.sanitize(htmlContent, {
      ALLOWED_TAGS: [
        'p', 'br', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 'sub', 'sup',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'td', 'th',
        'a', 'img'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'style', 'class', 'id',
        'width', 'height', 'colspan', 'rowspan'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
    });

    // Add email metadata header
    const provenanceHeader = this.createProvenanceHeader(emailMetadata);
    return provenanceHeader + sanitizedHtml;
  }

  /**
   * TICKET 4: Convert plain text to HTML format
   */
  private wrapTextInHtml(text: string, subject?: string, from?: string): string {
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${subject || 'Email'}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    .email-content { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="email-content">${escapedText}</div>
</body>
</html>`;
  }

  /**
   * TICKET 4: Create email provenance header for PDF
   */
  private createProvenanceHeader(metadata: EmailMetadata): string {
    return `
    <div style="border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 12px; color: #333;">
      <h3 style="margin: 0 0 10px 0; color: #007bff;">Email Document</h3>
      ${metadata.subject ? `<div><strong>Subject:</strong> ${metadata.subject}</div>` : ''}
      <div><strong>From:</strong> ${metadata.from}</div>
      <div><strong>To:</strong> ${metadata.to.join(', ')}</div>
      <div><strong>Received:</strong> ${new Date(metadata.receivedAt).toLocaleString()}</div>
      ${metadata.messageId ? `<div><strong>Message-ID:</strong> ${metadata.messageId}</div>` : ''}
    </div>
  `;
  }

  /**
   * TICKET 4: Generate email title in consistent format
   */
  private generateEmailTitle(metadata: EmailMetadata): string {
    const fromShort = this.extractFromShort(metadata.from);
    const subjectForTitle = metadata.subject?.trim() || 'No Subject';
    const isoDate = new Date(metadata.receivedAt).toISOString().slice(0, 10);
    return this.truncateTitle(`Email – ${fromShort} – ${subjectForTitle} – ${isoDate}`, 70);
  }

  /**
   * TICKET 4: Extract short form of sender name
   */
  private extractFromShort(from: string): string {
    const match = from.match(/^([^<@\s]+)(?:\s+[^<]*)?(?:\s*<[^>]+>)?/) || from.match(/([^@\s]+)@/);
    return match ? match[1] : from.substring(0, 20);
  }

  /**
   * TICKET 4: Truncate title to specified length
   */
  private truncateTitle(title: string, maxLength: number): string {
    return title.length <= maxLength ? title : title.substring(0, maxLength - 3) + '...';
  }

  /**
   * TICKET 4: Process CloudConvert results and create documents
   */
  private async processCloudConvertResults(
    cloudConvertResult: ConvertResult,
    input: UnifiedConversionInput,
    convertInputs: ConvertInput[]
  ): Promise<Omit<ConversionResult, 'cloudConvertJobId' | 'conversionEngine'>> {
    const result: Omit<ConversionResult, 'cloudConvertJobId' | 'conversionEngine'> = {
      attachmentResults: []
    };

    try {
      for (const file of cloudConvertResult.files) {
        const correspondingInput = convertInputs.find(input => 
          input.filename === file.filename || 
          (input.kind === 'html' && file.filename.includes('body'))
        );

        if (!correspondingInput) {
          console.warn(`⚠️ No corresponding input found for CloudConvert result: ${file.filename}`);
          continue;
        }

        if (correspondingInput.kind === 'html') {
          // This is the email body PDF
          const document = await this.createEmailBodyDocument(
            file,
            input,
            cloudConvertResult.jobId
          );
          
          result.emailBodyPdf = {
            documentId: document.id,
            filename: document.fileName,
            created: true
          };
          
          console.log(`📧 Email body PDF created: Document ID ${document.id}`);

        } else if (correspondingInput.kind === 'file') {
          // This is a converted attachment
          const originalAttachment = input.attachments.find(att => att.filename === correspondingInput.filename);
          
          if (originalAttachment) {
            // Store original attachment first
            const originalDoc = await this.storeOriginalAttachment(originalAttachment, input);
            
            // Store converted PDF with reference to original
            const convertedDoc = await this.createConvertedAttachmentDocument(
              file,
              input,
              originalDoc.id,
              originalAttachment,
              cloudConvertResult.jobId
            );

            result.attachmentResults.push({
              success: true,
              filename: originalAttachment.filename,
              documentId: convertedDoc.id,
              converted: true,
              classification: 'converted_via_cloudconvert'
            });

            console.log(`📎 Converted attachment: ${originalAttachment.filename} → Document ID ${convertedDoc.id}`);
          }
        }
      }

      // Handle PDF attachments that weren't converted (store as-is)
      const { attachmentClassificationService } = await import('./attachmentClassificationService.js');
      
      for (const attachment of input.attachments) {
        const classification = attachmentClassificationService.classifyAttachment(attachment);
        
        if (classification.action === 'store_only' && classification.type === 'pdf') {
          const pdfDoc = await this.storeOriginalAttachment(attachment, input);
          
          result.attachmentResults.push({
            success: true,
            filename: attachment.filename,
            documentId: pdfDoc.id,
            converted: false,
            classification: 'pdf_stored_original'
          });

          console.log(`📄 PDF stored as-is: ${attachment.filename} → Document ID ${pdfDoc.id}`);
        }
      }

      return result;

    } catch (error) {
      console.error('❌ Error processing CloudConvert results:', error);
      throw error;
    }
  }

  /**
   * TICKET 4: Create document for email body PDF
   */
  private async createEmailBodyDocument(
    file: { filename: string; pdfBuffer: Buffer; meta: Record<string, any> },
    input: UnifiedConversionInput,
    jobId: string
  ) {
    const fileName = this.generateEmailTitle(input.emailMetadata) + '.pdf';
    
    // Use storage service for file upload (like existing email body PDF service)
    const tempFilePath = `/tmp/${Date.now()}-${fileName}`;
    require('fs').writeFileSync(tempFilePath, file.pdfBuffer);
    
    // Create document record first, then upload will happen via normal document flow
    const documentData = {
      fileName,
      mimeType: 'application/pdf',
      filePath: tempFilePath, // Will be updated to GCS URL by storage service
      fileSize: file.pdfBuffer.length,
      userId: parseInt(input.tenantId),
      categoryId: input.categoryId || null,
      tags: [...(input.tags || []), 'email', 'email-body'],
      source: 'email',
      conversionStatus: 'completed' as const,
      conversionJobId: jobId,
      conversionMetadata: {
        engine: 'cloudconvert',
        originalFormat: 'html',
        convertedAt: new Date().toISOString(),
        jobMeta: file.meta
      },
      emailContext: {
        from: input.emailMetadata.from,
        subject: input.emailMetadata.subject,
        messageId: input.emailMetadata.messageId,
        timestamp: input.emailMetadata.receivedAt
      }
    };

    const validatedData = insertDocumentSchema.parse(documentData);
    return await storage.createDocument(validatedData);
  }

  /**
   * TICKET 4: Store original attachment without conversion
   */
  private async storeOriginalAttachment(
    attachment: AttachmentData,
    input: UnifiedConversionInput
  ) {
    // Write to temp file for storage service to handle
    const tempFilePath = `/tmp/${Date.now()}-${attachment.filename}`;
    const buffer = Buffer.from(attachment.content, 'base64');
    require('fs').writeFileSync(tempFilePath, buffer);

    // Create document record
    const documentData = {
      fileName: attachment.filename,
      mimeType: attachment.contentType,
      filePath: tempFilePath, // Will be updated to GCS URL by storage service
      fileSize: attachment.size,
      userId: parseInt(input.tenantId),
      categoryId: input.categoryId || null,
      tags: [...(input.tags || []), 'email', 'attachment'],
      source: 'email',
      conversionStatus: 'not_applicable' as const,
      emailContext: {
        from: input.emailMetadata.from,
        subject: input.emailMetadata.subject,
        messageId: input.emailMetadata.messageId,
        timestamp: input.emailMetadata.receivedAt
      }
    };

    const validatedData = insertDocumentSchema.parse(documentData);
    return await storage.createDocument(validatedData);
  }

  /**
   * TICKET 4: Create document for converted attachment PDF
   */
  private async createConvertedAttachmentDocument(
    file: { filename: string; pdfBuffer: Buffer; meta: Record<string, any> },
    input: UnifiedConversionInput,
    sourceDocumentId: number,
    originalAttachment: AttachmentData,
    jobId: string
  ) {
    const fileName = `${originalAttachment.filename.replace(/\.[^.]+$/, '')}_converted.pdf`;
    
    // Write to temp file for storage service to handle
    const tempFilePath = `/tmp/${Date.now()}-${fileName}`;
    require('fs').writeFileSync(tempFilePath, file.pdfBuffer);

    // Create document record
    const documentData = {
      fileName,
      mimeType: 'application/pdf',
      filePath: tempFilePath, // Will be updated to GCS URL by storage service
      fileSize: file.pdfBuffer.length,
      userId: parseInt(input.tenantId),
      categoryId: input.categoryId || null,
      tags: [...(input.tags || []), 'email', 'attachment', 'converted'],
      source: 'email',
      conversionStatus: 'completed' as const,
      sourceDocumentId,
      originalMimeType: originalAttachment.contentType,
      conversionJobId: jobId,
      conversionMetadata: {
        engine: 'cloudconvert',
        originalFormat: originalAttachment.contentType,
        convertedAt: new Date().toISOString(),
        jobMeta: file.meta
      },
      emailContext: {
        from: input.emailMetadata.from,
        subject: input.emailMetadata.subject,
        messageId: input.emailMetadata.messageId,
        timestamp: input.emailMetadata.receivedAt
      }
    };

    const validatedData = insertDocumentSchema.parse(documentData);
    return await storage.createDocument(validatedData);
  }
}

// Export singleton instance
export const unifiedEmailConversionService = new UnifiedEmailConversionService();