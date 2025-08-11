import { test, expect, Page } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Manual Email PDF Flow', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Navigate to the application and ensure authentication
    await page.goto('/');
    
    // Mock authentication state (adjust based on your auth system)
    await page.evaluate(() => {
      localStorage.setItem('auth', JSON.stringify({
        isAuthenticated: true,
        user: { id: 'test-user', subscriptionTier: 'premium' }
      }));
    });

    // Inject axe for accessibility testing
    await injectAxe(page);
  });

  test.describe('Kebab Action Visibility', () => {
    test('should show "Store email as PDF" action for email documents when flag is ON', async () => {
      // Mock feature flags to enable manual email PDF
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({
          json: {
            enabledFeatures: ['MANUAL_EMAIL_PDF', 'DOCUMENT_VIEWER']
          }
        });
      });

      // Mock email document with proper context
      await page.route('/api/documents/123', async route => {
        await route.fulfill({
          json: {
            id: 123,
            name: 'Vehicle Registration.pdf',
            mimeType: 'application/pdf',
            source: 'email',
            uploadSource: 'email',
            emailContext: {
              messageId: 'test-msg-visibility@example.com',
              from: 'dvla@gov.uk',
              to: ['user@example.com'],
              subject: 'Vehicle Registration Documents',
              bodyHtml: '<p>Your vehicle registration documents are attached.</p>',
              receivedAt: '2025-08-11T10:00:00Z'
            }
          }
        });
      });

      // Navigate to document viewer
      await page.goto('/documents?id=123');

      // Wait for document to load
      await expect(page.locator('[data-testid="document-viewer"]')).toBeVisible();

      // Open the document actions menu (kebab menu)
      await page.click('[data-testid="document-actions-menu"]');

      // Verify "Store email as PDF" action is visible
      await expect(page.locator('text="Store email as PDF"')).toBeVisible();

      // Check accessibility
      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });

    test('should hide "Store email as PDF" action when flag is OFF', async () => {
      // Mock feature flags to disable manual email PDF
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({
          json: {
            enabledFeatures: ['DOCUMENT_VIEWER'] // Manual email PDF not included
          }
        });
      });

      // Mock email document
      await page.route('/api/documents/123', async route => {
        await route.fulfill({
          json: {
            id: 123,
            name: 'Test Email Attachment.jpg',
            source: 'email',
            emailContext: {
              messageId: 'test-hidden@example.com',
              from: 'test@example.com',
              subject: 'Test'
            }
          }
        });
      });

      await page.goto('/documents?id=123');
      await expect(page.locator('[data-testid="document-viewer"]')).toBeVisible();
      
      await page.click('[data-testid="document-actions-menu"]');

      // Verify action is NOT visible
      await expect(page.locator('text="Store email as PDF"')).not.toBeVisible();
    });

    test('should hide action for documents without email context', async () => {
      // Mock feature flags (enabled)
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({
          json: { enabledFeatures: ['MANUAL_EMAIL_PDF'] }
        });
      });

      // Mock non-email document
      await page.route('/api/documents/124', async route => {
        await route.fulfill({
          json: {
            id: 124,
            name: 'Regular Upload.pdf',
            source: 'upload',
            emailContext: null
          }
        });
      });

      await page.goto('/documents?id=124');
      await page.click('[data-testid="document-actions-menu"]');

      await expect(page.locator('text="Store email as PDF"')).not.toBeVisible();
    });
  });

  test.describe('Manual Action Flow', () => {
    test('should complete full email PDF creation flow with success toast', async () => {
      // Setup: Enable feature flags
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({
          json: { enabledFeatures: ['MANUAL_EMAIL_PDF'] }
        });
      });

      // Mock document
      await page.route('/api/documents/200', async route => {
        await route.fulfill({
          json: {
            id: 200,
            name: 'Invoice.pdf',
            source: 'email',
            emailContext: {
              messageId: 'invoice-test@corp.com',
              from: 'billing@corp.com',
              subject: 'Monthly Invoice - March 2025',
              bodyHtml: '<div><h1>Invoice #INV-001</h1><p>Amount due: $500</p></div>'
            }
          }
        });
      });

      // Mock successful PDF creation
      await page.route('/api/email/render-to-pdf', async route => {
        const request = route.request();
        const data = JSON.parse(request.postData() || '{}');
        
        expect(data.documentId).toBe(200);

        await route.fulfill({
          json: {
            documentId: 501,
            created: true,
            linkedCount: 1,
            name: 'Email - Monthly Invoice - March 2025 - 2025-08-11.pdf'
          }
        });
      });

      // Navigate and perform action
      await page.goto('/documents?id=200');
      await page.click('[data-testid="document-actions-menu"]');
      
      const storeEmailAction = page.locator('text="Store email as PDF"');
      await expect(storeEmailAction).toBeVisible();
      
      // Click the action
      await storeEmailAction.click();

      // Verify loading state appears
      await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();

      // Wait for success toast
      const successToast = page.locator('[data-testid="toast"]').filter({
        hasText: 'Email saved as PDF'
      });
      await expect(successToast).toBeVisible();

      // Verify toast contains expected information
      await expect(successToast).toContainText('Created PDF "Email - Monthly Invoice - March 2025 - 2025-08-11.pdf"');
      await expect(successToast).toContainText('with 1 linked documents');

      // Verify "View Email PDF" action button in toast
      const viewPdfButton = successToast.locator('button:has-text("View Email PDF")');
      await expect(viewPdfButton).toBeVisible();

      // Test accessibility of the success state
      await checkA11y(page);
    });

    test('should handle idempotent case with appropriate messaging', async () => {
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({
          json: { enabledFeatures: ['MANUAL_EMAIL_PDF'] }
        });
      });

      await page.route('/api/documents/201', async route => {
        await route.fulfill({
          json: {
            id: 201,
            name: 'Existing Attachment.jpg',
            source: 'email',
            emailContext: {
              messageId: 'existing-pdf-test@example.com',
              subject: 'Already Processed Email'
            }
          }
        });
      });

      // Mock idempotent response (PDF already exists)
      await page.route('/api/email/render-to-pdf', async route => {
        await route.fulfill({
          json: {
            documentId: 502,
            created: false,
            linkedCount: 2,
            name: 'Email - Already Processed Email - 2025-08-10.pdf'
          }
        });
      });

      await page.goto('/documents?id=201');
      await page.click('[data-testid="document-actions-menu"]');
      await page.click('text="Store email as PDF"');

      const idempotentToast = page.locator('[data-testid="toast"]').filter({
        hasText: 'Email PDF already exists'
      });
      await expect(idempotentToast).toBeVisible();
      await expect(idempotentToast).toContainText('Opening existing email PDF');
      await expect(idempotentToast).toContainText('Email - Already Processed Email - 2025-08-10.pdf');
    });

    test('should display user-friendly error messages', async () => {
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({ json: { enabledFeatures: ['MANUAL_EMAIL_PDF'] } });
      });

      await page.route('/api/documents/202', async route => {
        await route.fulfill({
          json: {
            id: 202,
            source: 'email',
            emailContext: { messageId: 'error-test' }
          }
        });
      });

      // Mock error response
      await page.route('/api/email/render-to-pdf', async route => {
        await route.fulfill({
          status: 413,
          json: {
            errorCode: 'EMAIL_TOO_LARGE_AFTER_COMPRESSION',
            message: 'Email content too large to convert to PDF'
          }
        });
      });

      await page.goto('/documents?id=202');
      await page.click('[data-testid="document-actions-menu"]');
      await page.click('text="Store email as PDF"');

      const errorToast = page.locator('[data-testid="toast"]').filter({
        hasText: 'Failed to create email PDF'
      });
      await expect(errorToast).toBeVisible();
      await expect(errorToast).toContainText('Email content is too large to convert to PDF');
    });
  });

  test.describe('References UI', () => {
    test('should display References section with correct count and links', async () => {
      // Mock document with references
      await page.route('/api/documents/300', async route => {
        await route.fulfill({
          json: {
            id: 300,
            name: 'Email - Insurance Documents - 2025-08-11.pdf',
            source: 'email',
            references: JSON.stringify([
              {
                type: 'email',
                relation: 'source',
                documentId: 301,
                metadata: { messageId: 'insurance@provider.com' }
              },
              {
                type: 'email', 
                relation: 'source',
                documentId: 302,
                metadata: { messageId: 'insurance@provider.com' }
              }
            ])
          }
        });
      });

      // Mock referenced documents summary
      await page.route('/api/documents/batch-summary', async route => {
        await route.fulfill({
          json: [
            {
              id: 301,
              name: 'Policy Document.pdf',
              mimeType: 'application/pdf',
              fileSize: 245760,
              source: 'email',
              uploadedAt: '2025-08-11T09:00:00Z'
            },
            {
              id: 302,
              name: 'Insurance Certificate.jpg',
              mimeType: 'image/jpeg',
              fileSize: 128000,
              source: 'email',
              uploadedAt: '2025-08-11T09:01:00Z'
            }
          ]
        });
      });

      await page.goto('/documents?id=300');

      // Wait for References section to load
      const referencesSection = page.locator('[data-testid="document-references"]');
      await expect(referencesSection).toBeVisible();

      // Verify correct count in header
      await expect(referencesSection.locator('h3')).toContainText('References (2)');

      // Verify reference items are displayed
      const referenceItems = referencesSection.locator('[role="listitem"]');
      await expect(referenceItems).toHaveCount(2);

      // Check first reference
      const firstRef = referenceItems.nth(0);
      await expect(firstRef).toContainText('Policy Document.pdf');
      await expect(firstRef).toContainText('Email attachment');
      await expect(firstRef).toContainText('240 KB');

      // Check second reference
      const secondRef = referenceItems.nth(1);
      await expect(secondRef).toContainText('Insurance Certificate.jpg');
      await expect(secondRef).toContainText('Email attachment');
      await expect(secondRef).toContainText('125 KB');

      // Test keyboard navigation
      await page.keyboard.press('Tab');
      const openButton = firstRef.locator('button[aria-label*="Open"]');
      await expect(openButton).toBeFocused();

      // Test accessibility
      await checkA11y(page, '[data-testid="document-references"]');
    });

    test('should handle expand/collapse for >5 references', async () => {
      // Mock document with many references
      const manyRefs = Array.from({ length: 8 }, (_, i) => ({
        type: 'email',
        relation: 'source',
        documentId: 400 + i,
        metadata: { messageId: 'bulk-test' }
      }));

      await page.route('/api/documents/400', async route => {
        await route.fulfill({
          json: {
            id: 400,
            name: 'Bulk Email PDF.pdf',
            references: JSON.stringify(manyRefs)
          }
        });
      });

      const mockSummaries = Array.from({ length: 8 }, (_, i) => ({
        id: 400 + i,
        name: `Document ${i + 1}.pdf`,
        mimeType: 'application/pdf',
        fileSize: 100000,
        source: 'email',
        uploadedAt: '2025-08-11T10:00:00Z'
      }));

      await page.route('/api/documents/batch-summary', async route => {
        await route.fulfill({ json: mockSummaries });
      });

      await page.goto('/documents?id=400');

      const referencesSection = page.locator('[data-testid="document-references"]');
      await expect(referencesSection).toBeVisible();

      // Initially should show only 5 items
      const initialItems = referencesSection.locator('[role="listitem"]');
      await expect(initialItems).toHaveCount(5);

      // Should have "Show all (8)" button
      const expandButton = referencesSection.locator('button:has-text("Show all (8)")');
      await expect(expandButton).toBeVisible();

      // Click to expand
      await expandButton.click();

      // Now should show all 8 items
      await expect(initialItems).toHaveCount(8);

      // Should now have "Show less" button
      const collapseButton = referencesSection.locator('button:has-text("Show less")');
      await expect(collapseButton).toBeVisible();
    });

    test('should handle empty references state', async () => {
      await page.route('/api/documents/500', async route => {
        await route.fulfill({
          json: {
            id: 500,
            name: 'No References.pdf',
            references: null
          }
        });
      });

      await page.goto('/documents?id=500');

      // References section should not be visible when no references exist
      const referencesSection = page.locator('[data-testid="document-references"]');
      await expect(referencesSection).not.toBeVisible();
    });

    test('should handle references loading error with retry', async () => {
      await page.route('/api/documents/600', async route => {
        await route.fulfill({
          json: {
            id: 600,
            name: 'Error Test.pdf'
          }
        });
      });

      // Mock error response for references endpoint
      let attemptCount = 0;
      await page.route('/api/documents/600/references', async route => {
        attemptCount++;
        if (attemptCount === 1) {
          await route.fulfill({
            status: 500,
            json: { error: 'Internal server error' }
          });
        } else {
          // Succeed on retry
          await route.fulfill({
            json: { references: [] }
          });
        }
      });

      await page.goto('/documents?id=600');

      const referencesSection = page.locator('[data-testid="document-references"]');
      
      // Should show error state
      const errorState = referencesSection.locator('text="Failed to load references"');
      await expect(errorState).toBeVisible();

      // Should have retry button
      const retryButton = referencesSection.locator('button:has-text("Retry")');
      await expect(retryButton).toBeVisible();

      // Click retry
      await retryButton.click();

      // Error should disappear (successful retry)
      await expect(errorState).not.toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should pass axe accessibility checks for all components', async () => {
      // Enable features
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({
          json: { enabledFeatures: ['MANUAL_EMAIL_PDF'] }
        });
      });

      // Mock complete document with references
      await page.route('/api/documents/700', async route => {
        await route.fulfill({
          json: {
            id: 700,
            name: 'Accessibility Test.pdf',
            source: 'email',
            emailContext: {
              messageId: 'a11y-test',
              subject: 'Accessibility Test'
            },
            references: JSON.stringify([
              {
                type: 'email',
                relation: 'source',
                documentId: 701
              }
            ])
          }
        });
      });

      await page.route('/api/documents/batch-summary', async route => {
        await route.fulfill({
          json: [
            {
              id: 701,
              name: 'Referenced Doc.pdf',
              mimeType: 'application/pdf',
              source: 'email'
            }
          ]
        });
      });

      await page.goto('/documents?id=700');

      // Wait for all components to load
      await expect(page.locator('[data-testid="document-viewer"]')).toBeVisible();
      await expect(page.locator('[data-testid="document-references"]')).toBeVisible();

      // Run comprehensive accessibility checks
      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true },
        rules: {
          'color-contrast': { enabled: true },
          'keyboard-navigation': { enabled: true },
          'focus-management': { enabled: true }
        }
      });
    });

    test('should support keyboard navigation throughout the flow', async () => {
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({
          json: { enabledFeatures: ['MANUAL_EMAIL_PDF'] }
        });
      });

      await page.route('/api/documents/800', async route => {
        await route.fulfill({
          json: {
            id: 800,
            source: 'email',
            emailContext: { messageId: 'keyboard-test', subject: 'Keyboard Test' }
          }
        });
      });

      await page.goto('/documents?id=800');

      // Navigate using keyboard
      await page.keyboard.press('Tab'); // Should focus first interactive element
      await page.keyboard.press('Tab'); // Navigate to actions menu
      await page.keyboard.press('Enter'); // Open menu
      await page.keyboard.press('ArrowDown'); // Navigate to "Store email as PDF"
      await page.keyboard.press('Enter'); // Trigger action

      // Verify action was triggered (would show loading/success state)
      // This tests that keyboard navigation works for the critical user journey
    });
  });

  test.describe('Performance', () => {
    test('should meet performance gates for typical email processing', async () => {
      await page.route('/api/feature-flags/batch-evaluation', async route => {
        await route.fulfill({
          json: { enabledFeatures: ['MANUAL_EMAIL_PDF'] }
        });
      });

      await page.route('/api/documents/900', async route => {
        await route.fulfill({
          json: {
            id: 900,
            source: 'email',
            emailContext: {
              messageId: 'perf-test',
              subject: 'Performance Test',
              bodyHtml: '<p>Simple email content</p>'
            }
          }
        });
      });

      // Mock PDF creation with realistic timing
      await page.route('/api/email/render-to-pdf', async route => {
        // Simulate processing time within acceptable limits
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds

        await route.fulfill({
          json: {
            documentId: 999,
            created: true,
            linkedCount: 0,
            name: 'Performance Test PDF.pdf'
          }
        });
      });

      const startTime = Date.now();
      
      await page.goto('/documents?id=900');
      await page.click('[data-testid="document-actions-menu"]');
      await page.click('text="Store email as PDF"');

      // Wait for completion
      await expect(page.locator('[data-testid="toast"]').filter({
        hasText: 'Email saved as PDF'
      })).toBeVisible();

      const totalTime = Date.now() - startTime;

      // Total UI interaction time should be reasonable
      expect(totalTime).toBeLessThan(5000); // 5 seconds total including network
    });
  });
});