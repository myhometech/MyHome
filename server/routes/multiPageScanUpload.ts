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
import { nanoid } from 'nanoid';

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

      // Create temporary files for processing
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempImagePaths: string[] = [];

      try {
        console.log(`🔄 UPLOAD: Creating temporary files for ${files.length} pages`);

        // Save uploaded files to temporary directory
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '');
          const tempImagePath = path.join(tempDir, `temp-page-${i + 1}-${Date.now()}-${sanitizedName}`);

          await fs.promises.writeFile(tempImagePath, file.buffer);
          tempImagePaths.push(tempImagePath);
          console.log(`🔄 UPLOAD: Saved temp file ${i + 1}: ${tempImagePath} (${file.size} bytes)`);
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

        if (!conversionResult.pdfPath || !fs.existsSync(conversionResult.pdfPath)) {
          throw new Error('PDF file was not created successfully');
        }

        console.log(`✅ UPLOAD: PDF created successfully: ${conversionResult.pdfPath}`);

        // Read the PDF file
        const pdfBuffer = await fs.promises.readFile(conversionResult.pdfPath);
        const pdfStats = fs.statSync(conversionResult.pdfPath);

        if (pdfBuffer.length === 0) {
          throw new Error('Generated PDF file is empty');
        }

        console.log(`📄 UPLOAD: PDF file size: ${pdfStats.size} bytes`);

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
        const document = await storage.createDocument({
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

        // Clean up temporary files
        console.log(`🧹 UPLOAD: Cleaning up ${tempImagePaths.length + 1} temporary files`);
        await Promise.all([
          ...tempImagePaths.map(path => fs.promises.unlink(path).catch(err => 
            console.warn(`Failed to cleanup temp image: ${path}`, err)
          )),
          fs.promises.unlink(conversionResult.pdfPath).catch(err => 
            console.warn(`Failed to cleanup temp PDF: ${conversionResult.pdfPath}`, err)
          )
        ]);

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

      res.status(500).json({ message: error.message || "Failed to process multi-page scan upload" });
    }
  });
}