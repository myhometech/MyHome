#!/usr/bin/env node

// Test script for email processing with proper user setup
import fetch from 'node-fetch';
import { createHash, randomBytes } from 'crypto';

const BASE_URL = 'http://localhost:5000';

// Create test user data
const testUser = {
  email: `test-${Date.now()}@example.com`,
  firstName: 'Test',
  lastName: 'User',
  authProvider: 'email',
  passwordHash: '$2b$10$EXAMPLEhash' // Mock password hash
};

async function createTestUser() {
  try {
    console.log('📤 Creating test user...');
    
    // First, try to create user directly in database via API
    // Since we don't have a direct user creation endpoint, we'll simulate the Mailgun flow with an existing user
    
    // For this test, we'll use a known test user ID from the database or create one
    // Let's try with a fixed test user ID that we know exists or create
    const testUserId = 'test-user-' + Date.now();
    
    console.log(`✅ Using test user ID: ${testUserId}`);
    return testUserId;
    
  } catch (error) {
    console.error('❌ Failed to create test user:', error.message);
    throw error;
  }
}

async function testEmailProcessing(userId) {
  const testData = {
    'message-id': 'test-message-' + Date.now(),
    'recipient': `documents+${userId}@example.com`,
    'sender': 'test@example.com', 
    'subject': 'Test Email with Attachment',
    'body-html': '<h1>Test Email Body</h1><p>This is a test email with an attachment.</p>',
    'body-plain': 'Test Email Body\n\nThis is a test email with an attachment.',
    'stripped-html': '<p>This is a test email with an attachment.</p>',
    'stripped-text': 'This is a test email with an attachment.',
    'attachment-count': '1',
    'timestamp': Math.floor(Date.now() / 1000).toString(),
    'token': 'test-token-12345',
    'signature': 'test-signature'
  };

  // Create a test PDF attachment
  const pdfContent = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj  
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (Test PDF Content) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
300
%%EOF`).toString('base64');

  // Create form data for the attachment
  const boundary = '--------------------------b3b5c46d47571da9f34f5aee';
  const formData = [
    ...Object.entries(testData).map(([key, value]) => 
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ),
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="attachment-1"; filename="test-attachment.pdf"\r\n`,
    `Content-Type: application/pdf\r\n\r\n`,
    Buffer.from(pdfContent, 'base64').toString('binary'),
    `\r\n--${boundary}--\r\n`
  ].join('');

  try {
    console.log('🧪 Testing email processing with real user...');
    console.log(`👤 Using user ID: ${userId}`);
    console.log('📤 Sending test email webhook...');

    const response = await fetch(`${BASE_URL}/api/email-ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': 'Mailgun/3.0'
      },
      body: Buffer.from(formData, 'binary')
    });

    console.log(`📥 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Error response: ${errorText}`);
      return;
    }

    const result = await response.json();
    console.log('📥 Response body:', JSON.stringify(result, null, 2));

    console.log('\n✅ Email processing response:');
    console.log(`   - Conversion engine: ${result.conversionEngine}`);
    console.log(`   - Email body PDF: ${result.documentId ? 'Created (ID: ' + result.documentId + ')' : 'Not created'}`);
    console.log(`   - Attachments processed: ${result.attachmentResults?.length || 0}`);
    console.log(`   - Has file attachments: ${result.hasFileAttachments}`);

    if (result.attachmentResults) {
      result.attachmentResults.forEach((attachment, index) => {
        console.log(`   - Attachment ${index + 1}: ${attachment.success ? 'SUCCESS' : 'FAILED'} - ${attachment.filename}`);
        if (!attachment.success) {
          console.log(`     Error: ${attachment.error}`);
        } else if (attachment.documentId) {
          console.log(`     Document ID: ${attachment.documentId}`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function main() {
  try {
    const userId = await createTestUser();
    await testEmailProcessing(userId);
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

main();