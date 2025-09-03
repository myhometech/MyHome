/**
 * THMB-2: Thumbnail API Routes
 * 
 * Implements async thumbnail generation with job-based processing:
 * - GET /api/documents/:id/thumbnail - Returns existing URL or enqueues job
 * - POST /api/thumbnails - Explicitly requests (re)generation
 */

import { Router } from 'express';
import { requireAuth } from '../simpleAuth';
import { canAccessDocument } from '../middleware/roleBasedAccess';
import { storage } from '../storage';
import { thumbnailJobQueue } from '../thumbnailJobQueue';
import { ThumbnailSignedUrlService } from '../thumbnailSignedUrlService';
import { checkThumbnailExists, getMissingThumbnails } from '../thumbnailExistenceMiddleware';
import { isSupportedVariant } from '../thumbnailHelpers';

const router = Router();

/**
 * GET /api/documents/:id/thumbnail?variant=240
 * 
 * Returns existing signed URL (200) or enqueues generation job (202)
 */
router.get('/documents/:id/thumbnail', requireAuth, async (req: any, res: any) => {
  try {
    const documentId = parseInt(req.params.id);
    const variant = parseInt(req.query.variant || '240'); // Default to 240px
    const userId = req.user.id;

    // Validate inputs
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

    // Get document and check ownership
    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      return res.status(404).json({ 
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND' 
      });
    }

    // RBAC check
    const canAccess = await canAccessDocument(req.user, documentId, storage);
    if (!canAccess) {
      return res.status(403).json({ 
        message: 'Access denied',
        code: 'ACCESS_DENIED' 
      });
    }

    // Check if sourceHash exists
    if (!document.sourceHash) {
      return res.status(400).json({
        message: 'Document missing source hash - cannot generate thumbnails',
        code: 'MISSING_SOURCE_HASH'
      });
    }

    // Check if thumbnail already exists
    const existenceResult = await checkThumbnailExists(
      documentId,
      variant,
      document.sourceHash
    );

    if (existenceResult.exists && existenceResult.storagePath) {
      // Thumbnail exists - return signed URL
      console.log(`✅ [THMB-2] Returning existing thumbnail for doc ${documentId}, variant ${variant}`);
      
      try {
        const signedUrlResult = await ThumbnailSignedUrlService.getThumbnailSignedUrl(
          userId,
          documentId,
          variant
        );

        return res.status(200).json({
          status: 'ready',
          documentId,
          variant,
          url: signedUrlResult.url,
          ttlSeconds: signedUrlResult.ttlSeconds
        });

      } catch (urlError: any) {
        console.error('Failed to generate signed URL for existing thumbnail:', urlError);
        // Fall through to enqueue job if URL generation fails
      }
    }

    // Thumbnail doesn't exist - enqueue generation job
    console.log(`📋 [THMB-2] Enqueueing thumbnail generation for doc ${documentId}, variant ${variant}`);

    const userHousehold = await storage.getUserHousehold(userId);
    const jobResult = await thumbnailJobQueue.enqueueJob({
      documentId,
      sourceHash: document.sourceHash,
      variants: [variant],
      mimeType: document.mimeType,
      userId,
      householdId: userHousehold?.id
    });

    return res.status(202).json({
      status: 'queued',
      documentId,
      variant,
      jobId: jobResult.jobId,
      retryAfterMs: jobResult.retryAfterMs
    });

  } catch (error: any) {
    console.error('Error in GET /api/documents/:id/thumbnail:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/thumbnails
 * 
 * Explicitly request thumbnail generation for multiple variants
 * Always enqueues job and returns 202
 */
router.post('/thumbnails', requireAuth, async (req: any, res: any) => {
  try {
    const { documentId, variants = [96, 240, 480] } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!documentId || isNaN(parseInt(documentId))) {
      return res.status(400).json({ 
        message: 'Invalid or missing documentId',
        code: 'INVALID_DOCUMENT_ID' 
      });
    }

    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ 
        message: 'Variants must be a non-empty array',
        code: 'INVALID_VARIANTS' 
      });
    }

    // Validate all variants
    const invalidVariants = variants.filter(v => !isSupportedVariant(v));
    if (invalidVariants.length > 0) {
      return res.status(400).json({ 
        message: `Unsupported variants: ${invalidVariants.join(', ')}. Supported variants: 96, 240, 480`,
        code: 'INVALID_VARIANTS' 
      });
    }

    const docId = parseInt(documentId);

    // Get document and check ownership
    const document = await storage.getDocument(docId, userId);
    if (!document) {
      return res.status(404).json({ 
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND' 
      });
    }

    // RBAC check
    const canAccess = await canAccessDocument(req.user, docId, storage);
    if (!canAccess) {
      return res.status(403).json({ 
        message: 'Access denied',
        code: 'ACCESS_DENIED' 
      });
    }

    // Check if sourceHash exists
    if (!document.sourceHash) {
      return res.status(400).json({
        message: 'Document missing source hash - cannot generate thumbnails',
        code: 'MISSING_SOURCE_HASH'
      });
    }

    // For POST, always enqueue job regardless of existing thumbnails
    console.log(`📋 [THMB-2] Explicit thumbnail generation request for doc ${docId}, variants [${variants.join(', ')}]`);

    const userHousehold = await storage.getUserHousehold(userId);
    const jobResult = await thumbnailJobQueue.enqueueJob({
      documentId: docId,
      sourceHash: document.sourceHash,
      variants,
      mimeType: document.mimeType,
      userId,
      householdId: userHousehold?.id
    });

    return res.status(202).json({
      status: 'queued',
      documentId: docId,
      jobId: jobResult.jobId,
      variants
    });

  } catch (error: any) {
    console.error('Error in POST /api/thumbnails:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * GET /api/thumbnails/job/:jobId
 * 
 * Check status of a thumbnail generation job
 */
router.get('/thumbnails/job/:jobId', requireAuth, async (req: any, res: any) => {
  try {
    const { jobId } = req.params;
    const variant = parseInt(req.query.variant || '240');

    if (!jobId) {
      return res.status(400).json({ 
        message: 'Job ID is required',
        code: 'MISSING_JOB_ID' 
      });
    }

    const jobStatus = await thumbnailJobQueue.getJobStatus(jobId, variant);
    
    if (!jobStatus) {
      return res.status(404).json({ 
        message: 'Job not found',
        code: 'JOB_NOT_FOUND' 
      });
    }

    return res.status(200).json({
      jobId,
      status: jobStatus.status,
      documentId: jobStatus.documentId,
      variant: jobStatus.variant,
      errorCode: jobStatus.errorCode,
      createdAt: jobStatus.createdAt,
      updatedAt: jobStatus.updatedAt
    });

  } catch (error: any) {
    console.error('Error in GET /api/thumbnails/job/:jobId:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      code: 'INTERNAL_ERROR' 
    });
  }
});

export default router;