/**
 * Automated Backup Service for MyHome
 * BLOCKER-102: Implement Automated Backup System
 * 
 * Handles automated backups for PostgreSQL database and Google Cloud Storage files
 */

import { spawn } from 'child_process';
import { Storage } from '@google-cloud/storage';
import fs from 'fs/promises';
import path from 'path';
import { db } from './db.js';
import { documents } from '../shared/schema.js';
import { StorageService } from './storage/StorageService.js';
import * as Sentry from '@sentry/node';

interface BackupConfig {
  database: {
    retentionDays: number;
    schedule: string; // cron format
    compressionLevel: number;
  };
  storage: {
    retentionDays: number;
    archivalBucket: string;
    crossRegionReplication: boolean;
  };
  monitoring: {
    alertOnFailure: boolean;
    slackWebhook?: string;
    emailAlerts?: string[];
  };
}

interface BackupResult {
  success: boolean;
  timestamp: string;
  type: 'database' | 'storage';
  size: number;
  duration: number;
  error?: string;
  backupPath: string;
}

export class BackupService {
  private config: BackupConfig;
  private storageService: StorageService;
  private gcsClient: Storage;
  private backupBucket: string;

  constructor() {
    this.config = {
      database: {
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
        schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        compressionLevel: 6
      },
      storage: {
        retentionDays: parseInt(process.env.STORAGE_BACKUP_RETENTION_DAYS || '30'),
        archivalBucket: process.env.BACKUP_BUCKET_NAME || 'myhometech-backups',
        crossRegionReplication: process.env.BACKUP_CROSS_REGION === 'true'
      },
      monitoring: {
        alertOnFailure: true,
        slackWebhook: process.env.SLACK_WEBHOOK_URL,
        emailAlerts: process.env.BACKUP_ALERT_EMAILS?.split(',')
      }
    };

    this.storageService = StorageService;
    
    // Initialize GCS client with explicit credentials to prevent metadata server calls
    // Priority: NEW_GOOGLE_APPLICATION_CREDENTIALS > GOOGLE_APPLICATION_CREDENTIALS
    const gcsOptions: any = {};
    if (process.env.NEW_GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const credentialsStr = process.env.NEW_GOOGLE_APPLICATION_CREDENTIALS.trim();
        
        // Check if it's an XML error (invalid credentials) 
        if (credentialsStr.startsWith('<?xml') || credentialsStr.includes('<Error>')) {
          console.error('❌ NEW_GOOGLE_APPLICATION_CREDENTIALS contains an error response, falling back');
          throw new Error('Invalid credentials format');
        }
        
        gcsOptions.credentials = JSON.parse(credentialsStr);
        gcsOptions.projectId = gcsOptions.credentials.project_id;
        console.log('✅ Backup service using NEW_GOOGLE_APPLICATION_CREDENTIALS');
      } catch (error) {
        console.error('Failed to parse NEW_GOOGLE_APPLICATION_CREDENTIALS for backup service:', error);
        // Fall back to old credentials instead of throwing
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          gcsOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
          gcsOptions.projectId = gcsOptions.credentials.project_id;
          console.log('✅ Backup service using GOOGLE_APPLICATION_CREDENTIALS as fallback');
        } else {
          throw new Error('No valid GCS credentials available');
        }
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        gcsOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        gcsOptions.projectId = gcsOptions.credentials.project_id;
        console.log('✅ Backup service using GOOGLE_APPLICATION_CREDENTIALS');
      } catch (error) {
        console.error('Failed to parse GCS credentials for backup service:', error);
        throw new Error('Invalid GCS credentials configuration');
      }
    } else {
      throw new Error('NEW_GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS required for backup service');
    }
    
    this.gcsClient = new Storage(gcsOptions);
    this.backupBucket = this.config.storage.archivalBucket;
  }

  /**
   * Initialize backup bucket and set retention policies
   */
  async initialize(): Promise<void> {
    try {
      const bucket = this.gcsClient.bucket(this.backupBucket);
      
      // Create bucket if it doesn't exist
      const [exists] = await bucket.exists();
      if (!exists) {
        await bucket.create({
          location: 'US',
          storageClass: 'COLDLINE', // Cost-effective for archival
        });
        console.log(`Created backup bucket: ${this.backupBucket}`);
      }

      // Set lifecycle policy for retention
      await bucket.setMetadata({
        lifecycle: {
          rule: [{
            action: { type: 'Delete' },
            condition: { age: this.config.database.retentionDays }
          }]
        }
      });

      console.log('✅ Backup service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize backup service:', error);
      throw error;
    }
  }

  /**
   * Perform PostgreSQL database backup using pg_dump
   */
  async backupDatabase(): Promise<BackupResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `database-backup-${timestamp}.sql.gz`;
    const tempBackupPath = `/tmp/${backupFileName}`;
    const gcsBackupPath = `database-backups/${backupFileName}`;

    try {
      console.log('🔄 Starting database backup...');

      // Extract database connection details from DATABASE_URL
      const dbUrl = new URL(process.env.DATABASE_URL!);
      const pgDumpArgs = [
        '--host', dbUrl.hostname,
        '--port', dbUrl.port || '5432',
        '--username', dbUrl.username,
        '--dbname', dbUrl.pathname.slice(1), // Remove leading slash
        '--verbose',
        '--no-password',
        '--format=custom',
        '--compress=' + this.config.database.compressionLevel,
        '--file', tempBackupPath
      ];

      // Set password via environment variable
      const env = {
        ...process.env,
        PGPASSWORD: dbUrl.password
      };

      // Execute pg_dump
      await this.executeCommand('pg_dump', pgDumpArgs, env);

      // Verify backup file was created
      const stats = await fs.stat(tempBackupPath);
      if (stats.size === 0) {
        throw new Error('Database backup file is empty');
      }

      // Upload to GCS backup bucket
      const bucket = this.gcsClient.bucket(this.backupBucket);
      await bucket.upload(tempBackupPath, {
        destination: gcsBackupPath,
        metadata: {
          metadata: {
            backupType: 'database',
            timestamp: new Date().toISOString(),
            originalSize: stats.size.toString(),
            databaseName: dbUrl.pathname.slice(1)
          }
        }
      });

      // Clean up temporary file
      await fs.unlink(tempBackupPath);

      const duration = Date.now() - startTime;
      const result: BackupResult = {
        success: true,
        timestamp: new Date().toISOString(),
        type: 'database',
        size: stats.size,
        duration,
        backupPath: gcsBackupPath
      };

      console.log(`✅ Database backup completed: ${backupFileName} (${this.formatBytes(stats.size)})`);
      await this.logBackupResult(result);
      
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const result: BackupResult = {
        success: false,
        timestamp: new Date().toISOString(),
        type: 'database',
        size: 0,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        backupPath: gcsBackupPath
      };

      console.error('❌ Database backup failed:', error);
      await this.handleBackupFailure(result);
      
      return result;
    }
  }

  /**
   * Backup file storage by replicating to archival bucket
   */
  async backupFileStorage(): Promise<BackupResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPrefix = `storage-backup-${timestamp}/`;

    try {
      console.log('🔄 Starting file storage backup...');

      // Get all documents from database to know what files to backup
      const allDocuments = await db.select().from(documents);
      
      let totalSize = 0;
      let fileCount = 0;
      const sourceBucket = this.gcsClient.bucket(process.env.GCS_BUCKET_NAME!);
      const backupBucket = this.gcsClient.bucket(this.backupBucket);

      // Copy each file to backup bucket
      for (const doc of allDocuments) {
        if (doc.filePath && doc.filePath.startsWith('gs://')) {
          // Extract GCS key from full path
          const gcsKey = doc.filePath.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, '');
          const backupKey = backupPrefix + gcsKey;

          try {
            const sourceFile = sourceBucket.file(gcsKey);
            const [exists] = await sourceFile.exists();
            
            if (exists) {
              await sourceFile.copy(backupBucket.file(backupKey));
              
              // Get file size for statistics
              const [metadata] = await sourceFile.getMetadata();
              totalSize += parseInt(metadata.size?.toString() || '0');
              fileCount++;
            }
          } catch (fileError) {
            console.warn(`Warning: Could not backup file ${gcsKey}:`, fileError);
          }
        }
      }

      // Create backup manifest
      const manifest = {
        timestamp: new Date().toISOString(),
        fileCount,
        totalSize,
        backupPrefix,
        documents: allDocuments.map((doc: any) => ({
          id: doc.id,
          fileName: doc.fileName,
          filePath: doc.filePath,
          userId: doc.userId
        }))
      };

      // Upload manifest to backup bucket
      const manifestFile = backupBucket.file(`${backupPrefix}manifest.json`);
      await manifestFile.save(JSON.stringify(manifest, null, 2), {
        metadata: {
          contentType: 'application/json',
          metadata: {
            backupType: 'storage-manifest',
            timestamp: manifest.timestamp
          }
        }
      });

      const duration = Date.now() - startTime;
      const result: BackupResult = {
        success: true,
        timestamp: new Date().toISOString(),
        type: 'storage',
        size: totalSize,
        duration,
        backupPath: backupPrefix
      };

      console.log(`✅ Storage backup completed: ${fileCount} files (${this.formatBytes(totalSize)})`);
      await this.logBackupResult(result);
      
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const result: BackupResult = {
        success: false,
        timestamp: new Date().toISOString(),
        type: 'storage',
        size: 0,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        backupPath: backupPrefix
      };

      console.error('❌ Storage backup failed:', error);
      await this.handleBackupFailure(result);
      
      return result;
    }
  }

  /**
   * Restore database from backup
   */
  async restoreDatabase(backupPath: string): Promise<boolean> {
    try {
      console.log(`🔄 Starting database restore from: ${backupPath}`);

      // Download backup from GCS
      const tempRestorePath = `/tmp/restore-${Date.now()}.sql`;
      const bucket = this.gcsClient.bucket(this.backupBucket);
      await bucket.file(backupPath).download({ destination: tempRestorePath });

      // Extract database connection details
      const dbUrl = new URL(process.env.DATABASE_URL!);
      const pgRestoreArgs = [
        '--host', dbUrl.hostname,
        '--port', dbUrl.port || '5432',
        '--username', dbUrl.username,
        '--dbname', dbUrl.pathname.slice(1),
        '--verbose',
        '--clean',
        '--if-exists',
        '--no-password',
        tempRestorePath
      ];

      const env = {
        ...process.env,
        PGPASSWORD: dbUrl.password
      };

      // Execute pg_restore
      await this.executeCommand('pg_restore', pgRestoreArgs, env);

      // Clean up temporary file
      await fs.unlink(tempRestorePath);

      console.log('✅ Database restore completed successfully');
      return true;

    } catch (error) {
      console.error('❌ Database restore failed:', error);
      Sentry.captureException(error);
      return false;
    }
  }

  /**
   * Restore files from storage backup
   */
  async restoreFileStorage(backupPrefix: string): Promise<boolean> {
    try {
      console.log(`🔄 Starting file storage restore from: ${backupPrefix}`);

      const backupBucket = this.gcsClient.bucket(this.backupBucket);
      const sourceBucket = this.gcsClient.bucket(process.env.GCS_BUCKET_NAME!);

      // Download and parse manifest
      const manifestFile = backupBucket.file(`${backupPrefix}manifest.json`);
      const [manifestData] = await manifestFile.download();
      const manifest = JSON.parse(manifestData.toString());

      let restoredCount = 0;

      // Restore each file from backup
      for (const doc of manifest.documents) {
        if (doc.filePath && doc.filePath.startsWith('gs://')) {
          const gcsKey = doc.filePath.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, '');
          const backupKey = backupPrefix + gcsKey;

          try {
            const backupFile = backupBucket.file(backupKey);
            const [exists] = await backupFile.exists();
            
            if (exists) {
              await backupFile.copy(sourceBucket.file(gcsKey));
              restoredCount++;
            }
          } catch (fileError) {
            console.warn(`Warning: Could not restore file ${gcsKey}:`, fileError);
          }
        }
      }

      console.log(`✅ File storage restore completed: ${restoredCount}/${manifest.fileCount} files restored`);
      return true;

    } catch (error) {
      console.error('❌ File storage restore failed:', error);
      Sentry.captureException(error);
      return false;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      const bucket = this.gcsClient.bucket(this.backupBucket);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.database.retentionDays);

      const [files] = await bucket.getFiles();
      let deletedCount = 0;

      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const fileDate = new Date(metadata.timeCreated!);
        
        if (fileDate < cutoffDate) {
          await file.delete();
          deletedCount++;
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} old backup files`);
    } catch (error) {
      console.error('❌ Backup cleanup failed:', error);
      Sentry.captureException(error);
    }
  }

  /**
   * Run full backup process (database + storage)
   */
  async runFullBackup(): Promise<{ database: BackupResult; storage: BackupResult }> {
    console.log('🚀 Starting full backup process...');
    
    const [databaseResult, storageResult] = await Promise.all([
      this.backupDatabase(),
      this.backupFileStorage()
    ]);

    // Clean up old backups after successful backup
    if (databaseResult.success && storageResult.success) {
      await this.cleanupOldBackups();
    }

    console.log('✅ Full backup process completed');
    return { database: databaseResult, storage: storageResult };
  }

  /**
   * Execute shell command with proper error handling
   */
  private executeCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, { env });
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Log backup result to monitoring system
   */
  private async logBackupResult(result: BackupResult): Promise<void> {
    try {
      // Log to Sentry for monitoring
      if (result.success) {
        Sentry.addBreadcrumb({
          message: `Backup ${result.type} completed successfully`,
          category: 'backup',
          level: 'info',
          data: {
            size: result.size,
            duration: result.duration,
            path: result.backupPath
          }
        });
      } else {
        Sentry.captureException(new Error(`Backup ${result.type} failed: ${result.error}`));
      }

      // Could also log to database or external monitoring service here
      console.log(`📊 Backup logged: ${result.type} - ${result.success ? 'SUCCESS' : 'FAILED'}`);
      
    } catch (error) {
      console.error('Warning: Failed to log backup result:', error);
    }
  }

  /**
   * Handle backup failure with alerting
   */
  private async handleBackupFailure(result: BackupResult): Promise<void> {
    if (!this.config.monitoring.alertOnFailure) {
      return;
    }

    const alertMessage = `🚨 BACKUP FAILURE ALERT\n\nType: ${result.type}\nTime: ${result.timestamp}\nError: ${result.error}\nDuration: ${result.duration}ms`;

    try {
      // Send Slack alert if configured
      if (this.config.monitoring.slackWebhook) {
        await fetch(this.config.monitoring.slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: alertMessage,
            channel: '#alerts',
            username: 'MyHome Backup Bot'
          })
        });
      }

      // Log to Sentry
      Sentry.captureException(new Error(alertMessage));

      console.log('📨 Backup failure alert sent');
      
    } catch (alertError) {
      console.error('Failed to send backup failure alert:', alertError);
    }
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get backup health status
   */
  async getBackupHealth(): Promise<{
    lastDatabaseBackup: string | null;
    lastStorageBackup: string | null;
    backupBucketSize: number;
    totalBackups: number;
  }> {
    try {
      const bucket = this.gcsClient.bucket(this.backupBucket);
      const [files] = await bucket.getFiles({ prefix: 'database-backups/' });
      const [storageFiles] = await bucket.getFiles({ prefix: 'storage-backup-' });

      // Find most recent backups
      const databaseBackups = files.sort((a, b) => 
        new Date(b.metadata.timeCreated || 0).getTime() - new Date(a.metadata.timeCreated || 0).getTime()
      );
      
      const storageBackups = storageFiles.filter(f => f.name.includes('manifest.json'))
        .sort((a, b) => 
          new Date(b.metadata.timeCreated || 0).getTime() - new Date(a.metadata.timeCreated || 0).getTime()
        );

      // Calculate total bucket size
      const [allFiles] = await bucket.getFiles();
      const totalSize = allFiles.reduce((sum, file) => 
        sum + parseInt(file.metadata.size?.toString() || '0'), 0
      );

      return {
        lastDatabaseBackup: databaseBackups[0]?.metadata.timeCreated || null,
        lastStorageBackup: storageBackups[0]?.metadata.timeCreated || null,
        backupBucketSize: totalSize,
        totalBackups: allFiles.length
      };

    } catch (error) {
      console.error('Failed to get backup health:', error);
      return {
        lastDatabaseBackup: null,
        lastStorageBackup: null,
        backupBucketSize: 0,
        totalBackups: 0
      };
    }
  }
}

export const backupService = new BackupService();