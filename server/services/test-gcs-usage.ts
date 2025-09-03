/**
 * Test script for GCS Usage Service
 * Tests real Google Cloud Storage monitoring integration
 */

import { gcsUsageService } from './gcsUsageService';

async function testGCSUsage() {
  console.log('🔍 Testing GCS Usage Service...\n');

  try {
    console.log('📊 Fetching real GCS usage metrics...');
    const usage = await gcsUsageService.getGCSUsage();

    console.log('\n✅ GCS Usage Metrics Retrieved:');
    console.log('─'.repeat(50));
    console.log(`📦 Total Storage: ${usage.totalStorageGB} GB (${usage.totalStorageTB} TB)`);
    console.log(`💰 Cost This Month: $${usage.costThisMonth}`);
    console.log(`📊 Requests This Month: ${usage.requestsThisMonth.toLocaleString()}`);
    console.log(`🌐 Bandwidth: ${usage.bandwidthGB} GB`);
    console.log(`📈 Trend: ${usage.trend} (${usage.trendPercentage}%)`);
    console.log('─'.repeat(50));

    // Validate metrics
    const validationResults = [];
    
    if (usage.totalStorageGB >= 0) {
      validationResults.push('✅ Storage GB valid');
    } else {
      validationResults.push('❌ Storage GB invalid');
    }
    
    if (usage.costThisMonth >= 0) {
      validationResults.push('✅ Cost valid');
    } else {
      validationResults.push('❌ Cost invalid');
    }
    
    if (usage.requestsThisMonth >= 0) {
      validationResults.push('✅ Request count valid');
    } else {
      validationResults.push('❌ Request count invalid');
    }
    
    if (['up', 'down', 'stable'].includes(usage.trend)) {
      validationResults.push('✅ Trend direction valid');
    } else {
      validationResults.push('❌ Trend direction invalid');
    }

    console.log('\n🔍 Validation Results:');
    validationResults.forEach(result => console.log(`  ${result}`));

    const successCount = validationResults.filter(r => r.startsWith('✅')).length;
    const totalTests = validationResults.length;

    console.log(`\n📊 Test Summary: ${successCount}/${totalTests} validations passed`);
    
    if (successCount === totalTests) {
      console.log('🎉 All GCS usage tests PASSED - Real metrics integration working!');
    } else {
      console.log('⚠️  Some validations failed - Check GCS monitoring configuration');
    }

  } catch (error) {
    console.error('❌ GCS Usage Test Failed:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('  • Check GOOGLE_APPLICATION_CREDENTIALS environment variable');
    console.log('  • Verify Google Cloud Monitoring API is enabled');
    console.log('  • Ensure service account has monitoring.timeSeries.list permission');
    console.log('  • Confirm GCS_PROJECT_ID and GCS_BUCKET_NAME are correct');
  }
}

// Run the test when executed directly
testGCSUsage().catch(console.error);

export { testGCSUsage };