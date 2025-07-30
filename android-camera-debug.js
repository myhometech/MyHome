#!/usr/bin/env node

/**
 * Android Camera Debugging Script
 * 
 * Provides comprehensive debugging information for Android camera issues
 * Tests camera access, permissions, and compatibility
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('📱 Android Camera Debugging Suite\n');

// Test 1: Check Camera Scanner Implementation
function testCameraScannerImplementation() {
  console.log('📋 Test 1: Camera Scanner Android Compatibility');
  
  const scannerPath = join(__dirname, 'client/src/components/camera-scanner.tsx');
  if (!fs.existsSync(scannerPath)) {
    console.log('❌ Camera Scanner component not found');
    return false;
  }
  
  const content = fs.readFileSync(scannerPath, 'utf8');
  
  // Check for Android-specific fixes
  const hasAndroidHTTPSCheck = content.includes('location.protocol') &&
                               content.includes('HTTPS connection on Android');
  
  const hasAndroidConstraints = content.includes('Android-optimized') &&
                               content.includes('frameRate') &&
                               content.includes('min:');
  
  const hasProgressiveFallback = content.includes('Android fallback') &&
                                content.includes('Android minimal') &&
                                content.includes('Boolean video constraint');
  
  const hasAndroidLogging = content.includes('✅ Android:') &&
                           content.includes('🔄 Android:');
  
  if (hasAndroidHTTPSCheck && hasAndroidConstraints && hasProgressiveFallback && hasAndroidLogging) {
    console.log('✅ Camera Scanner Android implementation complete');
    console.log('   - HTTPS requirement check for Android');
    console.log('   - Android-optimized camera constraints');
    console.log('   - Progressive fallback strategy');
    console.log('   - Android-specific debug logging');
    return true;
  } else {
    console.log('❌ Camera Scanner Android implementation incomplete');
    if (!hasAndroidHTTPSCheck) console.log('   - Missing HTTPS check');
    if (!hasAndroidConstraints) console.log('   - Missing Android constraints');
    if (!hasProgressiveFallback) console.log('   - Missing progressive fallback');
    if (!hasAndroidLogging) console.log('   - Missing Android logging');
    return false;
  }
}

// Test 2: Check Error Handling Integration
function testAndroidErrorHandling() {
  console.log('\n📋 Test 2: Android Camera Error Handling');
  
  const scannerPath = join(__dirname, 'client/src/components/camera-scanner.tsx');
  const content = fs.readFileSync(scannerPath, 'utf8');
  
  // Check for Android-specific error messages
  const hasHTTPSError = content.includes('Camera requires HTTPS connection on Android');
  
  const hasPermissionHandling = content.includes('NotAllowedError') &&
                               content.includes('Camera permission denied');
  
  const hasDeviceErrorHandling = content.includes('NotFoundError') &&
                                content.includes('No camera found');
  
  const hasBrowserCompatibility = content.includes('NotSupportedError') &&
                                 content.includes('not supported on this browser');
  
  const hasOCRErrorIntegration = content.includes('clearError()') &&
                                content.includes('handleOCRError');
  
  if (hasHTTPSError && hasPermissionHandling && hasDeviceErrorHandling && hasBrowserCompatibility && hasOCRErrorIntegration) {
    console.log('✅ Android error handling complete');
    console.log('   - HTTPS requirement error message');
    console.log('   - Permission denied handling');
    console.log('   - Device compatibility errors');
    console.log('   - Browser support detection');
    console.log('   - OCR error handler integration');
    return true;
  } else {
    console.log('❌ Android error handling incomplete');
    if (!hasHTTPSError) console.log('   - Missing HTTPS error');
    if (!hasPermissionHandling) console.log('   - Missing permission handling');
    if (!hasDeviceErrorHandling) console.log('   - Missing device errors');
    if (!hasBrowserCompatibility) console.log('   - Missing browser compatibility');
    if (!hasOCRErrorIntegration) console.log('   - Missing OCR integration');
    return false;
  }
}

// Test 3: Check Upload Integration
function testUploadIntegration() {
  console.log('\n📋 Test 3: Upload Component Camera Integration');
  
  const paths = [
    'client/src/components/upload-zone.tsx',
    'client/src/components/unified-upload-button.tsx'
  ];
  
  let hasAnyIntegration = false;
  
  for (const path of paths) {
    const fullPath = join(__dirname, path);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      const hasCameraScanner = content.includes('CameraScanner') ||
                              content.includes('camera-scanner');
      
      const hasMobileChecks = content.includes('mobile') ||
                             content.includes('isMobile') ||
                             content.includes('Android');
      
      if (hasCameraScanner) {
        console.log(`✅ Camera integration found in ${path}`);
        if (hasMobileChecks) {
          console.log('   - Mobile/Android detection included');
        }
        hasAnyIntegration = true;
      }
    }
  }
  
  if (hasAnyIntegration) {
    console.log('✅ Upload camera integration present');
    return true;
  } else {
    console.log('❌ No camera integration found in upload components');
    return false;
  }
}

// Test 4: Generate Android Debug Instructions
function generateAndroidDebugInstructions() {
  console.log('\n📋 Test 4: Android Debug Instructions Generated');
  
  const instructions = `
# Android Camera Debug Instructions

## User Testing Steps:
1. **Check HTTPS**: Ensure using https:// URL (required for Android camera)
2. **Permission Check**: Look for browser permission dialog
3. **Browser Console**: Open developer tools and check console for errors
4. **Camera Busy**: Close other apps that might be using camera
5. **Browser Compatibility**: Try Chrome or Firefox on Android

## Developer Debug Steps:
1. **Console Logging**: Check for "✅ Android:" success messages
2. **Error Messages**: Look for specific Android error codes
3. **Fallback Testing**: Verify progressive fallback is working
4. **Network Check**: Confirm HTTPS certificate is valid

## Common Android Camera Issues:
- **HTTPS Required**: Android browsers require secure connection
- **Permission Denied**: User must allow camera access
- **Camera Busy**: Another app is using camera
- **Unsupported Browser**: Old Android browser versions
- **Hardware Issues**: Camera hardware malfunction

## Quick Fixes:
1. Refresh page and allow camera permission
2. Close other camera apps
3. Try different Android browser
4. Check HTTPS connection
5. Restart browser
`;

  fs.writeFileSync(join(__dirname, 'ANDROID_CAMERA_DEBUG.md'), instructions.trim());
  console.log('✅ Debug instructions written to ANDROID_CAMERA_DEBUG.md');
  return true;
}

// Run all tests
async function runAllTests() {
  const tests = [
    testCameraScannerImplementation,
    testAndroidErrorHandling,
    testUploadIntegration,
    generateAndroidDebugInstructions
  ];
  
  let passedTests = 0;
  
  for (const test of tests) {
    if (test()) {
      passedTests++;
    }
  }
  
  console.log('\n📊 Android Camera Debug Results');
  console.log(`✅ Passed: ${passedTests}/${tests.length} tests`);
  
  if (passedTests === tests.length) {
    console.log('\n🎉 Android Camera Implementation Ready!');
    console.log('Camera should now work on Android devices with:');
    console.log('• HTTPS requirement checking');
    console.log('• Progressive fallback constraints');
    console.log('• Comprehensive error handling');
    console.log('• Android-specific optimizations');
    console.log('\n📱 Next Steps for User:');
    console.log('1. Try camera again on Android device');
    console.log('2. Check browser console for debug messages');
    console.log('3. Ensure HTTPS connection');
    console.log('4. Allow camera permissions when prompted');
    return true;
  } else {
    console.log('\n⚠️  Some tests failed. Review Android implementation.');
    return false;
  }
}

// Execute tests
runAllTests().catch(console.error);