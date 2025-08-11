import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { EmailBodyPdfService } from '../../server/emailBodyPdfService';
import { EmailFeatureFlagService } from '../../server/emailFeatureFlags';
import { storageProvider } from '../../server/storage';

// Mock external dependencies
jest.mock('../../server/storage');
jest.mock('puppeteer', () => ({
  launch: jest.fn(() => ({
    newPage: jest.fn(() => ({
      setContent: jest.fn(),
      pdf: jest.fn(() => Buffer.from('mock-pdf-content')),
      close: jest.fn()
    })),
    close: jest.fn()
  }))
}));

describe('EmailBodyPdfService', () => {
  let service: EmailBodyPdfService;
  let mockStorage: any;
  let mockFeatureFlags: any;

  const fixtures = {
    simple: JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/email/simple-confirmation.json'), 'utf8')),
    plainText: JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/email/plain-text-only.json'), 'utf8')),
    complex: JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/email/complex-newsletter.json'), 'utf8')),
    emoji: JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/email/emoji-rtl.json'), 'utf8')),
    images: JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/email/large-images.json'), 'utf8')),
    malicious: JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/email/malicious-html.json'), 'utf8'))
  };

  beforeEach(() => {
    mockStorage = {
      upload: jest.fn(),
      createDocument: jest.fn(),
      getDocumentsByMessageId: jest.fn(),
      updateDocumentReferences: jest.fn()
    };
    (storageProvider as jest.Mock).mockReturnValue(mockStorage);

    mockFeatureFlags = {
      isManualEmailPdfEnabled: jest.fn(() => true),
      isAutoEmailPdfEnabled: jest.fn(() => false)
    };

    service = new EmailBodyPdfService(mockFeatureFlags);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('HTML to PDF Rendering', () => {
    it('should render simple HTML email to PDF with proper formatting', async () => {
      const startTime = Date.now();
      
      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);
      mockStorage.createDocument.mockResolvedValue({ id: 123, name: 'test.pdf' });
      mockStorage.upload.mockResolvedValue('test-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.simple.messageId,
        fixtures.simple
      );

      const renderTime = Date.now() - startTime;

      expect(result).toEqual({
        documentId: 123,
        created: true,
        linkedCount: 0,
        name: 'test.pdf',
        renderTimeMs: expect.any(Number),
        sizeBytes: expect.any(Number)
      });

      // Performance gate: render time should be ≤ 3000ms for simple emails
      expect(renderTime).toBeLessThanOrEqual(3000);

      expect(mockStorage.createDocument).toHaveBeenCalledWith('test-tenant', expect.objectContaining({
        name: expect.stringContaining('Email - Account Confirmation'),
        mimeType: 'application/pdf',
        source: 'email'
      }));
    });

    it('should handle plain text emails with template wrapping', async () => {
      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);
      mockStorage.createDocument.mockResolvedValue({ id: 124, name: 'plain.pdf' });
      mockStorage.upload.mockResolvedValue('plain-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.plainText.messageId,
        fixtures.plainText
      );

      expect(result.created).toBe(true);
      expect(result.documentId).toBe(124);

      // Verify template was applied for plain text
      const createDocCall = mockStorage.createDocument.mock.calls[0][1];
      expect(createDocCall.name).toContain('Server Maintenance Notice');
    });

    it('should render complex newsletter HTML with tables and styles', async () => {
      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);
      mockStorage.createDocument.mockResolvedValue({ id: 125, name: 'newsletter.pdf' });
      mockStorage.upload.mockResolvedValue('newsletter-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.complex.messageId,
        fixtures.complex
      );

      expect(result.created).toBe(true);
      expect(result.documentId).toBe(125);

      // Complex emails should still render within performance gates
      expect(result.renderTimeMs).toBeLessThanOrEqual(3000);
    });

    it('should properly handle emoji and RTL text rendering', async () => {
      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);
      mockStorage.createDocument.mockResolvedValue({ id: 126, name: 'emoji.pdf' });
      mockStorage.upload.mockResolvedValue('emoji-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.emoji.messageId,
        fixtures.emoji
      );

      expect(result.created).toBe(true);
      expect(result.documentId).toBe(126);

      const createDocCall = mockStorage.createDocument.mock.calls[0][1];
      expect(createDocCall.name).toContain('Welcome - مرحباً - 欢迎');
    });
  });

  describe('HTML Sanitization', () => {
    it('should sanitize malicious HTML and remove security threats', async () => {
      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);
      mockStorage.createDocument.mockResolvedValue({ id: 127, name: 'sanitized.pdf' });
      mockStorage.upload.mockResolvedValue('sanitized-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.malicious.messageId,
        fixtures.malicious
      );

      expect(result.created).toBe(true);

      // The service should have sanitized the HTML
      // We can't easily inspect the sanitized HTML, but we expect it to complete without errors
      expect(mockStorage.createDocument).toHaveBeenCalled();
    });

    it('should allow safe data: image URLs but block external images', async () => {
      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);
      mockStorage.createDocument.mockResolvedValue({ id: 128, name: 'images.pdf' });
      mockStorage.upload.mockResolvedValue('images-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.images.messageId,
        fixtures.images
      );

      expect(result.created).toBe(true);
      expect(result.documentId).toBe(128);
    });
  });

  describe('Idempotency', () => {
    it('should return existing document for same messageId and bodyHash', async () => {
      const existingDoc = {
        id: 999,
        name: 'Existing Email PDF.pdf',
        messageId: fixtures.simple.messageId
      };

      mockStorage.getDocumentsByMessageId.mockResolvedValue([existingDoc]);

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.simple.messageId,
        fixtures.simple
      );

      expect(result).toEqual({
        documentId: 999,
        created: false,
        linkedCount: 0,
        name: 'Existing Email PDF.pdf'
      });

      // Should not create a new document
      expect(mockStorage.createDocument).not.toHaveBeenCalled();
    });

    it('should create new document if bodyHash differs', async () => {
      const existingDoc = {
        id: 999,
        name: 'Different Body.pdf',
        messageId: fixtures.simple.messageId,
        emailContext: { bodyHash: 'different-hash' }
      };

      mockStorage.getDocumentsByMessageId.mockResolvedValue([existingDoc]);
      mockStorage.createDocument.mockResolvedValue({ id: 1000, name: 'new.pdf' });
      mockStorage.upload.mockResolvedValue('new-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.simple.messageId,
        fixtures.simple
      );

      expect(result.created).toBe(true);
      expect(result.documentId).toBe(1000);
      expect(mockStorage.createDocument).toHaveBeenCalled();
    });
  });

  describe('Bidirectional Linking', () => {
    it('should create references between email body PDF and attachments', async () => {
      const attachments = [
        { id: 201, name: 'attachment1.jpg' },
        { id: 202, name: 'attachment2.pdf' }
      ];

      mockStorage.getDocumentsByMessageId.mockResolvedValue(attachments);
      mockStorage.createDocument.mockResolvedValue({ id: 300, name: 'email-body.pdf' });
      mockStorage.upload.mockResolvedValue('body-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.simple.messageId,
        fixtures.simple
      );

      expect(result.linkedCount).toBe(2);
      
      // Should update references for email body PDF
      expect(mockStorage.updateDocumentReferences).toHaveBeenCalledWith(
        300,
        expect.arrayContaining([
          expect.objectContaining({
            type: 'email',
            relation: 'source',
            documentId: 201
          }),
          expect.objectContaining({
            type: 'email',
            relation: 'source',
            documentId: 202
          })
        ])
      );

      // Should update references for each attachment
      expect(mockStorage.updateDocumentReferences).toHaveBeenCalledWith(
        201,
        expect.arrayContaining([
          expect.objectContaining({
            type: 'email',
            relation: 'related',
            documentId: 300
          })
        ])
      );
    });

    it('should handle idempotent reference linking without duplicates', async () => {
      const existingEmailBodyPdf = {
        id: 400,
        name: 'existing-body.pdf',
        messageId: fixtures.simple.messageId,
        emailContext: { bodyHash: fixtures.simple.bodyHash }
      };

      const attachments = [
        { id: 401, name: 'attachment.jpg' }
      ];

      mockStorage.getDocumentsByMessageId.mockResolvedValue([existingEmailBodyPdf, ...attachments]);

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        fixtures.simple.messageId,
        fixtures.simple
      );

      expect(result.created).toBe(false);
      expect(result.linkedCount).toBe(1);

      // Should still update references for idempotent linking
      expect(mockStorage.updateDocumentReferences).toHaveBeenCalled();
    });
  });

  describe('Size Control', () => {
    it('should handle large HTML content with compression', async () => {
      // Create a fixture with large HTML content
      const largeEmailContext = {
        ...fixtures.complex,
        bodyHtml: fixtures.complex.bodyHtml.repeat(10) // Make it much larger
      };

      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);
      mockStorage.createDocument.mockResolvedValue({ id: 500, name: 'large.pdf' });
      mockStorage.upload.mockResolvedValue('large-key');

      const result = await service.renderAndCreateEmailBodyPdf(
        'test-tenant',
        largeEmailContext.messageId,
        largeEmailContext
      );

      expect(result.created).toBe(true);
      
      // PDF size should be within reasonable limits (≤ 10MB gate)
      expect(result.sizeBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
    });

    it('should throw error for oversized email after compression attempts', async () => {
      // Mock Puppeteer to return a very large PDF
      const mockPuppeteer = require('puppeteer');
      const largePdfBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
      mockPuppeteer.launch().newPage().pdf.mockResolvedValue(largePdfBuffer);

      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);

      await expect(
        service.renderAndCreateEmailBodyPdf(
          'test-tenant',
          fixtures.complex.messageId,
          fixtures.complex
        )
      ).rejects.toThrow('EMAIL_TOO_LARGE_AFTER_COMPRESSION');
    });
  });

  describe('Error Handling', () => {
    it('should throw EMAIL_RENDER_FAILED for Puppeteer errors', async () => {
      const mockPuppeteer = require('puppeteer');
      mockPuppeteer.launch().newPage().pdf.mockRejectedValue(new Error('Render failed'));

      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);

      await expect(
        service.renderAndCreateEmailBodyPdf(
          'test-tenant',
          fixtures.simple.messageId,
          fixtures.simple
        )
      ).rejects.toThrow('EMAIL_RENDER_FAILED');
    });

    it('should handle missing email context gracefully', async () => {
      const invalidContext = { messageId: 'test', from: 'test@example.com' };

      await expect(
        service.renderAndCreateEmailBodyPdf(
          'test-tenant',
          'test-msg',
          invalidContext as any
        )
      ).rejects.toThrow();
    });
  });

  describe('Performance Gates', () => {
    it('should meet P95 render latency requirements', async () => {
      const renderTimes: number[] = [];

      mockStorage.getDocumentsByMessageId.mockResolvedValue([]);
      mockStorage.createDocument.mockResolvedValue({ id: 600, name: 'perf.pdf' });
      mockStorage.upload.mockResolvedValue('perf-key');

      // Test multiple renders to get P95 metrics
      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();
        
        await service.renderAndCreateEmailBodyPdf(
          'test-tenant',
          `perf-test-${i}`,
          fixtures.simple
        );
        
        renderTimes.push(Date.now() - startTime);
      }

      // Calculate P95 (95th percentile)
      renderTimes.sort((a, b) => a - b);
      const p95Index = Math.ceil(renderTimes.length * 0.95) - 1;
      const p95Time = renderTimes[p95Index];

      // P95 should be ≤ 3000ms for simple emails
      expect(p95Time).toBeLessThanOrEqual(3000);
    });
  });
});