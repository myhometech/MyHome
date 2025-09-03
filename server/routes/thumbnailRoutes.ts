/**
 * THMB-2: Thumbnail API Routes
 * 
 * Implements async thumbnail generation with job-based processing:
 * - GET /api/documents/:id/thumbnail - Returns existing URL or enqueues job
 * - POST /api/thumbnails - Explicitly requests (re)generation
 * 
 * THMB-EMERGENCY-BYPASS: Includes inline fallback when worker is down
 */

import { Router } from 'express';
import { requireAuth } from '../simpleAuth';
import { canAccessDocument } from '../middleware/roleBasedAccess';
import { storage } from '../storage';
import { thumbnailJobQueue } from '../thumbnailJobQueue';
import { ThumbnailSignedUrlService } from '../thumbnailSignedUrlService';
import { checkThumbnailExists, getMissingThumbnails } from '../thumbnailExistenceMiddleware';
import { isSupportedVariant } from '../thumbnailHelpers';
// THMB-EMERGENCY-BYPASS: Import emergency fallback system
import { inlineFallbackRenderer } from '../thumbnail/inlineFallback';
import { getJobStatusAgeMs, shouldUseInlineFallback } from '../thumbnail/jobHealthCheck';

// REDIS-DOWN-FIX: Add Redis connection check
async function isRedisAvailable(): Promise<boolean> {
  try {
    // Try a simple Redis operation to test connectivity
    await thumbnailJobQueue.getJobStatus('test-connection', 240);
    return true;
  } catch (error: any) {
    // Redis connection failed
    if (error.message?.includes('ECONNREFUSED') || error.code === 'ECONNREFUSED') {
      return false;
    }
    return true; // Other errors might not be Redis connection issues
  }
}

const router = Router();

// THMB-RATE-HOTFIX: Replaced with proper coalescing system

// THMB-RATE-HOTFIX: Import improved rate limiting and coalescing
import { markIfFree, clearMark, isInProgress } from '../thumbnailCoalesce';
import { allow as userRateLimitAllow } from '../thumbnailBucket';
import { getCached, setCached } from '../thumbnailReadCache';

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
    const canAccess = await canAccessDocument(req.user, documentId, 'read');
    if (!canAccess) {
      return res.status(403).json({ 
        errorCode: 'ACCESS_DENIED',
        message: 'Access denied'
      });
    }

    // HOTFIX: Generate fallback sourceHash if missing (critical outage fix)
    let sourceHash = document.sourceHash;
    if (!sourceHash) {
      console.warn(`🚨 HOTFIX: Document ${documentId} missing sourceHash, generating fallback`);
      // Use file path + modificationDate as surrogate hash for consistent key generation
      const crypto = await import('crypto');
      const fallbackInput = `${document.filePath}:${document.uploadedAt || Date.now()}`;
      sourceHash = crypto.createHash('md5').update(fallbackInput).digest('hex').substring(0, 12);
      console.warn(`🚨 HOTFIX: Using fallback sourceHash: ${sourceHash} for doc ${documentId}`);
      
      // TODO: Async backfill real sourceHash in background
    }

    // THMB-RATE-HOTFIX: Check user-scoped soft rate limit
    if (!userRateLimitAllow(userId)) {
      return res.status(202).json({
        status: 'queued',
        documentId,
        variant,
        retryAfterMs: 1500,
        sourceHash: sourceHash,
        message: 'Request queued due to user rate limiting'
      });
    }

    // THMB-UNBLOCK: Check server-side cache first
    const cached = getCached(documentId.toString(), sourceHash, variant);
    if (cached) {
      console.log(`💾 [CACHE] Serving cached URL for doc ${documentId}, variant ${variant}`);
      return res.status(200).json({
        status: 'ready',
        documentId,
        variant,
        url: cached.url,
        ttlSeconds: cached.ttlSeconds,
        sourceHash: sourceHash
      });
    }

    // Check if thumbnail already exists
    const existenceResult = await checkThumbnailExists(
      documentId,
      variant,
      sourceHash
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

        // THMB-UNBLOCK: Cache the signed URL for future requests
        setCached(documentId.toString(), sourceHash, variant, signedUrlResult.url, signedUrlResult.ttlSeconds);

        return res.status(200).json({
          status: 'ready',
          documentId,
          variant,
          url: signedUrlResult.url,
          ttlSeconds: signedUrlResult.ttlSeconds,
          sourceHash: sourceHash
        });

      } catch (urlError: any) {
        console.error('Failed to generate signed URL for existing thumbnail:', urlError);
        // Fall through to enqueue job if URL generation fails
      }
    }

    // REDIS-DOWN-FIX: Check if Redis is available before attempting job queue
    const redisAvailable = await isRedisAvailable();
    
    if (!redisAvailable) {
      console.log(`🚨 [REDIS-DOWN] Redis unavailable, using emergency inline fallback for doc ${documentId}, variant ${variant}`);
      
      // Force inline generation when Redis is down
      if (variant === 240) {
        try {
          const inlineResult = await inlineFallbackRenderer.generate240Now({
            documentId,
            sourceHash: sourceHash,
            mimeType: document.mimeType,
            storagePath: document.filePath,
            userId
          });
          
          console.log(`✅ [REDIS-DOWN] Emergency inline generation successful for doc ${documentId}: ${inlineResult.key}`);
          
          return res.status(200).json({
            status: 'ready',
            documentId,
            variant,
            url: inlineResult.url,
            ttlSeconds: 1800,
            sourceHash: sourceHash,
            emergency: true
          });
        } catch (emergencyError: any) {
          console.error(`❌ [REDIS-DOWN] Emergency inline generation failed for doc ${documentId}:`, emergencyError.message);
          return res.status(503).json({
            errorCode: 'SERVICE_UNAVAILABLE',
            message: 'Thumbnail service temporarily unavailable'
          });
        }
      } else {
        // For non-240px variants, return service unavailable when Redis is down
        return res.status(503).json({
          errorCode: 'SERVICE_UNAVAILABLE', 
          message: 'Thumbnail service temporarily unavailable'
        });
      }
    }

    // Thumbnail doesn't exist - implement THMB-5 on-access warming
    console.log(`📋 [THMB-5] Thumbnail missing for doc ${documentId}, variant ${variant} - implementing on-access warming`);

    const userHousehold = await storage.getUserHousehold(userId);
    
    // THMB-RATE-HOTFIX: Check if job already in progress for this document+sourceHash
    const coalescingKey = `${documentId}:${sourceHash}`;
    if (isInProgress(coalescingKey)) {
      console.log(`📋 [COALESCE] Job already in progress for ${coalescingKey}, returning 202`);
      return res.status(202).json({
        status: 'queued',
        documentId,
        variant,
        retryAfterMs: 1500,
        sourceHash: sourceHash,
        message: 'Generation already in progress'
      });
    }

    // THMB-5: On-access warming - check if any variants exist for this {docId, sourceHash}
    const missingVariants = await getMissingThumbnails(documentId);
    
    if (missingVariants.length > 0) {
      // THMB-RATE-HOTFIX: Only enqueue if not already in progress (coalescing)
      if (markIfFree(coalescingKey)) {
        // THMB-UNBLOCK: Focus on 240px first for stability
        const priorityVariants = missingVariants.includes(240) ? [240] : missingVariants.slice(0, 1);
        console.log(`🔥 [THMB-UNBLOCK] On-access warming: enqueueing priority variants [${priorityVariants.join(', ')}] for doc ${documentId}`);
        
        try {
          const jobResult = await thumbnailJobQueue.enqueueJob({
            documentId,
            sourceHash: sourceHash,
            variants: priorityVariants, // THMB-UNBLOCK: Focus on 240px first
            mimeType: document.mimeType,
            userId,
            householdId: userHousehold?.id
          });

          // THMB-EMERGENCY-BYPASS: Check if worker is down and use inline fallback
          if (variant === 240) { // Only for 240px variant
            const jobAge = await getJobStatusAgeMs(jobResult.jobId).catch(() => null);
            
            if (shouldUseInlineFallback(jobAge)) {
              console.log(`🚨 [EMERGENCY] Worker appears down (job age: ${jobAge}ms), attempting inline 240px generation for doc ${documentId}`);
              
              try {
                const inlineResult = await inlineFallbackRenderer.generate240Now({
                  documentId,
                  sourceHash: sourceHash,
                  mimeType: document.mimeType,
                  storagePath: document.filePath,
                  userId
                });
                
                console.log(`✅ [EMERGENCY] Inline generation successful for doc ${documentId}: ${inlineResult.key}`);
                
                // Clean up coalescing mark immediately since we're returning ready
                clearMark(coalescingKey);
                
                return res.status(200).json({
                  status: 'ready',
                  documentId,
                  variant,
                  url: inlineResult.url,
                  ttlSeconds: 1800,
                  sourceHash: sourceHash,
                  bypass: true
                });
              } catch (bypassError: any) {
                console.warn(`⚠️ [EMERGENCY] Inline fallback failed for doc ${documentId}:`, bypassError.message);
                // Fall through to normal 202 queued response
              }
            }
          }

          // Clean up coalescing mark when job completes (with timeout fallback)
          setTimeout(() => clearMark(coalescingKey), 60000); // 1 minute timeout
          
          // Note: jobResult may not have promise property in all implementations

          return res.status(202).json({
            status: 'queued',
            documentId,
            variant,
            jobId: jobResult.jobId,
            retryAfterMs: 1500,
            sourceHash: sourceHash
          });
        } catch (enqueueError) {
          // Clean up coalescing mark on error
          clearMark(coalescingKey);
          throw enqueueError;
        }
      }
    } else {
      // All variants already exist or being processed - this shouldn't happen
      console.log(`⚠️ [THMB-5] Unexpected state: thumbnail reported missing but no variants to warm for doc ${documentId}`);
      
      return res.status(202).json({
        status: 'queued',
        documentId,
        variant,
        retryAfterMs: 1500,
        sourceHash: sourceHash
      });
    }

  } catch (error: any) {
    console.error('Error in GET /api/documents/:id/thumbnail:', error);
    
    // THMB-RATE-01: Handle potential rate limit errors gracefully
    if (error.message?.includes('Rate limit') || error.status === 429) {
      res.setHeader('Retry-After', '2');
      return res.status(202).json({
        status: 'queued',
        documentId: parseInt(req.params.id),
        variant: parseInt(req.query.variant || '240'),
        retryAfterMs: 1500,
        sourceHash: req.params.sourceHash || 'unknown',
        message: 'Service temporarily overloaded'
      });
    }
    
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
  // THMB-API-STD: Ensure JSON response headers
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  try {
    const { documentId, variants = [96, 240, 480] } = req.body;
    const userId = req.user.id;

    // THMB-RATE-01: Check user rate limit for explicit requests too
    if (!userRateLimitAllow(userId)) {
      return res.status(202).json({
        status: 'queued',
        documentId: parseInt(documentId),
        retryAfterMs: 1500,
        message: 'Request queued due to rate limiting'
      });
    }

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
    const canAccess = await canAccessDocument(req.user, docId, 'read');
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