import { Storage } from '@google-cloud/storage';
import path from 'path';

interface AttachmentStorageResult {
  success: boolean;
  documentId?: string;
  filename?: string;
  gcsPath?: string;
  size?: number;
  error?: string;
}

export class AttachmentStorageService {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.storage = new Storage();
    this.bucketName = process.env.MAILGUN_GCS_BUCKET || 'myhometech-storage';
  }

  /**
   * Store file attachment from email in GCS under structured path
   * Path: emails/{userId}/{timestamp}-{messageId}/attachments/{filename}
   */
  async storeEmailAttachment(
    file: any,
    userId: string,
    messageId: string,
    timestamp?: string
  ): Promise<AttachmentStorageResult> {
    try {
      const timePrefix = timestamp || new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const sanitizedFilename = this.sanitizeFilename(file.originalname || file.filename || 'unnamed');
      const gcsPath = `emails/${userId}/${timePrefix}-${messageId}/attachments/${sanitizedFilename}`;
      
      console.log(`📁 Storing attachment: ${sanitizedFilename} → ${gcsPath}`);
      
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(gcsPath);
      
      // Upload file buffer to GCS
      await gcsFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname || file.filename,
            uploadedAt: new Date().toISOString(),
            source: 'email-attachment',
            messageId,
            userId
          }
        }
      });
      
      console.log(`✅ Attachment stored successfully: ${gcsPath}`);
      
      return {
        success: true,
        filename: sanitizedFilename,
        gcsPath,
        size: file.size
      };
      
    } catch (error) {
      console.error('❌ Failed to store email attachment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Store multiple attachments from an email
   */
  async storeMultipleAttachments(
    files: any[],
    userId: string,
    messageId: string,
    timestamp?: string
  ): Promise<AttachmentStorageResult[]> {
    const results = await Promise.allSettled(
      files.map(file => this.storeEmailAttachment(file, userId, messageId, timestamp))
    );
    
    return results.map(result => 
      result.status === 'fulfilled' 
        ? result.value 
        : { success: false, error: 'Promise rejected' }
    );
  }

  /**
   * Sanitize filename for safe storage
   */
  private sanitizeFilename(filename: string): string {
    // Remove path separators and dangerous characters, keep extension
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    
    const sanitized = name
      .replace(/[^a-zA-Z0-9._-]/g, '_')  // Replace unsafe chars with underscore
      .replace(/_{2,}/g, '_')            // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '')          // Remove leading/trailing underscores
      .slice(0, 200);                   // Limit length
    
    return sanitized + ext;
  }
}

export const attachmentStorageService = new AttachmentStorageService();