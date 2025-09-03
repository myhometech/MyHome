#!/usr/bin/env node

/**
 * THMB-5: Thumbnail Backfill Script
 * 
 * Batch script to enqueue thumbnail generation for documents created/updated 
 * in the last N days. Rate-limited to avoid overwhelming the queue.
 * 
 * Usage:
 *   node scripts/backfill-thumbnails.js --days 30
 *   node scripts/backfill-thumbnails.js --days 7 --limit 100
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Parse command line arguments
const args = process.argv.slice(2);
const daysFlag = args.indexOf('--days');
const limitFlag = args.indexOf('--limit');

const daysAgo = daysFlag !== -1 ? parseInt(args[daysFlag + 1]) : 30;
const batchLimit = limitFlag !== -1 ? parseInt(args[limitFlag + 1]) : 1000;

if (isNaN(daysAgo) || daysAgo <= 0) {
  console.error('❌ Invalid --days parameter. Must be a positive number.');
  process.exit(1);
}

if (isNaN(batchLimit) || batchLimit <= 0) {
  console.error('❌ Invalid --limit parameter. Must be a positive number.');
  process.exit(1);
}

console.log(`🔄 [THMB-5] Starting thumbnail backfill for documents from last ${daysAgo} days (limit: ${batchLimit})`);

async function runBackfill() {
  try {
    // Import modules after startup
    const { storage } = await import('../server/storage.js');
    const { thumbnailJobQueue } = await import('../server/thumbnailJobQueue.js');
    const { checkThumbnailExists } = await import('../server/thumbnailExistenceMiddleware.js');
    
    // Calculate date threshold
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
    
    console.log(`📅 Fetching documents created/updated since: ${cutoffDate.toISOString()}`);
    
    // Get all documents within date range
    const documents = await storage.getDocumentsForBackfill(cutoffDate, batchLimit);
    
    console.log(`📊 Found ${documents.length} documents to process`);
    
    if (documents.length === 0) {
      console.log('✅ No documents found in the specified date range');
      return;
    }
    
    let processed = 0;
    let skipped = 0;
    let enqueued = 0;
    
    // Rate limiting: 10 jobs per second
    const JOBS_PER_SECOND = 10;
    const DELAY_MS = 1000 / JOBS_PER_SECOND;
    
    for (const doc of documents) {
      try {
        // Skip documents without source hash
        if (!doc.sourceHash) {
          console.log(`⚠️ Skipping document ${doc.id}: no source hash`);
          skipped++;
          continue;
        }
        
        // Check if any thumbnails are missing for this document
        const variants = [96, 240, 480];
        const missingVariants = [];
        
        for (const variant of variants) {
          const exists = await checkThumbnailExists(doc.id, variant, doc.sourceHash);
          if (!exists.exists) {
            missingVariants.push(variant);
          }
        }
        
        if (missingVariants.length === 0) {
          console.log(`✅ Document ${doc.id}: all thumbnails exist`);
          skipped++;
        } else {
          // Enqueue job for missing variants
          console.log(`📋 Document ${doc.id}: enqueueing ${missingVariants.join(', ')}px variants`);
          
          const userHousehold = await storage.getUserHousehold(doc.userId);
          
          await thumbnailJobQueue.enqueueJob({
            documentId: doc.id,
            sourceHash: doc.sourceHash,
            variants: missingVariants,
            mimeType: doc.mimeType || 'application/octet-stream',
            userId: doc.userId,
            householdId: userHousehold?.id
          });
          
          enqueued++;
        }
        
        processed++;
        
        // Progress logging
        if (processed % 50 === 0) {
          console.log(`📈 Progress: ${processed}/${documents.length} processed, ${enqueued} enqueued, ${skipped} skipped`);
        }
        
        // Rate limiting delay
        if (processed < documents.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
        
      } catch (docError) {
        console.error(`❌ Error processing document ${doc.id}:`, docError);
        processed++;
      }
    }
    
    console.log(`🎉 Backfill complete!`);
    console.log(`📊 Summary: ${processed} processed, ${enqueued} enqueued, ${skipped} skipped`);
    
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

// Run the backfill
runBackfill()
  .then(() => {
    console.log('✅ Backfill script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Backfill script failed:', error);
    process.exit(1);
  });