/**
 * THMB-2: Thumbnail Existence Middleware
 * 
 * Provides middleware and utility functions to check if thumbnails exist in GCS
 * before deciding whether to return existing signed URLs or enqueue generation jobs.
 */

import { StorageService } from './storage/StorageService';
import { thumbnailObjectKey, isSupportedVariant } from './thumbnailHelpers';

export interface ThumbnailExistenceResult {
  exists: boolean;
  storagePath?: string;
  variant: number;
  documentId: number;
  sourceHash: string;
}

/**
 * Check if a specific thumbnail exists in GCS storage
 */
export async function checkThumbnailExists(
  documentId: number,
  variant: number,
  sourceHash: string
): Promise<ThumbnailExistenceResult> {
  const result: ThumbnailExistenceResult = {
    exists: false,
    variant,
    documentId,
    sourceHash
  };

  try {
    // Validate variant
    if (!isSupportedVariant(variant)) {
      console.warn(`⚠️ [THMB-2] Unsupported thumbnail variant: ${variant}`);
      return result;
    }

    // Generate storage path using thumbnail helpers
    const storagePath = thumbnailObjectKey(documentId, variant, sourceHash);
    result.storagePath = storagePath;

    // Check if object exists in GCS
    const storageService = StorageService.initialize();
    const exists = await storageService.objectExists(storagePath);
    
    result.exists = exists;
    
    if (exists) {
      console.log(`✅ [THMB-2] Thumbnail exists: ${storagePath}`);
    } else {
      console.log(`❌ [THMB-2] Thumbnail not found: ${storagePath}`);
    }

    return result;

  } catch (error: any) {
    console.error(`💥 [THMB-2] Error checking thumbnail existence:`, error);
    return result; // Return false on error
  }
}

/**
 * Check existence of multiple thumbnail variants for a document
 */
export async function checkMultipleThumbnailsExist(
  documentId: number,
  variants: number[],
  sourceHash: string
): Promise<ThumbnailExistenceResult[]> {
  const promises = variants.map(variant => 
    checkThumbnailExists(documentId, variant, sourceHash)
  );
  
  return await Promise.all(promises);
}

/**
 * Express middleware factory for thumbnail existence checking
 * Attaches existence results to req.thumbnailExistence
 */
export function createThumbnailExistenceMiddleware() {
  return async (req: any, res: any, next: any) => {
    try {
      const documentId = parseInt(req.params.id || req.params.documentId);
      const variant = parseInt(req.query.variant || '240'); // Default to 240px
      
      if (isNaN(documentId)) {
        return res.status(400).json({ 
          message: 'Invalid document ID',
          code: 'INVALID_DOCUMENT_ID' 
        });
      }

      if (!isSupportedVariant(variant)) {
        return res.status(400).json({ 
          message: `Unsupported thumbnail variant: ${variant}. Supported variants: 96, 240, 480`,
          code: 'INVALID_VARIANT' 
        });
      }

      // Get document and source hash (will be attached by auth middleware)
      const document = req.document;
      if (!document || !document.sourceHash) {
        return res.status(404).json({ 
          message: 'Document not found or missing source hash',
          code: 'DOCUMENT_NOT_FOUND' 
        });
      }

      // Check thumbnail existence
      const existenceResult = await checkThumbnailExists(
        documentId,
        variant,
        document.sourceHash
      );

      // Attach result to request for use by route handlers
      req.thumbnailExistence = existenceResult;
      
      next();

    } catch (error: any) {
      console.error('Thumbnail existence middleware error:', error);
      res.status(500).json({ 
        message: 'Internal server error checking thumbnail existence',
        code: 'THUMBNAIL_CHECK_ERROR' 
      });
    }
  };
}

/**
 * Utility to determine missing thumbnails that need generation
 */
export function getMissingThumbnails(
  existenceResults: ThumbnailExistenceResult[]
): number[] {
  return existenceResults
    .filter(result => !result.exists)
    .map(result => result.variant);
}

/**
 * Utility to get existing thumbnails for immediate URL generation
 */
export function getExistingThumbnails(
  existenceResults: ThumbnailExistenceResult[]
): ThumbnailExistenceResult[] {
  return existenceResults.filter(result => result.exists);
}