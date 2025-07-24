import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Transform } from 'stream';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // For GCM, 12 bytes is standard
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const ITERATIONS = 100000;

export class EncryptionService {
  private static masterKey: Buffer | null = null;

  /**
   * Initialize or retrieve the master encryption key from environment
   */
  private static getMasterKey(): Buffer {
    if (this.masterKey) {
      return this.masterKey;
    }

    const masterKeyHex = process.env.DOCUMENT_MASTER_KEY;
    if (!masterKeyHex) {
      throw new Error('DOCUMENT_MASTER_KEY environment variable is required for document encryption');
    }

    // Validate key length (should be 64 hex characters for 256-bit key)
    if (masterKeyHex.length !== 64) {
      throw new Error('DOCUMENT_MASTER_KEY must be exactly 64 hex characters (256 bits)');
    }

    this.masterKey = Buffer.from(masterKeyHex, 'hex');
    return this.masterKey;
  }

  /**
   * Generate a new random 256-bit encryption key for a document
   */
  static generateDocumentKey(): Buffer {
    return crypto.randomBytes(32); // 256 bits
  }

  /**
   * Encrypt a document key using the master key
   */
  static encryptDocumentKey(documentKey: Buffer): string {
    const masterKey = this.getMasterKey();
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from master key and salt
    const derivedKey = crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, 32, 'sha512');
    
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(documentKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    
    // Combine salt + iv + tag + encrypted data
    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a document key using the master key
   */
  static decryptDocumentKey(encryptedDocumentKey: string): Buffer {
    const masterKey = this.getMasterKey();
    const combined = Buffer.from(encryptedDocumentKey, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from master key and salt
    const derivedKey = crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, 32, 'sha512');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted;
  }

  /**
   * Encrypt a file using AES-256-GCM
   */
  static async encryptFile(filePath: string, documentKey: Buffer): Promise<{ encryptedPath: string; metadata: string }> {
    return new Promise((resolve, reject) => {
      try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, documentKey, iv);
        
        const input = fs.createReadStream(filePath);
        const encryptedPath = filePath + '.encrypted';
        const output = fs.createWriteStream(encryptedPath);
        
        const chunks: Buffer[] = [];
        
        input.on('data', (chunk) => {
          const encrypted = cipher.update(chunk);
          chunks.push(encrypted);
          output.write(encrypted);
        });
        
        input.on('end', () => {
          try {
            const final = cipher.final();
            const tag = cipher.getAuthTag();
            
            if (final.length > 0) {
              chunks.push(final);
              output.write(final);
            }
            
            output.end(() => {
              // Create metadata containing IV and auth tag
              const metadata = Buffer.concat([iv, tag]).toString('base64');
              
              // Remove original unencrypted file
              fs.unlinkSync(filePath);
              
              resolve({
                encryptedPath,
                metadata
              });
            });
          } catch (error) {
            reject(error);
          }
        });
        
        input.on('error', reject);
        output.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Decrypt a file using AES-256-GCM
   */
  static decryptFile(encryptedPath: string, documentKey: Buffer, metadata: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const metadataBuffer = Buffer.from(metadata, 'base64');
        const iv = metadataBuffer.subarray(0, IV_LENGTH);
        const tag = metadataBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        
        const decipher = crypto.createDecipheriv(ALGORITHM, documentKey, iv);
        decipher.setAuthTag(tag);
        
        const encryptedData = fs.readFileSync(encryptedPath);
        const decrypted = Buffer.concat([
          decipher.update(encryptedData),
          decipher.final()
        ]);
        
        resolve(decrypted);
      } catch (error) {
        reject(new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  /**
   * Stream decrypt a file for download (memory efficient)
   */
  static createDecryptStream(encryptedPath: string, documentKey: Buffer, metadata: string): NodeJS.ReadableStream {
    const metadataBuffer = Buffer.from(metadata, 'base64');
    const iv = metadataBuffer.subarray(0, IV_LENGTH);
    const tag = metadataBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, documentKey, iv);
    decipher.setAuthTag(tag);
    
    const fileStream = fs.createReadStream(encryptedPath);
    
    return fileStream.pipe(decipher);
  }

  /**
   * Encrypt file buffer directly (for in-memory processing)
   */
  static encryptBuffer(buffer: Buffer, documentKey: Buffer): { encryptedBuffer: Buffer; metadata: string } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, documentKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    const metadata = Buffer.concat([iv, tag]).toString('base64');
    
    return {
      encryptedBuffer: encrypted,
      metadata
    };
  }

  /**
   * Decrypt buffer directly (for in-memory processing)
   */
  static decryptBuffer(encryptedBuffer: Buffer, documentKey: Buffer, metadata: string): Buffer {
    const metadataBuffer = Buffer.from(metadata, 'base64');
    const iv = metadataBuffer.subarray(0, IV_LENGTH);
    const tag = metadataBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, documentKey, iv);
    decipher.setAuthTag(tag);
    
    return Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
  }

  /**
   * Generate a new master key (for initial setup or rotation)
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate that encryption/decryption is working correctly
   */
  static async testEncryption(): Promise<boolean> {
    try {
      // Test document key encryption/decryption
      const testDocKey = this.generateDocumentKey();
      const encryptedDocKey = this.encryptDocumentKey(testDocKey);
      const decryptedDocKey = this.decryptDocumentKey(encryptedDocKey);
      
      if (!testDocKey.equals(decryptedDocKey)) {
        return false;
      }

      // Test file encryption/decryption with a small test file
      const testFilePath = path.join(process.cwd(), 'test-encryption.tmp');
      const testData = 'This is a test file for encryption validation.';
      fs.writeFileSync(testFilePath, testData);
      
      const { encryptedPath, metadata } = await this.encryptFile(testFilePath, testDocKey);
      const decryptedData = await this.decryptFile(encryptedPath, testDocKey, metadata);
      
      // Cleanup
      fs.unlinkSync(encryptedPath);
      
      return decryptedData.toString() === testData;
    } catch (error) {
      console.error('Encryption test failed:', error);
      return false;
    }
  }

  /**
   * Re-encrypt all document keys with a new master key (for key rotation)
   */
  static async rotateDocumentKeys(
    oldMasterKeyHex: string,
    newMasterKeyHex: string,
    getEncryptedKeysCallback: () => Promise<Array<{ id: string; encryptedKey: string }>>
  ): Promise<Array<{ id: string; newEncryptedKey: string }>> {
    // Temporarily set old master key
    const oldMasterKey = Buffer.from(oldMasterKeyHex, 'hex');
    this.masterKey = oldMasterKey;
    
    // Get all encrypted document keys
    const encryptedKeys = await getEncryptedKeysCallback();
    const reencryptedKeys: Array<{ id: string; newEncryptedKey: string }> = [];
    
    for (const item of encryptedKeys) {
      try {
        // Decrypt with old key
        const documentKey = this.decryptDocumentKey(item.encryptedKey);
        
        // Set new master key and re-encrypt
        this.masterKey = Buffer.from(newMasterKeyHex, 'hex');
        const newEncryptedKey = this.encryptDocumentKey(documentKey);
        
        reencryptedKeys.push({
          id: item.id,
          newEncryptedKey
        });
        
        // Reset to old key for next iteration
        this.masterKey = oldMasterKey;
      } catch (error) {
        console.error(`Failed to rotate key for document ${item.id}:`, error);
        throw error;
      }
    }
    
    // Set new master key permanently
    this.masterKey = Buffer.from(newMasterKeyHex, 'hex');
    
    return reencryptedKeys;
  }
}