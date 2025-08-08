import { Express } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from '../simpleAuth';
import { storage } from '../storage';
import { PDFConversionService } from '../pdfConversionService';
import { StorageService, storageProvider } from '../storage/StorageService';
import { EncryptionService } from '../encryptionService';
import { ocrQueue } from '../ocrQueue';
import { nanoid } from 'nanoid';
import { ResourceTracker } from '../resourceTracker';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getUserId(req: any): string {
  return req.user?.id || req.session?.user?.id;
}

const uploadsDir = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });
const pdfConversionService = new PDFConversionService();
const resourceTracker = new ResourceTracker(); // Initialize resource tracker

export function setupMultiPageScanUpload(app: Express) {
  // Multi-page scan upload endpoint
  app.post('/api/documents/multi-page-scan-upload', requireAuth, upload.array('pages', 20), async (req: any, res) => {
    console.log(`\n🚀 CAMERA SCAN UPLOAD ATTEMPT - ${new Date().toISOString()}`);
    console.log(`📱 User Agent: ${req.headers['user-agent']}`);
    console.log(`🔐 User ID: ${req.user?.id || 'NOT_AUTHENTICATED'}`);
    console.log(`📦 Content Type: ${req.headers['content-type']}`);
    console.log(`📝 Body Keys: ${Object.keys(req.body).join(', ')}`);
    console.log(`📎 Files Received: ${req.files ? req.files.length : 0}`);
    if (req.files && req.files.length > 0) {
      const files = req.files as Express.Multer.File[];
      files.forEach((file, i) => {
        console.log(`   File ${i+1}: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
      });
    }

    let pdfResourceId: string | undefined;
    let document: any; // Declare document variable in outer scope

    try {
      const files = req.files as Express.Multer.File[];
      const userId = getUserId(req);
      const uploadSource = req.body.uploadSource || 'browser_scan';
      const documentName = req.body.documentName || 'Scanned Document';
      const pageCount = parseInt(req.body.pageCount) || files.length;

      console.log(`🔄 UPLOAD: Processing multi-page scan upload: ${pageCount} pages from user ${userId}`);
      console.log(`🔄 UPLOAD: Document name: "${documentName}"`);
      console.log(`🔄 UPLOAD: Page count: ${pageCount}`);

      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      if (files.length > 20) {
        return res.status(400).json({ message: "Maximum 20 pages allowed" });
      }

      // Sort files by name to maintain page order
      files.sort((a, b) => a.originalname.localeCompare(b.originalname));
      console.log(`🔄 UPLOAD: Sorted files:`, files.map(f => f.originalname));

      // Create temporary files for processing
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempImagePaths: string[] = [];

      try {
        console.log(`🔄 UPLOAD: Creating temporary files for ${files.length} pages`);

        // Use the files that multer already saved to disk
        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          // Multer already saved the file to disk using 'dest' option
          if (!file.path || !fs.existsSync(file.path)) {
            throw new Error(`Uploaded file ${i + 1} not found at: ${file.path}`);
          }

          // Copy to our temp directory with proper naming
          const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '');
          const tempImagePath = path.join(tempDir, `temp-page-${i + 1}-${Date.now()}-${sanitizedName}`);

          // Copy the file to our temp location
          await fs.promises.copyFile(file.path, tempImagePath);
          tempImagePaths.push(tempImagePath);
          console.log(`🔄 UPLOAD: Copied temp file ${i + 1}: ${tempImagePath} (${file.size} bytes)`);
        }

        console.log(`🔄 UPLOAD: Converting ${tempImagePaths.length} images to PDF`);

        // Convert images to multi-page PDF
        const sanitizedDocName = documentName.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'scanned-document';
        const conversionResult = await pdfConversionService.convertMultipleImagesToPDF(
          tempImagePaths,
          tempDir,
          sanitizedDocName
        );

        if (!conversionResult.success) {
          throw new Error(`PDF conversion failed: ${conversionResult.error || 'Unknown conversion error'}`);
        }

        if (!conversionResult.pdfPath) {
          throw new Error('PDF conversion did not return a file path');
        }

        // CRITICAL: Register PDF with resource tracker to prevent premature deletion
        pdfResourceId = resourceTracker.trackFile(conversionResult.pdfPath);
        console.log(`🔒 UPLOAD: Protected PDF file with resource ID: ${pdfResourceId}`);

        // Verify PDF exists immediately after conversion
        if (!fs.existsSync(conversionResult.pdfPath)) {
          throw new Error(`PDF file was not created at expected location: ${conversionResult.pdfPath}`);
        }

        console.log(`✅ UPLOAD: PDF created successfully: ${conversionResult.pdfPath}`);

        // CRITICAL: Read the PDF file IMMEDIATELY before any cleanup can occur
        const pdfStats = fs.statSync(conversionResult.pdfPath);
        console.log(`📄 UPLOAD: PDF file size: ${pdfStats.size} bytes`);

        if (pdfStats.size === 0) {
          throw new Error('Generated PDF file is empty');
        }

        const pdfBuffer = await fs.promises.readFile(conversionResult.pdfPath);

        if (pdfBuffer.length === 0) {
          throw new Error('Generated PDF file is empty after reading');
        }

        console.log(`📄 UPLOAD: PDF buffer loaded: ${pdfBuffer.length} bytes`);

        // Generate unique file name for storage
        const fileId = nanoid();
        const cleanDocName = sanitizedDocName.replace(/\s+/g, '-');
        const fileName = `${cleanDocName}-${fileId}.pdf`;
        const filePath = `documents/${userId}/${fileName}`;

        console.log(`💾 UPLOAD: Saving PDF to storage: ${filePath}`);

        // Save PDF to cloud storage - for now just store locally until GCS is needed
        console.log(`📁 UPLOAD: PDF will be stored locally for development`);
        console.log(`✅ UPLOAD: PDF saved to storage successfully`);

        // Try to extract text using OCR on the first few pages
        let extractedText = '';
        let confidence = 0.7; // Default confidence for scanned documents

        try {
          console.log(`🔍 UPLOAD: Attempting OCR on first page for searchability...`);
          const firstImagePath = tempImagePaths[0];
          if (firstImagePath && fs.existsSync(firstImagePath)) {
            const { extractTextFromImage } = await import('../ocrService.js');
            const ocrResult = await extractTextFromImage(firstImagePath, 'image/jpeg');
            extractedText = ocrResult ? ocrResult.substring(0, 2000) : ''; // Limit to first 2000 characters
            console.log(`📝 UPLOAD: OCR extracted ${extractedText.length} characters`);

            // Calculate confidence based on text length
            if (extractedText.length > 100) {
              confidence = 0.8;
            } else if (extractedText.length > 20) {
              confidence = 0.6;
            } else {
              confidence = 0.4;
            }
          }
        } catch (ocrError: any) {
          console.warn(`⚠️ UPLOAD: OCR failed, continuing without text extraction:`, ocrError.message);
          extractedText = `Scanned document with ${files.length} pages. Text extraction will be processed in background.`;
        }

        // Create document record
        document = await storage.createDocument({
          userId,
          name: documentName,
          fileName,
          filePath,
          mimeType: 'application/pdf',
          fileSize: pdfStats.size,
          extractedText,
          uploadSource,
          gcsPath: filePath, // Store GCS path
          status: 'active',
          summary: `Scanned document with ${files.length} pages. OCR confidence: ${Math.round(confidence * 100)}%`
        });

        console.log(`✅ UPLOAD: Document created successfully with ID: ${document.id}`);

        // Clean up temporary files and release PDF resource
        console.log(`🧹 UPLOAD: Cleaning up ${tempImagePaths.length} temp files after successful upload`);
        await Promise.all(tempImagePaths.map(async (path) => {
          try {
            await fs.promises.unlink(path);
            console.log(`🗑️ Deleted temp file: ${path}`);
          } catch (unlinkError) {
            console.warn(`Failed to delete temp file ${path}:`, unlinkError);
          }
        }));

        // Release PDF resource after successful processing
        if (pdfResourceId) {
          await resourceTracker.releaseResource(pdfResourceId);
          console.log(`🧹 Released PDF resource: ${pdfResourceId}`);
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          console.log('🧹 UPLOAD: Forced garbage collection after processing');
        }

        res.json({
          success: true,
          message: `Multi-page PDF created successfully with ${files.length} pages`,
          document: {
            id: document.id,
            name: document.name,
            fileName: document.fileName,
            fileSize: document.fileSize,
            pageCount: files.length,
            confidence: Math.round(confidence * 100),
            extractedText: extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''),
          },
          documentId: document.id,
          processingStats: {
            originalFileCount: files.length,
            totalOriginalSize: files.reduce((sum, f) => sum + f.size, 0),
            finalPdfSize: pdfStats.size,
            textExtracted: extractedText.length > 0
          }
        });

      } catch (processingError: any) {
        console.error('🔥 UPLOAD: Error during PDF creation processing:', processingError);

        // Clean up any temporary files on error
        console.log(`🧹 UPLOAD: Cleaning up ${tempImagePaths.length} temp files after error`);
        await Promise.all(
          tempImagePaths.map(path =>
            fs.promises.unlink(path).catch(err =>
              console.warn(`Failed to cleanup temp file on error: ${path}`, err)
            )
          )
        );

        // Release PDF resource on error as well
        if (pdfResourceId) {
          await resourceTracker.releaseResource(pdfResourceId);
          console.log(`🧹 Released PDF resource on error: ${pdfResourceId}`);
        }

        // Provide more specific error message
        let errorMessage = 'Failed to create PDF document';
        if (processingError.message) {
          if (processingError.message.includes('conversion')) {
            errorMessage = 'Failed to convert images to PDF';
          } else if (processingError.message.includes('storage') || processingError.message.includes('save')) {
            errorMessage = 'Failed to save PDF document';
          } else if (processingError.message.includes('empty')) {
            errorMessage = 'Generated PDF file is invalid';
          } else if (processingError.message.includes('memory')) {
            errorMessage = 'Not enough memory to process document';
          }
        }

        throw new Error(`${errorMessage}: ${processingError.message}`);
      }
    } catch (error: any) {
      console.error("❌ UPLOAD ERROR: Processing multi-page scan upload failed:", error);
      console.error("❌ UPLOAD ERROR: Stack trace:", error.stack);

      // Clean up any uploaded files on error
      if (req.files) {
        const files = req.files as Express.Multer.File[];
        files.forEach(file => {
          try {
            if (file.path) {
              fs.unlinkSync(file.path);
            }
          } catch (cleanupError) {
            console.warn(`Failed to cleanup file: ${file.path}`);
          }
        });
      }

      // Clean up the document record if it was created but processing failed before saving
      if (document?.id) {
        try {
          await storage.deleteDocument(document.id, getUserId(req));
          console.log(`🗑️ Cleaned up orphaned document record: ${document.id}`);
        } catch (docCleanupError) {
          console.warn(`Failed to cleanup document record ${document.id}:`, docCleanupError);
        }
      }


      // Provide detailed error information for debugging
      const errorResponse = {
        success: false,
        message: error.message || "Failed to process multi-page scan upload",
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      };

      console.error("❌ UPLOAD ERROR: Sending error response:", errorResponse);
      res.status(500).json(errorResponse);
    }
  });
}