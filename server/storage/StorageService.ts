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
  private static fallbackMode: boolean = false;

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
        try {
          StorageService.instance = StorageService.createGCSStorage();
          console.log('✅ GCS Storage initialized successfully');
        } catch (error) {
          console.error('🚨 GCS Storage initialization failed:', error);
          console.warn('⚠️ Falling back to local storage due to GCS failure');
          StorageService.fallbackMode = true;
          StorageService.instance = StorageService.createLocalStorage();
        }
        break;
      
      case 'local':
      default:
        console.warn('Using local storage - not recommended for production');
        StorageService.instance = StorageService.createLocalStorage();
        break;
    }

    console.log(`Storage provider initialized: ${StorageService.fallbackMode ? 'local (fallback)' : storageType}`);
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
   * Check if running in fallback mode
   */
  static isFallbackMode(): boolean {
    return StorageService.fallbackMode;
  }

  /**
   * Force reset to reinitialize storage (for emergency situations)
   */
  static reset(): void {
    StorageService.instance = null;
    StorageService.fallbackMode = false;
  }

  /**
   * Create Google Cloud Storage provider
   * PRODUCTION WHITE SCREEN FIX: Force local storage to prevent memory leak
   */
  private static createGCSStorage(): StorageProvider {
    // GCS memory leak has been fixed with explicit authentication
    // Re-enable GCS in production
    
    // GCS now properly configured with explicit authentication
    
    const bucketName = process.env.GCS_BUCKET_NAME || 'myhometech-storage';
    let projectId = process.env.GCS_PROJECT_ID;
    let keyFilename = process.env.GCS_KEY_FILENAME;
    
    // Support for service account credentials from environment
    // Priority: NEW_GOOGLE_APPLICATION_CREDENTIALS > GOOGLE_APPLICATION_CREDENTIALS > GCS_CREDENTIALS
    let credentials;
    if (process.env.NEW_GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        // Parse the new JSON credentials from the environment variable
        const credentialsStr = process.env.NEW_GOOGLE_APPLICATION_CREDENTIALS.trim();
        
        // Check if it's an XML error (invalid credentials)
        if (credentialsStr.startsWith('<?xml') || credentialsStr.includes('<Error>')) {
          console.error('❌ NEW_GOOGLE_APPLICATION_CREDENTIALS contains an error response, falling back to old credentials');
          throw new Error('Invalid credentials format');
        }
        
        credentials = JSON.parse(credentialsStr);
        // Extract project ID from credentials if not provided
        if (!projectId && credentials.project_id) {
          projectId = credentials.project_id;
        }
        console.log('✅ Using NEW_GOOGLE_APPLICATION_CREDENTIALS with project:', projectId);
      } catch (error) {
        console.error('Failed to parse NEW_GOOGLE_APPLICATION_CREDENTIALS:', error);
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        // Parse the JSON credentials from the environment variable
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        // Extract project ID from credentials if not provided
        if (!projectId && credentials.project_id) {
          projectId = credentials.project_id;
        }
        console.log('✅ Parsed GCS credentials from GOOGLE_APPLICATION_CREDENTIALS');
      } catch (error) {
        console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS:', error);
        // Fallback: check if it's a file path
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS.endsWith('.json')) {
          keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }
      }
    } else if (process.env.GCS_CREDENTIALS) {
      try {
        credentials = JSON.parse(process.env.GCS_CREDENTIALS);
        // Extract project ID from credentials if not provided
        if (!projectId && credentials.project_id) {
          projectId = credentials.project_id;
        }
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