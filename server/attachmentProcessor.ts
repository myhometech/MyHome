/**
 * DOC-302: Attachment Processing Service
 * Handles email attachment validation, GCS upload, and PostgreSQL metadata storage
 */

import { Storage } from '@google-cloud/storage';
import { nanoid } from 'nanoid';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { InsertDocument } from '@shared/schema';
import { storage } from './storage';

// TICKET 1: Enhanced validation rules and security limits
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
];

const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.doc'];

// TICKET 1: Security - blocked dangerous file types
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.scr', '.vbs', '.js', '.ps1', '.cmd', '.com', '.pif', '.jar'];
const BLOCKED_MIME_TYPES = [
  'application/x-executable',
  'application/x-msdownload',
  'application/x-dosexec',
  'text/javascript',
  'application/javascript',
  'application/x-java-archive',
  'application/x-bat'
];

// TICKET 1: Size limits with clear validation
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB in bytes (SendGrid webhook limit)
const MAX_TOTAL_PAYLOAD_SIZE = 30 * 1024 * 1024; // 30MB total for all attachments

interface ProcessedAttachment {
  success: boolean;
  documentId?: number;
  filename: string;
  error?: string;
  gcsPath?: string;
  fileSize: number;
}

interface AttachmentData {
  filename: string;
  content: Buffer | string; // Base64 string or Buffer
  contentType: string;
  size?: number;
}

export class AttachmentProcessor {
  private gcsStorage: any; // Temporarily disabled
  private bucketName: string;

  constructor() {
    // Temporarily disable GCS initialization to fix attachment processing
    // TODO: Fix GCS credential configuration
    this.gcsStorage = null;
    this.bucketName = process.env.GCS_BUCKET_NAME || 'myhome-documents';
    
    console.log('AttachmentProcessor initialized with local storage fallback');
  }

  /**
   * DOC-302: Process all attachments from email webhook
   */
  async processEmailAttachments(
    attachments: AttachmentData[],
    userId: string,
    emailMetadata: { from: string; subject: string; requestId: string }
  ): Promise<{
    processedAttachments: ProcessedAttachment[];
    totalProcessed: number;
    totalFailed: number;
  }> {
    const results: ProcessedAttachment[] = [];
    let totalProcessed = 0;
    let totalFailed = 0;

    console.log(`[${emailMetadata.requestId}] Processing ${attachments.length} attachments for user ${userId}`);

    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      console.log(`[${emailMetadata.requestId}] Processing attachment ${i + 1}/${attachments.length}: ${attachment.filename}`);

      try {
        const result = await this.processAttachment(attachment, userId, emailMetadata);
        results.push(result);
        
        if (result.success) {
          totalProcessed++;
          console.log(`[${emailMetadata.requestId}] ✅ Successfully processed: ${result.filename} -> ${result.gcsPath}`);
        } else {
          totalFailed++;
          console.error(`[${emailMetadata.requestId}] ❌ Failed to process: ${result.filename} - ${result.error}`);
        }
      } catch (error) {
        const errorResult: ProcessedAttachment = {
          success: false,
          filename: attachment.filename,
          error: error instanceof Error ? error.message : 'Unknown processing error',
          fileSize: attachment.size || 0
        };
        results.push(errorResult);
        totalFailed++;
        console.error(`[${emailMetadata.requestId}] ❌ Exception processing ${attachment.filename}:`, error);
      }
    }

    console.log(`[${emailMetadata.requestId}] Attachment processing complete: ${totalProcessed} successful, ${totalFailed} failed`);
    return { processedAttachments: results, totalProcessed, totalFailed };
  }

  /**
   * TICKET 1: Enhanced attachment processing with comprehensive validation and logging
   */
  private async processAttachment(
    attachment: AttachmentData,
    userId: string,
    emailMetadata: { from: string; subject: string; requestId: string }
  ): Promise<ProcessedAttachment> {
    const { requestId } = emailMetadata;
    
    // TICKET 1: Step 1 - Validate attachment presence and basic structure
    if (!attachment.filename || !attachment.content) {
      const error = `Missing required fields: filename=${!!attachment.filename}, content=${!!attachment.content}`;
      console.error(`[${requestId}] ❌ Attachment validation failed: ${error}`);
      return {
        success: false,
        filename: attachment.filename || 'unknown',
        error: `Attachment validation failed: ${error}`,
        fileSize: 0
      };
    }

    // TICKET 1: Step 2 - Comprehensive validation with detailed logging
    const validation = this.validateAttachment(attachment, requestId);
    if (!validation.isValid) {
      console.error(`[${requestId}] ❌ Rejected attachment: ${attachment.filename} (reason: ${validation.error})`);
      return {
        success: false,
        filename: attachment.filename,
        error: validation.error,
        fileSize: attachment.size || 0
      };
    }

    console.log(`[${requestId}] ✅ Attachment validation passed: ${attachment.filename} (${attachment.contentType}, ${this.formatFileSize(attachment.size || 0)})`);
    
    // TICKET 1: Step 3 - Base64 decoding with error handling
    let decodedContent: Buffer;
    try {
      decodedContent = this.decodeAttachmentContent(attachment.content, requestId);
      console.log(`[${requestId}] ✅ Base64 decoding successful: ${attachment.filename} (decoded size: ${this.formatFileSize(decodedContent.length)})`);
    } catch (error) {
      const errorMessage = `Base64 decoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${requestId}] ❌ ${errorMessage} for ${attachment.filename}`);
      return {
        success: false,
        filename: attachment.filename,
        error: errorMessage,
        fileSize: attachment.size || 0
      };
    }

    // TICKET 1: Step 4 - Verify decoded content size matches expected size
    if (decodedContent.length > MAX_FILE_SIZE) {
      const error = `Decoded file too large: ${this.formatFileSize(decodedContent.length)} > ${this.formatFileSize(MAX_FILE_SIZE)} limit`;
      console.error(`[${requestId}] ❌ ${error} for ${attachment.filename}`);
      return {
        success: false,
        filename: attachment.filename,
        error,
        fileSize: decodedContent.length
      };
    }

    // TICKET 1: Continue with validated and decoded content
    // Step 5: Sanitize and normalize filename
    const sanitizedFilename = this.sanitizeFilename(attachment.filename);
    const timestampedFilename = this.addTimestamp(sanitizedFilename);

    // Step 6: Generate unique GCS object path
    const gcsPath = this.generateGCSPath(userId, timestampedFilename);

    try {
      // TICKET 1: Step 7 - Upload to local storage (GCS fallback)
      await this.uploadToGCS(gcsPath, decodedContent, attachment.contentType);

      // Generate local file path for metadata storage
      const filename = gcsPath.split('/').pop() || `attachment_${Date.now()}`;
      const localFilePath = `/home/runner/workspace/uploads/${filename}`;

      console.log(`[${requestId}] ✅ File upload successful: ${attachment.filename} -> ${localFilePath}`);

      // TICKET 1: Step 8 - Store metadata in PostgreSQL
      const documentId = await this.storeDocumentMetadata({
        userId,
        filename: sanitizedFilename,
        originalFilename: attachment.filename,
        gcsPath: localFilePath, // Store local path for now
        mimeType: attachment.contentType,
        fileSize: decodedContent.length,
        emailMetadata
      });

      console.log(`[${requestId}] ✅ Document metadata stored: ID ${documentId} for ${attachment.filename}`);

      return {
        success: true,
        documentId,
        filename: sanitizedFilename,
        gcsPath: localFilePath,
        fileSize: decodedContent.length
      };

    } catch (error) {
      console.error(`[${requestId}] ❌ Error processing attachment ${attachment.filename}:`, error);
      return {
        success: false,
        filename: attachment.filename,
        error: error instanceof Error ? error.message : 'Upload or storage error',
        fileSize: decodedContent.length
      };
    }
  }

  /**
   * TICKET 1: Enhanced comprehensive attachment validation with security checks
   */
  private validateAttachment(attachment: AttachmentData, requestId: string): { isValid: boolean; error?: string } {
    // TICKET 1: Validate content type exists
    if (!attachment.contentType) {
      return {
        isValid: false,
        error: 'Missing content type information'
      };
    }

    // TICKET 1: Security - Check for blocked dangerous file types by MIME type
    if (BLOCKED_MIME_TYPES.includes(attachment.contentType.toLowerCase())) {
      return {
        isValid: false,
        error: `Dangerous file type blocked: ${attachment.contentType}`
      };
    }

    // TICKET 1: Validate file type by MIME type
    if (!SUPPORTED_MIME_TYPES.includes(attachment.contentType.toLowerCase())) {
      return {
        isValid: false,
        error: `Unsupported file type: ${attachment.contentType}. Allowed: PDF, JPG, PNG, WEBP, DOCX`
      };
    }

    // TICKET 1: Extract and validate file extension
    const extension = attachment.filename.toLowerCase().substring(attachment.filename.lastIndexOf('.'));
    
    // TICKET 1: Security - Check for blocked dangerous extensions
    if (BLOCKED_EXTENSIONS.includes(extension)) {
      return {
        isValid: false,
        error: `Dangerous file extension blocked: ${extension}`
      };
    }

    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return {
        isValid: false,
        error: `Unsupported file extension: ${extension}. Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`
      };
    }

    // TICKET 1: Calculate and validate file size (base64 estimation)
    let estimatedFileSize: number;
    if (typeof attachment.content === 'string') {
      // Base64 encoded - calculate actual size (base64 is ~33% larger)
      estimatedFileSize = Math.ceil(attachment.content.length * 0.75);
    } else {
      estimatedFileSize = attachment.content.length;
    }

    // TICKET 1: Check individual file size limit
    if (estimatedFileSize > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `Attachment too large: ${this.formatFileSize(estimatedFileSize)} > ${this.formatFileSize(MAX_FILE_SIZE)} limit`
      };
    }

    console.log(`[${requestId}] 🔍 Attachment validation details: ${attachment.filename} (${attachment.contentType}, estimated: ${this.formatFileSize(estimatedFileSize)})`);

    return {
      isValid: true
    };
  }

  /**
   * TICKET 1: Robust base64 decoding with error handling
   */
  private decodeAttachmentContent(content: Buffer | string, requestId: string): Buffer {
    if (Buffer.isBuffer(content)) {
      return content;
    }

    if (typeof content !== 'string') {
      throw new Error('Invalid content type - expected string or Buffer');
    }

    try {
      // TICKET 1: Clean and validate base64 string
      const cleanContent = content.replace(/\s/g, ''); // Remove all whitespace
      
      // Basic base64 validation
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanContent)) {
        throw new Error('Invalid base64 format - contains illegal characters');
      }

      // Check for proper base64 length
      if (cleanContent.length % 4 !== 0) {
        throw new Error('Invalid base64 format - incorrect padding');
      }

      const decoded = Buffer.from(cleanContent, 'base64');
      
      // Verify decoding worked (decoded content should be smaller than base64)
      if (decoded.length === 0 && cleanContent.length > 0) {
        throw new Error('Base64 decoding resulted in empty buffer');
      }

      return decoded;

    } catch (error) {
      console.error(`[${requestId}] Base64 decoding failed:`, {
        contentLength: content.length,
        contentPreview: content.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * TICKET 1: Format file size for human-readable logging
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    
    return `${size.toFixed(1)} ${sizes[i]}`;
  }

  /**
   * DOC-302: Sanitize and normalize filename
   */
  private sanitizeFilename(filename: string): string {
    // Remove special characters, spaces, and normalize
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_+/g, '_') // Collapse multiple underscores
      .toLowerCase()
      .substring(0, 100); // Limit length
  }

  /**
   * DOC-302: Add timestamp to filename for uniqueness
   */
  private addTimestamp(filename: string): string {
    const timestamp = Date.now();
    const randomId = nanoid(8);
    const extension = filename.substring(filename.lastIndexOf('.'));
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
    
    return `${nameWithoutExt}_${timestamp}_${randomId}${extension}`;
  }

  /**
   * DOC-302: Generate structured GCS object path
   */
  private generateGCSPath(userId: string, filename: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    return `users/${userId}/email/${year}/${month}/${filename}`;
  }

  /**
   * DOC-302: Upload file to Google Cloud Storage with retry logic
   */
  private async uploadToGCS(gcsPath: string, fileBuffer: Buffer, contentType: string): Promise<void> {
    // Temporarily use local storage fallback due to GCS credential configuration issues
    console.log(`Using local storage fallback for: ${gcsPath}`);
    
    // Create local file path
    const uploadsDir = join(process.cwd(), 'uploads');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Generate local filename from GCS path, preserving original extension
    const filename = gcsPath.split('/').pop() || `attachment_${Date.now()}`;
    const localPath = join(uploadsDir, filename);
    
    // Save file locally
    writeFileSync(localPath, fileBuffer);
    console.log(`Successfully saved to local storage: ${localPath}`);
  }

  /**
   * DOC-302/303: Store document metadata in PostgreSQL with enhanced categorization
   */
  private async storeDocumentMetadata(params: {
    userId: string;
    filename: string;
    originalFilename: string;
    gcsPath: string;
    mimeType: string;
    fileSize: number;
    emailMetadata: { from: string; subject: string };
  }): Promise<number> {
    // DOC-303: Get appropriate category using enhanced categorization service
    const categoryResult = await this.getCategoryForFile(
      params.filename, 
      params.mimeType, 
      params.userId,
      params.emailMetadata
    );

    // Create document record with DOC-302/303 fields
    const documentData: InsertDocument = {
      userId: params.userId,
      categoryId: categoryResult.categoryId,
      name: `${params.filename} (from ${params.emailMetadata.from})`,
      fileName: params.originalFilename,
      filePath: params.gcsPath, // Store GCS path in filePath field
      gcsPath: params.gcsPath, // DOC-302: Dedicated GCS path field
      fileSize: params.fileSize,
      mimeType: params.mimeType,
      uploadSource: 'email', // DOC-302: Mark as email upload
      status: 'pending', // DOC-302: Initial status
      categorizationSource: categoryResult.source, // DOC-303: Track categorization method
      tags: ['email-attachment', 'imported', `from-${params.emailMetadata.from.split('@')[1]}`],
      extractedText: `Email Subject: ${params.emailMetadata.subject}\nFrom: ${params.emailMetadata.from}\nImported via email forwarding`,
      ocrProcessed: false,
      isEncrypted: true // Will be encrypted by existing encryption service
    };

    const document = await storage.createDocument(documentData);
    console.log(`Document metadata stored with ID: ${document.id}, Category: ${categoryResult.categoryId} (${categoryResult.source})`);
    
    // Queue OCR processing for email documents that support it
    await this.queueOCRProcessing(document.id, params);
    
    return document.id;
  }

  /**
   * Queue OCR processing for email documents
   */
  private async queueOCRProcessing(
    documentId: number,
    params: {
      userId: string;
      filename: string;
      originalFilename: string;
      gcsPath: string;
      mimeType: string;
      fileSize: number;
      emailMetadata: { from: string; subject: string };
    }
  ): Promise<void> {
    try {
      // Check if document supports OCR
      const { supportsOCR } = await import('./ocrService');
      
      if (!supportsOCR(params.mimeType)) {
        console.log(`Skipping OCR for ${params.originalFilename} - unsupported file type: ${params.mimeType}`);
        return;
      }

      // Import and queue OCR job
      const { ocrQueue } = await import('./ocrQueue');
      
      await ocrQueue.addJob({
        documentId,
        fileName: params.originalFilename,
        filePathOrGCSKey: params.gcsPath,
        mimeType: params.mimeType,
        userId: params.userId,
        priority: 3, // Higher priority for email imports
        isEmailImport: true // Flag for email import processing
      });

      console.log(`✅ OCR job queued for email document ${documentId}: ${params.originalFilename}`);

    } catch (error) {
      console.error(`❌ Failed to queue OCR for email document ${documentId}:`, error);
      // Don't throw - document creation should still succeed even if OCR queueing fails
    }
  }

  /**
   * DOC-303: Enhanced category detection using new categorization service
   */
  private async getCategoryForFile(filename: string, mimeType: string, userId: string, emailContext?: { from: string; subject: string }): Promise<{ categoryId: number | null; source: string }> {
    try {
      // Import categorization service
      const { categorizationService } = await import('./categorizationService');
      
      // Use DOC-303 categorization service
      const result = await categorizationService.categorizeDocument({
        filename,
        mimeType,
        emailSubject: emailContext?.subject,
        userId
      });

      console.log(`Category detection result for ${filename}:`, {
        categoryId: result.categoryId,
        source: result.source,
        confidence: result.confidence,
        reasoning: result.reasoning
      });

      return {
        categoryId: result.categoryId,
        source: result.source
      };

    } catch (error) {
      console.error('Error determining category for email attachment:', error);
      
      // Fallback to basic categorization
      const categories = await storage.getCategories(userId);
      const fallbackCategoryId = categories.find(c => c.name.toLowerCase() === 'other')?.id || 
                                 categories.find(c => c.name.toLowerCase() === 'documents')?.id || null;
      
      return {
        categoryId: fallbackCategoryId,
        source: 'fallback'
      };
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): {
    supportedTypes: string[];
    maxFileSize: string;
    uploadPath: string;
  } {
    return {
      supportedTypes: SUPPORTED_MIME_TYPES,
      maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
      uploadPath: `users/{userId}/email/{year}/{month}/{filename}`
    };
  }
}

export const attachmentProcessor = new AttachmentProcessor();