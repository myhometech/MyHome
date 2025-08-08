
const fetch = require('node-fetch');

async function testAdminEndpoints() {
  const baseUrl = 'http://localhost:5000';
  
  try {
    // Test basic server health
    console.log('Testing server health...');
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    console.log('Health check:', healthResponse.status, await healthResponse.text());
    
    // Test admin stats endpoint (will likely fail without auth)
    console.log('\nTesting admin stats...');
    const statsResponse = await fetch(`${baseUrl}/api/admin/stats`);
    console.log('Admin stats:', statsResponse.status, await statsResponse.text());
    
  } catch (error) {
    console.error('Error testing endpoints:', error.message);
  }
}

testAdminEndpoints();
