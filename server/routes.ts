import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type ExpiringDocument } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
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

  // Documents routes
  app.get('/api/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
      const search = req.query.search as string;
      
      const documents = await storage.getDocuments(userId, categoryId, search);
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

  app.get('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = parseInt(req.params.id);
      
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

  // Expiry alerts endpoint
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

  // Update document name
  app.patch('/api/documents/:id/name', async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || 'demo-user-1';
      const documentId = parseInt(req.params.id);
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

  // Trigger OCR processing for a document
  app.post('/api/documents/:id/ocr', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = parseInt(req.params.id);
      
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
      
      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!fs.existsSync(document.filePath)) {
        return res.status(404).json({ message: "File not found on server" });
      }

      res.download(document.filePath, document.fileName);
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  // Document stats
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

  // Chatbot endpoints
  app.post('/api/chatbot/ask', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { question } = req.body;

      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({ message: "Question is required" });
      }

      const response = await answerDocumentQuestion(userId, question.trim());
      res.json(response);
    } catch (error) {
      console.error("Chatbot error:", error);
      res.status(500).json({ message: "Failed to process your question" });
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
