#!/usr/bin/env tsx
/**
 * THMB-1: Backfill sourceHash for existing documents
 * 
 * This script computes and stores sourceHash for all existing documents
 * that don't have a sourceHash value. It reads the stored file content
 * from GCS or local storage and computes the SHA256 hash.
 */

import { storage } from '../server/storage';
import { StorageService } from '../server/storage/StorageService';
import { HashingService } from '../server/hashingService';
import fs from 'fs';

interface BackfillStats {
  totalDocuments: number;
  documentsNeedingBackfill: number;
  successfulBackfills: number;
  failedBackfills: number;
  skippedDocuments: number;
  errors: Array<{ documentId: number; error: string }>;
}

async function backfillSourceHashes(): Promise<BackfillStats> {
  const stats: BackfillStats = {
    totalDocuments: 0,
    documentsNeedingBackfill: 0,
    successfulBackfills: 0,
    failedBackfills: 0,
    skippedDocuments: 0,
    errors: []
  };

  try {
    console.log('🔍 THMB-1: Starting sourceHash backfill for existing documents...');

    // Get all documents from database using raw SQL
    const { sql } = await import('drizzle-orm');
    const db = (storage as any).db; // Access underlying Drizzle database
    
    const allDocuments = await db.execute(sql`
      SELECT id, user_id, file_name, file_path, gcs_path, source_hash, mime_type
      FROM documents 
      ORDER BY id ASC
    `);
    
    const documents = allDocuments.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      fileName: row.file_name,
      filePath: row.file_path,
      gcsPath: row.gcs_path,
      sourceHash: row.source_hash,
      mimeType: row.mime_type
    }));
    
    stats.totalDocuments = documents.length;
    console.log(`📊 Found ${stats.totalDocuments} total documents`);

    const documentsNeedingBackfill = documents.filter(doc => !doc.sourceHash);
    stats.documentsNeedingBackfill = documentsNeedingBackfill.length;
    
    console.log(`🔨 ${stats.documentsNeedingBackfill} documents need sourceHash backfill`);

    if (stats.documentsNeedingBackfill === 0) {
      console.log('✅ All documents already have sourceHash values');
      return stats;
    }

    const storageService = StorageService.initialize();

    for (const document of documentsNeedingBackfill) {
      try {
        console.log(`🔐 Processing document ${document.id}: ${document.fileName}`);

        let fileBuffer: Buffer;

        // Try to read from GCS first, then fallback to local storage
        if (document.gcsPath) {
          try {
            console.log(`  📁 Reading from GCS: ${document.gcsPath}`);
            fileBuffer = await storageService.downloadBuffer(document.gcsPath);
          } catch (gcsError) {
            console.log(`  ⚠️ GCS read failed, trying local storage: ${gcsError}`);
            if (document.filePath && fs.existsSync(document.filePath)) {
              fileBuffer = await fs.promises.readFile(document.filePath);
            } else {
              throw new Error('File not found in GCS or local storage');
            }
          }
        } else if (document.filePath && fs.existsSync(document.filePath)) {
          console.log(`  📁 Reading from local storage: ${document.filePath}`);
          fileBuffer = await fs.promises.readFile(document.filePath);
        } else {
          throw new Error('No valid file path found');
        }

        // Compute sourceHash
        const sourceHash = HashingService.computeSourceHash(fileBuffer);
        console.log(`  🔐 Computed sourceHash: ${sourceHash}`);

        // Update document with sourceHash
        await storage.updateDocument(document.id, 'system', { sourceHash });

        stats.successfulBackfills++;
        console.log(`  ✅ Updated document ${document.id} with sourceHash`);

      } catch (error: any) {
        console.error(`  ❌ Failed to process document ${document.id}: ${error.message}`);
        stats.failedBackfills++;
        stats.errors.push({
          documentId: document.id,
          error: error.message
        });
      }
    }

    stats.skippedDocuments = stats.totalDocuments - stats.documentsNeedingBackfill;

    console.log('\n📊 THMB-1: Backfill completed with results:');
    console.log(`  Total documents: ${stats.totalDocuments}`);
    console.log(`  Documents needing backfill: ${stats.documentsNeedingBackfill}`);
    console.log(`  Successful backfills: ${stats.successfulBackfills}`);
    console.log(`  Failed backfills: ${stats.failedBackfills}`);
    console.log(`  Skipped documents: ${stats.skippedDocuments}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      stats.errors.forEach(error => {
        console.log(`  Document ${error.documentId}: ${error.error}`);
      });
    }

    return stats;

  } catch (error: any) {
    console.error('💥 Fatal error during backfill:', error);
    throw error;
  }
}

// Run the backfill if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillSourceHashes()
    .then(stats => {
      if (stats.failedBackfills === 0) {
        console.log('\n🎉 THMB-1: sourceHash backfill completed successfully!');
        process.exit(0);
      } else {
        console.log(`\n⚠️ THMB-1: sourceHash backfill completed with ${stats.failedBackfills} failures`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 THMB-1: sourceHash backfill failed:', error);
      process.exit(1);
    });
}

export { backfillSourceHashes };