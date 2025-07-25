#!/usr/bin/env node

/**
 * Feature Flagging System - Comprehensive Test Suite
 * Based on the layman-friendly test plan provided
 */

import fs from 'fs';
import path from 'path';

// Test configuration
const BASE_URL = 'http://localhost:5000';
const TEST_RESULTS = [];

// Test helper functions
async function makeRequest(url, options = {}) {
  const fetch = globalThis.fetch;
  
  // Handle cookies more carefully
  let cookieHeader = '';
  if (fs.existsSync('auth-cookies.txt')) {
    const cookieContent = fs.readFileSync('auth-cookies.txt', 'utf8').trim();
    // Only use the cookie if it doesn't contain the Netscape header
    if (!cookieContent.startsWith('# Netscape HTTP Cookie File')) {
      cookieHeader = cookieContent;
    }
  }
  
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader && { 'Cookie': cookieHeader }),
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok && !options.expectError) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return response;
}

function logTest(testName, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const message = `${status} - ${testName}${details ? ' - ' + details : ''}`;
  console.log(message);
  TEST_RESULTS.push({ testName, passed, details, message });
}

// 🔹 1. Feature Evaluation Logic Tests
async function testFeatureEvaluationLogic() {
  console.log('\n🔹 1. FEATURE EVALUATION LOGIC TESTS\n');
  
  try {
    // Test: Globally enabled feature should be available
    const globallyEnabledResponse = await makeRequest('/api/feature-flags/DOCUMENT_UPLOAD/check');
    const globallyEnabledData = await globallyEnabledResponse.json();
    logTest(
      'Globally enabled feature availability',
      globallyEnabledData.enabled === true,
      `DOCUMENT_UPLOAD should be enabled: ${globallyEnabledData.enabled}`
    );

    // Test: Check batch evaluation returns features
    const batchResponse = await makeRequest('/api/feature-flags/batch-evaluation');
    const batchData = await batchResponse.json();
    logTest(
      'Batch feature evaluation',
      Array.isArray(batchData.enabledFeatures) && batchData.enabledFeatures.length > 0,
      `Returned ${batchData.enabledFeatures?.length || 0} enabled features`
    );

    // Test: Feature caching (same request should be fast)
    const startTime = Date.now();
    await makeRequest('/api/feature-flags/DOCUMENT_UPLOAD/check');
    const cacheTime = Date.now() - startTime;
    logTest(
      'Feature flag caching performance',
      cacheTime < 100,
      `Response time: ${cacheTime}ms (should be under 100ms with caching)`
    );

  } catch (error) {
    logTest('Feature evaluation logic tests', false, `Error: ${error.message}`);
  }
}

// 🔹 2. Database Integrity Tests
async function testDatabaseIntegrity() {
  console.log('\n🔹 2. DATABASE INTEGRITY TESTS\n');
  
  try {
    // Test: No duplicate feature names
    const flagsResponse = await makeRequest('/api/admin/feature-flags');
    const flags = await flagsResponse.json();
    const flagNames = flags.map(f => f.name);
    const uniqueNames = new Set(flagNames);
    logTest(
      'No duplicate feature names',
      flagNames.length === uniqueNames.size,
      `${flagNames.length} total flags, ${uniqueNames.size} unique names`
    );

    // Test: All required feature categories exist
    const expectedCategories = ['core', 'advanced', 'ai', 'automation', 'collaboration'];
    const categories = [...new Set(flags.map(f => f.category))];
    const hasAllCategories = expectedCategories.every(cat => categories.includes(cat));
    logTest(
      'All feature categories present',
      hasAllCategories,
      `Expected: ${expectedCategories.join(', ')} | Found: ${categories.join(', ')}`
    );

    // Test: Feature flags have valid tier requirements
    const validTiers = ['free', 'premium'];
    const invalidTiers = flags.filter(f => !validTiers.includes(f.tierRequired));
    logTest(
      'Valid tier requirements',
      invalidTiers.length === 0,
      invalidTiers.length > 0 ? `Invalid tiers found: ${invalidTiers.map(f => f.name).join(', ')}` : 'All tiers valid'
    );

  } catch (error) {
    logTest('Database integrity tests', false, `Error: ${error.message}`);
  }
}

// 🔹 3. API Tests
async function testAPIEndpoints() {
  console.log('\n🔹 3. API ENDPOINT TESTS\n');
  
  try {
    // Test: Admin feature flags endpoint
    const adminResponse = await makeRequest('/api/admin/feature-flags');
    const adminData = await adminResponse.json();
    logTest(
      'Admin feature flags endpoint',
      Array.isArray(adminData) && adminData.length > 0,
      `Returned ${adminData.length} feature flags`
    );

    // Test: Feature flag analytics endpoint
    const analyticsResponse = await makeRequest('/api/admin/feature-flag-analytics');
    const analytics = await analyticsResponse.json();
    const hasValidAnalytics = analytics.totalFlags > 0 && analytics.activeFlags >= 0;
    logTest(
      'Feature flag analytics',
      hasValidAnalytics,
      `Total: ${analytics.totalFlags}, Active: ${analytics.activeFlags}, Premium: ${analytics.premiumFlags}`
    );

    // Test: Feature flag overrides endpoint
    const overridesResponse = await makeRequest('/api/admin/feature-flag-overrides');
    const overrides = await overridesResponse.json();
    logTest(
      'Feature flag overrides endpoint',
      Array.isArray(overrides),
      `Found ${overrides.length} user overrides`
    );

    // Test: Individual feature check endpoint structure
    const individualResponse = await makeRequest('/api/feature-flags/BASIC_SEARCH/check');
    const individualData = await individualResponse.json();
    logTest(
      'Individual feature check response structure',
      typeof individualData.enabled === 'boolean',
      `BASIC_SEARCH enabled: ${individualData.enabled}`
    );

  } catch (error) {
    logTest('API endpoint tests', false, `Error: ${error.message}`);
  }
}

// 🔹 4. Frontend UI Integration Tests
async function testFrontendIntegration() {
  console.log('\n🔹 4. FRONTEND INTEGRATION TESTS\n');
  
  try {
    // Test: Admin feature flags page exists
    const adminPageResponse = await makeRequest('/admin/feature-flags', { expectError: true });
    logTest(
      'Admin feature flags page accessibility',
      adminPageResponse.status === 200 || adminPageResponse.status === 401,
      `Status: ${adminPageResponse.status} (200 OK or 401 Unauthorized expected)`
    );

    // Test: Feature flag hook integration (check if the data structure is correct)
    const batchResponse = await makeRequest('/api/feature-flags/batch-evaluation');
    const batchData = await batchResponse.json();
    const hasEnabledFeatures = batchData.hasOwnProperty('enabledFeatures');
    logTest(
      'Frontend hook data structure',
      hasEnabledFeatures,
      `Response contains enabledFeatures array: ${hasEnabledFeatures}`
    );

  } catch (error) {
    logTest('Frontend integration tests', false, `Error: ${error.message}`);
  }
}

// 🔹 5. Rollout and Tracking Tests
async function testRolloutTracking() {
  console.log('\n🔹 5. ROLLOUT AND TRACKING TESTS\n');
  
  try {
    // Test: Feature flags have rollout percentage settings
    const flagsResponse = await makeRequest('/api/admin/feature-flags');
    const flags = await flagsResponse.json();
    const flagsWithRollout = flags.filter(f => f.rolloutPercentage !== undefined);
    logTest(
      'Feature flags support rollout percentages',
      flagsWithRollout.length > 0,
      `${flagsWithRollout.length} flags have rollout percentage settings`
    );

    // Test: Deterministic rollout (same user should get same result)
    const firstCheck = await makeRequest('/api/feature-flags/batch-evaluation');
    const firstData = await firstCheck.json();
    const secondCheck = await makeRequest('/api/feature-flags/batch-evaluation');
    const secondData = await secondCheck.json();
    
    const firstFeatures = JSON.stringify(firstData.enabledFeatures?.sort());
    const secondFeatures = JSON.stringify(secondData.enabledFeatures?.sort());
    logTest(
      'Deterministic feature evaluation',
      firstFeatures === secondFeatures,
      'Same user should get consistent feature flags across requests'
    );

  } catch (error) {
    logTest('Rollout and tracking tests', false, `Error: ${error.message}`);
  }
}

// 🔹 6. Edge Cases and Security Tests
async function testEdgeCasesAndSecurity() {
  console.log('\n🔹 6. EDGE CASES AND SECURITY TESTS\n');
  
  try {
    // Test: Non-existent feature flag
    const nonExistentResponse = await makeRequest('/api/feature-flags/NON_EXISTENT_FEATURE/check', { expectError: true });
    logTest(
      'Non-existent feature flag handling',
      nonExistentResponse.status === 404 || nonExistentResponse.status === 500,
      `Status: ${nonExistentResponse.status} (should handle gracefully)`
    );

    // Test: Admin endpoints require authentication
    const unauthorizedResponse = await makeRequest('/api/admin/feature-flags', { 
      expectError: true,
      headers: { 'Cookie': '' } // Remove auth cookies
    });
    logTest(
      'Admin endpoints require authentication',
      unauthorizedResponse.status === 401 || unauthorizedResponse.status === 403,
      `Status: ${unauthorizedResponse.status} (should be 401/403 Unauthorized)`
    );

    // Test: Malformed requests
    const malformedResponse = await makeRequest('/api/feature-flags//check', { expectError: true });
    logTest(
      'Malformed request handling',
      malformedResponse.status >= 400,
      `Status: ${malformedResponse.status} (should return error for malformed requests)`
    );

  } catch (error) {
    logTest('Edge cases and security tests', false, `Error: ${error.message}`);
  }
}

// Main test execution
async function runAllTests() {
  console.log('🚀 FEATURE FLAGGING SYSTEM - COMPREHENSIVE TEST SUITE');
  console.log('======================================================\n');
  
  const startTime = Date.now();
  
  await testFeatureEvaluationLogic();
  await testDatabaseIntegrity();
  await testAPIEndpoints();
  await testFrontendIntegration();
  await testRolloutTracking();
  await testEdgeCasesAndSecurity();
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  // Generate summary
  console.log('\n======================================================');
  console.log('📊 TEST SUMMARY');
  console.log('======================================================\n');
  
  const totalTests = TEST_RESULTS.length;
  const passedTests = TEST_RESULTS.filter(t => t.passed).length;
  const failedTests = totalTests - passedTests;
  const successRate = Math.round((passedTests / totalTests) * 100);
  
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ❌`);
  console.log(`Success Rate: ${successRate}%`);
  console.log(`Duration: ${duration}ms\n`);
  
  if (failedTests > 0) {
    console.log('❌ FAILED TESTS:');
    TEST_RESULTS.filter(t => !t.passed).forEach(test => {
      console.log(`   • ${test.testName}: ${test.details}`);
    });
  }
  
  // Save detailed results
  const reportData = {
    timestamp: new Date().toISOString(),
    duration,
    summary: { totalTests, passedTests, failedTests, successRate },
    results: TEST_RESULTS
  };
  
  fs.writeFileSync('feature-flag-test-results.json', JSON.stringify(reportData, null, 2));
  console.log('\n📝 Detailed results saved to: feature-flag-test-results.json');
  
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests if this file is executed directly
runAllTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});

export { runAllTests, TEST_RESULTS };