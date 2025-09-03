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
 * THMB-API-STD: GET /api/documents/:id/thumbnail?variant=240
 * 
 * Always returns JSON (never binary). Returns existing signed URL (200) or enqueues generation job (202)
 */
router.get('/documents/:id/thumbnail', requireAuth, async (req: any, res: any) => {
  // THMB-API-STD: Ensure JSON response headers for all paths
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  try {
    const documentId = parseInt(req.params.id);
    const variant = parseInt(req.query.variant || '240'); // Default to 240px
    const userId = req.user.id;

    // Validate inputs
    if (isNaN(documentId)) {
      return res.status(400).json({ 
        errorCode: 'INVALID_DOCUMENT_ID',
        message: 'Invalid document ID'
      });
    }

    if (!isSupportedVariant(variant)) {
      return res.status(400).json({ 
        errorCode: 'INVALID_VARIANT',
        message: `Unsupported thumbnail variant: ${variant}. Supported variants: 96, 240, 480`
      });
    }

    // Get document and check ownership
    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      return res.status(404).json({ 
        errorCode: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found'
      });
    }

    // RBAC check
    const canAccess = await canAccessDocument(req.user, documentId, storage);
    if (!canAccess) {
      return res.status(403).json({ 
        errorCode: 'ACCESS_DENIED',
        message: 'Access denied'
      });
    }

    // Check if sourceHash exists
    if (!document.sourceHash) {
      return res.status(400).json({
        errorCode: 'MISSING_SOURCE_HASH',
        message: 'Document missing source hash - cannot generate thumbnails'
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
          ttlSeconds: signedUrlResult.ttlSeconds,
          sourceHash: document.sourceHash
        });

      } catch (urlError: any) {
        console.error('Failed to generate signed URL for existing thumbnail:', urlError);
        // Fall through to enqueue job if URL generation fails
      }
    }

    // Thumbnail doesn't exist - implement THMB-5 on-access warming
    console.log(`📋 [THMB-5] Thumbnail missing for doc ${documentId}, variant ${variant} - implementing on-access warming`);

    const userHousehold = await storage.getUserHousehold(userId);
    
    // THMB-5: On-access warming - check if any variants exist for this {docId, sourceHash}
    const missingVariants = await getMissingThumbnails(documentId, document.sourceHash);
    
    if (missingVariants.length > 0) {
      // First time accessing this document+sourceHash - warm ALL variants
      console.log(`🔥 [THMB-5] On-access warming: enqueueing ALL variants [${missingVariants.join(', ')}] for doc ${documentId}`);
      
      const jobResult = await thumbnailJobQueue.enqueueJob({
        documentId,
        sourceHash: document.sourceHash,
        variants: missingVariants, // Enqueue ALL missing variants at once
        mimeType: document.mimeType,
        userId,
        householdId: userHousehold?.id
      });

      return res.status(202).json({
        status: 'queued',
        documentId,
        variant,
        jobId: jobResult.jobId,
        retryAfterMs: jobResult.retryAfterMs,
        sourceHash: document.sourceHash
      });
    } else {
      // All variants already exist or being processed - this shouldn't happen
      console.log(`⚠️ [THMB-5] Unexpected state: thumbnail reported missing but no variants to warm for doc ${documentId}`);
      
      return res.status(202).json({
        status: 'queued',
        documentId,
        variant,
        retryAfterMs: 2000,
        sourceHash: document.sourceHash
      });
    }

  } catch (error: any) {
    console.error('Error in GET /api/documents/:id/thumbnail:', error);
    res.status(500).json({ 
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal server error'
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
        errorCode: 'INVALID_DOCUMENT_ID',
        message: 'Invalid or missing documentId'
      });
    }

    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ 
        errorCode: 'INVALID_VARIANTS',
        message: 'Variants must be a non-empty array'
      });
    }

    // Validate all variants
    const invalidVariants = variants.filter(v => !isSupportedVariant(v));
    if (invalidVariants.length > 0) {
      return res.status(400).json({ 
        errorCode: 'INVALID_VARIANTS',
        message: `Unsupported variants: ${invalidVariants.join(', ')}. Supported variants: 96, 240, 480`
      });
    }

    const docId = parseInt(documentId);

    // Get document and check ownership
    const document = await storage.getDocument(docId, userId);
    if (!document) {
      return res.status(404).json({ 
        errorCode: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found'
      });
    }

    // RBAC check
    const canAccess = await canAccessDocument(req.user, docId, storage);
    if (!canAccess) {
      return res.status(403).json({ 
        errorCode: 'ACCESS_DENIED',
        message: 'Access denied'
      });
    }

    // Check if sourceHash exists
    if (!document.sourceHash) {
      return res.status(400).json({
        errorCode: 'MISSING_SOURCE_HASH',
        message: 'Document missing source hash - cannot generate thumbnails'
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