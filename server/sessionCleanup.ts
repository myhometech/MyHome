// Session Store Memory Cleanup Service
import type { SessionData } from 'express-session';

class SessionCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.startCleanupScheduler();
  }

  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL);
    
    console.log('🧹 Session cleanup scheduler started');
  }

  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const { db } = await import('./db-connection.js');
      
      const cutoffTime = new Date(Date.now() - this.MAX_SESSION_AGE);
      
      // Clean up expired sessions from PostgreSQL
      const result = await db.execute(`
        DELETE FROM sessions 
        WHERE expire < $1 OR 
              (data->>'lastActivity')::bigint < $2
      `, [cutoffTime, Date.now() - this.MAX_SESSION_AGE]);
      
      if (result.rowCount && result.rowCount > 0) {
        console.log(`🗑️ Cleaned up ${result.rowCount} expired sessions`);
        
        // Force GC after session cleanup
        if (global.gc) {
          global.gc();
          console.log('🔄 GC after session cleanup');
        }
      }
      
    } catch (error) {
      console.error('❌ Session cleanup failed:', error);
    }
  }

  public async emergencyCleanup(): Promise<void> {
    console.log('🆘 Emergency session cleanup initiated');
    
    try {
      const { db } = await import('./db-connection.js');
      
      // More aggressive cleanup - remove sessions older than 2 hours
      const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
      
      const result = await db.execute(`
        DELETE FROM sessions 
        WHERE expire < $1 OR 
              (data->>'lastActivity')::bigint < $2
      `, [cutoffTime, Date.now() - 2 * 60 * 60 * 1000]);
      
      console.log(`🚨 Emergency cleanup removed ${result.rowCount || 0} sessions`);
      
      // Force immediate GC
      if (global.gc) {
        global.gc();
      }
      
    } catch (error) {
      console.error('❌ Emergency session cleanup failed:', error);
    }
  }

  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('⏹️ Session cleanup scheduler stopped');
    }
  }
}

export const sessionCleanup = new SessionCleanupService();