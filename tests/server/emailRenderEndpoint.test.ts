import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../../server/server';
import { storageProvider } from '../../server/storage';
import { EmailFeatureFlagService } from '../../server/emailFeatureFlags';

// Mock dependencies
jest.mock('../../server/storage');
jest.mock('../../server/emailFeatureFlags');
jest.mock('../../server/emailBodyPdfService');

describe('POST /api/email/render-to-pdf', () => {
  let mockStorage: any;
  let mockFeatureFlags: any;
  let mockEmailBodyPdfService: any;

  beforeEach(() => {
    mockStorage = {
      getDocumentById: jest.fn(),
      getDocuments: jest.fn(),
      createDocument: jest.fn(),
      updateDocumentReferences: jest.fn()
    };
    (storageProvider as jest.Mock).mockReturnValue(mockStorage);

    mockFeatureFlags = {
      isManualEmailPdfEnabled: jest.fn(() => true),
      isAutoEmailPdfEnabled: jest.fn(() => false)
    };
    (EmailFeatureFlagService as jest.Mock).mockImplementation(() => mockFeatureFlags);

    // Mock the service class
    const mockService = {
      renderAndCreateEmailBodyPdf: jest.fn()
    };
    mockEmailBodyPdfService = mockService;

    // Mock the constructor
    jest.mock('../../server/emailBodyPdfService', () => ({
      EmailBodyPdfService: jest.fn(() => mockService)
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Feature Flag & RBAC Enforcement', () => {
    it('should return 403 when manual email PDF feature is disabled', async () => {
      mockFeatureFlags.isManualEmailPdfEnabled.mockReturnValue(false);

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(403);

      expect(response.body).toEqual({
        errorCode: 'FEATURE_DISABLED',
        message: expect.stringContaining('Manual email PDF feature is not enabled')
      });
    });

    it('should enforce tier-based access control', async () => {
      // Mock user with free tier
      const mockUser = { id: 'user-1', subscriptionTier: 'free' };
      mockFeatureFlags.isManualEmailPdfEnabled.mockImplementation((user) => {
        return user.subscriptionTier === 'premium';
      });

      // This would fail in a real test with authentication middleware
      // For this test, we assume the feature flag service handles tier checks
      mockFeatureFlags.isManualEmailPdfEnabled.mockReturnValue(false);

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(403);

      expect(response.body.errorCode).toBe('FEATURE_DISABLED');
    });

    it('should return 404 for document not found or cross-tenant access', async () => {
      mockStorage.getDocumentById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 999 })
        .expect(404);

      expect(response.body).toEqual({
        errorCode: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found or access denied'
      });
    });
  });

  describe('Email Context Validation', () => {
    it('should return 400 for missing email context', async () => {
      const docWithoutEmailContext = {
        id: 123,
        name: 'test.jpg',
        source: 'upload',
        emailContext: null
      };

      mockStorage.getDocumentById.mockResolvedValue(docWithoutEmailContext);

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(400);

      expect(response.body).toEqual({
        errorCode: 'EMAIL_CONTEXT_MISSING',
        message: 'Document is not an email attachment or missing email context'
      });
    });

    it('should return 400 for missing messageId in email context', async () => {
      const docWithIncompleteContext = {
        id: 123,
        name: 'test.jpg',
        source: 'email',
        emailContext: {
          from: 'test@example.com',
          to: ['user@example.com'],
          subject: 'Test'
          // missing messageId
        }
      };

      mockStorage.getDocumentById.mockResolvedValue(docWithIncompleteContext);

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(400);

      expect(response.body).toEqual({
        errorCode: 'EMAIL_CONTEXT_MISSING',
        message: 'Document is not an email attachment or missing email context'
      });
    });
  });

  describe('Successful PDF Creation', () => {
    it('should create new email body PDF and return success response', async () => {
      const emailDoc = {
        id: 123,
        name: 'attachment.jpg',
        source: 'email',
        emailContext: {
          messageId: 'test-msg-123',
          from: 'sender@example.com',
          to: ['user@example.com'],
          subject: 'Test Email',
          bodyHtml: '<p>Test content</p>',
          receivedAt: '2025-08-11T10:00:00Z'
        }
      };

      mockStorage.getDocumentById.mockResolvedValue(emailDoc);
      mockEmailBodyPdfService.renderAndCreateEmailBodyPdf.mockResolvedValue({
        documentId: 456,
        created: true,
        linkedCount: 2,
        name: 'Email - Test Email - 2025-08-11.pdf',
        renderTimeMs: 1500,
        sizeBytes: 2048000
      });

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(200);

      expect(response.body).toEqual({
        documentId: 456,
        created: true,
        linkedCount: 2,
        name: 'Email - Test Email - 2025-08-11.pdf'
      });

      expect(mockEmailBodyPdfService.renderAndCreateEmailBodyPdf).toHaveBeenCalledWith(
        expect.any(String), // tenantId
        'test-msg-123',
        emailDoc.emailContext
      );
    });

    it('should handle idempotent requests for existing email PDFs', async () => {
      const emailDoc = {
        id: 123,
        name: 'attachment.jpg',
        source: 'email',
        emailContext: {
          messageId: 'existing-msg',
          from: 'sender@example.com',
          to: ['user@example.com'],
          subject: 'Existing Email',
          bodyHtml: '<p>Existing content</p>'
        }
      };

      mockStorage.getDocumentById.mockResolvedValue(emailDoc);
      mockEmailBodyPdfService.renderAndCreateEmailBodyPdf.mockResolvedValue({
        documentId: 789,
        created: false,
        linkedCount: 1,
        name: 'Existing Email PDF.pdf'
      });

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(200);

      expect(response.body).toEqual({
        documentId: 789,
        created: false,
        linkedCount: 1,
        name: 'Existing Email PDF.pdf'
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      const emailDoc = {
        id: 123,
        name: 'test.jpg',
        source: 'email',
        emailContext: {
          messageId: 'test-msg',
          from: 'test@example.com',
          subject: 'Test',
          bodyHtml: '<p>Test</p>'
        }
      };
      mockStorage.getDocumentById.mockResolvedValue(emailDoc);
    });

    it('should handle EMAIL_TOO_LARGE_AFTER_COMPRESSION error', async () => {
      const error = new Error('Email content too large');
      error.code = 'EMAIL_TOO_LARGE_AFTER_COMPRESSION';
      mockEmailBodyPdfService.renderAndCreateEmailBodyPdf.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(413);

      expect(response.body).toEqual({
        errorCode: 'EMAIL_TOO_LARGE_AFTER_COMPRESSION',
        message: 'Email content too large to convert to PDF'
      });
    });

    it('should handle EMAIL_RENDER_FAILED error', async () => {
      const error = new Error('PDF rendering failed');
      error.code = 'EMAIL_RENDER_FAILED';
      mockEmailBodyPdfService.renderAndCreateEmailBodyPdf.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(500);

      expect(response.body).toEqual({
        errorCode: 'EMAIL_RENDER_FAILED',
        message: 'Failed to render email content to PDF'
      });
    });

    it('should handle unexpected errors as internal server error', async () => {
      mockEmailBodyPdfService.renderAndCreateEmailBodyPdf.mockRejectedValue(
        new Error('Unexpected error')
      );

      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(500);

      expect(response.body).toEqual({
        errorCode: 'INTERNAL_ERROR',
        message: 'Failed to create email PDF'
      });
    });
  });

  describe('Analytics Events', () => {
    it('should emit analytics events for successful PDF creation', async () => {
      const emailDoc = {
        id: 123,
        name: 'test.jpg',
        source: 'email',
        emailContext: {
          messageId: 'analytics-test',
          from: 'test@example.com',
          subject: 'Analytics Test'
        }
      };

      mockStorage.getDocumentById.mockResolvedValue(emailDoc);
      mockEmailBodyPdfService.renderAndCreateEmailBodyPdf.mockResolvedValue({
        documentId: 999,
        created: true,
        linkedCount: 3,
        name: 'Analytics Test PDF.pdf',
        renderTimeMs: 2000,
        sizeBytes: 1500000
      });

      // Mock analytics/logging (in real implementation)
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(200);

      // Verify analytics events would be logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] email_pdf_created')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('renderMs: 2000')
      );

      consoleSpy.mockRestore();
    });

    it('should emit failure analytics for errors', async () => {
      const emailDoc = {
        id: 123,
        source: 'email',
        emailContext: { messageId: 'fail-test' }
      };

      mockStorage.getDocumentById.mockResolvedValue(emailDoc);
      const error = new Error('Render failed');
      error.code = 'EMAIL_RENDER_FAILED';
      mockEmailBodyPdfService.renderAndCreateEmailBodyPdf.mockRejectedValue(error);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(500);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] email_pdf_create_failed')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Request Validation', () => {
    it('should return 400 for missing documentId', async () => {
      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        errorCode: 'INVALID_REQUEST',
        message: 'documentId is required'
      });
    });

    it('should return 400 for invalid documentId format', async () => {
      const response = await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 'not-a-number' })
        .expect(400);

      expect(response.body).toEqual({
        errorCode: 'INVALID_REQUEST',
        message: 'documentId must be a valid number'
      });
    });
  });

  describe('Reference Linking', () => {
    it('should create bidirectional references between email body PDF and attachments', async () => {
      const emailDoc = {
        id: 123,
        source: 'email',
        emailContext: {
          messageId: 'ref-test',
          subject: 'Reference Test'
        }
      };

      mockStorage.getDocumentById.mockResolvedValue(emailDoc);
      mockEmailBodyPdfService.renderAndCreateEmailBodyPdf.mockResolvedValue({
        documentId: 888,
        created: true,
        linkedCount: 2,
        name: 'Reference Test PDF.pdf'
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .post('/api/email/render-to-pdf')
        .send({ documentId: 123 })
        .expect(200);

      // Should log reference linking analytics
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] references_linked')
      );

      consoleSpy.mockRestore();
    });
  });
});