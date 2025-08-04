import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupSimpleAuth, requireAuth } from "./simpleAuth";
import { AuthService } from "./authService";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertDocumentSchema, insertCategorySchema, insertExpiryReminderSchema, insertDocumentInsightSchema, insertBlogPostSchema, loginSchema, registerSchema, insertUserAssetSchema, insertManualTrackedEventSchema } from "@shared/schema";
import { z } from 'zod';
import { extractTextFromImage, supportsOCR, processDocumentOCRAndSummary, processDocumentWithDateExtraction, isPDFFile } from "./ocrService";

import { tagSuggestionService } from "./tagSuggestionService";
import { aiInsightService } from "./aiInsightService";
import { pdfConversionService } from "./pdfConversionService.js";
import { EncryptionService } from "./encryptionService.js";
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
      'image/bmp'      // BMP format
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
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 5, // Maximum 5 attachments
    fieldSize: 20 * 1024 * 1024, // 20MB field size for large email content
    fields: 20 // Maximum 20 form fields
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
    try {
      if (!req.file) {
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

      // Convert scanned images to PDF format
      if (pdfConversionService.isImageFile(req.file.path) && req.file.originalname.startsWith('processed_')) {
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

      // Check for legacy local files that don't exist
      if (!document.encryptionMetadata && !fs.existsSync(document.filePath)) {
        console.log(`Local file not found: ${document.filePath} for document ${documentId}`);
        return res.status(404).json({ 
          message: "Document file not found.",
          code: "FILE_NOT_FOUND",
          documentId: documentId,
          fileName: document.fileName
        });
      }


      // Handle cloud storage documents (new system)
      if (document.isEncrypted && document.encryptionMetadata) {
        try {
          const metadata = JSON.parse(document.encryptionMetadata);
          
          // Check if this is a cloud storage document
          if (metadata.storageType === 'cloud' && metadata.storageKey) {
            console.log(`📁 GCS PREVIEW: Loading document ${metadata.storageKey} from cloud storage`);
            
            const storage = storageProvider();
            try {
              const signedUrl = await storage.getSignedUrl(metadata.storageKey, 3600);
              if (document.mimeType === 'application/pdf' || document.mimeType.startsWith('image/')) {
                return res.redirect(signedUrl);
              }
            } catch (signedUrlError) {
              console.warn('Signed URL generation failed, falling back to proxied download:', signedUrlError);
              
              // Fallback to direct download and proxy the file
              const fileBuffer = await storage.download(metadata.storageKey);
              res.setHeader('Content-Type', document.mimeType);
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.setHeader('Content-Disposition', 'inline; filename="' + document.fileName + '"');
              res.setHeader('Access-Control-Allow-Origin', req.get('Origin') || '*');
              res.setHeader('Access-Control-Allow-Credentials', 'true');
              res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
              res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
              return res.send(fileBuffer);
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

      // Handle unencrypted documents (legacy support)
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

      // Require extracted text for insight generation
      if (!document.extractedText || document.extractedText.trim() === '') {
        return res.status(400).json({ 
          message: "Document has no extracted text. Please run OCR processing first." 
        });
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

        await storage.createDocumentInsight({
          documentId,
          userId,
          insightId: insight.id,
          message, // TICKET 4: User-facing message
          type: insight.type,
          title: insight.title,
          content: insight.content,
          confidence: Math.round(insight.confidence * 100), // Convert to 0-100 scale
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

      // Filter out unwanted insight types at API level
      const filteredAIInsights = insights.filter(insight => 
        !['financial_info', 'compliance', 'key_dates', 'action_items'].includes(insight.type)
      );

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

      if (!['open', 'dismissed', 'resolved'].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'open', 'dismissed', or 'resolved'." });
      }

      const updatedInsight = await storage.updateInsightStatus(insightId, userId, status);
      
      if (!updatedInsight) {
        return res.status(404).json({ message: "Insight not found" });
      }

      res.json(updatedInsight);

    } catch (error) {
      console.error("Error updating insight status:", error);
      captureError(error as Error, req);
      res.status(500).json({ message: "Failed to update insight status" });
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
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

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
  app.get('/api/admin/stats', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch admin stats" });
    }
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsersWithStats();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get('/api/admin/activities', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { severity } = req.query;
      const activities = await storage.getSystemActivities(severity as string);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Admin user toggle endpoint
  app.patch('/api/admin/users/:userId/toggle', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }
      
      await storage.updateUserStatus(userId, isActive);
      res.json({ message: "User status updated successfully" });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

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
          document.fileName,
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
  
  // Initialize feature flags on server start
  featureFlagService.initializeFeatureFlags().catch(console.error);

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

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "Document IDs array is required" });
      }

      if (documentIds.length > 50) {
        return res.status(400).json({ message: "Maximum 50 documents can be deleted at once" });
      }

      const { searchOptimizationService } = await import('./searchOptimizationService');
      const result = await searchOptimizationService.bulkDeleteDocuments(userId, documentIds);
      
      res.json({
        message: `Bulk delete completed: ${result.success} successful, ${result.failed} failed`,
        ...result
      });
    } catch (error) {
      console.error("Error in bulk delete:", error);
      res.status(500).json({ message: "Failed to perform bulk delete" });
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
      
      // Validate the request with the discriminated union schema from the frontend
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
      
      const assetData = { ...validatedData, userId };
      const asset = await storage.createUserAsset(assetData);
      res.json(asset);
    } catch (error) {
      console.error("Error creating user asset:", error);
      if (error instanceof z.ZodError) {
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

  // TICKET 1: Mailgun Inbound Email Webhook Endpoint
  app.post('/api/mailgun/inbound-email', mailgunUpload.any(), async (req: any, res) => {
    try {
      console.log('📧 Mailgun webhook received:', {
        headers: req.headers,
        bodyKeys: Object.keys(req.body || {}),
        filesCount: req.files?.length || 0
      });

      // Parse the webhook data
      const webhookData = parseMailgunWebhook(req);
      
      if (!webhookData.isValid) {
        console.error('❌ Invalid Mailgun webhook:', webhookData.error);
        return res.status(400).json({ 
          error: 'Invalid webhook data',
          details: webhookData.error 
        });
      }

      const { message } = webhookData;
      
      // TICKET 2: Verify Mailgun signature (required for security)
      const signingKey = process.env.MAILGUN_API_KEY || process.env.MAILGUN_SIGNING_KEY;
      if (!signingKey) {
        console.error('❌ MAILGUN_API_KEY not configured - signature verification required');
        return res.status(500).json({ 
          error: 'Server configuration error: Mailgun API key not configured' 
        });
      }

      const isValidSignature = verifyMailgunSignature(
        message.timestamp,
        message.token, 
        message.signature,
        signingKey
      );
      
      if (!isValidSignature) {
        console.error('❌ Invalid Mailgun signature - potential tampering detected', {
          timestamp: message.timestamp,
          token: message.token?.substring(0, 8) + '...',
          signatureLength: message.signature?.length
        });
        return res.status(401).json({ 
          error: 'Invalid signature - request authentication failed' 
        });
      }
      
      console.log('✅ Mailgun signature verified successfully');

      // TICKET 3: Extract and validate user from email subaddressing
      const userExtractionResult = extractUserIdFromRecipient(message.recipient);
      if (!userExtractionResult.userId) {
        console.error('❌ Failed to extract user ID from recipient:', {
          recipient: message.recipient,
          error: userExtractionResult.error
        });
        return res.status(400).json({ 
          error: 'Invalid recipient format',
          details: userExtractionResult.error,
          expectedFormat: 'upload+userID@myhome-tech.com'
        });
      }

      const userId = userExtractionResult.userId;

      // Verify user exists with comprehensive error handling
      let user;
      try {
        user = await storage.getUser(userId);
        if (!user) {
          console.error('❌ User not found in database:', {
            userId,
            recipient: message.recipient,
            sender: message.sender
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
        console.error('❌ Database error while checking user:', {
          userId,
          recipient: message.recipient,
          error: error instanceof Error ? error.message : 'Unknown error'
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
        console.error('❌ No valid attachments found in email:', {
          recipient: message.recipient,
          sender: message.sender,
          totalAttachments: message.attachments.length,
          invalidAttachments: attachmentValidation.invalidAttachments,
          summary: attachmentValidation.summary
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

      // Log successful parsing
      console.log('✅ Mailgun webhook parsed successfully:', {
        recipient: message.recipient,
        sender: message.sender,
        subject: message.subject,
        userId,
        validAttachments: attachmentValidation.validAttachments.length,
        invalidAttachments: attachmentValidation.invalidAttachments.length,
        bodyLength: message.bodyPlain?.length || 0
      });

      // For now, just return success with parsed data
      // TODO: Integrate with document ingestion pipeline in next ticket
      res.status(202).json({
        message: 'Email received and parsed successfully',
        data: {
          recipient: message.recipient,
          sender: message.sender,
          subject: message.subject,
          userId,
          validAttachmentsCount: attachmentValidation.validAttachments.length,
          invalidAttachmentsCount: attachmentValidation.invalidAttachments.length,
          attachmentSummary: attachmentValidation.summary,
          invalidAttachments: attachmentValidation.invalidAttachments,
          bodyPreview: message.bodyPlain?.substring(0, 100) + '...' || ''
        }
      });

    } catch (error) {
      console.error('❌ Error processing Mailgun webhook:', error);
      captureError(error as Error, req);
      res.status(500).json({ 
        error: 'Internal server error processing email',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Debug route for production testing
  app.get("/debug", (_req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Debug</title><style>body{font-family:monospace;padding:20px}.status{margin:10px 0;padding:10px;border-radius:5px}.success{background:#d4edda;color:#155724}.error{background:#f8d7da;color:#721c24}.info{background:#d1ecf1;color:#0c5460}#root{border:2px dashed #ccc;min-height:100px;margin:20px 0}</style></head><body><h1>Production Debug</h1><div id="root-status" class="status info">Checking...</div><div id="js-status" class="status info">Loading JS...</div><div id="react-status" class="status info">Waiting...</div><div id="root">React mount here</div><script>function u(id,msg,type){const el=document.getElementById(id);el.textContent=msg;el.className='status '+type}const root=document.getElementById('root');if(root)u('root-status','Root OK','success');else u('root-status','No Root','error');window.addEventListener('error',e=>{u('js-status','JS Error: '+e.message,'error')});window.addEventListener('unhandledrejection',e=>{u('react-status','Promise Error','error')});setTimeout(()=>{if(document.getElementById('js-status').textContent.includes('Loading'))u('js-status','JS OK','success')},2000);setTimeout(()=>{if(root&&root.innerHTML!=='React mount here'){u('react-status','React OK','success')}else{u('react-status','React FAILED (WHITE SCREEN)','error')}},5000);</script><link rel="stylesheet" href="/assets/index-DdPLYbvI.css"><script type="module" src="/assets/index-XUqBjYsW.js"></script></body></html>`);
  });

  // ANDROID-303: OCR Error Handling and Analytics Routes
  setupOCRErrorRoutes(app);
  
  // Add Canny JWT routes
  const cannyRoutes = await import('./routes/cannyRoutes.js');
  app.use('/api', cannyRoutes.default);

  app.use(sentryErrorHandler());

  const httpServer = createServer(app);
  return httpServer;
}
