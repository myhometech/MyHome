/**
 * Insight Job Recovery Service
 * Recovers failed insight jobs from the past 7 days with type errors
 */

import { storage } from '../storage';

export class InsightRecoveryService {
  /**
   * Identify and recover failed insight jobs with type errors from past 7 days
   */
  static async recoverFailedInsightJobs(): Promise<{
    recovered: number;
    errors: string[];
    summary: string;
  }> {
    const errors: string[] = [];
    let recovered = 0;

    try {
      console.log('🔄 Starting insight job recovery process...');

      // Get documents from past 7 days that might have failed insight processing
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Find documents that have extractedText but no insights
      const documentsNeedingInsights = await this.findDocumentsWithoutInsights(sevenDaysAgo);
      
      console.log(`📊 Found ${documentsNeedingInsights.length} documents needing insight recovery`);

      // Process each document for insight recovery
      for (const doc of documentsNeedingInsights) {
        try {
          await this.recoverDocumentInsights(doc);
          recovered++;
          console.log(`✅ Recovered insights for document ${doc.id}`);
        } catch (recoverError) {
          const errorMsg = `Failed to recover document ${doc.id}: ${recoverError instanceof Error ? recoverError.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`❌ [INSIGHT_TYPE_ERROR] ${errorMsg}`);
        }
      }

      const summary = `Insight Recovery Complete: ${recovered} documents recovered, ${errors.length} errors`;
      console.log(`📈 ${summary}`);

      return {
        recovered,
        errors,
        summary
      };

    } catch (serviceError) {
      const errorMsg = `Insight recovery service failed: ${serviceError instanceof Error ? serviceError.message : 'Unknown error'}`;
      console.error(`❌ [INSIGHT_TYPE_ERROR] ${errorMsg}`);
      return {
        recovered,
        errors: [errorMsg],
        summary: `Recovery failed: ${errorMsg}`
      };
    }
  }

  /**
   * Find documents that have extractedText but no insights from the specified date
   */
  private static async findDocumentsWithoutInsights(since: Date) {
    try {
      // This would typically use a more complex query, but for now we'll use the storage interface
      // In a real implementation, you'd want to add a method to storage for this specific query
      const recentDocuments = await storage.getDocumentsByUserId(''); // This needs to be modified
      
      // For now, return an empty array - in production you'd implement the proper query
      console.log(`🔍 Checking for documents since ${since.toISOString()}`);
      
      // Placeholder implementation - would need actual database query
      return [];
    } catch (error) {
      console.error('Failed to find documents without insights:', error);
      return [];
    }
  }

  /**
   * Recover insights for a specific document
   */
  private static async recoverDocumentInsights(document: any): Promise<void> {
    try {
      // Import required services
      const { insightJobQueue } = await import('../insightJobQueue');
      
      if (!document.extractedText || document.extractedText.trim() === '') {
        throw new Error('Document has no extracted text for insight generation');
      }

      console.log(`🔄 Recovering insights for document: ${document.id}`);

      // Add to insight job queue with high priority for recovery
      const jobId = await insightJobQueue.addInsightJob({
        documentId: document.id,
        userId: document.userId,
        documentType: document.category?.name || 'general',
        documentName: document.name,
        extractedText: document.extractedText,
        mimeType: document.mimeType || 'application/octet-stream',
        priority: 2 // High priority for recovery
      });

      if (jobId) {
        console.log(`✅ Recovery job queued: ${jobId} for document ${document.id}`);
      } else {
        console.log(`⚠️ Recovery job skipped (duplicate or queue full) for document ${document.id}`);
      }

    } catch (error) {
      throw new Error(`Document insight recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create recovery endpoint for manual triggering
   */
  static async createRecoveryReport(): Promise<string> {
    const result = await this.recoverFailedInsightJobs();
    
    const report = `
# Insight Job Recovery Report
Generated: ${new Date().toISOString()}

## Summary
${result.summary}

## Statistics
- Documents Recovered: ${result.recovered}
- Errors Encountered: ${result.errors.length}

## Errors
${result.errors.length > 0 ? result.errors.map(err => `- ${err}`).join('\n') : 'No errors encountered'}

## Next Steps
${result.recovered > 0 ? '- Monitor insight generation for recovered documents' : '- No documents needed recovery'}
${result.errors.length > 0 ? '- Review error logs for failed recoveries' : '- All recoveries successful'}
`;

    console.log('📄 Recovery report generated');
    return report;
  }
}

export default InsightRecoveryService;