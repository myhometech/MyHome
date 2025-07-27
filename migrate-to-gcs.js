#!/usr/bin/env node

/**
 * One-time migration script to upload all existing local files to Google Cloud Storage
 * TICKET-105: Migrate Existing Local Files to Google Cloud Storage
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import our storage services
const { StorageService } = await import('./server/storage/StorageService.js');
const { db } = await import('./server/db/index.js');
const { documents } = await import('./shared/schema.js');
const { eq } = await import('drizzle-orm');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function progress(message) {
  log(`🔄 ${message}`, colors.cyan);
}

class GCSMigrationService {
  constructor() {
    this.localUploadsDir = './uploads';
    this.migrationLog = [];
    this.stats = {
      totalFiles: 0,
      successfulUploads: 0,
      failedUploads: 0,
      skippedFiles: 0,
      dataSize: 0
    };
  }

  async initialize() {
    // Initialize storage service
    this.storageService = new StorageService();
    
    // Verify GCS is configured
    if (process.env.STORAGE_TYPE !== 'gcs') {
      throw new Error('STORAGE_TYPE must be set to "gcs" for migration');
    }

    info('Initialized GCS Migration Service');
    info(`Local uploads directory: ${this.localUploadsDir}`);
  }

  async scanLocalFiles() {
    try {
      const files = await this.scanDirectory(this.localUploadsDir);
      this.stats.totalFiles = files.length;
      success(`Found ${files.length} files in local storage`);
      return files;
    } catch (err) {
      if (err.code === 'ENOENT') {
        warning('Local uploads directory does not exist');
        return [];
      }
      throw err;
    }
  }

  async scanDirectory(dirPath, baseDir = dirPath) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(fullPath, baseDir);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          const relativePath = path.relative(baseDir, fullPath);
          const stats = await fs.stat(fullPath);
          
          files.push({
            localPath: fullPath,
            relativePath,
            fileName: entry.name,
            size: stats.size,
            modified: stats.mtime
          });
        }
      }
    } catch (err) {
      error(`Error scanning directory ${dirPath}: ${err.message}`);
    }
    
    return files;
  }

  generateGCSKey(file, userId = 'migrated', documentId = null) {
    // Generate GCS key in format: userId/documentId/filename
    // For migration, we'll use a special format to identify migrated files
    const sanitizedFileName = file.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    if (documentId) {
      return `${userId}/doc_${documentId}/${sanitizedFileName}`;
    } else {
      // For files without document IDs, use timestamp-based approach
      const timestamp = file.modified.getTime();
      return `${userId}/migrated_${timestamp}/${sanitizedFileName}`;
    }
  }

  async getDocumentForFile(fileName) {
    try {
      // Try to match files with database documents by filename
      const allDocuments = await db.select().from(documents);
      
      for (const doc of allDocuments) {
        if (doc.fileName === fileName || doc.filePath?.includes(fileName)) {
          return doc;
        }
      }
      
      return null;
    } catch (err) {
      warning(`Error querying documents: ${err.message}`);
      return null;
    }
  }

  async migrateFile(file) {
    try {
      progress(`Migrating: ${file.relativePath} (${this.formatBytes(file.size)})`);
      
      // Get associated document from database
      const document = await this.getDocumentForFile(file.fileName);
      
      // Generate GCS key
      const userId = document?.userId || 'migrated';
      const documentId = document?.id;
      const gcsKey = this.generateGCSKey(file, userId, documentId);
      
      // Check if file already exists in GCS
      const exists = await this.storageService.fileExists(gcsKey);
      if (exists) {
        warning(`File already exists in GCS: ${gcsKey}`);
        this.stats.skippedFiles++;
        this.migrationLog.push({
          action: 'skipped',
          localPath: file.localPath,
          gcsKey,
          reason: 'already_exists',
          timestamp: new Date().toISOString()
        });
        return { success: true, skipped: true };
      }
      
      // Read file content
      const fileBuffer = await fs.readFile(file.localPath);
      
      // Determine MIME type based on file extension
      const mimeType = this.getMimeType(file.fileName);
      
      // Upload to GCS
      const uploadResult = await this.storageService.upload(gcsKey, fileBuffer, {
        contentType: mimeType,
        metadata: {
          originalPath: file.relativePath,
          migratedAt: new Date().toISOString(),
          originalSize: file.size.toString(),
          documentId: documentId?.toString() || 'unknown'
        }
      });
      
      // Update database if document exists
      if (document && documentId) {
        await db.update(documents)
          .set({
            filePath: gcsKey,
            updatedAt: new Date()
          })
          .where(eq(documents.id, documentId));
        
        info(`Updated database record for document ID: ${documentId}`);
      }
      
      this.stats.successfulUploads++;
      this.stats.dataSize += file.size;
      
      success(`Migrated: ${file.relativePath} → ${gcsKey}`);
      
      this.migrationLog.push({
        action: 'migrated',
        localPath: file.localPath,
        gcsKey,
        size: file.size,
        documentId,
        timestamp: new Date().toISOString()
      });
      
      return { success: true, gcsKey };
      
    } catch (err) {
      error(`Failed to migrate ${file.relativePath}: ${err.message}`);
      this.stats.failedUploads++;
      
      this.migrationLog.push({
        action: 'failed',
        localPath: file.localPath,
        error: err.message,
        timestamp: new Date().toISOString()
      });
      
      return { success: false, error: err.message };
    }
  }

  getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async validateMigration(files) {
    info('Validating migration...');
    
    let validationErrors = 0;
    
    for (const file of files.slice(0, 5)) { // Validate first 5 files
      const document = await this.getDocumentForFile(file.fileName);
      const userId = document?.userId || 'migrated';
      const documentId = document?.id;
      const gcsKey = this.generateGCSKey(file, userId, documentId);
      
      try {
        // Check if file exists in GCS
        const exists = await this.storageService.fileExists(gcsKey);
        if (!exists) {
          error(`Validation failed: ${gcsKey} not found in GCS`);
          validationErrors++;
          continue;
        }
        
        // Get file metadata
        const metadata = await this.storageService.getFileMetadata(gcsKey);
        if (!metadata) {
          error(`Validation failed: No metadata for ${gcsKey}`);
          validationErrors++;
          continue;
        }
        
        success(`Validation passed: ${gcsKey}`);
        
      } catch (err) {
        error(`Validation error for ${gcsKey}: ${err.message}`);
        validationErrors++;
      }
    }
    
    if (validationErrors === 0) {
      success('Migration validation completed successfully');
    } else {
      warning(`Migration validation found ${validationErrors} issues`);
    }
    
    return validationErrors === 0;
  }

  async generateReport() {
    const reportPath = `migration-report-${Date.now()}.json`;
    
    const report = {
      migration: {
        startTime: this.startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(this.startTime).getTime()
      },
      statistics: this.stats,
      log: this.migrationLog
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    info(`Migration report saved: ${reportPath}`);
    return reportPath;
  }

  async run(dryRun = false) {
    try {
      this.startTime = new Date().toISOString();
      
      log('🚀 Starting GCS Migration Process...', colors.cyan);
      log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE MIGRATION'}`, colors.yellow);
      
      await this.initialize();
      
      // Scan local files
      const files = await this.scanLocalFiles();
      
      if (files.length === 0) {
        info('No files to migrate');
        return;
      }
      
      info(`Planning to migrate ${files.length} files`);
      
      if (dryRun) {
        info('DRY RUN - No files will be uploaded');
        for (const file of files) {
          const document = await this.getDocumentForFile(file.fileName);
          const userId = document?.userId || 'migrated';
          const documentId = document?.id;
          const gcsKey = this.generateGCSKey(file, userId, documentId);
          log(`Would migrate: ${file.relativePath} → ${gcsKey}`);
        }
        return;
      }
      
      // Migrate files
      for (const file of files) {
        await this.migrateFile(file);
      }
      
      // Validate migration
      await this.validateMigration(files);
      
      // Generate report
      await this.generateReport();
      
      // Print summary
      log('\n📊 Migration Summary:', colors.cyan);
      log(`Total files processed: ${this.stats.totalFiles}`);
      log(`Successful uploads: ${this.stats.successfulUploads}`, colors.green);
      log(`Failed uploads: ${this.stats.failedUploads}`, colors.red);
      log(`Skipped files: ${this.stats.skippedFiles}`, colors.yellow);
      log(`Total data migrated: ${this.formatBytes(this.stats.dataSize)}`);
      
      if (this.stats.failedUploads === 0) {
        success('🎉 Migration completed successfully!');
      } else {
        warning('⚠️  Migration completed with some failures. Check the migration report for details.');
      }
      
    } catch (err) {
      error(`Migration failed: ${err.message}`);
      console.error(err.stack);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  const migrationService = new GCSMigrationService();
  await migrationService.run(dryRun);
}

// Check if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Migration script failed:', err);
    process.exit(1);
  });
}

export { GCSMigrationService };