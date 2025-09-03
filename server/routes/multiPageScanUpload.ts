import { Express } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../simpleAuth';
import { storage } from '../storage';
import { PDFConversionService } from '../pdfConversionService';
import { StorageService, storageProvider } from '../storage/StorageService';
import { EncryptionService } from '../encryptionService';
import { ocrQueue } from '../ocrQueue';
import { HashingService } from '../hashingService';

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

export function setupMultiPageScanUpload(app: Express) {
  // Multi-page scan upload endpoint
  app.post('/api/documents/multi-page-scan-upload', requireAuth, upload.array('pages', 20), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const userId = getUserId(req);
      const uploadSource = req.body.uploadSource || 'browser_scan';
      const documentName = req.body.documentName || 'Scanned Document';
      const pageCount = parseInt(req.body.pageCount) || files.length;

      console.log(`🔄 UPLOAD: Processing multi-page scan upload: ${files.length} pages from user ${userId}`);
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

      // Convert multiple images to single PDF
      const imagePaths = files.map(file => file.path);
      console.log(`🔄 UPLOAD: Starting PDF conversion for paths:`, imagePaths);
      
      const pdfConversionResult = await pdfConversionService.convertMultipleImagesToPDF(
        imagePaths,
        uploadsDir,
        documentName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')
      );
      
      console.log(`🔄 UPLOAD: PDF conversion result:`, { 
        success: pdfConversionResult.success, 
        pdfPath: pdfConversionResult.pdfPath,
        error: pdfConversionResult.error 
      });

      if (!pdfConversionResult.success) {
        // Clean up uploaded files
        files.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            console.warn(`Failed to cleanup file: ${file.path}`);
          }
        });
        
        return res.status(500).json({ 
          message: "Failed to create PDF from scanned pages",
          error: pdfConversionResult.error 
        });
      }

      // Create document data for the PDF
      const timestamp = new Date();
      const pdfFileName = path.basename(pdfConversionResult.pdfPath);
      
      const documentData = {
        userId,
        fileName: pdfFileName,
        name: documentName,
        filePath: pdfConversionResult.pdfPath,
        fileSize: fs.statSync(pdfConversionResult.pdfPath).size,
        mimeType: 'application/pdf',
        tags: ['browser-scanned', `${pageCount}-pages`],
        uploadSource,
        status: 'pending' as const,
        uploadedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      // Upload to cloud storage with proper streaming
      let cloudStorageKey = '';
      let sourceHash: string | null = null;
      try {
        const storage = storageProvider();
        
        // THMB-1: Compute source hash from the final PDF buffer
        const fileBuffer = await fs.promises.readFile(pdfConversionResult.pdfPath);
        sourceHash = HashingService.computeSourceHash(fileBuffer);
        console.log(`🔐 Computed sourceHash: ${sourceHash} for multi-page scan: ${documentName}`);
        
        if (typeof storage.uploadStream === 'function') {
          const fileStream = fs.createReadStream(pdfConversionResult.pdfPath);
          cloudStorageKey = await storage.uploadStream(
            fileStream, 
            StorageService.generateFileKey(userId, `temp_${Date.now()}`, pdfFileName),
            documentData.mimeType
          );
          fileStream.destroy();
        } else {
          cloudStorageKey = await storage.upload(
            fileBuffer, 
            StorageService.generateFileKey(userId, `temp_${Date.now()}`, pdfFileName),
            documentData.mimeType
          );
        }
        
        console.log(`✅ Multi-page PDF uploaded to cloud storage: ${cloudStorageKey}`);

      } catch (uploadError) {
        console.error('❌ Cloud storage upload failed:', uploadError);
        
        // Clean up files
        files.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            console.warn(`Failed to cleanup file: ${file.path}`);
          }
        });
        
        try {
          fs.unlinkSync(pdfConversionResult.pdfPath);
        } catch (error) {
          console.warn(`Failed to cleanup PDF: ${pdfConversionResult.pdfPath}`);
        }
        
        return res.status(500).json({ message: "Failed to upload PDF to cloud storage" });
      }

      // Generate encryption metadata
      let encryptedDocumentKey = '';
      let encryptionMetadata = '';
      
      try {
        const documentKey = EncryptionService.generateDocumentKey();
        encryptedDocumentKey = EncryptionService.encryptDocumentKey(documentKey);
        
        encryptionMetadata = JSON.stringify({
          storageType: 'cloud',
          storageKey: cloudStorageKey,
          encrypted: true,
          algorithm: 'AES-256-GCM'
        });
        
      } catch (encryptionError) {
        console.error('Document encryption setup failed:', encryptionError);
        return res.status(500).json({ message: "Document encryption setup failed" });
      }

      // Create document record with cloud storage reference
      const cloudDocumentData = {
        ...documentData,
        filePath: cloudStorageKey,
        gcsPath: cloudStorageKey,
        encryptedDocumentKey,
        encryptionMetadata,
        sourceHash, // THMB-1: Store source content hash for thumbnail generation
      };

      const document = await storage.createDocument(cloudDocumentData);

      // Clean up temporary files
      files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          console.warn(`Failed to cleanup file: ${file.path}`);
        }
      });

      try {
        fs.unlinkSync(pdfConversionResult.pdfPath);
      } catch (error) {
        console.warn(`Failed to cleanup PDF: ${pdfConversionResult.pdfPath}`);
      }

      console.log(`✅ Multi-page document created: ${document.id} (${pageCount} pages)`);

      // Queue OCR processing
      try {
        await ocrQueue.addJob({
          documentId: document.id,
          fileName: document.fileName,
          filePathOrGCSKey: cloudStorageKey,
          mimeType: document.mimeType,
          userId: document.userId,
          priority: 5
        });
        console.log(`📄 OCR job queued for multi-page document ${document.id}`);
      } catch (ocrError) {
        console.error('Failed to queue OCR job:', ocrError);
      }

      res.status(201).json({
        success: true,
        documentId: document.id,
        fileName: document.fileName,
        pageCount: pageCount,
        message: `Successfully created ${pageCount}-page PDF document`
      });

    } catch (error) {
      console.error("Error processing multi-page scan upload:", error);
      
      // Clean up any uploaded files on error
      if (req.files) {
        const files = req.files as Express.Multer.File[];
        files.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup file: ${file.path}`);
          }
        });
      }
      
      res.status(500).json({ message: "Failed to process multi-page scan upload" });
    }
  });
}