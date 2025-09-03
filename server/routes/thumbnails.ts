import { Request, Response } from 'express';
import { ThumbnailSignedUrlService } from '../thumbnailSignedUrlService';
import { validateThumbnailRequest } from '../thumbnailHelpers';
import { requireAuth } from '../middleware/auth';
import { logThumbnailAccessRequested } from '../auditLogger';
import { storage } from '../storage';

/**
 * THMB-1: Thumbnail API routes
 * GET /api/thumbnails/url - Generate signed URL for thumbnail access
 */

/**
 * GET /api/thumbnails/url?documentId=123&variant=240
 * Returns signed URL for thumbnail access with RBAC validation
 */
export async function getThumbnailUrl(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Validate request parameters
    const validation = validateThumbnailRequest({
      documentId: req.query.documentId,
      variant: req.query.variant,
    });

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { documentId, variant } = validation;
    
    try {
      // Get signed URL with full RBAC validation
      const result = await ThumbnailSignedUrlService.getThumbnailSignedUrl(
        userId, 
        documentId!, 
        variant!, 
        30 // 30 minutes TTL as specified in ticket
      );

      // Get user's household for audit logging
      const userHousehold = await storage.getUserHousehold(userId);
      const householdId = userHousehold?.id || null;

      // THMB-1: Emit audit event for thumbnail access request
      await logThumbnailAccessRequested(documentId!, userId, householdId, {
        variant: variant!,
        sourceHash: undefined, // Will be filled by the service
        storagePath: undefined, // Will be filled by the service  
        actor: 'user',
        ttlSeconds: result.ttlSeconds,
      });

      // Return successful response as specified in ticket
      res.status(200).json({
        documentId: result.documentId,
        variant: result.variant,
        url: result.url,
        ttlSeconds: result.ttlSeconds,
      });

    } catch (serviceError: any) {
      // Handle specific service errors with appropriate HTTP status codes
      switch (serviceError.message) {
        case 'RBAC_THUMBNAIL_ACCESS_DENIED':
          res.status(403).json({ error: 'Access denied: Insufficient permissions' });
          break;
        case 'DOCUMENT_NOT_FOUND':
          res.status(404).json({ error: 'Document not found' });
          break;
        case 'SOURCE_HASH_NOT_AVAILABLE':
          res.status(404).json({ error: 'Source hash not available for this document' });
          break;
        case 'THUMBNAIL_NOT_FOUND':
          res.status(404).json({ error: 'Thumbnail not found' });
          break;
        case 'UNSUPPORTED_VARIANT':
          res.status(400).json({ error: 'Unsupported thumbnail variant' });
          break;
        case 'SIGNED_URL_GENERATION_FAILED':
          res.status(500).json({ error: 'Failed to generate signed URL' });
          break;
        default:
          console.error('Unexpected thumbnail service error:', serviceError);
          res.status(500).json({ error: 'Internal server error' });
      }
    }

  } catch (error: any) {
    console.error('Thumbnail URL endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Register thumbnail routes
 */
export function registerThumbnailRoutes(app: any) {
  // THMB-1: GET /api/thumbnails/url endpoint with authentication
  app.get('/api/thumbnails/url', requireAuth, getThumbnailUrl);
}