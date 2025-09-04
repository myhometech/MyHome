import { db } from "./db";
import { documents, expiryReminders } from "../shared/schema";
import { eq, and, gte, lte, isNull, isNotNull, or } from "drizzle-orm";

// DOC-305: AI-Enhanced Reminder Suggestion Service
export interface ReminderSuggestion {
  documentId: number;
  userId: string;
  documentName: string;
  expiryDate: Date;
  reminderDate: Date;
  source: 'ai' | 'ocr' | 'manual';
  confidence?: number;
  categoryName?: string;
}

export class ReminderSuggestionService {
  private static instance: ReminderSuggestionService;

  private constructor() {}

  public static getInstance(): ReminderSuggestionService {
    if (!ReminderSuggestionService.instance) {
      ReminderSuggestionService.instance = new ReminderSuggestionService();
    }
    return ReminderSuggestionService.instance;
  }

  /**
   * DOC-305: Monitor and create reminder suggestions for documents with expiry dates
   */
  async processDocumentForReminders(
    documentId: number,
    userId: string,
    expiryDate: Date | null,
    categorizationSource?: string
  ): Promise<boolean> {
    if (!expiryDate) {
      console.log(`DOC-305: No expiry date for document ${documentId}, skipping reminder creation`);
      return false;
    }

    const requestId = Math.random().toString(36).substring(2, 8);
    console.log(`[${requestId}] DOC-305: Processing document ${documentId} for reminder suggestions`);

    try {
      // Check if document is within reminder window (14-90 days from now)
      const now = new Date();
      const fourteenDaysFromNow = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));
      const ninetyDaysFromNow = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));

      if (expiryDate < fourteenDaysFromNow || expiryDate > ninetyDaysFromNow) {
        console.log(`[${requestId}] DOC-305: Document expiry date ${expiryDate.toISOString().split('T')[0]} outside reminder window (14-90 days), skipping`);
        return false;
      }

      // Check if reminder already exists for this document
      const existingReminder = await db
        .select()
        .from(expiryReminders)
        .where(
          and(
            eq(expiryReminders.documentId, documentId),
            eq(expiryReminders.userId, userId),
            or(
              eq(expiryReminders.status, 'pending'),
              eq(expiryReminders.status, 'confirmed')
            )
          )
        )
        .limit(1);

      if (existingReminder.length > 0) {
        console.log(`[${requestId}] DOC-305: Reminder already exists for document ${documentId}, skipping`);
        return false;
      }

      // Get document details for reminder creation
      const document = await db
        .select({
          name: documents.name,
          fileName: documents.fileName,
          categoryId: documents.categoryId
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (document.length === 0) {
        console.warn(`[${requestId}] DOC-305: Document ${documentId} not found`);
        return false;
      }

      const docData = document[0];

      // Calculate reminder date (7 days before expiry by default)
      const reminderDate = new Date(expiryDate.getTime() - (7 * 24 * 60 * 60 * 1000));
      
      // Ensure reminder date is not in the past
      const effectiveReminderDate = reminderDate > now ? reminderDate : new Date(now.getTime() + (24 * 60 * 60 * 1000)); // Tomorrow if calculated date is past

      // Determine source based on categorization
      const source = this.mapCategorizationSourceToReminderSource(categorizationSource);

      // Create reminder suggestion
      const reminderData = {
        userId,
        documentId,
        title: `Upcoming Document Expiry: ${docData.name}`,
        description: `Document "${docData.fileName}" expires on ${expiryDate.toISOString().split('T')[0]}. Please review and take necessary action.`,
        expiryDate,
        reminderDate: effectiveReminderDate,
        category: this.inferCategoryFromDocument(docData.name, docData.fileName),
        source,
        status: 'pending' as const,
        isCompleted: false
      };

      await db.insert(expiryReminders).values(reminderData);

      console.log(`[${requestId}] DOC-305: Created reminder suggestion for document ${documentId}:`);
      console.log(`  - Document: ${docData.name}`);
      console.log(`  - Expiry: ${expiryDate.toISOString().split('T')[0]}`);
      console.log(`  - Reminder: ${effectiveReminderDate.toISOString().split('T')[0]}`);
      console.log(`  - Source: ${source}`);

      return true;

    } catch (error) {
      console.error(`[${requestId}] DOC-305: Failed to create reminder suggestion for document ${documentId}:`, error);
      return false;
    }
  }

  /**
   * DOC-305: Batch process multiple documents for reminder suggestions
   */
  async batchProcessDocuments(userId: string): Promise<{ processed: number; created: number }> {
    const requestId = Math.random().toString(36).substring(2, 8);
    console.log(`[${requestId}] DOC-305: Starting batch reminder processing for user ${userId}`);

    try {
      // Get all documents with expiry dates that don't have reminders
      const documentsWithExpiry = await db
        .select({
          id: documents.id,
          userId: documents.userId,
          name: documents.name,
          fileName: documents.fileName,
          expiryDate: documents.expiryDate,
          categorizationSource: documents.categorizationSource
        })
        .from(documents)
        .where(
          and(
            eq(documents.userId, userId),
            isNotNull(documents.expiryDate)
          )
        );

      let processed = 0;
      let created = 0;

      for (const doc of documentsWithExpiry) {
        if (doc.expiryDate) {
          processed++;
          const wasCreated = await this.processDocumentForReminders(
            doc.id,
            doc.userId,
            doc.expiryDate,
            doc.categorizationSource || undefined
          );
          if (wasCreated) created++;
        }
      }

      console.log(`[${requestId}] DOC-305: Batch processing complete - processed: ${processed}, created: ${created}`);
      return { processed, created };

    } catch (error) {
      console.error(`[${requestId}] DOC-305: Batch processing failed:`, error);
      throw error;
    }
  }

  /**
   * DOC-305: Get pending reminder suggestions for a user
   */
  async getPendingReminderSuggestions(userId: string): Promise<ReminderSuggestion[]> {
    try {
      const reminders = await db
        .select({
          id: expiryReminders.id,
          documentId: expiryReminders.documentId,
          title: expiryReminders.title,
          description: expiryReminders.description,
          expiryDate: expiryReminders.expiryDate,
          reminderDate: expiryReminders.reminderDate,
          source: expiryReminders.source,
          status: expiryReminders.status,
          documentName: documents.name,
          documentFileName: documents.fileName
        })
        .from(expiryReminders)
        .leftJoin(documents, eq(expiryReminders.documentId, documents.id))
        .where(
          and(
            eq(expiryReminders.userId, userId),
            eq(expiryReminders.status, 'pending'),
            isNotNull(expiryReminders.documentId) // Only document-linked reminders
          )
        )
        .orderBy(expiryReminders.reminderDate);

      return reminders.map(r => ({
        documentId: r.documentId!,
        userId,
        documentName: r.documentName || r.documentFileName || 'Unknown Document',
        expiryDate: r.expiryDate,
        reminderDate: r.reminderDate,
        source: r.source as 'ai' | 'ocr' | 'manual'
      }));
    } catch (error) {
      console.error('DOC-305: Failed to get pending reminder suggestions:', error);
      return [];
    }
  }

  /**
   * DOC-305: Confirm or dismiss a reminder suggestion
   */
  async updateReminderStatus(
    reminderId: number, 
    userId: string, 
    status: 'confirmed' | 'dismissed'
  ): Promise<boolean> {
    try {
      const result = await db
        .update(expiryReminders)
        .set({ 
          status, 
          updatedAt: new Date() 
        })
        .where(
          and(
            eq(expiryReminders.id, reminderId),
            eq(expiryReminders.userId, userId)
          )
        );

      console.log(`DOC-305: Updated reminder ${reminderId} status to ${status}`);
      return true;
    } catch (error) {
      console.error(`DOC-305: Failed to update reminder ${reminderId} status:`, error);
      return false;
    }
  }

  /**
   * Map categorization source to reminder source
   */
  private mapCategorizationSourceToReminderSource(categorizationSource?: string): 'ai' | 'ocr' | 'manual' {
    if (!categorizationSource) return 'manual';
    
    switch (categorizationSource.toLowerCase()) {
      case 'ai':
        return 'ai';
      case 'rules':
      case 'ocr':
        return 'ocr';
      default:
        return 'manual';
    }
  }

  /**
   * Infer category from document name and filename
   */
  private inferCategoryFromDocument(name: string, fileName: string): string {
    const text = `${name} ${fileName}`.toLowerCase();
    
    if (text.includes('insurance') || text.includes('policy')) return 'insurance';
    if (text.includes('license') || text.includes('permit')) return 'license';
    if (text.includes('contract') || text.includes('agreement')) return 'contract';
    if (text.includes('subscription') || text.includes('membership')) return 'subscription';
    if (text.includes('warranty') || text.includes('guarantee')) return 'warranty';
    if (text.includes('tax') || text.includes('1099') || text.includes('w2')) return 'tax';
    if (text.includes('medical') || text.includes('health')) return 'medical';
    
    return 'other';
  }
}

// Export singleton instance
export const reminderSuggestionService = ReminderSuggestionService.getInstance();