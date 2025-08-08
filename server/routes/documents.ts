import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { ImageProcessingService } from '../imageProcessingService';
import { PDFOptimizationService } from '../pdfOptimizationService';
import { EnhancedOCRStrategies } from '../enhancedOCRStrategies';
import { storage } from '../storage';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  dest: './uploads/temp/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10, // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and WebP files are allowed.'));
    }
  },
});

// Initialize services
const imageProcessor = new ImageProcessingService('./uploads');
const pdfOptimizer = new PDFOptimizationService('./uploads');
const enhancedOCR = new EnhancedOCRStrategies();

// DOC-303: Enhanced document upload with auto-categorization via rules and AI fallback
router.post('/upload', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const uploadedFile = files.file?.[0];
    const thumbnailFile = files.thumbnail?.[0];

    if (!uploadedFile) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.user.id;
    let categoryId = req.body.categoryId ? parseInt(req.body.categoryId) : null;
    let categorizationSource = 'manual';
    
    console.log('Processing uploaded file:', {
      name: uploadedFile.originalname,
      size: uploadedFile.size,
      type: uploadedFile.mimetype,
      userId,
      categoryId
    });

    // DOC-303: Auto-categorization if no category provided
    if (!categoryId) {
      try {
        const { categorizationService } = await import('../categorizationService.js');
        
        const categorizationResult = await categorizationService.categorizeDocument({
          filename: uploadedFile.originalname,
          mimeType: uploadedFile.mimetype,
          userId
        });

        if (categorizationResult.categoryId) {
          categoryId = categorizationResult.categoryId;
          categorizationSource = categorizationResult.source;
          
          console.log(`DOC-303 Auto-categorization successful:`, {
            filename: uploadedFile.originalname,
            categoryId,
            source: categorizationSource,
            confidence: categorizationResult.confidence,
            reasoning: categorizationResult.reasoning
          });
        } else {
          console.log(`DOC-303 Auto-categorization failed for ${uploadedFile.originalname}:`, categorizationResult.reasoning);
        }
      } catch (categorizationError) {
        console.error('DOC-303 Auto-categorization error:', categorizationError);
        // Continue without categorization - don't fail the upload
      }
    }

    let finalFilePath = uploadedFile.path;
    let thumbnailPath: string | undefined;
    let processingMetadata: any = {};

    // Process images with compression and thumbnail generation
    if (uploadedFile.mimetype.startsWith('image/')) {
      const outputPath = path.join('./uploads', `processed_${Date.now()}_${uploadedFile.originalname}`);
      
      const result = await imageProcessor.processImage(
        uploadedFile.path,
        outputPath,
        {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 80,
          generateThumbnail: !thumbnailFile, // Only generate if not provided
        }
      );

      finalFilePath = result.processedPath;
      thumbnailPath = thumbnailFile?.path || result.thumbnailPath;
      processingMetadata = {
        compressionRatio: result.compressionRatio,
        originalDimensions: {
          width: result.metadata.width,
          height: result.metadata.height,
        },
      };

      console.log('Image processing completed:', processingMetadata);
    }

    // Process PDFs with optimization
    else if (uploadedFile.mimetype === 'application/pdf') {
      const outputPath = path.join('./uploads', `optimized_${Date.now()}_${uploadedFile.originalname}`);
      
      const result = await pdfOptimizer.optimizePDF(
        uploadedFile.path,
        outputPath,
        {
          generatePreview: true,
          maxPages: 50,
        }
      );

      finalFilePath = result.optimizedPath;
      processingMetadata = {
        compressionRatio: result.compressionRatio,
        pageCount: result.pageCount,
        previewPath: result.previewPath,
      };

      console.log('PDF optimization completed:', processingMetadata);
    }

    // Create document record with DOC-303 categorization tracking
    const document = await storage.createDocument({
      name: path.parse(uploadedFile.originalname).name,
      fileName: uploadedFile.originalname,
      filePath: finalFilePath,
      mimeType: uploadedFile.mimetype,
      fileSize: uploadedFile.size,
      userId,
      categoryId,
      categorizationSource, // DOC-303: Track categorization method
    });

    // Clean up temporary files
    try {
      const fs = require('fs').promises;
      await fs.unlink(uploadedFile.path); // Remove original temp file
      if (thumbnailFile) {
        await fs.unlink(thumbnailFile.path); // Remove temp thumbnail
      }
    } catch (cleanupError) {
      console.warn('Failed to clean up temp files:', cleanupError);
    }

    res.json({
      message: 'File uploaded and processed successfully',
      document,
      processing: processingMetadata,
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    
    // Clean up any temporary files on error
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const fs = require('fs').promises;
      
      if (files.file?.[0]) {
        await fs.unlink(files.file[0].path);
      }
      if (files.thumbnail?.[0]) {
        await fs.unlink(files.thumbnail[0].path);
      }
    } catch (cleanupError) {
      console.warn('Failed to clean up temp files after error:', cleanupError);
    }

    res.status(500).json({
      message: 'Upload failed',
      error: error.message,
    });
  }
});

// Get optimized document list with pagination and search
router.get('/', async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;
    const {
      search,
      category,
      page = '1',
      limit = '20',
      sortBy = 'uploadedAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Get documents with simple search
    const documents = await storage.getDocuments(
      userId,
      category ? parseInt(category as string) : undefined,
      search as string
    );

    res.json(documents);

  } catch (error: any) {
    console.error('Failed to fetch documents:', error);
    res.status(500).json({
      message: 'Failed to fetch documents',
      error: error.message,
    });
  }
});

// Get document thumbnail
router.get('/:id/thumbnail', async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const thumbnailPath = imageProcessor.getThumbnailPath(document.filePath);

    const fs = require('fs');
    if (fs.existsSync(thumbnailPath)) {
      res.sendFile(path.resolve(thumbnailPath));
    } else {
      // Return placeholder or original file
      res.sendFile(path.resolve(document.filePath));
    }

  } catch (error: any) {
    console.error('Failed to serve thumbnail:', error);
    res.status(500).json({
      message: 'Failed to serve thumbnail',
      error: error.message,
    });
  }
});

// Enhanced OCR retry endpoint for failed OCR cases
router.post('/:id/retry-ocr', async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const document = await storage.getDocument(documentId, req.user.id);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    console.log(`🔄 Retrying OCR for document ${documentId} with enhanced strategies`);

    // Get the original file buffer
    const fileBuffer = await storage.getFileBuffer(document.gcsPath);
    
    if (!fileBuffer) {
      return res.status(400).json({ message: 'Document file not found' });
    }

    // Apply enhanced OCR strategies
    const enhancedResult = await enhancedOCR.performAdvancedOCR(fileBuffer, {
      enableMultipleStrategies: true,
      enableImagePreprocessing: true,
      enableAdaptiveThresholding: true,
      enableDeskewing: true,
      maxRetries: 5
    });

    // Get image analysis tips
    const improvementTips = await enhancedOCR.analyzeImageForOCRTips(fileBuffer);

    // Update document with new OCR text if better confidence
    if (enhancedResult.confidence > 50 && enhancedResult.text.trim().length > 0) {
      await storage.updateDocument(documentId, req.user.id, {
        extractedText: enhancedResult.text,
        ocrConfidence: enhancedResult.confidence
      });
      
      console.log(`✅ Enhanced OCR improved confidence from unknown to ${enhancedResult.confidence}%`);
    }

    res.json({
      success: true,
      result: {
        text: enhancedResult.text,
        confidence: enhancedResult.confidence,
        strategy: enhancedResult.strategy,
        preprocessingApplied: enhancedResult.preprocessingApplied
      },
      tips: improvementTips,
      updated: enhancedResult.confidence > 50
    });

  } catch (error) {
    console.error('Enhanced OCR retry error:', error);
    res.status(500).json({ 
      message: 'Enhanced OCR retry failed', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OCR analysis endpoint - provides tips without retrying OCR
router.post('/:id/analyze-for-ocr', async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const document = await storage.getDocument(documentId, req.user.id);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Get the original file buffer
    const fileBuffer = await storage.getFileBuffer(document.gcsPath);
    
    if (!fileBuffer) {
      return res.status(400).json({ message: 'Document file not found' });
    }

    // Analyze image and provide tips
    const tips = await enhancedOCR.analyzeImageForOCRTips(fileBuffer);

    res.json({
      success: true,
      tips,
      documentId: documentId,
      currentOcrText: document.extractedText || '',
      currentConfidence: document.ocrConfidence || 0
    });

  } catch (error) {
    console.error('OCR analysis error:', error);
    res.status(500).json({ 
      message: 'OCR analysis failed', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get document preview/download
router.get('/:id/preview', async (req: AuthenticatedRequest, res) => {
  console.log('📋 Preview route hit, user:', req.user ? 'authenticated' : 'not authenticated');
  
  if (!req.user) {
    console.log('❌ No user found in request');
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`🔍 Preview request for document ${documentId} by user ${userId}`);

    if (isNaN(documentId)) {
      console.log(`❌ Invalid document ID: ${req.params.id}`);
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      console.log(`❌ Document ${documentId} not found for user ${userId}`);
      return res.status(404).json({ message: 'Document not found' });
    }

    console.log(`✅ Found document: ${document.fileName}, type: ${document.mimeType}`);

    // Set appropriate headers
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    // For PDFs, add headers to ensure proper display in iframe
    if (document.mimeType === 'application/pdf') {
      res.setHeader('Content-Security-Policy', 'frame-ancestors \'self\'');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }

    // Handle cloud storage documents
    if (document.gcsPath) {
      try {
        const fileBuffer = await storage.getFileBuffer(document.gcsPath);
        if (!fileBuffer) {
          console.log(`❌ File buffer not found for ${document.gcsPath}`);
          return res.status(404).json({ message: 'File not found in storage' });
        }
        return res.send(fileBuffer);
      } catch (error) {
        console.error('Failed to get file from storage:', error);
        return res.status(500).json({ message: 'Failed to load document' });
      }
    }

    // Handle legacy local files
    const fs = require('fs');
    if (fs.existsSync(document.filePath)) {
      return res.sendFile(require('path').resolve(document.filePath));
    } else {
      console.log(`❌ Local file not found: ${document.filePath}`);
      return res.status(404).json({ message: 'File not found' });
    }

  } catch (error: any) {
    console.error('Document preview error:', error);
    res.status(500).json({
      message: 'Failed to load document preview',
      error: error.message,
    });
  }
});

export default router;