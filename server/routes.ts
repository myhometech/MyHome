import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupSimpleAuth, requireAuth } from "./simpleAuth";
import { AuthService } from "./authService";
import { loadHouseholdRole, requireRole, requireDocumentAccess, getRoleDisplayName, getRolePermissions, hasRole } from "./middleware/roleBasedAccess";
import { AuditLogger } from "./auditLogger";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertDocumentSchema, insertCategorySchema, insertExpiryReminderSchema, insertDocumentInsightSchema, insertBlogPostSchema, loginSchema, registerSchema, insertUserAssetSchema, insertManualTrackedEventSchema, createVehicleSchema, updateVehicleUserFieldsSchema, searchSnippetsRequestSchema, chatRequestSchema, ChatRequest } from "@shared/schema";
import { EmailUploadLogger } from './emailUploadLogger';
import { dvlaLookupService } from './dvlaLookupService';
import { vehicleInsightService } from './vehicleInsightService';
import { z } from 'zod';
import { extractTextFromImage, supportsOCR, processDocumentOCRAndSummary, processDocumentWithDateExtraction, isPDFFile } from "./ocrService";

import { tagSuggestionService } from "./tagSuggestionService";
import { aiInsightService } from "./aiInsightService";

// Force AI service initialization during server startup
console.log('🚀 [STARTUP] Forcing AI services to initialize...');
const aiServiceStatus = aiInsightService.isServiceAvailable();
console.log(`📊 [STARTUP] AI Insight Service Status: ${aiServiceStatus ? 'AVAILABLE' : 'DISABLED'}`);
import { pdfConversionService } from "./pdfConversionService.js";
import { EncryptionService } from "./encryptionService.js";
import docxConversionService from './docxConversionService';
import { featureFlagService } from './featureFlagService';
import { EmailFeatureFlagService } from './emailFeatureFlags';
// Removed incorrect import - will use storage.createEmailBodyDocument
import { sentryRequestHandler, sentryErrorHandler, captureError, trackDatabaseQuery } from './monitoring';

import { StorageService, storageProvider } from './storage/StorageService';
import { backupRoutes } from './routes/backup.js';
import advancedScanningRoutes from './routes/advancedScanning.js';
import { llmUsageRoutes } from './routes/llmUsageRoutes.js';
import documentsRouter from './routes/documents.js';
import testRouter from './routes/testRoutes';
import { securityHeaders, rateLimiter, corsOptions, securityLogger } from './middleware/security.js';
import { enhancedHealthCheck } from './middleware/healthCheck.js';
import { setupOCRErrorRoutes } from './routes/ocrErrorRoutes.js';
import cors from 'cors';
import passport from './passport';
import authRoutes from './authRoutes';
import { parseMailgunWebhook, verifyMailgunSignature, extractUserIdFromRecipient, validateEmailAttachments } from './mailgunService';
import { renderAndCreateEmailBodyPdf } from './emailBodyPdfService';
import { emailRenderWorker } from './emailRenderWorker';
import { workerHealthChecker } from './workerHealthCheck';
import { setupMultiPageScanUpload } from './routes/multiPageScanUpload';
import { chatOrchestrationService } from './chatOrchestrationService';
import { 
  mailgunIPWhitelist, 
  mailgunWebhookRateLimit, 
  mailgunWebhookLogger, 
  validateMailgunContentType,
  mailgunSignatureVerification
} from './middleware/mailgunSecurity';

// Import real database and schema objects
import { db } from "./db";
import { users, documents, featureFlags } from "@shared/schema";
import { eq, desc, ilike, and, inArray, isNotNull, gte, lte, sql, or } from "drizzle-orm";

// Import proper types
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./middleware/auth";
import 'express-session';

// Helper function to ensure user has correct shape
function asAuthenticatedRequest(req: Request): AuthenticatedRequest {
  return req as AuthenticatedRequest;
}

// Session type augmentation
declare module 'express-session' {
  interface SessionData {
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
}

// CloudConvert initialization - no browser setup needed
import cloudConvertHealthRoutes from './routes/cloudConvertHealth.js';

// Import storage service - this is the corrected import
import { storage } from "./storage";

// Helper function to extract short sender name (display name if present, else domain)
function extractFromShort(sender: string): string {
  if (!sender) return 'Unknown Sender';

  // Check for display name in format "Display Name <email@domain.com>"
  const displayNameMatch = sender.match(/^([^<]+)<.*>$/);
  if (displayNameMatch) {
    return displayNameMatch[1].trim();
  }

  // No display name, extract domain from email
  const emailMatch = sender.match(/@([^@]+)$/);
  if (emailMatch) {
    return emailMatch[1]; // Return domain
  }

  // Fallback to first 20 chars of sender
  return sender.length > 20 ? sender.substring(0, 20) + '...' : sender;
}

// Helper function to truncate title to specified max length
function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + '...';
}

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
    fieldSize: 10 * 1024 * 1024, // Reduce from 50MB to 10MB to prevent memory issues
    fields: 100 // Reduce from 1000 to 100 fields to speed up parsing
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
function getUserId(req: AuthenticatedRequest): string {
  try {
    if (req.user?.id) {
      console.log(`✅ Found user ID in req.user: ${req.user.id}`);
      return req.user.id;
    }
    if (req.session && 'user' in req.session && req.session.user?.id) {
      console.log(`✅ Found user ID in session: ${req.session.user.id}`);
      return req.session.user.id;
    }
    console.log('❌ No user ID found in request or session');
    console.log('❌ req.user:', req.user);
    console.log('❌ req.session?.user:', req.session && 'user' in req.session ? req.session.user : 'no user in session');
    throw new Error("User not authenticated");
  } catch (error) {
    console.error('❌ Error in getUserId:', error);
    throw new Error("Authentication error");
  }
}

// TICKET 4: Helper function to generate dashboard-ready messages
function generateInsightMessage(insight: any, documentName: string): string {
  // Validate inputs
  if (!insight || typeof insight !== 'object') {
    return `${documentName}: Insight not available`;
  }

  const docName = documentName.length > 30 ? documentName.substring(0, 30) + '...' : documentName;
  const insightType = insight.type || 'unknown';
  const insightTitle = insight.title || 'Untitled insight';

  switch (insightType) {
    case 'key_dates':
      return `${docName}: Important date identified - ${insightTitle}`;
    case 'action_items':
      return `${docName}: Action required - ${insightTitle}`;
    case 'financial_info':
      return `${docName}: Financial information - ${insightTitle}`;
    case 'compliance':
      return `${docName}: Compliance requirement - ${insightTitle}`;
    case 'summary':
      return `${docName}: Document summary available`;
    case 'contacts':
      return `${docName}: Contact information found - ${insightTitle}`;
    default:
      return `${docName}: ${insightTitle}`;
  }
}

// TICKET 4: Helper function to extract due dates from insight content
function extractDueDate(insight: any): string | null {
  // Validate insight object
  if (!insight || typeof insight !== 'object') {
    return null;
  }

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
  const insightType = insight.type || '';
  const insightPriority = insight.priority || '';
  if (insightType === 'action_items' && insightPriority === 'high') {
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
    if (!req.user || req.user.role !== 'admin') {
      console.log('❌ [ADMIN CHECK] Admin access denied for user:', req.user?.email, 'role:', req.user?.role);
      return res.status(403).json({ error: "Admin access required" });
    }
    console.log('✅ [ADMIN CHECK] Admin access granted');
    next();
  } catch (error) {
    console.error('❌ [ADMIN CHECK] Admin middleware error:', error);
    res.status(500).json({ error: "Authorization error" });
  }
};

// Middleware to check if chat is enabled for the user
const requireChatEnabled = async (req: any, res: any, next: any) => {
  try {
    const userId = getUserId(req);
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { chatConfigService } = await import('./chatConfig.js');
    const context = {
      userId,
      userTier: user.subscriptionTier as 'free' | 'beginner' | 'pro' | 'duo',
      sessionId: req.sessionID,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
    };

    const isChatEnabled = await chatConfigService.isChatEnabled(context);

    if (!isChatEnabled) {
      console.log(`❌ [CHAT CHECK] Chat access denied for user: ${user.email} (tier: ${user.subscriptionTier})`);
      return res.status(403).json({ 
        error: "Chat feature not available", 
        message: "Chat system is not enabled for your account" 
      });
    }

    console.log(`✅ [CHAT CHECK] Chat access granted for user: ${user.email}`);
    next();
  } catch (error) {
    console.error('❌ [CHAT CHECK] Chat middleware error:', error);
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

  // Setup simple authentication
  setupSimpleAuth(app);

  // Initialize Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // OAuth authentication routes
  app.use('/auth', authRoutes);

  // API Authentication routes (must be before the middleware)
  app.post('/api/auth/login', async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await AuthService.authenticateEmailUser(email, password);

      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Store user in session compatible with simpleAuth
      (req.session as any).user = user;
      (req.session as any).userId = user.id;
      (req.session as any).authProvider = "email";

      console.log(`Email login successful for user: ${user.id}`);

      // Force session save
      req.session.save((err: any) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Session save failed" });
        }

        res.json({ 
          message: "Login successful", 
          user: { 
            id: user.id, 
            email: user.email, 
            firstName: user.firstName, 
            lastName: user.lastName 
          } 
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

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

  // TICKET 3: Load household role for authenticated API routes (exclude auth routes)
  app.use('/api', (req, res, next) => {
    // Skip middleware for auth routes and email-ingest webhook
    if (req.path.includes('/auth/') || req.path.includes('/email-ingest')) {
      return next();
    }

    return requireAuth(req, res, () => loadHouseholdRole(req as AuthenticatedRequest, res, next));
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
  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      const user = req.user || req.session?.user;

      if (!user) {
        console.log("No user found in req.user or req.session.user");
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Always fetch the latest user data from database to ensure subscription tier is up to date
      try {
        console.log("Fetching fresh user data from database:", user.id);
        const fullUser = await AuthService.findUserById(user.id);
        if (fullUser) {
          console.log("Returning fresh user data with subscription tier:", fullUser.subscriptionTier);
          return res.json({
            id: fullUser.id,
            email: fullUser.email,
            firstName: fullUser.firstName,
            lastName: fullUser.lastName,
            role: fullUser.role,
            authProvider: fullUser.authProvider || req.session?.authProvider,
            subscriptionTier: fullUser.subscriptionTier || 'free'
          });
        }
      } catch (dbError) {
        console.error("Database error:", dbError);
      }

      // Fallback to session data if database fetch fails
      if (user.id && user.email) {
        console.log("Returning user from session/req:", user.id);
        return res.json({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          authProvider: user.authProvider || req.session?.authProvider,
          subscriptionTier: user.subscriptionTier || user.subscription_tier || 'free'
        });
      }

      // Fallback: return partial user data if we have basic info
      if (user.id) {
        console.log("Returning partial user data:", user.id);
        return res.json({
          id: user.id,
          email: user.email || 'unknown@email.com',
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          role: user.role || 'user',
          authProvider: user.authProvider || req.session?.authProvider || 'session'
        });
      }

      return res.status(404).json({ message: "User not found" });
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
      const updatedCategory = await storage.updateCategory(categoryId, updates);

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
      const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
      const searchQuery = req.query.search as string;
      const expiryFilter = req.query.expiryFilter as 'expired' | 'expiring-soon' | 'this-month' | undefined;

      if (!searchQuery || searchQuery.trim().length === 0) {
        console.log('🔍 Search query empty, returning empty results.');
        return res.json([]);
      }

      console.log(`🔍 Searching documents for user ${userId} with query: "${searchQuery}", categoryId: ${categoryId}, expiryFilter: ${expiryFilter}`);

      // Use regular document search with filtering as reliable fallback
      const allDocuments = await storage.getDocuments(userId, categoryId, undefined, expiryFilter); // Pass undefined for search to get all
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

      console.log(`🔍 Found ${filteredResults.length} documents matching query "${searchQuery}"`);
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

      // TICKET 7: Email metadata filters and sorting
      const filters: any = {};
      if (req.query['filter[source]']) {
        filters.source = req.query['filter[source]'];
      }
      if (req.query['filter[email.subject]']) {
        filters['email.subject'] = req.query['filter[email.subject]'];
      }
      if (req.query['filter[email.from]']) {
        filters['email.from'] = req.query['filter[email.from]'];
      }
      if (req.query['filter[email.messageId]']) {
        filters['email.messageId'] = req.query['filter[email.messageId]'];
      }
      if (req.query['filter[email.receivedAt][gte]'] || req.query['filter[email.receivedAt][lte]']) {
        filters['email.receivedAt'] = {};
        if (req.query['filter[email.receivedAt][gte]']) {
          filters['email.receivedAt'].gte = req.query['filter[email.receivedAt][gte]'];
        }
        if (req.query['filter[email.receivedAt][lte]']) {
          filters['email.receivedAt'].lte = req.query['filter[email.receivedAt][lte]'];
        }
      }

      const sort = req.query.sort as string;

      console.log(`[DOCUMENTS-FETCH] Fetching documents for user ${userId} with category: ${categoryId}, search: "${search}", expiryFilter: ${expiryFilter}, filters: ${JSON.stringify(filters)}, sort: ${sort}`);

      const documents = await storage.getDocuments(userId, categoryId, search, expiryFilter, Object.keys(filters).length ? filters : undefined, sort);
      console.log(`[DOCUMENTS-FETCH] Found ${documents.length} documents.`);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post('/api/documents', requireAuth, upload.single('file'), async (req: any, res) => {
    let tempFilePath = null;
    let convertedFilePath = null;

    try {
      if (!req.file) {
        console.log('❌ No file in upload request');
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = getUserId(req);
      if (!userId) {
        console.log('❌ No userId found in request');
        return res.status(401).json({ message: "Authentication required" });
      }

      const { categoryId, tags, expiryDate } = req.body;
      tempFilePath = req.file.path;

      console.log(`📤 Starting upload for user ${userId}: ${req.file.originalname} (${req.file.size} bytes)`);

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
            finalFilePath = conversionResult.pdfPath;
            finalMimeType = 'application/pdf';
            finalDocumentData = {
              ...documentData,
              filePath: conversionResult.pdfPath,
              mimeType: 'application/pdf',
              name: documentData.name.replace(/\.(docx|doc)$/i, '.pdf'),
              fileName: documentData.fileName.replace(/\.(docx|doc)$/i, '.pdf'),
              tags: [...(documentData.tags || []), 'converted-from-docx']
            };

            console.log(`✅ DOCX converted to PDF for viewing: ${conversionResult.pdfPath}`);
          } else {
            console.warn(`DOCX conversion failed: ${conversionResult.error}, keeping original DOCX`);
          }
        } catch (conversionError) {
          console.error('DOCX conversion error:', conversionError);
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
              try {
                if (fs.existsSync(req.file.path)) {
                  fs.unlinkSync(req.file.path);
                }
              } catch (e) {
                console.warn('Failed to cleanup original image file:', e);
              }
            }, 1000);

            console.log(`Successfully converted scanned document to PDF: ${conversionResult.pdfPath}`);
          } else {
            console.warn(`PDF conversion failed: ${conversionResult.error}, keeping original image`);
          }
        } catch (conversionError) {
          console.error('PDF conversion error:', conversionError);
        }
      }

      // Generate unique document ID
      const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const storageKey = StorageService.generateFileKey(userId, documentId, finalDocumentData.fileName);

      // Upload to cloud storage
      let cloudStorageKey = '';
      try {
        const storageService = storageProvider();

        // Verify storage service is available
        if (!storageService) {
          throw new Error('Storage service not available');
        }

        // Read file and upload to cloud storage
        const fileBuffer = await fs.promises.readFile(finalFilePath);
        if (!fileBuffer || fileBuffer.length === 0) {
          throw new Error('File is empty or unreadable');
        }

        console.log(`📤 Uploading ${fileBuffer.length} bytes to storage key: ${storageKey}`);
        cloudStorageKey = await storageService.upload(fileBuffer, storageKey, finalMimeType);

        console.log(`✅ File uploaded to cloud storage: ${cloudStorageKey}`);
      } catch (storageError) {
        console.error('❌ Cloud storage upload failed:', storageError);
        console.error('❌ Storage error details:', {
          finalFilePath,
          finalMimeType,
          storageKey,
          error: storageError instanceof Error ? storageError.message : String(storageError)
        });

        // Clean up local file
        try {
          if (fs.existsSync(finalFilePath)) {
            fs.unlinkSync(finalFilePath);
          }
          if (finalFilePath !== req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup files after storage error:', cleanupError);
        }

        // Provide more specific error message
        const errorMessage = storageError instanceof Error && storageError.message.includes('credentials') 
          ? "Storage service configuration error" 
          : "File upload to cloud storage failed";

        return res.status(500).json({ 
          message: errorMessage,
          error: storageError instanceof Error ? storageError.message : "Storage error"
        });
      }

      // Setup encryption metadata
      let encryptedDocumentKey = '';
      let encryptionMetadata = '';

      try {
        const documentKey = EncryptionService.generateDocumentKey();
        encryptedDocumentKey = EncryptionService.encryptDocumentKey(documentKey);

        encryptionMetadata = JSON.stringify({
          storageType: 'cloud',
          storageKey: cloudStorageKey,
          encrypted: true,
          algorithm: 'AES-256-GCM'
        });

        console.log(`✅ Document encryption setup completed for: ${cloudStorageKey}`);
      } catch (encryptionError) {
        console.error('❌ Document encryption setup failed:', encryptionError);
        // Clean up cloud storage and local files
        try {
          const storageService = storageProvider();
          await storageService.delete(cloudStorageKey);
        } catch (cleanupError) {
          console.error('Failed to cleanup cloud storage after encryption error:', cleanupError);
        }
        try {
          if (fs.existsSync(finalFilePath)) {
            fs.unlinkSync(finalFilePath);
          }
          if (finalFilePath !== req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup files after encryption error:', cleanupError);
        }
        return res.status(500).json({ message: "Document encryption setup failed" });
      }

      // Create document record with cloud storage path
      const cloudDocumentData = {
        ...finalDocumentData,
        filePath: cloudStorageKey,
        encryptedDocumentKey,
        encryptionMetadata,
        isEncrypted: true
      };

      const validatedData = insertDocumentSchema.parse(cloudDocumentData);
      const document = await storage.createDocument(validatedData);

      console.log(`✅ Document created in database: ${document.id}`);

      // TICKET 4: Log document upload event
      const userHousehold = await storage.getUserHousehold(userId);
      await AuditLogger.logUpload(document.id, userId, userHousehold?.id, {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: finalMimeType,
      });

      // Queue background OCR processing
      try {
        const { ocrQueue } = await import('./ocrQueue.js');
        await ocrQueue.addJob({
          documentId: document.id,
          fileName: document.fileName,
          filePathOrGCSKey: cloudStorageKey,
          mimeType: finalMimeType,
          userId,
          priority: 5
        });
        console.log(`✅ OCR job queued for document ${document.id}`);
      } catch (jobError) {
        console.error('⚠️ Failed to queue OCR job:', jobError);
        // Don't fail the upload if OCR queueing fails
      }

      // Clean up local temporary files
      try {
        if (fs.existsSync(finalFilePath)) {
          fs.unlinkSync(finalFilePath);
        }
        if (finalFilePath !== req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        console.log(`✅ Local temporary files cleaned up`);
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup local files:', cleanupError);
      }

      res.status(201).json(document);
    } catch (error) {
      console.error("❌ Error uploading document:", error);
      console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack trace');

      // Clean up any uploaded files on error
      const filesToCleanup = [tempFilePath, convertedFilePath].filter(Boolean);
      for (const filePath of filesToCleanup) {
        try {
          if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🧹 Cleaned up file: ${filePath}`);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup file on error:', cleanupError);
        }
      }

      // Provide specific error messages based on error type
      let errorMessage = "Failed to upload document";
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('Authentication')) {
          errorMessage = "Authentication required";
          statusCode = 401;
        } else if (error.message.includes('storage')) {
          errorMessage = "Storage service unavailable";
        } else if (error.message.includes('file size') || error.message.includes('too large')) {
          errorMessage = "File too large";
          statusCode = 413;
        } else if (error.message.includes('file type') || error.message.includes('unsupported')) {
          errorMessage = "Unsupported file type";
          statusCode = 400;
        }
      }

      res.status(statusCode).json({ 
        message: errorMessage,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Document verification endpoint for insights
  app.get('/api/documents/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      console.log(`[DOCUMENT-VERIFY] Verifying document ${documentId} for user ${userId}`);

      if (isNaN(documentId)) {
        console.log(`[DOCUMENT-VERIFY] Invalid document ID: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        console.log(`[DOCUMENT-VERIFY] Document ${documentId} not found for user ${userId}`);
        return res.status(404).json({ message: "Document not found" });
      }

      console.log(`[DOCUMENT-VERIFY] Document ${documentId} verified: ${document.name}`);
      res.json({
        id: document.id,
        name: document.name,
        fileName: document.fileName,
        mimeType: document.mimeType,
        userId: document.userId,
        exists: true
      });
    } catch (error) {
      console.error(`[DOCUMENT-VERIFY] Error verifying document ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to verify document" });
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

  // Document preview endpoint - optimized for fast PDF loading
  app.get('/api/documents/:id/preview', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Fast database lookup
      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Check for cloud storage documents first
      if (document.gcsPath && document.isEncrypted) {
        // This is a cloud storage document, handle it below
        console.log(`📁 Cloud storage document detected: ${documentId} (path: ${document.gcsPath})`);
      } else if (!document.encryptionMetadata && !fs.existsSync(document.filePath)) {
        // Only check local files for non-cloud storage documents
        console.log(`Local file not found: ${document.filePath} for document ${documentId}`);
        return res.status(404).json({ 
          message: "Document file not found.",
          code: "FILE_NOT_FOUND",
          documentId: documentId,
          fileName: document.fileName
        });
      }


      // Handle cloud storage documents (new system) - both encrypted and unencrypted
      if (document.gcsPath && document.isEncrypted && !document.encryptionMetadata) {
        // Handle cloud storage documents without encryption metadata (direct GCS storage)
        console.log(`📁 GCS PREVIEW: Loading unencrypted document from ${document.gcsPath}`);

        const storageService = storageProvider();
        try {
          const fileBuffer = await storageService.download(document.gcsPath);
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
            message: "Failed to load document preview from cloud storage",
            error: downloadError instanceof Error ? downloadError.message : 'Unknown error' 
          });
        }
      } else if (document.isEncrypted && document.encryptionMetadata) {
        try {
          const metadata = JSON.parse(document.encryptionMetadata);

          // Check if this is a cloud storage document
          if (metadata.storageType === 'cloud' && metadata.storageKey) {
            console.log(`📁 GCS PREVIEW: Loading document ${metadata.storageKey} from cloud storage`);

            const storage = storageProvider();
            try {
              // Always proxy the file through our server to prevent modal breaking redirects
              console.log('📁 GCS PREVIEW: Proxying document content to maintain modal functionality');
              const fileBuffer = await storage.download(metadata.storageKey);
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

      // Handle unencrypted documents
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
  app.patch('/api/documents/:id', requireAuth, requireDocumentAccess('write'), async (req: AuthenticatedRequest, res) => {
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

      // TICKET 4: Get original document for audit logging
      const originalDocument = await storage.getDocument(documentId, userId);
      const userHousehold = await storage.getUserHousehold(userId);

      const updatedDocument = await storage.updateDocument(documentId, userId, {
        name: name ? name.trim() : undefined,
        expiryDate: expiryDate === '' ? null : expiryDate
      });

      if (!updatedDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Log rename if name changed
      if (name && originalDocument && originalDocument.name !== name.trim()) {
        await AuditLogger.logRename(documentId, userId, userHousehold?.id, {
          oldName: originalDocument.name,
          newName: name.trim(),
        });
      }

      // Log general update for other changes
      if (expiryDate !== undefined && originalDocument?.expiryDate !== (expiryDate === '' ? null : expiryDate)) {
        await AuditLogger.logUpdate(documentId, userId, userHousehold?.id, {
          field: 'expiryDate',
          oldValue: originalDocument?.expiryDate,
          newValue: expiryDate === '' ? null : expiryDate,
        });
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
        const updatedDocument = await storage.updateDocumentOCR(documentId, extractedText);
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

      // Reprocess the document with date extraction
      await processDocumentWithDateExtraction(
        document.id,
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

  // DOC-501: Generate AI insights for a document
  app.post('/api/documents/:id/insights', requireAuth, async (req: any, res) => {
    const startTime = Date.now();
    let documentId: number;

    try {
      const userId = getUserId(req);
      documentId = parseInt(req.params.id);
      console.log(`🔍 [INSIGHT-DEBUG] Starting insight generation for document ${documentId}, user ${userId}`);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Check if AI Insight service is available
      if (!aiInsightService.isServiceAvailable()) {
        const status = aiInsightService.getServiceStatus();
        console.log(`❌ [INSIGHT-DEBUG] AI service not available for document ${documentId}:`, status);
        return res.status(503).json({ 
          message: "AI Insight service not available",
          reason: status.reason,
          status: status,
          debug: {
            hasMistralKey: !!process.env.MISTRAL_API_KEY,
            userTier: req.user?.subscriptionTier || 'unknown'
          }
        });
      }

      console.log(`✅ [INSIGHT-DEBUG] AI service is available for document ${documentId}`);

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        console.log(`❌ [INSIGHT-DEBUG] Document ${documentId} not found`);
        return res.status(404).json({ message: "Document not found" });
      }

      console.log(`📄 [INSIGHT-DEBUG] Document found: ${document.name}, hasText: ${!!document.extractedText}, textLength: ${document.extractedText?.length || 0}`);

      // Auto-trigger OCR if extracted text is missing
      if (!document.extractedText || document.extractedText.trim() === '') {
        console.log(`🔄 AUTO-OCR TRIGGER: Document ${documentId} missing extracted text, triggering OCR before insights`);

        // Check if document supports OCR
        if (!supportsOCR(document.mimeType)) {
          return res.status(400).json({ 
            message: `Document type ${document.mimeType} does not support text extraction. Cannot generate insights.` 
          });
        }

        try {
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

      console.log(`🤖 [INSIGHT-DEBUG] Calling AI service for document ${documentId}`);

      let insights;
      try {
        insights = await aiInsightService.generateDocumentInsights(
          document.name,
          document.extractedText,
          document.mimeType,
          userId
        );
        console.log(`✅ [INSIGHT-DEBUG] AI service returned insights:`, insights ? 'success' : 'null', insights?.insights?.length || 0, 'insights');
      } catch (aiError: any) {
        console.error(`❌ [INSIGHT-DEBUG] AI service failed for document ${documentId}:`, aiError);
        return res.status(500).json({
          success: false,
          message: "AI insight generation failed",
          error: aiError.message,
          processingTime: Date.now() - startTime
        });
      }

      // Ensure insights is properly structured
      if (!insights || !insights.insights || !Array.isArray(insights.insights)) {
        console.log(`⚠️ [INSIGHT-DEBUG] No valid insights returned for document ${documentId}:`, { 
          hasInsights: !!insights, 
          hasInsightsArray: !!insights?.insights, 
          isArray: Array.isArray(insights?.insights),
          insightsType: typeof insights?.insights
        });
        return res.status(200).json({
          success: true,
          insights: [],
          documentType: insights?.documentType || 'Unknown',
          recommendedActions: insights?.recommendedActions || [],
          processingTime: insights?.processingTime || 0,
          confidence: insights?.confidence || 0,
          message: "No insights could be generated for this document"
        });
      }

      console.log(`💾 [INSIGHT-DEBUG] Storing ${insights.insights.length} insights in database for document ${documentId}`);

      // Store insights in database with TICKET 4 dashboard fields
      try {
        for (const insight of insights.insights) {
          try {
            // TICKET 4: Generate dashboard-ready message and action URL with error handling
            let message, actionUrl, dueDate;

            try {
              message = generateInsightMessage(insight, document.name);
              actionUrl = `/insights?documentId=${documentId}`;
              dueDate = extractDueDate(insight);
            } catch (helperError: any) {
              console.error(`❌ [INSIGHT-DEBUG] Helper function error for insight ${insight.id}:`, helperError);
              message = `${document.name}: ${insight.title || 'Untitled insight'}`;
              actionUrl = `/insights?documentId=${documentId}`;
              dueDate = null;
            }

            console.log(`🔍 [INSIGHT-DEBUG] Processing insight: ${insight.id}, type: ${insight.type}, confidence: ${insight.confidence}`);

            await storage.createDocumentInsight({
              documentId, // Should be number from parseInt above
              userId,
              insightId: insight.id,
              message, // TICKET 4: User-facing message
              type: insight.type,
              title: insight.title,
              content: insight.content,
              confidence: Math.round((insight.confidence || 0.5) * 100).toString(), // Convert to 0-100 scale as string
              priority: insight.priority,
              dueDate, // TICKET 4: Due date for actionable insights
              actionUrl, // TICKET 4: URL to take action
              status: 'open', // TICKET 4: Default status
              metadata: insight.metadata || {},
              processingTime: insights.processingTime,
              aiModel: 'mistral-7b-instruct',
              source: 'ai',
              // INSIGHT-101: Add tier classification
              tier: insight.tier,
              insightVersion: 'v2.0',
              generatedAt: new Date()
            });

            console.log(`✅ [INSIGHT-DEBUG] Successfully stored insight ${insight.id}`);
          } catch (insightError: any) {
            console.error(`❌ [INSIGHT-DEBUG] Failed to store insight ${insight.id}:`, insightError);
            // Continue with next insight instead of failing entire request
          }
        }
      } catch (storageError: any) {
        console.error(`❌ [INSIGHT-DEBUG] Database storage failed for document ${documentId}:`, storageError);
        // Still return the insights even if storage failed
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
        insights: insights.insights || [],
        documentType: insights.documentType || 'Unknown',
        recommendedActions: insights.recommendedActions || [],
        processingTime: insights.processingTime || 0,
        confidence: insights.confidence || 0
      });

    } catch (error) {
      console.error("Error generating document insights:", error);
      captureError(error, req);

      if (error.message.includes('quota exceeded')) {
        return res.status(429).json({ 
          message: "OpenAI API quota exceeded. Please check your billing and usage limits." 
        });
      }

      if (error.message.includes('Failed to parse AI insight response')) {
        return res.status(200).json({ 
          success: true,
          insights: [],
          documentType: 'Unknown',
          recommendedActions: [],
          processingTime: 0,
          confidence: 0,
          message: "Document processed but no insights could be extracted"
        });
      }

      res.status(500).json({ message: "Failed to generate document insights" });
    }
  });

  // INSIGHT-102: Get insights with optional filters and tier support
  app.get('/api/insights', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserId(req);
      const {
        status = 'all',
        priority = 'all',
        type = 'all',
        page = '1',
        limit = '20'
      } = req.query;

      console.log(`[INSIGHTS-DEBUG] Fetching insights for user ${userId} with filters:`, {
        status, priority, type, page, limit
      });

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      // Convert 'all' to undefined for storage layer
      const statusFilter = status === 'all' ? undefined : status;
      const priorityFilter = priority === 'all' ? undefined : priority;
      const typeFilter = type === 'all' ? undefined : type;

      const { insights: allInsights, totalCount } = await storage.getPaginatedInsights(
        userId,
        statusFilter,
        priorityFilter,
        typeFilter,
        limitNum,
        offset
      );

      // Filter out dismissed insights unless specifically requested
      const showDismissed = req.query.include_dismissed === 'true';
      const insights = showDismissed ? allInsights : allInsights.filter(insight => insight.status !== 'dismissed');

      // Log insights with their document IDs for debugging
      console.log(`[INSIGHTS-DEBUG] Found ${insights.length} insights with document IDs:`, 
        insights.map(i => ({ id: i.id, documentId: i.documentId, title: i.title })));

      res.json({
        success: true,
        insights,
        totalCount: showDismissed ? totalCount : insights.length, // Adjust totalCount if filtering
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum)
      });

    } catch (error) {
      console.error('Failed to fetch insights:', error);
      res.status(500).json({ message: 'Failed to fetch insights' });
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

      // Calculate statistics (exclude dismissed insights)
      const activeInsights = combinedInsights.filter(i => i.status !== 'dismissed');
      const openInsights = activeInsights.filter(i => i.status === 'open' || !i.status);
      const resolvedInsights = activeInsights.filter(i => i.status === 'resolved');
      const highPriority = activeInsights.filter(i => i.priority === 'high' && (i.status === 'open' || !i.status));

      // Type-specific metrics (open only) - exclude unwanted types
      const manualEventCount = activeInsights.filter(i => i.type === 'manual_event' && (i.status === 'open' || !i.status));
      const summaryInsights = activeInsights.filter(i => i.type === 'summary' && (i.status === 'open' || !i.status));
      const contactInsights = activeInsights.filter(i => i.type === 'contacts' && (i.status === 'open' || !i.status));

      // Upcoming deadlines (within 30 days)
      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
      const upcomingDeadlines = activeInsights.filter(i => {
        if (!i.dueDate || i.status !== 'open') return false;
        const dueDate = new Date(i.dueDate);
        return dueDate >= today && dueDate <= thirtyDaysFromNow;
      });

      res.json({
        total: activeInsights.length,
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
          medium: activeInsights.filter(i => i.priority === 'medium' && (i.status === 'open' || !i.status)).length,
          low: activeInsights.filter(i => i.priority === 'low' && (i.status === 'open' || !i.status)).length
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

      const updatedInsight = await storage.updateInsightStatus(insightId, status);

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

      const updatedInsight = await storage.updateInsightStatus(insightId, status);

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

      const deletedInsight = await storage.deleteInsight(insightId);

      // Note: deleteInsight returns void, so we don't check the result

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

      await storage.deleteDocumentInsight(insightId);
      res.json({ success: true, message: "Insight deleted successfully" });

    } catch (error) {
      console.error("Error deleting document insight:", error);
      res.status(500).json({ message: "Failed to delete document insight" });
    }
  });

  // Flag/unflag a specific insight for incorrect information
  app.patch('/api/documents/:id/insights/:insightId/flag', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);
      const insightId = req.params.insightId;
      const { flagged, reason } = req.body;

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Validate flagged parameter
      if (typeof flagged !== 'boolean') {
        return res.status(400).json({ message: "Invalid flagged parameter - must be boolean" });
      }

      // Check if document exists and user has access
      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Update insight flag status
      const updatedInsight = await storage.flagDocumentInsight(insightId, flagged, reason);

      if (!updatedInsight) {
        return res.status(404).json({ message: "Insight not found" });
      }

      // Log the flag action for monitoring
      const action = flagged ? 'flagged' : 'unflagged';
      console.log(`📍 Insight ${action} by user ${userId}: document ${documentId}, insight ${insightId}, reason: ${reason || 'none'}`);

      res.json({ 
        success: true, 
        message: `Insight ${action} successfully`,
        insight: updatedInsight 
      });

    } catch (error) {
      console.error("Error flagging insight:", error);
      captureError(error as Error, req);
      res.status(500).json({ message: "Failed to update insight flag" });
    }
  });

  // Bulk delete documents - MUST come before '/api/documents/:id' route
  app.delete('/api/documents/bulk-delete', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Request validation

      // Ensure body exists and has the right structure
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ 
          message: "Invalid request body", 
          debug: { 
            bodyType: typeof req.body, 
            hasBody: !!req.body,
            contentType: req.headers['content-type'],
            method: req.method
          }
        });
      }

      const { documentIds } = req.body;

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ 
          message: "Document IDs array is required",
          debug: { 
            documentIds: documentIds, 
            isArray: Array.isArray(documentIds),
            bodyKeys: Object.keys(req.body),
            rawBody: req.body
          }
        });
      }

      if (documentIds.length > 50) {
        return res.status(400).json({ message: "Maximum 50 documents can be deleted at once" });
      }

      // Validate that all IDs are numbers
      const invalidIds = documentIds.filter(id => !Number.isInteger(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({ 
          message: "All document IDs must be integers",
          invalidIds
        });
      }

      console.log(`📋 Starting bulk delete for user ${userId}: ${documentIds.length} documents`);

      const { searchOptimizationService } = await import('./searchOptimizationService');
      const result = await searchOptimizationService.bulkDeleteDocuments(userId, documentIds);

      console.log(`✅ Bulk delete completed: ${result.success} successful, ${result.failed} failed`);

      res.json({
        message: `Bulk delete completed: ${result.success} successful, ${result.failed} failed`,
        ...result
      });
    } catch (error) {
      console.error("Error in bulk delete:", error);

      // Enhanced error logging
      if (error instanceof Error) {
        console.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }

      res.status(500).json({ 
        message: "Failed to perform bulk delete",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/documents/:id', requireAuth, requireDocumentAccess('delete'), async (req: AuthenticatedRequest, res) => {
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

      // TICKET 4: Log document deletion before actual deletion
      const documentToDelete = await storage.getDocument(documentId, userId);
      const userHousehold = await storage.getUserHousehold(userId);

      await storage.deleteDocument(documentId, userId);

      if (documentToDelete) {
        await AuditLogger.logDelete(documentId, userId, userHousehold?.id, {
          documentName: documentToDelete.name,
          deletedBy: userId,
        });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

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

      // Handle encrypted documents
      if (document.isEncrypted && document.encryptedDocumentKey && document.encryptionMetadata) {
        try {
          const metadata = JSON.parse(document.encryptionMetadata);

          // Handle cloud storage documents with GCS download
          if (metadata.storageType === 'cloud' && metadata.storageKey) {
            console.log(`📁 GCS DOWNLOAD: Downloading document ${metadata.storageKey} from cloud storage`);

            try {
              const storage = storageProvider();
              const fileBuffer = await storage.download(metadata.storageKey);

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

  // Admin middleware
  function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    console.log('🔧 Admin middleware check - Session user:', (req.session as any)?.user?.email, 'Role:', (req.session as any)?.user?.role);
    console.log('🔧 Admin middleware check - Req user:', req.user?.email, 'Role:', req.user?.role);

    // Check both session and req.user for compatibility
    const user = req.user || (req.session as any)?.user;

    if (!user) {
      console.log('❌ Admin middleware: No user found in session or req.user');
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (user.role !== 'admin') {
      console.log('❌ Admin middleware: User role is not admin:', user.role);
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Ensure req.user is set for downstream handlers
    req.user = user;
    console.log('✅ Admin middleware: Access granted for', user.email);
    next();
  }

  // Encryption management endpoints
  app.get('/api/admin/encryption/stats', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getEncryptionStats();
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
      console.log('🔧 Admin stats response:', stats);
      res.json(stats);
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
  app.patch('/api/admin/users/:userId/toggle', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;

      await db.update(users)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(users.id, userId));

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Toggle user error:', error);
      res.status(500).json({ error: 'Failed to toggle user status' });
    }
  });

  // Feature flags endpoints
  // Admin - Feature flags
  app.get("/api/admin/feature-flags", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const authReq = asAuthenticatedRequest(req);
      console.log('🔧 [FEATURE FLAGS] Request received from user:', authReq.user?.email);
      console.log('🔧 [FEATURE FLAGS] User role:', authReq.user?.role);
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
  app.patch('/api/admin/feature-flags/:flagId/toggle', requireAdmin, async (req, res) => {
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
  app.get("/api/admin/feature-flag-analytics", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const authReq = asAuthenticatedRequest(req);
      console.log('🔧 [FEATURE FLAG ANALYTICS] Request received from user:', authReq.user?.email);
      console.log('🔧 [FEATURE FLAG ANALYTICS] User role:', authReq.user?.role);
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
      const err = error as Error;
      console.error('❌ [FEATURE FLAG ANALYTICS] Error:', err);
      console.error('❌ [FEATURE FLAG ANALYTICS] Error stack:', err.stack);
      res.status(500).json({ error: "Failed to fetch feature flag analytics" });
    }
  });

  // Get system activities for dashboard (admin only)
  app.get('/api/admin/activities', requireAdmin, async (req: any, res) => {
    try {
      const activities = await storage.getSystemActivities();
      res.json(activities);
    } catch (error) {
      console.error("Error fetching system activities:", error);
      res.status(500).json({ message: "Failed to fetch system activities" });
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

      const share = await storage.shareDocument(documentId, [email], permissions);
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

      const shares = await storage.getDocumentShares(documentId);
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

  // TICKET 6: Get document references
  app.get('/api/documents/:id/references', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Verify user has access to the document
      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Parse references from document
      let references: any[] = [];
      if (document.documentReferences) {
        try {
          references = JSON.parse(document.documentReferences as string);
        } catch (error) {
          console.error("Error parsing document references:", error);
          references = [];
        }
      }

      // Filter references to only include documents the user can access
      const accessibleReferences = [];
      for (const ref of references) {
        try {
          const refDoc = await storage.getDocument(ref.documentId, userId);
          if (refDoc) {
            accessibleReferences.push(ref);
          }
        } catch (error) {
          // Document not accessible or doesn't exist - skip it
          console.warn(`Reference document ${ref.documentId} not accessible for user ${userId}`);
        }
      }

      res.json(accessibleReferences);
    } catch (error) {
      console.error("Error fetching document references:", error);
      res.status(500).json({ message: "Failed to fetch document references" });
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

  // Household Management API for Duo Plans

  // Create household for Duo users
  app.post('/api/household/create', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { name } = req.body;

      // Check if user has Duo subscription
      const user = await storage.getUser(userId);
      if (!user || user.subscriptionTier !== 'duo') {
        return res.status(403).json({ message: 'Duo subscription required to create household' });
      }

      // Check if user is already in a household
      const existingMembership = await storage.getUserHouseholdMembership(userId);
      if (existingMembership) {
        return res.status(400).json({ message: 'User is already in a household' });
      }

      // Create household
      const household = await storage.createHousehold({
        name: name || `${user.firstName || user.email}'s Household`,
        planType: 'duo',
        seatLimit: 2,
        ownerId: userId,
      });

      // Create membership for the owner
      await storage.createHouseholdMembership({
        userId,
        householdId: household.id,
        role: 'owner',
      });

      res.json({ household, message: 'Household created successfully' });
    } catch (error) {
      console.error('Error creating household:', error);
      res.status(500).json({ message: 'Failed to create household' });
    }
  });

  // Get household information for current user
  app.get('/api/household', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Check if user is part of a household
      const membership = await storage.getHouseholdMembership(userId);
      if (!membership) {
        return res.json({ household: null, membership: null });
      }

      // Get household details
      const household = await storage.getHousehold(membership.householdId);
      if (!household) {
        return res.status(404).json({ message: 'Household not found' });
      }

      // Get all household members
      const members = await storage.getHouseholdMembers(household.id);

      res.json({
        household,
        membership,
        members: members.length,
        membersList: members
      });
    } catch (error) {
      console.error('Error fetching household:', error);
      res.status(500).json({ message: 'Failed to fetch household information' });
    }
  });

  // Create household invitation
  app.post('/api/household/invite', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { email } = req.body;

      // Validate input
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Valid email is required' });
      }

      // Check if current user has a Duo subscription and is the owner
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.subscriptionTier !== 'duo') {
        return res.status(403).json({ message: 'Duo subscription required to invite members' });
      }

      // Check if user is part of a household and is the owner
      const membership = await storage.getHouseholdMembership(userId);
      if (!membership) {
        return res.status(403).json({ message: 'User must be part of a household to invite members' });
      }

      if (membership.role !== 'owner') {
        return res.status(403).json({ message: 'Only household owners can invite members' });
      }

      // Check household member limit
      const memberCount = await storage.getHouseholdMemberCount(membership.householdId);
      if (memberCount >= 2) {
        return res.status(400).json({ message: 'Household already at maximum capacity (2 members)' });
      }

      // Check if email is already registered
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        // Check if user is already in a household
        const existingMembership = await storage.getHouseholdMembership(existingUser.id);
        if (existingMembership) {
          return res.status(400).json({ message: 'User is already part of a household' });
        }

        // Add existing user to household
        await storage.createHouseholdMembership({
          id: `uhm_${Date.now()}_${Math.random().toString(36).substring(2)}`,
          userId: existingUser.id,
          householdId: membership.householdId,
          role: 'member',
          inviteStatus: 'accepted',
          invitedAt: new Date(),
          joinedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });

        res.json({ 
          message: 'User added to household successfully',
          type: 'existing_user_added'
        });
      } else {
        // For now, return invitation details - full email integration would be added later
        res.json({
          message: 'Invitation prepared. User will be added when they register.',
          type: 'invitation_prepared',
          email: email,
          householdId: membership.householdId
        });
      }
    } catch (error) {
      console.error('Error creating household invitation:', error);
      res.status(500).json({ message: 'Failed to create household invitation' });
    }
  });

  // Leave household
  app.post('/api/household/leave', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Check if user is part of a household
      const membership = await storage.getHouseholdMembership(userId);
      if (!membership) {
        return res.status(400).json({ message: 'User is not part of a household' });
      }

      // Owners cannot leave - they must transfer ownership or cancel subscription
      if (membership.role === 'owner') {
        return res.status(400).json({ 
          message: 'Household owners cannot leave. Please transfer ownership or cancel your subscription.' 
        });
      }

      // Remove user from household
      await storage.removeHouseholdMembership(userId);

      res.json({ message: 'Successfully left household' });
    } catch (error) {
      console.error('Error leaving household:', error);
      res.status(500).json({ message: 'Failed to leave household' });
    }
  });

  // Remove member from household (owner only)
  app.post('/api/household/remove-member', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { memberId } = req.body;

      if (!memberId) {
        return res.status(400).json({ message: 'Member ID is required' });
      }

      // Check if current user is household owner
      const membership = await storage.getHouseholdMembership(userId);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ message: 'Only household owners can remove members' });
      }

      // Check if member exists in the same household
      const memberMembership = await storage.getHouseholdMembership(memberId);
      if (!memberMembership || memberMembership.householdId !== membership.householdId) {
        return res.status(404).json({ message: 'Member not found in household' });
      }

      // Cannot remove owner
      if (memberMembership.role === 'owner') {
        return res.status(400).json({ message: 'Cannot remove household owner' });
      }

      // Remove member from household
      await storage.removeHouseholdMembership(memberId);

      res.json({ message: 'Member removed from household successfully' });
    } catch (error) {
      console.error('Error removing household member:', error);
      res.status(500).json({ message: 'Failed to remove household member' });
    }
  });



  // Category suggestion endpoint
  const { suggestDocumentCategory } = await import('./routes/categorySuggestion');
  app.post('/api/documents/suggest-category', requireAuth, suggestDocumentCategory);

  // Blog API endpoints (public access for reading)
  app.get('/api/blog/posts', async (req: any, res) => {
    try {
      const posts = await storage.getPublishedBlogPosts();
      res.json(posts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

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

      const updatedReminder = await storage.updateExpiryReminder(reminderId, req.body);
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

      await storage.deleteExpiryReminder(reminderId);
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

      const updatedReminder = await storage.markReminderCompleted(reminderId);
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

      const event = await storage.updateManualTrackedEvent(eventId, validatedData);
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

      await storage.deleteManualTrackedEvent(eventId);
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

      await storage.toggleFeatureFlag(flagId);
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

      const overrides = await storage.getFeatureFlagOverrides("");
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

  // LLM Adapter Abstraction - Internal endpoint for chat generation
  app.post('/internal/llm/generate', async (req: Request, res: Response) => {
    try {
      // Import LLM adapter factory
      const { LLMProviderFactory } = await import('./services/llmProviderFactory.js');
      const { LLMGenerateRequestSchema } = await import('./services/llmAdapter.js');

      // Validate request body
      const validatedRequest = LLMGenerateRequestSchema.parse(req.body);

      // Get LLM adapter instance
      const llmAdapter = LLMProviderFactory.getInstance();

      // Generate response
      const startTime = Date.now();
      const response = await llmAdapter.generate(validatedRequest);
      const totalLatencyMs = Date.now() - startTime;

      console.log(`[INTERNAL-LLM] Generation completed: provider=${llmAdapter.getProviderName()}, latency=${totalLatencyMs}ms`);

      // Return response in the exact format specified
      res.json({
        text: response.text,
        usage: {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens
        },
        latencyMs: totalLatencyMs
      });

    } catch (error) {
      const err = error as Error;
      console.error('[INTERNAL-LLM] Generation failed:', err.message);

      // Return structured error response
      if (err.message.includes('Validation')) {
        return res.status(400).json({ 
          error: 'Invalid request format', 
          message: err.message 
        });
      }

      if (err.message.includes('Circuit breaker')) {
        return res.status(503).json({ 
          error: 'Service temporarily unavailable', 
          message: 'LLM service is temporarily unavailable due to repeated failures' 
        });
      }

      res.status(500).json({ 
        error: 'Internal server error', 
        message: 'Failed to generate LLM response' 
      });
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
        userTier: user.subscriptionTier as 'free' | 'beginner' | 'pro' | 'duo',
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

  // Chat configuration endpoint
  app.get('/api/config', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { chatConfigService } = await import('./chatConfig.js');
      const context = {
        userId,
        userTier: user.subscriptionTier as 'free' | 'beginner' | 'pro' | 'duo',
        sessionId: req.sessionID,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      };

      const chatConfig = await chatConfigService.getChatConfig(context);

      res.json({
        chat: {
          enabled: chatConfig.enabled,
          showFilters: chatConfig.showFilters,
          numericVerifier: chatConfig.numericVerifier,
          maxAnswerTokens: chatConfig.maxAnswerTokens,
          maxContextChars: chatConfig.maxContextChars,
        }
      });
    } catch (error: any) {
      console.error("Error getting config:", error);
      res.status(500).json({ message: "Failed to get configuration", error: error.message });
    }
  });

  // Chat API Endpoints

  // Create a new conversation
  app.post('/api/conversations', requireAuth, requireChatEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Determine tenantId (userId for individual users, householdId for Duo users)
      let tenantId = userId;
      if (user.subscriptionTier === 'duo') {
        const membership = await storage.getUserHouseholdMembership(userId);
        if (membership?.householdId) {
          tenantId = membership.householdId;
        }
      }

      // Build complete conversation data and validate
      const { insertConversationSchema } = await import('../shared/schema.js');
      const conversationData = {
        title: req.body.title || 'New Conversation',
        tenantId,
        userId,
      };
      
      const validatedData = insertConversationSchema.parse(conversationData);

      const conversation = await storage.createConversation(validatedData);

      console.log(`✅ [CHAT] Created conversation ${conversation.id} for user ${user.email} (tenant: ${tenantId})`);
      res.status(201).json(conversation);
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Get user's conversations (with pagination)
  app.get('/api/conversations', requireAuth, requireChatEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Parse query parameters
      const archived = req.query.archived === 'true';
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const cursor = req.query.cursor;

      // Determine tenantId (userId for individual users, householdId for Duo users)
      let tenantId = userId;
      if (user.subscriptionTier === 'duo') {
        const membership = await storage.getUserHouseholdMembership(userId);
        if (membership?.householdId) {
          tenantId = membership.householdId;
        }
      }

      const conversations = await storage.getUserConversations(tenantId, archived, limit, cursor);

      res.json({
        conversations,
        hasMore: conversations.length === limit,
        cursor: conversations.length > 0 ? conversations[conversations.length - 1].id : null
      });
    } catch (error: any) {
      console.error("Error getting conversations:", error);
      res.status(500).json({ error: "Failed to get conversations" });
    }
  });

  // Get a specific conversation
  app.get('/api/conversations/:id', requireAuth, requireChatEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Determine tenantId (userId for individual users, householdId for Duo users)
      let tenantId = userId;
      if (user.subscriptionTier === 'duo') {
        const membership = await storage.getUserHouseholdMembership(userId);
        if (membership?.householdId) {
          tenantId = membership.householdId;
        }
      }

      const conversation = await storage.getConversation(req.params.id, tenantId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      res.json(conversation);
    } catch (error: any) {
      console.error("Error getting conversation:", error);
      res.status(500).json({ error: "Failed to get conversation" });
    }
  });

  // Archive a conversation
  app.post('/api/conversations/:id/archive', requireAuth, requireChatEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Determine tenantId (userId for individual users, householdId for Duo users)
      let tenantId = userId;
      if (user.subscriptionTier === 'duo') {
        const membership = await storage.getUserHouseholdMembership(userId);
        if (membership?.householdId) {
          tenantId = membership.householdId;
        }
      }

      const conversation = await storage.archiveConversation(req.params.id, tenantId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      console.log(`✅ [CHAT] Archived conversation ${conversation.id} for user ${user.email}`);
      res.json(conversation);
    } catch (error: any) {
      console.error("Error archiving conversation:", error);
      res.status(500).json({ error: "Failed to archive conversation" });
    }
  });

  // Get messages for a conversation (with pagination)
  app.get('/api/conversations/:id/messages', requireAuth, requireChatEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Parse query parameters
      const limit = Math.min(parseInt(req.query.limit) || 100, 200);
      const cursor = req.query.cursor;

      // Determine tenantId (userId for individual users, householdId for Duo users)
      let tenantId = userId;
      if (user.subscriptionTier === 'duo') {
        const membership = await storage.getUserHouseholdMembership(userId);
        if (membership?.householdId) {
          tenantId = membership.householdId;
        }
      }

      // First verify the conversation exists and user has access
      const conversation = await storage.getConversation(req.params.id, tenantId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const messages = await storage.getConversationMessages(req.params.id, tenantId, limit, cursor);

      res.json({
        messages,
        hasMore: messages.length === limit,
        cursor: messages.length > 0 ? messages[messages.length - 1].id : null
      });
    } catch (error: any) {
      console.error("Error getting messages:", error);
      res.status(500).json({ error: "Failed to get messages" });
    }
  });

  // ====================
  // CHAT ORCHESTRATION
  // ====================

  // POST /api/chat - Chat orchestration endpoint with search + LLM + persistence
  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Get user and determine tenantId (same logic as conversation creation)
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let tenantId = userId;
      if (user.subscriptionTier === 'duo') {
        const membership = await storage.getUserHouseholdMembership(userId);
        if (membership?.householdId) {
          tenantId = membership.householdId;
        }
      }

      // Validate request body
      const validatedRequest: ChatRequest = chatRequestSchema.parse(req.body);

      console.log(`🤖 [CHAT] Received query: "${validatedRequest.message}" from user ${userId} (tenant: ${tenantId})`);

      // Process chat through orchestration service
      const response = await chatOrchestrationService.processChat(
        validatedRequest, 
        userId, 
        tenantId
      );

      console.log(`✅ [CHAT] Returning response with ${response.citations.length} citations`);
      res.json(response);

    } catch (error: any) {
      console.error(`❌ [CHAT] Endpoint error:`, error);

      // Return structured error response matching schema
      const fallbackResponse = {
        conversationId: req.body.conversationId || "unknown",
        answer: "I encountered an error processing your request. Please try again.",
        citations: [],
        confidence: 0.0
      };

      res.status(500).json(fallbackResponse);
    }
  });

  // Register test routes
  if (process.env.NODE_ENV === 'development') {
    app.use('/api/test', requireAuth, testRouter);
  }

  app.use(sentryErrorHandler());

  const httpServer = createServer(app);
  return httpServer;
}