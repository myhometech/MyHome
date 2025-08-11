// Test data utilities for setting up email document fixtures
export const createTestEmailDocument = (overrides: any = {}) => ({
  id: 123,
  name: 'Test Email Attachment.pdf',
  mimeType: 'application/pdf',
  fileSize: 2048000,
  source: 'email',
  uploadSource: 'email',
  emailContext: {
    messageId: 'test-msg-123@example.com',
    from: 'sender@example.com',
    to: ['user@example.com'],
    subject: 'Test Email',
    bodyHtml: '<p>Test email content</p>',
    bodyPlain: 'Test email content',
    receivedAt: '2025-08-11T10:00:00Z',
    ingestGroupId: 'grp_test_123',
    bodyHash: 'sha256:test-hash-123'
  },
  createdAt: '2025-08-11T10:00:00Z',
  updatedAt: '2025-08-11T10:00:00Z',
  ...overrides
});

export const createTestUser = (overrides: any = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'user',
  subscriptionTier: 'premium',
  isActive: true,
  ...overrides
});

export const createTestPdfResponse = (overrides: any = {}) => ({
  documentId: 456,
  created: true,
  linkedCount: 1,
  name: 'Email - Test Email - 2025-08-11.pdf',
  renderTimeMs: 1500,
  sizeBytes: 1024000,
  ...overrides
});

export const mockFeatureFlags = {
  enabled: {
    'emailPdf.manualEnabled': true,
    'emailPdf.autoNoAttachmentsEnabled': false,
    'emailPdf.autoWithAttachmentsEnabled': false,
    'emailPdf.autoTagging': true
  },
  disabled: {
    'emailPdf.manualEnabled': false,
    'emailPdf.autoNoAttachmentsEnabled': false,
    'emailPdf.autoWithAttachmentsEnabled': false,
    'emailPdf.autoTagging': false
  }
};

export const createTestReference = (overrides: any = {}) => ({
  type: 'email',
  relation: 'source',
  documentId: 789,
  metadata: {
    messageId: 'test-ref-msg@example.com'
  },
  ...overrides
});

export const createBatchSummaryResponse = (documentIds: number[]) => 
  documentIds.map(id => ({
    id,
    name: `Document ${id}.pdf`,
    mimeType: 'application/pdf',
    fileSize: 1024000 + (id * 1000), // Vary file sizes
    source: 'email',
    uploadedAt: '2025-08-11T10:00:00Z',
    isEmailBodyPdf: id % 2 === 0 // Alternate between body PDFs and attachments
  }));

// Error responses for testing error handling
export const testErrors = {
  featureDisabled: {
    status: 403,
    body: {
      errorCode: 'FEATURE_DISABLED',
      message: 'Manual email PDF feature is not enabled for this user'
    }
  },
  documentNotFound: {
    status: 404,
    body: {
      errorCode: 'DOCUMENT_NOT_FOUND',
      message: 'Document not found or access denied'
    }
  },
  emailContextMissing: {
    status: 400,
    body: {
      errorCode: 'EMAIL_CONTEXT_MISSING',
      message: 'Document is not an email attachment or missing email context'
    }
  },
  emailTooLarge: {
    status: 413,
    body: {
      errorCode: 'EMAIL_TOO_LARGE_AFTER_COMPRESSION',
      message: 'Email content too large to convert to PDF'
    }
  },
  renderFailed: {
    status: 500,
    body: {
      errorCode: 'EMAIL_RENDER_FAILED',
      message: 'Failed to render email content to PDF'
    }
  },
  internalError: {
    status: 500,
    body: {
      errorCode: 'INTERNAL_ERROR',
      message: 'Failed to create email PDF'
    }
  }
};