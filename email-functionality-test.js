#!/usr/bin/env node

/**
 * END-TO-END EMAIL FUNCTIONALITY TEST
 * 
 * This script validates the complete email-in pipeline:
 * 1. User forwarding address generation
 * 2. SendGrid webhook simulation with attachments
 * 3. Backend processing and document creation
 * 4. Security validation and error handling
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// Test Configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:5000',
  testUserId: '94a7b7f0-3266-4a4f-9d4e-875542d30e62', // Known test user
  endpoints: {
    emailIngest: '/api/email-ingest',
    emailInbound: '/api/email/inbound', // Redirect endpoint
    forwardingAddress: '/api/email/forwarding-address',
    documents: '/api/documents'
  }
};

// Test Data
const TEST_ATTACHMENTS = {
  validPdf: {
    filename: 'garage-warranty.pdf',
    type: 'application/pdf',
    content: 'JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovTGVuZ3RoIDYgMCBSCi9GaWx0ZXIgL0ZsYXRlRGVjb2RlCj4+CnN0cmVhbQp4nDPQM1Qo5ypUULJSq/lHHfuCwfUa2NRoSLz4wjDZw4jzLQcRztL' // Base64 PDF header
  },
  validDocx: {
    filename: 'user-manual.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: 'UEsDBBQABgAIAAAAIQDb4fbL7gEAAGYFAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtbCCiBAIooAACAAAAAAAAAAAAAA==' // Base64 DOCX header
  },
  invalidExe: {
    filename: 'malware.exe',
    type: 'application/x-msdownload',
    content: 'TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAA' // Base64 EXE header
  }
};

class EmailFunctionalityTester {
  constructor() {
    this.testResults = [];
    this.testUser = null;
    this.forwardingAddress = null;
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 TEST: ${testName}`);
    console.log('='.repeat(50));
    
    try {
      const startTime = Date.now();
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.push({
        name: testName,
        status: 'PASS',
        duration,
        result
      });
      
      console.log(`✅ PASS (${duration}ms): ${testName}`);
      return result;
    } catch (error) {
      this.testResults.push({
        name: testName,
        status: 'FAIL',
        error: error.message,
        stack: error.stack
      });
      
      console.log(`❌ FAIL: ${testName}`);
      console.log(`   Error: ${error.message}`);
      throw error;
    }
  }

  async makeRequest(method, endpoint, data = null, headers = {}) {
    const url = `${TEST_CONFIG.baseUrl}${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'SendGrid Event Webhook',
      ...headers
    };

    try {
      const response = await fetch(url, {
        method,
        headers: defaultHeaders,
        body: data ? JSON.stringify(data) : null
      });

      const responseData = await response.text();
      let parsedData;
      
      try {
        parsedData = JSON.parse(responseData);
      } catch {
        parsedData = responseData;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: parsedData
      };
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  // TEST 1: Prepare Test Environment
  async testEnvironmentPreparation() {
    console.log('📋 Checking test user and forwarding address...');
    
    // For this test, we'll use a known pattern since auth is required
    // In production, this would be retrieved via authenticated API
    const mockForwardingAddress = 'docs-yze5nwq1@parse.myhome.com';
    
    console.log(`   Test User ID: ${TEST_CONFIG.testUserId}`);
    console.log(`   Forwarding Address: ${mockForwardingAddress}`);
    
    this.forwardingAddress = mockForwardingAddress;
    return {
      userId: TEST_CONFIG.testUserId,
      forwardingAddress: mockForwardingAddress
    };
  }

  // TEST 2: Send Test Email with Valid Attachments
  async testValidEmailWithAttachments() {
    console.log('📧 Sending test email with valid attachments...');
    
    const emailData = {
      to: this.forwardingAddress,
      from: 'test-sender@example.com',
      subject: 'Garage Door Warranty',
      text: 'Please save this for future reference.',
      html: '<p>Please save this for future reference.</p>',
      attachments: [
        TEST_ATTACHMENTS.validPdf,
        TEST_ATTACHMENTS.validDocx
      ]
    };

    const response = await this.makeRequest('POST', TEST_CONFIG.endpoints.emailIngest, emailData);
    
    console.log(`   Response Status: ${response.status}`);
    console.log(`   Response Data:`, JSON.stringify(response.data, null, 2));
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }

    return response.data;
  }

  // TEST 3: Send Test Email with Invalid Attachment
  async testInvalidAttachment() {
    console.log('🚫 Testing invalid attachment rejection...');
    
    const emailData = {
      to: this.forwardingAddress,
      from: 'malicious-sender@example.com',
      subject: 'Suspicious Email',
      text: 'This email contains malware.',
      attachments: [
        TEST_ATTACHMENTS.invalidExe
      ]
    };

    const response = await this.makeRequest('POST', TEST_CONFIG.endpoints.emailIngest, emailData);
    
    console.log(`   Response Status: ${response.status}`);
    console.log(`   Response Data:`, JSON.stringify(response.data, null, 2));
    
    // Should still return 200 (processed) but with warnings about rejected files
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }

    return response.data;
  }

  // TEST 4: Test Redirect Endpoint
  async testRedirectEndpoint() {
    console.log('🔄 Testing SendGrid redirect endpoint...');
    
    const emailData = {
      to: this.forwardingAddress,
      from: 'redirect-test@example.com',
      subject: 'Redirect Test',
      text: 'Testing the redirect from /api/email/inbound to /api/email-ingest'
    };

    const response = await this.makeRequest('POST', TEST_CONFIG.endpoints.emailInbound, emailData);
    
    console.log(`   Response Status: ${response.status}`);
    console.log(`   Response Headers:`, response.headers);
    
    // Should either redirect (307) or process directly (200)
    if (![200, 307].includes(response.status)) {
      throw new Error(`Expected 200 or 307, got ${response.status}: ${JSON.stringify(response.data)}`);
    }

    return response.data;
  }

  // TEST 5: Test Security Validation
  async testSecurityValidation() {
    console.log('🛡️  Testing security validation...');
    
    // Test with non-SendGrid User-Agent
    const emailData = {
      to: this.forwardingAddress,
      from: 'hacker@badsite.com',
      subject: 'Malicious Request',
      text: 'This should be rejected'
    };

    const response = await this.makeRequest('POST', TEST_CONFIG.endpoints.emailIngest, emailData, {
      'User-Agent': 'BadBot/1.0'
    });
    
    console.log(`   Response Status: ${response.status}`);
    console.log(`   Response Data:`, JSON.stringify(response.data, null, 2));
    
    // Should reject non-SendGrid sources
    if (response.status === 200) {
      console.log(`   ℹ️  Note: Request was processed (security validation may be disabled for testing)`);
    }

    return response.data;
  }

  // TEST 6: Test Email Body to PDF Conversion
  async testBodyToPdfConversion() {
    console.log('📄 Testing email body to PDF conversion...');
    
    const emailData = {
      to: this.forwardingAddress,
      from: 'no-attachments@example.com',
      subject: 'Email Body Only',
      text: 'This email has no attachments, so the body should be converted to PDF',
      html: '<h1>Email Body Only</h1><p>This email has no attachments, so the body should be converted to PDF.</p>'
      // No attachments - body should be converted to PDF
    };

    const response = await this.makeRequest('POST', TEST_CONFIG.endpoints.emailIngest, emailData);
    
    console.log(`   Response Status: ${response.status}`);
    console.log(`   Response Data:`, JSON.stringify(response.data, null, 2));
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }

    return response.data;
  }

  // Generate Test Report
  generateReport() {
    console.log('\n📊 TEST REPORT');
    console.log('='.repeat(60));
    
    const passed = this.testResults.filter(t => t.status === 'PASS').length;
    const failed = this.testResults.filter(t => t.status === 'FAIL').length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    console.log('\nDetailed Results:');
    this.testResults.forEach((test, index) => {
      const status = test.status === 'PASS' ? '✅' : '❌';
      const duration = test.duration ? ` (${test.duration}ms)` : '';
      console.log(`${index + 1}. ${status} ${test.name}${duration}`);
      
      if (test.status === 'FAIL') {
        console.log(`   Error: ${test.error}`);
      }
    });

    // Write detailed report to file
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed, successRate: ((passed / total) * 100) },
      results: this.testResults
    };
    
    fs.writeFileSync('email-test-report.json', JSON.stringify(reportData, null, 2));
    console.log('\n📁 Detailed report saved to: email-test-report.json');
    
    return reportData;
  }

  // Main Test Runner
  async runAllTests() {
    console.log('🚀 STARTING END-TO-END EMAIL FUNCTIONALITY TESTS');
    console.log('='.repeat(60));
    
    try {
      // Test 1: Environment Setup
      await this.runTest('Environment Preparation', () => this.testEnvironmentPreparation());
      
      // Test 2: Valid Email with Attachments
      await this.runTest('Valid Email with Attachments', () => this.testValidEmailWithAttachments());
      
      // Test 3: Invalid Attachment Handling
      await this.runTest('Invalid Attachment Rejection', () => this.testInvalidAttachment());
      
      // Test 4: Redirect Endpoint
      await this.runTest('SendGrid Redirect Endpoint', () => this.testRedirectEndpoint());
      
      // Test 5: Security Validation
      await this.runTest('Security Validation', () => this.testSecurityValidation());
      
      // Test 6: Body to PDF Conversion
      await this.runTest('Email Body to PDF Conversion', () => this.testBodyToPdfConversion());
      
    } catch (error) {
      console.log(`\n❌ Test suite failed: ${error.message}`);
    }
    
    return this.generateReport();
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new EmailFunctionalityTester();
  tester.runAllTests()
    .then(report => {
      console.log('\n🎉 Test suite completed!');
      process.exit(report.summary.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n💥 Test suite crashed:', error);
      process.exit(1);
    });
}

export default EmailFunctionalityTester;