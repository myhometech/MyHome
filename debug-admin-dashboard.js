
#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testAdminEndpoints() {
  console.log('🧪 Testing Admin Dashboard Endpoints...\n');

  // First, try to get user info
  try {
    console.log('1. Testing /api/auth/user...');
    const userResponse = await fetch(`${BASE_URL}/api/auth/user`, {
      credentials: 'include',
      headers: {
        'Cookie': process.env.TEST_COOKIE || ''
      }
    });
    console.log('   Status:', userResponse.status);
    if (userResponse.ok) {
      const user = await userResponse.json();
      console.log('   User:', { id: user.id, email: user.email, role: user.role });
    } else {
      const error = await userResponse.text();
      console.log('   Error:', error);
    }
  } catch (error) {
    console.log('   Failed:', error.message);
  }

  console.log('\n2. Testing /api/admin/stats...');
  try {
    const statsResponse = await fetch(`${BASE_URL}/api/admin/stats`, {
      credentials: 'include',
      headers: {
        'Cookie': process.env.TEST_COOKIE || ''
      }
    });
    console.log('   Status:', statsResponse.status);
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      console.log('   Stats:', stats);
    } else {
      const error = await statsResponse.text();
      console.log('   Error:', error);
    }
  } catch (error) {
    console.log('   Failed:', error.message);
  }

  console.log('\n3. Testing /api/admin/users...');
  try {
    const usersResponse = await fetch(`${BASE_URL}/api/admin/users`, {
      credentials: 'include',
      headers: {
        'Cookie': process.env.TEST_COOKIE || ''
      }
    });
    console.log('   Status:', usersResponse.status);
    if (usersResponse.ok) {
      const users = await usersResponse.json();
      console.log('   Users count:', users?.length || 0);
      if (users?.length > 0) {
        console.log('   First user:', { id: users[0].id, email: users[0].email, role: users[0].role });
      }
    } else {
      const error = await usersResponse.text();
      console.log('   Error:', error);
    }
  } catch (error) {
    console.log('   Failed:', error.message);
  }

  console.log('\n🧪 Admin Dashboard Test Complete');
}

testAdminEndpoints().catch(console.error);
