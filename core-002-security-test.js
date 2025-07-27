#!/usr/bin/env node

/**
 * CORE-002 Security Headers and Health Monitoring Test Suite
 * 
 * Validates implementation of:
 * - Security headers (helmet, CSP, HSTS, etc.)
 * - Rate limiting functionality  
 * - CORS policy enforcement
 * - Enhanced health monitoring endpoint
 */

import axios from 'axios';
import { performance } from 'perf_hooks';

const BASE_URL = 'http://localhost:5000';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logTest(testName, status, details = '') {
  const statusColor = status === 'PASS' ? colors.green : 
                     status === 'WARN' ? colors.yellow : colors.red;
  const statusSymbol = status === 'PASS' ? '✅' : 
                      status === 'WARN' ? '⚠️' : '❌';
  
  log(`${statusSymbol} ${testName}: ${colors.bold}${statusColor}${status}${colors.reset}${details ? ' - ' + details : ''}`);
}

class SecurityTester {
  constructor() {
    this.results = {
      securityHeaders: {},
      rateLimiting: {},
      corsPolicy: {},
      healthMonitoring: {},
      overall: { passed: 0, failed: 0, warnings: 0 }
    };
  }

  async runAllTests() {
    log(`${colors.blue}${colors.bold}🔒 CORE-002 Security Implementation Test Suite${colors.reset}\n`);
    
    try {
      await this.testSecurityHeaders();
      await this.testRateLimiting();
      await this.testCorsPolicy();
      await this.testEnhancedHealthMonitoring();
      
      this.printSummary();
      
    } catch (error) {
      log(`${colors.red}Test suite failed: ${error.message}${colors.reset}`);
      process.exit(1);
    }
  }

  async testSecurityHeaders() {
    log(`${colors.bold}1. Security Headers Test${colors.reset}`);
    
    try {
      const response = await axios.get(`${BASE_URL}/api/health`, {
        validateStatus: () => true
      });
      
      const headers = response.headers;
      
      // Test Content Security Policy
      if (headers['content-security-policy']) {
        logTest('Content-Security-Policy Header', 'PASS', 'CSP header present');
        this.results.overall.passed++;
      } else {
        logTest('Content-Security-Policy Header', 'WARN', 'May be disabled in development');
        this.results.overall.warnings++;
      }
      
      // Test Strict Transport Security
      if (headers['strict-transport-security']) {
        logTest('HSTS Header', 'PASS', headers['strict-transport-security']);
        this.results.overall.passed++;
      } else {
        logTest('HSTS Header', 'WARN', 'May be disabled in development');
        this.results.overall.warnings++;
      }
      
      // Test X-Frame-Options
      if (headers['x-frame-options']) {
        logTest('X-Frame-Options Header', 'PASS', headers['x-frame-options']);
        this.results.overall.passed++;
      } else {
        logTest('X-Frame-Options Header', 'FAIL', 'Missing anti-clickjacking protection');
        this.results.overall.failed++;
      }
      
      // Test X-Content-Type-Options
      if (headers['x-content-type-options']) {
        logTest('X-Content-Type-Options Header', 'PASS', headers['x-content-type-options']);
        this.results.overall.passed++;
      } else {
        logTest('X-Content-Type-Options Header', 'FAIL', 'Missing MIME type protection');
        this.results.overall.failed++;
      }
      
      // Test X-XSS-Protection
      if (headers['x-xss-protection']) {
        logTest('X-XSS-Protection Header', 'PASS', headers['x-xss-protection']);
        this.results.overall.passed++;
      } else {
        logTest('X-XSS-Protection Header', 'FAIL', 'Missing XSS protection');
        this.results.overall.failed++;
      }
      
      // Test X-Powered-By is hidden
      if (!headers['x-powered-by']) {
        logTest('X-Powered-By Header Hidden', 'PASS', 'Server technology concealed');
        this.results.overall.passed++;
      } else {
        logTest('X-Powered-By Header Hidden', 'FAIL', 'Server technology exposed');
        this.results.overall.failed++;
      }
      
      // Test Referrer Policy
      if (headers['referrer-policy']) {
        logTest('Referrer-Policy Header', 'PASS', headers['referrer-policy']);
        this.results.overall.passed++;
      } else {
        logTest('Referrer-Policy Header', 'WARN', 'Referrer policy not set');
        this.results.overall.warnings++;
      }
      
    } catch (error) {
      logTest('Security Headers Test', 'FAIL', `Error: ${error.message}`);
      this.results.overall.failed++;
    }
    
    log('');
  }

  async testRateLimiting() {
    log(`${colors.bold}2. Rate Limiting Test${colors.reset}`);
    
    try {
      // Test normal request rate (should pass)
      const normalResponse = await axios.get(`${BASE_URL}/api/health`);
      logTest('Normal Request Rate', 'PASS', `Status: ${normalResponse.status}`);
      this.results.overall.passed++;
      
      // Test rapid requests (should eventually hit rate limit)
      let rateLimitHit = false;
      let requestCount = 0;
      
      for (let i = 0; i < 110; i++) { // Attempt more than the 100 request limit
        try {
          await axios.get(`${BASE_URL}/api/docs`, { validateStatus: () => true });
          requestCount++;
        } catch (error) {
          if (error.response && error.response.status === 429) {
            rateLimitHit = true;
            break;
          }
        }
        
        // Small delay to prevent overwhelming the server
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      if (rateLimitHit) {
        logTest('Rate Limit Enforcement', 'PASS', `Rate limit hit after ${requestCount} requests`);
        this.results.overall.passed++;
      } else {
        logTest('Rate Limit Enforcement', 'WARN', 'Rate limit may not be properly configured');
        this.results.overall.warnings++;
      }
      
      // Test rate limit headers
      const testResponse = await axios.get(`${BASE_URL}/api/health`, { validateStatus: () => true });
      const rateLimitHeaders = ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'];
      const hasRateLimitHeaders = rateLimitHeaders.some(header => testResponse.headers[header]);
      
      if (hasRateLimitHeaders) {
        logTest('Rate Limit Headers', 'PASS', 'Rate limit information provided');
        this.results.overall.passed++;
      } else {
        logTest('Rate Limit Headers', 'WARN', 'Rate limit headers not found');
        this.results.overall.warnings++;
      }
      
    } catch (error) {
      logTest('Rate Limiting Test', 'FAIL', `Error: ${error.message}`);
      this.results.overall.failed++;
    }
    
    log('');
  }

  async testCorsPolicy() {
    log(`${colors.bold}3. CORS Policy Test${colors.reset}`);
    
    try {
      // Test CORS headers
      const response = await axios.get(`${BASE_URL}/api/health`, {
        headers: {
          'Origin': 'http://localhost:3000'
        },
        validateStatus: () => true
      });
      
      if (response.headers['access-control-allow-origin']) {
        logTest('CORS Headers Present', 'PASS', `Origin: ${response.headers['access-control-allow-origin']}`);
        this.results.overall.passed++;
      } else {
        logTest('CORS Headers Present', 'FAIL', 'CORS headers missing');
        this.results.overall.failed++;
      }
      
      // Test credentials support
      if (response.headers['access-control-allow-credentials']) {
        logTest('CORS Credentials Support', 'PASS', 'Credentials allowed');
        this.results.overall.passed++;
      } else {
        logTest('CORS Credentials Support', 'WARN', 'Credentials not explicitly allowed');
        this.results.overall.warnings++;
      }
      
      // Test allowed methods
      if (response.headers['access-control-allow-methods']) {
        logTest('CORS Methods Configuration', 'PASS', response.headers['access-control-allow-methods']);
        this.results.overall.passed++;
      } else {
        logTest('CORS Methods Configuration', 'WARN', 'Methods not explicitly configured');
        this.results.overall.warnings++;
      }
      
    } catch (error) {
      logTest('CORS Policy Test', 'FAIL', `Error: ${error.message}`);
      this.results.overall.failed++;
    }
    
    log('');
  }

  async testEnhancedHealthMonitoring() {
    log(`${colors.bold}4. Enhanced Health Monitoring Test${colors.reset}`);
    
    try {
      const startTime = performance.now();
      const response = await axios.get(`${BASE_URL}/api/health`);
      const responseTime = performance.now() - startTime;
      
      const health = response.data;
      
      // Test overall health structure
      if (health.status && health.timestamp && health.subsystems) {
        logTest('Health Endpoint Structure', 'PASS', `Status: ${health.status}`);
        this.results.overall.passed++;
      } else {
        logTest('Health Endpoint Structure', 'FAIL', 'Invalid health response structure');
        this.results.overall.failed++;
        return;
      }
      
      // Test database subsystem
      if (health.subsystems.database) {
        const dbStatus = health.subsystems.database.status;
        logTest('Database Connectivity Check', dbStatus === 'healthy' ? 'PASS' : 'WARN', 
               `Status: ${dbStatus}, Response: ${health.subsystems.database.responseTime || 'N/A'}ms`);
        if (dbStatus === 'healthy') this.results.overall.passed++;
        else this.results.overall.warnings++;
      } else {
        logTest('Database Connectivity Check', 'FAIL', 'Database health check missing');
        this.results.overall.failed++;
      }
      
      // Test memory subsystem
      if (health.subsystems.memory) {
        const memStatus = health.subsystems.memory.status;
        logTest('Memory Usage Check', memStatus === 'healthy' ? 'PASS' : 'WARN',
               `Status: ${memStatus}`);
        if (memStatus === 'healthy') this.results.overall.passed++;
        else this.results.overall.warnings++;
      } else {
        logTest('Memory Usage Check', 'FAIL', 'Memory health check missing');
        this.results.overall.failed++;
      }
      
      // Test disk subsystem
      if (health.subsystems.disk) {
        const diskStatus = health.subsystems.disk.status;
        logTest('Disk Usage Check', diskStatus === 'healthy' ? 'PASS' : 'WARN',
               `Status: ${diskStatus}`);
        if (diskStatus === 'healthy') this.results.overall.passed++;
        else this.results.overall.warnings++;
      } else {
        logTest('Disk Usage Check', 'FAIL', 'Disk health check missing');
        this.results.overall.failed++;
      }
      
      // Test environment subsystem
      if (health.subsystems.environment) {
        const envStatus = health.subsystems.environment.status;
        logTest('Environment Configuration Check', envStatus === 'healthy' ? 'PASS' : 'WARN',
               `Status: ${envStatus}`);
        if (envStatus === 'healthy') this.results.overall.passed++;
        else this.results.overall.warnings++;
      } else {
        logTest('Environment Configuration Check', 'FAIL', 'Environment health check missing');
        this.results.overall.failed++;
      }
      
      // Test metrics presence
      if (health.metrics && health.metrics.memoryUsage && health.metrics.systemMemory) {
        logTest('System Metrics Collection', 'PASS', 
               `Memory: ${(health.metrics.systemMemory.percentUsed * 100).toFixed(1)}%, CPUs: ${health.metrics.cpuCount}`);
        this.results.overall.passed++;
      } else {
        logTest('System Metrics Collection', 'FAIL', 'System metrics missing');
        this.results.overall.failed++;
      }
      
      // Test response time
      if (responseTime < 1000) {
        logTest('Health Check Response Time', 'PASS', `${responseTime.toFixed(2)}ms`);
        this.results.overall.passed++;
      } else {
        logTest('Health Check Response Time', 'WARN', `${responseTime.toFixed(2)}ms (slow)`);
        this.results.overall.warnings++;
      }
      
    } catch (error) {
      logTest('Enhanced Health Monitoring Test', 'FAIL', `Error: ${error.message}`);
      this.results.overall.failed++;
    }
    
    log('');
  }

  printSummary() {
    log(`${colors.bold}📊 Test Summary${colors.reset}`);
    log(`${colors.green}✅ Passed: ${this.results.overall.passed}${colors.reset}`);
    log(`${colors.yellow}⚠️  Warnings: ${this.results.overall.warnings}${colors.reset}`);
    log(`${colors.red}❌ Failed: ${this.results.overall.failed}${colors.reset}`);
    
    const total = this.results.overall.passed + this.results.overall.warnings + this.results.overall.failed;
    const successRate = ((this.results.overall.passed + this.results.overall.warnings * 0.5) / total * 100).toFixed(1);
    
    log(`\n${colors.bold}Overall Success Rate: ${successRate}%${colors.reset}`);
    
    if (this.results.overall.failed === 0) {
      log(`${colors.green}${colors.bold}🎉 CORE-002 Implementation: SUCCESSFUL${colors.reset}`);
    } else if (this.results.overall.failed <= 2) {
      log(`${colors.yellow}${colors.bold}⚠️  CORE-002 Implementation: MOSTLY SUCCESSFUL (minor issues)${colors.reset}`);
    } else {
      log(`${colors.red}${colors.bold}❌ CORE-002 Implementation: NEEDS ATTENTION${colors.reset}`);
    }
  }
}

// Run the tests
const tester = new SecurityTester();
tester.runAllTests().catch(console.error);