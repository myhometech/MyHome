/**
 * TICKET 4: Unified Email Conversion Service
 * 
 * This service handles both email body and attachment conversion through a unified pipeline
 * using CloudConvert exclusively for email conversion processing.
 */

import { CloudConvertService, ConvertInput, ConvertResult, CloudConvertError, ConversionReason } from './cloudConvertService.js';
import { metricsService, measureConversion, type ConversionEngine, type ConversionType, type EmailConversionSummary } from './metricsService.js';
// Legacy Puppeteer imports removed - now CloudConvert only
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { createHash } from 'crypto';
import { storage } from './storage.js';
import { insertDocumentSchema } from '../shared/schema.js';
import { decideEngines, type EngineDecisionContext } from './emailEngineDecision.js';

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
  userId?: string;
  userTier?: 'free' | 'premium';
  categoryId?: number | null;
  tags?: string[];
}

// TICKET 6: Enhanced conversion result with user-visible states
export interface ConversionResult {
  emailBodyPdf?: {
    documentId: number;
    filename: string;
    created: boolean;
    conversionStatus?: ConversionReason;
  };
  attachmentResults: Array<{
    success: boolean;
    filename: string;
    documentId?: number;
    converted?: boolean;
    classification?: string;
    error?: string;
    conversionStatus?: ConversionReason;
    userVisibleStatus?: string; // TICKET 6: User-friendly status message
  }>;
  cloudConvertJobId?: string;
  conversionEngine: 'cloudconvert';
  decisionReasons?: string[];
}

export class UnifiedEmailConversionService {
  private cloudConvertService?: CloudConvertService;

  constructor() {
    // CloudConvert service will be initialized lazily when needed
    // This avoids timing issues with healthcheck coordination
  }

  /**
   * CRITICAL FIX: Lazy initialization of CloudConvert service
   * This ensures we use the healthy global instance that was validated by startup healthcheck
   */
  private async getCloudConvertService(): Promise<CloudConvertService | undefined> {
    if (!process.env.CLOUDCONVERT_API_KEY) {
      return undefined;
    }

    if (this.cloudConvertService) {
      return this.cloudConvertService;
    }

    try {
      // Try to use the healthy global instance first
      const { getGlobalCloudConvertService } = await import('./cloudConvertService.js');
      const globalService = getGlobalCloudConvertService();
      
      if (globalService) {
        this.cloudConvertService = globalService;
        console.log('✅ CloudConvert service ready for email conversions (using healthy global instance)');
        return this.cloudConvertService;
      }

      // Fallback: Create new instance and mark as healthy if healthcheck passed
      console.warn('⚠️ Global CloudConvertService not found - creating new instance');
      this.cloudConvertService = new CloudConvertService();
      
      // If we're here and no CC_DISABLED flag exists, healthcheck likely passed
      if (!(globalThis as any).__CC_DISABLED__) {
        this.cloudConvertService.setHealthy(true);
        console.log('✅ New CloudConvert instance marked healthy (healthcheck passed)');
      } else {
        console.warn('⚠️ CloudConvert disabled by healthcheck - service will reject conversions');
      }
      
      return this.cloudConvertService;
      
    } catch (error) {
      console.error('❌ Failed to initialize CloudConvert service:', error);
      return undefined;
    }
  }

  /**
   * TICKET 4: Main conversion method with feature flag support
   * TICKET 7: Enhanced with metrics tracking and email-level summaries
   * Enhanced with engine decision service for proper flag precedence
   */
  async convertEmail(input: UnifiedConversionInput): Promise<ConversionResult> {
    const startTime = Date.now();
    
    // Enhanced engine decision with proper precedence: ENV > DB flags > defaults
    const engineContext: EngineDecisionContext = {
      userId: input.userId,
      userTier: input.userTier || 'free'
    };
    
    const { body: bodyEngine, convertAttachments, reason } = await decideEngines(engineContext);
    
    console.log(`🔄 Starting email conversion - Body: ${bodyEngine}, Attachments: ${convertAttachments}, Reasons: ${reason.join(', ')}`);
    
    try {
      let result: ConversionResult;
      
      if (bodyEngine === 'cloudconvert') {
        result = await this.convertWithCloudConvert(input, convertAttachments);
      } else {
        throw new Error('CloudConvert API key required for email conversion');
      }
      
      // Add decision reasons to result
      result.decisionReasons = reason;
      
      // TICKET 7: Record email-level conversion summary
      await this.recordEmailConversionSummary(input, result, Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      // Record failed email conversion
      await this.recordEmailConversionSummary(input, null, Date.now() - startTime, error);
      throw error;
    }
  }

  /**
   * TICKET 4: Check if CloudConvert should be used based on feature flag
   */
  private shouldUseCloudConvert(): boolean {
    const pdfEngine = process.env.PDF_CONVERTER_ENGINE?.toLowerCase();
    const hasApiKey = !!process.env.CLOUDCONVERT_API_KEY;
    
    if (pdfEngine === 'cloudconvert' && !hasApiKey) {
      console.error('❌ PDF_CONVERTER_ENGINE=cloudconvert but no CLOUDCONVERT_API_KEY found - email conversion failed');
      return false;
    }
    
    return pdfEngine === 'cloudconvert' && hasApiKey;
  }

  /**
   * TICKET 4: Convert email using CloudConvert (new pathway)
   * Enhanced to support selective attachment conversion
   */
  private async convertWithCloudConvert(input: UnifiedConversionInput, convertAttachments: boolean = true): Promise<ConversionResult> {
    const cloudConvertService = await this.getCloudConvertService();
    if (!cloudConvertService) {
      throw new Error('CloudConvert service not available');
    }

    try {
      // Build ConvertInput array with selective attachment conversion
      const convertInputs = await this.buildConvertInputArray(input, convertAttachments);
      
      console.log(`📊 Built CloudConvert input array: ${convertInputs.length} items`);
      console.log(`   - Email body: ${convertInputs.filter(i => i.kind === 'html').length}`);
      console.log(`   - Attachments: ${convertInputs.filter(i => i.kind === 'file').length}`);

      // Convert all inputs through CloudConvert
      const cloudConvertResult = await cloudConvertService.convertToPdf(convertInputs);
      
      console.log(`✅ CloudConvert job ${cloudConvertResult.jobId} completed with ${cloudConvertResult.files.length} PDFs`);

      // TICKET 6: Process results with enhanced error handling
      const result = await this.processCloudConvertResultsWithErrorHandling(
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
      // TICKET 6: Enhanced error handling - don't block original storage
      console.error('❌ CloudConvert conversion failed:', error);
      
      if (error instanceof CloudConvertError) {
        await this.logCloudConvertError(error, input);
        
        // For configuration errors, fail fast
        if (error.conversionReason === 'error' && error.code === 'CONFIGURATION_ERROR') {
          console.error('❌ CloudConvert configuration error - email conversion failed');
          throw new Error('CloudConvert configuration error: check API key and credentials');
        }
        
        // For other errors, try to process attachments as originals only
        const result = await this.processAttachmentsAsOriginalsOnly(input);
        result.conversionEngine = 'cloudconvert'; // Still mark as intended engine
        
        return result;
      }
      
      // For non-CloudConvert errors, fail the conversion
      console.error('❌ CloudConvert service unavailable - email conversion failed');
      throw error;
    }
  }

  /**
   * Legacy Puppeteer conversion method - now deprecated and removed
   */
  private async convertWithPuppeteer(input: UnifiedConversionInput, convertAttachments: boolean = false): Promise<ConversionResult> {
    console.error('❌ Puppeteer conversion method called but no longer supported');
    throw new Error('Puppeteer email conversion has been removed - use CloudConvert only');
  }

  /**
   * TICKET 4: Build ConvertInput array for CloudConvert
   * - One 'html' input for email body
   * - 'file' inputs for non-PDF attachments (Office/Images)
   * - Exclude PDFs (they are stored as-is)
   */
  private async buildConvertInputArray(input: UnifiedConversionInput, convertAttachments: boolean = true): Promise<ConvertInput[]> {
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
      
      // Include attachments based on conversion flag and classification
      if (convertAttachments && classification.action === 'convert_to_pdf') {
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
   * Fixed to use Buffer-based storage without filesystem dependencies
   */
  private async createEmailBodyDocument(
    file: { filename: string; pdfBuffer: Buffer; meta: Record<string, any> },
    input: UnifiedConversionInput,
    jobId: string
  ) {
    const fileName = this.generateEmailTitle(input.emailMetadata) + '.pdf';
    
    // Use storage service createEmailBodyDocument which handles Buffer-based GCS storage
    const emailData = {
      filename: fileName,
      subject: input.emailMetadata.subject,
      messageId: input.emailMetadata.messageId,
      receivedAt: input.emailMetadata.receivedAt,
      from: input.emailMetadata.from,
      tags: [...(input.tags || []), 'email', 'email-body'],
      categoryId: input.categoryId,
      // Enhanced provenance for CloudConvert
      conversionJobId: jobId,
      conversionMetadata: {
        engine: 'cloudconvert',
        originalFormat: 'html',
        convertedAt: new Date().toISOString(),
        jobMeta: file.meta
      },
      conversionEngine: 'cloudconvert' as const,
      conversionReason: 'ok' as const,
      conversionInputSha256: this.calculateSha256(input.emailContent.strippedHtml || '')
    };

    // Use existing storage method that handles Buffer → GCS upload directly
    return await storage.createEmailBodyDocument(input.userId!, emailData, file.pdfBuffer);
  }

  /**
   * TICKET 4: Store original attachment without conversion
   * Fixed to use Buffer-based storage without filesystem dependencies
   */
  private async storeOriginalAttachment(
    attachment: AttachmentData,
    input: UnifiedConversionInput
  ) {
    const buffer = Buffer.from(attachment.content, 'base64');
    
    // Use direct GCS storage via Buffer without temp files
    const { GCSStorage } = await import('./storage/GCSStorage.js');
    const storageConfig = this.getGCSStorageConfig();
    const storageProvider = new GCSStorage(storageConfig);
    
    // Generate object key for attachment
    const timestamp = new Date().toISOString().replace(/[:.]/g, '');
    const { nanoid } = await import('nanoid');
    const shortHash = nanoid(8);
    const objectKey = `emails/${input.userId}/attachments/${timestamp}-${shortHash}-${attachment.filename}`;
    
    console.log(`📎→☁️  Uploading attachment ${objectKey} (${Math.round(buffer.length / 1024)}KB)...`);
    
    // Upload directly to GCS with metadata (correct parameter order: buffer, key, mimeType, options)
    const uploadResult = await (storageProvider as any).uploadWithMetadata(
      buffer,
      objectKey,
      attachment.contentType,
      {
        metadata: {
          originalFilename: attachment.filename,
          source: 'email_attachment',
          emailFrom: input.emailMetadata.from,
          emailSubject: input.emailMetadata.subject,
          messageId: input.emailMetadata.messageId,
          receivedAt: input.emailMetadata.receivedAt
        }
      }
    );

    // Create document record with GCS path (uploadResult is the GCS key)
    const documentData = {
      name: attachment.filename, // Display name (required field)
      fileName: attachment.filename, // File name (also required)
      mimeType: attachment.contentType,
      filePath: uploadResult, // The GCS key returned by uploadWithMetadata
      gcsPath: uploadResult,
      fileSize: attachment.size,
      userId: input.userId,
      categoryId: input.categoryId || null,
      tags: [...(input.tags || []), 'email', 'attachment'],
      source: 'email' as const,
      conversionStatus: 'not_applicable' as const,
      // TICKET 5: Enhanced provenance tracking
      conversionEngine: null,
      conversionReason: null,
      emailContext: {
        from: input.emailMetadata.from,
        subject: input.emailMetadata.subject,
        messageId: input.emailMetadata.messageId,
        receivedAt: input.emailMetadata.receivedAt
      }
    };

    console.log('DEBUG: Original attachment document data before validation:', JSON.stringify(documentData, null, 2));
    const validatedData = insertDocumentSchema.parse(documentData);
    console.log('DEBUG: Validated attachment document data:', JSON.stringify(validatedData, null, 2));
    return await storage.createDocument(validatedData);
  }

  /**
   * TICKET 4: Create document for converted attachment PDF
   * Fixed to use Buffer-based storage without filesystem dependencies
   */
  private async createConvertedAttachmentDocument(
    file: { filename: string; pdfBuffer: Buffer; meta: Record<string, any> },
    input: UnifiedConversionInput,
    sourceDocumentId: number,
    originalAttachment: AttachmentData,
    jobId: string
  ) {
    const fileName = `${originalAttachment.filename.replace(/\.[^.]+$/, '')}_converted.pdf`;
    
    // Use direct GCS storage via Buffer without temp files
    const { GCSStorage } = await import('./storage/GCSStorage.js');
    const storageConfig = this.getGCSStorageConfig();
    const storageProvider = new GCSStorage(storageConfig);
    
    // Generate object key for converted attachment
    const timestamp = new Date().toISOString().replace(/[:.]/g, '');
    const { nanoid } = await import('nanoid');
    const shortHash = nanoid(8);
    const objectKey = `emails/${input.userId}/converted/${timestamp}-${shortHash}-${fileName}`;
    
    console.log(`📎→📄→☁️  Uploading converted attachment ${objectKey} (${Math.round(file.pdfBuffer.length / 1024)}KB)...`);
    
    // Upload directly to GCS with metadata (correct parameter order: buffer, key, mimeType, options)
    const uploadResult = await (storageProvider as any).uploadWithMetadata(
      file.pdfBuffer,
      objectKey,
      'application/pdf',
      {
        metadata: {
          originalFilename: originalAttachment.filename,
          convertedFilename: fileName,
          source: 'email_attachment_converted',
          conversionEngine: 'cloudconvert',
          conversionJobId: jobId,
          emailFrom: input.emailMetadata.from,
          emailSubject: input.emailMetadata.subject,
          messageId: input.emailMetadata.messageId,
          receivedAt: input.emailMetadata.receivedAt,
          sourceDocumentId: sourceDocumentId.toString()
        }
      }
    );

    // Create document record with GCS path (uploadResult is the GCS key)
    const documentData = {
      name: fileName, // Display name (required field)
      fileName, // File name (also required)
      mimeType: 'application/pdf',
      filePath: uploadResult, // The GCS key returned by uploadWithMetadata
      gcsPath: uploadResult,
      fileSize: file.pdfBuffer.length,
      userId: input.userId,
      categoryId: input.categoryId?.toString() || null,
      tags: [...(input.tags || []), 'email', 'attachment', 'converted'],
      source: 'email' as const,
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
      // TICKET 5: Enhanced provenance tracking
      conversionEngine: 'cloudconvert' as const,
      conversionReason: 'ok' as const,
      conversionInputSha256: this.calculateSha256(Buffer.from(originalAttachment.content, 'base64')),
      derivedFromDocumentId: sourceDocumentId,
      emailContext: {
        from: input.emailMetadata.from,
        subject: input.emailMetadata.subject,
        messageId: input.emailMetadata.messageId,
        receivedAt: input.emailMetadata.receivedAt
      }
    };

    const validatedData = insertDocumentSchema.parse(documentData);
    return await storage.createDocument(validatedData);
  }

  /**
   * TICKET 5: Calculate SHA-256 hash for content tracking
   */
  private calculateSha256(content: string | Buffer): string {
    // Use imported crypto module with ES6 syntax
    const hash = createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * Get GCS storage configuration for email attachments
   * Uses Mailgun-specific credentials or falls back to default GCS config
   */
  private getGCSStorageConfig() {
    const storageConfig = {
      bucketName: process.env.MAILGUN_GCS_BUCKET || 'myhometech-storage',
      projectId: undefined as string | undefined,
      credentials: undefined as any,
      keyFilename: undefined as string | undefined
    };

    // Parse Mailgun-specific credentials first
    if (process.env.MAILGUN_GCS_CREDENTIALS_JSON) {
      try {
        const credentials = JSON.parse(process.env.MAILGUN_GCS_CREDENTIALS_JSON);
        storageConfig.credentials = credentials;
        storageConfig.projectId = credentials.project_id;
        console.log('✅ Using Mailgun-specific GCS credentials for attachments');
        return storageConfig;
      } catch (error) {
        console.error('❌ Failed to parse MAILGUN_GCS_CREDENTIALS_JSON:', error);
      }
    }

    // Fallback to default GCS configuration
    console.log('⚠️ MAILGUN_GCS_CREDENTIALS_JSON not found, falling back to default GCS config');
    storageConfig.projectId = process.env.GCS_PROJECT_ID;
    if (process.env.GCS_KEY_FILENAME) {
      storageConfig.keyFilename = process.env.GCS_KEY_FILENAME;
    }
    
    return storageConfig;
  }

  // TICKET 6: Enhanced error handling and user-visible states
  
  /**
   * TICKET 6: Log CloudConvert errors to Sentry with context
   */
  private async logCloudConvertError(error: CloudConvertError, input: UnifiedConversionInput): Promise<void> {
    try {
      const Sentry = await import('@sentry/node');
      
      Sentry.withScope(scope => {
        scope.setTag('service', 'unified_email_conversion');
        scope.setTag('error_type', 'cloudconvert_failure');
        scope.setTag('conversion_reason', error.conversionReason || 'unknown');
        scope.setLevel('error');
        
        scope.setContext('email_conversion', {
          tenantId: input.tenantId,
          from: input.emailMetadata.from,
          subject: input.emailMetadata.subject,
          attachmentCount: input.attachments.length,
          jobId: error.jobId,
          httpStatus: error.httpStatus,
          errorCode: error.code,
          isRetryable: error.isRetryable
        });
        
        scope.setContext('cloudconvert_error', {
          code: error.code,
          message: error.message,
          jobId: error.jobId,
          taskId: error.taskId,
          httpStatus: error.httpStatus,
          conversionReason: error.conversionReason,
          isRetryable: error.isRetryable
        });
        
        Sentry.captureException(error);
      });
      
      console.error(`🚨 CloudConvert error logged to Sentry: ${error.code} (${error.conversionReason})`);
      
    } catch (sentryError) {
      console.error('Failed to log CloudConvert error to Sentry:', sentryError);
    }
  }

  /**
   * TICKET 6: Process attachments as originals only when conversion fails
   */
  private async processAttachmentsAsOriginalsOnly(input: UnifiedConversionInput): Promise<ConversionResult> {
    const result: ConversionResult = {
      attachmentResults: [],
      conversionEngine: 'cloudconvert'
    };

    console.log(`📁 Processing ${input.attachments.length} attachments as originals only (conversion failed)`);

    for (const attachment of input.attachments) {
      try {
        const originalDoc = await this.storeOriginalAttachment(attachment, input);
        
        result.attachmentResults.push({
          success: true,
          filename: attachment.filename,
          documentId: originalDoc.id,
          converted: false,
          classification: 'stored_original_conversion_failed',
          conversionStatus: 'error',
          userVisibleStatus: this.getFailureUserVisibleStatus('error', attachment)
        });

        console.log(`✅ Stored original: ${attachment.filename} → Document ID ${originalDoc.id}`);

      } catch (error) {
        result.attachmentResults.push({
          success: false,
          filename: attachment.filename,
          converted: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          conversionStatus: 'error',
          userVisibleStatus: 'Processing failed'
        });

        console.error(`❌ Failed to store original: ${attachment.filename}`, error);
      }
    }

    return result;
  }

  /**
   * TICKET 6: Map conversion reasons to user-visible status messages
   */
  private getFailureUserVisibleStatus(reason: ConversionReason, attachment?: AttachmentData): string {
    switch (reason) {
      case 'skipped_too_large':
        return 'Conversion skipped (too large)';
      case 'skipped_password_protected':
        return 'Conversion skipped (password required)';
      case 'skipped_unsupported':
        return 'Conversion skipped (unsupported)';
      case 'error':
        return 'Conversion failed (temporary)';
      default:
        return 'Conversion status unknown';
    }
  }

  /**
   * TICKET 6: Enhanced CloudConvert result processing with error states
   */
  private async processCloudConvertResultsWithErrorHandling(
    cloudConvertResult: ConvertResult,
    input: UnifiedConversionInput,
    convertInputs: ConvertInput[]
  ): Promise<Omit<ConversionResult, 'cloudConvertJobId' | 'conversionEngine'>> {
    try {
      return await this.processCloudConvertResults(cloudConvertResult, input, convertInputs);
    } catch (error) {
      console.error('❌ Error processing CloudConvert results, falling back to originals:', error);
      
      // Log the processing error
      if (error instanceof CloudConvertError) {
        await this.logCloudConvertError(error, input);
      }
      
      // Process all attachments as originals
      const fallbackResult = await this.processAttachmentsAsOriginalsOnly(input);
      return {
        emailBodyPdf: fallbackResult.emailBodyPdf,
        attachmentResults: fallbackResult.attachmentResults
      };
    }
  }

  /**
   * TICKET 7: Record comprehensive email conversion summary for observability
   */
  private async recordEmailConversionSummary(
    input: UnifiedConversionInput,
    result: ConversionResult | null,
    totalDurationMs: number,
    error?: any
  ): Promise<void> {
    try {
      const emailId = input.emailMetadata.messageId || `email-${Date.now()}`;
      const attachmentCount = input.attachments.length;
      
      let summary: EmailConversionSummary;
      
      if (result && !error) {
        // Successful conversion
        const pdfsProduced = (result.emailBodyPdf ? 1 : 0) + 
                           result.attachmentResults.filter(r => r.converted).length;
        const originalsStored = result.attachmentResults.filter(r => r.success && !r.converted).length;
        
        // Count skipped by reason
        const skippedCounts = {
          password_protected: result.attachmentResults.filter(r => 
            r.conversionStatus === 'skipped_password_protected').length,
          unsupported: result.attachmentResults.filter(r => 
            r.conversionStatus === 'skipped_unsupported').length,
          too_large: result.attachmentResults.filter(r => 
            r.conversionStatus === 'skipped_too_large').length,
          errors: result.attachmentResults.filter(r => 
            r.conversionStatus === 'error').length
        };
        
        summary = {
          emailId,
          from: input.emailMetadata.from,
          subject: input.emailMetadata.subject || 'No Subject',
          totalAttachments: attachmentCount,
          originalsStored: originalsStored + (result.emailBodyPdf ? 0 : 1), // Include email body if not converted
          pdfsProduced,
          conversionEngine: result.conversionEngine,
          skippedCounts,
          totalDurationMs,
          averageDurationMs: attachmentCount > 0 ? totalDurationMs / attachmentCount : totalDurationMs
        };
        
      } else {
        // Failed conversion
        summary = {
          emailId,
          from: input.emailMetadata.from,
          subject: input.emailMetadata.subject || 'No Subject',
          totalAttachments: attachmentCount,
          originalsStored: 0,
          pdfsProduced: 0,
          conversionEngine: this.shouldUseCloudConvert() ? 'cloudconvert' : 'puppeteer',
          skippedCounts: {
            password_protected: 0,
            unsupported: 0,
            too_large: 0,
            errors: attachmentCount // All attachments failed
          },
          totalDurationMs,
          averageDurationMs: totalDurationMs
        };
      }
      
      metricsService.recordEmailSummary(summary);
      
    } catch (summaryError) {
      console.error('❌ Failed to record email conversion summary:', summaryError);
    }
  }
}

// Export singleton instance
export const unifiedEmailConversionService = new UnifiedEmailConversionService();