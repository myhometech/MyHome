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
 * TICKET 3: Enhanced user ID extraction with validation
 * Supports formats like: upload+12345@myhome-tech.com
 */
export function extractUserIdFromRecipient(recipient: string): { userId: string | null; error?: string } {
  try {
    if (!recipient || typeof recipient !== 'string') {
      return {
        userId: null,
        error: 'Invalid recipient: must be a non-empty string'
      };
    }

    // Normalize recipient to lowercase for consistent parsing
    const normalizedRecipient = recipient.toLowerCase().trim();

    // Support subaddressing format: upload+userId@domain
    // Ensure there's exactly one @ symbol and the format is correct
    const atCount = (normalizedRecipient.match(/@/g) || []).length;
    if (atCount !== 1) {
      return {
        userId: null,
        error: `Invalid email format: must contain exactly one @ symbol. Found ${atCount}`
      };
    }

    const subaddressMatch = normalizedRecipient.match(/^upload\+([^@]+)@([^@]+)$/);
    if (subaddressMatch) {
      const userId = subaddressMatch[1];
      const domain = subaddressMatch[2];

      // Validate user ID format (alphanumeric, hyphens, underscores)
      if (!/^[a-z0-9\-_]+$/.test(userId)) {
        return {
          userId: null,
          error: `Invalid user ID format in subaddress: ${userId}. Must contain only letters, numbers, hyphens, and underscores`
        };
      }

      // Log successful extraction for monitoring
      console.log(`✅ Extracted user ID from subaddress:`, {
        recipient: normalizedRecipient,
        userId,
        domain
      });

      return { userId };
    }

    // Check for direct upload@ format (no subaddress)
    if (normalizedRecipient.match(/^upload@/)) {
      return {
        userId: null,
        error: 'Missing user ID in subaddress. Use format: upload+userID@myhome-tech.com'
      };
    }

    // Unrecognized format
    return {
      userId: null,
      error: `Unsupported recipient format: ${normalizedRecipient}. Expected format: upload+userID@myhome-tech.com`
    };

  } catch (error) {
    console.error('Error extracting user ID from recipient:', error);
    return {
      userId: null,
      error: `Failed to parse recipient address: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * TICKET 4: Enhanced attachment validation for document ingestion
 */
export function validateAttachment(attachment: { 
  filename: string; 
  contentType: string; 
  size: number;
  buffer?: Buffer;
}): {
  isValid: boolean;
  error?: string;
  warnings?: string[];
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

  const warnings: string[] = [];

  // Validate required fields
  if (!attachment.filename || !attachment.contentType || typeof attachment.size !== 'number') {
    return {
      isValid: false,
      error: 'Missing required attachment fields (filename, contentType, or size)'
    };
  }

  // Check file size
  if (attachment.size <= 0) {
    return {
      isValid: false,
      error: 'File size must be greater than 0 bytes'
    };
  }

  if (attachment.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File "${attachment.filename}" size ${formatFileSize(attachment.size)} exceeds 10MB limit`
    };
  }

  // Normalize MIME type for comparison
  const normalizedContentType = attachment.contentType.toLowerCase().trim();

  // Check file type
  if (!ALLOWED_TYPES.includes(normalizedContentType)) {
    return {
      isValid: false,
      error: `File type "${normalizedContentType}" not supported. Allowed: PDF, JPG, PNG, WebP, DOCX`
    };
  }

  // Additional filename extension validation (security check)
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx'];
  const fileExtension = attachment.filename.toLowerCase().split('.').pop();
  
  if (!fileExtension || !allowedExtensions.includes(`.${fileExtension}`)) {
    warnings.push(`File extension ".${fileExtension}" doesn't match common patterns for MIME type ${normalizedContentType}`);
  }

  // Size-based warnings
  if (attachment.size > 5 * 1024 * 1024) { // 5MB
    warnings.push(`Large file size: ${formatFileSize(attachment.size)}. Processing may take longer.`);
  }

  // MIME type and extension consistency check
  const mimeExtensionMap: Record<string, string[]> = {
    'application/pdf': ['pdf'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/jpg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx']
  };

  const expectedExtensions = mimeExtensionMap[normalizedContentType];
  if (expectedExtensions && fileExtension && !expectedExtensions.includes(fileExtension)) {
    warnings.push(`MIME type "${normalizedContentType}" doesn't match file extension ".${fileExtension}"`);
  }

  return { 
    isValid: true, 
    warnings: warnings.length > 0 ? warnings : undefined 
  };
}

/**
 * Helper function to format file sizes in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * TICKET 4: Validate and filter multiple attachments from email
 */
export function validateEmailAttachments(attachments: Array<{
  filename: string;
  contentType: string;
  size: number;
  buffer: Buffer;
}>): {
  validAttachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    buffer: Buffer;
    warnings?: string[];
  }>;
  invalidAttachments: Array<{
    filename: string;
    error: string;
  }>;
  hasValidAttachments: boolean;
  summary: string;
} {
  const validAttachments = [];
  const invalidAttachments = [];

  if (!attachments || attachments.length === 0) {
    return {
      validAttachments: [],
      invalidAttachments: [],
      hasValidAttachments: false,
      summary: 'No attachments found in email'
    };
  }

  for (const attachment of attachments) {
    const validation = validateAttachment(attachment);
    
    if (validation.isValid) {
      validAttachments.push({
        ...attachment,
        warnings: validation.warnings
      });
    } else {
      invalidAttachments.push({
        filename: attachment.filename,
        error: validation.error || 'Unknown validation error'
      });
    }
  }

  const totalValidSize = validAttachments.reduce((sum, att) => sum + att.size, 0);
  const summary = `${validAttachments.length} valid, ${invalidAttachments.length} invalid attachments. Total size: ${formatFileSize(totalValidSize)}`;

  return {
    validAttachments,
    invalidAttachments,
    hasValidAttachments: validAttachments.length > 0,
    summary
  };
}