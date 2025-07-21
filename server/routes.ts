import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type ExpiringDocument } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { emailService } from "./emailService";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertDocumentSchema, insertCategorySchema } from "@shared/schema";
import { extractTextFromImage, supportsOCR } from "./ocrService";
import { answerDocumentQuestion, getExpiryAlerts } from "./chatbotService";

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Categories routes
  app.get('/api/categories', isAuthenticated, async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post('/api/categories', isAuthenticated, async (req, res) => {
    try {
      const categoryData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(categoryData);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Smart search endpoint for real-time search
  app.get('/api/documents/search', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get('/api/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.post('/api/documents', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = req.user.claims.sub;
      const { categoryId, tags } = req.body;

      const documentData = {
        userId,
        categoryId: categoryId ? parseInt(categoryId) : null,
        name: req.body.name || req.file.originalname,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        tags: tags ? JSON.parse(tags) : [],
      };

      const validatedData = insertDocumentSchema.parse(documentData);
      const document = await storage.createDocument(validatedData);

      // Process OCR for images in the background
      if (supportsOCR(req.file.mimetype)) {
        try {
          const extractedText = await extractTextFromImage(req.file.path, req.file.mimetype);
          await storage.updateDocumentOCR(document.id, userId, extractedText);
          console.log(`OCR completed for document ${document.id}`);
        } catch (ocrError) {
          console.error(`OCR failed for document ${document.id}:`, ocrError);
          // Continue without failing the upload
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
  app.get('/api/documents/expiry-alerts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const expiryData = await storage.getExpiryAlerts(userId);
      res.json(expiryData);
    } catch (error) {
      console.error("Error fetching expiry alerts:", error);
      res.status(500).json({ message: "Failed to fetch expiry alerts" });
    }
  });

  // Document stats (must come before parameterized routes)
  app.get('/api/documents/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getDocumentStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching document stats:", error);
      res.status(500).json({ message: "Failed to fetch document stats" });
    }
  });

  app.get('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.patch('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.post('/api/documents/:id/ocr', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.delete('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get('/api/documents/:id/download', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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



  // Initialize default categories
  app.post('/api/init-categories', isAuthenticated, async (req, res) => {
    try {
      const defaultCategories = [
        { name: 'Utilities', icon: 'fas fa-bolt', color: 'blue' },
        { name: 'Insurance', icon: 'fas fa-shield-alt', color: 'green' },
        { name: 'Taxes', icon: 'fas fa-calculator', color: 'purple' },
        { name: 'Maintenance', icon: 'fas fa-tools', color: 'orange' },
        { name: 'Legal', icon: 'fas fa-file-contract', color: 'teal' },
        { name: 'Warranty', icon: 'fas fa-certificate', color: 'indigo' },
        { name: 'Receipts', icon: 'fas fa-receipt', color: 'yellow' },
        { name: 'Other', icon: 'fas fa-folder', color: 'gray' },
      ];

      const categories = await storage.getCategories();
      if (categories.length === 0) {
        for (const category of defaultCategories) {
          await storage.createCategory(category);
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
  app.post('/api/documents/:id/share', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get('/api/documents/:id/shares', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.delete('/api/document-shares/:shareId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get('/api/shared-with-me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sharedDocuments = await storage.getSharedWithMeDocuments(userId);
      res.json(sharedDocuments);
    } catch (error) {
      console.error("Error fetching shared documents:", error);
      res.status(500).json({ message: "Failed to fetch shared documents" });
    }
  });

  // Email forwarding endpoints
  
  // Get user's forwarding email address
  app.get('/api/email/forwarding-address', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userForwardingAddress = await emailService.getUserForwardingAddress(userId);
      const fallbackAddress = emailService.getForwardingAddress();
      
      res.json({ 
        address: userForwardingAddress,
        fallbackAddress: fallbackAddress,
        instructions: `Forward emails with attachments to ${userForwardingAddress} and they will be automatically added to your document library. This email address is unique to your account.`,
        note: "Each user has their own unique forwarding address to ensure documents are correctly assigned to your account."
      });
    } catch (error) {
      console.error("Error getting forwarding address:", error);
      res.status(500).json({ message: "Failed to get forwarding address" });
    }
  });

  // Test email processing (for development) - simulates receiving an email with attachments
  app.post('/api/email/test', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

      const result = await emailService.processIncomingEmail(sampleEmailData, user.email);
      res.json({
        ...result,
        message: 'Test email processed successfully! Check your documents to see the created document.',
        note: 'This was a simulated email forward. In production, emails would be processed automatically when forwarded to your unique address.'
      });
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

      const result = await emailService.processIncomingEmail(emailData, userEmail);
      res.json(result);
    } catch (error) {
      console.error("Email webhook error:", error);
      res.status(500).json({ message: "Failed to process email" });
    }
  });

  // Get email forwarding history
  app.get('/api/email/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const emailHistory = await storage.getEmailForwards(userId);
      res.json(emailHistory);
    } catch (error) {
      console.error("Error fetching email history:", error);
      res.status(500).json({ message: "Failed to fetch email history" });
    }
  });

  // Chatbot endpoints
  app.post('/api/chatbot/ask', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.get('/api/chatbot/expiry-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const summary = await getExpiryAlerts(userId);
      res.json({ summary });
    } catch (error) {
      console.error("Expiry summary error:", error);
      res.status(500).json({ message: "Failed to get expiry summary" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
