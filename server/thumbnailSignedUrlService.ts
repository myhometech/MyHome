import { StorageService } from './storage/StorageService';
import { canAccessDocument } from './middleware/roleBasedAccess';
import { thumbnailObjectKey, isSupportedVariant } from './thumbnailHelpers';
import { storage } from './storage';
import { logThumbnailAccessRequested } from './auditLogger';

/**
 * THMB-1: Signed URL service for secure thumbnail access with RBAC validation
 * Prevents path guessing by validating ownership before issuing signed URLs
 */
export class ThumbnailSignedUrlService {
  
  /**
   * Assert that user can read thumbnail for a document
   * Uses existing RBAC ownership checks
   */
  static async assertCanReadThumbnail(userId: string, documentId: number): Promise<void> {
    const canRead = await canAccessDocument(userId, documentId, 'read');
    if (!canRead) {
      throw new Error('RBAC_THUMBNAIL_ACCESS_DENIED');
    }
  }

  /**
   * Generate signed read URL for thumbnail with RBAC validation
   * Hard-scoped to specific object (GET only) as specified in ticket
   */
  static async generateSignedReadUrl(
    storagePath: string, 
    ttlMinutes: number = 30
  ): Promise<string> {
    try {
      const storageProvider = StorageService.getProvider();
      const ttlSeconds = ttlMinutes * 60;
      
      // Generate signed URL with read-only access
      const signedUrl = await storageProvider.getSignedUrl(storagePath, ttlSeconds);
      
      return signedUrl;
    } catch (error: any) {
      console.error('Failed to generate signed URL for thumbnail:', error);
      throw new Error(`SIGNED_URL_GENERATION_FAILED: ${error.message}`);
    }
  }

  /**
   * Check if thumbnail object exists in storage
   * Used for 404 vs 403 error distinction
   */
  static async thumbnailExists(storagePath: string): Promise<boolean> {
    try {
      const storageProvider = StorageService.getProvider();
      return await storageProvider.exists(storagePath);
    } catch (error) {
      console.error('Error checking thumbnail existence:', error);
      return false;
    }
  }

  /**
   * Get thumbnail signed URL with full RBAC and validation pipeline
   * This is the main service method that enforces all security requirements
   */
  static async getThumbnailSignedUrl(
    userId: string,
    documentId: number,
    variant: number,
    ttlMinutes: number = 30
  ): Promise<{
    url: string;
    ttlSeconds: number;
    documentId: number;
    variant: number;
  }> {
    // Validate variant support
    if (!isSupportedVariant(variant)) {
      throw new Error('UNSUPPORTED_VARIANT');
    }

    // RBAC: Validate user can read this document's thumbnails
    await this.assertCanReadThumbnail(userId, documentId);

    // Get document to retrieve sourceHash
    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      throw new Error('DOCUMENT_NOT_FOUND');
    }

    if (!document.sourceHash) {
      throw new Error('SOURCE_HASH_NOT_AVAILABLE');
    }

    // Generate thumbnail object path
    const storagePath = thumbnailObjectKey(documentId, variant, 'jpg', document.sourceHash);

    // Check if thumbnail exists (404 vs 403 distinction)
    const exists = await this.thumbnailExists(storagePath);
    if (!exists) {
      throw new Error('THUMBNAIL_NOT_FOUND');
    }

    // Generate signed URL
    const signedUrl = await this.generateSignedReadUrl(storagePath, ttlMinutes);

    // THMB-1: Emit audit event for thumbnail access request
    try {
      const userHousehold = await storage.getUserHousehold(userId);
      await logThumbnailAccessRequested(documentId, userId, userHousehold?.id, {
        variant,
        sourceHash: document.sourceHash,
        storagePath,
        actor: 'user',
        ttlSeconds: ttlMinutes * 60,
      });
    } catch (auditError) {
      console.error('Failed to log thumbnail access audit event:', auditError);
      // Don't fail the request for audit logging issues
    }

    return {
      url: signedUrl,
      ttlSeconds: ttlMinutes * 60,
      documentId,
      variant
    };
  }

  /**
   * Head check for thumbnail object existence (for idempotency in later tickets)
   * Used by gcsHead helper mentioned in ticket implementation notes
   */
  static async gcsHead(objectKey: string): Promise<boolean> {
    return this.thumbnailExists(objectKey);
  }
}

/**
 * Convenience export for main service functions
 * Matches ticket specification interfaces
 */
export const generateSignedReadUrl = ThumbnailSignedUrlService.generateSignedReadUrl;
export const assertCanReadThumbnail = ThumbnailSignedUrlService.assertCanReadThumbnail;
export const gcsHead = ThumbnailSignedUrlService.gcsHead;