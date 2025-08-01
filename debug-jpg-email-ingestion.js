#!/usr/bin/env node

/**
 * Debug JPG Email Ingestion Issue
 * 
 * Tests real JPG file processing through the email ingestion pipeline
 * to identify where silent failures are occurring.
 */

console.log('🔍 TICKET 1: Debugging JPG Email Ingestion Issue\n');

// Create a real JPG file in base64 format (minimal valid JPEG header + data)
const createValidJPEGBase64 = () => {
  // Minimal valid JPEG file structure
  const jpegHeader = Buffer.from([
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
  ]);
  
  return jpegHeader.toString('base64');
};

async function testJPGEmailIngestion() {
  console.log('📧 Testing JPG Email Ingestion Pipeline...\n');
  
  const testCases = [
    {
      name: 'Valid JPG with image/jpeg MIME type',
      attachment: {
        filename: 'photo.jpg',
        content: createValidJPEGBase64(),
        type: 'image/jpeg'
      },
      expectedResult: 'SUCCESS'
    },
    {
      name: 'Valid JPEG with image/jpg MIME type (alternative)',
      attachment: {
        filename: 'document.jpeg',
        content: createValidJPEGBase64(),
        type: 'image/jpg'
      },
      expectedResult: 'SUCCESS'
    },
    {
      name: 'JPG with wrong MIME type (common email client issue)',
      attachment: {
        filename: 'scan.jpg',
        content: createValidJPEGBase64(),
        type: 'application/octet-stream'
      },
      expectedResult: 'FAIL - Wrong MIME type'
    },
    {
      name: 'Large JPG file (simulate real photo)',
      attachment: {
        filename: 'large_photo.jpg',
        content: createValidJPEGBase64() + 'A'.repeat(5 * 1024 * 1024), // ~5MB
        type: 'image/jpeg'
      },
      expectedResult: 'SUCCESS'
    }
  ];

  const results = [];
  
  for (const testCase of testCases) {
    console.log(`\n🔍 Testing: ${testCase.name}`);
    console.log(`   Expected: ${testCase.expectedResult}`);
    
    try {
      const response = await fetch('http://localhost:5000/api/email-ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SendGrid Event Webhook'
        },
        body: JSON.stringify({
          to: 'docs-nwennn@docs.replit.app',
          from: 'photo-test@example.com',
          subject: `JPG Test: ${testCase.name}`,
          text: 'Please process this JPG attachment',
          attachments: [testCase.attachment]
        })
      });

      const result = await response.json();
      
      console.log(`   HTTP Status: ${response.status}`);
      console.log(`   Documents Created: ${result.documentsCreated || 0}`);
      console.log(`   Attachments Processed: ${result.attachmentResults?.processed || 0}`);
      console.log(`   Attachments Failed: ${result.attachmentResults?.failed || 0}`);
      
      if (result.attachmentResults?.details?.length > 0) {
        console.log(`   Failure Details:`, result.attachmentResults.details.map(d => ({
          filename: d.filename,
          success: d.success,
          error: d.error
        })));
      }
      
      // Analyze result
      const isSuccess = response.status === 200 && 
                       result.attachmentResults?.processed > 0 && 
                       result.attachmentResults?.failed === 0;
      
      const testResult = {
        name: testCase.name,
        passed: testCase.expectedResult === 'SUCCESS' ? isSuccess : !isSuccess,
        actualResult: isSuccess ? 'SUCCESS' : 'FAILED',
        httpStatus: response.status,
        details: result
      };
      
      results.push(testResult);
      
      console.log(`   Result: ${testResult.passed ? '✅ PASS' : '❌ FAIL'}`);
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      results.push({
        name: testCase.name,
        passed: false,
        actualResult: 'ERROR',
        error: error.message
      });
    }
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Summary
  console.log('\n📊 JPG Email Ingestion Test Results:');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${result.name}`);
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
    if (!result.passed && result.details?.attachmentResults?.details) {
      const failures = result.details.attachmentResults.details.filter(d => !d.success);
      failures.forEach(failure => {
        console.log(`      Attachment Error: ${failure.error}`);
      });
    }
  });
  
  console.log('='.repeat(60));
  console.log(`📈 Overall Results: ${passed}/${results.length} tests passed`);
  
  if (passed === 0) {
    console.log('\n🚨 CRITICAL: All JPG tests failed - this explains the silent failure issue!');
    console.log('📋 Investigation needed in:');
    console.log('   - Attachment validation logic');
    console.log('   - MIME type handling');
    console.log('   - Base64 decoding process');
    console.log('   - GCS upload pipeline');
  } else if (passed < results.length) {
    console.log('\n⚠️  Some JPG scenarios failing - partial compatibility issue');
  } else {
    console.log('\n🎉 All JPG tests passed - issue may be elsewhere in pipeline');
  }
  
  return results;
}

// Function to check if webhook endpoint is accessible
async function checkWebhookAccessibility() {
  console.log('🌐 Checking webhook endpoint accessibility...');
  
  try {
    const response = await fetch('http://localhost:5000/api/email-ingest', {
      method: 'GET'
    });
    
    console.log(`   Webhook endpoint HTTP status: ${response.status}`);
    
    if (response.status === 405 || response.status === 200) {
      console.log('   ✅ Endpoint accessible');
      return true;
    } else {
      console.log('   ⚠️ Unexpected response - endpoint may have issues');
      return false;
    }
  } catch (error) {
    console.log('   ❌ Webhook endpoint not accessible:', error.message);
    return false;
  }
}

// Run the complete test suite
async function runJPGDebugging() {
  console.log('🚀 Starting JPG Email Ingestion Debugging...\n');
  
  // First check endpoint accessibility
  const isAccessible = await checkWebhookAccessibility();
  if (!isAccessible) {
    console.log('\n❌ Cannot proceed - webhook endpoint not accessible');
    process.exit(1);
  }
  
  // Run JPG processing tests
  const results = await testJPGEmailIngestion();
  
  // Provide debugging recommendations
  console.log('\n🔧 Debugging Recommendations:');
  console.log('1. Check server logs for detailed attachment processing messages');
  console.log('2. Verify GCS upload pipeline is working (or fallback to local storage)');
  console.log('3. Confirm user association is working correctly');
  console.log('4. Test with actual SendGrid webhook format vs simulated format');
  
  return results;
}

runJPGDebugging().catch(error => {
  console.error('❌ Debugging failed:', error);
  process.exit(1);
});