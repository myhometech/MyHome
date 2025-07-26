/**
 * Storage Provider Interface
 * 
 * Unified interface for file storage operations that abstracts
 * the underlying storage implementation (local filesystem, GCS, S3, etc.)
 */

export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param file - File buffer to upload
   * @param key - Unique key/path for the file (e.g., "userId/documentId/filename.ext")
   * @param mimeType - MIME type of the file
   * @returns Promise resolving to the storage URL or key
   */
  upload(file: Buffer, key: string, mimeType: string): Promise<string>;

  /**
   * Download a file from storage
   * @param key - File key/path to download
   * @returns Promise resolving to file buffer
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   * @param key - File key/path to delete
   * @returns Promise resolving when deletion is complete
   */
  delete(key: string): Promise<void>;

  /**
   * Generate a signed URL for direct file access
   * @param key - File key/path
   * @param expirationTime - URL expiration time in seconds (default: 3600)
   * @returns Promise resolving to signed URL
   */
  getSignedUrl(key: string, expirationTime?: number): Promise<string>;

  /**
   * Check if a file exists in storage
   * @param key - File key/path to check
   * @returns Promise resolving to boolean indicating existence
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get file metadata
   * @param key - File key/path
   * @returns Promise resolving to file metadata
   */
  getMetadata(key: string): Promise<FileMetadata>;
}

export interface FileMetadata {
  size: number;
  mimeType: string;
  lastModified: Date;
  etag?: string;
}

export interface StorageConfig {
  bucketName: string;
  projectId?: string;
  keyFilename?: string;
  credentials?: object;
}