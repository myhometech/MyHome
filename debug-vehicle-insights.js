/**
 * Debug Vehicle Insight Generation
 */

import { storage } from './server/storage.js';
import { vehicleInsightService } from './server/vehicleInsightService.js';

const TEST_USER_ID = '94a7b7f0-3266-4a4f-9d4e-875542d30e62';

async function debugInsightGeneration() {
  console.log('🔍 Debugging Vehicle Insight Generation\n');
  
  try {
    // Test 1: Create vehicle with test data
    console.log('1. Creating test vehicle...');
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    
    const testVehicle = await storage.createVehicle({
      userId: TEST_USER_ID,
      vrn: 'DEBUG123',
      make: 'Ford',
      model: 'Focus',
      source: 'dvla',
      motExpiryDate: futureDate,
      taxDueDate: futureDate,
      motStatus: 'Valid',
      taxStatus: 'Taxed'
    });
    
    console.log('✅ Vehicle created:', testVehicle);
    
    // Test 2: Manual insight creation
    console.log('\n2. Testing manual insight creation...');
    
    const testInsight = {
      documentId: null, // Vehicle insights not tied to documents
      userId: TEST_USER_ID,
      insightId: 'debug-test-insight',
      message: 'Test insight message',
      type: 'vehicle:tax',
      title: 'Test Vehicle Tax',
      content: 'Test insight content',
      confidence: 95,
      priority: 'high',
      dueDate: futureDate,
      actionUrl: 'https://www.gov.uk/vehicle-tax',
      status: 'open',
      metadata: {
        linkedVrn: 'DEBUG123',
        source: 'dvla'
      },
      source: 'ai',
      tier: 'primary',
      aiModel: 'test-model',
      insightVersion: 'v2.0'
    };
    
    const createdInsight = await storage.createDocumentInsight(testInsight);
    console.log('✅ Manual insight created:', {
      id: createdInsight.id,
      type: createdInsight.type,
      message: createdInsight.message
    });
    
    // Test 3: Verify insight is retrievable
    console.log('\n3. Testing insight retrieval...');
    const allInsights = await storage.getInsights(TEST_USER_ID);
    console.log('✅ Retrieved insights count:', allInsights.length);
    
    const vehicleInsights = allInsights.filter(insight => 
      insight.type === 'vehicle:tax' || insight.type === 'vehicle:mot'
    );
    console.log('✅ Vehicle insights found:', vehicleInsights.length);
    
    // Test 4: Service insight generation
    console.log('\n4. Testing service insight generation...');
    console.log('Vehicle for insight generation:', testVehicle);
    const serviceInsights = await vehicleInsightService.generateVehicleInsights(
      testVehicle,
      TEST_USER_ID
    );
    
    console.log('✅ Service insights generated:', {
      motInsight: !!serviceInsights.motInsight,
      taxInsight: !!serviceInsights.taxInsight,
      totalGenerated: Object.keys(serviceInsights).length
    });
    
    if (serviceInsights.motInsight) {
      console.log('MOT Insight:', serviceInsights.motInsight.message);
    }
    if (serviceInsights.taxInsight) {
      console.log('Tax Insight:', serviceInsights.taxInsight.message);
    }
    
    // Test 5: Check duplicate prevention
    console.log('\n5. Testing duplicate prevention...');
    const duplicateInsights = await vehicleInsightService.generateVehicleInsights(
      testVehicle,
      TEST_USER_ID
    );
    
    console.log('✅ Duplicate generation:', {
      motInsight: !!duplicateInsights.motInsight,
      taxInsight: !!duplicateInsights.taxInsight,
      totalGenerated: Object.keys(duplicateInsights).length
    });
    
    // Clean up
    console.log('\n6. Cleaning up...');
    await storage.deleteVehicle(testVehicle.id, TEST_USER_ID);
    console.log('✅ Vehicle deleted');
    
    return true;
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    return false;
  }
}

// Run debug
debugInsightGeneration().catch(console.error);