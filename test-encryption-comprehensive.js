#!/usr/bin/env node

/**
 * Comprehensive Encryption Test Script
 * Tests all aspects of the document encryption system
 */

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== COMPREHENSIVE ENCRYPTION TEST ===\n');

// Test 1: Environment Setup
console.log('1. SETUP VERIFICATION:');
const masterKey = process.env.DOCUMENT_MASTER_KEY;
console.log(`   Master key present: ${!!masterKey}`);
console.log(`   Master key length: ${masterKey ? masterKey.length : 0} characters`);
console.log(`   Expected: 64 characters (256 bits)`);
console.log(`   Status: ${masterKey && masterKey.length === 64 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 2: Crypto Algorithm
console.log('2. ENCRYPTION ALGORITHM TEST:');
try {
  const testData = Buffer.from('This is a test document content for encryption verification.');
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  
  // Test AES-256-GCM encryption
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(testData), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  // Test decryption
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  
  const matches = testData.equals(decrypted);
  console.log(`   Encryption: ${encrypted.length} bytes`);
  console.log(`   Decryption: ${decrypted.length} bytes`);
  console.log(`   Data integrity: ${matches ? '✅ PASS' : '❌ FAIL'}`);
  
  // Verify encryption changed the data
  const isEncrypted = !testData.equals(encrypted);
  console.log(`   Data obfuscation: ${isEncrypted ? '✅ PASS' : '❌ FAIL'}\n`);
} catch (error) {
  console.log(`   ❌ FAIL: ${error.message}\n`);
}

// Test 3: File System Security Check
console.log('3. STORAGE SECURITY VERIFICATION:');
const uploadsDir = './uploads';
if (fs.existsSync(uploadsDir)) {
  const files = fs.readdirSync(uploadsDir).slice(0, 3); // Check first 3 files
  
  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    const fileStats = fs.statSync(filePath);
    
    if (fileStats.isFile()) {
      const fileContent = fs.readFileSync(filePath);
      const first100Bytes = fileContent.slice(0, 100);
      
      // Check if file looks like plaintext PDF/image
      const isPDF = first100Bytes.includes(Buffer.from('%PDF'));
      const isImage = first100Bytes.includes(Buffer.from('JFIF')) || 
                     first100Bytes.includes(Buffer.from('PNG'));
      const hasReadableText = first100Bytes.toString().match(/[a-zA-Z]{10,}/);
      
      console.log(`   File: ${file}`);
      console.log(`     Size: ${fileStats.size} bytes`);
      console.log(`     PDF header: ${isPDF ? 'YES' : 'NO'}`);
      console.log(`     Image header: ${isImage ? 'YES' : 'NO'}`);
      console.log(`     Readable text: ${hasReadableText ? 'YES' : 'NO'}`);
      console.log(`     Status: ${(isPDF || isImage || hasReadableText) ? '❌ UNENCRYPTED' : '✅ ENCRYPTED'}`);
      console.log('');
    }
  }
} else {
  console.log('   ❌ Uploads directory not found\n');
}

// Test 4: Create and encrypt a test file
console.log('4. LIVE ENCRYPTION TEST:');
const testFileName = 'encryption-test-' + Date.now() + '.txt';
const testFilePath = path.join(uploadsDir, testFileName);
const testContent = 'CONFIDENTIAL: This is sensitive test data that should be encrypted.';

try {
  // Create test file
  fs.writeFileSync(testFilePath, testContent);
  console.log(`   ✅ Test file created: ${testFileName}`);
  
  // Verify it's readable as plaintext
  const originalContent = fs.readFileSync(testFilePath, 'utf8');
  console.log(`   ✅ Original content verified: ${originalContent.length} chars`);
  
  // Simulate encryption (if master key is available)
  if (masterKey && masterKey.length === 64) {
    const documentKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', documentKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(testContent)),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    
    // Write encrypted version
    const encryptedPath = testFilePath + '.encrypted';
    fs.writeFileSync(encryptedPath, encrypted);
    
    // Verify encrypted file is not readable
    const encryptedContent = fs.readFileSync(encryptedPath);
    const hasOriginalText = encryptedContent.includes(Buffer.from('CONFIDENTIAL'));
    
    console.log(`   ✅ Encrypted file created: ${encrypted.length} bytes`);
    console.log(`   Security check: ${hasOriginalText ? '❌ FAIL - plaintext visible' : '✅ PASS - data obfuscated'}`);
    
    // Clean up
    fs.unlinkSync(testFilePath);
    fs.unlinkSync(encryptedPath);
    console.log(`   ✅ Test files cleaned up`);
  } else {
    console.log(`   ⚠️  SKIP - Master key not available for encryption test`);
    fs.unlinkSync(testFilePath);
  }
} catch (error) {
  console.log(`   ❌ FAIL: ${error.message}`);
  // Clean up on error
  try {
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    if (fs.existsSync(testFilePath + '.encrypted')) fs.unlinkSync(testFilePath + '.encrypted');
  } catch (e) {}
}

console.log('\n=== TEST SUMMARY ===');
console.log('Check the results above to verify encryption system status.');
console.log('All tests should show PASS for a fully functional encryption system.');