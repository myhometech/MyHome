#!/usr/bin/env node

/**
 * Backup Scheduler Script
 * BLOCKER-102: Automated Backup System
 * 
 * Handles cron-based scheduling of automated backups
 * Can be run manually or via cron job
 */

import cron from 'node-cron';
import { backupService } from './server/backupService.js';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
  const timestamp = new Date().toISOString();
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

class BackupScheduler {
  constructor() {
    this.isRunning = false;
    this.backupSchedule = process.env.BACKUP_SCHEDULE || '0 2 * * *'; // Daily at 2 AM
  }

  async initialize() {
    try {
      await backupService.initialize();
      success('Backup scheduler initialized');
    } catch (err) {
      error(`Failed to initialize backup scheduler: ${err.message}`);
      process.exit(1);
    }
  }

  async runScheduledBackup() {
    if (this.isRunning) {
      warning('Backup already in progress, skipping scheduled run');
      return;
    }

    try {
      this.isRunning = true;
      info('Starting scheduled backup...');

      const results = await backupService.runFullBackup();
      
      if (results.database.success && results.storage.success) {
        success(`Scheduled backup completed successfully`);
        info(`Database: ${this.formatBytes(results.database.size)} in ${results.database.duration}ms`);
        info(`Storage: ${this.formatBytes(results.storage.size)} in ${results.storage.duration}ms`);
      } else {
        error('Scheduled backup completed with failures');
        if (!results.database.success) {
          error(`Database backup failed: ${results.database.error}`);
        }
        if (!results.storage.success) {
          error(`Storage backup failed: ${results.storage.error}`);
        }
      }

    } catch (err) {
      error(`Scheduled backup failed: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  async runManualBackup() {
    info('Running manual backup...');
    await this.runScheduledBackup();
  }

  startScheduler() {
    info(`Starting backup scheduler with cron: ${this.backupSchedule}`);
    
    // Validate cron expression
    if (!cron.validate(this.backupSchedule)) {
      error(`Invalid cron expression: ${this.backupSchedule}`);
      process.exit(1);
    }

    // Schedule the backup
    const task = cron.schedule(this.backupSchedule, async () => {
      await this.runScheduledBackup();
    }, {
      scheduled: false,
      timezone: process.env.BACKUP_TIMEZONE || 'UTC'
    });

    // Start the scheduled task
    task.start();
    success(`Backup scheduler started (${this.backupSchedule})`);

    // Keep the process alive
    process.on('SIGINT', () => {
      info('Gracefully shutting down backup scheduler...');
      task.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      info('Gracefully shutting down backup scheduler...');
      task.stop();
      process.exit(0);
    });

    // Run initial health check
    setTimeout(async () => {
      try {
        const health = await backupService.getBackupHealth();
        info(`Backup health check: ${health.totalBackups} total backups, ${this.formatBytes(health.backupBucketSize)} storage used`);
        
        if (health.lastDatabaseBackup) {
          info(`Last database backup: ${new Date(health.lastDatabaseBackup).toLocaleString()}`);
        } else {
          warning('No recent database backup found');
        }
        
        if (health.lastStorageBackup) {
          info(`Last storage backup: ${new Date(health.lastStorageBackup).toLocaleString()}`);
        } else {
          warning('No recent storage backup found');
        }
      } catch (err) {
        warning(`Health check failed: ${err.message}`);
      }
    }, 5000);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const isManual = args.includes('--manual') || args.includes('-m');
  const isScheduled = args.includes('--schedule') || args.includes('-s');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Backup Scheduler for MyHome

Usage:
  node backup-scheduler.js [options]

Options:
  --manual, -m     Run backup once and exit
  --schedule, -s   Start continuous scheduler (default)
  --help, -h       Show this help message

Environment Variables:
  BACKUP_SCHEDULE        Cron expression (default: "0 2 * * *" - daily at 2 AM)
  BACKUP_TIMEZONE        Timezone for scheduling (default: "UTC")
  BACKUP_RETENTION_DAYS  Days to retain backups (default: 30)
  BACKUP_BUCKET_NAME     GCS bucket for backups (default: "myhome-backups")

Examples:
  # Run manual backup
  node backup-scheduler.js --manual

  # Start scheduler with custom schedule (every 6 hours)
  BACKUP_SCHEDULE="0 */6 * * *" node backup-scheduler.js --schedule

  # Run with custom retention (keep backups for 7 days)
  BACKUP_RETENTION_DAYS=7 node backup-scheduler.js --manual
`);
    process.exit(0);
  }

  const scheduler = new BackupScheduler();
  await scheduler.initialize();

  if (isManual) {
    await scheduler.runManualBackup();
    process.exit(0);
  } else {
    scheduler.startScheduler();
  }
}

// Handle uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

// Check if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    error(`Backup scheduler failed: ${err.message}`);
    process.exit(1);
  });
}