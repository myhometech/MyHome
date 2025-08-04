import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { verifyMailgunSignature, parseMailgunWebhook, extractUserIdFromRecipient, validateAttachment } from '../mailgunService';

describe('Mailgun Service', () => {
  describe('verifyMailgunSignature', () => {
    const testSigningKey = 'test-signing-key-12345';
    let timestamp: string;
    let token: string;
    let validSignature: string;

    beforeEach(() => {
      timestamp = Math.floor(Date.now() / 1000).toString();
      token = 'test-token-' + Math.random().toString(36).substring(7);
      
      // Generate valid signature
      const data = timestamp + token;
      validSignature = crypto
        .createHmac('sha256', testSigningKey)
        .update(data)
        .digest('hex');
    });

    it('should verify valid signature', () => {
      const result = verifyMailgunSignature(timestamp, token, validSignature, testSigningKey);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const invalidSignature = 'invalid-signature-12345';
      const result = verifyMailgunSignature(timestamp, token, invalidSignature, testSigningKey);
      expect(result).toBe(false);
    });

    it('should reject tampered timestamp', () => {
      const tamperedTimestamp = (parseInt(timestamp) + 100).toString();
      const result = verifyMailgunSignature(tamperedTimestamp, token, validSignature, testSigningKey);
      expect(result).toBe(false);
    });

    it('should reject tampered token', () => {
      const tamperedToken = token + '-tampered';
      const result = verifyMailgunSignature(timestamp, tamperedToken, validSignature, testSigningKey);
      expect(result).toBe(false);
    });

    it('should reject empty parameters', () => {
      expect(verifyMailgunSignature('', token, validSignature, testSigningKey)).toBe(false);
      expect(verifyMailgunSignature(timestamp, '', validSignature, testSigningKey)).toBe(false);
      expect(verifyMailgunSignature(timestamp, token, '', testSigningKey)).toBe(false);
      expect(verifyMailgunSignature(timestamp, token, validSignature, '')).toBe(false);
    });

    it('should handle case-insensitive signature comparison', () => {
      const upperCaseSignature = validSignature.toUpperCase();
      const result = verifyMailgunSignature(timestamp, token, upperCaseSignature, testSigningKey);
      expect(result).toBe(true);
    });

    it('should handle wrong signing key', () => {
      const wrongKey = 'wrong-signing-key';
      const result = verifyMailgunSignature(timestamp, token, validSignature, wrongKey);
      expect(result).toBe(false);
    });
  });

  describe('extractUserIdFromRecipient', () => {
    it('should extract user ID from valid subaddressing format', () => {
      const recipient = 'upload+user123@myhome-tech.com';
      const result = extractUserIdFromRecipient(recipient);
      expect(result.userId).toBe('user123');
      expect(result.error).toBeUndefined();
    });

    it('should extract UUID user ID', () => {
      const recipient = 'upload+94a7b7f0-3266-4a4f-9d4e-875542d30e62@myhome-tech.com';
      const result = extractUserIdFromRecipient(recipient);
      expect(result.userId).toBe('94a7b7f0-3266-4a4f-9d4e-875542d30e62');
      expect(result.error).toBeUndefined();
    });

    it('should handle case insensitive recipients', () => {
      const recipient = 'UPLOAD+User123@MyHome-Tech.COM';
      const result = extractUserIdFromRecipient(recipient);
      expect(result.userId).toBe('user123');
      expect(result.error).toBeUndefined();
    });

    it('should return error for invalid format', () => {
      const testCases = [
        {
          recipient: 'invalid@myhome-tech.com',
          expectedError: 'Unsupported recipient format'
        },
        {
          recipient: 'upload@myhome-tech.com',
          expectedError: 'Missing user ID in subaddress'
        },
        {
          recipient: 'user123@myhome-tech.com',
          expectedError: 'Unsupported recipient format'
        },
        {
          recipient: 'upload-user123@myhome-tech.com',
          expectedError: 'Unsupported recipient format'
        }
      ];

      testCases.forEach(({ recipient, expectedError }) => {
        const result = extractUserIdFromRecipient(recipient);
        expect(result.userId).toBeNull();
        expect(result.error).toContain(expectedError);
      });
    });

    it('should reject invalid user ID characters', () => {
      const testCases = [
        {
          recipient: 'upload+user@123@myhome-tech.com',
          expectedError: 'Invalid email format' // Multiple @ symbols
        },
        {
          recipient: 'upload+user spaces@myhome-tech.com',
          expectedError: 'Invalid user ID format' // Spaces in user ID
        },
        {
          recipient: 'upload+user!#$@myhome-tech.com',
          expectedError: 'Invalid user ID format' // Special characters (no @ in user ID)
        },
        {
          recipient: 'upload+user.dot@myhome-tech.com',
          expectedError: 'Invalid user ID format' // Dots not allowed
        }
      ];

      testCases.forEach(({ recipient, expectedError }) => {
        const result = extractUserIdFromRecipient(recipient);
        expect(result.userId).toBeNull();
        expect(result.error).toContain(expectedError);
      });
    });

    it('should handle different domains gracefully', () => {
      const recipient = 'upload+user123@other-domain.com';
      const result = extractUserIdFromRecipient(recipient);
      expect(result.userId).toBe('user123');
      expect(result.error).toBeUndefined();
    });

    it('should handle empty or invalid input', () => {
      const invalidInputs = ['', null, undefined, 123];

      invalidInputs.forEach(input => {
        const result = extractUserIdFromRecipient(input as any);
        expect(result.userId).toBeNull();
        expect(result.error).toContain('Invalid recipient');
      });
    });

    it('should handle whitespace in recipient', () => {
      const recipient = '  upload+user123@myhome-tech.com  ';
      const result = extractUserIdFromRecipient(recipient);
      expect(result.userId).toBe('user123');
      expect(result.error).toBeUndefined();
    });
  });

  describe('validateAttachment', () => {
    it('should accept valid PDF attachment', () => {
      const attachment = {
        filename: 'document.pdf',
        contentType: 'application/pdf',
        size: 5 * 1024 * 1024 // 5MB
      };

      const result = validateAttachment(attachment);
      expect(result.isValid).toBe(true);
    });

    it('should accept valid image attachments', () => {
      const validTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
      ];

      validTypes.forEach(contentType => {
        const attachment = {
          filename: 'image.jpg',
          contentType,
          size: 2 * 1024 * 1024 // 2MB
        };

        const result = validateAttachment(attachment);
        expect(result.isValid).toBe(true);
      });
    });

    it('should accept valid DOCX attachment', () => {
      const attachment = {
        filename: 'document.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 3 * 1024 * 1024 // 3MB
      };

      const result = validateAttachment(attachment);
      expect(result.isValid).toBe(true);
    });

    it('should reject oversized files', () => {
      const attachment = {
        filename: 'large-file.pdf',
        contentType: 'application/pdf',
        size: 15 * 1024 * 1024 // 15MB (over 10MB limit)
      };

      const result = validateAttachment(attachment);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds 10MB limit');
    });

    it('should reject unsupported file types', () => {
      const unsupportedTypes = [
        'application/zip',
        'text/plain',
        'application/msword',
        'image/gif',
        'video/mp4'
      ];

      unsupportedTypes.forEach(contentType => {
        const attachment = {
          filename: 'file.txt',
          contentType,
          size: 1024 * 1024 // 1MB
        };

        const result = validateAttachment(attachment);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('not supported');
      });
    });
  });

  describe('parseMailgunWebhook', () => {
    it('should parse valid webhook request', () => {
      const mockRequest = {
        body: {
          recipient: 'upload+user123@myhome-tech.com',
          sender: 'user@example.com',
          subject: 'Test Document',
          'body-plain': 'Please process this document',
          timestamp: Math.floor(Date.now() / 1000).toString(),
          token: 'test-token',
          signature: 'test-signature'
        },
        files: [
          {
            originalname: 'document.pdf',
            mimetype: 'application/pdf',
            size: 1024 * 1024,
            buffer: Buffer.from('fake-pdf-content')
          }
        ]
      } as any;

      const result = parseMailgunWebhook(mockRequest);
      
      expect(result.isValid).toBe(true);
      expect(result.message.recipient).toBe('upload+user123@myhome-tech.com');
      expect(result.message.sender).toBe('user@example.com');
      expect(result.message.subject).toBe('Test Document');
      expect(result.message.attachments).toHaveLength(1);
      expect(result.message.attachments[0].filename).toBe('document.pdf');
    });

    it('should handle missing required fields', () => {
      const mockRequest = {
        body: {
          recipient: 'upload+user123@myhome-tech.com'
          // Missing sender, timestamp, token, signature
        },
        files: []
      } as any;

      const result = parseMailgunWebhook(mockRequest);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should handle requests without attachments', () => {
      const mockRequest = {
        body: {
          recipient: 'upload+user123@myhome-tech.com',
          sender: 'user@example.com',
          subject: 'No attachments',
          'body-plain': 'This email has no attachments',
          timestamp: Math.floor(Date.now() / 1000).toString(),
          token: 'test-token',
          signature: 'test-signature'
        },
        files: undefined
      } as any;

      const result = parseMailgunWebhook(mockRequest);
      
      expect(result.isValid).toBe(true);
      expect(result.message.attachments).toHaveLength(0);
    });
  });
});