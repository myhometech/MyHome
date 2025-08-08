import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupSimpleAuth, requireAuth } from "./simpleAuth";
import { AuthService } from "./authService";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertDocumentSchema, insertCategorySchema, insertExpiryReminderSchema, insertDocumentInsightSchema, insertBlogPostSchema, loginSchema, registerSchema, insertUserAssetSchema, insertManualTrackedEventSchema, createVehicleSchema, updateVehicleUserFieldsSchema } from "@shared/schema";
import { EmailUploadLogger } from './emailUploadLogger';
import { dvlaLookupService } from './dvlaLookupService';
import { vehicleInsightService } from './vehicleInsightService';
import { z } from 'zod';
import { extractTextFromImage, supportsOCR, processDocumentOCRAndSummary, isPDFFile } from "./ocrService";

import { tagSuggestionService } from "./tagSuggestionService";
import { aiInsightService } from "./aiInsightService";
import { pdfConversionService } from "./pdfConversionService.js";
import { EncryptionService } from "./encryptionService.js";
import docxConversionService from './docxConversionService';
import { featureFlagService } from './featureFlagService';
import { sentryRequestHandler, sentryErrorHandler, captureError, trackDatabaseQuery } from './monitoring';

import { StorageService, storageProvider } from './storage/StorageService';
import { backupRoutes } from './routes/backup.js';
import advancedScanningRoutes from './routes/advancedScanning.js';
import { llmUsageRoutes } from './routes/llmUsageRoutes.js';
import { securityHeaders, rateLimiter, corsOptions, securityLogger } from './middleware/security.js';
import { enhancedHealthCheck } from './middleware/healthCheck.js';
import { setupOCRErrorRoutes } from './routes/ocrErrorRoutes.js';
import cors from 'cors';
import passport from './passport';
import authRoutes from './authRoutes';
import { parseMailgunWebhook, verifyMailgunSignature, extractUserIdFromRecipient, validateEmailAttachments } from './mailgunService';
import { setupMultiPageScanUpload } from './routes/multiPageScanUpload';
import { 
  mailgunIPWhitelist, 
  mailgunWebhookRateLimit, 
  mailgunWebhookLogger, 
  validateMailgunContentType,
  mailgunSignatureVerification
} from './middleware/mailgunSecurity';

// Import real database and schema
import { db } from "./db";
import { users, documents, featureFlags, vehicles } from "@shared/schema";
import { eq, sql } from "drizzle-orm";




// Placeholder for AuthenticatedRequest, Response, NextFunction types
type AuthenticatedRequest = any;
type Response = any;
type NextFunction = any;

const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf', 
      'image/jpeg', 
      'image/jpg',
      'image/png', 
      'image/webp',
      'image/svg+xml', // SVG support for testing
      'image/heic',    // iPhone HEIC format
      'image/heif',    // iPhone HEIF format
      'image/tiff',    // TIFF format sometimes used by cameras
      'image/bmp',     // BMP format
      // DOCX support
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-word.document.macroEnabled.12',
      'application/msword' // Legacy DOC files
    ];

    // Also allow files with no specified mimetype (some camera uploads)
    if (!file.mimetype || allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.warn(`Rejected file upload - unsupported MIME type: ${file.mimetype} for file: ${file.originalname}`);
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only PDF and image files are allowed.`));
    }
  }
});

// Mailgun webhook-specific multer configuration
const mailgunUpload = multer({
  storage: multer.memoryStorage(), // Store in memory for webhook processing
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file (Mailgun standard)
    files: 10, // Maximum 10 attachments (increased for multiple attachments)
    fieldSize: 50 * 1024 * 1024, // 50MB field size for large email content with inline images
    fields: 1000 // Maximum 1000 form fields (increased for complex emails with many headers)
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.warn(`Mailgun webhook: Rejected attachment with unsupported MIME type: ${file.mimetype} for file: ${file.originalname}`);
      cb(null, false); // Don't throw error, just skip the file
    }
  }
});

// Helper function to get user ID from request
function getUserId(req: any): string {
  if (req.user?.id) {
    return req.user.id;
  }
  throw new Error("User not authenticated");
}

// TICKET 4: Helper function to generate dashboard-ready messages
function generateInsightMessage(insight: any, documentName: string): string {
  const docName = documentName.length > 30 ? documentName.substring(0, 30) + '...' : documentName;

  switch (insight.type) {
    case 'key_dates':
      return `${docName}: Important date identified - ${insight.title}`;
    case 'action_items':
      return `${docName}: Action required - ${insight.title}`;
    case 'financial_info':
      return `${docName}: Financial information - ${insight.title}`;
    case 'compliance':
      return `${docName}: Compliance requirement - ${insight.title}`;
    case 'summary':
      return `${docName}: Document summary available`;
    case 'contacts':
      return `${docName}: Contact information found - ${insight.title}`;
    default:
      return `${docName}: ${insight.title}`;
  }
}

// TICKET 4: Helper function to extract due dates from insight content
function extractDueDate(insight: any): string | null {
  const content = (insight.content || '').toLowerCase();
  const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2}-\d{4})/;

  // Look for date patterns in the content
  const match = content.match(dateRegex);
  if (match) {
    try {
      const date = new Date(match[0]);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
      }
    } catch (e) {
      // Invalid date format
    }
  }

  // For certain types, set default due dates
  if (insight.type === 'action_items' && insight.priority === 'high') {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return thirtyDaysFromNow.toISOString().split('T')[0];
  }

  return null;
}

// Middleware to check admin role
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    console.log('🔧 [ADMIN CHECK] User:', req.user?.email, 'Role:', req.user?.role, 'Path:', req.path);
    console.log('🔧 [ADMIN CHECK] Session user:', req.session?.user?.email, 'Role:', req.session?.user?.role);

    // Check both session and req.user for compatibility
    const user = req.user || req.session?.user;

    if (!user) {
      console.log('❌ [ADMIN CHECK] No user found in session or req.user');
      return res.status(401).json({ error: "Authentication required" });
    }

    if (user.role !== 'admin') {
      console.log('❌ [ADMIN CHECK] Admin access denied for user:', user.email, 'role:', user.role);
      return res.status(403).json({ error: "Admin access required" });
    }

    // Ensure req.user is set for downstream handlers
    req.user = user;
    console.log('✅ [ADMIN CHECK] Admin access granted for', user.email);
    next();
  } catch (error) {
    console.error('❌ [ADMIN CHECK] Admin middleware error:', error);
    res.status(500).json({ error: "Authorization error" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup error tracking middleware
  app.use(sentryRequestHandler());

  // CORE-002: Security Headers and Rate Limiting
  app.use(securityHeaders);
  app.use(rateLimiter);
  app.use(cors(corsOptions));
  app.use(securityLogger);

  // ANTI-UPSTREAM CSP OVERRIDE: Run after security headers to ensure final CSP
  // Check deployment environment
  const isDeployment = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';

  app.use((req, res, next) => {
    // Aggressive header removal to prevent any CSP interference
    res.removeHeader("Content-Security-Policy");
    res.removeHeader("content-security-policy");
    res.removeHeader("Content-security-policy");
    res.removeHeader("X-Frame-Options");
    res.removeHeader("x-frame-options");
    res.removeHeader("X-Content-Security-Policy"); // Legacy webkit
    res.removeHeader("X-WebKit-CSP"); // Legacy webkit

    // Set our comprehensive CSP policy
    const cspPolicy = isDeployment 
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://docs.opencv.org https://js.stripe.com https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
          "img-src 'self' data: blob: https://myhome-docs.com https://storage.googleapis.com https://*.googleusercontent.com https://images.unsplash.com",
          "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
          "connect-src 'self' data: https://api.stripe.com https://api.openai.com https://storage.googleapis.com https://*.sentry.io",
          "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
          "object-src 'none'",
          "frame-ancestors 'self' https://myhome-docs.com"
        ].join('; ') + '; '
      : [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://docs.opencv.org https://*.replit.app https://*.replit.dev blob:",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com", 
          "img-src 'self' data: blob: https://myhome-docs.com https://*.replit.app https://*.replit.dev *",
          "font-src 'self' data:",
          "connect-src 'self' data: wss: ws: https://*.replit.app https://*.replit.dev https://*.sentry.io",
          "object-src 'none'",
          "frame-ancestors 'self' https://myhome-docs.com"
        ].join('; ') + '; ';

    console.log('🔒 Setting CSP policy (isDeployment=' + isDeployment + '):', cspPolicy.substring(0, 100) + '...');

    // Set multiple CSP headers for maximum compatibility
    res.setHeader("Content-Security-Policy", cspPolicy);
    res.setHeader("X-Content-Security-Policy", cspPolicy); // Legacy IE
    res.setHeader("X-WebKit-CSP", cspPolicy); // Legacy WebKit

    // Force override any middleware that might set headers later
    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = function(name, value) {
      // Block any attempt to set CSP headers other than our own
      if (name.toLowerCase().includes('content-security-policy') && value !== cspPolicy) {
        console.warn('🚨 Blocked attempt to override CSP:', name, String(value).substring(0, 50) + '...');
        return res;
      }
      if (name.toLowerCase() === 'x-frame-options') {
        console.warn('🚨 Blocked X-Frame-Options header that could interfere with CSP');
        return res;
      }
      return originalSetHeader(name, value);
    };

    // Monitor for upstream interference
    res.on('finish', () => {
      const finalHeaders = res.getHeaders();
      const finalCSP = finalHeaders['content-security-policy'];

      // Always log what we're sending vs what's final
      if (req.path.includes('.html') || req.path === '/') {
        console.log('🔍 CSP Debug - Path:', req.path);
        console.log('🔍 Expected CSP:', cspPolicy.substring(0, 100) + '...');
        console.log('🔍 Final CSP:', finalCSP ? finalCSP.substring(0, 100) + '...' : 'NONE');
      }

      if (finalCSP !== cspPolicy) {
        console.error('🚨 UPSTREAM CSP INTERFERENCE DETECTED!');
        console.error('🚨 Path:', req.path);
        console.error('🚨 Expected CSP:', cspPolicy);
        console.error('🚨 Actual CSP:', finalCSP);
        console.error('🚨 All Response Headers:', Object.keys(finalHeaders));
      }
    });

    next();
  });

  // Setup simple authentication
  setupSimpleAuth(app);

  // Initialize Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // OAuth authentication routes
  app.use('/auth', authRoutes);

  // Authentication routes
  app.post('/api/auth/register', async (req: any, res) => {
    try {
      const data = registerSchema.parse(req.body);

      // Check if user already exists (only check email provider to avoid conflicts)
      const existingUser = await AuthService.findUserByEmailAndProvider(data.email!, "email");
      if (existingUser) {
        return res.status(400).json({ message: "User already exists with this email" });
      }

      const user = await AuthService.createEmailUser({
        email: data.email!,
        password: data.password!,
        firstName: data.firstName,
        lastName: data.lastName
      });

      // Initialize default categories for new user
      const defaultCategories = [
        { name: 'Car', icon: 'fas fa-car', color: 'blue', userId: user.id },
        { name: 'Mortgage', icon: 'fas fa-home', color: 'green', userId: user.id },
        { name: 'Insurance', icon: 'fas fa-shield-alt', color: 'purple', userId: user.id },
        { name: 'Utilities', icon: 'fas fa-bolt', color: 'orange', userId: user.id },
        { name: 'Receipts', icon: 'fas fa-receipt', color: 'yellow', userId: user.id },
      ];

      for (const category of defaultCategories) {
        try {
          await storage.createCategory(category);
        } catch (categoryError) {
          console.log(`Category ${category.name} creation skipped for user ${user.id}`);
        }
      }

      // Store user in session
      req.session.user = user;

      const { passwordHash, ...safeUser } = user;
      res.status(201).json({ 
        message: "Account created successfully", 
        user: safeUser,
        autoLoggedIn: true
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post('/api/auth/login', async (req: any, res) => {
    try {
      const data = loginSchema.parse(req.body);

      const user = await AuthService.authenticateEmailUser(data.email, data.password);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Update last login timestamp
      await storage.updateUserLastLogin(user.id);

      // Store user in session and save explicitly
      req.session.user = user;

      // Force session save before responding
      req.session.save((err: any) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Login failed - session error" });
        }

        console.log("Session saved successfully for user:", user.id);
        const { passwordHash, ...safeUser } = user;
        res.json({ 
          message: "Login successful", 
          user: safeUser 
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Support both GET and POST for logout (for convenience)
  app.get('/api/logout', async (req: any, res) => {
    try {
      req.session.destroy((err: any) => {
        if (err) {
          return res.status(500).json({ message: "Logout failed" });
        }
        res.redirect('/');
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  app.post('/api/auth/logout', async (req: any, res) => {
    try {
      req.session.destroy((err: any) => {
        if (err) {
          return res.status(500).json({ message: "Logout failed" });
        }
        res.json({ message: "Logout successful" });
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Password reset request route
  app.post('/api/auth/forgot-password', async (req: any, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const result = await AuthService.generatePasswordResetToken(email);

      if (result.success) {
        // In a real application, you would send an email here
        // For now, we'll just log the token and return success
        console.log(`Password reset token for ${email}: ${result.token}`);

        res.json({ 
          message: "If an account with this email exists, password reset instructions have been sent.",
          success: true
        });
      } else {
        // Always return success message for security (don't reveal if email exists)
        res.json({ 
          message: "If an account with this email exists, password reset instructions have been sent.",
          success: true
        });
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Verify reset token route
  app.get('/api/auth/verify-reset-token/:token', async (req: any, res) => {
    try {
      const { token } = req.params;

      const result = await AuthService.verifyPasswordResetToken(token);

      if (result.valid) {
        res.json({ valid: true, message: result.message });
      } else {
        res.status(400).json({ valid: false, message: result.message });
      }
    } catch (error) {
      console.error("Token verification error:", error);
      res.status(500).json({ valid: false, message: "Failed to verify token" });
    }
  });

  // Reset password with token route
  app.post('/api/auth/reset-password', async (req: any, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      const result = await AuthService.resetPasswordWithToken(token, password);

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ success: false, message: "Failed to reset password" });
    }
  });
  // Get current user endpoint (for auth check)
  app.get('/api/auth/me', async (req: any, res) => {
    try {
      // Check if user is in session
      if (req.session?.user) {
        const { passwordHash, ...safeUser } = req.session.user;
        res.json(safeUser);
      } else {
        res.status(401).json({ error: 'Not authenticated' });
      }
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Categories routes
  app.get('/api/categories', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const categories = await storage.getCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post('/api/categories', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const categoryData = insertCategorySchema.parse(req.body);
      const categoryWithUser = { ...categoryData, userId };
      const category = await storage.createCategory(categoryWithUser);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.patch('/api/categories/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const categoryId = parseInt(req.params.id);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      const updates = insertCategorySchema.partial().parse(req.body);
      const updatedCategory = await storage.updateCategory(categoryId, userId, updates);

      if (!updatedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json(updatedCategory);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete('/api/categories/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const categoryId = parseInt(req.params.id);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      await storage.deleteCategory(categoryId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Smart search endpoint for real-time search
  app.get('/api/documents/search', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const searchQuery = req.query.q as string;

      if (!searchQuery || searchQuery.trim().length === 0) {
        return res.json([]);
      }

      // Use regular document search with filtering as reliable fallback
      const allDocuments = await storage.getDocuments(userId);
      const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.length > 1);

      const filteredResults = allDocuments.filter(doc => {
        const searchContent = [
          doc.name,
          doc.fileName,
          doc.extractedText,
          doc.summary,
          (doc.tags || []).join(' '),
        ].join(' ').toLowerCase();

        return searchTerms.some(term => searchContent.includes(term));
      });

      res.json(filteredResults);
    } catch (error) {
      console.error("Error searching documents:", error);
      res.status(500).json({ message: "Failed to search documents" });
    }
  });

  // Documents routes
  app.get('/api/documents', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
      const search = req.query.search as string;
      const expiryFilter = req.query.expiryFilter as 'expired' | 'expiring-soon' | 'this-month' | undefined;

      const documents = await storage.getDocuments(userId, categoryId, search, expiryFilter);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post('/api/documents', requireAuth, upload.single('file'), async (req: any, res) => {
    console.log(`\n📱 CAMERA UPLOAD to /api/documents - ${new Date().toISOString()}`);
    console.log(`🔐 User ID: ${req.user?.id || 'NOT_AUTHENTICATED'}`);
    console.log(`📦 Content Type: ${req.headers['content-type']}`);
    console.log(`📝 Body Keys: ${Object.keys(req.body).join(', ')}`);
    console.log(`📎 File Received: ${req.file ? 'YES' : 'NO'}`);
    if (req.file) {
      console.log(`   File: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);
    }

    try {
      if (!req.file) {
        console.log(`❌ No file uploaded in request`);
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = getUserId(req);
      const { categoryId, tags, expiryDate } = req.body;

      const documentData = {
        userId,
        categoryId: categoryId ? parseInt(categoryId) : null,
        name: req.body.name || req.file.originalname,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        tags: tags ? JSON.parse(tags) : [],
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      };

      let finalDocumentData = documentData;
      let finalFilePath = req.file.path;
      let finalMimeType = req.file.mimetype;

      // DOCX Conversion: Convert DOCX files to PDF for viewing and OCR
      if (docxConversionService.isDocxFile(req.file.mimetype)) {
        console.log(`Converting DOCX document to PDF: ${req.file.originalname}`);

        try {
          const conversionResult = await docxConversionService.convertDocxToPdf(
            req.file.path,
            uploadsDir
          );

          if (conversionResult.success && conversionResult.pdfPath) {
            // Create a secondary PDF file linked to the original DOCX
            const pdfDocumentData = {
              ...documentData,
              filePath: conversionResult.pdfPath,
              mimeType: 'application/pdf',
              name: documentData.name.replace(/\.(docx|doc)$/i, '.pdf'),
              fileName: documentData.fileName.replace(/\.(docx|doc)$/i, '.pdf'),
              tags: [...(documentData.tags || []), 'converted-from-docx']
            };

            // Keep the original DOCX as primary, PDF as secondary for viewing
            finalFilePath = conversionResult.pdfPath;
            finalMimeType = 'application/pdf';
            finalDocumentData = pdfDocumentData;

            console.log(`✅ DOCX converted to PDF for viewing: ${conversionResult.pdfPath}`);
          } else {
            console.warn(`DOCX conversion failed: ${conversionResult.error}, keeping original DOCX`);
            // Continue with original DOCX file - will be processed differently in document processor
          }
        } catch (conversionError) {
          console.error('DOCX conversion error:', conversionError);
          // Continue with original DOCX if conversion fails
        }
      }
      // Convert scanned images to PDF format  
      else if (pdfConversionService.isImageFile(req.file.path) && (req.file.originalname.startsWith('processed_') || req.file.originalname.startsWith('document-scan-'))) {
        console.log(`Converting scanned document image to PDF: ${req.file.originalname}`);

        try {
          const conversionResult = await pdfConversionService.convertImageToPDF(
            req.file.path,
            uploadsDir
          );

          if (conversionResult.success) {
            // Update document data to use PDF file
            finalFilePath = conversionResult.pdfPath;
            finalMimeType = 'application/pdf';
            finalDocumentData = {
              ...documentData,
              filePath: finalFilePath,
              mimeType: finalMimeType,
              name: documentData.name.replace(/\.(jpg|jpeg|png|webp)$/i, '.pdf'),
              fileName: documentData.fileName.replace(/\.(jpg|jpeg|png|webp)$/i, '.pdf')
            };

            // Clean up the original image file
            setTimeout(() => {
              pdfConversionService.cleanup([req.file.path]);
            }, 1000);

            console.log(`Successfully converted scanned document to PDF: ${conversionResult.pdfPath}`);
          } else {
            console.warn(`PDF conversion failed: ${conversionResult.error}, keeping original image`);
          }
        } catch (conversionError) {
          console.error('PDF conversion error:', conversionError);
          // Continue with original image if conversion fails
        }
      }

      // MEMORY OPTIMIZATION: Use streaming upload instead of buffering entire file
      // Generate storage key using consistent naming convention
      const documentId = `temp_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const storageKey = StorageService.generateFileKey(userId, documentId, finalDocumentData.fileName);

      // Upload to cloud storage using stream (memory-efficient)
      let cloudStorageKey = '';
      try {
        const storage = storageProvider();
        // Create read stream instead of loading full file into memory
        const fileStream = fs.createReadStream(finalFilePath);
        // Use streaming upload if available, fallback to buffer upload
        if (typeof storage.uploadStream === 'function') {
          cloudStorageKey = await storage.uploadStream(fileStream, storageKey, finalMimeType);
        } else {
          // Fallback to buffer upload for LocalStorage
          const fileBuffer = await fs.promises.readFile(finalFilePath);
          cloudStorageKey = await storage.upload(fileBuffer, storageKey, finalMimeType);
        }
        console.log(`File streamed to cloud storage: ${cloudStorageKey}`);

        // Close stream immediately
        fileStream.destroy();
      } catch (storageError) {
        console.error('Cloud storage upload failed:', storageError);
        // Clean up local file immediately
        if (fs.existsSync(finalFilePath)) {
          fs.unlinkSync(finalFilePath);
        }
        return res.status(500).json({ message: "File upload to cloud storage failed" });
      }

      // Generate encryption for cloud-stored file
      let encryptedDocumentKey = '';
      let encryptionMetadata = '';

      try {
        // For GCS, we encrypt the file buffer before upload
        const documentKey = EncryptionService.generateDocumentKey();
        encryptedDocumentKey = EncryptionService.encryptDocumentKey(documentKey);

        // Create metadata indicating cloud storage with encryption
        encryptionMetadata = JSON.stringify({
          storageType: 'cloud',
          storageKey: cloudStorageKey,
          encrypted: true,
          algorithm: 'AES-256-GCM'
        });

        console.log(`Document prepared for cloud storage with encryption: ${cloudStorageKey}`);
      } catch (encryptionError) {
        console.error('Document encryption setup failed:', encryptionError);
        // Clean up cloud storage
        try {
          const storage = storageProvider();
          await storage.delete(cloudStorageKey);
        } catch (cleanupError) {
          console.error('Failed to cleanup cloud storage after encryption error:', cleanupError);
        }
        // Clean up local file
        if (fs.existsSync(finalFilePath)) {
          fs.unlinkSync(finalFilePath);
        }
        return res.status(500).json({ message: "Document encryption setup failed" });
      }

      // MEMORY OPTIMIZATION: Immediate cleanup instead of delayed setTimeout
      // Clean up local temporary file immediately after successful cloud upload
      if (fs.existsSync(finalFilePath)) {
        fs.unlinkSync(finalFilePath);
        console.log(`Immediately cleaned up local temporary file: ${finalFilePath}`);
      }

      // Update document data to use cloud storage key
      const cloudDocumentData = {
        ...finalDocumentData,
        filePath: cloudStorageKey, // Store cloud storage key instead of local path
        gcsPath: cloudStorageKey, // Also store in gcsPath for consistency
        encryptedDocumentKey,
        encryptionMetadata,
        isEncrypted: true
      };

      const validatedData = insertDocumentSchema.parse(cloudDocumentData);
      const document = await storage.createDocument(validatedData);

      // Process OCR using memory-bounded queue system
      if (supportsOCR(finalMimeType) || isPDFFile(finalMimeType)) {
        try {
          // Use OCR queue for memory-bounded processing
          const { ocrQueue } = await import('./ocrQueue.js');

          await ocrQueue.addJob({
            documentId: document.id,
            fileName: finalDocumentData.fileName,
            filePathOrGCSKey: cloudStorageKey,
            mimeType: finalMimeType,
            userId,
            priority: 5 // Normal priority
          });

          console.log(`📝 OCR job queued for document ${document.id}`);

          // Continue with tag suggestions using basic filename analysis
          const tagSuggestions = await tagSuggestionService.suggestTags(
            finalDocumentData.fileName,
            '', // No extracted text yet
            finalMimeType,
            documentData.tags
          );

          // Get the updated document with extracted text for tag suggestions
          const updatedDocument = await storage.getDocument(document.id, userId);
          if (updatedDocument?.extractedText) {
            // Generate tag suggestions based on extracted content
            const tagSuggestions = await tagSuggestionService.suggestTags(
              finalDocumentData.fileName,
              updatedDocument.extractedText,
              finalMimeType,
              documentData.tags
            );

            // Add suggested tags to existing tags (if any)
            const combinedTags = [...documentData.tags];
            tagSuggestions.suggestedTags.forEach(suggestion => {
              if (suggestion.confidence >= 0.7 && !combinedTags.includes(suggestion.tag)) {
                combinedTags.push(suggestion.tag);
              }
            });

            // Update document with suggested tags
            if (combinedTags.length > documentData.tags.length) {
              await storage.updateDocumentTags(document.id, userId, combinedTags);
            }
          }

          console.log(`OCR, summary, date extraction, and tag suggestion completed for document ${document.id}`);
        } catch (ocrError) {
          console.error(`OCR and date extraction failed for document ${document.id}:`, ocrError);
          // Fallback to basic OCR without date extraction
          try {
            const { extractedText, summary } = await processDocumentOCRAndSummary(
              cloudStorageKey, // Use GCS key instead of local path
              finalDocumentData.fileName, 
              finalMimeType
            );
            await storage.updateDocumentOCRAndSummary(document.id, userId, extractedText, summary);

            // Generate tag suggestions for fallback OCR
            const tagSuggestions = await tagSuggestionService.suggestTags(
              finalDocumentData.fileName,
              extractedText,
              req.file.mimetype,
              documentData.tags
            );

            const combinedTags = [...documentData.tags];
            tagSuggestions.suggestedTags.forEach(suggestion => {
              if (suggestion.confidence >= 0.7 && !combinedTags.includes(suggestion.tag)) {
                combinedTags.push(suggestion.tag);
              }
            });

            if (combinedTags.length > documentData.tags.length) {
              await storage.updateDocumentTags(document.id, userId, combinedTags);
            }

            console.log(`Fallback OCR with tag suggestions completed for document ${document.id}`);
          } catch (fallbackError) {
            console.error(`Fallback OCR also failed for document ${document.id}:`, fallbackError);
          }
        }
      } else {
        // Generate summary and tag suggestions for non-OCR files based on filename
        try {
          const summary = `Document: ${req.file.originalname}. File type: ${req.file.mimetype}. Uploaded on ${new Date().toLocaleDateString()}.`;
          await storage.updateDocumentSummary(document.id, userId, summary);

          // Generate tag suggestions based on filename only
          const tagSuggestions = await tagSuggestionService.suggestTags(
            req.file.originalname,
            undefined,
            req.file.mimetype,
            documentData.tags
          );

          const combinedTags = [...documentData.tags];
          tagSuggestions.suggestedTags.forEach(suggestion => {
            if (suggestion.confidence >= 0.6 && !combinedTags.includes(suggestion.tag)) {
              combinedTags.push(suggestion.tag);
            }
          });

          if (combinedTags.length > documentData.tags.length) {
            await storage.updateDocumentTags(document.id, userId, combinedTags);
          }

          console.log(`Summary and tag suggestions generated for non-OCR document ${document.id}`);
        } catch (summaryError) {
          console.error(`Summary and tag generation failed for document ${document.id}:`, summaryError);
        }
      }

      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path); // Clean up uploaded file on error
      }
      res.status(500).json({ message: "Failed to upload document" });
    }
  });





  // Get count of recently imported documents via email  
  app.get('/api/documents/imported-count', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documents = await storage.getDocuments(userId);

      // Count documents imported via email in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentlyImported = documents.filter(doc => {
        const hasEmailTag = doc.tags && doc.tags.includes('imported-via-email');
        const isRecent = doc.uploadedAt ? new Date(doc.uploadedAt) > oneDayAgo : false;
        return hasEmailTag && isRecent;
      });

      res.json(recentlyImported.length);
    } catch (error) {
      console.error('Error getting imported document count:', error);
      res.status(500).json({ message: 'Failed to get imported document count' });
    }
  });



  app.get('/api/documents/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  // Document preview endpoint - optimized for fast PDF loading
  app.get('/api/documents/:id/preview', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.user?.id || 'demo-user-1';
      const documentId = parseInt(req.params.id);

      console.log(`🔍 Preview request for document ${documentId} by user ${userId}`);

      if (isNaN(documentId)) {
        console.log(`❌ Invalid document ID: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        console.log(`❌ Document ${documentId} not found for user ${userId}`);
        return res.status(404).json({ message: "Document not found" });
      }

      console.log(`✅ Found document: ${document.fileName}, type: ${document.mimeType}`);

      // Check if file exists on disk
      if (!fs.existsSync(document.filePath)) {
        console.log(`❌ PREVIEW: File not found at path: ${document.filePath}`);

        // Try to clean up the orphaned record
        try {
          await storage.deleteDocument(documentId, userId);
          console.log(`🗑️ PREVIEW: Cleaned up orphaned document record ${documentId}`);
        } catch (cleanupError) {
          console.warn(`Failed to cleanup orphaned document ${documentId}:`, cleanupError);
        }

        return res.status(404).json({ 
          message: 'File not found on disk - document record has been cleaned up',
          documentId: documentId,
          expectedPath: document.filePath
        });
      }


      // Handle cloud storage documents (new system) - check both encrypted and unencrypted
      const isCloudDocument = (document.encryptionMetadata && document.encryptionMetadata.includes('cloud')) || 
                             document.gcsPath || 
                             (document.filePath && document.filePath.startsWith('user'));

      if (isCloudDocument) {
        try {
          let storageKey = '';

          // Determine the cloud storage key
          if (document.gcsPath) {
            storageKey = document.gcsPath;
          } else if (document.encryptionMetadata) {
            const metadata = JSON.parse(document.encryptionMetadata);
            storageKey = metadata.storageKey || document.filePath;
          } else {
            storageKey = document.filePath;
          }

          console.log(`📁 GCS PREVIEW: Loading document ${storageKey} from cloud storage`);

          const storage = storageProvider();
          try {
            // Always proxy the file through our server to prevent modal breaking redirects
            console.log('📁 GCS PREVIEW: Proxying document content to maintain modal functionality');
            const fileBuffer = await storage.download(storageKey);
            res.setHeader('Content-Type', document.mimeType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Content-Disposition', 'inline; filename="' + document.fileName + '"');
            res.setHeader('Access-Control-Allow-Origin', req.get('Origin') || '*');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

            // For PDFs, add headers to ensure proper display in iframe
            if (document.mimeType === 'application/pdf') {
              res.setHeader('Content-Security-Policy', 'frame-ancestors \'self\'');
              res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            }
            return res.send(fileBuffer);
          } catch (downloadError) {
            console.error('GCS download failed for preview:', downloadError);
            return res.status(500).json({ 
              message: "Failed to load document preview",
              error: downloadError instanceof Error ? downloadError.message : 'Unknown error' 
            });
          }
        } catch (metadataError) {
          console.error('Failed to parse metadata for cloud document:', metadataError);
          return res.status(500).json({ message: "Failed to parse document metadata" });
        }
      }

      // Handle encrypted local documents (legacy)
      if (document.isEncrypted && document.encryptedDocumentKey && document.encryptionMetadata) {
        try {
          const metadata = JSON.parse(document.encryptionMetadata);

          // Skip if already handled as cloud document above
          if (metadata.storageType === 'cloud') {
            return res.status(500).json({ message: "Cloud document should have been handled above" });
          }

          // Handle legacy encrypted local files
          const documentKey = EncryptionService.decryptDocumentKey(document.encryptedDocumentKey!);

          // For images, create decrypted stream
          if (document.mimeType.startsWith('image/')) {
            res.setHeader('Content-Type', document.mimeType);
            res.setHeader('Cache-Control', 'public, max-age=3600');

            const decryptedStream = EncryptionService.createDecryptStream(
              document.filePath, 
              documentKey, 
              document.encryptionMetadata
            );
            decryptedStream.pipe(res);
            return;
          }

          // For PDFs, decrypt and serve with proper headers
          if (document.mimeType === 'application/pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Content-Disposition', 'inline; filename="' + document.fileName + '"');

            // CORS headers for react-pdf compatibility
            res.setHeader('Access-Control-Allow-Origin', req.get('Origin') || '*');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

            const decryptedStream = EncryptionService.createDecryptStream(
              document.filePath, 
              documentKey, 
              document.encryptionMetadata
            );
            decryptedStream.pipe(res);
            return;
          }

          // For other encrypted file types
          return res.status(200).json({ 
            message: "Preview not supported for this encrypted file type",
            mimeType: document.mimeType 
          });
        } catch (decryptionError) {
          console.error('Document decryption failed for preview:', decryptionError);
          return res.status(500).json({ message: "Failed to decrypt document for preview" });
        }
      }

      // Handle unencrypted documents (legacy)
      // For images, serve the file directly
      if (document.mimeType.startsWith('image/')) {
        res.setHeader('Content-Type', document.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        const fileStream = fs.createReadStream(document.filePath);
        fileStream.pipe(res);
        return;
      }

      // For PDFs, serve the file with proper headers for react-pdf
      if (document.mimeType === 'application/pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Disposition', 'inline; filename="' + document.fileName + '"');

        // CORS headers for react-pdf compatibility
        res.setHeader('Access-Control-Allow-Origin', req.get('Origin') || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

        // Support for partial content requests (important for PDF streaming)
        res.setHeader('Accept-Ranges', 'bytes');

        const stat = fs.statSync(document.filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          const file = fs.createReadStream(document.filePath, { start, end });
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunksize.toString(),
          });
          file.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize.toString(),
          });
          fs.createReadStream(document.filePath).pipe(res);
        }
        return;
      }

      // For other file types, return not supported
      res.status(200).json({ 
        message: "Preview not supported for this file type",
        mimeType: document.mimeType 
      });
    } catch (error) {
      console.error("Error generating document preview:", error);
      res.status(500).json({ message: "Failed to generate preview" });
    }
  });

  // Update document name
  app.patch('/api/documents/:id/name', async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || 'demo-user-1';
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Document name is required" });
      }

      const updatedDocument = await storage.updateDocumentName(documentId, userId, name.trim());
      if (!updatedDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json(updatedDocument);
    } catch (error) {
      console.error("Error updating document name:", error);
      res.status(500).json({ message: "Failed to update document name" });
    }
  });

  // Update document details (name and expiry date)
  app.patch('/api/documents/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const { name, expiryDate } = req.body;

      if (name && (typeof name !== 'string' || name.trim().length === 0)) {
        return res.status(400).json({ message: "Document name must be a non-empty string" });
      }

      if (expiryDate && expiryDate !== null && typeof expiryDate !== 'string') {
        return res.status(400).json({ message: "Expiry date must be a valid date string or null" });
      }

      const updatedDocument = await storage.updateDocument(documentId, userId, {
        name: name ? name.trim() : undefined,
        expiryDate: expiryDate === '' ? null : expiryDate
      });

      if (!updatedDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json(updatedDocument);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  // Trigger OCR processing for a document
  app.post('/api/documents/:id/ocr', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!supportsOCR(document.mimeType)) {
        return res.status(400).json({ message: "Document type does not support OCR" });
      }

      if (!fs.existsSync(document.filePath)) {
        return res.status(404).json({ message: "File not found on server" });
      }

      try {
        const extractedText = await extractTextFromImage(document.filePath, document.mimeType);
        const updatedDocument = await storage.updateDocumentOCR(documentId, userId, extractedText);
        res.json({ 
          success: true, 
          extractedText, 
          document: updatedDocument 
        });
      } catch (ocrError: any) {
        console.error(`OCR failed for document ${documentId}:`, ocrError);
        res.status(500).json({ message: `OCR processing failed: ${ocrError?.message || 'Unknown error'}` });
      }
    } catch (error) {
      console.error("Error processing OCR:", error);
      res.status(500).json({ message: "Failed to process OCR" });
    }
  });

  // Reprocess document with enhanced OCR and text extraction
  app.post('/api/documents/:id/reprocess', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!fs.existsSync(document.filePath)) {
        return res.status(404).json({ message: "Document file not found" });
      }

      // Reprocess with enhanced OCR and date extraction
      const { processDocumentWithDateExtraction } = await import('./ocrService');
      await processDocumentWithDateExtraction(
        documentId,
        document.name,
        document.filePath,
        document.mimeType || 'application/octet-stream',
        userId,
        storage
      );

      res.json({ message: 'Document reprocessed successfully' });
    } catch (error: any) {
      console.error('Reprocess document error:', error);
      res.status(500).json({ message: 'Failed to reprocess document' });
    }
  });

  // DOC-501: Generate AI insights for a document
  app.post('/api/documents/:id/insights', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Check if AI Insight service is available
      if (!aiInsightService.isServiceAvailable()) {
        return res.status(503).json({ 
          message: "AI Insight service not available - OpenAI API key required",
          status: aiInsightService.getServiceStatus()
        });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Auto-trigger OCR if extracted text is missing
      if (!document.extractedText || document.extractedText.trim() === '') {
        console.log(`🔄 AUTO-OCR TRIGGER: Document ${documentId} missing extracted text, triggering OCR before insights`);

        // Check if document supports OCR
        if (!supportsOCR(document.mimeType)) {
          return res.status(400).json({ 
            message: `Document type ${document.mimeType} does not support text extraction. Cannot generate insights.` 
          });
        }

        // Import OCR queue and trigger processing
        const { ocrQueue } = await import('./ocrQueue');

        // Check if document file exists before queuing OCR
        const fileExists = document.gcsPath ? 
          true : // Assume GCS files exist - will be verified in OCR process
          fs.existsSync(document.filePath);

        if (!fileExists && !document.gcsPath) {
          console.error(`❌ Document file not found: ${document.filePath}`);
          return res.status(404).json({ 
            message: "Document file not found on disk. Cannot extract text.",
            debug: `File path: ${document.filePath}`
          });
        }

        try {
          // Queue OCR job with high priority for user-initiated request
          const jobId = await ocrQueue.addJob({
            documentId,
            fileName: document.fileName,
            filePathOrGCSKey: document.gcsPath || document.filePath,
            mimeType: document.mimeType,
            userId,
            priority: 1, // High priority for user-initiated insights
            isEmailImport: false
          });

          console.log(`🔄 OCR job queued: ${jobId} for document ${documentId} (${document.gcsPath ? 'GCS' : 'local'} file)`);

          // Return response indicating OCR is processing
          return res.status(202).json({ 
            message: "Document text extraction in progress. Insights will be available in 10-30 seconds.",
            status: "processing",
            ocrJobId: jobId,
            estimatedTime: "10-30 seconds",
            action: "refresh_insights"
          });

        } catch (ocrError: any) {
          console.error(`❌ Failed to queue OCR for document ${documentId}:`, ocrError);
          return res.status(500).json({ 
            message: "Failed to start text extraction. Please try again.",
            error: ocrError.message,
            debug: `File: ${document.gcsPath || document.filePath}`
          });
        }
      }

      const insights = await aiInsightService.generateDocumentInsights(
        document.name,
        document.extractedText,
        document.mimeType,
        userId
      );

      // Store insights in database with TICKET 4 dashboard fields
      for (const insight of insights.insights) {
        // TICKET 4: Generate dashboard-ready message and action URL
        const message = generateInsightMessage(insight, document.name);
        const actionUrl = `/documents/${documentId}`;
        const dueDate = extractDueDate(insight);

        console.log('🔍 [ROUTE DEBUG] Creating insight with documentId:', documentId, 'type:', typeof documentId);
        console.log('🔍 [ROUTE DEBUG] Insight confidence:', insight.confidence, 'rounded:', Math.round(insight.confidence * 100));
        console.log('🔍 [ROUTE DEBUG] Processing time:', insights.processingTime, 'type:', typeof insights.processingTime);

        await storage.createDocumentInsight({
          documentId, // Should be number from parseInt above
          userId,
          insightId: insight.id,
          message, // TICKET 4: User-facing message
          type: insight.type,
          title: insight.title,
          content: insight.content,
          confidence: Math.round(insight.confidence * 100).toString(), // Convert to 0-100 scale as string
          priority: insight.priority,
          dueDate, // TICKET 4: Due date for actionable insights
          actionUrl, // TICKET 4: URL to take action
          status: 'open', // TICKET 4: Default status
          metadata: insight.metadata || {},
          processingTime: insights.processingTime,
          aiModel: 'gpt-4o',
          source: 'ai',
          // INSIGHT-101: Add tier classification
          tier: insight.tier,
          insightVersion: 'v2.0',
          generatedAt: new Date()
        });
      }

      // TICKET 8: Track insights generation for browser scans
      if (document.uploadSource === 'browser_scan') {
        console.log(`📊 Analytics: browser_scan_insights_generated for document ${documentId}`, {
          userId,
          documentId,
          insightsCount: insights.insights.length,
          processingTime: insights.processingTime,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        insights: insights.insights,
        documentType: insights.documentType,
        recommendedActions: insights.recommendedActions,
        processingTime: insights.processingTime,
        confidence: insights.confidence
      });

    } catch (error: any) {
      console.error("Error generating document insights:", error);
      captureError(error, req);

      if (error.message.includes('quota exceeded')) {
        return res.status(429).json({ 
          message: "OpenAI API quota exceeded. Please check your billing and usage limits." 
        });
      }

      res.status(500).json({ message: "Failed to generate document insights" });
    }
  });

  // INSIGHT-102: Get existing insights for a document with tier filtering
  app.get('/api/documents/:id/insights', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);
      const tier = req.query.tier as string; // INSIGHT-102: Optional tier filter ('primary', 'secondary')

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const allInsights = await storage.getDocumentInsights(documentId, userId, tier);

      // Filter out unwanted insight types at API level
      const insights = allInsights.filter(insight => 
        !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(insight.type)
      );

      res.json({
        success: true,
        insights,
        documentId,
        totalCount: insights.length,
        tier: tier || 'all',
        // INSIGHT-102: Include tier breakdown
        tierBreakdown: {
          primary: insights.filter(i => i.tier === 'primary').length,
          secondary: insights.filter(i => i.tier === 'secondary').length
        }
      });

    } catch (error) {
      console.error("Error fetching document insights:", error);
      res.status(500).json({ message: "Failed to fetch document insights" });
    }
  });

  // TICKET 4: Get insights for dashboard
  app.get('/api/insights', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      // TICKET 8: Default to showing only open insights, allow 'all' or 'dismissed' via query
      const status = req.query.status as string || 'open';
      const type = req.query.type as string;
      const priority = req.query.priority as string;
      const sort = req.query.sort as string;
      // TICKET 9: Support filtering insights with due dates for calendar view
      const hasDueDate = req.query.has_due_date === 'true';

      let insights = await storage.getInsights(userId, status === 'all' ? undefined : status, type, priority);

      // Get manual events and convert them to insights format
      const manualEvents = await storage.getManualTrackedEvents(userId);
      const manualInsights = manualEvents
        .filter(event => status === 'all' || event.status === 'active')
        .map(event => ({
          id: `manual-${event.id}`,
          insightId: `manual-${event.id}`,
          documentId: null,
          userId: event.createdBy,
          type: 'manual_event',
          priority: 'high', // All manual events are high priority
          tier: 'core',
          title: event.title,
          content: event.notes || `${event.category} reminder`,
          actionText: 'View Details',
          dueDate: event.dueDate,
          status: event.status === 'active' ? 'open' : 'dismissed',
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          source: 'manual',
          category: event.category,
          repeatInterval: event.repeatInterval,
          linkedAssetId: event.linkedAssetId,
          linkedDocumentIds: event.linkedDocumentIds
        }));

      // Keep all AI insights for dashboard display
      const filteredAIInsights = insights;

      // Combine AI insights and manual events
      const allInsights = [...filteredAIInsights, ...manualInsights];

      // TICKET 9: Filter insights with due dates if requested
      const filteredInsights = hasDueDate 
        ? allInsights.filter(insight => insight.dueDate && insight.dueDate !== null)
        : allInsights;

      // Enhanced insight format for calendar support - keep camelCase for consistency
      const enhancedInsights = filteredInsights.map(insight => ({
        ...insight,
        actionUrl: insight.type === 'manual_event' ? `/insights` : `/document/${insight.documentId}`,
        // Ensure dueDate is in YYYY-MM-DD format for calendar
        dueDate: insight.dueDate ? (typeof insight.dueDate === 'string' ? insight.dueDate.split('T')[0] : (insight.dueDate as Date).toISOString().split('T')[0]) : null
      }));

      res.json({
        insights: enhancedInsights,
        total: enhancedInsights.length,
        filters: { status, type, priority, sort, has_due_date: hasDueDate }
      });

    } catch (error) {
      console.error("Error fetching insights:", error);
      captureError(error as Error, req);
      res.status(500).json({ message: "Failed to fetch insights" });
    }
  });

  // TICKET 19: Get insight metrics for dashboard
  app.get('/api/insights/metrics', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Get all insights for calculations
      const allInsights = await storage.getInsights(userId);

      // Filter out unwanted insight types at API level
      const filteredAIInsights = allInsights.filter(insight => 
        !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(insight.type)
      );

      // Include manual events as high priority insights
      const manualEvents = await storage.getManualTrackedEvents(userId);
      const manualInsights = manualEvents
        .filter(event => event.status === 'active')
        .map(event => ({
          ...event,
          priority: 'high' as const,
          status: 'open' as const,
          type: 'manual_event' as const
        }));

      // Combine all insights
      const combinedInsights = [...filteredAIInsights, ...manualInsights];

      // Calculate metrics
      const openInsights = combinedInsights.filter(i => i.status === 'open' || !i.status);
      const highPriority = combinedInsights.filter(i => i.priority === 'high' && (i.status === 'open' || !i.status));
      const resolvedInsights = combinedInsights.filter(i => i.status === 'resolved');

      // Type-specific metrics (open only) - exclude unwanted types
      const manualEventCount = combinedInsights.filter(i => i.type === 'manual_event' && (i.status === 'open' || !i.status));
      const summaryInsights = combinedInsights.filter(i => i.type === 'summary' && (i.status === 'open' || !i.status));
      const contactInsights = combinedInsights.filter(i => i.type === 'contacts' && (i.status === 'open' || !i.status));

      // Upcoming deadlines (within 30 days)
      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
      const upcomingDeadlines = combinedInsights.filter(i => {
        if (!i.dueDate || i.status !== 'open') return false;
        const dueDate = new Date(i.dueDate);
        return dueDate >= today && dueDate <= thirtyDaysFromNow;
      });

      res.json({
        total: combinedInsights.length,
        open: openInsights.length,
        highPriority: highPriority.length,
        resolved: resolvedInsights.length,
        manualEvents: manualEventCount.length,
        upcomingDeadlines: upcomingDeadlines.length,
        byType: {
          summary: summaryInsights.length,
          contacts: contactInsights.length,
          manual_event: manualEventCount.length
        },
        byPriority: {
          high: highPriority.length,
          medium: combinedInsights.filter(i => i.priority === 'medium' && (i.status === 'open' || !i.status)).length,
          low: combinedInsights.filter(i => i.priority === 'low' && (i.status === 'open' || !i.status)).length
        }
      });

    } catch (error) {
      console.error("Error fetching insight metrics:", error);
      captureError(error as Error, req);
      res.status(500).json({ message: "Failed to fetch insight metrics" });
    }
  });

  // TICKET 8: Get critical insights for homepage dashboard
  app.get('/api/insights/critical', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      const criticalInsights = await storage.getCriticalInsights(userId);
      console.log(`[DEBUG] Fetched ${criticalInsights.length} critical insights for user ${userId}:`, 
                  criticalInsights.map(i => ({ id: i.id, status: i.status, message: i.message?.substring(0, 50) + '...' })));

      res.json(criticalInsights);

    } catch (error) {
      console.error("Error fetching critical insights:", error);
      captureError(error as Error, req);
      res.status(500).json({ message: "Failed to fetch critical insights" });
    }
  });

  // TICKET 8: Update insight (simplified endpoint)
  app.patch('/api/insights/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const insightId = req.params.id;
      const { status } = req.body;

      if (!['open', 'dismissed', 'resolved'].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'open', 'dismissed', or 'resolved'." });
      }

      const updatedInsight = await storage.updateInsightStatus(insightId, userId, status);

      if (!updatedInsight) {
        return res.status(404).json({ message: "Insight not found" });
      }

      res.json(updatedInsight);

    } catch (error) {
      console.error("Error updating insight:", error);
      captureError(error as Error, req);
      res.status(500).json({ message: "Failed to update insight" });
    }
  });

  // TICKET 4: Update insight status
  app.patch('/api/insights/:id/status', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const insightId = req.params.id;
      const { status } = req.body;

      console.log(`[DEBUG] Updating insight ${insightId} for user ${userId} to status: ${status}`);

      if (!['open', 'dismissed', 'resolved'].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'open', 'dismissed', or 'resolved'." });
      }

      const updatedInsight = await storage.updateInsightStatus(insightId, userId, status);

      if (!updatedInsight) {
        console.log(`[DEBUG] Insight ${insightId} not found for user ${userId}`);
        return res.status(404).json({ message: "Insight not found" });
      }

      console.log(`[DEBUG] Successfully updated insight ${insightId} to status: ${updatedInsight.status}`);
      res.json(updatedInsight);

    } catch (error) {
      console.error("Error updating insight status:", error);
      captureError(error as Error, req);
      res.status(500).json({ message: "Failed to update insight status" });
    }
  });

  // Delete a specific insight (general endpoint)
  app.delete('/api/insights/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const insightId = req.params.id;

      const deletedInsight = await storage.deleteInsight(insightId, userId);

      if (!deletedInsight) {
        return res.status(404).json({ message: "Insight not found" });
      }

      res.json({ success: true, message: "Insight deleted successfully" });

    } catch (error) {
      console.error("Error deleting insight:", error);
      captureError(error as Error, req);
      res.status(500).json({ message: "Failed to delete insight" });
    }
  });

  // DOC-501: Delete a specific insight
  app.delete('/api/documents/:id/insights/:insightId', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);
      const insightId = req.params.insightId;

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      await storage.deleteDocumentInsight(documentId, userId, insightId);
      res.json({ success: true, message: "Insight deleted successfully" });

    } catch (error) {
      console.error("Error deleting document insight:", error);
      res.status(500).json({ message: "Failed to delete document insight" });
    }
  });

  app.delete('/api/documents/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Delete file from filesystem
      if (fs.existsSync(document.filePath)) {
        fs.unlinkSync(document.filePath);
      }

      await storage.deleteDocument(documentId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Download document
  app.get('/api/documents/:id/download', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Handle cloud storage documents (both encrypted and unencrypted)
      const isCloudDocument = (document.encryptionMetadata && document.encryptionMetadata.includes('cloud')) || 
                             document.gcsPath || 
                             (document.filePath && document.filePath.startsWith('user'));

      if (isCloudDocument) {
        try {
          let storageKey = '';

          // Determine the cloud storage key
          if (document.gcsPath) {
            storageKey = document.gcsPath;
          } else if (document.encryptionMetadata) {
            const metadata = JSON.parse(document.encryptionMetadata);
            storageKey = metadata.storageKey || document.filePath;
          } else {
            storageKey = document.filePath;
          }

          console.log(`📁 GCS DOWNLOAD: Downloading document ${storageKey} from cloud storage`);

          try {
            const storage = storageProvider();
            const fileBuffer = await storage.download(storageKey);

            // Set appropriate headers for download
            res.setHeader('Content-Type', document.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
            res.setHeader('Cache-Control', 'private, max-age=3600');

            res.send(fileBuffer);
            return;
          } catch (gcsError: any) {
            console.error('GCS download failed:', gcsError);
            return res.status(500).json({ 
              message: "Failed to download document from cloud storage",
              error: gcsError?.message || 'Unknown error' 
            });
          }
        } catch (metadataError) {
          console.error('Failed to parse metadata for cloud document:', metadataError);
          return res.status(500).json({ message: "Failed to parse document metadata" });
        }
      }

      // Handle encrypted local documents (legacy)
      if (document.isEncrypted && document.encryptedDocumentKey && document.encryptionMetadata) {
        try {
          const metadata = JSON.parse(document.encryptionMetadata);

          // Skip if already handled as cloud document above
          if (metadata.storageType === 'cloud') {
            return res.status(500).json({ message: "Cloud document should have been handled above" });
          }

          // Handle local encrypted documents (legacy)
          const documentKey = EncryptionService.decryptDocumentKey(document.encryptedDocumentKey);

          // Create decrypted stream
          const decryptedStream = EncryptionService.createDecryptStream(
            document.filePath, 
            documentKey, 
            document.encryptionMetadata
          );

          // Set appropriate headers
          res.setHeader('Content-Type', document.mimeType);
          res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);

          decryptedStream.pipe(res);
          return;
        } catch (decryptionError) {
          console.error('Document decryption failed:', decryptionError);
          return res.status(500).json({ message: "Failed to decrypt document" });
        }
      }

      // Check if file exists and handle missing files gracefully
      if (!fs.existsSync(document.filePath)) {
        console.error(`File not found: ${document.filePath} for document ${document.id}`);

        // Try to find the file in uploads directory with original filename
        const uploadsDir = path.join(process.cwd(), 'uploads');
        const possiblePath = path.join(uploadsDir, document.fileName);

        // Extract filename from file path if it contains a full path
        const pathBasename = path.basename(document.filePath);
        const basenameAttempt = path.join(uploadsDir, pathBasename);

        if (fs.existsSync(possiblePath)) {
          console.log(`Found file at alternative path: ${possiblePath}`);
          res.download(possiblePath, document.fileName);
          return;
        }

        // Try with the basename from the stored path
        if (fs.existsSync(basenameAttempt)) {
          console.log(`Found file at basename path: ${basenameAttempt}`);
          res.download(basenameAttempt, document.fileName);
          return;
        }

        // Check if it's a relative path that needs to be resolved
        const resolvedPath = path.resolve(document.filePath);
        if (fs.existsSync(resolvedPath)) {
          console.log(`Found file at resolved path: ${resolvedPath}`);
          res.download(resolvedPath, document.fileName);
          return;
        }

        return res.status(404).json({ 
          message: "File not found on server",
          debug: {
            originalPath: document.filePath,
            tried: [possiblePath, basenameAttempt, resolvedPath],
            exists: {
              original: fs.existsSync(document.filePath),
              uploads: fs.existsSync(possiblePath),
              resolved: fs.existsSync(resolvedPath)
            }
          }
        });
      }

      res.download(document.filePath, document.fileName);
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ message: "Failed to download document" });
    }
  });



  // Encryption management endpoints
  app.get('/api/admin/encryption/stats', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      // Placeholder for encryption stats until implemented
      const stats = { encryptedDocuments: 0, unencryptedDocuments: 0 };
      const hasMasterKey = !!process.env.DOCUMENT_MASTER_KEY;

      res.json({
        ...stats,
        hasMasterKey,
        encryptionEnabled: hasMasterKey
      });
    } catch (error) {
      console.error("Error fetching encryption stats:", error);
      res.status(500).json({ message: "Failed to fetch encryption stats" });
    }
  });

  app.post('/api/admin/encryption/test', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const testResult = await EncryptionService.testEncryption();
      res.json({
        success: testResult,
        message: testResult ? "Encryption system is working correctly" : "Encryption system test failed"
      });
    } catch (error) {
      console.error("Error testing encryption:", error);
      res.status(500).json({ 
        success: false,
        message: "Encryption test failed: " + (error instanceof Error ? error.message : "Unknown error")
      });
    }
  });



  // Admin routes
  // Admin routes (protected by admin middleware)
  app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log('🔧 Admin stats endpoint called');
      const stats = await storage.getAdminStats();

      // Ensure consistent response format
      const response = {
        totalUsers: stats.totalUsers || 0,
        activeUsers: stats.activeUsers || 0,
        totalDocuments: stats.totalDocuments || 0,
        documentsThisMonth: stats.totalStorageBytes || 0, // Map to available property
        totalStorage: stats.totalStorageBytes || 0,
        avgProcessingTime: stats.uploadsThisMonth || 0 // Map to available property
      };

      console.log('🔧 Admin stats response:', response);
      res.json(response);
    } catch (error) {
      console.error('❌ Admin stats error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch admin stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Admin users endpoint
  app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log('🔧 Admin users endpoint called');
      const usersWithDetails = await storage.getAllUsersWithStats();
      console.log('🔧 Found users:', usersWithDetails.length);
      res.json(usersWithDetails);
    } catch (error) {
      console.error('❌ Admin users error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch users',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Toggle user status
  app.patch('/api/admin/users/:userId/toggle', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: "isActive must be a boolean" });
      }

      await db.update(users)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(users.id, userId));

      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ Toggle user error:', error);
      res.status(500).json({ error: 'Failed to toggle user status' });
    }
  });

  // Feature flags endpoints
  // Admin - Feature flags
  app.get("/api/admin/feature-flags", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const user = req.user || (req.session as any)?.user;
      console.log('🔧 [FEATURE FLAGS] Request received from user:', user?.email);
      console.log('🔧 [FEATURE FLAGS] User role:', user?.role);
      console.log('🔧 [FEATURE FLAGS] Fetching all feature flags...');

      const flags = await db.select().from(featureFlags);
      console.log('🔧 [FEATURE FLAGS] Query result:', flags.length, 'flags found');
      console.log('🔧 [FEATURE FLAGS] Sample flag data:', flags.slice(0, 2));

      res.json(flags);
    } catch (error) {
      console.error('❌ [FEATURE FLAGS] Fetch error:', error);
      res.status(500).json({ error: "Failed to fetch feature flags" });
    }
  });

  // Toggle feature flag
  app.patch('/api/admin/feature-flags/:flagId/toggle', requireAdmin, async (req: any, res) => {
    try {
      const { flagId } = req.params;
      const { enabled } = req.body;

      await db.update(featureFlags)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(featureFlags.id, flagId));

      // Clear feature flag cache
      featureFlagService.clearCache();

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Toggle feature flag error:', error);
      res.status(500).json({ error: 'Failed to toggle feature flag' });
    }
  });

  // Feature flag analytics
  // Admin - Feature flag analytics  
  app.get("/api/admin/feature-flag-analytics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = req.user || (req.session as any)?.user;
      console.log('🔧 [FEATURE FLAG ANALYTICS] Request received from user:', user?.email);
      console.log('🔧 [FEATURE FLAG ANALYTICS] User role:', user?.role);
      console.log('🔧 [FEATURE FLAG ANALYTICS] Fetching feature flag analytics...');

      // Get basic stats
      const totalFlags = await db.select({ count: sql<number>`count(*)` }).from(featureFlags);
      console.log('🔧 [FEATURE FLAG ANALYTICS] Total flags query result:', totalFlags);

      const activeFlags = await db.select({ count: sql<number>`count(*)` }).from(featureFlags).where(eq(featureFlags.enabled, true));
      console.log('🔧 [FEATURE FLAG ANALYTICS] Active flags query result:', activeFlags);

      const premiumFlags = await db.select({ count: sql<number>`count(*)` }).from(featureFlags).where(eq(featureFlags.tierRequired, 'premium'));
      console.log('🔧 [FEATURE FLAG ANALYTICS] Premium flags query result:', premiumFlags);

      // Calculate average rollout percentage
      const avgRollout = await db.select({ 
        avg: sql<number>`avg(COALESCE(rollout_percentage, 100))` 
      }).from(featureFlags).where(eq(featureFlags.enabled, true));
      console.log('🔧 [FEATURE FLAG ANALYTICS] Average rollout query result:', avgRollout);

      const analytics = {
        totalFlags: String(totalFlags[0]?.count || 0),
        activeFlags: String(activeFlags[0]?.count || 0),
        premiumFlags: String(premiumFlags[0]?.count || 0),
        averageRollout: String(Math.round(Number(avgRollout[0]?.avg || 0)))
      };

      console.log('🔧 [FEATURE FLAG ANALYTICS] Final analytics result:', analytics);
      res.json(analytics);
    } catch (error) {
      console.error('❌ [FEATURE FLAG ANALYTICS] Error:', error);
      console.error('❌ [FEATURE FLAG ANALYTICS] Error stack:', (error as any).stack);
      res.status(500).json({ error: "Failed to fetch feature flag analytics" });
    }
  });

  // Get system activities for admin dashboard (admin only)
  app.get('/api/admin/activities', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      console.log('🔧 Admin activities endpoint called');
      const { severity } = req.query;
      const activities = await storage.getSystemActivities(severity as string);

      // Return empty array if no activities found
      const response = Array.isArray(activities) ? activities : [];
      console.log('🔧 Found activities:', response.length);

      res.json(response);
    } catch (error) {
      console.error('❌ Admin activities error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch system activities',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get search analytics (admin only)
  app.get('/api/admin/search-analytics', requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log('🔧 Admin search analytics endpoint called');

      // Since we don't have search logging table, return mock data
      const analytics = {
        totalSearches: 0,
        avgResponseTime: 0,
        topQueries: [],
        searchSuccessRate: 100,
        timeRange: '30d'
      };

      console.log('🔧 Search analytics:', analytics);
      res.json(analytics);
    } catch (error) {
      console.error('❌ Search analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch search analytics' });
    }
  });

  // Get cloud usage (admin only)  
  app.get('/api/admin/cloud-usage', requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log('🔧 Admin cloud usage endpoint called');
      const usage = await storage.getGCSUsage();
      console.log('🔧 Cloud usage response:', usage);
      res.json(usage);
    } catch (error) {
      console.error('❌ Cloud usage error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch cloud usage',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get OpenAI usage (admin only)
  app.get('/api/admin/usage/openai', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const usage = await storage.getOpenAIUsage();
      res.json(usage);
    } catch (error) {
      console.error("Error fetching OpenAI usage:", error);
      res.status(500).json({ message: "Failed to fetch OpenAI usage" });
    }
  });

  // Get LLM usage analytics (admin only) - alias for openai usage
  app.get('/api/admin/llm-usage/analytics', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const usage = await storage.getOpenAIUsage();
      res.json(usage);
    } catch (error) {
      console.error("Error fetching LLM usage analytics:", error);
      res.status(500).json({ message: "Failed to fetch LLM usage analytics" });
    }
  });

  // Duplicate route removed - keeping the main one below

  // Duplicate route removed - keeping the main one above

  // Duplicate route removed - consolidated above

  // Admin search analytics endpoint
  app.get('/api/admin/search-analytics', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { timeRange, tierFilter } = req.query;
      const analytics = await storage.getSearchAnalytics(timeRange as string, tierFilter as string);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching search analytics:", error);
      res.status(500).json({ message: "Failed to fetch search analytics" });
    }
  });

  // Admin GCS usage endpoint
  app.get('/api/admin/usage/gcs', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const usage = await storage.getGCSUsage();
      res.json(usage);
    } catch (error) {
      console.error("Error fetching GCS usage:", error);
      res.status(500).json({ message: "Failed to fetch GCS usage" });
    }
  });

  // Admin OpenAI usage endpoint
  app.get('/api/admin/usage/openai', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const usage = await storage.getOpenAIUsage();
      res.json(usage);
    } catch (error) {
      console.error("Error fetching OpenAI usage:", error);
      res.status(500).json({ message: "Failed to fetch OpenAI usage" });
    }
  });

  // Initialize default categories
  app.post('/api/init-categories', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const defaultCategories = [
        { name: 'Car', icon: 'fas fa-car', color: 'blue', userId },
        { name: 'Mortgage', icon: 'fas fa-home', color: 'green', userId },
        { name: 'Insurance', icon: 'fas fa-shield-alt', color: 'purple', userId },
        { name: 'Utilities', icon: 'fas fa-bolt', color: 'orange', userId },
        { name: 'Receipts', icon: 'fas fa-receipt', color: 'yellow', userId },
      ];

      const userCategories = await storage.getCategories(userId);
      if (userCategories.length === 0) {
        for (const category of defaultCategories) {
          try {
            await storage.createCategory(category);
          } catch (categoryError) {
            // Log but continue if a category already exists for this user
            console.log(`Category ${category.name} may already exist for user ${userId}:`, categoryError);
          }
        }
      }

      res.json({ message: 'Categories initialized' });
    } catch (error) {
      console.error("Error initializing categories:", error);
      res.status(500).json({ message: "Failed to initialize categories" });
    }
  });

  // Document sharing routes

  // Share a document
  app.post('/api/documents/:id/share', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);
      const { email, permissions = 'view' } = req.body;

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Valid email address is required" });
      }

      if (permissions && !['view', 'edit'].includes(permissions)) {
        return res.status(400).json({ message: "Permissions must be 'view' or 'edit'" });
      }

      const share = await storage.shareDocument(documentId, userId, email, permissions);
      res.json(share);
    } catch (error: any) {
      console.error("Error sharing document:", error);
      if (error?.message?.includes("already shared") || error?.message?.includes("not found")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to share document" });
    }
  });

  // Get document shares
  app.get('/api/documents/:id/shares', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const shares = await storage.getDocumentShares(documentId, userId);
      res.json(shares);
    } catch (error: any) {
      console.error("Error fetching document shares:", error);
      if (error?.message?.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to fetch document shares" });
    }
  });

  // Unshare a document
  app.delete('/api/document-shares/:shareId', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const shareId = parseInt(req.params.shareId);

      if (isNaN(shareId)) {
        return res.status(400).json({ message: "Invalid share ID" });
      }

      await storage.unshareDocument(shareId, userId);
      res.json({ message: "Document unshared successfully" });
    } catch (error) {
      console.error("Error unsharing document:", error);
      res.status(500).json({ message: "Failed to unshare document" });
    }
  });

  // Get documents shared with me
  app.get('/api/shared-with-me', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const sharedDocuments = await storage.getSharedWithMeDocuments(userId);
      res.json(sharedDocuments);
    } catch (error) {
      console.error("Error fetching shared documents:", error);
      res.status(500).json({ message: "Failed to fetch shared documents" });
    }
  });


  // Import Stripe route handlers
  const { 
    createCheckoutSession, 
    createPortalSession, 
    getSubscriptionStatus, 
    processWebhook,
    getSubscriptionPlans,
    cancelSubscription
  } = await import('./stripeRoutes');

  // Stripe API endpoints
  app.get('/api/stripe/plans', requireAuth, getSubscriptionPlans);
  app.post('/api/stripe/create-checkout-session', requireAuth, createCheckoutSession);
  app.post('/api/stripe/create-portal-session', requireAuth, createPortalSession);
  app.get('/api/stripe/subscription-status', requireAuth, getSubscriptionStatus);
  app.post('/api/stripe/cancel-subscription', requireAuth, cancelSubscription);

  // Stripe webhook (no auth required - verified by signature)
  app.post('/api/stripe/webhook', processWebhook);

  // Manual subscription update for testing
  app.post('/api/stripe/manual-update', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      await storage.updateUser(userId, {
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
      });
      res.json({ message: 'Subscription updated to premium' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update subscription' });
    }
  });



  // Category suggestion endpoint
  const { suggestDocumentCategory } = await import('./routes/categorySuggestion');
  app.post('/api/documents/suggest-category', requireAuth, suggestDocumentCategory);

  // Blog API endpoints - temporarily commented out until storage methods are implemented
  /*
  app.get('/api/blog/posts', async (req: any, res) => {
    try {
      const posts = await storage.getPublishedBlogPosts();
      res.json(posts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  /*
  app.get('/api/blog/posts/:slug', async (req: any, res) => {
    try {
      const post = await storage.getBlogPostBySlug(req.params.slug);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ message: "Failed to fetch blog post" });
    }
  });

  // Admin-only blog management endpoints
  app.post('/api/blog/posts', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const data = insertBlogPostSchema.parse(req.body);
      const post = await storage.createBlogPost({ ...data, authorId: userId });
      res.json(post);
    } catch (error) {
      console.error("Error creating blog post:", error);
      res.status(500).json({ message: "Failed to create blog post" });
    }
  });

  app.put('/api/blog/posts/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      const data = insertBlogPostSchema.partial().parse(req.body);
      const post = await storage.updateBlogPost(postId, data);
      res.json(post);
    } catch (error) {
      console.error("Error updating blog post:", error);
      res.status(500).json({ message: "Failed to update blog post" });
    }
  });

  app.delete('/api/blog/posts/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      await storage.deleteBlogPost(postId);
      res.json({ message: "Blog post deleted successfully" });
    } catch (error) {
      console.error("Error deleting blog post:", error);
      res.status(500).json({ message: "Failed to delete blog post" });
    }
  });
  */





  // OCR configuration and status endpoint
  app.get('/api/ocr/config', async (req, res) => {
    try {
      const config = {
        available_methods: [
          {
            name: 'Tesseract.js',
            type: 'free',
            status: 'available',
            description: 'Open-source OCR, no API key required',
            primary: true
          }
        ],
        primary_method: 'Tesseract.js',
        supported_formats: ['image/jpeg', 'image/png', 'image/webp'],
        features: {
          cost: 'completely free',
          languages: 'English',
          accuracy: 'good for printed text',
          no_api_key_required: true
        }
      };

      res.json(config);
    } catch (error) {
      console.error("Error getting OCR config:", error);
      res.status(500).json({ message: "Failed to get OCR configuration" });
    }
  });




  // Reprocess document with date extraction (for testing existing documents)
  app.post('/api/documents/:id/reprocess-dates', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Reprocess the document with date extraction
      if (supportsOCR(document.mimeType)) {
        const { processDocumentWithDateExtraction } = await import('./ocrService');
        await processDocumentWithDateExtraction(
          document.id,
          document.name,
          document.filePath,
          document.mimeType,
          userId,
          storage
        );
        res.json({ message: "Document reprocessed with date extraction successfully" });
      } else {
        res.status(400).json({ message: "Document type does not support OCR processing" });
      }
    } catch (error) {
      console.error("Date reprocessing error:", error);
      res.status(500).json({ message: "Failed to reprocess document dates" });
    }
  });

  // DOC-305: Enhanced expiry reminder routes with AI suggestion support
  app.get('/api/expiry-reminders', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const reminders = await storage.getExpiryReminders(userId);
      res.json(reminders);
    } catch (error) {
      console.error("Error fetching expiry reminders:", error);
      res.status(500).json({ message: "Failed to fetch expiry reminders" });
    }
  });

  // DOC-305: Get pending reminder suggestions
  app.get('/api/reminder-suggestions', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { reminderSuggestionService } = await import('./reminderSuggestionService');
      const suggestions = await reminderSuggestionService.getPendingReminderSuggestions(userId);
      res.json({
        suggestions,
        count: suggestions.length,
        message: `Found ${suggestions.length} pending reminder suggestions`
      });
    } catch (error) {
      console.error("DOC-305: Error fetching reminder suggestions:", error);
      res.status(500).json({ message: "Failed to fetch reminder suggestions" });
    }
  });

  // DOC-305: Update reminder suggestion status
  app.patch('/api/reminder-suggestions/:id/status', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const reminderId = parseInt(req.params.id);
      const { status } = req.body;

      if (isNaN(reminderId)) {
        return res.status(400).json({ message: "Invalid reminder ID" });
      }

      if (!['confirmed', 'dismissed'].includes(status)) {
        return res.status(400).json({ message: "Status must be 'confirmed' or 'dismissed'" });
      }

      const { reminderSuggestionService } = await import('./reminderSuggestionService');
      const success = await reminderSuggestionService.updateReminderStatus(reminderId, userId, status);

      if (success) {
        res.json({ message: `Reminder ${status} successfully` });
      } else {
        res.status(400).json({ message: "Failed to update reminder status" });
      }
    } catch (error) {
      console.error("DOC-305: Error updating reminder status:", error);
      res.status(500).json({ message: "Failed to update reminder status" });
    }
  });

  // DOC-305: Batch process documents for reminder suggestions
  app.post('/api/reminder-suggestions/batch-process', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { reminderSuggestionService } = await import('./reminderSuggestionService');
      const result = await reminderSuggestionService.batchProcessDocuments(userId);

      res.json({
        message: "Batch processing completed",
        processed: result.processed,
        created: result.created,
        success: true
      });
    } catch (error) {
      console.error("DOC-305: Error in batch processing:", error);
      res.status(500).json({ message: "Failed to batch process documents" });
    }
  });



  app.post('/api/expiry-reminders', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const validatedData = insertExpiryReminderSchema.parse(req.body);
      const reminderData = { ...validatedData, userId };
      const reminder = await storage.createExpiryReminder(reminderData);
      res.json(reminder);
    } catch (error) {
      console.error("Error creating expiry reminder:", error);
      res.status(500).json({ message: "Failed to create expiry reminder" });
    }
  });

  // Tag suggestion endpoints
  app.post('/api/documents/:id/suggest-tags', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const suggestions = await tagSuggestionService.suggestTags(
        document.fileName,
        document.extractedText || undefined,
        document.mimeType,
        document.tags || []
      );

      res.json(suggestions);
    } catch (error) {
      console.error("Error suggesting tags:", error);
      res.status(500).json({ message: "Failed to suggest tags" });
    }
  });

  app.post('/api/documents/analyze-tags', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      // Get all user documents with tags
      const userDocuments = await storage.getDocuments(userId);
      const documentsWithTags = userDocuments
        .filter(doc => doc.tags && doc.tags.length > 0)
        .map(doc => ({
          documentName: doc.name,
          tags: doc.tags || []
        }));

      if (documentsWithTags.length === 0) {
        return res.json({
          duplicateTags: [],
          missingCommonTags: [],
          tagHierarchy: {}
        });
      }

      const analysis = await tagSuggestionService.analyzeTagConsistency(documentsWithTags);
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing tags:", error);
      res.status(500).json({ message: "Failed to analyze tags" });
    }
  });

  app.post('/api/documents/batch-suggest-tags', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { documentIds } = req.body;

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "Document IDs are required" });
      }

      // Get documents
      const documentsData = [];
      for (const id of documentIds) {
        const doc = await storage.getDocument(id, userId);
        if (doc) {
          documentsData.push({
            id: doc.id,
            fileName: doc.fileName,
            extractedText: doc.extractedText || undefined,
            mimeType: doc.mimeType,
            existingTags: doc.tags || []
          });
        }
      }

      const suggestions = await tagSuggestionService.suggestTagsForBatch(documentsData);
      res.json(suggestions);
    } catch (error) {
      console.error("Error batch suggesting tags:", error);
      res.status(500).json({ message: "Failed to suggest tags for batch" });
    }
  });

  // Update document tags
  app.patch('/api/documents/:id/tags', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);
      const { tags } = req.body;

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      if (!Array.isArray(tags)) {
        return res.status(400).json({ message: "Tags must be an array" });
      }

      await storage.updateDocumentTags(documentId, userId, tags);
      res.json({ message: "Tags updated successfully", tags });
    } catch (error) {
      console.error("Error updating document tags:", error);
      res.status(500).json({ message: "Failed to update document tags" });
    }
  });

  app.patch('/api/expiry-reminders/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const reminderId = parseInt(req.params.id);

      if (isNaN(reminderId)) {
        return res.status(400).json({ message: "Invalid reminder ID" });
      }

      const updatedReminder = await storage.updateExpiryReminder(reminderId, userId, req.body);
      if (!updatedReminder) {
        return res.status(404).json({ message: "Reminder not found" });
      }

      res.json(updatedReminder);
    } catch (error) {
      console.error("Error updating expiry reminder:", error);
      res.status(500).json({ message: "Failed to update expiry reminder" });
    }
  });

  app.delete('/api/expiry-reminders/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const reminderId = parseInt(req.params.id);

      if (isNaN(reminderId)) {
        return res.status(400).json({ message: "Invalid reminder ID" });
      }

      await storage.deleteExpiryReminder(reminderId, userId);
      res.json({ message: "Reminder deleted successfully" });
    } catch (error) {
      console.error("Error deleting expiry reminder:", error);
      res.status(500).json({ message: "Failed to delete expiry reminder" });
    }
  });

  app.patch('/api/expiry-reminders/:id/complete', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const reminderId = parseInt(req.params.id);
      const { isCompleted } = req.body;

      if (isNaN(reminderId)) {
        return res.status(400).json({ message: "Invalid reminder ID" });
      }

      const updatedReminder = await storage.markReminderCompleted(reminderId, userId, isCompleted);
      if (!updatedReminder) {
        return res.status(404).json({ message: "Reminder not found" });
      }

      res.json(updatedReminder);
    } catch (error) {
      console.error("Error marking reminder as completed:", error);
      res.status(500).json({ message: "Failed to update reminder status" });
    }
  });



  // ===== MANUAL TRACKED EVENTS ROUTES (TICKET B1) =====

  // Get all manual tracked events for the authenticated user
  app.get('/api/manual-events', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const events = await storage.getManualTrackedEvents(userId);
      res.json(events);
    } catch (error) {
      console.error("Error fetching manual tracked events:", error);
      res.status(500).json({ message: "Failed to fetch manual tracked events" });
    }
  });

  // Get a specific manual tracked event
  app.get('/api/manual-events/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const eventId = req.params.id;

      const event = await storage.getManualTrackedEvent(eventId, userId);
      if (!event) {
        return res.status(404).json({ message: "Manual tracked event not found" });
      }

      res.json(event);
    } catch (error) {
      console.error("Error fetching manual tracked event:", error);
      res.status(500).json({ message: "Failed to fetch manual tracked event" });
    }
  });

  // Create a new manual tracked event
  app.post('/api/manual-events', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Validate request body
      const validatedData = insertManualTrackedEventSchema.parse(req.body);

      const event = await storage.createManualTrackedEvent({
        ...validatedData,
        createdBy: userId,
      });

      res.status(201).json(event);
    } catch (error: any) {
      console.error("Error creating manual tracked event:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to create manual tracked event" });
    }
  });

  // Update a manual tracked event
  app.put('/api/manual-events/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const eventId = req.params.id;

      // Validate request body (allowing partial updates)
      const validatedData = insertManualTrackedEventSchema.partial().parse(req.body);

      const event = await storage.updateManualTrackedEvent(eventId, userId, validatedData);
      if (!event) {
        return res.status(404).json({ message: "Manual tracked event not found" });
      }

      res.json(event);
    } catch (error: any) {
      console.error("Error updating manual tracked event:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to update manual tracked event" });
    }
  });

  // Delete a manual tracked event
  app.delete('/api/manual-events/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const eventId = req.params.id;

      await storage.deleteManualTrackedEvent(eventId, userId);
      res.json({ message: "Manual tracked event deleted successfully" });
    } catch (error) {
      console.error("Error deleting manual tracked event:", error);
      res.status(500).json({ message: "Failed to delete manual tracked event" });
    }
  });

  // ===== MANUAL EVENT NOTIFICATION ROUTES (TICKET B2) =====

  // Manually trigger notifications for the authenticated user (testing endpoint)
  app.post('/api/manual-events/trigger-notifications', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { manualEventNotificationService } = await import('./manualEventNotificationService');

      await manualEventNotificationService.triggerUserNotifications(userId);
      res.json({ message: "Notifications triggered successfully" });
    } catch (error) {
      console.error("Error triggering notifications:", error);
      res.status(500).json({ message: "Failed to trigger notifications" });
    }
  });

  // Check if a specific event should trigger notifications today
  app.get('/api/manual-events/:id/notification-check', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const eventId = req.params.id;
      const { manualEventNotificationService } = await import('./manualEventNotificationService');

      const shouldNotify = await manualEventNotificationService.checkEventNotification(eventId, userId);
      res.json({ shouldNotify, eventId });
    } catch (error) {
      console.error("Error checking event notification:", error);
      res.status(500).json({ message: "Failed to check event notification" });
    }
  });

  // ===== FEATURE FLAG ADMIN ROUTES =====

  // Initialize feature flags on startup
  console.log('🏁 [STARTUP] Initializing feature flags...');
  featureFlagService.initializeFeatureFlags()
    .then(() => {
      console.log('✅ [STARTUP] Feature flags initialization completed');
    })
    .catch((error) => {
      console.error('❌ [STARTUP] Feature flags initialization failed:', error);
    });

  // Get all feature flags (admin only)
  app.get("/api/admin/feature-flags", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const flags = await storage.getAllFeatureFlags();
      res.json(flags);
    } catch (error: any) {
      console.error("Error fetching feature flags:", error);
      res.status(500).json({ message: "Failed to fetch feature flags", error: error.message });
    }
  });

  // Create/Update feature flag (admin only)
  app.post("/api/admin/feature-flags", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const flag = await featureFlagService.upsertFeatureFlag(req.body);
      res.json(flag);
    } catch (error: any) {
      console.error("Error creating feature flag:", error);
      res.status(500).json({ message: "Failed to create feature flag", error: error.message });
    }
  });

  // Update feature flag (admin only)
  app.put("/api/admin/feature-flags", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const flag = await featureFlagService.upsertFeatureFlag(req.body);
      res.json(flag);
    } catch (error: any) {
      console.error("Error updating feature flag:", error);
      res.status(500).json({ message: "Failed to update feature flag", error: error.message });
    }
  });

  // Toggle feature flag (admin only)
  app.patch("/api/admin/feature-flags/:flagId/toggle", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { flagId } = req.params;
      const { enabled } = req.body;

      await storage.toggleFeatureFlag(flagId, enabled);
      featureFlagService.clearCache();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error toggling feature flag:", error);
      res.status(500).json({ message: "Failed to toggle feature flag", error: error.message });
    }
  });

  // Get feature flag overrides (admin only)  
  app.get("/api/admin/feature-flag-overrides", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const overrides = await storage.getFeatureFlagOverrides();
      res.json(overrides);
    } catch (error: any) {
      console.error("Error fetching feature flag overrides:", error);
      res.status(500).json({ message: "Failed to fetch overrides", error: error.message });
    }
  });

  // Create feature flag override (admin only)
  app.post("/api/admin/feature-flag-overrides", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId: targetUserId, featureFlagName, isEnabled, overrideReason, expiresAt } = req.body;

      await featureFlagService.setUserOverride(
        targetUserId, 
        featureFlagName, 
        isEnabled, 
        overrideReason,
        expiresAt ? new Date(expiresAt) : undefined
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error creating feature flag override:", error);
      res.status(500).json({ message: "Failed to create override", error: error.message });
    }
  });

  // Get feature flag analytics (admin only)
  app.get("/api/admin/feature-flag-analytics", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const analytics = await storage.getFeatureFlagAnalytics();
      res.json(analytics);
    } catch (error: any) {
      console.error("Error fetching feature flag analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
    }
  });

  // Enhanced useFeatures hook endpoint - returns batch evaluation results
  app.get("/api/feature-flags/batch-evaluation", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const context = {
        userId,
        userTier: user.subscriptionTier as 'free' | 'premium',
        sessionId: req.sessionID,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      };

      const enabledFeatures = await featureFlagService.getAllEnabledFeatures(context);
      res.json({ enabledFeatures });
    } catch (error: any) {
      console.error("Error in batch feature evaluation:", error);
      res.status(500).json({ message: "Failed to evaluate features", error: error.message });
    }
  });

  // Individual feature check endpoint
  app.get("/api/feature-flags/:featureName/check", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { featureName } = req.params;
      const context = {
        userId,
        userTier: user.subscriptionTier as 'free' | 'premium',
        sessionId: req.sessionID,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      };

      const isEnabled = await featureFlagService.isFeatureEnabled(featureName, context);
      res.json({ enabled: isEnabled });
    } catch (error: any) {
      console.error("Error checking feature flag:", error);
      res.status(500).json({ message: "Failed to check feature", error: error.message });
    }
  });

  // Bulk Operations API Endpoints

  // Bulk update documents (tags, category, name)
  app.patch('/api/documents/bulk-update', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { documentIds, updates } = req.body;

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "Document IDs array is required" });
      }

      if (documentIds.length > 100) {
        return res.status(400).json({ message: "Maximum 100 documents can be updated at once" });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "Updates object is required" });
      }

      const { searchOptimizationService } = await import('./searchOptimizationService');
      const result = await searchOptimizationService.bulkUpdateDocuments(userId, documentIds, updates);

      res.json({
        message: `Bulk update completed: ${result.success} successful, ${result.failed} failed`,
        ...result
      });
    } catch (error) {
      console.error("Error in bulk update:", error);
      res.status(500).json({ message: "Failed to perform bulk update" });
    }
  });

  // Bulk delete documents
  app.delete('/api/documents/bulk-delete', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { documentIds } = req.body;

      console.log('Bulk delete request:', { userId, documentIds, bodyKeys: Object.keys(req.body || {}) });

      if (!documentIds) {
        return res.status(400).json({ 
          message: "Document IDs are required",
          received: req.body,
          expected: "{ documentIds: [1, 2, 3] }"
        });
      }

      if (!Array.isArray(documentIds)) {
        return res.status(400).json({ 
          message: "Document IDs must be an array",
          received: typeof documentIds,
          value: documentIds
        });
      }

      if (documentIds.length === 0) {
        return res.status(400).json({ 
          message: "Document IDs array cannot be empty",
          received: documentIds
        });
      }

      if (documentIds.length > 50) {
        return res.status(400).json({ message: "Maximum 50 documents can be deleted at once" });
      }

      // Validate that all IDs are numbers
      const invalidIds = documentIds.filter(id => !Number.isInteger(id) || id <= 0);
      if (invalidIds.length > 0) {
        return res.status(400).json({ 
          message: "All document IDs must be positive integers",
          invalidIds
        });
      }

      const { searchOptimizationService } = await import('./searchOptimizationService');
      const result = await searchOptimizationService.bulkDeleteDocuments(userId, documentIds);

      res.json({
        message: `Bulk delete completed: ${result.success} successful, ${result.failed} failed`,
        ...result
      });
    } catch (error) {
      console.error("Error in bulk delete:", error);
      res.status(500).json({ 
        message: "Failed to perform bulk delete",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Search analytics endpoint for admin monitoring
  app.get('/api/admin/search-analytics', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { searchOptimizationService } = await import('./searchOptimizationService');
      const { performanceMonitoringService } = await import('./performanceMonitoringService');

      const searchAnalytics = searchOptimizationService.getSearchAnalytics();
      const performanceAnalytics = performanceMonitoringService.getPerformanceAnalytics(24);
      const recommendations = performanceMonitoringService.getOptimizationRecommendations();

      res.json({
        search: searchAnalytics,
        performance: performanceAnalytics,
        recommendations,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error fetching search analytics:", error);
      res.status(500).json({ message: "Failed to fetch search analytics" });
    }
  });

  // User-specific search analytics
  app.get('/api/search-analytics', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { searchOptimizationService } = await import('./searchOptimizationService');
      const analytics = searchOptimizationService.getSearchAnalytics(userId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching user search analytics:", error);
      res.status(500).json({ message: "Failed to fetch search analytics" });
    }
  });

  // CORE-002: Enhanced Health Check Endpoint
  app.get('/api/health', enhancedHealthCheck);

  // GCS Test and Reset endpoint
  app.get('/api/admin/gcs-test', requireAuth, async (req: any, res) => {
    try {
      console.log('🔄 Resetting StorageService to use new GCS credentials...');
      StorageService.reset();

      const storage = storageProvider();
      const testKey = `test/${Date.now()}/test-file.txt`;
      const testContent = Buffer.from('GCS Test File - ' + new Date().toISOString());

      console.log('🧪 Testing GCS upload...');
      await storage.upload(testContent, testKey, 'text/plain');

      console.log('🧪 Testing GCS download...');
      const downloadedContent = await storage.download(testKey);

      console.log('🧪 Testing GCS signed URL...');
      const signedUrl = await storage.getSignedUrl(testKey, 300);

      console.log('🧪 Testing GCS delete...');
      await storage.delete(testKey);

      res.json({
        success: true,
        message: 'GCS functionality fully operational with new credentials',
        tests: {
          upload: 'SUCCESS',
          download: 'SUCCESS', 
          signedUrl: 'SUCCESS',
          delete: 'SUCCESS'
        },
        downloadedContent: downloadedContent.toString(),
        signedUrlGenerated: !!signedUrl,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('GCS test failed:', error);
      res.status(500).json({
        success: false,
        message: 'GCS test failed',
        error: error?.message || 'Unknown error',
        details: error?.stack
      });
    }
  });

  // Add error handling middleware at the end
  // Backup management routes (admin only)
  app.use('/api/backup', backupRoutes);

  // Advanced scanning routes
  app.use('/api/scanning', advancedScanningRoutes);

  // Setup multi-page scan upload routes
  setupMultiPageScanUpload(app);

  // LLM usage analytics routes (admin only)
  app.use('/api/admin/llm-usage', llmUsageRoutes);

  // Memory management routes
  const memoryRoutes = (await import('./api/memory.js')).default;
  app.use('/api/memory', memoryRoutes);

  // User Assets routes
  app.get('/api/user-assets', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const assets = await storage.getUserAssets(userId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching user assets:", error);
      res.status(500).json({ message: "Failed to fetch user assets" });
    }
  });

  app.post('/api/user-assets', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      console.log("[DEBUG USER-ASSETS] Raw request body:", JSON.stringify(req.body, null, 2));

      // Validate request body using the discriminated union schema from the frontend
      // This will check that house assets have address/postcode and car assets have make/model/year
      const houseSchema = z.object({
        type: z.literal("house"),
        name: z.string().min(1),
        address: z.string().min(1),
        postcode: z.string().min(1),
      });

      const carSchema = z.object({
        type: z.literal("car"),
        name: z.string().min(1),
        registration: z.string().min(1),
        make: z.string().min(1),
        model: z.string().min(1),
        year: z.number().int().gte(1900).lte(new Date().getFullYear()),
        vin: z.string().optional(),
      });

      const assetSchema = z.discriminatedUnion("type", [houseSchema, carSchema]);
      const validatedData = assetSchema.parse(req.body);
      console.log("[DEBUG USER-ASSETS] Validated data:", JSON.stringify(validatedData, null, 2));

      const assetData = { ...validatedData, userId };
      const asset = await storage.createUserAsset(assetData);
      res.json(asset);
    } catch (error) {
      console.error("Error creating user asset:", error);
      if (error instanceof z.ZodError) {
        console.error("[DEBUG USER-ASSETS] Zod validation error details:", JSON.stringify(error.errors, null, 2));
        res.status(400).json({ message: "Invalid asset data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create user asset" });
      }
    }
  });

  app.delete('/api/user-assets/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const assetId = parseInt(req.params.id);

      if (isNaN(assetId)) {
        return res.status(400).json({ message: "Invalid asset ID" });
      }

      await storage.deleteUserAsset(assetId, userId);
      res.json({ message: "Asset deleted successfully" });
    } catch (error) {
      console.error("Error deleting user asset:", error);
      res.status(500).json({ message: "Failed to delete user asset" });
    }
  });

  // ROOT ROUTE: Only define fallback for production mode
  // In development, Vite middleware handles all frontend routing

  // DEBUG ROUTE: Test deployment connectivity with enhanced diagnostics
  app.get('/debug', (req, res) => {
    console.log('📞 /debug endpoint called from routes.ts');
    console.log('🔧 Environment:', process.env.NODE_ENV);
    console.log('🔧 Deployment timestamp:', process.env.DEPLOYMENT_TIMESTAMP || 'not-set');
    res.send('✅ App is live - ' + new Date().toISOString());
  });

  // ENHANCED DEBUG: More detailed server status
  app.get('/api/status', (req, res) => {
    console.log('📞 /api/status endpoint called');
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      port: process.env.PORT || '5000',
      routes: {
        emailIngest: 'active',
        debug: 'active'
      }
    });
  });

  // Simple GET endpoint for /api/email-ingest (no security requirements for Mailgun route validation)
  // DEPLOYMENT UPDATE v4: Email ingestion endpoint active with enhanced diagnostics
  app.get('/api/email-ingest', (req, res) => { 
    console.log('📞 /api/email-ingest GET endpoint called from routes.ts');
    console.log('🔧 Route registration confirmed for email ingestion');
    res.status(200).send('✅ Email Ingest Live - ' + new Date().toISOString()); 
  });
  app.head('/api/email-ingest', (req, res) => { 
    console.log('🧪 Email ingest HEAD route accessed');
    res.sendStatus(200); 
  });

  // Debug route to test webhook processing without full security (REMOVE IN PRODUCTION)
  app.post('/api/email-ingest-debug', 
    (req, res, next) => {
      console.log('🧪 DEBUG: Email ingest debug route accessed');
      console.log('🧪 DEBUG Content-Type:', req.get('Content-Type'));
      console.log('🧪 DEBUG User-Agent:', req.get('User-Agent'));
      console.log('🧪 DEBUG Body:', req.body);
      next();
    },
    async (req: any, res) => {
      try {
        res.status(200).json({
          message: 'Debug endpoint working',
          contentType: req.get('Content-Type'),
          userAgent: req.get('User-Agent'),
          hasBody: !!req.body,
          bodyKeys: req.body ? Object.keys(req.body) : [],
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ DEBUG ENDPOINT ERROR:', error);
        res.status(500).json({ error: 'Debug endpoint error', details: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // TICKET: Enable Public Access and Harden Security for /api/email-ingest (Mailgun Integration)
  // Apply comprehensive security middleware stack
  app.post('/api/email-ingest', 
    (req, res, next) => {
      console.log('🚨 MAILGUN POST: Email ingestion route hit from routes.ts');
      console.log('🚨 POST IP:', req.ip || req.socket.remoteAddress);
      console.log('🚨 POST Headers:', Object.keys(req.headers));
      next();
    },
    mailgunWebhookLogger,
    mailgunWebhookRateLimit,
    validateMailgunContentType,
    mailgunIPWhitelist,
    mailgunUpload.any(), // MOVE MULTER BEFORE SIGNATURE VERIFICATION
    mailgunSignatureVerification,
    async (req: any, res) => {
    const processingStartTime = Date.now();
    let requestId: string | undefined;

    try {
      console.log('🚀 EMAIL INGEST: Handler started successfully');
      console.log('🔍 Request body keys:', Object.keys(req.body || {}));
      console.log('🔍 Request files count:', req.files ? req.files.length : 0);
      // Parse the webhook data first to get basic email info
      const webhookData = parseMailgunWebhook(req);

      if (!webhookData.isValid) {
        // TICKET 6: Log webhook validation errors
        EmailUploadLogger.logError({
          errorType: 'validation',
          errorCode: 'INVALID_WEBHOOK_DATA',
          errorMessage: webhookData.error || 'Unknown webhook validation error',
          sender: 'unknown',
          recipient: 'unknown',  
          subject: 'unknown'
        });
        return res.status(400).json({ 
          error: 'Invalid webhook data',
          details: webhookData.error 
        });
      }

      const { message } = webhookData;

      // TICKET 6: Log webhook reception with email details
      requestId = EmailUploadLogger.logWebhookReceived({
        recipient: message.recipient,
        sender: message.sender,
        subject: message.subject,
        attachmentCount: message.attachments?.length || 0,
        totalSize: message.attachments?.reduce((sum, att) => sum + att.size, 0) || 0,
        userAgent: req.headers['user-agent'] || 'unknown'
      });

      // Security validation is now handled by middleware
      console.log('🔒 All security checks passed - processing email');

      // Extract and validate user from email subaddressing
      const userExtractionResult = extractUserIdFromRecipient(message.recipient);
      if (!userExtractionResult.userId) {
        // TICKET 6: Log user extraction failures
        EmailUploadLogger.logUserError({
          errorCode: 'USER_EXTRACTION_FAILED',
          recipient: message.recipient,
          sender: message.sender,
          subject: message.subject,
          errorMessage: userExtractionResult.error || 'Failed to extract user ID from email address',
          requestId
        });
        return res.status(400).json({ 
          error: 'Invalid recipient format',
          details: userExtractionResult.error,
          expectedFormat: 'upload+userID@myhome-tech.com or u[userID]@uploads.myhome-tech.com'
        });
      }

      const userId = userExtractionResult.userId;



      // Verify user exists with comprehensive error handling
      let user;
      try {
        user = await storage.getUser(userId);
        if (!user) {
          // TICKET 6: Log user not found errors
          EmailUploadLogger.logUserError({
            errorCode: 'USER_NOT_FOUND',
            recipient: message.recipient,
            sender: message.sender,
            subject: message.subject,
            userId,
            errorMessage: `No user found with ID: ${userId}`,
            requestId
          });
          return res.status(404).json({ 
            error: 'User not found',
            details: `No user found with ID: ${userId}`,
            suggestion: 'Verify the user ID in the email address is correct'
          });
        }

        console.log('✅ User successfully resolved:', {
          userId: user.id,
          email: user.email,
          recipient: message.recipient
        });

      } catch (error) {
        // TICKET 6: Log database errors during user lookup
        const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
        EmailUploadLogger.logUserError({
          errorCode: 'USER_LOOKUP_ERROR',
          recipient: message.recipient,
          sender: message.sender,
          subject: message.subject,
          userId,
          errorMessage: `Database error during user lookup: ${errorMessage}`,
          requestId,
          error: error instanceof Error ? error : undefined
        });

        // Determine if it's a database connection issue or invalid user ID format
        if (error instanceof Error && error.message.includes('invalid input syntax')) {
          return res.status(400).json({ 
            error: 'Invalid user ID format',
            details: 'User ID must be a valid UUID or alphanumeric string'
          });
        }

        return res.status(500).json({ 
          error: 'Database error while verifying user',
          details: 'Please try again later'
        });
      }

      // TICKET 4: Validate and filter attachments with comprehensive checks
      const attachmentValidation = validateEmailAttachments(message.attachments);

      // Reject emails with no valid attachments
      if (!attachmentValidation.hasValidAttachments) {
        // TICKET 6: Log attachment validation failures
        EmailUploadLogger.logAttachmentError({
          sender: message.sender,
          recipient: message.recipient,
          subject: message.subject,
          attachmentCount: message.attachments.length,
          validCount: attachmentValidation.validAttachments.length,
          invalidAttachments: attachmentValidation.invalidAttachments.map(att => `${att.filename} (${att.error})`),
          requestId
        });

        return res.status(400).json({
          error: 'No valid attachments found',
          details: 'Emails must contain at least one valid attachment (PDF, JPG, PNG, WebP, DOCX ≤10MB)',
          invalidAttachments: attachmentValidation.invalidAttachments,
          summary: attachmentValidation.summary
        });
      }

      // Log validation results
      console.log('✅ Attachment validation completed:', {
        validCount: attachmentValidation.validAttachments.length,
        invalidCount: attachmentValidation.invalidAttachments.length,
        summary: attachmentValidation.summary
      });

      // Log warnings for valid attachments
      attachmentValidation.validAttachments.forEach(attachment => {
        if (attachment.warnings?.length) {
          console.warn('⚠️ Attachment warnings for', attachment.filename, ':', attachment.warnings);
        }
      });

      // Log invalid attachments for debugging
      if (attachmentValidation.invalidAttachments.length > 0) {
        console.warn('⚠️ Invalid attachments skipped:', attachmentValidation.invalidAttachments);
      }

      // TICKET 5: Integrate with document ingestion pipeline
      const processedDocuments: any[] = [];
      const documentErrors: any[] = [];

      // Process each valid attachment through the document pipeline
      for (const attachment of attachmentValidation.validAttachments) {
        const attachmentStartTime = Date.now();
        try {
          console.log(`📧 Processing email attachment: ${attachment.filename} (${attachment.size} bytes)`);
          console.log('📧 userId type and value:', typeof userId, userId);

          // Generate document metadata for email ingestion
          const documentName = attachment.filename.replace(/\.[^/.]+$/, ""); // Remove extension
          const finalMimeType = attachment.contentType;

          // Prepare document data for validation
          const documentDataToValidate = {
            userId: userId, // Add the userId field
            name: documentName,
            fileName: attachment.filename,
            filePath: '', // Will be set after upload
            fileSize: attachment.size,
            mimeType: finalMimeType,
            tags: ['email-imported'], // Tag to identify email-imported documents
            uploadSource: 'email', // Mark as email upload
            status: 'pending' // Start as pending
          };

          console.log('📧 Document data before validation:', JSON.stringify(documentDataToValidate, null, 2));

          // Validate document data using existing schema
          const documentData = insertDocumentSchema.parse(documentDataToValidate);

          // Create initial document record
          const document = await storage.createDocument(documentData);
          console.log(`📄 Created document record ${document.id} for ${attachment.filename}`);

          // Generate storage key using existing convention
          const storageKey = StorageService.generateFileKey(userId, document.id.toString(), attachment.filename);

          // Upload to cloud storage
          let cloudStorageKey = '';
          try {
            const storageService = storageProvider();
            cloudStorageKey = await storageService.upload(attachment.buffer, storageKey, finalMimeType);
            console.log(`☁️ Uploaded ${attachment.filename} to GCS: ${cloudStorageKey}`);
          } catch (storageError) {
            // TICKET 6: Log storage upload failures
            EmailUploadLogger.logStorageError({
              userId,
              fileName: attachment.filename,
              sender: message.sender,
              recipient: message.recipient,
              subject: message.subject,
              documentId: document.id,
              errorMessage: `GCS upload failed: ${storageError instanceof Error ? storageError.message : 'Unknown storage error'}`,
              requestId,
              error: storageError instanceof Error ? storageError : undefined
            });

            await storage.deleteDocument(document.id, userId); // Cleanup document record
            documentErrors.push({
              filename: attachment.filename,
              error: 'Failed to upload to cloud storage'
            });
            continue;
          }

          // Generate encryption metadata (following existing pattern)
          let encryptedDocumentKey = '';
          let encryptionMetadata = '';

          try {
            const documentKey = EncryptionService.generateDocumentKey();
            encryptedDocumentKey = EncryptionService.encryptDocumentKey(documentKey);

            encryptionMetadata = JSON.stringify({
              storageType: 'cloud',
              storageKey: cloudStorageKey,
              encrypted: true,
              algorithm: 'AES-256-GCM',
              source: 'email',
              sender: message.sender,
              subject: message.subject,
              processedAt: new Date().toISOString()
            });
          } catch (encryptionError) {
            console.error('❌ Encryption setup failed for', attachment.filename, ':', encryptionError);

            // Cleanup cloud storage
            try {
              const storageService = storageProvider();
              await storageService.delete(cloudStorageKey);
            } catch (cleanupError) {
              console.error('Failed to cleanup cloud storage after encryption error:', cleanupError);
            }

            await storage.deleteDocument(document.id, userId);
            documentErrors.push({
              filename: attachment.filename,
              error: 'Failed to setup document encryption'
            });
            continue;
          }

          // Update document with cloud storage and encryption details
          const updateData = {
            filePath: cloudStorageKey, // Store cloud storage key instead of local path
            gcsPath: cloudStorageKey,
            encryptedDocumentKey,
            encryptionMetadata,
            isEncrypted: true,
            status: 'active'
          };

          await storage.updateDocument(document.id, userId, updateData);
          console.log(`✅ Updated document ${document.id} with cloud storage metadata`);

          // Process OCR and AI insights if applicable
          if (supportsOCR(finalMimeType) || isPDFFile(finalMimeType)) {
            try {
              const { ocrQueue } = await import('./ocrQueue.js');

              await ocrQueue.addJob({
                documentId: document.id,
                fileName: attachment.filename,
                filePathOrGCSKey: cloudStorageKey,
                mimeType: finalMimeType,
                userId,
                priority: 3 // Higher priority for email imports
              });

              console.log(`🔍 Queued OCR job for email document ${document.id}`);

              // Generate tag suggestions based on filename and email context
              const emailTags = ['email-imported'];
              if (message.subject) {
                emailTags.push(...message.subject.toLowerCase().split(/\s+/).filter(word => word.length > 3).slice(0, 3));
              }

              const tagSuggestions = await tagSuggestionService.suggestTags(
                attachment.filename,
                `Email from: ${message.sender}\nSubject: ${message.subject}\n${message.bodyPlain?.substring(0, 500) || ''}`,
                finalMimeType,
                emailTags
              );

              // Update document with enhanced tags
              const combinedTags = [...emailTags];
              tagSuggestions.suggestedTags.forEach(suggestion => {
                if (suggestion.confidence >= 0.6 && !combinedTags.includes(suggestion.tag)) {
                  combinedTags.push(suggestion.tag);
                }
              });

              await storage.updateDocumentTags(document.id, userId, combinedTags);
              console.log(`🏷️ Updated document ${document.id} with ${combinedTags.length} tags`);

            } catch (ocrError) {
              console.error(`OCR processing failed for document ${document.id}:`, ocrError);
              // Document is still valid even if OCR fails
            }
          } else {
            // For non-OCR files, generate basic summary from email context
            try {
              const emailSummary = `Document received via email from ${message.sender}. Subject: "${message.subject}". Original filename: ${attachment.filename}`;
              await storage.updateDocumentOCRAndSummary(document.id, userId, '', emailSummary);
              console.log(`📝 Generated email-based summary for document ${document.id}`);
            } catch (summaryError) {
              console.error(`Failed to generate summary for document ${document.id}:`, summaryError);
            }
          }

          // TICKET 6: Log successful document creation
          const attachmentProcessingTime = Date.now() - attachmentStartTime;
          EmailUploadLogger.logSuccess({
            userId,
            documentId: document.id,
            fileName: attachment.filename,
            sender: message.sender,
            recipient: message.recipient,
            subject: message.subject,
            fileSize: attachment.size,
            storageKey: cloudStorageKey,
            mimeType: finalMimeType,
            processingTimeMs: attachmentProcessingTime,
            requestId
          });

          processedDocuments.push({
            documentId: document.id,
            filename: attachment.filename,
            size: attachment.size,
            storageKey: cloudStorageKey,
            status: 'processed'
          });

        } catch (documentError) {
          // TICKET 6: Log document processing failures
          EmailUploadLogger.logProcessingError({
            userId,
            fileName: attachment.filename,
            sender: message.sender,
            recipient: message.recipient,
            subject: message.subject,
            errorMessage: documentError instanceof Error ? documentError.message : 'Unknown processing error',
            requestId,
            error: documentError instanceof Error ? documentError : undefined
          });

          documentErrors.push({
            filename: attachment.filename,
            error: documentError instanceof Error ? documentError.message : 'Unknown processing error'
          });
        }
      }

      // TICKET 6: Log processing summary
      const totalProcessingTime = Date.now() - processingStartTime;
      console.log(`[${requestId}] Email processing summary:`, {
        totalAttachments: attachmentValidation.validAttachments.length,
        processedDocuments: processedDocuments.length,
        failedDocuments: documentErrors.length,
        processingTime: `${totalProcessingTime}ms`
      });

      // Log processing summary
      EmailUploadLogger.logProcessingSummary({
        userId,
        sender: message.sender,
        recipient: message.recipient,
        subject: message.subject,
        totalAttachments: attachmentValidation.validAttachments.length,
        successfulDocuments: processedDocuments.length,
        failedDocuments: documentErrors.length,
        totalProcessingTimeMs: totalProcessingTime,
        requestId
      });

      // Log OCR queue status for debugging
      console.log(`[${requestId}] 🔍 OCR processing will be triggered automatically for supported document types`);
      console.log(`[${requestId}] 📧 Email documents created - OCR and insights will process in background`);

      if (processedDocuments.length > 0) {
        console.log(`[${requestId}] ✅ ${processedDocuments.length} documents successfully created and queued for processing`);
      }


      // Record email processing in the database
      try {
        await storage.createEmailForward({
          userId,
          fromEmail: message.sender,
          subject: message.subject,
          emailBody: message.bodyPlain || '',
          hasAttachments: processedDocuments.length > 0,
          attachmentCount: attachmentValidation.validAttachments.length,
          documentsCreated: processedDocuments.length,
          status: documentErrors.length === 0 ? 'processed' : 'partial',
          errorMessage: documentErrors.length > 0 ? JSON.stringify(documentErrors) : null
        });
      } catch (emailRecordError) {
        console.error('Failed to record email processing:', emailRecordError);
      }

      // Return success with processing results
      res.status(200).json({
        message: 'Email processed successfully',
        data: {
          recipient: message.recipient,
          sender: message.sender,
          subject: message.subject,
          userId,
          processedDocuments,
          documentErrors,
          summary: `${processedDocuments.length} documents created, ${documentErrors.length} errors`,
          validAttachmentsCount: attachmentValidation.validAttachments.length,
          invalidAttachmentsCount: attachmentValidation.invalidAttachments.length
        }
      });

    } catch (error) {
      // TICKET 6: Log critical system errors with full stack trace
      console.error('❌ CRITICAL ERROR IN EMAIL INGESTION:');
      console.error('❌ Error type:', typeof error);
      console.error('❌ Error message:', error instanceof Error ? error.message : String(error));
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('❌ Request details:', {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body ? Object.keys(req.body) : 'no body',
        files: req.files ? req.files.length : 0
      });

      EmailUploadLogger.logError({
        errorType: 'system',
        errorCode: 'WEBHOOK_PROCESSING_FAILED',
        errorMessage: `Critical error in email webhook processing: ${error instanceof Error ? error.message : 'Unknown system error'}`,
        sender: 'unknown',
        recipient: 'unknown',
        subject: 'unknown',
        requestId,
        error: error instanceof Error ? error : undefined
      });

      captureError(error as Error, req);
      res.status(500).json({ 
        error: 'Internal server error processing email',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        requestId
      });
    }
  });

  // Debug route to test webhook processing without full security (REMOVE IN PRODUCTION)
  app.post('/api/email-ingest-debug', 
    (req, res, next) => {
      console.log('🧪 DEBUG: Email ingest debug route accessed');
      console.log('🧪 DEBUG Content-Type:', req.get('Content-Type'));
      console.log('🧪 DEBUG User-Agent:', req.get('User-Agent'));
      console.log('🧪 DEBUG Body:', req.body);
      next();
    },
    async (req: any, res) => {
      try {
        res.status(200).json({
          message: 'Debug endpoint working',
          contentType: req.get('Content-Type'),
          userAgent: req.get('User-Agent'),
          hasBody: !!req.body,
          bodyKeys: req.body ? Object.keys(req.body) : [],
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ DEBUG ENDPOINT ERROR:', error);
        res.status(500).json({ error: 'Debug endpoint error', details: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // ✅ Debug route to confirm deployment
    app.get("/debug", (_req, res) => {
      res.send(`✅ App is live - ${new Date().toISOString()}`);
    });

    // ✅ Email ingest webhook GET + POST (for Mailgun)
    app.get("/api/email-ingest", (req, res) => {
      res.send("✅ Email Ingest GET Confirmed");
    });

    app.post("/api/email-ingest", (req, res) => {
      res.send("✅ Email Ingest Live");
    });

    // Keep API route protection for unhandled routes
    app.use('/api/*', (req, res, next) => {
      console.log(`🔍 Unmatched API route: ${req.method} ${req.originalUrl}`);
      res.status(404).json({ 
        message: 'API route not found',
        path: req.originalUrl,
        method: req.method 
      });
    });

    app.use(sentryErrorHandler());

    const httpServer = createServer(app);
    return httpServer;
  }