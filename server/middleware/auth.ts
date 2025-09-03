/**
 * Authentication Middleware
 * Provides admin-only route protection for backup management
 */

import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
    household?: {
      id: string;
      role: string;
      name?: string;
    };
  };
}

/**
 * Require admin access for sensitive operations
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Check if user is authenticated (this should be set by your auth middleware)
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if user has admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * Basic authentication check with correlation ID support
 */
export function requireAuth(req: AuthenticatedRequest & { cid?: string }, res: Response, next: NextFunction) {
  // Enhanced debugging for auth failures
  const sessionUser = (req as any).session?.user;
  const hasSession = !!(req as any).session;
  const sessionId = (req as any).session?.id;
  
  console.log(`[${req.cid || 'no-cid'}] auth_check:`, {
    hasUser: !!req.user,
    hasSession,
    hasSessionUser: !!sessionUser,
    sessionId: sessionId?.substring(0, 8) + '...',
    userAgent: req.get('User-Agent')?.substring(0, 50),
    cookies: Object.keys(req.cookies || {}),
    path: req.path
  });

  // Check both req.user and session.user (for different auth methods)
  const user = req.user || sessionUser;

  if (!user) {
    console.warn(`[${req.cid || 'no-cid'}] auth_missing_user - session details:`, {
      sessionExists: hasSession,
      sessionUser: sessionUser ? 'present' : 'missing',
      cookieCount: Object.keys(req.cookies || {}).length
    });
    
    return res.status(401).json({ 
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
      cid: req.cid,
      debug: process.env.NODE_ENV === 'development' ? {
        sessionExists: hasSession,
        sessionUser: !!sessionUser
      } : undefined
    });
  }

  // Ensure req.user is set for downstream middleware
  req.user = user;
  next();
}