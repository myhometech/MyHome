/**
 * THMB-UNBLOCK: Route-level rate limiter exemption
 * Converts 429s to 202s for thumbnail read endpoints
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to mark thumbnail routes for special rate limit handling
 */
export function thumbnailRateAdapter(req: Request, res: Response, next: NextFunction) {
  // Mark thumbnail GET requests for exemption from generic 429s
  res.locals.isThumbnailRoute = 
    req.method === 'GET' && 
    /^\/api\/documents\/[^/]+\/thumbnail$/.test(req.path);
    
  if (res.locals.isThumbnailRoute) {
    console.log(`🔧 [RATE-ADAPTER] Marking ${req.path} for 429→202 conversion`);
  }
  
  next();
}

/**
 * Error handler that converts 429s to 202s for thumbnail routes
 */
export function thumbnailRateErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Convert rate limit errors to queued responses for thumbnail routes
  if (err.status === 429 && res.locals.isThumbnailRoute) {
    console.log(`🔄 [RATE-ADAPTER] Converting 429→202 for ${req.path}`);
    
    return res.status(202).json({ 
      status: 'queued', 
      documentId: req.params.id,
      variant: req.query.variant || 240,
      retryAfterMs: 1500,
      message: 'Request queued due to rate limiting'
    });
  }
  
  // Pass through other errors
  next(err);
}