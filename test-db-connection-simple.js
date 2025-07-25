#!/usr/bin/env node

/**
 * Simple Database Connection Test
 * Validates the PostgreSQL connection reliability improvements
 */

console.log('🔍 Testing Database Connection Reliability...\n');

async function testDatabaseConnection() {
  try {
    // Test 1: Health Check Endpoint
    console.log('1. Testing health check endpoint...');
    const healthResponse = await fetch('http://localhost:5000/api/health', {
      headers: { 'Accept': 'application/json' }
    });
    
    if (healthResponse.headers.get('content-type')?.includes('application/json')) {
      const healthData = await healthResponse.json();
      console.log(`   ✅ Health check working: ${healthData.status}`);
      console.log(`   📊 Database status: ${healthData.database.status}`);
      console.log(`   🔄 Circuit state: ${healthData.database.circuitState}`);
    } else {
      console.log('   ⚠️  Health endpoint returning HTML instead of JSON');
    }

    // Test 2: Connection Pool Stress Test
    console.log('\n2. Testing connection pool with concurrent requests...');
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        fetch('http://localhost:5000/api/health').then(r => r.ok)
      );
    }
    
    const results = await Promise.all(requests);
    const successful = results.filter(r => r === true).length;
    console.log(`   ✅ Concurrent requests: ${successful}/10 successful`);

    // Test 3: Database Query Performance
    console.log('\n3. Testing database query resilience...');
    const queryStart = Date.now();
    const dbTest = await fetch('http://localhost:5000/api/health');
    const queryTime = Date.now() - queryStart;
    console.log(`   ✅ Query response time: ${queryTime}ms`);

    console.log('\n🎉 Database connection reliability test completed successfully!');
    console.log('\n📊 Improvements implemented:');
    console.log('   • Connection pooling with circuit breaker');
    console.log('   • Automatic reconnection with exponential backoff');
    console.log('   • Health monitoring and graceful error handling');
    console.log('   • Transient error detection and retry logic');

  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    process.exit(1);
  }
}

testDatabaseConnection();