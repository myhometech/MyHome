/**
 * THMB-1: Thumbnail object key schema and GCS bucket layout utilities
 * Defines the structure: gs://<bucket>/thumbnails/{documentId}/{variant}/v{sourceHash}.{ext}
 */

export interface ThumbnailVariant {
  variant: number;
  format: 'jpg' | 'png';
}

export interface ThumbnailMetadata {
  documentId: number;
  variant: number;
  sourceHash: string;
  format: 'jpg' | 'png';
  contentType: string;
  cacheControl: string;
}

/**
 * Supported thumbnail variants as specified in the ticket
 * Reserved for later tickets: 96, 240, 480
 */
export const THUMBNAIL_VARIANTS = [96, 240, 480] as const;

/**
 * Supported thumbnail formats
 */
export const THUMBNAIL_FORMATS = ['jpg', 'png'] as const;

/**
 * Generate thumbnail object key for GCS storage
 * Format: thumbnails/{documentId}/{variant}/v{sourceHash}.{ext}
 */
export function thumbnailObjectKey(
  documentId: number, 
  variant: number, 
  ext: 'jpg' | 'png', 
  sourceHash: string
): string {
  return `thumbnails/${documentId}/${variant}/v${sourceHash}.${ext}`;
}

/**
 * Parse thumbnail object key to extract metadata
 * Returns null if the key doesn't match the expected format
 */
export function parseThumbnailObjectKey(objectKey: string): ThumbnailMetadata | null {
  const regex = /^thumbnails\/(\d+)\/(\d+)\/v([a-f0-9]{64})\.(\w+)$/;
  const match = objectKey.match(regex);
  
  if (!match) {
    return null;
  }
  
  const [, documentIdStr, variantStr, sourceHash, ext] = match;
  const documentId = parseInt(documentIdStr, 10);
  const variant = parseInt(variantStr, 10);
  
  if (!THUMBNAIL_FORMATS.includes(ext as any)) {
    return null;
  }
  
  return {
    documentId,
    variant,
    sourceHash,
    format: ext as 'jpg' | 'png',
    contentType: ext === 'jpg' ? 'image/jpeg' : 'image/png',
    cacheControl: 'public, max-age=31536000, immutable'
  };
}

/**
 * Generate all thumbnail object keys for a document
 */
export function generateThumbnailKeys(
  documentId: number, 
  sourceHash: string, 
  format: 'jpg' | 'png' = 'jpg'
): string[] {
  return THUMBNAIL_VARIANTS.map(variant => 
    thumbnailObjectKey(documentId, variant, format, sourceHash)
  );
}

/**
 * Check if variant is supported
 */
export function isSupportedVariant(variant: number): boolean {
  return THUMBNAIL_VARIANTS.includes(variant as any);
}

/**
 * Get GCS metadata for thumbnail objects
 * Enforces content-type and Cache-Control as specified in the ticket
 */
export function getThumbnailGCSMetadata(format: 'jpg' | 'png') {
  return {
    contentType: format === 'jpg' ? 'image/jpeg' : 'image/png',
    cacheControl: 'public, max-age=31536000, immutable', // 1 year cache with immutable
  };
}

/**
 * Validate thumbnail request parameters
 */
export function validateThumbnailRequest(params: {
  documentId?: any;
  variant?: any;
}): { valid: boolean; documentId?: number; variant?: number; error?: string } {
  if (!params.documentId) {
    return { valid: false, error: 'documentId is required' };
  }
  
  if (!params.variant) {
    return { valid: false, error: 'variant is required' };
  }
  
  const documentId = parseInt(params.documentId, 10);
  const variant = parseInt(params.variant, 10);
  
  if (isNaN(documentId) || documentId <= 0) {
    return { valid: false, error: 'documentId must be a positive integer' };
  }
  
  if (isNaN(variant) || !isSupportedVariant(variant)) {
    return { valid: false, error: `variant must be one of: ${THUMBNAIL_VARIANTS.join(', ')}` };
  }
  
  return { valid: true, documentId, variant };
}