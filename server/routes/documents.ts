import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ImageProcessingService } from '../imageProcessingService';
import { PDFOptimizationService } from '../pdfOptimizationService';
import { EnhancedOCRStrategies } from '../enhancedOCRStrategies';
import { storage } from '../storage';
import { StorageService } from '../storage/StorageService';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../simpleAuth';

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

// Helper function to generate document placeholder thumbnails
function generateDocumentPlaceholder(mimeType: string, fileName: string): string {
  let iconPath = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8';
  let backgroundColor = '#8B5CF6'; // Purple
  let iconColor = '#FFFFFF';

  if (mimeType?.includes('pdf')) {
    backgroundColor = '#8B5CF6'; // Purple for PDFs
    iconPath = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8';
  } else if (mimeType?.startsWith('image/')) {
    backgroundColor = '#8B5CF6'; // Purple for images
    iconPath = 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M8.5 8.5l5.5 5.5 4-4';
  }

  const fileExtension = path.extname(fileName).slice(1).toUpperCase() || 'DOC';

  return `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" fill="${backgroundColor}" rx="8"/>
    <svg x="50" y="40" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="1.5">
      <path d="${iconPath}"/>
    </svg>
    <text x="100" y="170" text-anchor="middle" fill="${iconColor}" font-family="Arial, sans-serif" font-size="14" font-weight="bold">${fileExtension}</text>
  </svg>`;
}

// DOC-303: Enhanced document upload with auto-categorization via rules and AI fallback
router.post('/', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), requireAuth, async (req: any, res: any) => {
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

    // Validate required data before creating document
    if (!finalFilePath || !uploadedFile.originalname || !uploadedFile.mimetype) {
      throw new Error('Missing required file data for document creation');
    }

    console.log('📝 Creating document record:', {
      name: path.parse(uploadedFile.originalname).name,
      fileName: uploadedFile.originalname,
      filePath: finalFilePath,
      mimeType: uploadedFile.mimetype,
      fileSize: uploadedFile.size,
      userId,
      categoryId,
      categorizationSource
    });

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

    console.log('✅ Document created successfully:', document.id);

    // AUTO-GENERATE INSIGHTS: Queue insight generation for new documents
    try {
      const { insightJobQueue } = await import('../insightJobQueue');
      const { documentProcessor } = await import('../documentProcessor');

      // Process document to extract text if needed
      let extractedText = '';
      if (document.filePath && uploadedFile.mimetype) {
        try {
          const processedDoc = await documentProcessor.processDocument(
            document.filePath,
            uploadedFile.originalname,
            uploadedFile.mimetype
          );
          extractedText = processedDoc.extractedText || '';

          // Update document with extracted text
          if (extractedText && extractedText.length > 20) {
            await storage.updateDocument(document.id, userId, {
              extractedText,
              ocrConfidence: processedDoc.confidence * 100
            });

            // CHAT-008: Extract structured facts after OCR
            try {
              const { factExtractionService } = await import('../services/factExtractionService');
              const factResults = await factExtractionService.processDocumentFacts(
                document.id,
                extractedText,
                uploadedFile.originalname,
                userId,
                req.user.household?.id
              );

              if (factResults.factsExtracted > 0) {
                console.log(`📊 Extracted ${factResults.factsExtracted} facts from ${uploadedFile.originalname} (avg confidence: ${factResults.confidence.toFixed(2)})`);
              }
            } catch (factError) {
              console.warn('Fact extraction failed, continuing with document processing:', factError);
            }
          }
        } catch (processingError) {
          console.warn('Document processing failed, will generate insights without text:', processingError);
        }
      }

      // Queue insight generation job
      if (extractedText && extractedText.length > 20) {
        const jobId = await insightJobQueue.addInsightJob({
          documentId: document.id,
          userId,
          documentType: categorizationSource === 'ai' ? 'general' : 'unknown',
          documentName: uploadedFile.originalname,
          extractedText,
          mimeType: uploadedFile.mimetype,
          priority: 5
        });

        if (jobId) {
          console.log(`🔍 Queued insight generation job ${jobId} for document ${document.id}`);
        }
      } else {
        console.log(`⚠️ Skipping insight generation for document ${document.id} - insufficient text`);
      }
    } catch (insightError) {
      console.warn('Failed to queue insight generation, continuing with upload:', insightError);
    }

    // Clean up temporary files
    try {
      // Use fs.promises for proper async handling
      await fs.promises.unlink(uploadedFile.path); // Remove original temp file
      if (thumbnailFile) {
        await fs.promises.unlink(thumbnailFile.path); // Remove temp thumbnail
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
    console.error('🚨 Upload error details:', {
      message: error.message,
      stack: error.stack,
      fileName: req.files?.file?.[0]?.originalname,
      fileSize: req.files?.file?.[0]?.size,
      userId: req.user?.id
    });

    // Clean up any temporary files on error
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      // Use fs.promises that we already imported

      if (files.file?.[0]) {
        await fs.promises.unlink(files.file[0].path);
      }
      if (files.thumbnail?.[0]) {
        await fs.promises.unlink(files.thumbnail[0].path);
      }
    } catch (cleanupError) {
      console.warn('Failed to clean up temp files after error:', cleanupError);
    }

    // Send more specific error message
    const errorMessage = error.message || 'Unknown upload error';
    console.error('🚨 Sending error response:', errorMessage);

    res.status(500).json({
      message: errorMessage.includes('Failed to upload document') ? errorMessage : 'Failed to upload document',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Upload processing failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get optimized document list with pagination and search
router.get('/', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    console.log('[DOCUMENTS] No user authentication on GET /');
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;
    console.log(`[DOCUMENTS] Fetching documents for user ${userId}`);
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

// Get individual document details by ID
router.get('/:id', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    console.log(`[DOCUMENT-ROUTE] No user authentication for document ${req.params.id}`);
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`[DOCUMENT-ROUTE] Fetching document ${documentId} for user ${userId}`);

    if (isNaN(documentId) || documentId <= 0) {
      console.log(`[DOCUMENT-ROUTE] Invalid document ID: ${req.params.id}`);
      return res.status(400).json({ 
        message: 'Invalid document ID',
        error: 'INVALID_DOCUMENT_ID',
        providedId: req.params.id
      });
    }

    // Get document with proper error handling
    let document;
    try {
      document = await storage.getDocument(documentId, userId);
    } catch (storageError: any) {
      console.error(`[DOCUMENT-ROUTE] Storage error for document ${documentId}:`, storageError);
      return res.status(500).json({
        message: 'Database error while fetching document',
        error: storageError.message,
        documentId,
        timestamp: new Date().toISOString()
      });
    }

    if (!document) {
      console.log(`[DOCUMENT-ROUTE] Document ${documentId} not found for user ${userId}`);

      // Check if this document exists in insights (indicates it was recently deleted)
      try {
        const userInsights = await storage.getInsights(userId);
        const relatedInsights = userInsights.filter(insight =>
          insight.documentId && Number(insight.documentId) === documentId
        );

        if (relatedInsights.length > 0) {
          console.log(`[DOCUMENT-ROUTE] Found ${relatedInsights.length} insights referencing missing document ${documentId}`);

          // Clean up orphaned insights
          for (const insight of relatedInsights) {
            try {
              await storage.deleteInsight(insight.id);
              console.log(`[DOCUMENT-ROUTE] Cleaned up orphaned insight ${insight.id}`);
            } catch (deleteError) {
              console.warn(`[DOCUMENT-ROUTE] Failed to clean up insight ${insight.id}:`, deleteError);
            }
          }
        }

        // Debug info
        const allDocuments = await storage.getDocuments(userId);
        console.log(`[DOCUMENT-ROUTE] User has ${allDocuments.length} total documents, but document ${documentId} not found`);

      } catch (debugError) {
        console.warn(`[DOCUMENT-ROUTE] Debug operations failed:`, debugError);
      }

      return res.status(404).json({
        message: 'Document not found',
        error: 'DOCUMENT_NOT_FOUND',
        documentId,
        suggestion: 'This document may have been deleted or moved.',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[DOCUMENT-ROUTE] Document ${documentId} found: ${document.name} (encrypted: ${document.isEncrypted})`);

    // Return document with proper structure
    res.json({
      id: document.id,
      userId: document.userId,
      categoryId: document.categoryId,
      name: document.name,
      fileName: document.fileName,
      filePath: document.filePath,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      tags: document.tags,
      extractedText: document.extractedText,
      summary: document.summary,
      ocrProcessed: document.ocrProcessed,
      uploadedAt: document.uploadedAt,
      expiryDate: document.expiryDate,
      isEncrypted: document.isEncrypted,
      gcsPath: document.gcsPath || null
    });

  } catch (error: any) {
    console.error(`[DOCUMENT-ROUTE] Unexpected error fetching document ${req.params.id}:`, {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      documentId: req.params.id
    });
    res.status(500).json({
      message: 'Failed to fetch document',
      error: error.message,
      documentId: req.params.id,
      timestamp: new Date().toISOString()
    });
  }
});

// Get document thumbnail
router.get('/:id/thumbnail', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(documentId)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    console.log(`[THUMBNAIL] Generating thumbnail for document ${documentId}, gcsPath: ${document.gcsPath}, filePath: ${document.filePath}`);

    let fileBuffer: Buffer | null = null;
    let sourceFilePath: string | null = null;
    let fileAccessible = false;

    // Try to access file from GCS first (use gcsPath or fall back to filePath)
    const storagePath = document.gcsPath || document.filePath;
    if (storagePath && storagePath.trim()) {
      try {
        const storageService = StorageService.initialize();
        fileBuffer = await storageService.download(storagePath);
        if (fileBuffer && fileBuffer.length > 0) {
          // Create temporary file for thumbnail generation
          sourceFilePath = path.join('/tmp', `temp_${documentId}_${Date.now()}${path.extname(document.fileName)}`);
          fs.writeFileSync(sourceFilePath, fileBuffer);
          fileAccessible = true;
          console.log(`[THUMBNAIL] Successfully downloaded from GCS: ${fileBuffer.length} bytes`);
        }
      } catch (gcsError) {
        console.warn(`[THUMBNAIL] Failed to fetch from GCS for document ${documentId}:`, gcsError);
      }
    }

    // Try local file as fallback
    if (!fileAccessible && document.filePath && fs.existsSync(document.filePath)) {
      sourceFilePath = document.filePath;
      fileAccessible = true;
      console.log(`[THUMBNAIL] Using local file: ${document.filePath}`);
    }

    // If no file accessible, return placeholder immediately
    if (!fileAccessible) {
      console.log(`[THUMBNAIL] No accessible file for document ${documentId}, returning placeholder`);
      const placeholderSvg = generateDocumentPlaceholder(document.mimeType, document.fileName);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(placeholderSvg);
    }

    // Check for existing thumbnail first
    if (sourceFilePath && !sourceFilePath.includes('/tmp/')) {
      const thumbnailPath = imageProcessor.getThumbnailPath(sourceFilePath);
      if (fs.existsSync(thumbnailPath)) {
        console.log(`[THUMBNAIL] Found existing thumbnail: ${thumbnailPath}`);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(path.resolve(thumbnailPath));
      }
    }

    // Generate thumbnail for images  
    if (document.mimeType?.startsWith('image/') && sourceFilePath) {
      try {
        const thumbnailOutputPath = path.join('/tmp', `thumb_${documentId}_${Date.now()}.jpg`);
        console.log(`[THUMBNAIL] Generating image thumbnail: ${thumbnailOutputPath}`);
        
        const result = await imageProcessor.processImage(sourceFilePath, thumbnailOutputPath, {
          maxWidth: 300,
          maxHeight: 300,
          quality: 80,
          generateThumbnail: true
        });

        // Cleanup temp file if created from GCS
        if (document.gcsPath && sourceFilePath.includes('/tmp/')) {
          fs.unlinkSync(sourceFilePath);
        }

        if (result.thumbnailPath && fs.existsSync(result.thumbnailPath)) {
          console.log(`[THUMBNAIL] Successfully generated image thumbnail`);
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.sendFile(path.resolve(result.thumbnailPath));
        }
      } catch (thumbnailError) {
        console.warn(`[THUMBNAIL] Failed to generate image thumbnail for document ${documentId}:`, thumbnailError);
      }
    }

    // For all other cases (PDFs, unknown types), return placeholder
    console.log(`[THUMBNAIL] Returning placeholder for document ${documentId}, mimeType: ${document.mimeType}`);
    
    // Cleanup temp file if created
    if (sourceFilePath && sourceFilePath.includes('/tmp/') && fs.existsSync(sourceFilePath)) {
      fs.unlinkSync(sourceFilePath);
    }

    const placeholderSvg = generateDocumentPlaceholder(document.mimeType, document.fileName);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(placeholderSvg);

  } catch (error: any) {
    console.error(`[THUMBNAIL] Error generating thumbnail for document ${req.params.id}:`, error);
    
    // Always return a placeholder on error
    try {
      const placeholderSvg = generateDocumentPlaceholder('application/octet-stream', 'Document');
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300'); // Shorter cache for errors
      res.send(placeholderSvg);
    } catch (placeholderError) {
      console.error(`[THUMBNAIL] Failed to generate placeholder:`, placeholderError);
      res.status(500).json({ message: 'Failed to generate thumbnail' });
    }
  }
});

// Enhanced OCR retry endpoint for failed OCR cases
router.post('/:id/retry-ocr', requireAuth, async (req: any, res: any) => {
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
    const storageService = StorageService.initialize();
    const fileBuffer = await storageService.download(document.gcsPath || document.filePath);

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
router.post('/:id/analyze-for-ocr', requireAuth, async (req: any, res: any) => {
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
    const storageService = StorageService.initialize();
    const fileBuffer = await storageService.download(document.gcsPath || document.filePath);

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
      currentConfidence: 0
    });

  } catch (error) {
    console.error('OCR analysis error:', error);
    res.status(500).json({
      message: 'OCR analysis failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Auto-cleanup orphaned insights when insights are requested
router.get('/auto-cleanup-insights', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;
    console.log(`[AUTO-CLEANUP] Starting automatic cleanup for user ${userId}`);

    // Get all insights and documents for the user
    const [allInsights, allDocuments] = await Promise.all([
      storage.getInsights(userId),
      storage.getDocuments(userId)
    ]);

    const documentIds = new Set(allDocuments.map(doc => doc.id));
    let cleanedCount = 0;

    // Find and delete orphaned insights
    for (const insight of allInsights) {
      if (insight.documentId && 
          typeof insight.documentId === 'number' && 
          insight.documentId > 0 && 
          !documentIds.has(insight.documentId)) {

        try {
          await storage.deleteInsight(insight.id);
          cleanedCount++;
          console.log(`[AUTO-CLEANUP] Deleted orphaned insight: ${insight.id} -> document ${insight.documentId}`);
        } catch (error) {
          console.error(`[AUTO-CLEANUP] Failed to delete insight ${insight.id}:`, error);
        }
      }
    }

    console.log(`[AUTO-CLEANUP] Completed: ${cleanedCount} orphaned insights removed`);

    res.json({
      success: true,
      cleanedCount,
      totalInsights: allInsights.length,
      totalDocuments: allDocuments.length
    });

  } catch (error: any) {
    console.error('Auto-cleanup failed:', error);
    res.status(500).json({
      message: 'Auto-cleanup failed',
      error: error.message,
    });
  }
});

// Clean up orphaned insights that reference deleted documents
router.post('/cleanup-orphaned-insights', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;

    // Get all insights for the user
    const allInsights = await storage.getInsights(userId);
    console.log(`[CLEANUP] Found ${allInsights.length} total insights for user ${userId}`);

    let cleanedCount = 0;
    let orphanedInsights = [];
    let invalidDataInsights = [];

    // Check each insight for data integrity issues
    for (const insight of allInsights) {
      // Check for invalid documentId data types and values
      const documentId = insight.documentId;

      // Flag insights with invalid documentId values
      let hasValidId = false;

      if (documentId !== null && documentId !== undefined) {
        if (typeof documentId === 'string') {
          const stringId = documentId as string;
          hasValidId = stringId.trim() !== '' && stringId !== '0';
        } else if (typeof documentId === 'number') {
          hasValidId = documentId > 0;
        }
      }

      if (hasValidId) {

        const numericDocumentId = Number(documentId);

        if (isNaN(numericDocumentId) || numericDocumentId <= 0) {
          invalidDataInsights.push(insight);
          console.log(`[CLEANUP] Found insight with invalid documentId data: ${insight.id} -> ${documentId} (${typeof documentId})`);
          continue;
        }

        // Check if the document actually exists
        try {
          const document = await storage.getDocument(numericDocumentId, userId);
          if (!document) {
            orphanedInsights.push(insight);
            console.log(`[CLEANUP] Found orphaned insight: ${insight.id} -> document ${numericDocumentId}`);
          }
        } catch (error) {
          // Document doesn't exist or error accessing it
          orphanedInsights.push(insight);
          console.log(`[CLEANUP] Found orphaned insight (error): ${insight.id} -> document ${numericDocumentId}`, error);
        }
      }
      // Skip insights without documentId (vehicle insights, manual events) - these are valid
    }

    // Delete insights with invalid data
    for (const invalidInsight of invalidDataInsights) {
      try {
        await storage.deleteInsight(invalidInsight.id);
        cleanedCount++;
        console.log(`[CLEANUP] Deleted insight with invalid data: ${invalidInsight.id}`);
      } catch (error) {
        console.error(`[CLEANUP] Failed to delete invalid insight ${invalidInsight.id}:`, error);
      }
    }

    // Delete orphaned insights
    for (const orphanedInsight of orphanedInsights) {
      try {
        await storage.deleteInsight(orphanedInsight.id);
        cleanedCount++;
        console.log(`[CLEANUP] Deleted orphaned insight: ${orphanedInsight.id}`);
      } catch (error) {
        console.error(`[CLEANUP] Failed to delete orphaned insight ${orphanedInsight.id}:`, error);
      }
    }

    console.log(`[CLEANUP] Deep cleanup completed: ${cleanedCount} invalid insights removed`);

    res.json({
      message: `Deep cleanup completed: ${cleanedCount} invalid insights removed`,
      cleanedCount,
      orphanedFound: orphanedInsights.length,
      invalidDataFound: invalidDataInsights.length,
      totalInsights: allInsights.length,
      details: {
        orphanedInsights: orphanedInsights.map(i => ({ id: i.id, documentId: i.documentId })),
        invalidDataInsights: invalidDataInsights.map(i => ({ id: i.id, documentId: i.documentId, type: typeof i.documentId }))
      }
    });

  } catch (error: any) {
    console.error('Failed to clean up insights:', error);
    res.status(500).json({
      message: 'Failed to clean up insights',
      error: error.message,
    });
  }
});


// Search-as-you-type endpoint with ranking and relevance
router.get('/search', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.json({ results: [], message: 'Search query required' });
    }

    if (q.length < 2) {
      return res.json({ results: [], message: 'Search query must be at least 2 characters' });
    }

    const results = await storage.searchDocuments(req.user.id, q, parseInt(limit as string));

    res.json({
      results,
      query: q,
      count: results.length,
      message: results.length === 0 ? 'No documents found' : `Found ${results.length} document(s)`
    });

  } catch (error) {
    console.error('Document search error:', error);
    res.status(500).json({
      message: 'Failed to search documents',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// CHAT-008: Get structured facts for a document with RBAC
router.get('/:id/facts', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    // Verify user has access to the document
    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Get document facts for this user/document
    const facts = await storage.getDocumentFacts(documentId, userId);

    res.json({
      success: true,
      documentId,
      facts,
      count: facts.length
    });

  } catch (error) {
    console.error('Failed to get document facts:', error);
    res.status(500).json({
      message: 'Failed to retrieve document facts',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug endpoint to list user's documents with IDs
router.get('/debug/list', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;
    const documents = await storage.getDocuments(userId);

    const documentList = documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      fileName: doc.fileName,
      uploadedAt: doc.uploadedAt,
      categoryId: doc.categoryId
    }));

    console.log(`[DEBUG] User ${userId} has ${documents.length} documents:`, documentList);

    res.json({
      userId,
      documentCount: documents.length,
      documents: documentList
    });

  } catch (error: any) {
    console.error('Failed to list documents for debug:', error);
    res.status(500).json({
      message: 'Failed to list documents',
      error: error.message,
    });
  }
});

// Debug endpoint to validate insights and their document references
router.get('/debug/validate-insights', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;
    const insights = await storage.getInsights(userId);
    const documents = await storage.getDocuments(userId);

    const documentIds = new Set(documents.map(doc => doc.id));
    const validInsights = [];
    const invalidInsights = [];

    for (const insight of insights) {
      if (!insight.documentId || insight.documentId <= 0) {
        // Skip non-document insights (manual events, etc)
        continue;
      }

      if (documentIds.has(insight.documentId)) {
        validInsights.push({
          id: insight.id,
          documentId: insight.documentId,
          title: insight.title,
          type: insight.type
        });
      } else {
        invalidInsights.push({
          id: insight.id,
          documentId: insight.documentId,
          title: insight.title,
          type: insight.type
        });
      }
    }

    console.log(`[DEBUG-VALIDATE] User ${userId} insights validation:`, {
      totalInsights: insights.length,
      validInsights: validInsights.length,
      invalidInsights: invalidInsights.length,
      documentCount: documents.length
    });

    res.json({
      userId,
      totalInsights: insights.length,
      validInsights,
      invalidInsights,
      documentCount: documents.length,
      validDocumentIds: Array.from(documentIds).slice(0, 10) // Sample of valid IDs
    });

  } catch (error: any) {
    console.error('Failed to validate insights:', error);
    res.status(500).json({
      message: 'Failed to validate insights',
      error: error.message,
    });
  }
});

// Download document file
router.get('/:id/download', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(documentId)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    console.log(`[PDF-DOWNLOAD] Attempting to serve document ${documentId} for user ${userId}`);
    console.log(`[PDF-DOWNLOAD] Document details:`, {
      id: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      gcsPath: document.gcsPath,
      filePath: document.filePath,
      isEncrypted: document.isEncrypted
    });

    // Check if document is stored in GCS
    if (document.gcsPath) {
      try {
        const storageService = StorageService.initialize();
        const fileBuffer = await storageService.download(document.gcsPath);

        if (fileBuffer) {
          console.log(`[PDF-DOWNLOAD] Successfully downloaded from GCS: ${fileBuffer.length} bytes`);
          // Set appropriate headers for download
          res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
          res.setHeader('Content-Length', fileBuffer.length);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.send(fileBuffer);
          return;
        }
      } catch (gcsError) {
        console.error(`[PDF-DOWNLOAD] GCS download failed for document ${documentId}:`, gcsError);
        // Fall through to local file check
      }
    }

    // Check if original file exists locally
    if (document.filePath && fs.existsSync(document.filePath)) {
      console.log(`[PDF-DOWNLOAD] Serving from local path: ${document.filePath}`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.download(path.resolve(document.filePath), document.fileName);
      return;
    }

    // If no file found, return 404
    console.error(`[PDF-DOWNLOAD] Document file not found for ${documentId}`);
    res.status(404).json({
      message: 'Document file not found',
      documentId,
      filePath: document.filePath,
      gcsPath: document.gcsPath
    });

  } catch (error: any) {
    console.error(`[PDF-DOWNLOAD] Error serving document ${req.params.id}:`, error);
    res.status(500).json({
      message: 'Failed to download document',
      error: error.message,
    });
  }
});

// PDF preview endpoint for direct access
router.get('/:id/preview', requireAuth, async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(documentId)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const document = await storage.getDocument(documentId, userId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    console.log(`[PDF-PREVIEW] Serving preview for document ${documentId}, gcsPath: ${document.gcsPath}, filePath: ${document.filePath}`);

    // Only serve PDFs for preview
    if (document.mimeType !== 'application/pdf') {
      return res.status(400).json({ message: 'Preview only available for PDF documents' });
    }

    let fileFound = false;

    // Check if document is stored in GCS
    if (document.gcsPath && document.gcsPath.trim()) {
      try {
        const storageService = StorageService.initialize();
        const fileBuffer = await storageService.download(document.gcsPath);

        if (fileBuffer && fileBuffer.length > 0) {
          console.log(`[PDF-PREVIEW] Successfully serving from GCS: ${fileBuffer.length} bytes`);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'inline');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.send(fileBuffer);
          return;
        }
      } catch (gcsError) {
        console.warn(`[PDF-PREVIEW] GCS access failed for document ${documentId}:`, gcsError);
        // Continue to check local file
      }
    }

    // Check if original file exists locally
    if (document.filePath && fs.existsSync(document.filePath)) {
      try {
        console.log(`[PDF-PREVIEW] Serving from local path: ${document.filePath}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.sendFile(path.resolve(document.filePath));
        fileFound = true;
        return;
      } catch (localError) {
        console.warn(`[PDF-PREVIEW] Failed to serve local file for document ${documentId}:`, localError);
      }
    }

    // If no file found anywhere, return 500 (not 404, to trigger fallback handling in frontend)
    console.error(`[PDF-PREVIEW] PDF file not accessible for document ${documentId}`);
    console.error(`[PDF-PREVIEW] Checked paths - GCS: ${document.gcsPath}, Local: ${document.filePath}`);
    
    res.status(500).json({
      message: 'PDF file not accessible',
      error: 'FILE_NOT_FOUND',
      documentId,
      filePath: document.filePath,
      gcsPath: document.gcsPath,
      suggestion: 'Document may need to be re-uploaded'
    });

  } catch (error: any) {
    console.error(`[PDF-PREVIEW] Unexpected error serving PDF preview ${req.params.id}:`, error);
    res.status(500).json({
      message: 'Failed to serve PDF preview',
      error: error.message,
      documentId: req.params.id
    });
  }
});

export default router;