import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../simpleAuth.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * Generate JWT-signed token for Canny SSO
 * POST /api/canny-token
 */
router.post('/canny-token', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // JWT secret for Canny tokens (should be different from session secret)
    const jwtSecret = process.env.CANNY_JWT_SECRET || process.env.SESSION_SECRET;
    
    if (!jwtSecret) {
      console.error('CANNY_JWT_SECRET or SESSION_SECRET not configured');
      return res.status(500).json({ error: 'JWT configuration missing' });
    }

    // Create JWT payload with user data for Canny
    const payload = {
      id: user.id?.toString() || '',
      email: user.email || '',
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User',
      // Add additional user metadata for Canny analytics
      created: user.createdAt || new Date().toISOString(),
      role: user.role || 'user',
      // Add timestamp for token tracking
      iat: Math.floor(Date.now() / 1000),
    };

    // Sign short-lived JWT (15 minutes expiry)
    const token = jwt.sign(payload, jwtSecret, {
      expiresIn: '15m',
      issuer: 'myhome-app',
      audience: 'canny.io',
      subject: user.id?.toString() || '',
    });

    // Return token for frontend use
    res.json({
      token,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user.id || '',
        email: user.email || '',
        name: payload.name,
      }
    });

  } catch (error) {
    console.error('Error generating Canny JWT token:', error);
    res.status(500).json({ error: 'Failed to generate authentication token' });
  }
});

/**
 * Verify Canny JWT token (for debugging/testing)
 * POST /api/canny-token/verify
 */
router.post('/canny-token/verify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body as { token?: string };
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const jwtSecret = process.env.CANNY_JWT_SECRET || process.env.SESSION_SECRET;
    
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT configuration missing' });
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret, {
      issuer: 'myhome-app',
      audience: 'canny.io',
    });

    res.json({
      valid: true,
      payload: decoded,
      message: 'Token is valid'
    });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(400).json({ 
        valid: false,
        error: 'Invalid token',
        details: error.message 
      });
    }
    
    console.error('Error verifying Canny JWT token:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

export default router;