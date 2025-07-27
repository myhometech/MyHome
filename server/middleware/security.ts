/**
 * Security Middleware Configuration
 * CORE-002: Implement Security Headers and Enhanced Security
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Content Security Policy configuration
const contentSecurityPolicy = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'", // Required for React development
      "'unsafe-eval'", // Required for Vite HMR in development
      "https://js.stripe.com",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com"
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // Required for styled-components and CSS-in-JS
      "https://fonts.googleapis.com",
      "https://cdn.jsdelivr.net"
    ],
    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com",
      "data:"
    ],
    imgSrc: [
      "'self'",
      "data:",
      "blob:",
      "https://storage.googleapis.com",
      "https://*.googleusercontent.com",
      "https://images.unsplash.com"
    ],
    connectSrc: [
      "'self'",
      "https://api.stripe.com",
      "https://api.openai.com",
      "https://api.perplexity.ai",
      "https://storage.googleapis.com",
      "wss://localhost:*", // WebSocket for Vite HMR
      "ws://localhost:*"
    ],
    frameSrc: [
      "'self'",
      "https://js.stripe.com",
      "https://hooks.stripe.com"
    ],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", "blob:", "data:"],
    workerSrc: ["'self'", "blob:"],
    childSrc: ["'self'", "blob:"],
    formAction: ["'self'"],
    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
  }
};

// Helmet security configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? contentSecurityPolicy : false,
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true
  },
  
  // Prevent clickjacking
  frameguard: {
    action: 'deny'
  },
  
  // Prevent MIME type sniffing
  noSniff: true,
  
  // XSS Protection
  xssFilter: true,
  
  // Hide X-Powered-By header
  hidePoweredBy: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  
  // Note: Permissions Policy configuration would go here when supported by helmet
});

// Rate limiting configuration
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Much higher limit in development
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 60
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  
  // Skip rate limiting for health checks and development assets
  skip: (req: Request) => {
    const path = req.path;
    return (
      path === '/api/health' || 
      path === '/health' ||
      path.startsWith('/@vite/') ||
      path.startsWith('/src/') ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.endsWith('.ts') ||
      path.endsWith('.tsx') ||
      (process.env.NODE_ENV === 'development' && (
        path.startsWith('/api/auth/user') ||
        path.startsWith('/api/documents') ||
        path.startsWith('/api/categories') ||
        path.startsWith('/api/feature-flags')
      ))
    );
  },
  
  // Custom handler for rate limit exceeded
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: 60
    });
  }
});

// Enhanced CORS configuration
export const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allowed origins list
    const allowedOrigins = [
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:3000',
      'https://myhome.replit.app',
      'https://myhome-tech.com',
      'https://www.myhome-tech.com',
      'https://app.myhome-tech.com',
      // Replit development URLs
      /https:\/\/.*\.replit\.dev$/,
      process.env.REPLIT_DOMAINS?.split(',') || []
    ].flat().filter(Boolean);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin matches any allowed origin (string or regex)
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return allowedOrigin === origin;
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-CSRF-Token'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

// Security logging middleware
export const securityLogger = (req: Request, res: Response, next: NextFunction) => {
  // Log potential security issues
  const suspiciousPatterns = [
    /\.\.\//,  // Path traversal
    /<script>/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // JavaScript protocol
    /data:.*base64/i  // Data URI with base64 (potential malicious content)
  ];
  
  const userAgent = req.get('User-Agent') || '';
  const referer = req.get('Referer') || '';
  const url = req.url;
  
  // Check for suspicious patterns in URL, User-Agent, and Referer
  const suspicious = suspiciousPatterns.some(pattern => 
    pattern.test(url) || pattern.test(userAgent) || pattern.test(referer)
  );
  
  if (suspicious) {
    console.warn(`🚨 Suspicious request detected:`, {
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent,
      referer,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};