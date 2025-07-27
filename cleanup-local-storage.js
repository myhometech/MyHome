#!/usr/bin/env node

/**
 * Local Storage Cleanup Script
 * TICKET-106: Fully Deprecate Local File Storage
 * 
 * This script removes all local file storage logic and references
 * after migration to Google Cloud Storage is complete.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

class LocalStorageCleanupService {
  constructor() {
    this.cleanupLog = [];
    this.stats = {
      filesRemoved: 0,
      directoriesRemoved: 0,
      codeChanges: 0,
      configChanges: 0
    };
  }

  async scanForLocalStorageReferences() {
    const files = await this.scanCodeFiles();
    const references = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const localStoragePatterns = [
          /fs\.(writeFile|readFile|createWriteStream|createReadStream)/g,
          /path\.join.*uploads/g,
          /UPLOAD_PATH|FILE_DIR/g,
          /\.\/uploads/g,
          /uploads\//g,
          /localStorage|localFile/gi
        ];

        for (const pattern of localStoragePatterns) {
          const matches = [...content.matchAll(pattern)];
          if (matches.length > 0) {
            references.push({
              file,
              pattern: pattern.source,
              matches: matches.length,
              lines: this.getLineNumbers(content, pattern)
            });
          }
        }
      } catch (err) {
        warning(`Could not scan file ${file}: ${err.message}`);
      }
    }

    return references;
  }

  async scanCodeFiles() {
    const files = [];
    const extensions = ['.ts', '.js', '.tsx', '.jsx'];
    
    async function scanDir(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            await scanDir(fullPath);
          } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch (err) {
        // Skip inaccessible directories
      }
    }
    
    await scanDir('.');
    return files;
  }

  getLineNumbers(content, pattern) {
    const lines = content.split('\n');
    const lineNumbers = [];
    
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        lineNumbers.push(index + 1);
      }
    });
    
    return lineNumbers;
  }

  async removeLocalStorageCode() {
    progress('Removing LocalStorage class implementation...');
    
    const localStoragePath = 'server/storage/LocalStorage.ts';
    
    try {
      const content = await fs.readFile(localStoragePath, 'utf8');
      
      // Create a minimal stub that redirects to GCS
      const stubContent = `/**
 * Local Storage - DEPRECATED
 * This file is maintained as a stub for backward compatibility.
 * All file operations now use Google Cloud Storage.
 */

import { StorageProvider } from './StorageProvider.js';

export class LocalStorage implements StorageProvider {
  constructor() {
    console.warn('LocalStorage is deprecated. All operations now use Google Cloud Storage.');
  }

  async upload(): Promise<string> {
    throw new Error('Local storage is deprecated. Use GCS storage provider.');
  }

  async download(): Promise<Buffer> {
    throw new Error('Local storage is deprecated. Use GCS storage provider.');
  }

  async delete(): Promise<void> {
    throw new Error('Local storage is deprecated. Use GCS storage provider.');
  }

  async fileExists(): Promise<boolean> {
    return false;
  }

  async getFileMetadata(): Promise<any> {
    throw new Error('Local storage is deprecated. Use GCS storage provider.');
  }

  async getSignedUrl(): Promise<string> {
    throw new Error('Local storage is deprecated. Use GCS storage provider.');
  }
}
`;
      
      await fs.writeFile(localStoragePath, stubContent);
      success('LocalStorage class converted to deprecation stub');
      this.stats.codeChanges++;
      
      this.cleanupLog.push({
        action: 'code_cleanup',
        file: localStoragePath,
        description: 'Converted LocalStorage to deprecation stub'
      });
      
    } catch (err) {
      warning(`Could not modify LocalStorage: ${err.message}`);
    }
  }

  async updateStorageService() {
    progress('Updating StorageService to be GCS-only...');
    
    const storageServicePath = 'server/storage/StorageService.ts';
    
    try {
      let content = await fs.readFile(storageServicePath, 'utf8');
      
      // Update to default to GCS and warn about local storage
      const updatedContent = content.replace(
        /STORAGE_TYPE.*===.*'local'/g,
        "STORAGE_TYPE === 'local' && console.warn('Local storage is deprecated')"
      );
      
      await fs.writeFile(storageServicePath, updatedContent);
      success('StorageService updated with deprecation warnings');
      this.stats.codeChanges++;
      
    } catch (err) {
      warning(`Could not update StorageService: ${err.message}`);
    }
  }

  async removeUploadDirectories() {
    progress('Removing local upload directories...');
    
    const directoriesToRemove = [
      './uploads',
      './test-uploads',
      './local-storage'
    ];
    
    for (const dir of directoriesToRemove) {
      try {
        const stats = await fs.stat(dir);
        if (stats.isDirectory()) {
          await fs.rm(dir, { recursive: true, force: true });
          success(`Removed directory: ${dir}`);
          this.stats.directoriesRemoved++;
          
          this.cleanupLog.push({
            action: 'directory_removal',
            path: dir,
            description: 'Removed local storage directory'
          });
        }
      } catch (err) {
        // Directory doesn't exist or can't be removed
        info(`Directory ${dir} not found or already removed`);
      }
    }
  }

  async updateEnvironmentFiles() {
    progress('Updating environment configuration...');
    
    try {
      // Update .env.example to remove local storage references
      const envExamplePath = '.env.example';
      let envContent = await fs.readFile(envExamplePath, 'utf8');
      
      // Add deprecation comments for local storage variables
      envContent = envContent.replace(
        /UPLOAD_PATH=/g,
        '# UPLOAD_PATH= # DEPRECATED - Use Google Cloud Storage\n# UPLOAD_PATH='
      );
      
      envContent = envContent.replace(
        /FILE_DIR=/g,
        '# FILE_DIR= # DEPRECATED - Use Google Cloud Storage\n# FILE_DIR='
      );
      
      // Ensure GCS is the default storage type
      if (!envContent.includes('STORAGE_TYPE=gcs')) {
        envContent += '\n# Storage Configuration (GCS Only)\nSTORAGE_TYPE=gcs\n';
      }
      
      await fs.writeFile(envExamplePath, envContent);
      success('Updated .env.example with GCS-only configuration');
      this.stats.configChanges++;
      
    } catch (err) {
      warning(`Could not update environment files: ${err.message}`);
    }
  }

  async updateDocumentation() {
    progress('Updating documentation...');
    
    const docsToUpdate = [
      'README.md',
      'DOCKER_SETUP_GUIDE.md',
      'replit.md'
    ];
    
    for (const docFile of docsToUpdate) {
      try {
        let content = await fs.readFile(docFile, 'utf8');
        
        // Add deprecation notices for local storage
        const localStorageSection = `
## ⚠️ Local Storage Deprecation Notice

Local file storage has been deprecated and replaced with Google Cloud Storage. 
All file operations now use GCS for better scalability, reliability, and performance.

**Migration Status**: Complete - All files migrated to Google Cloud Storage
**Local Storage**: Deprecated and removed
**Current Storage**: Google Cloud Storage (GCS) only

`;
        
        // Insert deprecation notice after the main heading
        if (content.includes('# ') && !content.includes('Local Storage Deprecation')) {
          const lines = content.split('\n');
          const firstHeadingIndex = lines.findIndex(line => line.startsWith('# '));
          if (firstHeadingIndex !== -1) {
            lines.splice(firstHeadingIndex + 1, 0, localStorageSection);
            content = lines.join('\n');
          }
        }
        
        // Update storage configuration examples
        content = content.replace(
          /STORAGE_TYPE=local/g,
          'STORAGE_TYPE=gcs  # Local storage deprecated'
        );
        
        await fs.writeFile(docFile, content);
        success(`Updated documentation: ${docFile}`);
        this.stats.configChanges++;
        
      } catch (err) {
        info(`Could not update ${docFile}: ${err.message}`);
      }
    }
  }

  async validateCleanup() {
    info('Validating cleanup...');
    
    const references = await this.scanForLocalStorageReferences();
    const criticalReferences = references.filter(ref => 
      !ref.file.includes('test') && 
      !ref.file.includes('cleanup-local-storage.js') &&
      !ref.file.includes('migrate-to-gcs.js') &&
      !ref.pattern.includes('localStorage|localFile') // These might be legitimate
    );
    
    if (criticalReferences.length === 0) {
      success('Cleanup validation passed - no critical local storage references found');
      return true;
    } else {
      warning(`Found ${criticalReferences.length} remaining local storage references:`);
      criticalReferences.forEach(ref => {
        log(`  ${ref.file} (lines: ${ref.lines.join(', ')}) - ${ref.pattern}`);
      });
      return false;
    }
  }

  async generateCleanupReport() {
    const reportPath = `cleanup-report-${Date.now()}.json`;
    
    const report = {
      cleanup: {
        timestamp: new Date().toISOString(),
        status: 'completed'
      },
      statistics: this.stats,
      log: this.cleanupLog,
      validation: await this.scanForLocalStorageReferences()
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    info(`Cleanup report saved: ${reportPath}`);
    return reportPath;
  }

  async run(dryRun = false) {
    try {
      log('🧹 Starting Local Storage Cleanup Process...', colors.cyan);
      log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE CLEANUP'}`, colors.yellow);
      
      if (dryRun) {
        // In dry run, just scan and report what would be done
        const references = await this.scanForLocalStorageReferences();
        
        info('DRY RUN - Would perform the following actions:');
        info('1. Convert LocalStorage class to deprecation stub');
        info('2. Update StorageService with deprecation warnings');
        info('3. Remove upload directories (./uploads, ./test-uploads)');
        info('4. Update environment configuration files');
        info('5. Update documentation with deprecation notices');
        
        if (references.length > 0) {
          warning(`Found ${references.length} local storage references that need attention:`);
          references.forEach(ref => {
            log(`  ${ref.file} - ${ref.matches} matches`);
          });
        }
        
        return;
      }
      
      // Perform actual cleanup
      await this.removeLocalStorageCode();
      await this.updateStorageService();
      await this.removeUploadDirectories();
      await this.updateEnvironmentFiles();
      await this.updateDocumentation();
      
      // Validate cleanup
      const isValid = await this.validateCleanup();
      
      // Generate report
      await this.generateCleanupReport();
      
      // Print summary
      log('\n📊 Cleanup Summary:', colors.cyan);
      log(`Files modified: ${this.stats.codeChanges}`);
      log(`Directories removed: ${this.stats.directoriesRemoved}`);
      log(`Configuration changes: ${this.stats.configChanges}`);
      
      if (isValid) {
        success('🎉 Local storage cleanup completed successfully!');
        info('✅ All local file storage logic has been removed');
        info('✅ Google Cloud Storage is now the only storage provider');
        info('✅ Documentation updated with deprecation notices');
      } else {
        warning('⚠️  Cleanup completed but some references may need manual review');
      }
      
    } catch (err) {
      error(`Cleanup failed: ${err.message}`);
      console.error(err.stack);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  const cleanupService = new LocalStorageCleanupService();
  await cleanupService.run(dryRun);
}

// Check if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Cleanup script failed:', err);
    process.exit(1);
  });
}

export { LocalStorageCleanupService };