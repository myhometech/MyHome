import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { ImageProcessingService } from '../imageProcessingService';
import { PDFOptimizationService } from '../pdfOptimizationService';
import { storage } from '../storage';

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

// Enhanced document upload with image compression and PDF optimization
router.post('/upload', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const uploadedFile = files.file?.[0];
    const thumbnailFile = files.thumbnail?.[0];

    if (!uploadedFile) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.user!.id;
    const categoryId = req.body.categoryId ? parseInt(req.body.categoryId) : null;
    
    console.log('Processing uploaded file:', {
      name: uploadedFile.originalname,
      size: uploadedFile.size,
      type: uploadedFile.mimetype,
      userId,
      categoryId
    });

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

    // Create document record
    const document = await storage.createDocument({
      name: path.parse(uploadedFile.originalname).name,
      fileName: uploadedFile.originalname,
      filePath: finalFilePath,
      mimeType: uploadedFile.mimetype,
      fileSize: uploadedFile.size,
      userId,
      categoryId,
      processingMetadata,
      thumbnailPath,
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
router.get('/', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user!.id;
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

    // Use optimized search if search vector is available
    const documents = await storage.searchDocuments({
      userId,
      searchQuery: search as string,
      categoryId: category ? parseInt(category as string) : undefined,
      limit: limitNum,
      offset,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    });

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
router.get('/:id/thumbnail', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user!.id;

    const document = await storage.getDocumentById(documentId, userId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const thumbnailPath = document.thumbnailPath || 
                         imageProcessor.getThumbnailPath(document.filePath);

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

export default router;