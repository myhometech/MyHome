/**
 * Authentication Middleware
 * Provides admin-only route protection for backup management
 */

import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
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
 * Basic authentication check
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  next();
}