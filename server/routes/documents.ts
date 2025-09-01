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
router.post('/', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req: any, res: any) => {
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
router.get('/', async (req: any, res: any) => {
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

// Get individual document details by ID
router.get('/:id', async (req: any, res: any) => {
  if (!req.user) {
    console.log(`[DOCUMENT-ROUTE] No user authentication for document ${req.params.id}`);
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`[DOCUMENT-ROUTE] Fetching document ${documentId} for user ${userId}`);

    if (isNaN(documentId)) {
      console.log(`[DOCUMENT-ROUTE] Invalid document ID: ${req.params.id}`);
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    // Enhanced document retrieval with better error logging
    const document = await storage.getDocument(documentId, userId);
    
    if (!document) {
      console.log(`[DOCUMENT-ROUTE] Document ${documentId} not found for user ${userId}`);
      
      // Enhanced debugging - check for document in insights
      try {
        const userInsights = await storage.getInsights(userId);
        const insightWithDocument = userInsights.find(insight => 
          insight.documentId && Number(insight.documentId) === documentId
        );
        
        if (insightWithDocument) {
          console.log(`[DOCUMENT-ROUTE] Found insight ${insightWithDocument.id} referencing missing document ${documentId}`);
        }
        
        const allDocuments = await storage.getDocuments(userId);
        const userDocumentIds = allDocuments.map(doc => doc.id).slice(0, 10);
        
        console.log(`[DOCUMENT-ROUTE] Debug info:`, {
          requestedDocumentId: documentId,
          userDocumentCount: allDocuments.length,
          sampleUserDocumentIds: userDocumentIds,
          hasInsightForDocument: !!insightWithDocument,
          userId: userId
        });
      } catch (debugError) {
        console.warn(`[DOCUMENT-ROUTE] Debug check failed:`, debugError);
      }
      
      return res.status(404).json({ 
        message: `Document ${documentId} not found or not accessible`,
        error: 'DOCUMENT_NOT_FOUND',
        documentId,
        userId,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[DOCUMENT-ROUTE] Document ${documentId} found: ${document.name}`);
    res.json({
      id: document.id,
      name: document.name,
      fileName: document.fileName,
      mimeType: document.mimeType,
      userId: document.userId,
      exists: true,
      uploadedAt: document.uploadedAt,
      categoryId: document.categoryId
    });

  } catch (error: any) {
    console.error(`[DOCUMENT-ROUTE] Failed to fetch document ${req.params.id}:`, {
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
router.get('/:id/thumbnail', async (req: any, res: any) => {
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

    // Check if document is stored in GCS
    if (document.gcsPath) {
      try {
        const storageService = StorageService.initialize();
        const fileBuffer = await storageService.download(document.gcsPath);
        
        if (fileBuffer) {
          // Set appropriate content type
          const contentType = document.mimeType || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', fileBuffer.length);
          res.send(fileBuffer);
          return;
        }
      } catch (gcsError) {
        console.warn(`Failed to fetch from GCS for document ${documentId}:`, gcsError);
        // Fall through to local file check
      }
    }

    // Check for local thumbnail
    const thumbnailPath = imageProcessor.getThumbnailPath(document.filePath);
    
    if (fs.existsSync(thumbnailPath)) {
      res.sendFile(path.resolve(thumbnailPath));
      return;
    }

    // Check if original file exists locally
    if (document.filePath && fs.existsSync(document.filePath)) {
      res.sendFile(path.resolve(document.filePath));
      return;
    }

    // If no file found, return 404
    res.status(404).json({ 
      message: 'Document file not found',
      documentId,
      filePath: document.filePath,
      gcsPath: document.gcsPath
    });

  } catch (error: any) {
    console.error('Failed to serve thumbnail:', error);
    res.status(500).json({
      message: 'Failed to serve thumbnail',
      error: error.message,
    });
  }
});

// Enhanced OCR retry endpoint for failed OCR cases
router.post('/:id/retry-ocr', async (req: any, res: any) => {
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
router.post('/:id/analyze-for-ocr', async (req: any, res: any) => {
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


// Clean up orphaned insights (insights pointing to non-existent documents)
router.post('/cleanup-orphaned-insights', async (req: AuthenticatedRequest, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;
    
    // Get all user insights
    const insights = await storage.getInsights(userId);
    
    // Get all user documents
    const documents = await storage.getDocuments(userId);
    const documentIds = new Set(documents.map(doc => doc.id));
    
    // Find orphaned insights
    const orphanedInsights = insights.filter(insight => 
      insight.documentId && 
      Number(insight.documentId) > 0 && 
      !documentIds.has(Number(insight.documentId))
    );
    
    console.log(`[CLEANUP] Found ${orphanedInsights.length} orphaned insights for user ${userId}`);
    
    // Mark orphaned insights as dismissed
    let cleanedCount = 0;
    for (const insight of orphanedInsights) {
      try {
        await storage.updateInsightStatus(insight.id, 'dismissed');
        cleanedCount++;
        console.log(`[CLEANUP] Dismissed orphaned insight ${insight.id} pointing to document ${insight.documentId}`);
      } catch (updateError) {
        console.error(`[CLEANUP] Failed to dismiss insight ${insight.id}:`, updateError);
      }
    }
    
    res.json({
      success: true,
      orphanedFound: orphanedInsights.length,
      cleaned: cleanedCount,
      message: `Cleaned up ${cleanedCount} orphaned insights`
    });

  } catch (error: any) {
    console.error('Failed to clean up orphaned insights:', error);
    res.status(500).json({
      message: 'Failed to clean up orphaned insights',
      error: error.message,
    });
  }
});

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

// Search-as-you-type endpoint with ranking and relevance
router.get('/search', async (req: any, res: any) => {
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
router.get('/:id/facts', async (req: any, res: any) => {
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
router.get('/debug/list', async (req: any, res: any) => {
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

// Download document file
router.get('/:id/download', async (req: any, res: any) => {
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

    // Check if document is stored in GCS
    if (document.gcsPath) {
      try {
        const storageService = StorageService.initialize();
        const fileBuffer = await storageService.download(document.gcsPath);
        
        if (fileBuffer) {
          // Set appropriate headers for download
          res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
          res.setHeader('Content-Length', fileBuffer.length);
          res.send(fileBuffer);
          return;
        }
      } catch (gcsError) {
        console.warn(`Failed to download from GCS for document ${documentId}:`, gcsError);
        // Fall through to local file check
      }
    }

    // Check if original file exists locally
    if (document.filePath && fs.existsSync(document.filePath)) {
      res.download(path.resolve(document.filePath), document.fileName);
      return;
    }

    // If no file found, return 404
    res.status(404).json({ 
      message: 'Document file not found',
      documentId,
      filePath: document.filePath,
      gcsPath: document.gcsPath
    });

  } catch (error: any) {
    console.error('Failed to download document:', error);
    res.status(500).json({
      message: 'Failed to download document',
      error: error.message,
    });
  }
});

export default router;