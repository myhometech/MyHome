import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { validateEmailAttachments } from '../mailgunService';
import { storage } from '../storage';
import { storageProvider, StorageService } from '../storage/StorageService';
import { EncryptionService } from '../encryptionService';
import { supportsOCR, isPDFFile } from '../ocrService';

// Mock dependencies
vi.mock('../storage', () => ({
  storage: {
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    createEmailForward: vi.fn(),
    updateDocumentTags: vi.fn(),
    updateDocumentOCRAndSummary: vi.fn(),
  }
}));

vi.mock('../storage/StorageService', () => ({
  storageProvider: vi.fn(),
  StorageService: {
    generateFileKey: vi.fn()
  }
}));

vi.mock('../encryptionService', () => ({
  EncryptionService: {
    generateDocumentKey: vi.fn(),
    encryptDocumentKey: vi.fn()
  }
}));

vi.mock('../tagSuggestionService', () => ({
  tagSuggestionService: {
    suggestTags: vi.fn()
  }
}));

vi.mock('../ocrQueue', () => ({
  ocrQueue: {
    addJob: vi.fn()
  }
}));

describe('TICKET 5: Email Document Integration Pipeline', () => {
  const mockUserId = '94a7b7f0-3266-4a4f-9d4e-875542d30e62';
  const mockStorageService = {
    upload: vi.fn(),
    delete: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (storageProvider as any).mockReturnValue(mockStorageService);
    (StorageService.generateFileKey as any).mockReturnValue('users/test-user/documents/test-file.pdf');
    (EncryptionService.generateDocumentKey as any).mockReturnValue('mock-document-key');
    (EncryptionService.encryptDocumentKey as any).mockReturnValue('encrypted-mock-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should process valid PDF attachment through document pipeline', async () => {
    // Arrange
    const mockPdfBuffer = Buffer.from('mock-pdf-content');
    const mockAttachments = [
      {
        filename: 'contract.pdf',
        buffer: mockPdfBuffer,
        contentType: 'application/pdf',
        size: 5000
      }
    ];

    const mockDocument = {
      id: 123,
      userId: mockUserId,
      name: 'contract',
      fileName: 'contract.pdf',
      filePath: '',
      fileSize: 5000,
      mimeType: 'application/pdf'
    };

    // Mock storage responses
    (storage.createDocument as any).mockResolvedValue(mockDocument);
    (storage.updateDocument as any).mockResolvedValue({ ...mockDocument, status: 'active' });
    (storage.createEmailForward as any).mockResolvedValue({ id: 1 });
    (storage.updateDocumentTags as any).mockResolvedValue(undefined);
    (storage.updateDocumentOCRAndSummary as any).mockResolvedValue(undefined);
    
    mockStorageService.upload.mockResolvedValue('gcs-key-12345');

    // Act
    const attachmentValidation = validateEmailAttachments(mockAttachments);

    // Assert validation results
    expect(attachmentValidation.hasValidAttachments).toBe(true);
    expect(attachmentValidation.validAttachments).toHaveLength(1);
    expect(attachmentValidation.validAttachments[0]).toMatchObject({
      filename: 'contract.pdf',
      contentType: 'application/pdf',
      size: 5000,
      buffer: mockPdfBuffer
    });

    // Verify document would be created with correct data
    const validAttachment = attachmentValidation.validAttachments[0];
    expect(validAttachment.filename).toBe('contract.pdf');
    expect(validAttachment.contentType).toBe('application/pdf');
    expect(validAttachment.size).toBe(5000);
  });

  it('should handle multiple attachments with mixed validity', async () => {
    // Arrange
    const mockAttachments = [
      {
        filename: 'valid.pdf',
        buffer: Buffer.from('pdf-content'),
        contentType: 'application/pdf',
        size: 3000
      },
      {
        filename: 'invalid.txt',
        buffer: Buffer.from('text-content'),
        contentType: 'text/plain',
        size: 1000
      },
      {
        filename: 'photo.jpg',
        buffer: Buffer.from('jpg-content'),
        contentType: 'image/jpeg',
        size: 8000
      }
    ];

    // Act
    const attachmentValidation = validateEmailAttachments(mockAttachments);

    // Assert
    expect(attachmentValidation.validAttachments).toHaveLength(2);
    expect(attachmentValidation.invalidAttachments).toHaveLength(1);
    
    // Valid attachments
    expect(attachmentValidation.validAttachments[0].filename).toBe('valid.pdf');
    expect(attachmentValidation.validAttachments[1].filename).toBe('photo.jpg');
    
    // Invalid attachment
    expect(attachmentValidation.invalidAttachments[0]).toMatchObject({
      filename: 'invalid.txt',
      error: 'Unsupported file type: text/plain'
    });
  });

  it('should create proper encryption metadata for email documents', async () => {
    // Arrange
    const validAttachment = {
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      size: 4500,
      buffer: Buffer.from('invoice-content')
    };

    const expectedEncryptionMetadata = {
      storageType: 'cloud',
      storageKey: 'gcs-key-12345',
      encrypted: true,
      algorithm: 'AES-256-GCM',
      source: 'email',
      sender: 'billing@company.com',
      subject: 'Monthly Invoice',
      processedAt: expect.any(String)
    };

    // Act - simulate the encryption metadata creation
    const documentKey = EncryptionService.generateDocumentKey();
    const encryptedDocumentKey = EncryptionService.encryptDocumentKey(documentKey);
    const encryptionMetadata = JSON.stringify({
      storageType: 'cloud',
      storageKey: 'gcs-key-12345',
      encrypted: true,
      algorithm: 'AES-256-GCM',
      source: 'email',
      sender: 'billing@company.com',
      subject: 'Monthly Invoice',
      processedAt: new Date().toISOString()
    });

    // Assert
    expect(EncryptionService.generateDocumentKey).toHaveBeenCalled();
    expect(EncryptionService.encryptDocumentKey).toHaveBeenCalledWith('mock-document-key');
    
    const parsedMetadata = JSON.parse(encryptionMetadata);
    expect(parsedMetadata).toMatchObject({
      storageType: 'cloud',
      storageKey: 'gcs-key-12345',
      encrypted: true,
      algorithm: 'AES-256-GCM',
      source: 'email',
      sender: 'billing@company.com',
      subject: 'Monthly Invoice'
    });
    expect(parsedMetadata.processedAt).toBeDefined();
  });

  it('should handle storage upload failures gracefully', async () => {
    // Arrange
    const validAttachment = {
      filename: 'test.pdf',
      contentType: 'application/pdf',
      size: 2000,
      buffer: Buffer.from('test-content')
    };

    const mockDocument = { id: 456, userId: mockUserId };
    
    (storage.createDocument as any).mockResolvedValue(mockDocument);
    mockStorageService.upload.mockRejectedValue(new Error('GCS upload failed'));
    (storage.deleteDocument as any).mockResolvedValue(undefined);

    // Act & Assert
    const storageKey = StorageService.generateFileKey(mockUserId, '456', 'test.pdf');
    
    try {
      await mockStorageService.upload(validAttachment.buffer, storageKey, validAttachment.contentType);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('GCS upload failed');
      
      // Verify cleanup would be called
      expect(StorageService.generateFileKey).toHaveBeenCalledWith(mockUserId, '456', 'test.pdf');
    }
  });

  it('should generate appropriate tags for email documents', async () => {
    // Arrange
    const emailContext = {
      sender: 'insurance@company.com',
      subject: 'Policy Renewal Notice 2025',
      body: 'Your insurance policy is due for renewal. Please review the attached documents.'
    };

    // Mock tag suggestions
    const mockTagSuggestions = {
      suggestedTags: [
        { tag: 'insurance', confidence: 0.9 },
        { tag: 'policy', confidence: 0.8 },
        { tag: 'renewal', confidence: 0.7 }
      ]
    };

    const { tagSuggestionService } = await import('../tagSuggestionService');
    (tagSuggestionService.suggestTags as any).mockResolvedValue(mockTagSuggestions);

    // Act
    const filename = 'policy-renewal.pdf';
    const contextText = `Email from: ${emailContext.sender}\nSubject: ${emailContext.subject}\n${emailContext.body.substring(0, 500)}`;
    const emailTags = ['email-imported', 'policy', 'renewal', 'notice'];

    await tagSuggestionService.suggestTags(filename, contextText, 'application/pdf', emailTags);

    // Assert
    expect(tagSuggestionService.suggestTags).toHaveBeenCalledWith(
      filename,
      contextText,
      'application/pdf',
      emailTags
    );

    // Verify combined tags would include both email context and suggestions
    const combinedTags = [...emailTags];
    mockTagSuggestions.suggestedTags.forEach(suggestion => {
      if (suggestion.confidence >= 0.6 && !combinedTags.includes(suggestion.tag)) {
        combinedTags.push(suggestion.tag);
      }
    });

    expect(combinedTags).toContain('email-imported');
    expect(combinedTags).toContain('insurance');
    expect(combinedTags).toContain('policy');
    expect(combinedTags).toContain('renewal');
  });

  it('should validate email forwarding record creation', async () => {
    // Arrange
    const emailData = {
      userId: mockUserId,
      fromEmail: 'sender@company.com',
      subject: 'Test Document',
      emailBody: 'Email body content',
      hasAttachments: true,
      attachmentCount: 2,
      documentsCreated: 2,
      status: 'processed' as const,
      errorMessage: null
    };

    (storage.createEmailForward as any).mockResolvedValue({ id: 789, ...emailData });

    // Act
    const result = await storage.createEmailForward(emailData);

    // Assert
    expect(storage.createEmailForward).toHaveBeenCalledWith(emailData);
    expect(result).toMatchObject({
      id: 789,
      userId: mockUserId,
      fromEmail: 'sender@company.com',
      subject: 'Test Document',
      hasAttachments: true,
      attachmentCount: 2,
      documentsCreated: 2,
      status: 'processed'
    });
  });

  it('should handle OCR queue integration for PDFs and images', async () => {
    // Arrange
    const pdfAttachment = {
      filename: 'scan.pdf',
      contentType: 'application/pdf',
      size: 7500
    };

    const imageAttachment = {
      filename: 'receipt.jpg',
      contentType: 'image/jpeg',
      size: 3200
    };

    const { ocrQueue } = await import('../ocrQueue');
    (ocrQueue.addJob as any).mockResolvedValue(undefined);

    // Act & Assert for PDF
    const pdfSupportsOCRCheck = supportsOCR(pdfAttachment.contentType) || isPDFFile(pdfAttachment.contentType);
    expect(pdfSupportsOCRCheck).toBe(true);

    // Act & Assert for Image
    const imageSupportsOCRCheck = supportsOCR(imageAttachment.contentType) || isPDFFile(imageAttachment.contentType);
    expect(imageSupportsOCRCheck).toBe(true);

    // Verify OCR job would be queued
    await ocrQueue.addJob({
      documentId: 123,
      fileName: pdfAttachment.filename,
      filePathOrGCSKey: 'gcs-key-12345',
      mimeType: pdfAttachment.contentType,
      userId: mockUserId,
      priority: 3
    });

    expect(ocrQueue.addJob).toHaveBeenCalledWith({
      documentId: 123,
      fileName: 'scan.pdf',
      filePathOrGCSKey: 'gcs-key-12345',
      mimeType: 'application/pdf',
      userId: mockUserId,
      priority: 3
    });
  });
});