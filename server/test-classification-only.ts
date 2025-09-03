#!/usr/bin/env tsx
/**
 * TICKET 3: Test script for Attachment Classification Service only
 * Tests classification without CloudConvert dependency
 */

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
  },
  {
    filename: 'spreadsheet.xlsx',
    content: 'UEsDBBQABgAIAAAAIQDdwJmuFgEAAFUGAAATAAgCW0NvbnRlbnRf',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 25000
  }
];

function runClassificationTests() {
  console.log('🧪 TICKET 3: Testing Attachment Classification & Routing');
  console.log('=====================================================\n');

  // Test 1: Classification Service
  console.log('📋 Test 1: Attachment Classification');
  for (const attachment of testAttachments) {
    const classification = attachmentClassificationService.classifyAttachment(attachment);
    console.log(`  ${attachment.filename} (${attachment.contentType})`);
    console.log(`    → Type: ${classification.type}`);
    console.log(`    → Needs conversion: ${classification.needsConversion}`);
    console.log(`    → Size valid: ${classification.sizeValid}`);
    console.log(`    → Supported: ${classification.supported}`);
    console.log(`    → Engine: ${classification.engine || 'none'}\n`);
  }

  // Test 2: Routing Logic
  console.log('🔀 Test 2: Processing Routes');
  for (const attachment of testAttachments) {
    const route = attachmentClassificationService.determineProcessingRoute(attachment);
    console.log(`  ${attachment.filename}`);
    console.log(`    → Action: ${route.action}`);
    console.log(`    → Reason: ${route.reason}`);
    if (route.conversionStatus) {
      console.log(`    → Conversion status: ${route.conversionStatus}`);
    }
    console.log('');
  }

  // Test 3: Conversion Status Display Names
  console.log('📊 Test 3: Conversion Status Display Names');
  const statuses = [
    'not_applicable', 'pending', 'completed', 
    'skipped_unsupported', 'skipped_too_large', 
    'skipped_password_protected', 'failed'
  ] as const;
  
  for (const status of statuses) {
    const displayName = attachmentClassificationService.getConversionStatusDisplayName(status);
    console.log(`  ${status} → "${displayName}"`);
  }

  console.log('\n✅ Classification tests completed successfully!');
  console.log('\n💡 Note: CloudConvert conversion tests skipped (requires API key)');
}

// Run tests
runClassificationTests();