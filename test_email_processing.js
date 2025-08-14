#!/usr/bin/env node

// Quick test to verify email attachment processing works
// This simulates a Mailgun webhook with an attachment

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const SERVER_URL = 'http://localhost:5000';

async function testEmailWithAttachment() {
  console.log('🧪 Testing email processing with attachment...');
  
  // Create a test PDF file for attachment
  const testContent = Buffer.from('Test PDF content - this would be a real PDF file');
  const testFilename = 'test-attachment.pdf';
  
  // Create form data with email content and attachment
  const formData = new FormData();
  
  // Email metadata (simulating Mailgun webhook)
  formData.append('recipient', 'upload+test-user-123@myhome-tech.com');
  formData.append('sender', 'test@example.com');
  formData.append('subject', 'Test Email with Attachment');
  formData.append('body-plain', 'This is a test email with an attachment.');
  formData.append('body-html', '<p>This is a <strong>test email</strong> with an attachment.</p>');
  formData.append('timestamp', Math.floor(Date.now() / 1000).toString());
  formData.append('token', 'test-token-' + Date.now());
  formData.append('signature', 'test-signature');
  formData.append('Message-Id', 'test-message-' + Date.now());
  formData.append('attachment-count', '1');
  
  // Add attachment file
  formData.append('attachment-1', testContent, {
    filename: testFilename,
    contentType: 'application/pdf'
  });

  try {
    console.log('📤 Sending test email webhook...');
    const response = await fetch(`${SERVER_URL}/api/email-ingest`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    const result = await response.text();
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers));
    console.log('📥 Response body:', result);

    if (response.ok) {
      try {
        const jsonResult = JSON.parse(result);
        console.log('\n✅ Email processing response:');
        console.log('   - Conversion engine:', jsonResult.conversionEngine);
        console.log('   - Email body PDF:', jsonResult.emailBodyPdf ? 'Created' : 'Not created');
        console.log('   - Attachments processed:', jsonResult.attachmentResults ? jsonResult.attachmentResults.length : 0);
        console.log('   - Has file attachments:', jsonResult.hasFileAttachments);
        
        if (jsonResult.attachmentResults) {
          jsonResult.attachmentResults.forEach((result, index) => {
            console.log(`   - Attachment ${index + 1}: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.filename || 'unknown'}`);
            if (!result.success) {
              console.log(`     Error: ${result.error}`);
            }
          });
        }
      } catch (parseError) {
        console.log('📄 Raw response (not JSON):', result);
      }
    } else {
      console.error('❌ Request failed with status:', response.status);
      console.error('❌ Error response:', result);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testEmailWithAttachment().catch(console.error);