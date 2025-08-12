import { Storage } from '@google-cloud/storage';
import { StorageProvider, FileMetadata, StorageConfig } from './StorageProvider';

/**
 * Google Cloud Storage implementation of StorageProvider
 * 
 * Handles file operations using Google Cloud Storage with
 * private access and signed URL generation.
 */
export class GCSStorage implements StorageProvider {
  private storage: Storage;
  private bucketName: string;

  constructor(config: StorageConfig) {
    this.bucketName = config.bucketName;
    
    // Initialize Google Cloud Storage with explicit authentication
    const storageOptions: any = {
      projectId: config.projectId,
    };

    // CRITICAL: Prevent fallback to instance metadata authentication
    if (config.credentials) {
      storageOptions.credentials = config.credentials;
    } else if (config.keyFilename) {
      storageOptions.keyFilename = config.keyFilename;
    } else {
      throw new Error('GCS authentication requires either credentials or keyFilename');
    }

    // Disable automatic authentication discovery to prevent metadata server calls
    storageOptions.autoRetry = false;
    storageOptions.maxRetries = 0;
    
    this.storage = new Storage(storageOptions);
    console.log('GCS Storage initialized with explicit credentials');
    
    // Initialize bucket on startup to ensure it exists
    this.initializeBucket().catch(error => {
      console.warn('Bucket initialization failed (non-critical):', error?.message);
    });
  }

  /**
   * Initialize bucket - create if it doesn't exist
   */
  private async initializeBucket(): Promise<void> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [exists] = await bucket.exists();
      
      if (!exists) {
        console.log(`Creating storage bucket: ${this.bucketName}`);
        await bucket.create({
          location: 'US',
          storageClass: 'STANDARD',
        });
        console.log(`✅ Created storage bucket: ${this.bucketName}`);
      } else {
        console.log(`✅ Storage bucket already exists: ${this.bucketName}`);
      }
    } catch (error: any) {
      console.error(`Failed to initialize bucket ${this.bucketName}:`, error?.message);
      throw error;
    }
  }

  /**
   * Upload file to Google Cloud Storage (Buffer-based - legacy)
   */
  async upload(file: Buffer, key: string, mimeType: string): Promise<string> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(key);

      // Upload with metadata
      await gcsFile.save(file, {
        metadata: {
          contentType: mimeType,
          cacheControl: 'private, max-age=3600',
        },
        public: false, // Ensure private access
        validation: 'md5'
      });

      console.log(`File uploaded to GCS: ${key}`);
      return key; // Return the key as the storage identifier
    } catch (error: any) {
      console.error('GCS upload error:', error);
      throw new Error(`Failed to upload file to GCS: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Enhanced upload with custom metadata for Mailgun email PDFs
   */
  async uploadWithMetadata(file: Buffer, key: string, mimeType: string, options: {
    contentDisposition?: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
  } = {}): Promise<string> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(key);

      // Upload with enhanced metadata
      await gcsFile.save(file, {
        metadata: {
          contentType: mimeType,
          contentDisposition: options.contentDisposition || 'attachment',
          cacheControl: options.cacheControl || 'private, max-age=3600',
          metadata: options.metadata || {}
        },
        public: false, // Ensure private access
        validation: 'md5'
      });

      console.log(`File uploaded to GCS with metadata: ${key}`);
      return key; // Return the key as the storage identifier
    } catch (error: any) {
      console.error('GCS upload with metadata error:', error);
      throw new Error(`Failed to upload file to GCS: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * MEMORY OPTIMIZED: Upload file stream to Google Cloud Storage
   */
  async uploadStream(fileStream: NodeJS.ReadableStream, key: string, mimeType: string): Promise<string> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(key);

      // Create upload stream with metadata
      const uploadStream = gcsFile.createWriteStream({
        metadata: {
          contentType: mimeType,
          cacheControl: 'private, max-age=3600',
        },
        public: false,
        validation: 'md5',
        resumable: false // Use simple upload for better memory efficiency
      });

      return new Promise((resolve, reject) => {
        uploadStream.on('error', (error) => {
          console.error('GCS stream upload error:', error);
          reject(new Error(`Failed to stream file to GCS: ${error?.message || 'Unknown error'}`));
        });

        uploadStream.on('finish', () => {
          console.log(`File streamed to GCS: ${key}`);
          resolve(key);
        });

        // Pipe the file stream to GCS
        fileStream.pipe(uploadStream);
      });
    } catch (error: any) {
      console.error('GCS stream setup error:', error);
      throw new Error(`Failed to setup GCS stream: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Download file from Google Cloud Storage
   */
  async download(key: string): Promise<Buffer> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(key);

      const [fileBuffer] = await gcsFile.download();
      return fileBuffer;
    } catch (error: any) {
      console.error('GCS download error:', error);
      throw new Error(`Failed to download file from GCS: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Delete file from Google Cloud Storage
   */
  async delete(key: string): Promise<void> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(key);

      await gcsFile.delete();
      console.log(`File deleted from GCS: ${key}`);
    } catch (error: any) {
      console.error('GCS delete error:', error);
      throw new Error(`Failed to delete file from GCS: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Generate signed URL for file access
   */
  async getSignedUrl(key: string, expirationTime: number = 3600): Promise<string> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(key);

      const [signedUrl] = await gcsFile.getSignedUrl({
        action: 'read',
        expires: Date.now() + (expirationTime * 1000), // Convert to milliseconds
        version: 'v4'
      });

      return signedUrl;
    } catch (error: any) {
      console.error('GCS signed URL error:', error);
      throw new Error(`Failed to generate signed URL: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Check if file exists in Google Cloud Storage
   */
  async exists(key: string): Promise<boolean> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(key);

      const [exists] = await gcsFile.exists();
      return exists;
    } catch (error: any) {
      console.error('GCS exists check error:', error);
      return false;
    }
  }

  /**
   * Get file metadata from Google Cloud Storage
   */
  async getMetadata(key: string): Promise<FileMetadata> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(key);

      const [metadata] = await gcsFile.getMetadata();

      return {
        size: parseInt(metadata.size?.toString() || '0'),
        mimeType: metadata.contentType || 'application/octet-stream',
        lastModified: new Date(metadata.updated || metadata.timeCreated || Date.now()),
        etag: metadata.etag
      };
    } catch (error: any) {
      console.error('GCS metadata error:', error);
      throw new Error(`Failed to get file metadata: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Get bucket information for debugging
   */
  async getBucketInfo(): Promise<{ name: string; location: string; storageClass: string }> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [metadata] = await bucket.getMetadata();

      return {
        name: metadata.name || this.bucketName,
        location: metadata.location || 'unknown',
        storageClass: metadata.storageClass || 'STANDARD'
      };
    } catch (error: any) {
      console.error('GCS bucket info error:', error);
      throw new Error(`Failed to get bucket info: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Generate file key for consistent naming
   */
  static generateFileKey(userId: string, documentId: string, filename: string): string {
    // Sanitize filename to remove any path traversal attempts
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${userId}/${documentId}/${sanitizedFilename}`;
  }

  /**
   * Extract components from file key
   */
  static parseFileKey(key: string): { userId: string; documentId: string; filename: string } | null {
    const parts = key.split('/');
    if (parts.length !== 3) {
      return null;
    }

    return {
      userId: parts[0],
      documentId: parts[1],
      filename: parts[2]
    };
  }
}