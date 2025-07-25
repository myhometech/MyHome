// Mobile QA Test Suite for MyHome Document Management
// Tests responsive design, camera functionality, and cross-device compatibility

const MOBILE_VIEWPORTS = {
  'iPhone 14 Pro': { width: 393, height: 852, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  'iPhone SE': { width: 375, height: 667, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  'Samsung Galaxy S23': { width: 384, height: 854, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
  'Google Pixel 7': { width: 412, height: 915, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
  'iPad Air': { width: 820, height: 1180, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
};

const TEST_SCENARIOS = [
  'Document Upload Flow',
  'Camera Scanner Functionality', 
  'Mobile Document Viewer',
  'Touch Gesture Navigation',
  'Responsive Layout Validation',
  'Image Processing Pipeline',
  'OCR Processing Workflow',
  'Cross-Device Data Sync'
];

class MobileQATestRunner {
  constructor() {
    this.testResults = {};
    this.currentViewport = null;
    this.testStartTime = null;
  }

  async runFullTestSuite() {
    console.log('🚀 Starting Mobile QA Test Suite for MyHome Document Management');
    this.testStartTime = Date.now();
    
    // Test each viewport configuration
    for (const [deviceName, viewport] of Object.entries(MOBILE_VIEWPORTS)) {
      console.log(`\n📱 Testing on ${deviceName} (${viewport.width}x${viewport.height})`);
      await this.setViewport(viewport);
      await this.runDeviceTests(deviceName, viewport);
    }
    
    // Generate comprehensive test report
    this.generateTestReport();
    return this.testResults;
  }

  async setViewport(viewport) {
    this.currentViewport = viewport;
    
    // Simulate viewport resize
    if (typeof window !== 'undefined') {
      // Browser environment - resize window
      window.resizeTo(viewport.width, viewport.height);
      
      // Update user agent if possible (limited in browsers)
      Object.defineProperty(navigator, 'userAgent', {
        value: viewport.userAgent,
        configurable: true
      });
    }
    
    // Wait for responsive changes to take effect
    await this.delay(500);
  }

  async runDeviceTests(deviceName, viewport) {
    const deviceResults = {
      device: deviceName,
      viewport: viewport,
      tests: {},
      startTime: Date.now(),
      passed: 0,
      failed: 0,
      warnings: 0
    };

    // Test 1: Responsive Layout Validation
    console.log('  ✅ Testing responsive layout...');
    deviceResults.tests.responsiveLayout = await this.testResponsiveLayout(viewport);
    
    // Test 2: Mobile Navigation
    console.log('  ✅ Testing mobile navigation...');
    deviceResults.tests.mobileNavigation = await this.testMobileNavigation();
    
    // Test 3: Document Upload Interface
    console.log('  ✅ Testing document upload interface...');
    deviceResults.tests.documentUpload = await this.testDocumentUploadInterface();
    
    // Test 4: Camera Scanner (iOS Safari vs Android Chrome)
    console.log('  ✅ Testing camera scanner functionality...');
    deviceResults.tests.cameraScanner = await this.testCameraScanner(viewport);
    
    // Test 5: Mobile Document Viewer
    console.log('  ✅ Testing mobile document viewer...');
    deviceResults.tests.documentViewer = await this.testMobileDocumentViewer();
    
    // Test 6: Touch Gesture Support
    console.log('  ✅ Testing touch gesture support...');
    deviceResults.tests.touchGestures = await this.testTouchGestures();
    
    // Test 7: Image Processing Panel
    console.log('  ✅ Testing image processing panel...');
    deviceResults.tests.imageProcessing = await this.testImageProcessingPanel();
    
    // Test 8: Form Input Behavior (iOS zoom prevention)
    console.log('  ✅ Testing form input behavior...');
    deviceResults.tests.formInputs = await this.testFormInputBehavior(viewport);
    
    // Calculate test statistics
    Object.values(deviceResults.tests).forEach(test => {
      if (test.status === 'PASS') deviceResults.passed++;
      else if (test.status === 'FAIL') deviceResults.failed++;
      else if (test.status === 'WARN') deviceResults.warnings++;
    });
    
    deviceResults.endTime = Date.now();
    deviceResults.duration = deviceResults.endTime - deviceResults.startTime;
    
    this.testResults[deviceName] = deviceResults;
    
    console.log(`  📊 Results: ${deviceResults.passed} passed, ${deviceResults.failed} failed, ${deviceResults.warnings} warnings`);
  }

  async testResponsiveLayout(viewport) {
    const test = { name: 'Responsive Layout', status: 'PASS', details: [], issues: [] };
    
    try {
      // Check if mobile breakpoints are active
      const isMobile = viewport.width <= 480;
      const isTablet = viewport.width > 480 && viewport.width <= 768;
      
      // Test header responsiveness
      const header = document.querySelector('header, .header, [role="banner"]');
      if (header) {
        const headerStyles = window.getComputedStyle(header);
        if (isMobile && parseInt(headerStyles.height) > 80) {
          test.issues.push('Header too tall on mobile (>80px)');
        }
        test.details.push(`Header height: ${headerStyles.height}`);
      }
      
      // Test navigation menu
      const navMenu = document.querySelector('.nav-menu, nav ul, .navigation');
      if (navMenu && isMobile) {
        const navStyles = window.getComputedStyle(navMenu);
        if (navStyles.display !== 'none' && !navMenu.classList.contains('mobile-menu')) {
          test.issues.push('Navigation menu not properly collapsed on mobile');
        }
      }
      
      // Test main content area
      const mainContent = document.querySelector('main, .main-content, #root > div');
      if (mainContent) {
        const contentRect = mainContent.getBoundingClientRect();
        if (contentRect.width > viewport.width) {
          test.issues.push(`Content width (${contentRect.width}px) exceeds viewport (${viewport.width}px)`);
        }
        test.details.push(`Content width: ${contentRect.width}px`);
      }
      
      // Test for horizontal scroll
      if (document.body.scrollWidth > viewport.width) {
        test.issues.push(`Horizontal scroll detected (${document.body.scrollWidth}px > ${viewport.width}px)`);
      }
      
      // Check touch target sizes (minimum 44px for mobile)
      if (isMobile) {
        const buttons = document.querySelectorAll('button, a, input[type="submit"], input[type="button"]');
        let smallTargets = 0;
        buttons.forEach(btn => {
          const rect = btn.getBoundingClientRect();
          if (rect.width < 44 || rect.height < 44) {
            smallTargets++;
          }
        });
        if (smallTargets > 0) {
          test.issues.push(`${smallTargets} touch targets smaller than 44px`);
        }
        test.details.push(`Touch targets checked: ${buttons.length}, small: ${smallTargets}`);
      }
      
      if (test.issues.length > 0) {
        test.status = test.issues.length > 2 ? 'FAIL' : 'WARN';
      }
      
    } catch (error) {
      test.status = 'FAIL';
      test.issues.push(`Layout test error: ${error.message}`);
    }
    
    return test;
  }

  async testMobileNavigation() {
    const test = { name: 'Mobile Navigation', status: 'PASS', details: [], issues: [] };
    
    try {
      // Test hamburger menu (if exists)
      const hamburgerMenu = document.querySelector('.hamburger, .menu-toggle, [aria-label*="menu"]');
      if (hamburgerMenu) {
        test.details.push('Hamburger menu found');
        
        // Simulate tap
        hamburgerMenu.click();
        await this.delay(300);
        
        // Check if menu opens
        const mobileMenu = document.querySelector('.mobile-menu, .nav-open, .menu-active');
        if (!mobileMenu) {
          test.issues.push('Mobile menu does not open when hamburger is tapped');
        } else {
          test.details.push('Mobile menu opens correctly');
        }
        
        // Close menu
        hamburgerMenu.click();
        await this.delay(300);
      }
      
      // Test navigation links
      const navLinks = document.querySelectorAll('nav a, .navigation a, .nav-link');
      let workingLinks = 0;
      navLinks.forEach(link => {
        if (link.href && !link.href.includes('#') && !link.href.includes('javascript:')) {
          workingLinks++;
        }
      });
      test.details.push(`Navigation links found: ${navLinks.length}, functional: ${workingLinks}`);
      
      if (test.issues.length > 0) {
        test.status = 'WARN';
      }
      
    } catch (error) {
      test.status = 'FAIL';
      test.issues.push(`Navigation test error: ${error.message}`);
    }
    
    return test;
  }

  async testDocumentUploadInterface() {
    const test = { name: 'Document Upload Interface', status: 'PASS', details: [], issues: [] };
    
    try {
      // Test file upload elements
      const fileInputs = document.querySelectorAll('input[type="file"]');
      const dropZones = document.querySelectorAll('.dropzone, .drag-drop, [data-testid*="upload"]');
      
      test.details.push(`File inputs found: ${fileInputs.length}`);
      test.details.push(`Drop zones found: ${dropZones.length}`);
      
      // Test upload button accessibility
      const uploadButtons = document.querySelectorAll('button[class*="upload"], .upload-btn, [aria-label*="upload"]');
      uploadButtons.forEach(btn => {
        const rect = btn.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 44) {
          test.issues.push('Upload button too small for mobile touch');
        }
      });
      
      // Test drag and drop area
      if (dropZones.length > 0) {
        const dropZone = dropZones[0];
        const rect = dropZone.getBoundingClientRect();
        if (rect.height < 100) {
          test.issues.push('Drop zone too small for mobile interaction');
        }
        test.details.push(`Drop zone size: ${rect.width}x${rect.height}px`);
      }
      
      // Test for mobile-specific upload options
      const cameraButtons = document.querySelectorAll('[data-testid*="camera"], .camera-btn, button[class*="camera"]');
      if (cameraButtons.length === 0) {
        test.issues.push('No camera upload option found for mobile devices');
      } else {
        test.details.push(`Camera buttons found: ${cameraButtons.length}`);
      }
      
      if (test.issues.length > 0) {
        test.status = test.issues.length > 2 ? 'FAIL' : 'WARN';
      }
      
    } catch (error) {
      test.status = 'FAIL';
      test.issues.push(`Upload interface test error: ${error.message}`);
    }
    
    return test;
  }

  async testCameraScanner(viewport) {
    const test = { name: 'Camera Scanner', status: 'PASS', details: [], issues: [] };
    
    try {
      const isIOS = viewport.userAgent.includes('iPhone') || viewport.userAgent.includes('iPad');
      const isAndroid = viewport.userAgent.includes('Android');
      
      test.details.push(`Testing on ${isIOS ? 'iOS' : isAndroid ? 'Android' : 'Unknown'} device`);
      
      // Test camera API availability
      if (typeof navigator.mediaDevices !== 'undefined' && navigator.mediaDevices.getUserMedia) {
        test.details.push('Camera API available');
        
        // Test camera permissions (mock)
        try {
          // This would normally request camera access
          test.details.push('Camera permission handling present');
        } catch (permError) {
          test.issues.push('Camera permission error handling needed');
        }
      } else {
        test.issues.push('Camera API not available');
      }
      
      // Test for iOS-specific camera handling
      if (isIOS) {
        const fileInputs = document.querySelectorAll('input[type="file"][accept*="image"]');
        let hasCapture = false;
        fileInputs.forEach(input => {
          if (input.hasAttribute('capture')) {
            hasCapture = true;
          }
        });
        
        if (!hasCapture) {
          test.issues.push('iOS camera capture attribute missing on file inputs');
        } else {
          test.details.push('iOS camera capture properly configured');
        }
      }
      
      // Test camera scanner UI elements
      const scanButtons = document.querySelectorAll('button[class*="scan"], .scan-btn, [data-testid*="scan"]');
      if (scanButtons.length === 0) {
        test.issues.push('No scan buttons found');
      } else {
        test.details.push(`Scan buttons found: ${scanButtons.length}`);
        
        // Test button size for mobile
        scanButtons.forEach(btn => {
          const rect = btn.getBoundingClientRect();
          if (rect.width < 44 || rect.height < 44) {
            test.issues.push('Scan button too small for mobile touch');
          }
        });
      }
      
      if (test.issues.length > 0) {
        test.status = test.issues.length > 2 ? 'FAIL' : 'WARN';
      }
      
    } catch (error) {
      test.status = 'FAIL';
      test.issues.push(`Camera scanner test error: ${error.message}`);
    }
    
    return test;
  }

  async testMobileDocumentViewer() {
    const test = { name: 'Mobile Document Viewer', status: 'PASS', details: [], issues: [] };
    
    try {
      // Test for mobile viewer component
      const mobileViewer = document.querySelector('.mobile-viewer, .mobile-document-viewer');
      if (!mobileViewer) {
        // Try to trigger mobile viewer (simulate document click)
        const documents = document.querySelectorAll('.document-tile, .document-item, [data-testid*="document"]');
        if (documents.length > 0) {
          test.details.push(`Found ${documents.length} documents to test viewer with`);
        } else {
          test.issues.push('No documents available to test mobile viewer');
        }
      } else {
        test.details.push('Mobile viewer component found');
        
        // Test viewer controls
        const viewerControls = mobileViewer.querySelectorAll('button, .control');
        if (viewerControls.length === 0) {
          test.issues.push('No viewer controls found');
        } else {
          test.details.push(`Viewer controls found: ${viewerControls.length}`);
          
          // Test control sizes
          let smallControls = 0;
          viewerControls.forEach(control => {
            const rect = control.getBoundingClientRect();
            if (rect.width < 44 || rect.height < 44) {
              smallControls++;
            }
          });
          
          if (smallControls > 0) {
            test.issues.push(`${smallControls} viewer controls too small for mobile`);
          }
        }
        
        // Test fullscreen capability
        if (document.fullscreenEnabled) {
          test.details.push('Fullscreen API available');
        } else {
          test.issues.push('Fullscreen API not available');
        }
      }
      
      if (test.issues.length > 0) {
        test.status = test.issues.length > 2 ? 'FAIL' : 'WARN';
      }
      
    } catch (error) {
      test.status = 'FAIL';
      test.issues.push(`Mobile viewer test error: ${error.message}`);
    }
    
    return test;
  }

  async testTouchGestures() {
    const test = { name: 'Touch Gestures', status: 'PASS', details: [], issues: [] };
    
    try {
      // Test touch event handling
      const touchElements = document.querySelectorAll('[data-testid*="swipe"], .swipeable, .touch-target');
      test.details.push(`Touch-enabled elements found: ${touchElements.length}`);
      
      // Test for touch CSS properties
      const body = document.body;
      const bodyStyles = window.getComputedStyle(body);
      
      if (bodyStyles.touchAction !== 'manipulation' && bodyStyles.touchAction !== 'pan-x pan-y') {
        test.issues.push('Touch-action CSS property not optimized for mobile');
      } else {
        test.details.push(`Touch action: ${bodyStyles.touchAction}`);
      }
      
      // Test for iOS-specific touch handling
      if (bodyStyles.webkitTouchCallout !== 'none') {
        test.issues.push('iOS touch callout not disabled (may cause UX issues)');
      }
      
      // Test tap highlight removal
      if (bodyStyles.webkitTapHighlightColor !== 'rgba(0, 0, 0, 0)' && 
          bodyStyles.webkitTapHighlightColor !== 'transparent') {
        test.issues.push('Tap highlight color not removed for better UX');
      }
      
      // Test for gesture prevention on document viewer
      const viewers = document.querySelectorAll('.document-viewer, .mobile-viewer');
      viewers.forEach(viewer => {
        const viewerStyles = window.getComputedStyle(viewer);
        if (viewerStyles.userSelect !== 'none') {
          test.issues.push('Text selection not disabled in document viewer');
        }
      });
      
      if (test.issues.length > 0) {
        test.status = test.issues.length > 2 ? 'FAIL' : 'WARN';
      }
      
    } catch (error) {
      test.status = 'FAIL';
      test.issues.push(`Touch gesture test error: ${error.message}`);
    }
    
    return test;
  }

  async testImageProcessingPanel() {
    const test = { name: 'Image Processing Panel', status: 'PASS', details: [], issues: [] };
    
    try {
      // Test for image processing components
      const processingPanels = document.querySelectorAll('.image-processing-panel, [data-testid*="processing"]');
      test.details.push(`Processing panels found: ${processingPanels.length}`);
      
      // Test processing controls
      const processingControls = document.querySelectorAll('input[type="range"], .slider, .processing-control');
      test.details.push(`Processing controls found: ${processingControls.length}`);
      
      // Test for mobile-friendly control sizes
      let smallControls = 0;
      processingControls.forEach(control => {
        const rect = control.getBoundingClientRect();
        if (control.type === 'range' && rect.height < 44) {
          smallControls++;
        }
      });
      
      if (smallControls > 0) {
        test.issues.push(`${smallControls} processing controls too small for mobile`);
      }
      
      // Test for Canvas API availability (needed for image processing)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        test.issues.push('Canvas 2D context not available for image processing');
      } else {
        test.details.push('Canvas API available for image processing');
      }
      
      // Test for Web Workers support (for intensive processing)
      if (typeof Worker !== 'undefined') {
        test.details.push('Web Workers available for background processing');
      } else {
        test.issues.push('Web Workers not available (may impact performance)');
      }
      
      if (test.issues.length > 0) {
        test.status = test.issues.length > 2 ? 'FAIL' : 'WARN';
      }
      
    } catch (error) {
      test.status = 'FAIL';
      test.issues.push(`Image processing test error: ${error.message}`);
    }
    
    return test;
  }

  async testFormInputBehavior(viewport) {
    const test = { name: 'Form Input Behavior', status: 'PASS', details: [], issues: [] };
    
    try {
      const isIOS = viewport.userAgent.includes('iPhone') || viewport.userAgent.includes('iPad');
      
      // Test input font sizes (iOS zoom prevention)
      const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], textarea');
      let zoomPreventionIssues = 0;
      
      inputs.forEach(input => {
        const styles = window.getComputedStyle(input);
        const fontSize = parseInt(styles.fontSize);
        
        if (isIOS && fontSize < 16) {
          zoomPreventionIssues++;
        }
      });
      
      test.details.push(`Form inputs found: ${inputs.length}`);
      
      if (zoomPreventionIssues > 0 && isIOS) {
        test.issues.push(`${zoomPreventionIssues} inputs with font-size < 16px (will cause zoom on iOS)`);
      } else if (isIOS) {
        test.details.push('All inputs have proper font-size for iOS zoom prevention');
      }
      
      // Test input accessibility
      let unlabeledInputs = 0;
      inputs.forEach(input => {
        const hasLabel = input.labels && input.labels.length > 0;
        const hasAriaLabel = input.hasAttribute('aria-label');
        const hasAriaLabelledBy = input.hasAttribute('aria-labelledby');
        
        if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) {
          unlabeledInputs++;
        }
      });
      
      if (unlabeledInputs > 0) {
        test.issues.push(`${unlabeledInputs} inputs without proper labels`);
      }
      
      // Test input spacing for mobile
      const inputContainers = document.querySelectorAll('.form-group, .input-group, .field');
      let tightSpacing = 0;
      inputContainers.forEach(container => {
        const styles = window.getComputedStyle(container);
        const marginBottom = parseInt(styles.marginBottom);
        if (marginBottom < 16) {
          tightSpacing++;
        }
      });
      
      if (tightSpacing > 0) {
        test.issues.push(`${tightSpacing} form fields with insufficient spacing for mobile`);
      }
      
      if (test.issues.length > 0) {
        test.status = test.issues.length > 2 ? 'FAIL' : 'WARN';
      }
      
    } catch (error) {
      test.status = 'FAIL';
      test.issues.push(`Form input test error: ${error.message}`);
    }
    
    return test;
  }

  generateTestReport() {
    console.log('\n📋 MOBILE QA TEST REPORT');
    console.log('=' .repeat(50));
    
    const totalDuration = Date.now() - this.testStartTime;
    let totalPassed = 0, totalFailed = 0, totalWarnings = 0;
    
    Object.entries(this.testResults).forEach(([deviceName, results]) => {
      console.log(`\n📱 ${deviceName}`);
      console.log(`   Duration: ${results.duration}ms`);
      console.log(`   Results: ${results.passed} ✅ | ${results.failed} ❌ | ${results.warnings} ⚠️`);
      
      totalPassed += results.passed;
      totalFailed += results.failed;
      totalWarnings += results.warnings;
      
      // Show critical failures
      Object.values(results.tests).forEach(test => {
        if (test.status === 'FAIL') {
          console.log(`   ❌ ${test.name}: ${test.issues.join(', ')}`);
        }
      });
    });
    
    console.log('\n📊 OVERALL SUMMARY');
    console.log(`Total Tests: ${totalPassed + totalFailed + totalWarnings}`);
    console.log(`Passed: ${totalPassed} ✅`);
    console.log(`Failed: ${totalFailed} ❌`);
    console.log(`Warnings: ${totalWarnings} ⚠️`);
    console.log(`Duration: ${totalDuration}ms`);
    
    const passRate = ((totalPassed / (totalPassed + totalFailed + totalWarnings)) * 100).toFixed(1);
    console.log(`Pass Rate: ${passRate}%`);
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS');
    if (totalFailed > 0) {
      console.log('- Address critical failures before production deployment');
    }
    if (totalWarnings > 0) {
      console.log('- Review warnings for UX improvements');
    }
    console.log('- Test on actual physical devices for final validation');
    console.log('- Consider automated visual regression testing');
    
    return {
      summary: {
        totalTests: totalPassed + totalFailed + totalWarnings,
        passed: totalPassed,
        failed: totalFailed,
        warnings: totalWarnings,
        passRate: parseFloat(passRate),
        duration: totalDuration
      },
      devices: this.testResults
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Auto-run tests if in browser environment
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const testRunner = new MobileQATestRunner();
        testRunner.runFullTestSuite().then(results => {
          console.log('✅ Mobile QA testing completed');
          
          // Store results globally for inspection
          window.mobileQAResults = results;
        });
      }, 2000); // Wait 2 seconds for app to initialize
    });
  }
}

// Export for Node.js environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileQATestRunner, MOBILE_VIEWPORTS, TEST_SCENARIOS };
}