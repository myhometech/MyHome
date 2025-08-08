import { test, expect } from '@playwright/test';

async function loginAsAdmin(page: any) {
  // Navigate to login page
  await page.goto('/login');
  
  // Fill in admin credentials
  await page.fill('[data-testid="login-email"]', process.env.TEST_ADMIN_EMAIL || 'admin@example.com');
  await page.fill('[data-testid="login-password"]', process.env.TEST_ADMIN_PASSWORD || 'password123!');
  
  // Submit login form
  await page.click('[data-testid="login-submit"]');
  
  // Wait for dashboard or success redirect
  await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {
    // If dashboard redirect doesn't happen, continue - might redirect to admin directly
  });
}

test('healthz endpoint returns ok status', async ({ request }) => {
  const baseURL = process.env.BASE_URL || 'http://localhost:5000';
  const res = await request.get(`${baseURL}/healthz`);
  expect(res.ok()).toBeTruthy();
  
  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.version).toBeDefined();
  expect(body.timestamp).toBeDefined();
});

test('config.json endpoint serves configuration', async ({ request }) => {
  const baseURL = process.env.BASE_URL || 'http://localhost:5000';
  const res = await request.get(`${baseURL}/config.json`);
  expect(res.ok()).toBeTruthy();
  
  const config = await res.json();
  expect(config.API_BASE_URL).toBeDefined();
  expect(config.ENV).toBeDefined();
  expect(config.VERSION).toBeDefined();
});

test('admin feature flags page renders with data and no Vite/HMR errors', async ({ page }) => {
  const consoleLogs: string[] = [];
  const consoleErrors: string[] = [];
  
  // Capture console messages
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(text);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  try {
    // Login as admin
    await loginAsAdmin(page);
    
    // Navigate to admin feature flags
    await page.goto('/admin/feature-flags');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Wait a bit more for any async operations
    await page.waitForTimeout(2000);
    
    // Check for Vite/HMR references in console
    const combinedLogs = consoleLogs.join('\n').toLowerCase();
    
    // These should not appear in production builds
    expect(combinedLogs).not.toContain('vite');
    expect(combinedLogs).not.toContain('server connection lost');  
    expect(combinedLogs).not.toContain('hmr');
    expect(combinedLogs).not.toContain('hot module replacement');
    expect(combinedLogs).not.toContain('localhost:5173');
    
    // Log first few console messages for debugging (if any)
    if (consoleLogs.length > 0) {
      console.log('First 3 console messages:', consoleLogs.slice(0, 3));
    }
    
    // Check that feature flags grid is present and has data
    const featureFlagsGrid = page.locator('[data-testid="feature-flags-table"]');
    await expect(featureFlagsGrid).toBeVisible();
    
    // Check that there are feature flag cards in the grid
    const featureFlagCards = featureFlagsGrid.locator('.card, [class*="card"], div[class*="relative"]');
    await expect(featureFlagCards).toHaveCountGreaterThan(0);
    
    // Verify no JavaScript errors occurred
    expect(consoleErrors.length).toBe(0);
    
  } catch (error) {
    // Log console info for debugging on failure
    console.log('Console logs on failure:', consoleLogs.slice(0, 10));
    console.log('Console errors on failure:', consoleErrors);
    throw error;
  }
});

test('admin dashboard loads without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await loginAsAdmin(page);
  await page.goto('/admin');
  
  await page.waitForLoadState('networkidle');
  
  // Check page loaded successfully
  expect(page.url()).toContain('/admin');
  
  // No JavaScript errors
  expect(consoleErrors.length).toBe(0);
});

test('production build has no development references in source', async ({ page }) => {
  // This test checks that the built JavaScript doesn't contain dev references
  await page.goto('/');
  
  // Wait for app to load
  await page.waitForLoadState('networkidle');
  
  // Get all script tags and check their content doesn't contain dev references
  const scriptUrls = await page.$$eval('script[src]', scripts => 
    scripts.map(script => script.getAttribute('src')).filter(Boolean)
  );
  
  // Check each script file doesn't contain development references
  for (const url of scriptUrls) {
    if (url && !url.startsWith('http') && !url.includes('replit')) {
      const response = await page.request.get(url);
      if (response.ok()) {
        const content = await response.text();
        const lowerContent = content.toLowerCase();
        
        // These patterns should not be in production builds
        expect(lowerContent).not.toContain('localhost:5173');
        expect(lowerContent).not.toContain('ws://');
        expect(lowerContent).not.toContain('vite_hmr');
        expect(lowerContent).not.toContain('hmr_host');
      }
    }
  }
});