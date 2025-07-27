/**
 * Backup Management API Routes
 * BLOCKER-102: Automated Backup System
 */

import { Router } from 'express';
import { backupService } from '../backupService.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/backup/health
 * Get backup system health status
 */
router.get('/health', requireAdmin, async (req, res) => {
  try {
    const health = await backupService.getBackupHealth();
    
    // Check if backups are recent (within 25 hours for daily backups)
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    
    const isDatabaseBackupRecent = health.lastDatabaseBackup ? 
      new Date(health.lastDatabaseBackup) > oneDayAgo : false;
    
    const isStorageBackupRecent = health.lastStorageBackup ? 
      new Date(health.lastStorageBackup) > oneDayAgo : false;

    res.json({
      status: isDatabaseBackupRecent && isStorageBackupRecent ? 'healthy' : 'warning',
      health,
      alerts: {
        databaseBackupOverdue: !isDatabaseBackupRecent,
        storageBackupOverdue: !isStorageBackupRecent
      }
    });
  } catch (error) {
    console.error('Failed to get backup health:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve backup health status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/backup/database
 * Trigger manual database backup
 */
router.post('/database', requireAdmin, async (req, res) => {
  try {
    console.log('📋 Manual database backup triggered by admin');
    const result = await backupService.backupDatabase();
    
    res.json({
      success: result.success,
      result,
      message: result.success ? 
        'Database backup completed successfully' : 
        'Database backup failed'
    });
  } catch (error) {
    console.error('Manual database backup failed:', error);
    res.status(500).json({ 
      error: 'Database backup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/backup/storage
 * Trigger manual storage backup
 */
router.post('/storage', requireAdmin, async (req, res) => {
  try {
    console.log('📋 Manual storage backup triggered by admin');
    const result = await backupService.backupFileStorage();
    
    res.json({
      success: result.success,
      result,
      message: result.success ? 
        'Storage backup completed successfully' : 
        'Storage backup failed'
    });
  } catch (error) {
    console.error('Manual storage backup failed:', error);
    res.status(500).json({ 
      error: 'Storage backup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/backup/full
 * Trigger full backup (database + storage)
 */
router.post('/full', requireAdmin, async (req, res) => {
  try {
    console.log('📋 Manual full backup triggered by admin');
    const results = await backupService.runFullBackup();
    
    const success = results.database.success && results.storage.success;
    
    res.json({
      success,
      results,
      message: success ? 
        'Full backup completed successfully' : 
        'Full backup completed with some failures'
    });
  } catch (error) {
    console.error('Manual full backup failed:', error);
    res.status(500).json({ 
      error: 'Full backup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/backup/restore/database
 * Restore database from backup
 */
router.post('/restore/database', requireAdmin, async (req, res) => {
  try {
    const { backupPath } = req.body;
    
    if (!backupPath) {
      return res.status(400).json({ error: 'Backup path is required' });
    }
    
    console.log(`📋 Manual database restore triggered: ${backupPath}`);
    const success = await backupService.restoreDatabase(backupPath);
    
    res.json({
      success,
      message: success ? 
        'Database restore completed successfully' : 
        'Database restore failed'
    });
  } catch (error) {
    console.error('Manual database restore failed:', error);
    res.status(500).json({ 
      error: 'Database restore failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/backup/restore/storage
 * Restore storage from backup
 */
router.post('/restore/storage', requireAdmin, async (req, res) => {
  try {
    const { backupPrefix } = req.body;
    
    if (!backupPrefix) {
      return res.status(400).json({ error: 'Backup prefix is required' });
    }
    
    console.log(`📋 Manual storage restore triggered: ${backupPrefix}`);
    const success = await backupService.restoreFileStorage(backupPrefix);
    
    res.json({
      success,
      message: success ? 
        'Storage restore completed successfully' : 
        'Storage restore failed'
    });
  } catch (error) {
    console.error('Manual storage restore failed:', error);
    res.status(500).json({ 
      error: 'Storage restore failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/backup/cleanup
 * Clean up old backups manually
 */
router.delete('/cleanup', requireAdmin, async (req, res) => {
  try {
    console.log('📋 Manual backup cleanup triggered by admin');
    await backupService.cleanupOldBackups();
    
    res.json({
      success: true,
      message: 'Backup cleanup completed successfully'
    });
  } catch (error) {
    console.error('Manual backup cleanup failed:', error);
    res.status(500).json({ 
      error: 'Backup cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as backupRoutes };