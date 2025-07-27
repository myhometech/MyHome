import { StorageProvider } from './StorageProvider';
import { GCSStorage } from './GCSStorage';
import { LocalStorage } from './LocalStorage';

/**
 * Storage Service Factory
 * 
 * Provides a centralized way to configure and access storage providers.
 * Handles environment-based configuration and fallback strategies.
 */
export class StorageService {
  private static instance: StorageProvider | null = null;

  /**
   * Initialize storage provider based on environment configuration
   */
  static initialize(): StorageProvider {
    if (StorageService.instance) {
      return StorageService.instance;
    }

    const storageType = process.env.STORAGE_TYPE || 'local';

    switch (storageType.toLowerCase()) {
      case 'gcs':
      case 'google':
        StorageService.instance = StorageService.createGCSStorage();
        break;
      
      case 'local':
      default:
        console.warn('Using local storage - not recommended for production');
        StorageService.instance = StorageService.createLocalStorage();
        break;
    }

    console.log(`Storage provider initialized: ${storageType}`);
    return StorageService.instance;
  }

  /**
   * Get the current storage provider instance
   */
  static getProvider(): StorageProvider {
    if (!StorageService.instance) {
      return StorageService.initialize();
    }
    return StorageService.instance;
  }

  /**
   * Create Google Cloud Storage provider
   */
  private static createGCSStorage(): StorageProvider {
    // Force local storage in production to prevent memory leaks
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️ Forcing local storage in production to prevent memory issues');
      return StorageService.createLocalStorage();
    }
    
    const bucketName = process.env.GCS_BUCKET_NAME || 'media.myhome-tech.com';
    const projectId = process.env.GCS_PROJECT_ID;
    const keyFilename = process.env.GCS_KEY_FILENAME;
    
    // Support for service account credentials from environment
    let credentials;
    if (process.env.GCS_CREDENTIALS) {
      try {
        credentials = JSON.parse(process.env.GCS_CREDENTIALS);
      } catch (error) {
        console.error('Failed to parse GCS_CREDENTIALS:', error);
      }
    }

    return new GCSStorage({
      bucketName,
      projectId,
      keyFilename,
      credentials
    });
  }

  /**
   * Create local storage provider
   */
  private static createLocalStorage(): LocalStorage {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    return new LocalStorage(uploadPath);
  }

  /**
   * Reset storage provider (useful for testing)
   */
  static reset(): void {
    StorageService.instance = null;
  }

  /**
   * Set a custom storage provider (useful for testing)
   */
  static setProvider(provider: StorageProvider): void {
    StorageService.instance = provider;
  }

  /**
   * Generate file key using consistent naming convention
   */
  static generateFileKey(userId: string, documentId: string, filename: string): string {
    return GCSStorage.generateFileKey(userId, documentId, filename);
  }

  /**
   * Parse file key to extract components
   */
  static parseFileKey(key: string): { userId: string; documentId: string; filename: string } | null {
    return GCSStorage.parseFileKey(key);
  }
}

// Export singleton accessor
export const storageProvider = () => StorageService.getProvider();