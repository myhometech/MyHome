#!/usr/bin/env node

/**
 * JPG Email Diagnostic Tool
 * 
 * Comprehensive diagnostic tool for troubleshooting JPG email ingestion issues.
 * Helps identify whether the problem is with webhook delivery, user configuration,
 * file size/format, or actual processing.
 */

console.log('🔧 JPG Email Diagnostic Tool\n');

// Test webhook endpoint health
async function testWebhookHealth() {
  console.log('1️⃣ Testing webhook endpoint health...');
  
  try {
    const response = await fetch('http://localhost:5000/api/email-ingest', {
      method: 'GET'
    });
    
    console.log(`   Endpoint Status: ${response.status === 200 || response.status === 405 ? '✅ Healthy' : '❌ Unhealthy'} (${response.status})`);
    return response.status === 200 || response.status === 405;
    
  } catch (error) {
    console.log(`   Endpoint Status: ❌ Unreachable - ${error.message}`);
    return false;
  }
}

// Test user email forwarding configuration
async function testUserEmailConfig() {
  console.log('\n2️⃣ Testing user email forwarding configuration...');
  
  try {
    const response = await fetch('http://localhost:5000/api/user/email-forwarding-address', {
      method: 'GET',
      headers: {
        'Cookie': 'connect.sid=your-session-cookie' // Would need real session
      }
    });
    
    if (response.status === 401) {
      console.log('   📧 Email Config: ⚠️  Authentication required (expected in testing)');
      console.log('   💡 In production: verify user\'s forwarding address is correctly configured');
      return 'auth_required';
    }
    
    const result = await response.json();
    console.log(`   📧 Email Config: ✅ Available (${result.address || 'address found'})`);
    return result.address;
    
  } catch (error) {
    console.log(`   📧 Email Config: ❌ Error - ${error.message}`);
    return false;
  }
}

// Test JPG processing with various scenarios
async function testJPGProcessing() {
  console.log('\n3️⃣ Testing JPG processing capabilities...');
  
  // Minimal valid JPEG
  const jpegBase64 = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43
  ]).toString('base64');

  const tests = [
    {
      name: 'Small JPG (image/jpeg)',
      attachment: {
        filename: 'test_small.jpg',
        type: 'image/jpeg',
        content: jpegBase64
      },
      expected: 'success'
    },
    {
      name: 'Small JPG (image/jpg)', 
      attachment: {
        filename: 'test_alt.jpg',
        type: 'image/jpg',
        content: jpegBase64
      },
      expected: 'success'
    },
    {
      name: 'JPG with wrong MIME',
      attachment: {
        filename: 'test_wrong.jpg',
        type: 'application/octet-stream',
        content: jpegBase64
      },
      expected: 'fail'
    },
    {
      name: 'Large JPG simulation',
      attachment: {
        filename: 'test_large.jpg',
        type: 'image/jpeg',
        content: jpegBase64 + 'A'.repeat(5 * 1024 * 1024) // ~5MB
      },
      expected: 'success'
    }
  ];

  const results = [];
  
  for (const test of tests) {
    console.log(`   🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch('http://localhost:5000/api/email-ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'JPG-Diagnostic-Tool'
        },
        body: JSON.stringify({
          to: 'docs-test@docs.replit.app',
          from: 'diagnostic@example.com',
          subject: `Diagnostic: ${test.name}`,
          text: 'Diagnostic test email',
          attachments: [test.attachment]
        })
      });

      const result = await response.json();
      const success = response.status === 200 && result.attachmentResults?.processed > 0;
      const expectedSuccess = test.expected === 'success';
      const testPassed = success === expectedSuccess;
      
      console.log(`      Result: ${testPassed ? '✅ PASS' : '❌ FAIL'} (${success ? 'processed' : 'rejected'})`);
      
      if (result.attachmentResults?.failed > 0) {
        const failures = result.attachmentResults.details?.filter(d => !d.success) || [];
        failures.forEach(failure => {
          console.log(`      Reason: ${failure.error}`);
        });
      }
      
      results.push({
        test: test.name,
        passed: testPassed,
        success: success,
        expected: expectedSuccess,
        httpStatus: response.status,
        processingTime: result.processingTimeMs
      });
      
    } catch (error) {
      console.log(`      Result: ❌ ERROR - ${error.message}`);
      results.push({
        test: test.name,
        passed: false,
        error: error.message
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

// Test common failure scenarios
async function testFailureScenarios() {
  console.log('\n4️⃣ Testing common failure scenarios...');
  
  const scenarios = [
    {
      name: 'Empty attachments array',
      body: {
        to: 'docs-test@docs.replit.app',
        from: 'test@example.com',
        subject: 'No attachments',
        text: 'Email with no attachments',
        attachments: []
      }
    },
    {
      name: 'Malformed attachment',
      body: {
        to: 'docs-test@docs.replit.app',
        from: 'test@example.com', 
        subject: 'Malformed attachment',
        text: 'Email with malformed attachment',
        attachments: [
          {
            // Missing filename
            type: 'image/jpeg',
            content: 'invalid-base64-content'
          }
        ]
      }
    }
  ];

  for (const scenario of scenarios) {
    console.log(`   🧪 Testing: ${scenario.name}`);
    
    try {
      const response = await fetch('http://localhost:5000/api/email-ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'JPG-Diagnostic-Tool'
        },
        body: JSON.stringify(scenario.body)
      });

      const result = await response.json();
      console.log(`      Status: ${response.status}, Documents: ${result.documentsCreated || 0}`);
      
    } catch (error) {
      console.log(`      Result: ❌ ERROR - ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Generate diagnostic report
function generateDiagnosticReport(webhookHealthy, emailConfig, jpgResults) {
  console.log('\n📋 DIAGNOSTIC REPORT');
  console.log('='.repeat(50));
  
  // Webhook Health
  console.log(`🌐 Webhook Endpoint: ${webhookHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
  
  // Email Configuration
  if (emailConfig === 'auth_required') {
    console.log('📧 Email Config: ⚠️  Authentication required for testing');
  } else if (emailConfig) {
    console.log(`📧 Email Config: ✅ Working (${emailConfig})`);
  } else {
    console.log('📧 Email Config: ❌ Issue detected');
  }
  
  // JPG Processing
  const jpgPassed = jpgResults.filter(r => r.passed).length;
  const jpgTotal = jpgResults.length;
  console.log(`📸 JPG Processing: ${jpgPassed}/${jpgTotal} tests passed`);
  
  jpgResults.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`   ${status} ${result.test}`);
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  });
  
  console.log('='.repeat(50));
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  
  if (!webhookHealthy) {
    console.log('🚨 CRITICAL: Webhook endpoint not accessible');
    console.log('   - Check if server is running');
    console.log('   - Verify network connectivity');
    console.log('   - Check firewall/proxy settings');
  }
  
  if (jpgPassed < jpgTotal) {
    console.log('⚠️  JPG processing issues detected');
    console.log('   - Review attachment validation logic');
    console.log('   - Check base64 decoding implementation');
    console.log('   - Verify file storage pipeline');
  }
  
  if (jpgPassed === jpgTotal && webhookHealthy) {
    console.log('✅ JPG processing is working correctly');
    console.log('📋 For user-reported issues, check:');
    console.log('   1. Are emails reaching the webhook? (SendGrid delivery)');
    console.log('   2. Is user forwarding address configured correctly?');
    console.log('   3. Are JPG files under 30MB size limit?');
    console.log('   4. Are JPG files sent with proper MIME types?');
    console.log('   5. Monitor server logs during real email tests');
  }
  
  console.log('\n🔍 Next Steps:');
  console.log('1. Test with real SendGrid webhook (not simulated)');
  console.log('2. Monitor server logs during actual email forwarding');
  console.log('3. Verify user email forwarding configuration');
  console.log('4. Check SendGrid webhook delivery logs');
}

// Main diagnostic function
async function runDiagnostics() {
  console.log('🚀 Starting comprehensive JPG email diagnostics...\n');
  
  const webhookHealthy = await testWebhookHealth();
  const emailConfig = await testUserEmailConfig();
  const jpgResults = await testJPGProcessing();
  
  await testFailureScenarios();
  
  generateDiagnosticReport(webhookHealthy, emailConfig, jpgResults);
  
  console.log('\n✅ Diagnostics completed');
}

runDiagnostics().catch(error => {
  console.error('❌ Diagnostics failed:', error);
  process.exit(1);
});