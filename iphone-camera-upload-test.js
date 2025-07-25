// iPhone Camera Upload Test Suite
// Tests the complete mobile camera upload workflow

const IPHONE_MIME_TYPES = [
  'image/heic',      // iPhone High Efficiency Image Container
  'image/heif',      // High Efficiency Image Format
  'image/jpeg',      // Standard JPEG (iOS 12+)
  'image/png',       // PNG format
  'image/tiff',      // TIFF format (rare)
  'image/webp',      // WebP format (iOS 14+)
  undefined,         // Sometimes no MIME type is set
  null               // Edge case
];

const CAMERA_SCENARIOS = [
  'Front camera selfie mode',
  'Back camera document scan',
  'Portrait mode document',
  'Burst mode single selection',
  'Live photo converted to still',
  'Processed document scan',
  'Edited image from Photos app',
  'Screenshot converted to camera upload'
];

class iPhoneCameraUploadTester {
  constructor() {
    this.results = {};
    this.baseURL = 'http://localhost:5000';
    this.sessionCookie = '';
  }

  async authenticateUser() {
    console.log('🔐 Authenticating test user...');
    
    const response = await fetch(`${this.baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      }),
      credentials: 'include'
    });

    if (response.ok) {
      const cookies = response.headers.get('set-cookie');
      if (cookies) {
        this.sessionCookie = cookies.split(';')[0];
      }
      console.log('✅ Authentication successful');
      return true;
    } else {
      console.log('❌ Authentication failed');
      return false;
    }
  }

  async testMimeTypeSupport() {
    console.log('\n📱 Testing iPhone MIME type support...');
    const results = {};

    for (const mimeType of IPHONE_MIME_TYPES) {
      try {
        const formData = new FormData();
        
        // Create a test blob with the specific MIME type
        const testBlob = new Blob(['test image data'], { 
          type: mimeType || 'application/octet-stream' 
        });
        
        formData.append('file', testBlob, 'iPhone_camera_scan.jpg');
        formData.append('categoryId', '1');
        formData.append('name', `Test ${mimeType || 'no-type'} Upload`);

        const response = await fetch(`${this.baseURL}/api/documents`, {
          method: 'POST',
          body: formData,
          headers: {
            'Cookie': this.sessionCookie
          }
        });

        const result = await response.text();
        
        if (response.ok) {
          results[mimeType || 'no-type'] = {
            status: 'SUCCESS',
            statusCode: response.status,
            response: JSON.parse(result)
          };
          console.log(`  ✅ ${mimeType || 'no-type'}: Upload successful`);
        } else {
          results[mimeType || 'no-type'] = {
            status: 'FAILED',
            statusCode: response.status,
            error: result
          };
          console.log(`  ❌ ${mimeType || 'no-type'}: ${result}`);
        }
      } catch (error) {
        results[mimeType || 'no-type'] = {
          status: 'ERROR',
          error: error.message
        };
        console.log(`  ❌ ${mimeType || 'no-type'}: ${error.message}`);
      }
    }

    this.results.mimeTypeSupport = results;
    return results;
  }

  async testFileSizeHandling() {
    console.log('\n📏 Testing file size handling...');
    const fileSizes = [
      { size: 100 * 1024, name: '100KB (small)' },       // Small file
      { size: 1 * 1024 * 1024, name: '1MB (typical)' },  // Typical iPhone photo
      { size: 5 * 1024 * 1024, name: '5MB (large)' },    // Large iPhone photo
      { size: 8 * 1024 * 1024, name: '8MB (very large)' }, // Very large iPhone photo
      { size: 12 * 1024 * 1024, name: '12MB (too large)' } // Exceeds 10MB limit
    ];

    const results = {};

    for (const testFile of fileSizes) {
      try {
        const formData = new FormData();
        
        // Create test data of specified size
        const testData = new Uint8Array(testFile.size);
        // Fill with some pattern to simulate image data
        for (let i = 0; i < testFile.size; i++) {
          testData[i] = i % 256;
        }
        
        const testBlob = new Blob([testData], { type: 'image/jpeg' });
        formData.append('file', testBlob, `test_${testFile.size}.jpg`);
        formData.append('categoryId', '1');

        const response = await fetch(`${this.baseURL}/api/documents`, {
          method: 'POST',
          body: formData,
          headers: {
            'Cookie': this.sessionCookie
          }
        });

        const result = await response.text();
        
        if (response.ok) {
          results[testFile.name] = {
            status: 'SUCCESS',
            statusCode: response.status,
            actualSize: testFile.size
          };
          console.log(`  ✅ ${testFile.name}: Upload successful`);
        } else {
          results[testFile.name] = {
            status: 'FAILED',
            statusCode: response.status,
            error: result,
            actualSize: testFile.size
          };
          console.log(`  ❌ ${testFile.name}: ${result}`);
        }
      } catch (error) {
        results[testFile.name] = {
          status: 'ERROR',
          error: error.message,
          actualSize: testFile.size
        };
        console.log(`  ❌ ${testFile.name}: ${error.message}`);
      }
    }

    this.results.fileSizeHandling = results;
    return results;
  }

  async testEncryptionHandling() {
    console.log('\n🔒 Testing document encryption...');
    
    try {
      const formData = new FormData();
      const testBlob = new Blob(['iPhone camera test data'], { type: 'image/jpeg' });
      formData.append('file', testBlob, 'iPhone_encryption_test.jpg');
      formData.append('categoryId', '1');
      formData.append('name', 'Encryption Test Document');

      const response = await fetch(`${this.baseURL}/api/documents`, {
        method: 'POST',
        body: formData,
        headers: {
          'Cookie': this.sessionCookie
        }
      });

      if (response.ok) {
        const document = await response.json();
        
        const encryptionChecks = {
          hasEncryptedKey: !!document.encryptedDocumentKey,
          hasEncryptionMetadata: !!document.encryptionMetadata,
          isMarkedEncrypted: document.isEncrypted === true,
          hasEncryptedFilePath: document.filePath && document.filePath.includes('.encrypted')
        };

        const allEncryptionPassed = Object.values(encryptionChecks).every(check => check);
        
        this.results.encryptionHandling = {
          status: allEncryptionPassed ? 'SUCCESS' : 'PARTIAL',
          checks: encryptionChecks,
          document: document
        };

        console.log('  🔒 Encryption checks:');
        Object.entries(encryptionChecks).forEach(([check, passed]) => {
          console.log(`    ${passed ? '✅' : '❌'} ${check}`);
        });

        return this.results.encryptionHandling;
      } else {
        throw new Error(`Upload failed: ${await response.text()}`);
      }
    } catch (error) {
      this.results.encryptionHandling = {
        status: 'ERROR',
        error: error.message
      };
      console.log(`  ❌ Encryption test failed: ${error.message}`);
      return this.results.encryptionHandling;
    }
  }

  async testCameraSpecificFeatures() {
    console.log('\n📸 Testing camera-specific features...');
    
    // Test processed document naming convention
    const processedDocTests = [
      'processed_document_scan.jpg',
      'processed_receipt_12345.png',
      'processed_invoice_scan.heic'
    ];

    const results = {};

    for (const fileName of processedDocTests) {
      try {
        const formData = new FormData();
        const testBlob = new Blob(['processed camera data'], { type: 'image/jpeg' });
        formData.append('file', testBlob, fileName);
        formData.append('categoryId', '1');

        const response = await fetch(`${this.baseURL}/api/documents`, {
          method: 'POST',
          body: formData,
          headers: {
            'Cookie': this.sessionCookie
          }
        });

        if (response.ok) {
          const document = await response.json();
          
          // Check if processed document triggers PDF conversion
          const isPdfConverted = document.mimeType === 'application/pdf' || 
                                document.fileName.endsWith('.pdf');
          
          results[fileName] = {
            status: 'SUCCESS',
            pdfConversion: isPdfConverted,
            finalMimeType: document.mimeType,
            finalFileName: document.fileName
          };
          
          console.log(`  ✅ ${fileName}: ${isPdfConverted ? 'PDF converted' : 'Original format'}`);
        } else {
          results[fileName] = {
            status: 'FAILED',
            error: await response.text()
          };
          console.log(`  ❌ ${fileName}: Upload failed`);
        }
      } catch (error) {
        results[fileName] = {
          status: 'ERROR',
          error: error.message
        };
        console.log(`  ❌ ${fileName}: ${error.message}`);
      }
    }

    this.results.cameraFeatures = results;
    return results;
  }

  async runFullTestSuite() {
    console.log('🚀 Starting iPhone Camera Upload Test Suite\n');
    const startTime = Date.now();

    // Authenticate first
    const authSuccess = await this.authenticateUser();
    if (!authSuccess) {
      console.log('❌ Cannot proceed without authentication');
      return;
    }

    // Run all tests
    await this.testMimeTypeSupport();
    await this.testFileSizeHandling();
    await this.testEncryptionHandling();
    await this.testCameraSpecificFeatures();

    // Generate summary report
    this.generateReport(Date.now() - startTime);
  }

  generateReport(duration) {
    console.log('\n📊 iPhone Camera Upload Test Report');
    console.log('=' .repeat(50));
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    // Analyze MIME type support
    const mimeResults = this.results.mimeTypeSupport || {};
    const mimeTotal = Object.keys(mimeResults).length;
    const mimePassed = Object.values(mimeResults).filter(r => r.status === 'SUCCESS').length;
    
    console.log(`\n📱 MIME Type Support: ${mimePassed}/${mimeTotal} passed`);
    totalTests += mimeTotal;
    passedTests += mimePassed;
    failedTests += (mimeTotal - mimePassed);

    // Analyze file size handling
    const sizeResults = this.results.fileSizeHandling || {};
    const sizeTotal = Object.keys(sizeResults).length;
    const sizePassed = Object.values(sizeResults).filter(r => r.status === 'SUCCESS' || (r.status === 'FAILED' && r.actualSize > 10 * 1024 * 1024)).length;
    
    console.log(`📏 File Size Handling: ${sizePassed}/${sizeTotal} passed`);
    totalTests += sizeTotal;
    passedTests += sizePassed;
    failedTests += (sizeTotal - sizePassed);

    // Analyze encryption
    const encryptionResult = this.results.encryptionHandling;
    const encryptionPassed = encryptionResult?.status === 'SUCCESS' ? 1 : 0;
    
    console.log(`🔒 Document Encryption: ${encryptionPassed}/1 passed`);
    totalTests += 1;
    passedTests += encryptionPassed;
    failedTests += (1 - encryptionPassed);

    // Analyze camera features
    const cameraResults = this.results.cameraFeatures || {};
    const cameraTotal = Object.keys(cameraResults).length;
    const cameraPassed = Object.values(cameraResults).filter(r => r.status === 'SUCCESS').length;
    
    console.log(`📸 Camera Features: ${cameraPassed}/${cameraTotal} passed`);
    totalTests += cameraTotal;
    passedTests += cameraPassed;
    failedTests += (cameraTotal - cameraPassed);

    // Overall summary
    console.log('\n🎯 OVERALL RESULTS');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`Duration: ${duration}ms`);

    // Critical issues
    console.log('\n🚨 CRITICAL FINDINGS');
    if (mimePassed < mimeTotal) {
      console.log('- Some iPhone camera MIME types are not supported');
    }
    if (encryptionPassed === 0) {
      console.log('- Document encryption is failing');
    }
    if (passedTests === totalTests) {
      console.log('- All tests passed! iPhone camera uploads are fully working ✅');
    }

    // Store final results
    window.iPhoneCameraTestResults = {
      summary: { totalTests, passedTests, failedTests, successRate: (passedTests / totalTests) * 100 },
      details: this.results,
      timestamp: new Date().toISOString(),
      duration
    };

    return this.results;
  }
}

// Auto-run if in browser environment
if (typeof window !== 'undefined') {
  window.iPhoneCameraUploadTester = iPhoneCameraUploadTester;
  
  // Auto-start tests after a delay to allow page load
  setTimeout(async () => {
    const tester = new iPhoneCameraUploadTester();
    await tester.runFullTestSuite();
  }, 2000);
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { iPhoneCameraUploadTester };
}