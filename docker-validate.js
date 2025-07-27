#!/usr/bin/env node

/**
 * Docker Validation Script for MyHome Backend
 * Validates Dockerfile and .dockerignore without requiring Docker installation
 */

import fs from 'fs';
import path from 'path';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

async function validateDockerSetup() {
  log('🐳 Validating Docker setup for MyHome Backend...\n');
  
  let passed = 0;
  let total = 0;
  
  // Test 1: Check if Dockerfile exists
  total++;
  if (fs.existsSync('Dockerfile')) {
    success('Dockerfile exists');
    passed++;
  } else {
    error('Dockerfile not found');
    return;
  }
  
  // Test 2: Check if .dockerignore exists
  total++;
  if (fs.existsSync('.dockerignore')) {
    success('.dockerignore exists');
    passed++;
  } else {
    error('.dockerignore not found');
  }
  
  // Test 3: Validate Dockerfile content
  total++;
  const dockerfileContent = fs.readFileSync('Dockerfile', 'utf8');
  
  const requiredElements = [
    { pattern: /FROM\s+node:18-alpine/, message: 'Uses Node.js 18 Alpine base image' },
    { pattern: /WORKDIR\s+\/app/, message: 'Sets working directory to /app' },
    { pattern: /COPY\s+package\*\.json/, message: 'Copies package files first (optimization)' },
    { pattern: /RUN\s+npm\s+ci/, message: 'Uses npm ci for production dependencies' },
    { pattern: /EXPOSE\s+5000/, message: 'Exposes port 5000' },
    { pattern: /CMD\s+\[\"npm\",\s*\"start\"\]/, message: 'Uses npm start as entry point' },
    { pattern: /USER\s+nodejs/, message: 'Runs as non-root user' },
    { pattern: /HEALTHCHECK/, message: 'Includes health check' }
  ];
  
  let dockerfileValid = true;
  requiredElements.forEach(({ pattern, message }) => {
    if (pattern.test(dockerfileContent)) {
      success(`Dockerfile: ${message}`);
    } else {
      error(`Dockerfile missing: ${message}`);
      dockerfileValid = false;
    }
  });
  
  if (dockerfileValid) {
    passed++;
  }
  
  // Test 4: Validate .dockerignore content
  total++;
  const dockerignoreContent = fs.readFileSync('.dockerignore', 'utf8');
  
  const ignoredItems = [
    'node_modules',
    '.env',
    '.git',
    '*.log',
    'uploads/',
    'test-*'
  ];
  
  let dockerignoreValid = true;
  ignoredItems.forEach(item => {
    if (dockerignoreContent.includes(item)) {
      success(`.dockerignore: Excludes ${item}`);
    } else {
      warning(`.dockerignore: Missing ${item}`);
      dockerignoreValid = false;
    }
  });
  
  if (dockerignoreValid) {
    passed++;
  }
  
  // Test 5: Check package.json for start script
  total++;
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  if (packageJson.scripts && packageJson.scripts.start) {
    success('package.json has start script');
    passed++;
  } else {
    error('package.json missing start script');
  }
  
  // Test 6: Check if build script exists
  total++;
  if (packageJson.scripts && packageJson.scripts.build) {
    success('package.json has build script');
    passed++;
  } else {
    error('package.json missing build script');
  }
  
  // Test 7: Validate environment variable handling
  total++;
  const serverIndexPath = 'server/index.ts';
  if (fs.existsSync(serverIndexPath)) {
    const serverContent = fs.readFileSync(serverIndexPath, 'utf8');
    if (serverContent.includes('dotenv')) {
      success('Server handles environment variables');
      passed++;
    } else {
      warning('Server may not handle environment variables properly');
    }
  } else {
    warning('Cannot validate environment variable handling - server/index.ts not found');
  }
  
  // Test 8: Check Google Cloud Storage integration
  total++;
  const storageServicePath = 'server/storage/StorageService.ts';
  if (fs.existsSync(storageServicePath)) {
    const storageContent = fs.readFileSync(storageServicePath, 'utf8');
    if (storageContent.includes('GCSStorage') && storageContent.includes('STORAGE_TYPE')) {
      success('Google Cloud Storage integration present');
      passed++;
    } else {
      warning('GCS integration may be incomplete');
    }
  } else {
    warning('Cannot validate GCS integration - StorageService.ts not found');
  }
  
  // Test 9: Validate critical dependencies
  total++;
  const criticalDeps = [
    '@google-cloud/storage',
    'express',
    'dotenv',
    'drizzle-orm'
  ];
  
  let depsValid = true;
  criticalDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      success(`Dependency: ${dep} present`);
    } else {
      error(`Missing critical dependency: ${dep}`);
      depsValid = false;
    }
  });
  
  if (depsValid) {
    passed++;
  }
  
  // Test 10: Check for production readiness
  total++;
  const prodChecks = [
    { check: () => dockerfileContent.includes('--only=production'), message: 'Production-only dependencies' },
    { check: () => dockerfileContent.includes('adduser'), message: 'Non-root user creation' },
    { check: () => dockerfileContent.includes('chown'), message: 'Proper file ownership' },
    { check: () => dockerignoreContent.includes('.env'), message: 'Environment files excluded' }
  ];
  
  let prodReady = true;
  prodChecks.forEach(({ check, message }) => {
    if (check()) {
      success(`Production: ${message}`);
    } else {
      error(`Production issue: ${message}`);
      prodReady = false;
    }
  });
  
  if (prodReady) {
    passed++;
  }
  
  // Summary
  log('\n📊 Validation Summary:');
  log(`Tests passed: ${passed}/${total}`);
  
  if (passed === total) {
    success('🎉 All Docker validation tests passed!');
    info('Your Docker setup is ready for:');
    info('  • Local development testing');
    info('  • Production deployment');
    info('  • Google Cloud Storage integration');
    info('  • Container orchestration (Kubernetes, Docker Compose)');
    
    log('\n🚀 Next steps:');
    log('1. Build: docker build -t myhome-backend .');
    log('2. Run: docker run -p 5000:5000 --env-file .env myhome-backend');
    log('3. Test: curl http://localhost:5000/api/health');
    
  } else {
    error(`❌ ${total - passed} tests failed. Please review the issues above.`);
    process.exit(1);
  }
}

// Run validation
validateDockerSetup().catch(err => {
  error(`Validation failed: ${err.message}`);
  process.exit(1);
});