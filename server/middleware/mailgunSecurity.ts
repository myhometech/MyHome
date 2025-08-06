import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyMailgunSignature, parseMailgunWebhook } from '../mailgunService';

// Mailgun IP ranges (official Mailgun IP blocks)
const MAILGUN_IP_RANGES = [
  '3.19.228.0/22',
  '34.198.203.127/32', 
  '34.198.178.64/26',
  '52.35.106.123/32',
  '69.72.32.0/21',
  '173.45.18.0/26',
  '173.45.19.0/26'
];

/**
 * Parse IP range in CIDR notation and check if IP falls within range
 */
function isIpInRange(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  
  return (ip2long(ip) & mask) === (ip2long(range) & mask);
}

function ip2long(ip: string): number {
  return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct), 0) >>> 0;
}

/**
 * Check if IP address is from Mailgun's official IP ranges
 */
function isMailgunIP(ip: string): boolean {
  // Handle IPv4-mapped IPv6 addresses (common in Node.js)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  // Check against all Mailgun IP ranges
  return MAILGUN_IP_RANGES.some(range => isIpInRange(ip, range));
}

/**
 * Mailgun IP Whitelisting Middleware
 * Only allows requests from official Mailgun IP ranges
 */
export function mailgunIPWhitelist(req: Request, res: Response, next: NextFunction) {
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  
  // Log all incoming requests for monitoring
  console.log(`📧 Mailgun webhook request from IP: ${clientIP}`);
  
  // Skip IP validation in development mode for testing
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️ DEVELOPMENT MODE: Skipping Mailgun IP whitelist validation');
    return next();
  }
  
  if (!isMailgunIP(clientIP)) {
    console.warn(`🚫 REJECTED: Non-Mailgun IP attempted webhook access: ${clientIP}`);
    
    // Enhanced logging for security monitoring
    console.log(`🔒 SECURITY: Mailgun IP whitelist violation`, {
      rejectedIP: clientIP,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({ 
      error: 'Access forbidden',
      message: 'Requests only allowed from authorized Mailgun IP ranges'
    });
  }
  
  console.log(`✅ IP validation passed: ${clientIP} is from Mailgun`);
  next();
}

/**
 * Mailgun Signature Verification Middleware
 * Verifies HMAC signature to ensure request authenticity
 */
export function mailgunSignatureVerification(req: Request, res: Response, next: NextFunction) {
  try {
    // Parse webhook data first to extract signature fields
    const webhookData = parseMailgunWebhook(req);
    
    if (!webhookData.isValid) {
      console.warn('🚫 REJECTED: Invalid webhook data during signature verification', {
        error: webhookData.error,
        clientIP: req.ip
      });
      
      return res.status(400).json({
        error: 'Invalid webhook data',
        message: webhookData.error || 'Failed to parse webhook data for signature verification'
      });
    }

    const { message } = webhookData;
    const { timestamp, token, signature } = message;
    const signingKey = process.env.MAILGUN_SIGNING_KEY || process.env.MAILGUN_API_KEY;
    
    // Skip signature verification in development if no key is provided
    if (process.env.NODE_ENV === 'development' && !signingKey) {
      console.log('⚠️ DEVELOPMENT MODE: No MAILGUN_SIGNING_KEY configured, skipping signature verification');
      return next();
    }
    
    if (!signingKey) {
      console.error('❌ MAILGUN_SIGNING_KEY not configured - signature verification required');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'Mailgun signing key not configured'
      });
    }
    
    if (!timestamp || !token || !signature) {
      console.warn('🚫 REJECTED: Missing required signature fields', {
        hasTimestamp: !!timestamp,
        hasToken: !!token,
        hasSignature: !!signature,
        clientIP: req.ip
      });
      
      return res.status(400).json({
        error: 'Invalid webhook data',
        message: 'Missing required signature fields: timestamp, token, or signature'
      });
    }
    
    const isValidSignature = verifyMailgunSignature(timestamp, token, signature, signingKey);
    
    if (!isValidSignature) {
      console.warn('🚫 REJECTED: Invalid Mailgun signature', {
        timestamp,
        tokenPreview: token?.substring(0, 8) + '...',
        signatureLength: signature?.length || 0,
        clientIP: req.ip
      });
      
      return res.status(401).json({ 
        error: 'Invalid signature',
        message: 'Request authentication failed - signature verification failed'
      });
    }
    
    console.log('✅ Mailgun signature verification successful');
    next();
  } catch (error) {
    console.error('❌ Error during signature verification:', error);
    return res.status(500).json({
      error: 'Signature verification error',
      message: 'Failed to verify request signature'
    });
  }
}

/**
 * Custom rate limiter for Mailgun webhook endpoints
 * More permissive than standard API endpoints but still protective
 */
export const mailgunWebhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 60, // 60 requests per minute per IP (generous for email processing)
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded for webhook endpoint. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn('🚫 RATE LIMIT: Mailgun webhook rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      timestamp: new Date().toISOString()
    });
    
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded for webhook endpoint. Please try again later.'
    });
  },
  // Skip rate limiting in development
  skip: (req) => process.env.NODE_ENV === 'development'
});

/**
 * Enhanced logging middleware specifically for Mailgun webhooks
 */
export function mailgunWebhookLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Log incoming webhook details
  console.log('📧 MAILGUN WEBHOOK RECEIVED', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path
  });
  
  // Log response when complete
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log('📧 MAILGUN WEBHOOK COMPLETED', {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      success: res.statusCode >= 200 && res.statusCode < 300
    });
  });
  
  next();
}

/**
 * Content-Type validation for Mailgun webhooks
 * Ensures request contains multipart/form-data as expected
 */
export function validateMailgunContentType(req: Request, res: Response, next: NextFunction) {
  const contentType = req.get('Content-Type');
  
  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    console.warn('🚫 REJECTED: Invalid Content-Type for Mailgun webhook', {
      contentType,
      ip: req.ip
    });
    
    return res.status(400).json({
      error: 'Invalid Content-Type',
      message: 'Expected multipart/form-data for webhook requests',
      received: contentType || 'none'
    });
  }
  
  next();
}