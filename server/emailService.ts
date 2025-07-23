import nodemailer from 'nodemailer';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import htmlPdf from 'html-pdf-node';
import { storage } from './storage';
import type { InsertEmailForward, InsertDocument, InsertUserForwardingMapping } from '@shared/schema';

// Email configuration for receiving forwarded emails
export class EmailService {
  private transporter: nodemailer.Transporter;
  private forwardingAddress: string;

  constructor() {
    // For development, we'll use a webhook approach
    // In production, this would connect to an actual IMAP server
    this.forwardingAddress = process.env.EMAIL_FORWARD_ADDRESS || 'documents@homedocs.local';
    
    // Initialize transporter for sending confirmation emails
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Process an incoming email (would be called by webhook or IMAP listener)
   */
  async processIncomingEmail(emailData: {
    from: string;
    subject: string;
    html?: string;
    text?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  }, userEmail: string): Promise<{ success: boolean; documentsCreated: number; error?: string }> {
    try {
      // Find user by email
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        throw new Error(`User not found for email: ${userEmail}`);
      }

      // Create email forward record
      const emailForward: InsertEmailForward = {
        userId: user.id,
        fromEmail: emailData.from,
        subject: emailData.subject,
        emailBody: emailData.html || emailData.text || '',
        hasAttachments: !!(emailData.attachments && emailData.attachments.length > 0),
        attachmentCount: emailData.attachments?.length || 0,
        documentsCreated: 0,
        status: 'pending',
      };

      const forwardRecord = await storage.createEmailForward(emailForward);
      let documentsCreated = 0;

      try {
        // Process attachments first
        if (emailData.attachments && emailData.attachments.length > 0) {
          for (const attachment of emailData.attachments) {
            const document = await this.saveAttachmentAsDocument(
              attachment,
              user.id,
              emailData.subject,
              emailData.from
            );
            if (document) {
              documentsCreated++;
            }
          }
        }

        // If no attachments or we also want the email content, create PDF from email
        if (!emailData.attachments || emailData.attachments.length === 0 || 
            (emailData.html || emailData.text)) {
          const emailDocument = await this.createEmailPDF(
            emailData,
            user.id,
            emailData.from
          );
          if (emailDocument) {
            documentsCreated++;
          }
        }

        // Update email forward record with success
        await storage.updateEmailForward(forwardRecord.id, {
          status: 'processed',
          documentsCreated,
        });

        // Send confirmation email
        await this.sendConfirmationEmail(userEmail, emailData.subject, documentsCreated);

        return { success: true, documentsCreated };

      } catch (processingError: any) {
        // Update email forward record with error
        await storage.updateEmailForward(forwardRecord.id, {
          status: 'failed',
          errorMessage: processingError.message,
        });
        throw processingError;
      }

    } catch (error: any) {
      console.error('Email processing error:', error);
      return { success: false, documentsCreated: 0, error: error.message };
    }
  }

  /**
   * Save email attachment as document
   */
  private async saveAttachmentAsDocument(
    attachment: { filename: string; content: Buffer; contentType: string },
    userId: string,
    emailSubject: string,
    fromEmail: string
  ): Promise<boolean> {
    try {
      // Ensure uploads directory exists
      const uploadsDir = join(process.cwd(), 'uploads');
      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
      }

      // Generate unique filename
      const fileExtension = attachment.filename.split('.').pop() || '';
      const uniqueFileName = `${nanoid()}.${fileExtension}`;
      const filePath = join(uploadsDir, uniqueFileName);

      // Save file
      writeFileSync(filePath, attachment.content);

      // Determine category based on filename and content type
      const categoryId = await this.getCategoryForFile(attachment.filename, attachment.contentType, userId);

      // Create document record
      const documentData: InsertDocument = {
        userId,
        categoryId,
        name: `${attachment.filename} (from ${fromEmail})`,
        fileName: attachment.filename,
        filePath,
        fileSize: attachment.content.length,
        mimeType: attachment.contentType,
        tags: ['email-attachment', 'forwarded'],
        extractedText: `Email Subject: ${emailSubject}\nFrom: ${fromEmail}`,
        ocrProcessed: false,
      };

      await storage.createDocument(documentData);
      return true;

    } catch (error) {
      console.error('Error saving attachment:', error);
      return false;
    }
  }

  /**
   * Create PDF from email content
   */
  private async createEmailPDF(
    emailData: { from: string; subject: string; html?: string; text?: string },
    userId: string,
    fromEmail: string
  ): Promise<boolean> {
    try {
      // Prepare HTML content for PDF
      const htmlContent = emailData.html || `<pre>${emailData.text || 'No content'}</pre>`;
      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${emailData.subject}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
            .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .email-meta { background: #f5f5f5; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
            .content { margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Email Document</h1>
          </div>
          <div class="email-meta">
            <p><strong>From:</strong> ${emailData.from}</p>
            <p><strong>Subject:</strong> ${emailData.subject}</p>
            <p><strong>Processed:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <div class="content">
            ${htmlContent}
          </div>
        </body>
        </html>
      `;

      // Ensure uploads directory exists
      const uploadsDir = join(process.cwd(), 'uploads');
      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
      }

      // Determine category (default to 'Other' or create 'Email' category)  
      const categoryId = await this.getCategoryForFile('email.pdf', 'application/pdf', userId);

      // Generate PDF with fallback handling
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await htmlPdf.generatePdf({ content: fullHtml }, { 
          format: 'A4',
          printBackground: true 
        });
      } catch (pdfError: any) {
        console.warn('PDF generation failed, creating text fallback:', pdfError.message);
        // Fallback: create a simple text representation instead of PDF
        const textContent = `Email Document\n\nFrom: ${emailData.from}\nSubject: ${emailData.subject}\nProcessed: ${new Date().toLocaleString()}\n\nContent:\n${emailData.text || 'HTML email content (PDF generation unavailable)'}`;
        pdfBuffer = Buffer.from(textContent, 'utf8');
        
        // Update filename to reflect text format
        const fileName = `email-${nanoid()}.txt`;
        const filePath = join(uploadsDir, fileName);
        writeFileSync(filePath, pdfBuffer);

        // Create document record for text file
        const documentData: InsertDocument = {
          userId,
          categoryId,
          name: `Email: ${emailData.subject} (Text)`,
          fileName,
          filePath,
          fileSize: pdfBuffer.length,
          mimeType: 'text/plain',
          tags: ['email-content', 'forwarded', 'text-fallback'],
          extractedText: textContent,
          ocrProcessed: true,
        };

        await storage.createDocument(documentData);
        return true;
      }

      // Save PDF file
      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
      }

      const fileName = `email-${nanoid()}.pdf`;
      const filePath = join(uploadsDir, fileName);
      writeFileSync(filePath, pdfBuffer);

      // Create document record
      const documentData: InsertDocument = {
        userId,
        categoryId,
        name: `Email: ${emailData.subject}`,
        fileName,
        filePath,
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
        tags: ['email-content', 'forwarded'],
        extractedText: `Subject: ${emailData.subject}\nFrom: ${emailData.from}\n\nContent: ${emailData.text || 'HTML email content'}`,
        ocrProcessed: true,
      };

      await storage.createDocument(documentData);
      return true;

    } catch (error) {
      console.error('Error creating email PDF:', error);
      return false;
    }
  }

  /**
   * Determine appropriate category for file
   */
  private async getCategoryForFile(filename: string, mimeType: string, userId?: string): Promise<number | null> {
    try {
      // If userId is provided, get user's categories, otherwise return null (default)
      if (!userId) return null;
      
      const categories = await storage.getCategories(userId);
      const lowerFilename = filename.toLowerCase();
      const lowerMimeType = mimeType.toLowerCase();

      // Basic categorization logic
      if (lowerFilename.includes('insurance') || lowerFilename.includes('policy')) {
        return categories.find(c => c.name.toLowerCase() === 'insurance')?.id || null;
      }
      if (lowerFilename.includes('tax') || lowerFilename.includes('irs')) {
        return categories.find(c => c.name.toLowerCase() === 'taxes')?.id || null;
      }
      if (lowerFilename.includes('utility') || lowerFilename.includes('bill') || lowerFilename.includes('electric')) {
        return categories.find(c => c.name.toLowerCase() === 'utilities')?.id || null;
      }
      if (lowerFilename.includes('receipt') || lowerFilename.includes('invoice')) {
        return categories.find(c => c.name.toLowerCase() === 'receipts')?.id || null;
      }
      if (lowerFilename.includes('warranty') || lowerFilename.includes('guarantee')) {
        return categories.find(c => c.name.toLowerCase() === 'warranty')?.id || null;
      }
      if (lowerFilename.includes('legal') || lowerFilename.includes('contract')) {
        return categories.find(c => c.name.toLowerCase() === 'legal')?.id || null;
      }
      if (lowerFilename.includes('maintenance') || lowerFilename.includes('repair')) {
        return categories.find(c => c.name.toLowerCase() === 'maintenance')?.id || null;
      }

      // Default to 'Other' category
      return categories.find(c => c.name.toLowerCase() === 'other')?.id || null;

    } catch (error) {
      console.error('Error determining category:', error);
      return null;
    }
  }

  /**
   * Send confirmation email to user
   */
  private async sendConfirmationEmail(
    userEmail: string,
    originalSubject: string,
    documentsCreated: number
  ): Promise<void> {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@homedocs.local',
        to: userEmail,
        subject: 'HomeDocs: Email Processed Successfully',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Email Successfully Processed</h2>
            <p>Your forwarded email has been successfully processed and added to your HomeDocs library.</p>
            
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Original Subject:</strong> ${originalSubject}</p>
              <p><strong>Documents Created:</strong> ${documentsCreated}</p>
              <p><strong>Processed At:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <p>You can now view and manage these documents in your HomeDocs dashboard.</p>
            
            <p style="color: #6b7280; font-size: 14px;">
              To forward more documents, simply send them to your personal forwarding address.
            </p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      // Don't throw - confirmation email failure shouldn't break the main process
    }
  }

  /**
   * Get or create unique forwarding address for user
   */
  async getForwardingAddress(userId: string): Promise<{
    address: string;
    instructions: string;
  }> {
    try {
      // Check if user already has a forwarding mapping
      let mapping = await storage.getUserForwardingMapping(userId);
      
      if (!mapping) {
        // Create new mapping with unique hash
        const emailHash = this.generateUniqueEmailHash(userId);
        const forwardingAddress = `docs-${emailHash}@${this.getEmailDomain()}`;
        
        const mappingData: InsertUserForwardingMapping = {
          userId,
          emailHash,
          forwardingAddress,
        };
        
        mapping = await storage.createUserForwardingMapping(mappingData);
      }

      return {
        address: mapping.forwardingAddress,
        instructions: `
📧 Your Personal Document Import Email:
${mapping.forwardingAddress}

✅ Supported Attachments: PDF, JPG, PNG, WEBP (up to 10MB each)

🔄 How It Works:
1. Forward emails with documents to this address
2. Attachments automatically saved and organized
3. Email content converted to searchable PDF
4. Documents processed with OCR and smart categorization

📱 Perfect for: Bills, receipts, contracts, insurance docs, photos of documents

🔐 Security: This address is unique to your account - keep it private!
        `.trim(),
      };
    } catch (error) {
      console.error('Error getting forwarding address:', error);
      throw new Error('Failed to generate forwarding address');
    }
  }

  /**
   * Get a user-specific forwarding email address where they can send documents (legacy)
   */
  async getUserForwardingAddress(userId: string): Promise<string> {
    const result = await this.getForwardingAddress(userId);
    return result.address;
  }

  /**
   * Generate unique email hash for user that's collision-resistant
   */
  private generateUniqueEmailHash(userId: string): string {
    const crypto = require('crypto');
    // Create a hash using user ID, current timestamp, and random salt
    const salt = Date.now().toString();
    const hash = crypto.createHash('sha256').update(userId + salt).digest('hex');
    // Take first 12 characters for better uniqueness while keeping email readable
    return hash.substring(0, 12).toLowerCase();
  }

  /**
   * Get email domain (configurable via environment)
   */
  private getEmailDomain(): string {
    return process.env.EMAIL_DOMAIN || 'homedocs.example.com';
  }

  /**
   * Parse incoming email address to extract user ID
   */
  async parseUserFromEmail(toAddress: string): Promise<string | null> {
    const domain = this.getEmailDomain();
    const match = toAddress.match(new RegExp(`^docs-([a-z0-9]{12})@${domain.replace('.', '\\.')}$`));
    if (!match) return null;
    
    try {
      const userHash = match[1];
      return await this.reverseUserHash(userHash);
    } catch {
      return null;
    }
  }

  /**
   * Reverse lookup user hash to user ID using the database
   */
  private async reverseUserHash(hash: string): Promise<string | null> {
    try {
      const user = await storage.getUserByForwardingHash(hash);
      return user?.id || null;
    } catch (error) {
      console.error('Error reversing user hash:', error);
      return null;
    }
  }

  /**
   * Get the forwarding email address for this user (legacy method - returns simple string)
   */
  getForwardingAddressLegacy(): string {
    return this.forwardingAddress;
  }

  /**
   * Test email processing (for development)
   */
  async testEmailProcessing(userEmail: string): Promise<any> {
    const testEmailData = {
      from: 'test@example.com',
      subject: 'Test Document Forward',
      html: '<h1>Test Email</h1><p>This is a test email to verify the document forwarding system is working.</p>',
      text: 'Test Email\n\nThis is a test email to verify the document forwarding system is working.',
    };

    return await this.processIncomingEmail(testEmailData, userEmail);
  }
}

export const emailService = new EmailService();