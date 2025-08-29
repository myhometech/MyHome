/**
 * CHAT-008: Backfill service to extract facts from existing documents
 * Processes documents that don't have structured facts yet
 */
import { storage } from '../storage';
import { factExtractionService } from './factExtractionService';

export class FactBackfillService {
  private isRunning = false;

  /**
   * Backfill facts for all documents that have extracted text but no facts
   */
  async backfillDocumentFacts(userId?: string, limit = 50): Promise<{
    processed: number;
    succeeded: number; 
    failed: number;
    skipped: number;
  }> {
    if (this.isRunning) {
      throw new Error('Backfill is already running');
    }

    this.isRunning = true;
    const results = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

    try {
      console.log(`🔄 [BACKFILL] Starting fact extraction for existing documents (limit: ${limit})`);

      // Get documents that have extracted text but may not have facts
      const documents = await this.getDocumentsForBackfill(userId, limit);
      console.log(`📄 [BACKFILL] Found ${documents.length} documents to process`);

      for (const doc of documents) {
        results.processed++;
        
        try {
          // Skip if no extracted text
          if (!doc.extractedText || doc.extractedText.length < 20) {
            results.skipped++;
            continue;
          }

          // Check if document already has facts
          const existingFacts = await storage.getDocumentFacts(doc.id, doc.userId);
          if (existingFacts.length > 0) {
            console.log(`⏭️ [BACKFILL] Document ${doc.id} already has ${existingFacts.length} facts, skipping`);
            results.skipped++;
            continue;
          }

          // Extract facts
          const factResults = await factExtractionService.processDocumentFacts(
            doc.id,
            doc.extractedText,
            doc.fileName,
            doc.userId,
            doc.householdId
          );

          if (factResults.factsExtracted > 0) {
            console.log(`✅ [BACKFILL] Document ${doc.id} (${doc.fileName}): extracted ${factResults.factsExtracted} facts`);
            results.succeeded++;
          } else {
            console.log(`⚠️ [BACKFILL] Document ${doc.id} (${doc.fileName}): no facts extracted`);
            results.skipped++;
          }

          // Add small delay to avoid overwhelming the LLM API
          await this.delay(500);

        } catch (error) {
          console.error(`❌ [BACKFILL] Failed to process document ${doc.id}:`, error);
          results.failed++;
        }
      }

      const duration = Math.round((Date.now() - Date.now()) / 1000);
      console.log(`🏁 [BACKFILL] Completed: ${results.succeeded} succeeded, ${results.failed} failed, ${results.skipped} skipped in ${duration}s`);

      return results;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get documents that need fact extraction
   */
  private async getDocumentsForBackfill(userId?: string, limit = 50) {
    try {
      if (userId) {
        // Process documents for specific user
        return await storage.getUserDocuments(userId, 'uploadedAt', { limit });
      } else {
        // Process documents across all users (admin operation)
        // For now, we'll implement per-user processing as it's safer
        throw new Error('Cross-user backfill not implemented - specify userId');
      }
    } catch (error) {
      console.error('Failed to get documents for backfill:', error);
      return [];
    }
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get backfill status
   */
  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}

// Singleton instance
export const factBackfillService = new FactBackfillService();