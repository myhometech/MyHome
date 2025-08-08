
/**
 * Reprocess Email Documents with OCR and Insights
 * Finds email documents that missed OCR processing and queues them
 */

const { storage } = require('./server/storage.ts');
const { ocrQueue } = require('./server/ocrQueue.ts');
const { supportsOCR } = require('./server/ocrService.ts');

async function reprocessEmailDocuments() {
  console.log('🔧 EMAIL DOCUMENT OCR REPROCESSING');
  console.log('==================================');
  
  try {
    // Get all documents with email upload source or email tags
    console.log('📄 Searching for email documents...');
    
    const allDocuments = await storage.getAllDocuments();
    
    // Filter for email documents that need OCR
    const emailDocuments = allDocuments.filter(doc => 
      (doc.uploadSource === 'email' || 
       doc.tags?.includes('email-attachment') ||
       doc.tags?.includes('email-imported') ||
       doc.gcsPath?.includes('email/')) &&
      (!doc.extractedText || doc.extractedText.length < 50) && // Minimal or missing text
      supportsOCR(doc.mimeType) // Supports OCR processing
    );
    
    console.log(`📧 Found ${emailDocuments.length} email documents needing OCR reprocessing`);
    
    if (emailDocuments.length === 0) {
      console.log('✅ No email documents need reprocessing!');
      return;
    }
    
    // Group by file type for reporting
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
    
    let reprocessed = 0;
    let skipped = 0;
    
    console.log('\n🔄 Starting reprocessing...');
    
    for (const doc of emailDocuments) {
      try {
        console.log(`\n📄 Processing: ${doc.fileName} (ID: ${doc.id})`);
        console.log(`   Type: ${doc.mimeType}`);
        console.log(`   Size: ${Math.round(doc.fileSize / 1024)}KB`);
        console.log(`   User: ${doc.userId}`);
        
        // Queue OCR job for reprocessing
        await ocrQueue.addJob({
          documentId: doc.id,
          fileName: doc.fileName,
          filePathOrGCSKey: doc.gcsPath || doc.filePath,
          mimeType: doc.mimeType,
          userId: doc.userId,
          priority: 2, // Medium priority for reprocessing
          isEmailImport: true // Flag for email import reprocessing
        });
        
        console.log(`   ✅ QUEUED: OCR job added for document ${doc.id}`);
        reprocessed++;
        
        // Small delay to prevent overwhelming the queue
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`   ❌ ERROR: Failed to reprocess ${doc.fileName}:`, error.message);
        skipped++;
      }
    }
    
    console.log('\n📋 REPROCESSING SUMMARY');
    console.log('=======================');
    console.log(`✅ Successfully queued: ${reprocessed} documents`);
    console.log(`❌ Failed to queue: ${skipped} documents`);
    console.log(`📊 Total processed: ${emailDocuments.length} documents`);
    
    if (reprocessed > 0) {
      console.log('\n🎯 What happens next:');
      console.log('- OCR jobs will process in the background');
      console.log('- Text will be extracted from documents');
      console.log('- AI insights will be generated after OCR completes');
      console.log('- Check your dashboard in a few minutes for updates');
      console.log('\n💡 Monitor progress with: grep "OCR job completed" logs');
    }
    
  } catch (error) {
    console.error('❌ Reprocessing failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the reprocessing
reprocessEmailDocuments().then(() => {
  console.log('\n🏁 Email document reprocessing script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
