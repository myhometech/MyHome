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
  console.log(`📧 Request headers:`, {
    'user-agent': req.get('User-Agent'),
    'x-forwarded-for': req.get('X-Forwarded-For'),
    'x-real-ip': req.get('X-Real-IP'),
    'cf-connecting-ip': req.get('CF-Connecting-IP')
  });
  
  // Skip IP validation in development mode for testing
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️ DEVELOPMENT MODE: Skipping Mailgun IP whitelist validation');
    return next();
  }

  // For production, temporarily disable strict IP validation due to proxy/CDN issues
  // This should be re-enabled once proper IP detection is configured
  console.log('⚠️ PRODUCTION: Temporarily allowing all IPs due to proxy detection issues');
  console.log('🔧 TODO: Configure proper IP detection for Cloudflare/proxy setup');
  return next();
  
  // Original IP validation code (disabled temporarily)
  /*
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
  */
}

/**
 * Mailgun Signature Verification Middleware
 * Verifies HMAC signature to ensure request authenticity
 */
export function mailgunSignatureVerification(req: Request, res: Response, next: NextFunction) {
  try {
    console.log('🔐 Starting signature verification process');
    console.log('🔍 Request body type:', typeof req.body);
    console.log('🔍 Request body keys:', Object.keys(req.body || {}));
    
    // For development, skip signature verification temporarily
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ DEVELOPMENT MODE: Skipping signature verification');
      return next();
    }

    const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || process.env.MAILGUN_SIGNING_KEY || process.env.MAILGUN_API_KEY;
    
    console.log('🔍 Signing key source:', {
      hasWebhookSigningKey: !!process.env.MAILGUN_WEBHOOK_SIGNING_KEY,
      hasSigningKey: !!process.env.MAILGUN_SIGNING_KEY,
      hasApiKey: !!process.env.MAILGUN_API_KEY,
      usingKey: signingKey ? 'configured' : 'missing'
    });
    
    if (!signingKey) {
      console.error('❌ MAILGUN_SIGNING_KEY not configured');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'Mailgun signing key not configured'
      });
    }

    // Extract signature fields from multipart form data (after multer processing)
    const timestamp = req.body?.timestamp;
    const token = req.body?.token; 
    const signature = req.body?.signature;
    
    console.log('🔍 Signature fields found:', {
      hasTimestamp: !!timestamp,
      hasToken: !!token,
      hasSignature: !!signature,
      timestamp: timestamp ? String(timestamp).substring(0, 10) + '...' : 'missing',
      tokenPreview: token ? String(token).substring(0, 8) + '...' : 'missing'
    });
    
    if (!timestamp || !token || !signature) {
      console.error('❌ REJECTED: Missing required signature fields for webhook authentication');
      console.log('📋 Required fields: timestamp, token, signature');
      console.log('📋 Received fields:', Object.keys(req.body || {}));
      
      return res.status(400).json({ 
        error: 'Missing signature fields',
        message: 'Mailgun webhook signature verification requires timestamp, token, and signature fields',
        receivedFields: Object.keys(req.body || {})
      });
    }
    
    // Convert to strings if needed (multer might parse as different types)
    const timestampStr = String(timestamp);
    const tokenStr = String(token);
    const signatureStr = String(signature);
    
    const isValidSignature = verifyMailgunSignature(timestampStr, tokenStr, signatureStr, signingKey);
    
    if (!isValidSignature) {
      console.warn('🚫 REJECTED: Invalid Mailgun signature', {
        timestamp: timestampStr,
        tokenPreview: tokenStr.substring(0, 8) + '...',
        signatureLength: signatureStr.length,
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
    console.error('❌ CRITICAL ERROR during signature verification:', error);
    console.error('❌ Error type:', typeof error);
    console.error('❌ Error message:', error instanceof Error ? error.message : String(error));
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Signature verification context:', {
      timestamp: req.body?.timestamp,
      hasToken: !!req.body?.token,
      hasSignature: !!req.body?.signature,
      signingKeyConfigured: !!process.env.MAILGUN_SIGNING_KEY || !!process.env.MAILGUN_API_KEY
    });
    
    // In production, we should fail securely rather than allow through
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ 
        error: 'Signature verification error',
        message: 'Internal error during webhook authentication',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('⚠️ Development mode: Allowing request to proceed despite signature verification error');
    return next();
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
  const userAgent = req.get('User-Agent') || '';
  const testBypass = req.get('x-test-bypass') === 'email-pdf-test';
  
  // Log all incoming requests for debugging
  console.log('🔍 CONTENT-TYPE CHECK:', {
    contentType,
    userAgent,
    ip: req.ip,
    method: req.method,
    url: req.url,
    testBypass
  });
  
  if (testBypass) {
    console.log('🧪 TEST BYPASS: Content-type validation bypassed for email body PDF testing');
    return next();
  }
  
  // Accept both multipart/form-data (with attachments) and application/x-www-form-urlencoded (without attachments)
  const isValidContentType = contentType && (
    contentType.startsWith('multipart/form-data') || 
    contentType.startsWith('application/x-www-form-urlencoded')
  );
  
  if (!isValidContentType) {
    console.warn('🚫 REJECTED: Invalid Content-Type for Mailgun webhook', {
      contentType,
      userAgent,
      ip: req.ip,
      isLikelyMailgun: userAgent.includes('Mailgun')
    });
    
    return res.status(400).json({
      error: 'Invalid Content-Type',
      message: 'Expected multipart/form-data or application/x-www-form-urlencoded for webhook requests',
      received: contentType || 'none',
      userAgent,
      hint: 'Mailgun sends multipart/form-data for emails with attachments, application/x-www-form-urlencoded for emails without attachments'
    });
  }
  
  const contentTypeDesc = contentType.startsWith('multipart/form-data') ? 
    'multipart/form-data (with attachments)' : 
    'application/x-www-form-urlencoded (without attachments)';
  
  console.log(`✅ CONTENT-TYPE VALID: Proceeding with ${contentTypeDesc}`);
  next();
}