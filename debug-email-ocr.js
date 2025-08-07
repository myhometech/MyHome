/**
 * Debug Email OCR Processing Issue
 * This script helps identify why email-imported documents aren't getting OCR processed
 */

import { storage } from './server/storage.js';

async function debugEmailOCR() {
  console.log('🔍 DEBUG: Investigating Email OCR Processing Issue');
  console.log('=================================================');
  
  try {
    // Get recent documents uploaded via email
    const recentDocuments = await storage.getAllDocuments('94a7b7f0-3266-4a4f-9d4e-875542d30e62');
    
    console.log(`📄 Found ${recentDocuments.length} total documents for user`);
    
    // Filter for email-imported documents (look for email-imported tag or specific patterns)
    const emailDocuments = recentDocuments.filter(doc => 
      doc.tags?.includes('email-imported') || 
      doc.uploadSource === 'email' ||
      doc.gcsPath?.includes('email-') ||
      doc.fileName?.includes('attachment')
    );
    
    console.log(`📧 Found ${emailDocuments.length} email-imported documents:`);
    
    for (let i = 0; i < Math.min(emailDocuments.length, 10); i++) {
      const doc = emailDocuments[i];
      console.log(`\n📋 Document ${i + 1}: ${doc.fileName} (ID: ${doc.id})`);
      console.log(`   MIME Type: ${doc.mimeType}`);
      console.log(`   File Size: ${doc.fileSize} bytes`);
      console.log(`   Created: ${doc.createdAt}`);
      console.log(`   Tags: ${doc.tags?.join(', ') || 'None'}`);
      console.log(`   GCS Path: ${doc.gcsPath || 'None'}`);
      console.log(`   Extracted Text Length: ${doc.extractedText?.length || 0} characters`);
      console.log(`   Summary: ${doc.summary ? 'Present' : 'Missing'}`);
      console.log(`   Status: ${doc.status || 'Unknown'}`);
      console.log(`   Upload Source: ${doc.uploadSource || 'Unknown'}`);
      
      // Check OCR support
      const supportedMimeTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      const shouldSupportOCR = supportedMimeTypes.includes(doc.mimeType);
      console.log(`   OCR Support: ${shouldSupportOCR ? '✅ YES' : '❌ NO'}`);
      
      if (shouldSupportOCR && (!doc.extractedText || doc.extractedText.length === 0)) {
        console.log(`   🚨 ISSUE: Should have OCR text but missing!`);
      }
    }
    
    // Check OCR queue status
    console.log('\n🔄 Checking OCR Queue Status...');
    try {
      const { ocrQueue } = await import('./server/ocrQueue.js');
      const stats = ocrQueue.getStats();
      console.log('📊 OCR Queue Stats:', JSON.stringify(stats, null, 2));
    } catch (queueError) {
      console.error('❌ Failed to get OCR queue stats:', queueError);
    }
    
    // Test supportsOCR function
    console.log('\n🧪 Testing supportsOCR function...');
    const testMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/msword'
    ];
    
    // Try to import and test the function
    try {
      const ocrService = await import('./server/ocrService.js');
      testMimeTypes.forEach(mimeType => {
        const supports = ocrService.supportsOCR ? ocrService.supportsOCR(mimeType) : 'Function not found';
        console.log(`   ${mimeType}: ${supports}`);
      });
    } catch (importError) {
      console.error('❌ Failed to import OCR service:', importError);
    }
    
    console.log('\n📋 EMAIL OCR DEBUG SUMMARY');
    console.log('==========================');
    console.log(`✅ Total documents: ${recentDocuments.length}`);
    console.log(`📧 Email imports: ${emailDocuments.length}`);
    
    const missingOCR = emailDocuments.filter(doc => {
      const supportedMimeTypes = [
        'application/pdf',
        'image/jpeg', 
        'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      return supportedMimeTypes.includes(doc.mimeType) && 
             (!doc.extractedText || doc.extractedText.length === 0);
    });
    
    console.log(`🚨 Missing OCR: ${missingOCR.length} documents`);
    
    if (missingOCR.length > 0) {
      console.log('\n🔧 RECOMMENDED ACTIONS:');
      console.log('1. Check if OCR queue is processing jobs');
      console.log('2. Verify supportsOCR function includes all MIME types');
      console.log('3. Check if email import OCR jobs are being queued correctly');
      console.log('4. Manual OCR reprocessing may be needed for affected documents');
    }
    
  } catch (error) {
    console.error('❌ Debug script failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run debug
debugEmailOCR().catch(console.error);