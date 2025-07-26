import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../StorageService';
import { GCSStorage } from '../GCSStorage';
import { LocalStorage } from '../LocalStorage';

// Mock the storage implementations
vi.mock('../GCSStorage');
vi.mock('../LocalStorage');

describe('StorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    StorageService.reset();
    delete process.env.STORAGE_TYPE;
    delete process.env.GCS_BUCKET_NAME;
    delete process.env.GCS_PROJECT_ID;
    delete process.env.UPLOAD_PATH;
  });

  afterEach(() => {
    StorageService.reset();
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize GCS storage when STORAGE_TYPE is gcs', () => {
      process.env.STORAGE_TYPE = 'gcs';
      process.env.GCS_BUCKET_NAME = 'test-bucket';
      process.env.GCS_PROJECT_ID = 'test-project';

      const provider = StorageService.initialize();

      expect(GCSStorage).toHaveBeenCalledWith({
        bucketName: 'test-bucket',
        projectId: 'test-project',
        keyFilename: undefined,
        credentials: undefined
      });
      expect(provider).toBeInstanceOf(GCSStorage);
    });

    it('should initialize GCS storage when STORAGE_TYPE is google', () => {
      process.env.STORAGE_TYPE = 'google';
      process.env.GCS_BUCKET_NAME = 'test-bucket';

      const provider = StorageService.initialize();

      expect(GCSStorage).toHaveBeenCalledWith({
        bucketName: 'test-bucket',
        projectId: undefined,
        keyFilename: undefined,
        credentials: undefined
      });
    });

    it('should use default bucket name if not specified', () => {
      process.env.STORAGE_TYPE = 'gcs';

      StorageService.initialize();

      expect(GCSStorage).toHaveBeenCalledWith({
        bucketName: 'media.myhome-tech.com',
        projectId: undefined,
        keyFilename: undefined,
        credentials: undefined
      });
    });

    it('should parse GCS credentials from environment', () => {
      process.env.STORAGE_TYPE = 'gcs';
      process.env.GCS_CREDENTIALS = '{"type":"service_account","project_id":"test"}';

      StorageService.initialize();

      expect(GCSStorage).toHaveBeenCalledWith({
        bucketName: 'media.myhome-tech.com',
        projectId: undefined,
        keyFilename: undefined,
        credentials: { type: 'service_account', project_id: 'test' }
      });
    });

    it('should handle invalid GCS credentials gracefully', () => {
      process.env.STORAGE_TYPE = 'gcs';
      process.env.GCS_CREDENTIALS = 'invalid-json';

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      StorageService.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse GCS_CREDENTIALS:', expect.any(Error));
      expect(GCSStorage).toHaveBeenCalledWith({
        bucketName: 'media.myhome-tech.com',
        projectId: undefined,
        keyFilename: undefined,
        credentials: undefined
      });

      consoleSpy.mockRestore();
    });

    it('should initialize local storage when STORAGE_TYPE is local', () => {
      process.env.STORAGE_TYPE = 'local';
      process.env.UPLOAD_PATH = '/custom/uploads';

      const provider = StorageService.initialize();

      expect(LocalStorage).toHaveBeenCalledWith('/custom/uploads');
      expect(provider).toBeInstanceOf(LocalStorage);
    });

    it('should default to local storage when STORAGE_TYPE is not set', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const provider = StorageService.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('Using local storage - not recommended for production');
      expect(LocalStorage).toHaveBeenCalledWith('./uploads');
      expect(provider).toBeInstanceOf(LocalStorage);

      consoleSpy.mockRestore();
    });

    it('should use default upload path for local storage', () => {
      process.env.STORAGE_TYPE = 'local';

      StorageService.initialize();

      expect(LocalStorage).toHaveBeenCalledWith('./uploads');
    });

    it('should return singleton instance on subsequent calls', () => {
      process.env.STORAGE_TYPE = 'local';

      const provider1 = StorageService.initialize();
      const provider2 = StorageService.initialize();

      expect(provider1).toBe(provider2);
      expect(LocalStorage).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProvider', () => {
    it('should return initialized provider', () => {
      process.env.STORAGE_TYPE = 'local';

      const provider1 = StorageService.initialize();
      const provider2 = StorageService.getProvider();

      expect(provider1).toBe(provider2);
    });

    it('should initialize provider if not already done', () => {
      process.env.STORAGE_TYPE = 'local';

      const provider = StorageService.getProvider();

      expect(provider).toBeInstanceOf(LocalStorage);
    });
  });

  describe('setProvider', () => {
    it('should set custom provider', () => {
      const mockProvider = new LocalStorage('./test');
      
      StorageService.setProvider(mockProvider);
      const provider = StorageService.getProvider();

      expect(provider).toBe(mockProvider);
    });
  });

  describe('reset', () => {
    it('should reset singleton instance', () => {
      process.env.STORAGE_TYPE = 'local';

      StorageService.initialize();
      StorageService.reset();

      // Next call should create new instance
      StorageService.getProvider();

      expect(LocalStorage).toHaveBeenCalledTimes(2);
    });
  });

  describe('utility methods', () => {
    it('should generate file key using GCSStorage method', () => {
      const mockGenerateFileKey = vi.spyOn(GCSStorage, 'generateFileKey').mockReturnValue('test-key');

      const result = StorageService.generateFileKey('user123', 'doc456', 'test.pdf');

      expect(mockGenerateFileKey).toHaveBeenCalledWith('user123', 'doc456', 'test.pdf');
      expect(result).toBe('test-key');
    });

    it('should parse file key using GCSStorage method', () => {
      const mockParseFileKey = vi.spyOn(GCSStorage, 'parseFileKey').mockReturnValue({
        userId: 'user123',
        documentId: 'doc456',
        filename: 'test.pdf'
      });

      const result = StorageService.parseFileKey('test-key');

      expect(mockParseFileKey).toHaveBeenCalledWith('test-key');
      expect(result).toEqual({
        userId: 'user123',
        documentId: 'doc456',
        filename: 'test.pdf'
      });
    });
  });
});