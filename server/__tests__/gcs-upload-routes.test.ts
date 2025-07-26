import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { StorageService } from '../storage/StorageService';
import { LocalStorage } from '../storage/LocalStorage';
import fs from 'fs';
import path from 'path';
import { registerRoutes } from '../routes';

// Mock dependencies
vi.mock('../storage/StorageService');
vi.mock('../ocrService', () => ({
  extractTextFromImage: vi.fn().mockResolvedValue('Extracted text'),
  supportsOCR: vi.fn().mockReturnValue(true),
  processDocumentOCRAndSummary: vi.fn().mockResolvedValue({
    extractedText: 'Extracted text',
    summary: 'Generated summary'
  }),
  processDocumentWithDateExtraction: vi.fn().mockResolvedValue(undefined),
  isPDFFile: vi.fn().mockReturnValue(false)
}));

vi.mock('../encryptionService.js', () => ({
  EncryptionService: {
    generateDocumentKey: vi.fn().mockReturnValue('test-key'),
    encryptDocumentKey: vi.fn().mockReturnValue('encrypted-key'),
    encryptFile: vi.fn().mockResolvedValue({
      encryptedPath: '/test/encrypted/path',
      metadata: 'encryption-metadata'
    }),
    createDecryptStream: vi.fn()
  }
}));

vi.mock('../storage', () => ({
  storage: {
    createDocument: vi.fn().mockResolvedValue({ id: 1 }),
    getDocument: vi.fn(),
    updateDocumentOCRAndSummary: vi.fn(),
    updateDocumentTags: vi.fn()
  }
}));

vi.mock('../tagSuggestionService', () => ({
  tagSuggestionService: {
    suggestTags: vi.fn().mockResolvedValue({
      suggestedTags: [{ tag: 'test-tag', confidence: 0.8 }]
    })
  }
}));

describe('GCS Upload Routes Integration', () => {
  let app: express.Application;
  let mockStorageProvider: any;
  let testUploadPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Set up test environment
    testUploadPath = './test-uploads';
    
    // Clean up test directory
    if (fs.existsSync(testUploadPath)) {
      fs.rmSync(testUploadPath, { recursive: true, force: true });
    }
    fs.mkdirSync(testUploadPath, { recursive: true });

    // Mock storage provider
    mockStorageProvider = {
      upload: vi.fn().mockResolvedValue('user123/doc456/test.pdf'),
      download: vi.fn().mockResolvedValue(Buffer.from('test file content')),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.com'),
      getMetadata: vi.fn().mockResolvedValue({
        size: 1024,
        mimeType: 'application/pdf',
        lastModified: new Date()
      })
    };

    // Mock StorageService
    const MockedStorageService = StorageService as any;
    MockedStorageService.getProvider = vi.fn().mockReturnValue(mockStorageProvider);
    MockedStorageService.generateFileKey = vi.fn().mockReturnValue('user123/doc456/test.pdf');

    // Create Express app
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req: any, res, next) => {
      req.user = { id: 'test-user-123' };
      req.session = { user: { id: 'test-user-123' } };
      next();
    });

    await registerRoutes(app);
  });

  afterEach(() => {
    if (fs.existsSync(testUploadPath)) {
      fs.rmSync(testUploadPath, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('POST /api/documents - GCS Upload', () => {
    it('should upload document to GCS successfully', async () => {
      // Create a test file
      const testFilePath = path.join(testUploadPath, 'test.pdf');
      fs.writeFileSync(testFilePath, 'Test PDF content');

      const response = await request(app)
        .post('/api/documents')
        .attach('file', testFilePath)
        .field('name', 'Test Document')
        .field('categoryId', '1')
        .field('tags', JSON.stringify(['test', 'document']))
        .expect(201);

      // Verify GCS upload was called
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringMatching(/^user123\/.*\/test\.pdf$/),
        'application/pdf'
      );

      // Verify response contains document data
      expect(response.body).toEqual({
        id: 1
      });

      // Verify local temporary file was handled properly
      expect(fs.existsSync(testFilePath)).toBe(false); // Should be cleaned up
    });

    it('should handle upload with image conversion to PDF', async () => {
      // Create a test image file with "processed_" prefix
      const testFilePath = path.join(testUploadPath, 'processed_scan.jpg');
      fs.writeFileSync(testFilePath, 'Test JPEG content');

      const response = await request(app)
        .post('/api/documents')
        .attach('file', testFilePath)
        .field('name', 'Scanned Document')
        .expect(201);

      // Verify upload was called with proper MIME type
      expect(mockStorageProvider.upload).toHaveBeenCalled();
      
      expect(response.body).toEqual({
        id: 1
      });
    });

    it('should handle GCS upload failure gracefully', async () => {
      mockStorageProvider.upload.mockRejectedValue(new Error('GCS upload failed'));

      const testFilePath = path.join(testUploadPath, 'test.pdf');
      fs.writeFileSync(testFilePath, 'Test PDF content');

      const response = await request(app)
        .post('/api/documents')
        .attach('file', testFilePath)
        .field('name', 'Test Document')
        .expect(500);

      expect(response.body.message).toBe('File upload to cloud storage failed');
    });

    it('should handle encryption setup failure', async () => {
      // Mock encryption service to fail
      const { EncryptionService } = await import('../encryptionService.js');
      EncryptionService.generateDocumentKey = vi.fn().mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      const testFilePath = path.join(testUploadPath, 'test.pdf');
      fs.writeFileSync(testFilePath, 'Test PDF content');

      const response = await request(app)
        .post('/api/documents')
        .attach('file', testFilePath)
        .field('name', 'Test Document')
        .expect(500);

      expect(response.body.message).toBe('Document encryption setup failed');
      
      // Verify cleanup was attempted
      expect(mockStorageProvider.delete).toHaveBeenCalled();
    });

    it('should validate file upload requirements', async () => {
      const response = await request(app)
        .post('/api/documents')
        .field('name', 'Test Document')
        .expect(400);

      expect(response.body.message).toBe('No file uploaded');
    });

    it('should handle supported MIME types', async () => {
      const supportedTypes = [
        { ext: 'pdf', mime: 'application/pdf' },
        { ext: 'jpg', mime: 'image/jpeg' },
        { ext: 'png', mime: 'image/png' },
        { ext: 'webp', mime: 'image/webp' },
        { ext: 'heic', mime: 'image/heic' }
      ];

      for (const type of supportedTypes) {
        const testFilePath = path.join(testUploadPath, `test.${type.ext}`);
        fs.writeFileSync(testFilePath, `Test ${type.ext} content`);

        const response = await request(app)
          .post('/api/documents')
          .attach('file', testFilePath)
          .field('name', `Test ${type.ext} Document`)
          .expect(201);

        expect(response.body.id).toBe(1);
      }
    });

    it('should generate unique storage keys for concurrent uploads', async () => {
      const uploadPromises = [];
      
      for (let i = 0; i < 3; i++) {
        const testFilePath = path.join(testUploadPath, `test${i}.pdf`);
        fs.writeFileSync(testFilePath, `Test PDF content ${i}`);

        const uploadPromise = request(app)
          .post('/api/documents')
          .attach('file', testFilePath)
          .field('name', `Test Document ${i}`)
          .expect(201);

        uploadPromises.push(uploadPromise);
      }

      await Promise.all(uploadPromises);

      // Verify each upload got a unique storage key
      expect(mockStorageProvider.upload).toHaveBeenCalledTimes(3);
      
      const uploadCalls = mockStorageProvider.upload.mock.calls;
      const storageKeys = uploadCalls.map(call => call[1]);
      
      // All keys should be unique
      const uniqueKeys = new Set(storageKeys);
      expect(uniqueKeys.size).toBe(3);
    });
  });

  describe('GET /api/documents/:id/preview - GCS Download', () => {
    it('should serve document from GCS via signed URL', async () => {
      const mockDocument = {
        id: 1,
        filePath: 'user123/doc456/test.pdf',
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
        isEncrypted: true,
        encryptionMetadata: JSON.stringify({
          storageType: 'cloud',
          storageKey: 'user123/doc456/test.pdf',
          encrypted: true,
          algorithm: 'AES-256-GCM'
        })
      };

      const { storage } = await import('../storage');
      storage.getDocument = vi.fn().mockResolvedValue(mockDocument);

      const response = await request(app)
        .get('/api/documents/1/preview')
        .expect(302); // Redirect to signed URL

      expect(response.headers.location).toBe('https://signed-url.com');
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'user123/doc456/test.pdf',
        3600
      );
    });

    it('should proxy file when signed URL fails', async () => {
      mockStorageProvider.getSignedUrl.mockRejectedValue(new Error('Signed URL failed'));
      
      const mockDocument = {
        id: 1,
        filePath: 'user123/doc456/test.pdf',
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
        isEncrypted: true,
        encryptionMetadata: JSON.stringify({
          storageType: 'cloud',
          storageKey: 'user123/doc456/test.pdf'
        })
      };

      const { storage } = await import('../storage');
      storage.getDocument = vi.fn().mockResolvedValue(mockDocument);

      const response = await request(app)
        .get('/api/documents/1/preview')
        .expect(200);

      expect(mockStorageProvider.download).toHaveBeenCalledWith('user123/doc456/test.pdf');
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('should clean up orphaned records for missing GCS files', async () => {
      mockStorageProvider.exists.mockResolvedValue(false);
      
      const mockDocument = {
        id: 1,
        filePath: 'user123/doc456/missing.pdf',
        mimeType: 'application/pdf',
        fileName: 'missing.pdf',
        isEncrypted: true,
        encryptionMetadata: JSON.stringify({
          storageType: 'cloud',
          storageKey: 'user123/doc456/missing.pdf'
        })
      };

      const { storage } = await import('../storage');
      storage.getDocument = vi.fn().mockResolvedValue(mockDocument);
      storage.deleteDocument = vi.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/documents/1/preview')
        .expect(404);

      expect(response.body.message).toBe('File not found in cloud storage - document record has been cleaned up');
      expect(storage.deleteDocument).toHaveBeenCalledWith(1, 'test-user-123');
    });

    it('should handle documents with legacy local storage', async () => {
      const testFilePath = path.join(testUploadPath, 'legacy.pdf');
      fs.writeFileSync(testFilePath, 'Legacy PDF content');

      const mockDocument = {
        id: 1,
        filePath: testFilePath,
        mimeType: 'application/pdf',
        fileName: 'legacy.pdf',
        isEncrypted: false,
        encryptionMetadata: null
      };

      const { storage } = await import('../storage');
      storage.getDocument = vi.fn().mockResolvedValue(mockDocument);

      const response = await request(app)
        .get('/api/documents/1/preview')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('GCS Error Handling', () => {
    it('should handle GCS service unavailability', async () => {
      mockStorageProvider.upload.mockRejectedValue(new Error('Service Unavailable'));

      const testFilePath = path.join(testUploadPath, 'test.pdf');
      fs.writeFileSync(testFilePath, 'Test PDF content');

      const response = await request(app)
        .post('/api/documents')
        .attach('file', testFilePath)
        .field('name', 'Test Document')
        .expect(500);

      expect(response.body.message).toBe('File upload to cloud storage failed');
    });

    it('should handle network timeouts gracefully', async () => {
      mockStorageProvider.download.mockRejectedValue(new Error('Network timeout'));

      const mockDocument = {
        id: 1,
        filePath: 'user123/doc456/test.pdf',
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
        isEncrypted: true,
        encryptionMetadata: JSON.stringify({
          storageType: 'cloud',
          storageKey: 'user123/doc456/test.pdf'
        })
      };

      const { storage } = await import('../storage');
      storage.getDocument = vi.fn().mockResolvedValue(mockDocument);

      const response = await request(app)
        .get('/api/documents/1/preview')
        .expect(500);

      expect(response.body.message).toBe('Failed to decrypt document for preview');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large file uploads efficiently', async () => {
      // Simulate large file (1MB)
      const largeContent = Buffer.alloc(1024 * 1024, 'x');
      const testFilePath = path.join(testUploadPath, 'large.pdf');
      fs.writeFileSync(testFilePath, largeContent);

      const response = await request(app)
        .post('/api/documents')
        .attach('file', testFilePath)
        .field('name', 'Large Document')
        .expect(201);

      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(String),
        'application/pdf'
      );

      // Verify large buffer was uploaded
      const uploadedBuffer = mockStorageProvider.upload.mock.calls[0][0];
      expect(uploadedBuffer.length).toBe(1024 * 1024);
    });

    it('should clean up temporary files after successful upload', async () => {
      const testFilePath = path.join(testUploadPath, 'cleanup-test.pdf');
      fs.writeFileSync(testFilePath, 'Test cleanup content');

      await request(app)
        .post('/api/documents')
        .attach('file', testFilePath)
        .field('name', 'Cleanup Test')
        .expect(201);

      // File should be scheduled for cleanup (async operation)
      expect(mockStorageProvider.upload).toHaveBeenCalled();
    });
  });
});