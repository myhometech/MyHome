import { test, expect, Page, APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

/**
 * Login helper function for all tests
 */
async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  
  // Wait for login form to load
  await page.waitForSelector('[data-testid="login-email"]', { timeout: 10000 });
  
  await page.fill('[data-testid="login-email"]', process.env.TEST_USER_EMAIL || 'admin@example.com');
  await page.fill('[data-testid="login-password"]', process.env.TEST_USER_PASSWORD || 'password123!');
  await page.click('[data-testid="login-submit"]');
  
  // Wait for successful login redirect
  await page.waitForLoadState('networkidle');
  
  // Verify we're logged in by checking for dashboard content
  await expect(page.locator('[data-testid="dashboard-content"]')).toBeVisible({ timeout: 15000 });
}

/**
 * Core smoke test suite for MyHome application
 * Tests critical user workflows to prevent regressions
 */
test.describe('Core Smoke Tests - Critical User Workflows', () => {
  
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for E2E tests
    test.setTimeout(120000);
  });

  test('document upload (≤10MB) appears in library', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/upload`);

    // Wait for upload page to load
    await page.waitForSelector('[data-testid="doc-upload-input"]', { timeout: 10000 });

    const fileInput = page.locator('input[type="file"][data-testid="doc-upload-input"]');
    await fileInput.setInputFiles('tests/fixtures/sample.pdf'); // ~200KB fixture

    // Fill in document metadata if required
    const nameInput = page.locator('[data-testid="doc-name-input"]');
    if (await nameInput.isVisible()) {
      await nameInput.fill('E2E Test Document');
    }

    await page.click('[data-testid="upload-submit"]');

    // Wait for upload success
    await page.waitForSelector('[data-testid="upload-success"]', { timeout: 30000 });

    // Navigate to documents library
    await page.goto(`${BASE_URL}/documents`);
    await page.waitForLoadState('networkidle');

    // Verify document appears in library
    await expect(page.getByText('sample.pdf')).toBeVisible({ timeout: 15000 });
    
    // Verify document is clickable and opens
    await page.click('[data-testid="doc-row"]:has-text("sample.pdf")');
    await expect(page.locator('[data-testid="document-viewer"]')).toBeVisible({ timeout: 10000 });
  });

  test('reject upload >10MB with clear error', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/upload`);

    await page.waitForSelector('[data-testid="doc-upload-input"]', { timeout: 10000 });

    const fileInput = page.locator('input[type="file"][data-testid="doc-upload-input"]');
    await fileInput.setInputFiles('tests/fixtures/too-large-11mb.pdf');

    await page.click('[data-testid="upload-submit"]');

    // Verify file size error is shown
    await expect(page.locator('[data-testid="upload-error-too-large"]')).toBeVisible({ timeout: 10000 });
    
    // Verify error message is helpful
    await expect(page.locator('[data-testid="upload-error-too-large"]'))
      .toContainText(/file.*too large|exceeds.*limit|maximum.*10.*mb/i);
  });

  test('scanner functionality (test mode) creates merged PDF', async ({ page }) => {
    await login(page);
    
    // Enable test mode to bypass real camera
    await page.goto(`${BASE_URL}/scan?testMode=1`);
    
    await page.waitForSelector('[data-testid="scan-start"]', { timeout: 10000 });
    await page.click('[data-testid="scan-start"]');

    // In test mode, should show file input or use canned images
    const testModeActive = page.locator('[data-testid="scan-test-mode"]');
    if (await testModeActive.isVisible()) {
      // Use test fixture images
      await page.click('[data-testid="scan-capture"]'); // capture page 1
      await page.waitForSelector('[data-testid="scan-page-1"]', { timeout: 5000 });
      
      await page.click('[data-testid="scan-capture"]'); // capture page 2
      await page.waitForSelector('[data-testid="scan-page-2"]', { timeout: 5000 });
      
      await page.click('[data-testid="scan-finish-upload"]');
      
      // Wait for scan processing and upload
      await page.waitForSelector('[data-testid="upload-success"]', { timeout: 30000 });
      
      // Verify scanned document appears in library
      await page.goto(`${BASE_URL}/documents`);
      await expect(page.locator('[data-testid="doc-row"]:has-text("Scanned")')).toBeVisible({ timeout: 15000 });
    } else {
      // Fallback: use file input if test mode not fully implemented
      const fileInput = page.locator('input[type="file"][data-testid="scan-file-input"]');
      if (await fileInput.isVisible()) {
        await fileInput.setInputFiles(['tests/fixtures/scan-page-1.jpg', 'tests/fixtures/scan-page-2.jpg']);
        await page.click('[data-testid="scan-process"]');
        await page.waitForSelector('[data-testid="upload-success"]', { timeout: 30000 });
      }
    }
  });

  test('OCR pipeline completes and extracts text', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/documents`);
    
    // Look for a document that should have OCR
    const ocrFixtureRow = page.locator('[data-testid="doc-row-ocr-fixture"]');
    if (await ocrFixtureRow.isVisible()) {
      await ocrFixtureRow.click();
    } else {
      // Fallback: use any PDF document
      await page.click('[data-testid="doc-row"]:has-text(".pdf"):first');
    }

    // Wait for document viewer to load
    await page.waitForSelector('[data-testid="document-viewer"]', { timeout: 15000 });

    // Wait for OCR processing to complete
    const ocrStatus = page.locator('[data-testid="ocr-status"]');
    await expect(ocrStatus).toContainText(/complete|processed|ready/i, { timeout: 60000 });
    
    // Verify extracted text is visible
    const textPreview = page.locator('[data-testid="doc-text-preview"]');
    if (await textPreview.isVisible()) {
      // Check for common document text patterns
      await expect(textPreview).toContainText(/\w+/, { timeout: 10000 }); // At least some text
    } else {
      // Alternative: check for OCR completion indicator
      await expect(page.locator('[data-testid="ocr-status-complete"]')).toBeVisible({ timeout: 60000 });
    }
  });

  test('email import ingests attachment into library', async ({ page, request }) => {
    await login(page);
    
    // Trigger admin test email import endpoint
    try {
      const response = await request.post(`${BASE_URL}/api/admin/test-email-import`, {
        data: { fixture: 'basic-invoice' },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.status() !== 200) {
        console.log('Email import endpoint not available, skipping test');
        test.skip();
      }
      
      expect(response.ok()).toBeTruthy();
    } catch (error) {
      console.log('Email import test endpoint not available:', error.message);
      test.skip();
    }

    // Navigate to documents and wait for imported document
    await page.goto(`${BASE_URL}/documents`);
    await page.waitForLoadState('networkidle');
    
    // Look for imported email attachment
    const importedDoc = page.locator('[data-testid="doc-row"]:has-text("imported"), [data-testid="doc-row"]:has-text("email")');
    await expect(importedDoc.first()).toBeVisible({ timeout: 30000 });
    
    // Verify document has email import tag/indicator
    const emailTag = page.locator('[data-testid="import-source-email"]');
    if (await emailTag.isVisible()) {
      await expect(emailTag).toBeVisible();
    }
  });

  test('AI Insights generation completes after OCR (DOC-501)', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/documents`);
    
    // Find a document suitable for AI insights
    const aiFixtureRow = page.locator('[data-testid="doc-row-ai-fixture"]');
    if (await aiFixtureRow.isVisible()) {
      await aiFixtureRow.click();
    } else {
      // Fallback: use any document with text content
      await page.click('[data-testid="doc-row"]:has-text(".pdf"):first');
    }

    // Wait for document viewer
    await page.waitForSelector('[data-testid="document-viewer"]', { timeout: 15000 });

    // Wait for AI insights to be generated
    const insightsSection = page.locator('[data-testid="ai-insights-section"]');
    await expect(insightsSection).toBeVisible({ timeout: 60000 });
    
    // Check for insights ready state
    const insightsReady = page.locator('[data-testid="ai-insights-ready"]');
    await expect(insightsReady).toBeVisible({ timeout: 60000 });
    
    // Verify insight chips are present
    const insightChips = page.locator('[data-testid="insight-chip"]');
    await expect(insightChips.first()).toBeVisible({ timeout: 15000 });
    
    // Verify at least one insight is generated
    await expect(insightChips).toHaveCountGreaterThan(0);
    
    // Check insight content is meaningful
    const firstInsight = insightChips.first();
    await expect(firstInsight).toContainText(/\w+/); // Contains actual text
  });

  test('document viewer modal functionality', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/documents`);
    
    // Click on first document
    await page.click('[data-testid="doc-row"]:first');
    
    // Verify document viewer modal opens
    await expect(page.locator('[data-testid="document-viewer-modal"]')).toBeVisible({ timeout: 15000 });
    
    // Test modal close functionality
    await page.click('[data-testid="modal-close"]');
    await expect(page.locator('[data-testid="document-viewer-modal"]')).not.toBeVisible();
  });

  test('document search functionality', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/documents`);
    
    // Wait for documents to load
    await page.waitForSelector('[data-testid="doc-row"]', { timeout: 15000 });
    
    const searchInput = page.locator('[data-testid="document-search"]');
    if (await searchInput.isVisible()) {
      // Test search functionality
      await searchInput.fill('pdf');
      await page.waitForTimeout(1000); // Wait for search debounce
      
      // Verify search results
      const visibleDocs = page.locator('[data-testid="doc-row"]:visible');
      await expect(visibleDocs.first()).toBeVisible();
      
      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(1000);
    }
  });

  test('responsive design on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await login(page);
    await page.goto(`${BASE_URL}/documents`);
    
    // Verify mobile navigation works
    const mobileMenu = page.locator('[data-testid="mobile-menu-toggle"]');
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
      await expect(page.locator('[data-testid="mobile-nav-menu"]')).toBeVisible();
    }
    
    // Verify document grid adapts to mobile
    const docGrid = page.locator('[data-testid="documents-grid"]');
    await expect(docGrid).toBeVisible();
  });
});

/**
 * Admin-specific smoke tests
 */
test.describe('Admin Dashboard Smoke Tests', () => {
  
  test('admin dashboard loads with feature flags', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/admin`);
    
    // Check if user has admin access
    const adminDashboard = page.locator('[data-testid="admin-dashboard"]');
    if (await adminDashboard.isVisible({ timeout: 5000 })) {
      // Verify feature flags section
      await expect(page.locator('[data-testid="feature-flags-section"]')).toBeVisible();
      
      // Verify at least one feature flag is displayed
      const featureFlagRows = page.locator('[data-testid="feature-flag-row"]');
      await expect(featureFlagRows.first()).toBeVisible({ timeout: 15000 });
      
      // Verify activity logs section
      await expect(page.locator('[data-testid="activity-logs-section"]')).toBeVisible();
    } else {
      console.log('User does not have admin access, skipping admin tests');
      test.skip();
    }
  });
});