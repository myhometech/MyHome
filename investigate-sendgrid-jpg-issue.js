#!/usr/bin/env node

/**
 * Investigate Real SendGrid JPG Email Processing Issue
 * 
 * Focus on differences between our test format and actual SendGrid webhook format
 * that might cause JPG files to be processed silently or fail to appear.
 */

console.log('🔍 Investigating Real SendGrid JPG Email Processing Issue\n');

// Test with actual SendGrid webhook format
async function testSendGridJPGFormat() {
  console.log('📧 Testing with SendGrid-like webhook format...\n');
  
  // Create a small valid JPEG in base64
  const jpegBase64 = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x08,
    0x00, 0x08, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
    0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
    0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0xB2, 0xC0,
    0x07, 0xFF, 0xD9
  ]).toString('base64');

  const testScenarios = [
    {
      name: 'Real SendGrid Headers + JPG',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SendGrid Event Webhook v1.0',
        'X-SendGrid-Event-ID': 'test-jpg-' + Date.now(),
        'X-SendGrid-Message-ID': 'sendgrid-msg-' + Date.now()
      },
      body: {
        to: 'docs-nwennn@docs.replit.app',
        from: 'real-test@example.com',
        subject: 'Real JPG Test from SendGrid Format',
        text: 'This is a real JPG test',
        html: '<p>This is a real JPG test with HTML</p>',
        attachments: [{
          filename: 'real_photo.jpg',
          type: 'image/jpeg',
          content: jpegBase64,
          content_id: 'jpg-attachment-1'
        }]
      }
    },
    {
      name: 'No Text Content (JPG Only Email)',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SendGrid Event Webhook v1.0'
      },
      body: {
        to: 'docs-nwennn@docs.replit.app', 
        from: 'jpg-only@example.com',
        subject: 'JPG Only - No Text',
        // No text or html content - just attachment
        attachments: [{
          filename: 'only_attachment.jpg',
          type: 'image/jpeg',
          content: jpegBase64
        }]
      }
    },
    {
      name: 'Multiple JPG Attachments',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SendGrid Event Webhook v1.0'
      },
      body: {
        to: 'docs-nwennn@docs.replit.app',
        from: 'multi-jpg@example.com', 
        subject: 'Multiple JPG Test',
        text: 'Multiple JPG attachments',
        attachments: [
          {
            filename: 'photo1.jpg',
            type: 'image/jpeg',
            content: jpegBase64
          },
          {
            filename: 'photo2.jpeg',
            type: 'image/jpeg', 
            content: jpegBase64
          }
        ]
      }
    },
    {
      name: 'Common Email Client MIME Issues',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SendGrid Event Webhook v1.0'
      },
      body: {
        to: 'docs-nwennn@docs.replit.app',
        from: 'mime-issue@example.com',
        subject: 'JPG with Common MIME Type Issues',
        text: 'Testing common email client MIME type issues',
        attachments: [
          {
            filename: 'photo.jpg',
            type: 'image/jpg', // Some clients use image/jpg instead of image/jpeg
            content: jpegBase64
          },
          {
            filename: 'scan.jpg',
            type: 'application/octet-stream', // Common for email client fallback
            content: jpegBase64
          }
        ]
      }
    }
  ];

  const results = [];

  for (const scenario of testScenarios) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    
    try {
      const response = await fetch('http://localhost:5000/api/email-ingest', {
        method: 'POST',
        headers: scenario.headers,
        body: JSON.stringify(scenario.body)
      });

      const result = await response.json();
      
      console.log(`   HTTP Status: ${response.status}`);
      console.log(`   Documents Created: ${result.documentsCreated || 0}`);
      console.log(`   Attachments Processed: ${result.attachmentResults?.processed || 0}`);
      console.log(`   Attachments Failed: ${result.attachmentResults?.failed || 0}`);
      
      if (result.attachmentResults?.failed > 0) {
        const failedAttachments = result.attachmentResults.details?.filter(d => !d.success) || [];
        console.log(`   Failed Attachment Errors:`);
        failedAttachments.forEach(attachment => {
          console.log(`      - ${attachment.filename}: ${attachment.error}`);
        });
      }
      
      // Log success indicators
      const successfulAttachments = result.attachmentResults?.details?.filter(d => d.success) || [];
      if (successfulAttachments.length > 0) {
        console.log(`   Successfully Processed:`);
        successfulAttachments.forEach(attachment => {
          console.log(`      ✅ ${attachment.filename} -> ${attachment.gcsPath || 'local storage'}`);
        });
      }
      
      results.push({
        scenario: scenario.name,
        success: response.status === 200 && result.attachmentResults?.processed > 0,
        httpStatus: response.status,
        documentsCreated: result.documentsCreated || 0,
        attachmentsProcessed: result.attachmentResults?.processed || 0,
        attachmentsFailed: result.attachmentResults?.failed || 0,
        requestId: result.requestId,
        processingTime: result.processingTimeMs
      });
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      results.push({
        scenario: scenario.name,
        success: false,
        error: error.message
      });
    }

    // Brief pause
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return results;
}

// Check recent logs for JPG processing patterns
async function checkRecentLogs() {
  console.log('\n📋 Checking for recent JPG processing patterns in logs...');
  
  try {
    // This would typically check server logs - simulating with a status check
    const response = await fetch('http://localhost:5000/api/auth/user');
    console.log(`   Server responding: ${response.status === 200 || response.status === 401 ? 'Yes' : 'No'} (${response.status})`);
    
    console.log('\n   💡 To check real logs, look for these patterns:');
    console.log('      - "[requestId] Processing attachment X/Y: *.jpg"');
    console.log('      - "[requestId] ✅ Successfully processed: *.jpg"'); 
    console.log('      - "[requestId] ❌ Failed to process: *.jpg"');
    console.log('      - "[requestId] ❌ Rejected attachment: *.jpg"');
    console.log('      - Any base64 decoding errors');
    console.log('      - Any GCS upload failures');
    
  } catch (error) {
    console.log(`   Server not responding: ${error.message}`);
  }
}

// Main investigation function
async function runInvestigation() {
  console.log('🚀 Starting SendGrid JPG Email Investigation...\n');
  
  await checkRecentLogs();
  
  const results = await testSendGridJPGFormat();
  
  console.log('\n📊 Investigation Results Summary:');
  console.log('='.repeat(70));
  
  results.forEach((result, index) => {
    const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
    console.log(`${status} - ${result.scenario}`);
    
    if (result.success) {
      console.log(`     📄 Documents: ${result.documentsCreated}, Attachments: ${result.attachmentsProcessed}`);
      console.log(`     ⏱️  Processing: ${result.processingTime}ms, Request: ${result.requestId}`);
    }
    
    if (result.error) {
      console.log(`     ❌ Error: ${result.error}`);
    }
    
    if (result.attachmentsFailed > 0) {
      console.log(`     ⚠️  Failed attachments: ${result.attachmentsFailed}`);
    }
  });
  
  console.log('='.repeat(70));
  
  const successCount = results.filter(r => r.success).length;
  console.log(`📈 Overall Success Rate: ${successCount}/${results.length} scenarios`);
  
  // Generate conclusions
  console.log('\n🔍 Investigation Conclusions:');
  
  if (successCount === results.length) {
    console.log('✅ JPG processing appears to be working correctly in all tested scenarios');
    console.log('📋 If users report missing JPGs, check:');
    console.log('   1. Are emails actually reaching the webhook endpoint?');
    console.log('   2. Are the forwarding email addresses correctly configured?');
    console.log('   3. Are JPG files being sent with proper MIME types?');
    console.log('   4. Are file sizes within limits?');
  } else if (successCount > 0) {
    console.log('⚠️  JPG processing works in some scenarios but fails in others');
    console.log('📋 Focus investigation on the failing scenarios above');
  } else {
    console.log('🚨 CRITICAL: JPG processing is completely broken');
    console.log('📋 Check server logs immediately for error patterns');
  }
  
  console.log('\n💡 Next Steps:');
  console.log('1. Test with actual SendGrid webhook (not simulated)');
  console.log('2. Check user email forwarding address configuration');
  console.log('3. Verify GCS upload pipeline is working');
  console.log('4. Monitor server logs during real email tests');
}

runInvestigation().catch(error => {
  console.error('❌ Investigation failed:', error);
  process.exit(1);
});