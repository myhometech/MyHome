/**
 * Trigger Email OCR Reprocessing
 * Direct API approach to queue OCR jobs for email documents that missed processing
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';
const USER_ID = '94a7b7f0-3266-4a4f-9d4e-875542d30e62';

// Documents identified from the database query
const EMAIL_DOCUMENTS_TO_REPROCESS = [
  // Add document IDs here after running the SQL query
];

async function triggerEmailOCRReprocessing() {
  console.log('🔧 EMAIL OCR REPROCESSING - API TRIGGER');
  console.log('=======================================');
  
  if (EMAIL_DOCUMENTS_TO_REPROCESS.length === 0) {
    console.log('📋 Manual Approach Required:');
    console.log('1. Check the SQL query results for documents needing reprocessing');
    console.log('2. Add document IDs to the EMAIL_DOCUMENTS_TO_REPROCESS array');
    console.log('3. Re-run this script');
    console.log('');
    console.log('🔍 Alternative: Check the application dashboard for documents missing insights');
    return;
  }
  
  let reprocessed = 0;
  let failed = 0;
  
  for (const documentId of EMAIL_DOCUMENTS_TO_REPROCESS) {
    try {
      console.log(`\n🔄 Triggering OCR for document ID: ${documentId}`);
      
      const response = await fetch(`${BASE_URL}/api/documents/${documentId}/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add auth headers if needed
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ SUCCESS: OCR triggered for document ${documentId}`);
        console.log(`   Extracted text length: ${result.extractedText?.length || 0} characters`);
        reprocessed++;
      } else {
        const error = await response.text();
        console.log(`❌ FAILED: Document ${documentId} - ${response.status} ${response.statusText}`);
        console.log(`   Error: ${error}`);
        failed++;
      }
      
      // Small delay to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ ERROR: Document ${documentId}:`, error.message);
      failed++;
    }
  }
  
  console.log('\n📋 REPROCESSING SUMMARY');
  console.log('=======================');
  console.log(`✅ Successfully reprocessed: ${reprocessed} documents`);
  console.log(`❌ Failed to reprocess: ${failed} documents`);
  console.log(`📊 Total attempted: ${EMAIL_DOCUMENTS_TO_REPROCESS.length} documents`);
  
  if (reprocessed > 0) {
    console.log('\n🎯 What happens next:');
    console.log('- OCR processing has been triggered for these documents');
    console.log('- Text extraction will complete in 10-30 seconds per document');
    console.log('- AI insights will be generated automatically after OCR');
    console.log('- Check your dashboard in a few minutes for updated content');
  }
}

// Manual trigger approach
console.log('🎯 READY TO REPROCESS EMAIL DOCUMENTS');
console.log('=====================================');
console.log('');
console.log('📝 INSTRUCTIONS:');
console.log('1. First, run the SQL query to identify email documents needing OCR');
console.log('2. Add the document IDs to the EMAIL_DOCUMENTS_TO_REPROCESS array');
console.log('3. Run this script to trigger OCR reprocessing');
console.log('');
console.log('🔍 The SQL query identified email documents that:');
console.log('- Were uploaded via email (tags include "email-imported")');
console.log('- Support OCR processing (PDF, images, DOCX files)');
console.log('- Have missing or minimal extracted text');
console.log('');

// Run the reprocessing
if (require.main === module) {
  triggerEmailOCRReprocessing().catch(console.error);
}