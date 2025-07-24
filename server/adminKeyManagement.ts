#!/usr/bin/env tsx

/**
 * Admin Key Management Script
 * 
 * This script provides administrative functions for document encryption key management:
 * - Generate new master keys
 * - Test encryption functionality
 * - Rotate master keys (re-encrypt all document keys)
 * - Validate system encryption status
 * 
 * Usage:
 *   npm run admin:generate-key     - Generate a new master key
 *   npm run admin:test-encryption  - Test encryption functionality
 *   npm run admin:rotate-keys      - Rotate master keys (requires old and new keys)
 *   npm run admin:validate         - Validate encryption status
 */

import { EncryptionService } from './encryptionService';
import { storage } from './storage';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const COMMANDS = {
  GENERATE_KEY: 'generate-key',
  TEST_ENCRYPTION: 'test-encryption',
  ROTATE_KEYS: 'rotate-keys',
  VALIDATE: 'validate',
  HELP: 'help'
};

class AdminKeyManager {
  /**
   * Generate a new 256-bit master key for document encryption
   */
  static generateMasterKey(): void {
    const newKey = EncryptionService.generateMasterKey();
    
    console.log('🔑 New Master Key Generated');
    console.log('================================');
    console.log(`DOCUMENT_MASTER_KEY=${newKey}`);
    console.log('================================');
    console.log('');
    console.log('⚠️  IMPORTANT SECURITY INSTRUCTIONS:');
    console.log('1. Save this key securely - it cannot be recovered if lost');
    console.log('2. Add this to your environment variables (.env file)');
    console.log('3. Never share this key or commit it to version control');
    console.log('4. If this is a key rotation, use the rotate-keys command');
    console.log('');
  }

  /**
   * Test the encryption system functionality
   */
  static async testEncryption(): Promise<boolean> {
    console.log('🧪 Testing Encryption System...');
    
    try {
      if (!process.env.DOCUMENT_MASTER_KEY) {
        console.error('❌ DOCUMENT_MASTER_KEY environment variable not found');
        console.log('Run: npm run admin:generate-key to create a new master key');
        return false;
      }

      const isWorking = await EncryptionService.testEncryption();
      
      if (isWorking) {
        console.log('✅ Encryption system is working correctly');
        console.log('   - Document key encryption/decryption: OK');
        console.log('   - File encryption/decryption: OK');
        console.log('   - Master key validation: OK');
        return true;
      } else {
        console.error('❌ Encryption system test failed');
        return false;
      }
    } catch (error) {
      console.error('❌ Encryption test error:', error.message);
      return false;
    }
  }

  /**
   * Rotate master keys - re-encrypt all document keys with new master key
   */
  static async rotateMasterKeys(oldKeyHex: string, newKeyHex: string): Promise<void> {
    console.log('🔄 Starting Master Key Rotation...');
    
    try {
      // Validate key format
      if (oldKeyHex.length !== 64 || newKeyHex.length !== 64) {
        throw new Error('Keys must be exactly 64 hex characters (256 bits)');
      }

      // Get all encrypted document keys from database
      const getEncryptedKeys = async () => {
        const documents = await storage.getDocumentsWithEncryptionKeys();
        return documents.map(doc => ({
          id: doc.id.toString(),
          encryptedKey: doc.encryptedDocumentKey || ''
        })).filter(item => item.encryptedKey);
      };

      console.log('📦 Retrieving encrypted document keys...');
      const documentsToRotate = await getEncryptedKeys();
      console.log(`📊 Found ${documentsToRotate.length} documents to rotate`);

      if (documentsToRotate.length === 0) {
        console.log('ℹ️  No encrypted documents found - rotation complete');
        return;
      }

      console.log('🔐 Re-encrypting document keys...');
      const reencryptedKeys = await EncryptionService.rotateDocumentKeys(
        oldKeyHex,
        newKeyHex,
        getEncryptedKeys
      );

      console.log('💾 Updating database with new encrypted keys...');
      for (const item of reencryptedKeys) {
        await storage.updateDocumentEncryptionKey(parseInt(item.id), item.newEncryptedKey);
      }

      console.log('✅ Master key rotation completed successfully');
      console.log(`📊 Rotated ${reencryptedKeys.length} document keys`);
      console.log('');
      console.log('⚠️  NEXT STEPS:');
      console.log('1. Update DOCUMENT_MASTER_KEY environment variable with new key');
      console.log('2. Restart the application');
      console.log('3. Run validation test to confirm everything works');
      console.log('4. Securely destroy the old master key');

    } catch (error) {
      console.error('❌ Key rotation failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate system encryption status
   */
  static async validateSystem(): Promise<void> {
    console.log('🔍 Validating Encryption System Status...');
    
    try {
      // Check master key presence
      const hasMasterKey = !!process.env.DOCUMENT_MASTER_KEY;
      console.log(`🔑 Master Key: ${hasMasterKey ? '✅ Present' : '❌ Missing'}`);

      if (!hasMasterKey) {
        console.log('Run: npm run admin:generate-key to create a master key');
        return;
      }

      // Test encryption functionality
      const encryptionWorks = await this.testEncryption();
      
      // Check database for encrypted documents
      const stats = await storage.getEncryptionStats();
      console.log(`📊 Encryption Statistics:`);
      console.log(`   - Total documents: ${stats.totalDocuments}`);
      console.log(`   - Encrypted documents: ${stats.encryptedDocuments}`);
      console.log(`   - Unencrypted documents: ${stats.unencryptedDocuments}`);

      if (stats.unencryptedDocuments > 0) {
        console.log('⚠️  Warning: Some documents are not encrypted');
        console.log('   Consider running encryption migration for legacy documents');
      }

      console.log(`🔒 System Status: ${encryptionWorks && stats.encryptedDocuments > 0 ? '✅ Secure' : '⚠️  Needs Attention'}`);

    } catch (error) {
      console.error('❌ Validation error:', error.message);
    }
  }

  /**
   * Display help information
   */
  static showHelp(): void {
    console.log('🔐 MyHome Document Encryption Admin Tool');
    console.log('=========================================');
    console.log('');
    console.log('Commands:');
    console.log('  generate-key     Generate a new 256-bit master encryption key');
    console.log('  test-encryption  Test encryption system functionality');
    console.log('  rotate-keys      Rotate master keys (requires old and new keys)');
    console.log('  validate         Check encryption system status');
    console.log('  help             Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  tsx server/adminKeyManagement.ts generate-key');
    console.log('  tsx server/adminKeyManagement.ts test-encryption');
    console.log('  tsx server/adminKeyManagement.ts validate');
    console.log('');
    console.log('Key Rotation:');
    console.log('  tsx server/adminKeyManagement.ts rotate-keys <old_key> <new_key>');
    console.log('');
  }
}

// Main execution
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case COMMANDS.GENERATE_KEY:
      AdminKeyManager.generateMasterKey();
      break;
      
    case COMMANDS.TEST_ENCRYPTION:
      await AdminKeyManager.testEncryption();
      break;
      
    case COMMANDS.ROTATE_KEYS:
      const oldKey = process.argv[3];
      const newKey = process.argv[4];
      
      if (!oldKey || !newKey) {
        console.error('❌ Key rotation requires both old and new keys');
        console.log('Usage: tsx server/adminKeyManagement.ts rotate-keys <old_key_hex> <new_key_hex>');
        process.exit(1);
      }
      
      await AdminKeyManager.rotateMasterKeys(oldKey, newKey);
      break;
      
    case COMMANDS.VALIDATE:
      await AdminKeyManager.validateSystem();
      break;
      
    case COMMANDS.HELP:
    default:
      AdminKeyManager.showHelp();
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Admin tool error:', error.message);
    process.exit(1);
  });
}

export { AdminKeyManager };