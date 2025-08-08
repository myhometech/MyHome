/**
 * Admin Test Routes for E2E Testing
 * These routes are only available in development and staging environments
 * for automated testing purposes
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

const adminTestRouter = Router();

// Only enable test routes in non-production environments
const isTestEnvironment = process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ROUTES === 'true';

if (isTestEnvironment) {
  
  /**
   * Test email import endpoint
   * POST /api/admin/test-email-import
   * Simulates receiving an email with attachment for testing
   */
  adminTestRouter.post('/test-email-import', async (req: Request, res: Response) => {
    try {
      const { fixture } = req.body;
      
      if (!fixture) {
        return res.status(400).json({ error: 'Fixture name required' });
      }

      // Create a mock email payload for testing
      const mockEmailPayload = {
        'From': 'test@example.com',
        'To': process.env.MAILGUN_EMAIL_ADDRESS || 'documents@myhome.app',
        'Subject': `Test Email Import - ${fixture}`,
        'body-plain': 'This is a test email for E2E testing with an attached document.',
        'Message-Id': `<test-${Date.now()}@example.com>`,
        'timestamp': Math.floor(Date.now() / 1000),
        'attachment-count': '1'
      };

      // Mock attachment based on fixture type
      let mockAttachment;
      switch (fixture) {
        case 'basic-invoice':
          mockAttachment = {
            filename: 'imported-email-attachment.pdf',
            contentType: 'application/pdf',
            buffer: await fs.readFile('tests/fixtures/sample.pdf')
          };
          break;
        default:
          return res.status(400).json({ error: 'Unknown fixture type' });
      }

      // Simulate processing result for testing
      const result = {
        documentId: `test-doc-${Date.now()}`,
        filename: mockAttachment.filename,
        processed: true,
        source: 'email-import-test'
      };

      console.log(`✅ Test email import completed for fixture: ${fixture}`);
      
      res.json({
        success: true,
        fixture,
        result,
        message: 'Test email import completed successfully'
      });

    } catch (error) {
      console.error('Test email import failed:', error);
      res.status(500).json({
        error: 'Test email import failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Health check endpoint for test environment
   * GET /api/admin/test-health
   */
  adminTestRouter.get('/test-health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      environment: process.env.NODE_ENV,
      testRoutesEnabled: true,
      timestamp: new Date().toISOString()
    });
  });

  console.log('🧪 Admin test routes enabled for E2E testing');
} else {
  console.log('🔒 Admin test routes disabled in production');
}

export { adminTestRouter };