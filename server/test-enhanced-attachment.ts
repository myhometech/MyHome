#!/usr/bin/env tsx
/**
 * TICKET 3: Test script for Enhanced Attachment Classification & Routing
 * Tests the new system that preserves originals while converting non-PDFs to PDF
 */

import { enhancedAttachmentProcessor } from './enhancedAttachmentProcessor.js';
import { attachmentClassificationService } from './attachmentClassificationService.js';
import type { AttachmentData } from './attachmentClassificationService.js';

// Mock attachment data for testing
const testAttachments: AttachmentData[] = [
  {
    filename: 'invoice.pdf',
    content: 'JVBERi0xLjQKJeLjz9MKMSAwIG9iag==', // Sample PDF header
    contentType: 'application/pdf',
    size: 2048
  },
  {
    filename: 'contract.docx',
    content: 'UEsDBBQABgAIAAAAIQC7AZkAOgE=', // Sample DOCX header
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 15000
  },
  {
    filename: 'photo.jpg',
    content: '/9j/4AAQSkZJRgABAQEAYABgAAD/', // Sample JPEG header
    contentType: 'image/jpeg',
    size: 500000
  },
  {
    filename: 'large_file.png',
    content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    contentType: 'image/png',
    size: 12000000 // 12MB - should be rejected
  },
  {
    filename: 'malware.exe',
    content: 'TVqQAAMAAAAEAAAA//8AALgA',
    contentType: 'application/x-msdownload',
    size: 1024
  }
];

const testEmailMetadata = {
  from: 'test@example.com',
  subject: 'Test Email with Attachments',
  messageId: 'test-message-123',
  timestamp: new Date().toISOString()
};

async function runTests() {
  console.log('🧪 TICKET 3: Testing Enhanced Attachment Classification & Routing');
  console.log('==============================================================\n');

  // Test 1: Classification Service
  console.log('📋 Test 1: Attachment Classification');
  for (const attachment of testAttachments) {
    const classification = attachmentClassificationService.classifyAttachment(attachment);
    console.log(`  ${attachment.filename} (${attachment.contentType})`);
    console.log(`    → Classification: ${classification.type}`);
    console.log(`    → Needs conversion: ${classification.needsConversion}`);
    console.log(`    → Size valid: ${classification.sizeValid}`);
    console.log(`    → Supported: ${classification.supported}\n`);
  }

  // Test 2: Routing Logic
  console.log('🔀 Test 2: Processing Routes');
  for (const attachment of testAttachments) {
    const route = attachmentClassificationService.determineProcessingRoute(attachment);
    console.log(`  ${attachment.filename}`);
    console.log(`    → Route: ${route.action}`);
    console.log(`    → Reason: ${route.reason}`);
    if (route.conversionStatus) {
      console.log(`    → Conversion status: ${route.conversionStatus}`);
    }
    console.log('');
  }

  // Test 3: Full Processing (with mock userId)
  console.log('⚙️ Test 3: Full Enhanced Processing Pipeline');
  try {
    const results = await enhancedAttachmentProcessor.processEmailAttachments(
      testAttachments.slice(0, 3), // Skip large file and malware for this test
      'test-user-123',
      testEmailMetadata
    );

    console.log(`\n✅ Processing Results:`);
    console.log(`  Total processed: ${results.length}`);
    results.forEach((result, index) => {
      console.log(`\n  ${index + 1}. ${result.filename}`);
      console.log(`     Success: ${result.success}`);
      console.log(`     Classification: ${result.classification}`);
      if (result.success) {
        console.log(`     Document ID: ${result.documentId}`);
        console.log(`     File path: ${result.filePath}`);
        if (result.converted) {
          console.log(`     ✨ Converted to PDF`);
          console.log(`     PDF Document ID: ${result.convertedDocumentId}`);
        }
      } else {
        console.log(`     ❌ Error: ${result.error}`);
      }
    });

  } catch (error) {
    console.error('❌ Processing test failed:', error);
  }

  console.log('\n🎯 Test completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };