/**
 * Email Body → PDF Service
 * Converts email bodies (HTML/plain text) to PDF documents for MyHome
 */

import puppeteer from 'puppeteer';
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import { Storage } from '@google-cloud/storage';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import type { MailgunMessage } from './mailgunService';
import { storage } from './storage';
import type { InsertDocument } from '@shared/schema';

// Create DOMPurify instance for server-side HTML sanitization
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

interface EmailPdfOptions {
  pageSize?: 'A4' | 'Letter';
  margins?: string;
  includeHeader?: boolean;
  blockExternalImages?: boolean;
}

interface EmailBodyPdfResult {
  success: boolean;
  documentId?: number;
  gcsPath?: string;
  error?: string;
  fileSize?: number;
}

export class EmailBodyPdfService {
  private gcs: Storage;
  private bucketName: string;

  constructor() {
    // Initialize GCS (same as attachment processor)
    try {
      this.gcs = new Storage({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      });
      this.bucketName = process.env.GCS_BUCKET_NAME || 'myhome-documents';
      console.log('EmailBodyPdfService: GCS initialized');
    } catch (error) {
      console.error('EmailBodyPdfService: GCS initialization failed:', error);
      throw new Error('Failed to initialize Google Cloud Storage for email PDF service');
    }
  }

  /**
   * Generate SHA-256 hash of email body for deduplication
   */
  private generateBodyHash(bodyHtml?: string, bodyPlain?: string): string {
    // Normalize content for consistent hashing
    const normalizedHtml = bodyHtml?.trim().replace(/\s+/g, ' ') || '';
    const normalizedPlain = bodyPlain?.trim().replace(/\s+/g, ' ') || '';
    const content = normalizedHtml + '|' + normalizedPlain;
    
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Sanitize HTML content for safe PDF rendering
   */
  private sanitizeHtml(html: string): string {
    return purify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
        'div', 'span', 'a', 'img', 'blockquote', 'pre', 'code'
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style'],
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onclick', 'onload', 'onerror']
    });
  }

  /**
   * Generate HTML template for email PDF
   */
  private generateEmailHtml(emailData: {
    subject: string;
    bodyHtml?: string;
    bodyPlain: string;
    sender: string;
    receivedAt: string;
    messageId?: string;
  }): string {
    const { subject, bodyHtml, bodyPlain, sender, receivedAt, messageId } = emailData;
    
    // Format dates
    const utcDate = new Date(receivedAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const localDate = new Date(receivedAt).toLocaleString('en-GB', { 
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + ' BST';

    // Process email body
    let emailContent: string;
    if (bodyHtml && bodyHtml.trim()) {
      // Use HTML version with sanitization
      emailContent = this.sanitizeHtml(bodyHtml);
    } else {
      // Convert plain text to HTML
      emailContent = `<pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${bodyPlain}</pre>`;
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email: ${subject || 'No Subject'}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    .email-header {
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .email-header h1 {
      color: #2c3e50;
      margin: 0 0 10px 0;
      font-size: 24px;
    }
    .email-metadata {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .email-metadata p {
      margin: 5px 0;
      font-size: 14px;
    }
    .email-metadata strong {
      color: #495057;
    }
    .email-body {
      padding: 10px 0;
    }
    .email-body img {
      max-width: 100%;
      height: auto;
    }
    .email-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 10px 0;
    }
    .email-body td, .email-body th {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    .email-body th {
      background-color: #f2f2f2;
    }
    @media print {
      body { margin: 0; padding: 15px; }
    }
  </style>
</head>
<body>
  <header class="email-header">
    <h1>${subject || 'No Subject'}</h1>
  </header>
  
  <div class="email-metadata">
    <p><strong>From:</strong> ${sender}</p>
    <p><strong>Received:</strong> ${utcDate} | ${localDate}</p>
    ${messageId ? `<p><strong>Message ID:</strong> ${messageId}</p>` : ''}
    <p><strong>Generated:</strong> ${new Date().toISOString().substring(0, 19).replace('T', ' ')} UTC</p>
  </div>

  <main class="email-body">
    ${emailContent}
  </main>
</body>
</html>`;
  }

  /**
   * Render HTML to PDF using Puppeteer
   */
  private async renderHtmlToPdf(html: string, options: EmailPdfOptions = {}): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security', // For local development
        '--disable-features=VizDisplayCompositor'
      ]
    });

    try {
      const page = await browser.newPage();
      
      // Block external resources if requested
      if (options.blockExternalImages) {
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (request.resourceType() === 'image' && request.url().startsWith('http')) {
            request.abort();
          } else {
            request.continue();
          }
        });
      }

      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: options.pageSize || 'A4',
        margin: {
          top: options.margins || '1in',
          right: options.margins || '0.75in', 
          bottom: options.margins || '1in',
          left: options.margins || '0.75in'
        },
        printBackground: true,
        preferCSSPageSize: false,
      });

      return Buffer.from(pdfBuffer);

    } finally {
      await browser.close();
    }
  }

  /**
   * Check if email body PDF already exists
   */
  private async checkForDuplicate(userId: string, bodyHash: string, messageId?: string): Promise<number | null> {
    try {
      // First check by messageId if available
      if (messageId) {
        const existingByMessageId = await storage.db
          .select({ id: storage.schema.documents.id })
          .from(storage.schema.documents)
          .where(storage.eq(storage.schema.documents.userId, userId))
          .where(storage.eq(storage.schema.documents.messageId, messageId))
          .limit(1);
        
        if (existingByMessageId.length > 0) {
          return existingByMessageId[0].id;
        }
      }

      // Then check by body hash
      const existingByHash = await storage.db
        .select({ id: storage.schema.documents.id })
        .from(storage.schema.documents)
        .where(storage.eq(storage.schema.documents.userId, userId))
        .where(storage.eq(storage.schema.documents.bodyHash, bodyHash))
        .limit(1);

      return existingByHash.length > 0 ? existingByHash[0].id : null;

    } catch (error) {
      console.error('Error checking for duplicate email body PDF:', error);
      return null;
    }
  }

  /**
   * Upload PDF to Google Cloud Storage
   */
  private async uploadToGCS(pdfBuffer: Buffer, filename: string): Promise<{ gcsPath: string; publicUrl: string }> {
    const gcsPath = `email-pdfs/${filename}`;
    const file = this.gcs.bucket(this.bucketName).file(gcsPath);

    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
        cacheControl: 'public, max-age=3600',
      },
    });

    const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${gcsPath}`;
    
    return { gcsPath, publicUrl };
  }

  /**
   * Generate filename for email body PDF
   */
  private generateFilename(subject: string, receivedAt: string): string {
    // Clean subject for filename
    const cleanSubject = (subject || 'No Subject')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);
    
    // Format date
    const date = new Date(receivedAt).toISOString().substring(0, 10); // YYYY-MM-DD
    
    // Add unique suffix to prevent conflicts
    const uniqueId = nanoid(8);
    
    return `Email - ${cleanSubject} - ${date} - ${uniqueId}.pdf`;
  }

  /**
   * Create email body PDF document
   * Main public method for converting email bodies to PDFs
   */
  async createEmailBodyDocument(
    userId: string,
    emailData: MailgunMessage,
    linkedAttachmentIds: number[] = []
  ): Promise<EmailBodyPdfResult> {
    try {
      console.log(`📧→📄 Creating email body PDF for user ${userId}, subject: "${emailData.subject}"`);

      // Validate input
      if (!emailData.bodyPlain && !emailData.bodyHtml) {
        return {
          success: false,
          error: 'Email has no body content to convert to PDF'
        };
      }

      // Generate body hash for deduplication
      const bodyHash = this.generateBodyHash(emailData.bodyHtml, emailData.bodyPlain);
      
      // Check for existing document
      const existingDocId = await this.checkForDuplicate(userId, bodyHash, emailData.messageId);
      if (existingDocId) {
        console.log(`📧→📄 Email body PDF already exists: document ${existingDocId}`);
        return {
          success: true,
          documentId: existingDocId,
          error: 'Email body PDF already exists'
        };
      }

      // Generate HTML for PDF
      const emailHtml = this.generateEmailHtml({
        subject: emailData.subject,
        bodyHtml: emailData.bodyHtml,
        bodyPlain: emailData.bodyPlain,
        sender: emailData.sender,
        receivedAt: emailData.timestamp,
        messageId: emailData.messageId
      });

      // Render to PDF
      const pdfBuffer = await this.renderHtmlToPdf(emailHtml, {
        blockExternalImages: true // Security: block external image loading
      });

      // Check file size (10MB limit)
      if (pdfBuffer.length > 10 * 1024 * 1024) {
        return {
          success: false,
          error: `Generated PDF size (${Math.round(pdfBuffer.length / 1024 / 1024)}MB) exceeds 10MB limit`
        };
      }

      // Generate filename
      const filename = this.generateFilename(emailData.subject, emailData.timestamp);
      
      // Upload to GCS
      const { gcsPath } = await this.uploadToGCS(pdfBuffer, filename);

      // Create document record
      const documentData: Omit<InsertDocument, 'id'> = {
        userId,
        categoryId: null, // Default category
        name: `Email: ${emailData.subject || 'No Subject'}`,
        fileName: filename,
        filePath: gcsPath,
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
        tags: ['email', emailData.sender.split('@')[1] || 'email'], // Add sender domain as tag
        uploadSource: 'email',
        gcsPath,
        // Email-specific fields (when schema is updated)
        messageId: emailData.messageId,
        bodyHash,
        emailContext: JSON.stringify({
          sender: emailData.sender,
          subject: emailData.subject,
          receivedAt: emailData.timestamp,
          hasAttachments: linkedAttachmentIds.length > 0,
          attachmentCount: linkedAttachmentIds.length,
          bodyType: emailData.bodyHtml ? 'html' : 'plain'
        })
      };

      const document = await storage.createDocument(documentData);

      console.log(`📧→📄 Created email body PDF: document ${document.id}, file: ${filename}`);

      return {
        success: true,
        documentId: document.id,
        gcsPath,
        fileSize: pdfBuffer.length
      };

    } catch (error) {
      console.error('EmailBodyPdfService error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating email body PDF'
      };
    }
  }

  /**
   * Create email body PDF manually (for existing email-sourced documents)
   */
  async createManualEmailBodyPdf(
    documentId: number,
    userId: string
  ): Promise<EmailBodyPdfResult> {
    try {
      // Get the original email document
      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      if (document.uploadSource !== 'email') {
        return { success: false, error: 'Document is not from email source' };
      }

      // Extract email context
      const emailContext = document.emailContext ? JSON.parse(document.emailContext as string) : {};
      
      // Reconstruct email data (limited info available)
      const emailData: MailgunMessage = {
        subject: emailContext.subject || document.name.replace('Email: ', ''),
        bodyPlain: 'Original email body not available. PDF created from document metadata.',
        sender: emailContext.sender || 'unknown@example.com',
        recipient: `upload+${userId}@myhome-tech.com`,
        timestamp: emailContext.receivedAt || document.uploadedAt?.toISOString() || new Date().toISOString(),
        messageId: document.messageId || undefined,
        token: '',
        signature: '',
        attachments: []
      };

      return this.createEmailBodyDocument(userId, emailData);

    } catch (error) {
      console.error('Manual email body PDF creation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create manual email body PDF'
      };
    }
  }
}

export default EmailBodyPdfService;