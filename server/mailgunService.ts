import crypto from 'crypto';
import { Request } from 'express';

export interface MailgunMessage {
  recipient: string;
  sender: string;
  subject: string;
  bodyPlain: string;
  bodyHtml?: string;
  timestamp: string;
  token: string;
  signature: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    buffer: Buffer;
  }>;
}

export interface ParsedMailgunWebhook {
  message: MailgunMessage;
  isValid: boolean;
  error?: string;
}

/**
 * Parse Mailgun webhook multipart/form-data
 */
export function parseMailgunWebhook(req: Request): ParsedMailgunWebhook {
  try {
    const body = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    // Extract required fields
    const recipient = body.recipient;
    const sender = body.sender || body.from;
    const subject = body.subject || '';
    const bodyPlain = body['body-plain'] || '';
    const bodyHtml = body['body-html'];
    const timestamp = body.timestamp;
    const token = body.token;
    const signature = body.signature;

    // Validate required fields
    if (!recipient || !sender || !timestamp || !token || !signature) {
      return {
        message: {} as MailgunMessage,
        isValid: false,
        error: 'Missing required fields: recipient, sender, timestamp, token, or signature'
      };
    }

    // Process attachments
    const attachments = files ? files.map(file => ({
      filename: file.originalname || 'unknown',
      contentType: file.mimetype,
      size: file.size,
      buffer: file.buffer
    })) : [];

    const message: MailgunMessage = {
      recipient,
      sender,
      subject,
      bodyPlain,
      bodyHtml,
      timestamp,
      token,
      signature,
      attachments
    };

    return {
      message,
      isValid: true
    };

  } catch (error) {
    console.error('Error parsing Mailgun webhook:', error);
    return {
      message: {} as MailgunMessage,
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error'
    };
  }
}

/**
 * Verify Mailgun webhook signature using HMAC SHA256
 * TICKET 2: Enhanced signature verification with proper error handling
 */
export function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string
): boolean {
  try {
    // Validate input parameters
    if (!timestamp || !token || !signature || !signingKey) {
      console.error('Missing required signature verification parameters', {
        hasTimestamp: !!timestamp,
        hasToken: !!token,
        hasSignature: !!signature,
        hasSigningKey: !!signingKey
      });
      return false;
    }

    // Check timestamp to prevent replay attacks (optional but recommended)
    const messageTimestamp = parseInt(timestamp);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeDifference = Math.abs(currentTimestamp - messageTimestamp);
    
    // Allow up to 15 minutes of time difference to account for clock skew
    if (timeDifference > 900) {
      console.warn('Mailgun webhook timestamp too old or too far in future', {
        messageTimestamp,
        currentTimestamp,
        differenceSeconds: timeDifference
      });
      // Note: In production, you might want to reject old timestamps
      // For now, we log but don't reject to avoid issues during development
    }

    // Create the signature string exactly as Mailgun does
    const data = timestamp + token;
    const expectedSignature = crypto
      .createHmac('sha256', signingKey)
      .update(data)
      .digest('hex');
    
    // Use timing-safe comparison to prevent timing attacks
    const providedSignature = signature.toLowerCase();
    const expectedSignatureLower = expectedSignature.toLowerCase();
    
    if (providedSignature.length !== expectedSignatureLower.length) {
      console.error('Signature length mismatch', {
        providedLength: providedSignature.length,
        expectedLength: expectedSignatureLower.length
      });
      return false;
    }
    
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignatureLower, 'hex')
    );
    
  } catch (error) {
    console.error('Error verifying Mailgun signature:', error);
    return false;
  }
}

/**
 * Extract user ID from recipient email using subaddressing
 * Supports formats like: upload+12345@myhome-tech.com
 */
export function extractUserIdFromRecipient(recipient: string): string | null {
  try {
    // Support subaddressing format: upload+userId@domain
    const match = recipient.match(/upload\+([^@]+)@/);
    if (match) {
      return match[1];
    }

    // Could also support token-based mapping in the future
    return null;
  } catch (error) {
    console.error('Error extracting user ID from recipient:', error);
    return null;
  }
}

/**
 * Validate attachment for document ingestion
 */
export function validateAttachment(attachment: { filename: string; contentType: string; size: number }): {
  isValid: boolean;
  error?: string;
} {
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
  ];

  // Check file size
  if (attachment.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size ${attachment.size} bytes exceeds 10MB limit`
    };
  }

  // Check file type
  if (!ALLOWED_TYPES.includes(attachment.contentType)) {
    return {
      isValid: false,
      error: `File type ${attachment.contentType} not supported. Allowed: PDF, JPG, PNG, WebP, DOCX`
    };
  }

  return { isValid: true };
}