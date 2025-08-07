/**
 * Reprocess Email Documents Script
 * Finds and reprocesses documents that were uploaded via email but missed OCR processing
 */

import { storage } from './server/storage.js';

async function reprocessEmailDocuments() {
  console.log('🔧 EMAIL DOCUMENT REPROCESSING UTILITY');
  console.log('=====================================');
  
  const userId = '94a7b7f0-3266-4a4f-9d4e-875542d30e62'; // Your user ID
  
  try {
    // Get all documents for the user
    const allDocuments = await storage.getAllDocuments(userId);
    console.log(`📄 Found ${allDocuments.length} total documents`);
    
    // Find email-imported documents missing OCR
    const emailDocuments = allDocuments.filter(doc => 
      (doc.tags?.includes('email-imported') || 
       doc.uploadSource === 'email' ||
       doc.gcsPath?.includes('email-')) &&
      (!doc.extractedText || doc.extractedText.length < 10) // Missing or minimal text
    );
    
    console.log(`📧 Found ${emailDocuments.length} email documents needing OCR reprocessing`);
    
    if (emailDocuments.length === 0) {
      console.log('✅ No documents need reprocessing!');
      return;
    }
    
    // Group by file type for better reporting
    const docsByType = {};
    emailDocuments.forEach(doc => {
      const type = doc.mimeType;
      if (!docsByType[type]) docsByType[type] = [];
      docsByType[type].push(doc);
    });
    
    console.log('\n📊 Documents to reprocess by type:');
    Object.entries(docsByType).forEach(([type, docs]) => {
      console.log(`  ${type}: ${docs.length} documents`);
    });
    
    // Import OCR queue for reprocessing
    const { ocrQueue } = await import('./server/ocrQueue.js');
    
    let reprocessed = 0;
    let skipped = 0;
    
    for (const doc of emailDocuments) {
      try {
        console.log(`\n🔄 Reprocessing: ${doc.fileName} (ID: ${doc.id})`);
        console.log(`   Type: ${doc.mimeType}`);
        console.log(`   Size: ${Math.round(doc.fileSize / 1024)}KB`);
        console.log(`   Created: ${doc.createdAt}`);
        
        // Check if file supports OCR with the updated function
        const { supportsOCR } = await import('./server/ocrService.js');
        
        if (!supportsOCR(doc.mimeType)) {
          console.log(`   ⏭️ SKIPPED: File type ${doc.mimeType} doesn't support OCR`);
          skipped++;
          continue;
        }
        
        // Queue OCR job for reprocessing
        await ocrQueue.addJob({
          documentId: doc.id,
          fileName: doc.fileName,
          filePathOrGCSKey: doc.gcsPath || doc.filePath,
          mimeType: doc.mimeType,
          userId: userId,
          priority: 2, // Medium priority for reprocessing
          isEmailImport: true // Flag for email import reprocessing
        });
        
        console.log(`   ✅ QUEUED: OCR job added for document ${doc.id}`);
        reprocessed++;
        
        // Add a small delay to prevent overwhelming the queue
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`   ❌ ERROR: Failed to reprocess ${doc.fileName}:`, error.message);
        skipped++;
      }
    }
    
    console.log('\n📋 REPROCESSING SUMMARY');
    console.log('=======================');
    console.log(`✅ Queued for reprocessing: ${reprocessed} documents`);
    console.log(`⏭️ Skipped: ${skipped} documents`);
    console.log(`📊 Total processed: ${emailDocuments.length} documents`);
    
    if (reprocessed > 0) {
      console.log('\n⏰ Processing Timeline:');
      console.log('- OCR jobs are now queued and will process automatically');
      console.log('- Each document takes 10-30 seconds to process');  
      console.log('- Check back in 5-10 minutes for completed results');
      console.log('- AI insights will generate after OCR completes');
      
      console.log('\n🔍 Monitoring:');
      console.log('- Watch server logs for OCR processing messages');
      console.log('- Documents will show extracted text when complete');
      console.log('- AI insights will appear in the dashboard');
    }
    
  } catch (error) {
    console.error('❌ Reprocessing script failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the reprocessing
reprocessEmailDocuments().catch(console.error);