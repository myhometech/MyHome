import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type ExpiringDocument } from "./storage";
import { setupSimpleAuth, requireAuth } from "./simpleAuth";
import { AuthService } from "./authService";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertDocumentSchema, insertCategorySchema, insertExpiryReminderSchema, loginSchema, registerSchema } from "@shared/schema";
import { extractTextFromImage, supportsOCR, processDocumentOCRAndSummary, processDocumentWithDateExtraction } from "./ocrService";
import { answerDocumentQuestion, getExpiryAlerts } from "./chatbotService";
import { tagSuggestionService } from "./tagSuggestionService";

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
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only PDF, JPG, PNG, and WEBP files are allowed.'));
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup simple authentication
  setupSimpleAuth(app);

  // Authentication routes
  app.post('/api/auth/register', async (req: any, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await AuthService.findUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists with this email" });
      }

      const user = await AuthService.createEmailUser(data);
      
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
        user: safeUser 
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
      
      // Store user in session
      req.session.user = user;
      
      const { passwordHash, ...safeUser } = user;
      res.json({ 
        message: "Login successful", 
        user: safeUser 
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

      const searchResults = await storage.searchDocuments(userId, searchQuery.trim());
      res.json(searchResults);
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

      const validatedData = insertDocumentSchema.parse(documentData);
      const document = await storage.createDocument(validatedData);

      // Process OCR, generate summary, extract dates, and suggest tags in the background
      if (supportsOCR(req.file.mimetype)) {
        try {
          await processDocumentWithDateExtraction(
            document.id,
            req.file.originalname,
            req.file.path, 
            req.file.mimetype,
            storage
          );
          
          // Get the updated document with extracted text for tag suggestions
          const updatedDocument = await storage.getDocument(document.id, userId);
          if (updatedDocument?.extractedText) {
            // Generate tag suggestions based on extracted content
            const tagSuggestions = await tagSuggestionService.suggestTags(
              req.file.originalname,
              updatedDocument.extractedText,
              req.file.mimetype,
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
              req.file.path, 
              req.file.originalname, 
              req.file.mimetype
            );
            await storage.updateDocumentOCRAndSummary(document.id, userId, extractedText, summary);
            
            // Generate tag suggestions for fallback OCR
            const tagSuggestions = await tagSuggestionService.suggestTags(
              req.file.originalname,
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

  // Expiry alerts endpoint (must come before parameterized routes)
  app.get('/api/documents/expiry-alerts', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const expiryData = await storage.getExpiryAlerts(userId);
      res.json(expiryData);
    } catch (error) {
      console.error("Error fetching expiry alerts:", error);
      res.status(500).json({ message: "Failed to fetch expiry alerts" });
    }
  });

  // Document stats (must come before parameterized routes)
  app.get('/api/documents/stats', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const stats = await storage.getDocumentStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching document stats:", error);
      res.status(500).json({ message: "Failed to fetch document stats" });
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

  // Document preview endpoint
  app.get('/api/documents/:id/preview', requireAuth, async (req: any, res) => {
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

      // Check if file exists
      if (!fs.existsSync(document.filePath)) {
        return res.status(404).json({ message: "File not found" });
      }

      // For images, serve the file directly
      if (document.mimeType.startsWith('image/')) {
        res.setHeader('Content-Type', document.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        const fileStream = fs.createReadStream(document.filePath);
        fileStream.pipe(res);
        return;
      }

      // For PDFs, we could generate a thumbnail or serve first page
      // For now, return a placeholder response
      res.status(200).json({ 
        message: "Preview generation not implemented for this file type",
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
      const activities = await storage.getSystemActivities();
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
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

  // Email forwarding endpoints
  
  // Get user's forwarding email address - DISABLED (emailService removed)
  app.get('/api/email/forwarding-address', requireAuth, async (req: any, res) => {
    res.status(503).json({ message: "Email forwarding feature is temporarily unavailable" });
  });

  // Test email processing (for development) - simulates receiving an email with attachments
  app.post('/api/email/test', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user?.email) {
        return res.status(400).json({ message: "User email not found" });
      }

      // Create sample email data to simulate forwarded email
      const sampleEmailData = {
        from: user.email || 'test@example.com',
        subject: 'Sample Document Forward - Insurance Policy',
        html: '<p>This is a test email with an attached insurance document.</p><p>Please process this document and add it to my HomeDocs library.</p>',
        text: 'This is a test email with an attached insurance document. Please process this document and add it to my HomeDocs library.',
        attachments: [
          {
            filename: 'insurance-policy.pdf',
            content: Buffer.from('Sample PDF content for testing email forwarding functionality'),
            contentType: 'application/pdf'
          }
        ]
      };

      // const result = await emailService.processIncomingEmail(sampleEmailData, user.email);
      res.status(503).json({ message: "Email processing feature is temporarily unavailable" });
    } catch (error) {
      console.error("Error testing email processing:", error);
      res.status(500).json({ message: "Failed to test email processing" });
    }
  });

  // Process incoming email (webhook endpoint - no auth required)
  app.post('/api/email/webhook', async (req, res) => {
    try {
      const { emailData, userEmail } = req.body;
      
      if (!emailData || !userEmail) {
        return res.status(400).json({ message: "Missing email data or user email" });
      }

      // const result = await emailService.processIncomingEmail(emailData, userEmail);
      res.status(503).json({ message: "Email processing feature is temporarily unavailable" });
    } catch (error) {
      console.error("Email webhook error:", error);
      res.status(500).json({ message: "Failed to process email" });
    }
  });

  // Get email forwarding history
  app.get('/api/email/history', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const emailHistory = await storage.getEmailForwards(userId);
      res.json(emailHistory);
    } catch (error) {
      console.error("Error fetching email history:", error);
      res.status(500).json({ message: "Failed to fetch email history" });
    }
  });

  // Chatbot endpoints
  app.post('/api/chatbot/ask', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { question } = req.body;

      console.log(`Chatbot request from user ${userId}: "${question}"`);

      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({ message: "Question is required" });
      }

      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        console.error("OpenAI API key not found in environment variables");
        return res.status(500).json({ message: "AI service is not configured. Please contact support." });
      }

      const response = await answerDocumentQuestion(userId, question.trim());
      console.log(`Chatbot response for user ${userId}: success`);
      res.json(response);
    } catch (error) {
      console.error("Chatbot error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process your question" 
      });
    }
  });

  app.get('/api/chatbot/expiry-summary', requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const summary = await getExpiryAlerts(userId);
      res.json({ summary });
    } catch (error) {
      console.error("Expiry summary error:", error);
      res.status(500).json({ message: "Failed to get expiry summary" });
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

  // Expiry reminder routes
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

  const httpServer = createServer(app);
  return httpServer;
}
