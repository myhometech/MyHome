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

// DOC-302: Supported file types and size limits
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
];

const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

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
  private gcsStorage: Storage;
  private bucketName: string;

  constructor() {
    // Initialize Google Cloud Storage
    this.gcsStorage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    this.bucketName = process.env.GCS_BUCKET_NAME || 'myhome-documents';
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
   * DOC-302: Process individual attachment with validation, GCS upload, and metadata storage
   */
  private async processAttachment(
    attachment: AttachmentData,
    userId: string,
    emailMetadata: { from: string; subject: string; requestId: string }
  ): Promise<ProcessedAttachment> {
    // Step 1: Validate file type
    const validation = this.validateAttachment(attachment);
    if (!validation.isValid) {
      return {
        success: false,
        filename: attachment.filename,
        error: validation.error,
        fileSize: attachment.size || 0
      };
    }

    // Step 2: Sanitize and normalize filename
    const sanitizedFilename = this.sanitizeFilename(attachment.filename);
    const timestampedFilename = this.addTimestamp(sanitizedFilename);

    // Step 3: Convert content to Buffer if needed
    let fileBuffer: Buffer;
    if (typeof attachment.content === 'string') {
      // Assume base64 encoded content from SendGrid
      fileBuffer = Buffer.from(attachment.content, 'base64');
    } else {
      fileBuffer = attachment.content;
    }

    // Step 4: Generate unique GCS object path
    const gcsPath = this.generateGCSPath(userId, timestampedFilename);

    try {
      // Step 5: Upload to GCS with retry logic
      await this.uploadToGCS(gcsPath, fileBuffer, attachment.contentType);

      // Step 6: Store metadata in PostgreSQL
      const documentId = await this.storeDocumentMetadata({
        userId,
        filename: sanitizedFilename,
        originalFilename: attachment.filename,
        gcsPath,
        mimeType: attachment.contentType,
        fileSize: fileBuffer.length,
        emailMetadata
      });

      return {
        success: true,
        documentId,
        filename: sanitizedFilename,
        gcsPath,
        fileSize: fileBuffer.length
      };

    } catch (error) {
      console.error(`[${emailMetadata.requestId}] Error processing attachment ${attachment.filename}:`, error);
      return {
        success: false,
        filename: attachment.filename,
        error: error instanceof Error ? error.message : 'Upload or storage error',
        fileSize: fileBuffer.length
      };
    }
  }

  /**
   * DOC-302: Validate attachment file type and size
   */
  private validateAttachment(attachment: AttachmentData): { isValid: boolean; error?: string } {
    // Validate content type exists
    if (!attachment.contentType) {
      return {
        isValid: false,
        error: 'Missing content type information'
      };
    }

    // Validate file type by MIME type
    if (!SUPPORTED_MIME_TYPES.includes(attachment.contentType.toLowerCase())) {
      return {
        isValid: false,
        error: `Unsupported file type: ${attachment.contentType}. Allowed: PDF, JPG, PNG, DOCX`
      };
    }

    // Validate file extension
    const extension = attachment.filename.toLowerCase().substring(attachment.filename.lastIndexOf('.'));
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return {
        isValid: false,
        error: `Unsupported file extension: ${extension}. Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`
      };
    }

    // Calculate file size
    let fileSize: number;
    if (typeof attachment.content === 'string') {
      // Base64 encoded - calculate actual size
      fileSize = Math.ceil(attachment.content.length * 0.75); // Base64 is ~33% larger
    } else {
      fileSize = attachment.content.length;
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File too large: ${Math.round(fileSize / 1024 / 1024)}MB. Maximum allowed: 10MB`
      };
    }

    return { isValid: true };
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
    const file = this.gcsStorage.bucket(this.bucketName).file(gcsPath);

    const uploadOptions = {
      metadata: {
        contentType,
        cacheControl: 'private, max-age=86400',
        metadata: {
          uploadSource: 'email',
          uploadedAt: new Date().toISOString()
        }
      },
      resumable: false // Use simple upload for files under 5MB
    };

    // First attempt
    try {
      await file.save(fileBuffer, uploadOptions);
      console.log(`Successfully uploaded to GCS: ${gcsPath}`);
      return;
    } catch (error) {
      console.warn(`First GCS upload attempt failed for ${gcsPath}:`, error);
    }

    // Retry once
    try {
      await file.save(fileBuffer, uploadOptions);
      console.log(`Successfully uploaded to GCS on retry: ${gcsPath}`);
    } catch (retryError) {
      console.error(`Both GCS upload attempts failed for ${gcsPath}:`, retryError);
      throw new Error(`GCS upload failed after retry: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
    }
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
    return document.id;
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