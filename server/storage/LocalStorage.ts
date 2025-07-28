import { promises as fs } from 'fs';
import path from 'path';
import { StorageProvider, FileMetadata } from './StorageProvider';

/**
 * Local filesystem implementation of StorageProvider
 * 
 * Used for development and as a fallback option.
 * DEPRECATED: Will be removed after GCS migration is complete.
 */
export class LocalStorage implements StorageProvider {
  private basePath: string;

  constructor(basePath: string = './uploads') {
    this.basePath = path.resolve(basePath);
    this.ensureDirectoryExists();
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create uploads directory:', error);
    }
  }

  private getFilePath(key: string): string {
    // Ensure the key doesn't contain path traversal attempts
    const sanitizedKey = key.replace(/\.\./g, '').replace(/^\//, '');
    return path.join(this.basePath, sanitizedKey);
  }

  async upload(file: Buffer, key: string, mimeType: string): Promise<string> {
    try {
      const filePath = this.getFilePath(key);
      const directory = path.dirname(filePath);
      
      // Ensure directory exists
      await fs.mkdir(directory, { recursive: true });
      
      // Write file
      await fs.writeFile(filePath, file);
      
      console.log(`File uploaded locally: ${filePath}`);
      return filePath;
    } catch (error: any) {
      console.error('Local storage upload error:', error);
      throw new Error(`Failed to upload file locally: ${error?.message || 'Unknown error'}`);
    }
  }

  async uploadStream(fileStream: NodeJS.ReadableStream, key: string, mimeType: string): Promise<string> {
    try {
      const filePath = this.getFilePath(key);
      const directory = path.dirname(filePath);
      
      // Ensure directory exists
      await fs.mkdir(directory, { recursive: true });
      
      // Create write stream
      const writeStream = require('fs').createWriteStream(filePath);
      
      return new Promise((resolve, reject) => {
        writeStream.on('error', reject);
        writeStream.on('finish', () => {
          console.log(`File streamed locally: ${filePath}`);
          resolve(filePath);
        });
        
        fileStream.pipe(writeStream);
      });
    } catch (error: any) {
      console.error('Local storage stream error:', error);
      throw new Error(`Failed to stream file locally: ${error?.message || 'Unknown error'}`);
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const filePath = this.getFilePath(key);
      return await fs.readFile(filePath);
    } catch (error: any) {
      console.error('Local storage download error:', error);
      throw new Error(`Failed to download file locally: ${error?.message || 'Unknown error'}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
      console.log(`File deleted locally: ${filePath}`);
    } catch (error: any) {
      console.error('Local storage delete error:', error);
      throw new Error(`Failed to delete file locally: ${error?.message || 'Unknown error'}`);
    }
  }

  async getSignedUrl(key: string, expirationTime?: number): Promise<string> {
    // For local storage, return a simple file URL
    // In production, this would need proper authentication
    return `file://${this.getFilePath(key)}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    try {
      const filePath = this.getFilePath(key);
      const stats = await fs.stat(filePath);
      
      return {
        size: stats.size,
        mimeType: 'application/octet-stream', // Would need mime detection
        lastModified: stats.mtime
      };
    } catch (error: any) {
      throw new Error(`Failed to get file metadata: ${error?.message || 'Unknown error'}`);
    }
  }
}