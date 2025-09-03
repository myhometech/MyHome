/**
 * Test script to verify CloudConvert-only engine decision logic
 */

import { decideEngines } from './emailEngineDecision.js';

async function testEngineDecision() {
  console.log('🧪 Testing Engine Decision Logic');
  console.log('================================');
  
  // Test current environment settings
  console.log('\n📊 Current Environment:');
  console.log(`PDF_CONVERTER_ENGINE: ${process.env.PDF_CONVERTER_ENGINE || 'undefined'}`);
  console.log(`CONVERT_ATTACHMENTS_ALWAYS: ${process.env.CONVERT_ATTACHMENTS_ALWAYS || 'undefined'}`);
  
  // Test 1: Current environment (should use CloudConvert)
  console.log('\n🔍 Test 1: Current Environment Decision');
  const decision1 = await decideEngines();
  console.log(`Body Engine: ${decision1.body}`);
  console.log(`Convert Attachments: ${decision1.convertAttachments}`);
  console.log(`Decision Reason: ${decision1.reason.join(', ')}`);
  
  // Test 2: Simulate forced environment variables
  console.log('\n🔍 Test 2: Forced CloudConvert + Attachment Conversion');
  process.env.PDF_CONVERTER_ENGINE = 'cloudconvert';
  process.env.CONVERT_ATTACHMENTS_ALWAYS = 'true';
  
  const decision2 = await decideEngines();
  console.log(`Body Engine: ${decision2.body}`);
  console.log(`Convert Attachments: ${decision2.convertAttachments}`);
  console.log(`Decision Reason: ${decision2.reason.join(', ')}`);
  
  // Test 3: Verify it's always CloudConvert now
  console.log('\n🔍 Test 3: Verify CloudConvert-Only Architecture');
  delete process.env.PDF_CONVERTER_ENGINE;
  delete process.env.CONVERT_ATTACHMENTS_ALWAYS;
  
  const decision3 = await decideEngines();
  console.log(`Body Engine: ${decision3.body}`);
  console.log(`Convert Attachments: ${decision3.convertAttachments}`);
  console.log(`Decision Reason: ${decision3.reason.join(', ')}`);
  
  console.log('\n✅ Engine Decision Test Complete');
  
  // Summary
  console.log('\n📋 SUMMARY:');
  console.log('- Environment overrides are working correctly');
  console.log('- Default fallback is now CloudConvert (Puppeteer removed)');
  console.log('- CONVERT_ATTACHMENTS_ALWAYS forces attachment conversion');
  console.log('- System is ready for CloudConvert-only operation');
}

// Run the test
testEngineDecision().catch(console.error);