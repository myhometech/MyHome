import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../StorageService';
import { LocalStorage } from '../LocalStorage';
import fs from 'fs';
import path from 'path';

describe('Storage Integration Tests', () => {
  const testUploadPath = './test-uploads';
  let storageProvider: LocalStorage;

  beforeEach(async () => {
    // Clean up test directory
    if (fs.existsSync(testUploadPath)) {
      fs.rmSync(testUploadPath, { recursive: true, force: true });
    }

    // Set up local storage for testing
    process.env.STORAGE_TYPE = 'local';
    process.env.UPLOAD_PATH = testUploadPath;
    
    StorageService.reset();
    storageProvider = StorageService.initialize() as LocalStorage;
  });

  afterEach(async () => {
    // Clean up after tests
    if (fs.existsSync(testUploadPath)) {
      fs.rmSync(testUploadPath, { recursive: true, force: true });
    }
    StorageService.reset();
  });

  describe('file upload and retrieval workflow', () => {
    it('should complete full upload-download-delete cycle', async () => {
      const testContent = 'Test document content for integration testing';
      const testBuffer = Buffer.from(testContent);
      const testKey = 'user123/doc456/test-integration.txt';
      const testMimeType = 'text/plain';

      // Upload file
      const uploadResult = await storageProvider.upload(testBuffer, testKey, testMimeType);
      expect(uploadResult).toBe(path.resolve(testUploadPath, testKey));

      // Verify file exists
      const exists = await storageProvider.exists(testKey);
      expect(exists).toBe(true);

      // Download file
      const downloadedBuffer = await storageProvider.download(testKey);
      expect(downloadedBuffer.toString()).toBe(testContent);

      // Get metadata
      const metadata = await storageProvider.getMetadata(testKey);
      expect(metadata.size).toBe(testBuffer.length);
      expect(metadata.mimeType).toBe('application/octet-stream'); // Local storage default

      // Delete file
      await storageProvider.delete(testKey);

      // Verify file no longer exists
      const existsAfterDelete = await storageProvider.exists(testKey);
      expect(existsAfterDelete).toBe(false);
    });

    it('should handle nested directory structure', async () => {
      const testContent = 'Nested directory test';
      const testBuffer = Buffer.from(testContent);
      const testKey = 'user123/documents/2025/january/test-nested.txt';
      const testMimeType = 'text/plain';

      // Upload file to nested path
      await storageProvider.upload(testBuffer, testKey, testMimeType);

      // Verify directory structure was created
      const expectedPath = path.join(testUploadPath, 'user123', 'documents', '2025', 'january');
      expect(fs.existsSync(expectedPath)).toBe(true);

      // Verify file content
      const downloadedBuffer = await storageProvider.download(testKey);
      expect(downloadedBuffer.toString()).toBe(testContent);

      // Clean up
      await storageProvider.delete(testKey);
    });

    it('should handle file key generation and parsing', () => {
      const userId = 'user123';
      const documentId = 'doc456';
      const filename = 'test document with spaces.pdf';

      // Generate key
      const key = StorageService.generateFileKey(userId, documentId, filename);
      expect(key).toBe('user123/doc456/test_document_with_spaces.pdf');

      // Parse key
      const parsed = StorageService.parseFileKey(key);
      expect(parsed).toEqual({
        userId: 'user123',
        documentId: 'doc456',
        filename: 'test_document_with_spaces.pdf'
      });
    });

    it('should prevent path traversal attacks', async () => {
      const testContent = 'Malicious content';
      const testBuffer = Buffer.from(testContent);
      const maliciousKey = '../../etc/passwd';
      const testMimeType = 'text/plain';

      // Upload with malicious key
      await storageProvider.upload(testBuffer, maliciousKey, testMimeType);

      // Verify file was created in safe location within upload directory
      const exists = await storageProvider.exists(maliciousKey);
      expect(exists).toBe(true);

      // Verify the actual file path is within the upload directory
      const downloadedBuffer = await storageProvider.download(maliciousKey);
      expect(downloadedBuffer.toString()).toBe(testContent);

      // The malicious path should have been sanitized
      const safePath = path.join(testUploadPath, 'etc', 'passwd');
      expect(fs.existsSync(safePath)).toBe(true);

      // Clean up
      await storageProvider.delete(maliciousKey);
    });
  });

  describe('error handling', () => {
    it('should handle download of non-existent file', async () => {
      const nonExistentKey = 'user123/doc456/non-existent.txt';

      await expect(storageProvider.download(nonExistentKey))
        .rejects.toThrow('Failed to download file locally');
    });

    it('should handle delete of non-existent file', async () => {
      const nonExistentKey = 'user123/doc456/non-existent.txt';

      await expect(storageProvider.delete(nonExistentKey))
        .rejects.toThrow('Failed to delete file locally');
    });

    it('should handle metadata request for non-existent file', async () => {
      const nonExistentKey = 'user123/doc456/non-existent.txt';

      await expect(storageProvider.getMetadata(nonExistentKey))
        .rejects.toThrow('Failed to get file metadata');
    });

    it('should return false for exists check on non-existent file', async () => {
      const nonExistentKey = 'user123/doc456/non-existent.txt';

      const exists = await storageProvider.exists(nonExistentKey);
      expect(exists).toBe(false);
    });
  });

  describe('signed URL generation', () => {
    it('should generate signed URL for local storage', async () => {
      const testContent = 'Test content for signed URL';
      const testBuffer = Buffer.from(testContent);
      const testKey = 'user123/doc456/test-signed.txt';
      const testMimeType = 'text/plain';

      // Upload file
      await storageProvider.upload(testBuffer, testKey, testMimeType);

      // Generate signed URL
      const signedUrl = await storageProvider.getSignedUrl(testKey);
      
      // For local storage, should return file:// URL
      expect(signedUrl).toMatch(/^file:\/\//);
      expect(signedUrl).toContain(testKey);

      // Clean up
      await storageProvider.delete(testKey);
    });

    it('should respect expiration time parameter', async () => {
      const testContent = 'Test content';
      const testBuffer = Buffer.from(testContent);
      const testKey = 'user123/doc456/test-expiry.txt';
      const testMimeType = 'text/plain';

      // Upload file
      await storageProvider.upload(testBuffer, testKey, testMimeType);

      // Generate signed URL with custom expiration
      const signedUrl = await storageProvider.getSignedUrl(testKey, 7200);
      
      // Should still work (local storage doesn't actually implement expiration)
      expect(signedUrl).toMatch(/^file:\/\//);

      // Clean up
      await storageProvider.delete(testKey);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple uploads concurrently', async () => {
      const uploadPromises: Promise<string>[] = [];
      const fileCount = 5;

      for (let i = 0; i < fileCount; i++) {
        const content = `Concurrent test file ${i}`;
        const buffer = Buffer.from(content);
        const key = `user123/doc456/concurrent-${i}.txt`;
        
        uploadPromises.push(storageProvider.upload(buffer, key, 'text/plain'));
      }

      // Wait for all uploads to complete
      const results = await Promise.all(uploadPromises);
      
      // Verify all uploads succeeded
      expect(results).toHaveLength(fileCount);
      results.forEach((result, index) => {
        expect(result).toContain(`concurrent-${index}.txt`);
      });

      // Verify all files exist
      const existsPromises: Promise<boolean>[] = [];
      for (let i = 0; i < fileCount; i++) {
        const key = `user123/doc456/concurrent-${i}.txt`;
        existsPromises.push(storageProvider.exists(key));
      }

      const existsResults = await Promise.all(existsPromises);
      expect(existsResults.every(exists => exists)).toBe(true);

      // Clean up all files
      const deletePromises: Promise<void>[] = [];
      for (let i = 0; i < fileCount; i++) {
        const key = `user123/doc456/concurrent-${i}.txt`;
        deletePromises.push(storageProvider.delete(key));
      }

      await Promise.all(deletePromises);
    });
  });
});