import { storage } from './storage';
import type { InsertDocumentEvent } from '../shared/schema';

/**
 * TICKET 4: Audit logging service for document actions
 * This service provides a centralized way to log all document-related events
 * for compliance, security, and user activity tracking.
 */
export class AuditLogger {
  /**
   * Log a document event with full context
   */
  static async logDocumentEvent(
    action: string,
    documentId: number,
    userId: string,
    householdId?: string | null,
    metadata?: any
  ): Promise<void> {
    try {
      const event: InsertDocumentEvent = {
        documentId,
        userId,
        householdId: householdId || null,
        action,
        metadata: metadata || null,
      };

      await storage.logDocumentEvent(event);
      
      // Optional: Add console logging for development
      console.log(`📋 AUDIT: ${action} - Document ${documentId} by User ${userId}${householdId ? ` in Household ${householdId}` : ''}`, metadata ? { metadata } : '');
      
    } catch (error) {
      console.error('Failed to log document event:', error);
      // Don't throw - audit logging failures shouldn't break the main operation
    }
  }

  /**
   * Log document upload event
   */
  static async logUpload(documentId: number, userId: string, householdId?: string | null, metadata?: { fileName?: string; fileSize?: number; fileType?: string }): Promise<void> {
    await this.logDocumentEvent('upload', documentId, userId, householdId, metadata);
  }

  /**
   * Log document deletion event
   */
  static async logDelete(documentId: number, userId: string, householdId?: string | null, metadata?: { documentName?: string; deletedBy?: string }): Promise<void> {
    await this.logDocumentEvent('delete', documentId, userId, householdId, metadata);
  }

  /**
   * Log document rename event
   */
  static async logRename(documentId: number, userId: string, householdId?: string | null, metadata?: { oldName?: string; newName?: string }): Promise<void> {
    await this.logDocumentEvent('rename', documentId, userId, householdId, metadata);
  }

  /**
   * Log AI insight generation event
   */
  static async logAIInsight(documentId: number, userId: string, householdId?: string | null, metadata?: { insightType?: string; provider?: string; tokensUsed?: number }): Promise<void> {
    await this.logDocumentEvent('ai_insight', documentId, userId, householdId, metadata);
  }

  /**
   * Log document sharing event
   */
  static async logShare(documentId: number, userId: string, householdId?: string | null, metadata?: { sharedWith?: string; shareType?: string }): Promise<void> {
    await this.logDocumentEvent('share', documentId, userId, householdId, metadata);
  }

  /**
   * Log document download event
   */
  static async logDownload(documentId: number, userId: string, householdId?: string | null, metadata?: { downloadType?: string; fileFormat?: string }): Promise<void> {
    await this.logDocumentEvent('download', documentId, userId, householdId, metadata);
  }

  /**
   * Log document view event
   */
  static async logView(documentId: number, userId: string, householdId?: string | null, metadata?: { viewDuration?: number; viewType?: string }): Promise<void> {
    await this.logDocumentEvent('view', documentId, userId, householdId, metadata);
  }

  /**
   * Log document update event (general updates like tags, category changes)
   */
  static async logUpdate(documentId: number, userId: string, householdId?: string | null, metadata?: { field?: string; oldValue?: any; newValue?: any }): Promise<void> {
    await this.logDocumentEvent('update', documentId, userId, householdId, metadata);
  }

  /**
   * THMB-1: Log thumbnail access requested event
   * Emitted when signed URL is issued for thumbnail access
   */
  static async logThumbnailAccessRequested(
    documentId: number, 
    userId: string, 
    householdId?: string | null, 
    metadata?: { 
      variant?: number; 
      sourceHash?: string; 
      storagePath?: string; 
      actor?: 'system' | 'user';
      ttlSeconds?: number;
    }
  ): Promise<void> {
    const auditMetadata = {
      ...metadata,
      actor: metadata?.actor || 'user',
      ts: new Date().toISOString(),
    };
    await this.logDocumentEvent('thumbnail.access.requested', documentId, userId, householdId, auditMetadata);
  }

  /**
   * THMB-1: Log thumbnail write completed event
   * Stub for later tickets - used when thumbnail generation completes
   */
  static async logThumbnailWriteCompleted(
    documentId: number, 
    userId: string, 
    householdId?: string | null, 
    metadata?: { 
      variant?: number; 
      sourceHash?: string; 
      storagePath?: string; 
      actor?: 'system' | 'user';
      generationTimeMs?: number;
      fileSize?: number;
    }
  ): Promise<void> {
    const auditMetadata = {
      ...metadata,
      actor: metadata?.actor || 'system',
      ts: new Date().toISOString(),
    };
    await this.logDocumentEvent('thumbnail.write.completed', documentId, userId, householdId, auditMetadata);
  }

  /**
   * THMB-2: Log thumbnail generation request (when job is enqueued)
   */
  static async logThumbnailRequested(
    documentId: number, 
    userId: string, 
    householdId?: string | null, 
    metadata?: { 
      variants?: number[]; 
      jobId?: string; 
      sourceHash?: string; 
      actor?: 'system' | 'user';
    }
  ): Promise<void> {
    const auditMetadata = {
      ...metadata,
      actor: metadata?.actor || 'user',
      requestedAt: new Date().toISOString(),
    };
    await this.logDocumentEvent('thumbnail.requested', documentId, userId, householdId, auditMetadata);
  }

  /**
   * Get audit trail for a specific document
   */
  static async getDocumentAuditTrail(documentId: number): Promise<any[]> {
    try {
      return await storage.getDocumentEvents(documentId);
    } catch (error) {
      console.error('Failed to get document audit trail:', error);
      return [];
    }
  }

  /**
   * Get recent audit events for a user
   */
  static async getUserAuditTrail(userId: string, limit: number = 50): Promise<any[]> {
    try {
      return await storage.getUserDocumentEvents(userId, limit);
    } catch (error) {
      console.error('Failed to get user audit trail:', error);
      return [];
    }
  }
}

/**
 * Convenience function for quick logging without instantiating the class
 */
export const logDocumentAction = AuditLogger.logDocumentEvent;

/**
 * Export individual logging functions for easier imports
 */
export const {
  logUpload,
  logDelete, 
  logRename,
  logAIInsight,
  logShare,
  logDownload,
  logView,
  logUpdate,
  logThumbnailAccessRequested,
  logThumbnailWriteCompleted,
  logThumbnailRequested,
  getDocumentAuditTrail,
  getUserAuditTrail,
} = AuditLogger;