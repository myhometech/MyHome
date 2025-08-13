/**
 * TICKET 3: Enhanced Attachment Processing Service
 * Handles attachment classification, conversion routing, and maintains originals
 */

import { Buffer } from 'buffer';
import { nanoid } from 'nanoid';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { InsertDocument } from '@shared/schema';
import { storage } from './storage.js';
import { 
  attachmentClassificationService, 
  type AttachmentData,
  type ConversionStatus 
} from './attachmentClassificationService.js';

// File size limits
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_PAYLOAD_SIZE = 30 * 1024 * 1024; // 30MB total for all attachments

interface EmailMetadata {
  from: string;
  subject: string;
  requestId: string;
  messageId?: string;
}

interface EnhancedProcessedAttachment {
  success: boolean;
  originalDocument: {
    documentId: number;
    filename: string;
    gcsPath: string;
    fileSize: number;
    mimeType: string;
    conversionStatus: ConversionStatus;
  };
  convertedDocument?: {
    documentId: number;
    filename: string;
    gcsPath: string;
    fileSize: number;
    mimeType: string;
    sourceDocumentId: number;
    originalMimeType: string;
    conversionJobId?: string;
  };
  error?: string;
}

export class EnhancedAttachmentProcessor {
  private bucketName: string;
  private uploadsDir: string;

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME || 'myhome-documents';
    this.uploadsDir = './uploads';
    
    // Ensure uploads directory exists
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
    
    console.log('EnhancedAttachmentProcessor initialized for TICKET 3');
  }

  /**
   * TICKET 3: Process all attachments with classification and routing
   */
  async processEmailAttachments(
    attachments: AttachmentData[],
    userId: string,
    emailMetadata: EmailMetadata
  ): Promise<{
    processedAttachments: EnhancedProcessedAttachment[];
    totalProcessed: number;
    totalFailed: number;
    originalCount: number;
    convertedCount: number;
  }> {
    const results: EnhancedProcessedAttachment[] = [];
    let totalProcessed = 0;
    let totalFailed = 0;
    let originalCount = 0;
    let convertedCount = 0;

    console.log(`[${emailMetadata.requestId}] TICKET 3: Processing ${attachments.length} attachments for user ${userId}`);

    // Validate total payload size
    const totalSize = attachments.reduce((sum, att) => sum + (att.size || 0), 0);
    if (totalSize > MAX_TOTAL_PAYLOAD_SIZE) {
      console.error(`[${emailMetadata.requestId}] ❌ Total payload size ${this.formatFileSize(totalSize)} exceeds ${this.formatFileSize(MAX_TOTAL_PAYLOAD_SIZE)} limit`);
      throw new Error(`Total attachment size exceeds ${this.formatFileSize(MAX_TOTAL_PAYLOAD_SIZE)} limit`);
    }

    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      console.log(`[${emailMetadata.requestId}] Processing attachment ${i + 1}/${attachments.length}: ${attachment.filename}`);

      try {
        const result = await this.processAttachmentWithClassification(attachment, userId, emailMetadata);
        results.push(result);
        
        if (result.success) {
          totalProcessed++;
          originalCount++;
          
          if (result.convertedDocument) {
            convertedCount++;
          }
          
          console.log(`[${emailMetadata.requestId}] ✅ Successfully processed: ${result.originalDocument.filename} (${result.originalDocument.conversionStatus})`);
          if (result.convertedDocument) {
            console.log(`[${emailMetadata.requestId}] ✅ Converted document created: ${result.convertedDocument.filename}`);
          }
        } else {
          totalFailed++;
          console.error(`[${emailMetadata.requestId}] ❌ Failed to process: ${attachment.filename} - ${result.error}`);
        }
      } catch (error) {
        const errorResult: EnhancedProcessedAttachment = {
          success: false,
          originalDocument: {
            documentId: 0,
            filename: attachment.filename,
            gcsPath: '',
            fileSize: attachment.size || 0,
            mimeType: attachment.contentType,
            conversionStatus: 'failed'
          },
          error: error instanceof Error ? error.message : 'Unknown processing error'
        };
        results.push(errorResult);
        totalFailed++;
        console.error(`[${emailMetadata.requestId}] ❌ Exception processing ${attachment.filename}:`, error);
      }
    }

    console.log(`[${emailMetadata.requestId}] TICKET 3: Processing complete: ${originalCount} originals stored, ${convertedCount} converted PDFs created, ${totalFailed} failed`);
    return { 
      processedAttachments: results, 
      totalProcessed, 
      totalFailed, 
      originalCount, 
      convertedCount 
    };
  }

  /**
   * TICKET 3: Process single attachment with classification and conversion
   */
  private async processAttachmentWithClassification(
    attachment: AttachmentData,
    userId: string,
    emailMetadata: EmailMetadata
  ): Promise<EnhancedProcessedAttachment> {
    const { requestId } = emailMetadata;
    
    // Step 1: Classify attachment
    const classification = attachmentClassificationService.classifyAttachment(attachment);
    const conversionStatus = attachmentClassificationService.getConversionStatus(classification);
    
    console.log(`[${requestId}] Classification: ${attachment.filename} → ${classification.type} (${classification.action})`);
    
    // Step 2: Validate and decode attachment
    const validation = this.validateAttachment(attachment, requestId);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const decodedContent = this.decodeAttachmentContent(attachment.content, requestId);
    
    // Step 3: Store original document (always preserved)
    const originalDocument = await this.storeOriginalDocument(
      attachment, 
      decodedContent, 
      userId, 
      emailMetadata, 
      conversionStatus
    );

    console.log(`[${requestId}] ✅ Original stored: ${originalDocument.filename} (ID: ${originalDocument.documentId})`);

    // Step 4: Convert if needed
    let convertedDocument: EnhancedProcessedAttachment['convertedDocument'];
    
    if (classification.action === 'convert_to_pdf') {
      try {
        console.log(`[${requestId}] 🔄 Converting ${attachment.filename} to PDF...`);
        
        const conversionResult = await attachmentClassificationService.convertAttachmentToPdf(
          attachment, 
          classification
        );
        
        if (conversionResult.success && conversionResult.pdfBuffer) {
          // Store converted PDF as separate document
          convertedDocument = await this.storeConvertedDocument(
            conversionResult,
            originalDocument,
            userId,
            emailMetadata,
            attachment.contentType
          );
          
          // Update original document status to completed
          await this.updateConversionStatus(originalDocument.documentId, 'completed', conversionResult.jobId);
          
          console.log(`[${requestId}] ✅ PDF conversion completed: ${convertedDocument.filename} (ID: ${convertedDocument.documentId})`);
        } else {
          // Handle conversion failure
          const failureStatus = this.getFailureStatus(conversionResult.error, conversionResult.metadata);
          await this.updateConversionStatus(originalDocument.documentId, failureStatus);
          console.log(`[${requestId}] ❌ PDF conversion failed: ${conversionResult.error} (status: ${failureStatus})`);
        }
      } catch (conversionError) {
        console.error(`[${requestId}] ❌ Conversion exception:`, conversionError);
        await this.updateConversionStatus(originalDocument.documentId, 'failed');
      }
    }

    return {
      success: true,
      originalDocument,
      convertedDocument
    };
  }

  /**
   * TICKET 3: Store original document (always preserved)
   */
  private async storeOriginalDocument(
    attachment: AttachmentData,
    decodedContent: Buffer,
    userId: string,
    emailMetadata: EmailMetadata,
    conversionStatus: ConversionStatus
  ): Promise<EnhancedProcessedAttachment['originalDocument']> {
    // Generate unique filename and path
    const sanitizedFilename = this.sanitizeFilename(attachment.filename);
    const timestampedFilename = this.addTimestamp(sanitizedFilename);
    const gcsPath = this.generateGCSPath(userId, timestampedFilename);
    
    // Upload to storage (local fallback)
    await this.uploadToStorage(gcsPath, decodedContent, attachment.contentType);
    
    // Store metadata in database
    const documentData: Partial<InsertDocument> = {
      userId,
      name: sanitizedFilename,
      fileName: sanitizedFilename,
      filePath: gcsPath,
      gcsPath,
      fileSize: decodedContent.length,
      mimeType: attachment.contentType,
      uploadSource: 'email',
      status: 'active',
      conversionStatus,
      emailContext: {
        from: emailMetadata.from,
        subject: emailMetadata.subject,
        receivedAt: new Date().toISOString(),
        messageId: emailMetadata.messageId
      }
    };

    const documentId = await storage.createDocument(documentData as InsertDocument);
    
    return {
      documentId,
      filename: sanitizedFilename,
      gcsPath,
      fileSize: decodedContent.length,
      mimeType: attachment.contentType,
      conversionStatus
    };
  }

  /**
   * TICKET 3: Store converted PDF document
   */
  private async storeConvertedDocument(
    conversionResult: { pdfBuffer: Buffer; filename: string; jobId?: string; metadata?: any },
    originalDocument: EnhancedProcessedAttachment['originalDocument'],
    userId: string,
    emailMetadata: EmailMetadata,
    originalMimeType: string
  ): Promise<EnhancedProcessedAttachment['convertedDocument']> {
    const { pdfBuffer, filename, jobId, metadata } = conversionResult;
    
    // Generate unique filename and path for PDF
    const timestampedFilename = this.addTimestamp(filename);
    const gcsPath = this.generateGCSPath(userId, timestampedFilename);
    
    // Upload PDF to storage
    await this.uploadToStorage(gcsPath, pdfBuffer, 'application/pdf');
    
    // Store PDF metadata in database with reference to original
    const pdfDocumentData: Partial<InsertDocument> = {
      userId,
      name: `${originalDocument.filename} (converted)`,
      fileName: filename,
      filePath: gcsPath,
      gcsPath,
      fileSize: pdfBuffer.length,
      mimeType: 'application/pdf',
      uploadSource: 'email',
      status: 'active',
      conversionStatus: 'completed',
      sourceDocumentId: originalDocument.documentId,
      originalMimeType,
      conversionJobId: jobId,
      conversionMetadata: metadata,
      emailContext: {
        from: emailMetadata.from,
        subject: emailMetadata.subject,
        receivedAt: new Date().toISOString(),
        messageId: emailMetadata.messageId,
        convertedFrom: originalDocument.filename
      }
    };

    const documentId = await storage.createDocument(pdfDocumentData as InsertDocument);
    
    return {
      documentId,
      filename,
      gcsPath,
      fileSize: pdfBuffer.length,
      mimeType: 'application/pdf',
      sourceDocumentId: originalDocument.documentId,
      originalMimeType,
      conversionJobId: jobId
    };
  }

  /**
   * Update conversion status of a document
   */
  private async updateConversionStatus(
    documentId: number, 
    status: ConversionStatus, 
    jobId?: string
  ): Promise<void> {
    const updateData: any = { conversionStatus: status };
    if (jobId) {
      updateData.conversionJobId = jobId;
    }
    // Find the document to get userId
    const document = await storage.getDocumentById(documentId);
    if (document) {
      await storage.updateDocument(documentId, document.userId, updateData);
    }
  }

  /**
   * Determine failure status from error details
   */
  private getFailureStatus(error?: string, metadata?: any): ConversionStatus {
    if (metadata?.reason === 'password_protected') {
      return 'skipped_password_protected';
    }
    if (error?.includes('password') || error?.includes('encrypted')) {
      return 'skipped_password_protected';
    }
    return 'failed';
  }

  /**
   * Validate attachment meets requirements
   */
  private validateAttachment(attachment: AttachmentData, requestId: string): { isValid: boolean; error?: string } {
    // Size validation
    if (attachment.size && attachment.size > MAX_FILE_SIZE) {
      return { isValid: false, error: `File size ${this.formatFileSize(attachment.size)} exceeds ${this.formatFileSize(MAX_FILE_SIZE)} limit` };
    }

    // Filename validation
    if (!attachment.filename || attachment.filename.trim().length === 0) {
      return { isValid: false, error: 'Invalid filename' };
    }

    // Content validation
    if (!attachment.content) {
      return { isValid: false, error: 'Missing file content' };
    }

    return { isValid: true };
  }

  /**
   * Decode base64 attachment content
   */
  private decodeAttachmentContent(content: Buffer | string, requestId: string): Buffer {
    if (Buffer.isBuffer(content)) {
      return content;
    }
    
    try {
      return Buffer.from(content, 'base64');
    } catch (error) {
      throw new Error(`Base64 decoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload file to storage (with GCS fallback to local)
   */
  private async uploadToStorage(gcsPath: string, content: Buffer, mimeType: string): Promise<void> {
    // For now, use local storage fallback
    const localPath = join(this.uploadsDir, gcsPath.split('/').pop() || `file_${Date.now()}`);
    writeFileSync(localPath, content);
    console.log(`📁 File stored locally: ${localPath}`);
  }

  /**
   * Generate unique GCS object path
   */
  private generateGCSPath(userId: string, filename: string): string {
    const userPrefix = userId.substring(0, 8);
    const timestamp = new Date().toISOString().split('T')[0];
    return `users/${userPrefix}/${timestamp}/${filename}`;
  }

  /**
   * Add timestamp to filename to ensure uniqueness
   */
  private addTimestamp(filename: string): string {
    const timestamp = Date.now();
    const randomId = nanoid(8);
    const ext = filename.substring(filename.lastIndexOf('.'));
    const name = filename.substring(0, filename.lastIndexOf('.'));
    return `${name}_${timestamp}_${randomId}${ext}`;
  }

  /**
   * Sanitize filename for safe storage
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.\-_\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

// Create singleton instance
export const enhancedAttachmentProcessor = new EnhancedAttachmentProcessor();