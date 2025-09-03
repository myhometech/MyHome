#!/usr/bin/env node

/**
 * HOTFIX: Backfill sourceHash for documents missing this critical field
 * This fixes the thumbnail outage by ensuring all documents have proper sourceHash
 */

import { storage } from '../server/storage.ts';
import crypto from 'crypto';

async function backfillSourceHashes() {
  console.log('🚨 HOTFIX: Starting sourceHash backfill for thumbnail outage...');
  
  try {
    // Get all documents missing sourceHash
    const documents = await storage.getAllDocumentsWithoutSourceHash();
    console.log(`📋 Found ${documents.length} documents missing sourceHash`);
    
    if (documents.length === 0) {
      console.log('✅ All documents already have sourceHash - no backfill needed');
      return;
    }
    
    let processed = 0;
    let errors = 0;
    
    for (const doc of documents) {
      try {
        // Generate consistent hash based on file path and metadata
        const hashInput = `${doc.filePath}:${doc.createdAt || doc.updatedAt || Date.now()}:${doc.name}`;
        const sourceHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
        
        // Update document with sourceHash
        await storage.updateDocumentSourceHash(doc.id, sourceHash);
        console.log(`✅ Updated doc ${doc.id} (${doc.name}) with sourceHash: ${sourceHash}`);
        processed++;
        
        // Rate limit to prevent database overload
        if (processed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`❌ Failed to update doc ${doc.id}: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`🎯 HOTFIX COMPLETE: ${processed} documents fixed, ${errors} errors`);
    
    if (errors > 0) {
      console.warn(`⚠️ ${errors} documents failed - may need manual intervention`);
      process.exit(1);
    } else {
      console.log('✅ All documents now have sourceHash - thumbnails should work!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('💥 HOTFIX FAILED:', error);
    process.exit(1);
  }
}

backfillSourceHashes().catch(console.error);