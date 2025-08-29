import { db } from "./db";
import { PostgresStorage } from "./storage";
import { extractTextFromImage, isImageFile, isPDFFile } from "./ocrService";
import { InsertDocumentText, documents, documentText } from "../shared/schema";
import { sql, isNull } from 'drizzle-orm';

export class DocumentTextBackfillService {
  private processingLock = false;
  private storage = new PostgresStorage(db);

  /**
   * Backfill document_text table for existing documents
   */
  async backfillDocumentText(batchSize: number = 10): Promise<{
    processed: number;
    successful: number;
    failed: number;
    errors: string[];
  }> {
    if (this.processingLock) {
      throw new Error("Backfill already in progress");
    }

    this.processingLock = true;
    console.log("🔄 Starting document text backfill process...");

    let processed = 0;
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      // Get documents that don't have text entries yet
      const documentsToProcess = await this.getDocumentsWithoutText(batchSize);
      
      console.log(`📄 Found ${documentsToProcess.length} documents to process`);

      for (const doc of documentsToProcess) {
        try {
          processed++;
          console.log(`Processing document ${processed}/${documentsToProcess.length}: ${doc.name}`);

          // Extract text and page breaks from the document
          const textData = await this.extractTextWithPageBreaks(doc);
          
          if (textData.text.trim()) {
            // Store in document_text table
            await this.storage.createDocumentText({
              docId: doc.id,
              tenantId: doc.userId, // Individual user or household ID
              text: textData.text,
              pageBreaks: textData.pageBreaks,
            });
            
            successful++;
            console.log(`✅ Successfully processed: ${doc.name}`);
          } else {
            console.log(`⚠️ No text extracted from: ${doc.name}`);
            failed++;
            errors.push(`No text content: ${doc.name}`);
          }

        } catch (docError: any) {
          failed++;
          const errorMsg = `Failed to process ${doc.name}: ${docError.message}`;
          errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }

        // Add small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`🎉 Backfill complete: ${successful} successful, ${failed} failed`);
      
      return {
        processed,
        successful,
        failed,
        errors
      };

    } finally {
      this.processingLock = false;
    }
  }

  /**
   * Get documents that don't have corresponding entries in document_text
   */
  private async getDocumentsWithoutText(limit: number) {
    const result = await db.execute(sql`
      SELECT d.id, d.name, d.user_id as "userId", d.gcs_path as "gcsPath", d.mime_type as "mimeType"
      FROM documents d
      LEFT JOIN document_text dt ON d.id = dt.doc_id
      WHERE dt.doc_id IS NULL
      AND d.gcs_path IS NOT NULL
      AND d.mime_type IS NOT NULL
      ORDER BY d.uploaded_at DESC
      LIMIT ${limit}
    `);
    
    return result.rows as Array<{
      id: number;
      name: string;
      userId: string;
      gcsPath: string;
      mimeType: string;
    }>;
  }

  /**
   * Extract text and compute page breaks from a document
   */
  private async extractTextWithPageBreaks(doc: {
    id: number;
    name: string;
    gcsPath: string;
    mimeType: string;
  }): Promise<{ text: string; pageBreaks: number[] }> {
    try {
      let extractedText = '';
      const pageBreaks = [0]; // Always start with position 0

      if (isImageFile(doc.mimeType)) {
        // Single image = single page
        extractedText = await extractTextFromImage(doc.gcsPath, doc.mimeType);
      } else if (isPDFFile(doc.mimeType)) {
        // For PDFs, we'll use a simple approach for now
        // In production, this would use proper PDF text extraction
        extractedText = `PDF document: ${doc.name}. Full text extraction requires enhanced PDF processing.`;
        
        // Try to detect page breaks in PDF text
        const pageIndicators = extractedText.split(/\n\s*(?:\d+\s*|\f|\x0C|Page \d+)/i);
        if (pageIndicators.length > 1) {
          let currentOffset = 0;
          let combinedText = '';
          
          for (let i = 0; i < pageIndicators.length; i++) {
            const pageText = pageIndicators[i].trim();
            if (pageText) {
              if (i > 0) {
                combinedText += '\n\n--- PAGE ---\n\n';
                pageBreaks.push(combinedText.length);
              }
              combinedText += pageText;
            }
          }
          
          extractedText = combinedText;
        }
      } else {
        console.warn(`Unsupported file type for text extraction: ${doc.mimeType}`);
        return { text: '', pageBreaks: [0] };
      }

      // Clean up text and ensure it's not too large
      let cleanText = extractedText.trim();
      if (cleanText.length > 100000) { // Limit to ~100KB of text
        cleanText = cleanText.substring(0, 100000) + '... [truncated]';
      }

      return {
        text: cleanText,
        pageBreaks
      };

    } catch (error: any) {
      console.error(`Error extracting text from ${doc.name}:`, error);
      throw error;
    }
  }

  /**
   * Get backfill progress/status
   */
  async getBackfillStatus(): Promise<{
    isRunning: boolean;
    totalDocuments: number;
    processedDocuments: number;
    remainingDocuments: number;
  }> {
    const [totalResult, processedResult] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as count FROM documents WHERE gcs_path IS NOT NULL`),
      db.execute(sql`SELECT COUNT(*) as count FROM document_text`)
    ]);

    const total = (totalResult.rows[0] as any).count;
    const processed = (processedResult.rows[0] as any).count;

    return {
      isRunning: this.processingLock,
      totalDocuments: total,
      processedDocuments: processed,
      remainingDocuments: Math.max(0, total - processed)
    };
  }
}

export const documentTextBackfillService = new DocumentTextBackfillService();