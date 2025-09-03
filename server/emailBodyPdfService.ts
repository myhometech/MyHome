// Email Body → PDF Render Service (Server)
// Converts email HTML/text body into sanitized PDF and creates MyHome document
// Idempotent per (tenantId, messageId, bodyHash) with ≤10MB limit enforcement
// Now uses CloudConvert exclusively for HTML-to-PDF conversion

import crypto from 'crypto';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { CloudConvertService } from './cloudConvertService.js';
import { storage } from './storage.js';
import { insertDocumentSchema, type InsertDocument } from '../shared/schema.js';
import { nanoid } from 'nanoid';

// Input/Output Types
export interface EmailBodyPdfInput {
  tenantId: string;
  messageId: string;                 // required for idempotency
  subject?: string | null;
  from: string;                      // "Display Name <email@domain>"
  to: string[];                      // ["user+inbox@myhome.app"]
  receivedAt: string;                // ISO
  html?: string | null;              // preferred
  text?: string | null;              // fallback
  ingestGroupId?: string | null;
  categoryId?: string | null;        // default null
  tags?: string[];                   // optional, e.g., ["email"]
}

export type EmailBodyPdfOutput =
  | { created: true; documentId: string; name: string }
  | { created: false; documentId: string; name: string }; // idempotent hit

// Error codes
export const EMAIL_PDF_ERRORS = {
  EMAIL_BODY_MISSING: 'EMAIL_BODY_MISSING',
  EMAIL_SANITIZE_FAILED: 'EMAIL_SANITIZE_FAILED', 
  EMAIL_RENDER_FAILED: 'EMAIL_RENDER_FAILED',
  EMAIL_TOO_LARGE_AFTER_COMPRESSION: 'EMAIL_TOO_LARGE_AFTER_COMPRESSION'
} as const;

export class EmailBodyPdfError extends Error {
  constructor(public code: keyof typeof EMAIL_PDF_ERRORS, message: string) {
    super(message);
    this.name = 'EmailBodyPdfError';
  }
}

// Analytics event types
const ANALYTICS_EVENTS = {
  SUCCESS: 'email_ingest_body_pdf_generated',
  FAILURE: 'email_ingest_body_pdf_failed', 
  SKIPPED: 'email_ingest_body_pdf_skipped'
} as const;

// CloudConvert service instance for HTML-to-PDF conversion

/**
 * Sanitize HTML content using DOMPurify with JSDOM
 * Removes scripts, iframes, external requests - allows safe inline styles and data: images
 */
function sanitizeHtml(html: string): string {
  try {
    const window = new JSDOM('').window;
    const purify = DOMPurify(window);

    // Configure DOMPurify for email content
    const clean = purify.sanitize(html, {
      ALLOWED_TAGS: [
        'div', 'p', 'span', 'a', 'strong', 'em', 'b', 'i', 'u', 's', 'br', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'pre', 'code',
        'center', 'font', 'small', 'big', 'sub', 'sup'
      ],
      ALLOWED_ATTR: [
        'style', 'class', 'id', 'href', 'src', 'alt', 'title', 'width', 'height',
        'align', 'valign', 'bgcolor', 'color', 'size', 'face', 'colspan', 'rowspan'
      ],
      ALLOWED_URI_REGEXP: /^(?:data:|#)/i, // Only allow data: URIs and anchors
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover'],
      KEEP_CONTENT: true
    });

    return clean;
  } catch (error) {
    console.error('HTML sanitization failed:', error);
    throw new EmailBodyPdfError('EMAIL_SANITIZE_FAILED', `Failed to sanitize HTML: ${error}`);
  }
}

/**
 * Create simple HTML template for text-only emails
 */
function wrapTextInHtml(text: string, subject?: string | null, from?: string): string {
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject || 'Email'}</title>
  <style>
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      margin: 20px;
      white-space: pre-wrap;
    }
    .email-header {
      border-bottom: 1px solid #ccc;
      padding-bottom: 10px;
      margin-bottom: 20px;
      font-size: 11px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="email-header">
    ${subject ? `<div><strong>Subject:</strong> ${subject}</div>` : ''}
    ${from ? `<div><strong>From:</strong> ${from}</div>` : ''}
  </div>
  <div class="email-content">
    ${escapedText}
  </div>
</body>
</html>`;
}

/**
 * Compute normalized body hash for idempotency
 */
function computeBodyHash(html: string): string {
  // Normalize whitespace and remove HTML comments
  const normalized = html
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
    
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate sanitized filename for email PDF
 */
function generateEmailPdfFilename(subject?: string | null, receivedAt?: string): string {
  const date = receivedAt ? new Date(receivedAt).toISOString().split('T')[0] : 'Unknown-Date';
  const subjectPart = subject ? subject.replace(/[^\w\s-]/g, '').trim() : 'No Subject';
  
  let filename = `Email - ${subjectPart} - ${date}.pdf`;
  
  // Ensure filename is ≤200 chars
  if (filename.length > 200) {
    const maxSubjectLength = 200 - `Email -  - ${date}.pdf`.length;
    const truncatedSubject = subjectPart.substring(0, maxSubjectLength);
    filename = `Email - ${truncatedSubject} - ${date}.pdf`;
  }
  
  return filename;
}

/**
 * Check if document already exists for idempotency
 */
async function checkExistingDocument(
  tenantId: string, 
  messageId: string, 
  bodyHash: string
): Promise<{ documentId: string; name: string } | null> {
  try {
    const documents = await storage.getDocuments(tenantId);
    
    const existing = documents.find((doc: any) => 
      doc.source === 'email' &&
      doc.emailContext &&
      typeof doc.emailContext === 'object' &&
      'messageId' in doc.emailContext &&
      doc.emailContext.messageId === messageId &&
      doc.fileName?.includes(bodyHash.substring(0, 8)) // Include hash in filename for verification
    );

    if (existing) {
      return {
        documentId: String(existing.id),
        name: existing.fileName || 'Email PDF'
      };
    }

    return null;
  } catch (error) {
    console.warn('Error checking existing document:', error);
    return null;
  }
}

/**
 * Render HTML to PDF with CloudConvert and size constraints
 */
async function renderHtmlToPdf(
  html: string, 
  maxSizeBytes: number = 10 * 1024 * 1024,
  attempt: 'first' | 'compressed' = 'first'
): Promise<Buffer> {
  try {
    // Apply compression styles on second attempt
    const htmlContent = attempt === 'compressed' ? `
      <style>
        img { max-width: 1200px !important; height: auto !important; }
        body { font-size: 11px !important; }
        * { max-width: 100% !important; }
      </style>
      ${html}
    ` : html;

    // TICKET: Use enhanced CloudConvert job creation and error handling
    const { createCcHtmlJob, waitAndDownloadFirstPdf, withRetry, isRetryableError } = await import('./cloudConvertService.js');
    
    // Create job with retry logic for 429/5xx errors
    const jobResult = await withRetry(
      () => createCcHtmlJob(htmlContent),
      isRetryableError,
      3
    );
    
    console.log(`CloudConvert job created for HTML conversion: ${jobResult.jobId}`);
    
    // Wait for completion and download PDF
    const pdfBuffer = await waitAndDownloadFirstPdf(null, jobResult.jobId);
    
    console.log(`PDF generated via CloudConvert (${attempt} attempt): ${pdfBuffer.length} bytes`);

    // Check size constraint
    if (pdfBuffer.length > maxSizeBytes) {
      if (attempt === 'first') {
        console.log('PDF too large, attempting compression...');
        return renderHtmlToPdf(html, maxSizeBytes, 'compressed');
      } else {
        throw new EmailBodyPdfError(
          'EMAIL_TOO_LARGE_AFTER_COMPRESSION',
          `PDF size ${pdfBuffer.length} bytes exceeds limit after compression`
        );
      }
    }
    
    return pdfBuffer;

  } catch (error) {
    // Enhanced error handling with CloudConvert error context
    if (error instanceof Error && error.name === 'CloudConvertError') {
      console.error('[CloudConvert] HTML to PDF conversion failed:', {
        code: (error as any).code,
        status: (error as any).httpStatus,
        message: error.message
      });
    }
    
    throw new EmailBodyPdfError(
      'EMAIL_RENDER_FAILED',
      `CloudConvert PDF rendering failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create provenance header HTML for email
 */
function createProvenanceHeader(input: EmailBodyPdfInput): string {
  return `
    <div style="border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 12px; color: #333;">
      <h3 style="margin: 0 0 10px 0; color: #007bff;">Email Document</h3>
      ${input.subject ? `<div><strong>Subject:</strong> ${input.subject}</div>` : ''}
      <div><strong>From:</strong> ${input.from}</div>
      <div><strong>To:</strong> ${input.to.join(', ')}</div>
      <div><strong>Received:</strong> ${new Date(input.receivedAt).toLocaleString()}</div>
      ${input.messageId ? `<div><strong>Message-ID:</strong> ${input.messageId}</div>` : ''}
    </div>
  `;
}

/**
 * Log analytics events for email PDF processing
 */
function logAnalyticsEvent(
  event: keyof typeof ANALYTICS_EVENTS,
  data: Record<string, any>
): void {
  try {
    const eventName = ANALYTICS_EVENTS[event];
    console.log(`[ANALYTICS] ${eventName}:`, data);
    
    // In a real implementation, you might send this to your analytics service
    // For now, we'll just log it for observability
  } catch (error) {
    console.warn('Failed to log analytics event:', error);
  }
}

/**
 * Main service function: Convert email body to PDF and create MyHome document
 */
export async function renderAndCreateEmailBodyPdf(input: EmailBodyPdfInput): Promise<EmailBodyPdfOutput> {
  const startTime = Date.now();
  
  try {
    // Validate input
    if (!input.html && !input.text) {
      throw new EmailBodyPdfError('EMAIL_BODY_MISSING', 'Both html and text are missing');
    }

    // Prepare HTML content
    let htmlContent: string;
    if (input.html) {
      htmlContent = sanitizeHtml(input.html);
    } else if (input.text) {
      htmlContent = wrapTextInHtml(input.text, input.subject, input.from);
    } else {
      throw new EmailBodyPdfError('EMAIL_BODY_MISSING', 'No content to render');
    }

    // Add provenance header
    const fullHtml = createProvenanceHeader(input) + htmlContent;
    
    // Compute body hash for idempotency
    const bodyHash = computeBodyHash(fullHtml);
    
    // Check for existing document (idempotency)
    const existing = await checkExistingDocument(input.tenantId, input.messageId, bodyHash);
    if (existing) {
      logAnalyticsEvent('SKIPPED', {
        tenantId: input.tenantId,
        messageId: input.messageId,
        reason: 'duplicate',
        documentId: existing.documentId
      });
      
      return {
        created: false,
        documentId: existing.documentId,
        name: existing.name
      };
    }

    // Render PDF
    const pdfBuffer = await renderHtmlToPdf(fullHtml);
    const renderTime = Date.now() - startTime;

    // Generate filename and secure key
    const filename = generateEmailPdfFilename(input.subject, input.receivedAt);
    const documentId = nanoid();
    const fileKey = `${input.tenantId}/${documentId}/${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    // Use the specialized email body document creation method
    const emailData = {
      messageId: input.messageId,
      from: input.from,
      to: input.to,
      subject: input.subject || null,
      receivedAt: input.receivedAt,
      ingestGroupId: input.ingestGroupId || null,
      bodyHash,
      filename,
      tags: input.tags || ['email'],
      categoryId: input.categoryId || null
    };

    const document = await storage.createEmailBodyDocument(input.tenantId, emailData, pdfBuffer);

    // Log success analytics
    logAnalyticsEvent('SUCCESS', {
      tenantId: input.tenantId,
      messageId: input.messageId,
      documentId: document.id,
      sizeBytes: pdfBuffer.length,
      renderMs: renderTime,
      created: true
    });

    return {
      created: true,
      documentId: String(document.id),
      name: filename
    };

  } catch (error) {
    const renderTime = Date.now() - startTime;
    
    // Log failure analytics
    logAnalyticsEvent('FAILURE', {
      tenantId: input.tenantId,
      messageId: input.messageId,
      errorCode: error instanceof EmailBodyPdfError ? error.code : 'UNKNOWN_ERROR',
      renderMs: renderTime,
      error: error instanceof Error ? error.message : String(error)
    });

    throw error;
  }
}

/**
 * Cleanup function for graceful shutdown (no-op for CloudConvert)
 */
export async function cleanup(): Promise<void> {
  // CloudConvert service cleanup if needed
  console.log('Email PDF service cleaned up');
}