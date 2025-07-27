import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { advancedOCRService } from '../advancedOCRService.js';
import { requireAuth } from '../middleware/auth.js';
import { storage } from '../storage.js';
import { nanoid } from 'nanoid';
import path from 'path';

const router = express.Router();

// Configure multer for multi-page uploads
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for multi-page scans
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type for scanning'));
    }
  }
});

// Validation schemas
const ProcessPagesSchema = z.object({
  pages: z.array(z.object({
    fileName: z.string(),
    corners: z.array(z.object({
      x: z.number(),
      y: z.number()
    })).optional(),
    colorMode: z.enum(['auto', 'color', 'grayscale', 'bw']).default('auto'),
    rotation: z.number().default(0)
  })),
  documentName: z.string().min(1, 'Document name is required'),
  categoryId: z.number().optional(),
  tags: z.string().optional()
});

/**
 * POST /api/scanning/process-pages
 * Process multiple scanned pages and generate searchable PDF
 */
router.post('/process-pages', 
  requireAuth,
  upload.array('pages', 20), // Support up to 20 pages
  async (req, res) => {
    try {
      const user = req.user!;
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No pages provided for processing' });
      }

      // Parse and validate request body
      const requestData = JSON.parse(req.body.metadata || '{}');
      const validatedData = ProcessPagesSchema.parse(requestData);

      console.log(`Processing ${files.length} pages for user ${user.id}`);

      // Initialize OCR service
      await advancedOCRService.initialize();

      // Prepare pages for processing
      const pages = files.map((file, index) => {
        const pageInfo = validatedData.pages[index] || { colorMode: 'auto' as const };
        return {
          imageBuffer: file.buffer,
          corners: pageInfo.corners,
          colorMode: pageInfo.colorMode
        };
      });

      // Process all pages
      const processedPages = await advancedOCRService.processMultiplePages(pages);

      // Generate searchable PDF
      const { pdfBuffer, metadata } = await advancedOCRService.generateSearchablePDF(
        processedPages,
        `${validatedData.documentName}.pdf`
      );

      // Generate unique file name and path
      const fileId = nanoid();
      const fileName = `${validatedData.documentName}-${fileId}.pdf`;
      const filePath = `documents/${user.id}/${fileName}`;

      // Save PDF to storage
      await storage.saveFile(filePath, pdfBuffer);

      // Extract combined text from all pages
      const extractedText = processedPages
        .map(page => page.ocrResult.text)
        .join('\n\n')
        .trim();

      // Calculate overall confidence
      const averageConfidence = processedPages.reduce(
        (sum, page) => sum + page.ocrResult.confidence, 0
      ) / processedPages.length;

      // Create document record
      const document = await storage.createDocument({
        userId: user.id,
        name: validatedData.documentName,
        fileName,
        filePath,
        mimeType: 'application/pdf',
        fileSize: pdfBuffer.length,
        extractedText,
        processingType: 'advanced_scan',
        confidence: averageConfidence / 100, // Convert to 0-1 scale
        categoryId: validatedData.categoryId,
        tags: validatedData.tags ? [validatedData.tags] : [],
        metadata: {
          scanType: 'advanced_multi_page',
          pageCount: processedPages.length,
          processingDetails: metadata,
          originalFiles: files.map(f => f.originalname),
          enhancement: processedPages[0]?.metadata.enhancement || []
        }
      });

      res.json({
        success: true,
        document: {
          id: document.id,
          name: document.name,
          fileName: document.fileName,
          fileSize: document.fileSize,
          pageCount: metadata.pageCount,
          confidence: averageConfidence,
          extractedText: extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''),
          processingMetadata: {
            totalTextLength: metadata.totalTextLength,
            compressionRatio: metadata.compressionRatio,
            averageConfidence: metadata.averageConfidence,
            enhancementApplied: processedPages[0]?.metadata.enhancement || []
          }
        }
      });

    } catch (error: any) {
      console.error('Advanced scanning error:', error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: 'Invalid request data',
          errors: error.errors 
        });
      }

      res.status(500).json({ 
        message: 'Advanced scanning failed',
        error: error.message 
      });
    }
  }
);

/**
 * POST /api/scanning/enhance-image
 * Enhance a single image for better OCR results
 */
router.post('/enhance-image',
  requireAuth,
  upload.single('image'),
  async (req, res) => {
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: 'No image provided' });
      }

      await advancedOCRService.initialize();

      // Enhance image
      const { enhanced, metadata } = await advancedOCRService.enhanceImageForOCR(file.buffer);

      // Convert enhanced image to base64 for preview
      const enhancedBase64 = enhanced.toString('base64');

      res.json({
        success: true,
        enhanced: `data:image/jpeg;base64,${enhancedBase64}`,
        metadata,
        originalSize: file.size,
        enhancedSize: enhanced.length,
        compressionRatio: (enhanced.length / file.size) * 100
      });

    } catch (error: any) {
      console.error('Image enhancement error:', error);
      res.status(500).json({ 
        message: 'Image enhancement failed',
        error: error.message 
      });
    }
  }
);

/**
 * POST /api/scanning/extract-text
 * Extract text from a single image using advanced OCR
 */
router.post('/extract-text',
  requireAuth,
  upload.single('image'),
  async (req, res) => {
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: 'No image provided' });
      }

      await advancedOCRService.initialize();

      // Enhance image first
      const { enhanced } = await advancedOCRService.enhanceImageForOCR(file.buffer);

      // Extract text
      const ocrResult = await advancedOCRService.extractTextFromImage(enhanced);

      res.json({
        success: true,
        text: ocrResult.text,
        confidence: ocrResult.confidence,
        wordCount: ocrResult.words.length,
        words: ocrResult.words.filter(word => word.confidence > 30), // Only confident words
        metadata: {
          originalSize: file.size,
          enhancedSize: enhanced.length,
          processingTime: Date.now()
        }
      });

    } catch (error: any) {
      console.error('Text extraction error:', error);
      res.status(500).json({ 
        message: 'Text extraction failed',
        error: error.message 
      });
    }
  }
);

/**
 * GET /api/scanning/health
 * Check OCR service health and capabilities
 */
router.get('/health', requireAuth, async (req, res) => {
  try {
    // Test OCR service initialization
    await advancedOCRService.initialize();

    res.json({
      success: true,
      status: 'operational',
      capabilities: {
        multiPageScanning: true,
        edgeDetection: true,
        perspectiveCorrection: true,
        ocrLanguages: ['eng'],
        colorFilters: ['auto', 'color', 'grayscale', 'bw'],
        maxPages: 20,
        maxFileSize: '50MB'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('OCR service health check failed:', error);
    res.status(503).json({
      success: false,
      status: 'unavailable',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;