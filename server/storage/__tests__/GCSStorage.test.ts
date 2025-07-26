import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GCSStorage } from '../GCSStorage';
import { StorageConfig } from '../StorageProvider';

// Mock Google Cloud Storage
const mockFile = {
  save: vi.fn(),
  download: vi.fn(),
  delete: vi.fn(),
  getSignedUrl: vi.fn(),
  exists: vi.fn(),
  getMetadata: vi.fn()
};

const mockBucket = {
  file: vi.fn(() => mockFile),
  getMetadata: vi.fn()
};

const mockStorage = {
  bucket: vi.fn(() => mockBucket)
};

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(() => mockStorage)
}));

describe('GCSStorage', () => {
  let gcsStorage: GCSStorage;
  const testConfig: StorageConfig = {
    bucketName: 'test-bucket',
    projectId: 'test-project',
    credentials: { test: 'credentials' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    gcsStorage = new GCSStorage(testConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('upload', () => {
    it('should upload file to GCS successfully', async () => {
      const testBuffer = Buffer.from('test file content');
      const testKey = 'user123/doc456/test.pdf';
      const testMimeType = 'application/pdf';

      mockFile.save.mockResolvedValue(undefined);

      const result = await gcsStorage.upload(testBuffer, testKey, testMimeType);

      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(mockBucket.file).toHaveBeenCalledWith(testKey);
      expect(mockFile.save).toHaveBeenCalledWith(testBuffer, {
        metadata: {
          contentType: testMimeType,
          cacheControl: 'private, max-age=3600'
        },
        public: false,
        validation: 'md5'
      });
      expect(result).toBe(testKey);
    });

    it('should handle upload errors', async () => {
      const testBuffer = Buffer.from('test file content');
      const testKey = 'user123/doc456/test.pdf';
      const testMimeType = 'application/pdf';

      mockFile.save.mockRejectedValue(new Error('Upload failed'));

      await expect(gcsStorage.upload(testBuffer, testKey, testMimeType))
        .rejects.toThrow('Failed to upload file to GCS: Upload failed');
    });
  });

  describe('download', () => {
    it('should download file from GCS successfully', async () => {
      const testKey = 'user123/doc456/test.pdf';
      const testBuffer = Buffer.from('test file content');

      mockFile.download.mockResolvedValue([testBuffer]);

      const result = await gcsStorage.download(testKey);

      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(mockBucket.file).toHaveBeenCalledWith(testKey);
      expect(mockFile.download).toHaveBeenCalled();
      expect(result).toBe(testBuffer);
    });

    it('should handle download errors', async () => {
      const testKey = 'user123/doc456/test.pdf';

      mockFile.download.mockRejectedValue(new Error('Download failed'));

      await expect(gcsStorage.download(testKey))
        .rejects.toThrow('Failed to download file from GCS: Download failed');
    });
  });

  describe('delete', () => {
    it('should delete file from GCS successfully', async () => {
      const testKey = 'user123/doc456/test.pdf';

      mockFile.delete.mockResolvedValue(undefined);

      await gcsStorage.delete(testKey);

      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(mockBucket.file).toHaveBeenCalledWith(testKey);
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('should handle delete errors', async () => {
      const testKey = 'user123/doc456/test.pdf';

      mockFile.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(gcsStorage.delete(testKey))
        .rejects.toThrow('Failed to delete file from GCS: Delete failed');
    });
  });

  describe('getSignedUrl', () => {
    it('should generate signed URL successfully', async () => {
      const testKey = 'user123/doc456/test.pdf';
      const testSignedUrl = 'https://storage.googleapis.com/signed-url';

      mockFile.getSignedUrl.mockResolvedValue([testSignedUrl]);

      const result = await gcsStorage.getSignedUrl(testKey, 3600);

      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(mockBucket.file).toHaveBeenCalledWith(testKey);
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        action: 'read',
        expires: expect.any(Number),
        version: 'v4'
      });
      expect(result).toBe(testSignedUrl);
    });

    it('should use default expiration time', async () => {
      const testKey = 'user123/doc456/test.pdf';
      const testSignedUrl = 'https://storage.googleapis.com/signed-url';

      mockFile.getSignedUrl.mockResolvedValue([testSignedUrl]);

      await gcsStorage.getSignedUrl(testKey);

      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        action: 'read',
        expires: expect.any(Number),
        version: 'v4'
      });
    });
  });

  describe('exists', () => {
    it('should return true if file exists', async () => {
      const testKey = 'user123/doc456/test.pdf';

      mockFile.exists.mockResolvedValue([true]);

      const result = await gcsStorage.exists(testKey);

      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      const testKey = 'user123/doc456/test.pdf';

      mockFile.exists.mockResolvedValue([false]);

      const result = await gcsStorage.exists(testKey);

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const testKey = 'user123/doc456/test.pdf';

      mockFile.exists.mockRejectedValue(new Error('Check failed'));

      const result = await gcsStorage.exists(testKey);

      expect(result).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata successfully', async () => {
      const testKey = 'user123/doc456/test.pdf';
      const mockMetadata = {
        size: '1024',
        contentType: 'application/pdf',
        updated: '2025-01-26T12:00:00.000Z',
        etag: 'test-etag'
      };

      mockFile.getMetadata.mockResolvedValue([mockMetadata]);

      const result = await gcsStorage.getMetadata(testKey);

      expect(result).toEqual({
        size: 1024,
        mimeType: 'application/pdf',
        lastModified: new Date('2025-01-26T12:00:00.000Z'),
        etag: 'test-etag'
      });
    });

    it('should handle metadata with missing fields', async () => {
      const testKey = 'user123/doc456/test.pdf';
      const mockMetadata = {
        size: undefined,
        contentType: undefined,
        updated: undefined,
        timeCreated: undefined
      };

      mockFile.getMetadata.mockResolvedValue([mockMetadata]);

      const result = await gcsStorage.getMetadata(testKey);

      expect(result).toEqual({
        size: 0,
        mimeType: 'application/octet-stream',
        lastModified: expect.any(Date),
        etag: undefined
      });
    });
  });

  describe('static utility methods', () => {
    it('should generate file key correctly', () => {
      const userId = 'user123';
      const documentId = 'doc456';
      const filename = 'test document.pdf';

      const key = GCSStorage.generateFileKey(userId, documentId, filename);

      expect(key).toBe('user123/doc456/test_document.pdf');
    });

    it('should sanitize filename in file key', () => {
      const userId = 'user123';
      const documentId = 'doc456';
      const filename = 'test/document\\with:special*chars?.pdf';

      const key = GCSStorage.generateFileKey(userId, documentId, filename);

      expect(key).toBe('user123/doc456/test_document_with_special_chars_.pdf');
    });

    it('should parse file key correctly', () => {
      const key = 'user123/doc456/test.pdf';

      const parsed = GCSStorage.parseFileKey(key);

      expect(parsed).toEqual({
        userId: 'user123',
        documentId: 'doc456',
        filename: 'test.pdf'
      });
    });

    it('should return null for invalid file key', () => {
      const key = 'invalid/key';

      const parsed = GCSStorage.parseFileKey(key);

      expect(parsed).toBeNull();
    });
  });

  describe('getBucketInfo', () => {
    it('should return bucket information', async () => {
      const mockBucketMetadata = {
        name: 'test-bucket',
        location: 'US',
        storageClass: 'STANDARD'
      };

      mockBucket.getMetadata.mockResolvedValue([mockBucketMetadata]);

      const result = await gcsStorage.getBucketInfo();

      expect(result).toEqual({
        name: 'test-bucket',
        location: 'US',
        storageClass: 'STANDARD'
      });
    });

    it('should handle bucket info with missing fields', async () => {
      const mockBucketMetadata = {
        name: undefined,
        location: undefined,
        storageClass: undefined
      };

      mockBucket.getMetadata.mockResolvedValue([mockBucketMetadata]);

      const result = await gcsStorage.getBucketInfo();

      expect(result).toEqual({
        name: 'test-bucket',
        location: 'unknown',
        storageClass: 'STANDARD'
      });
    });
  });
});