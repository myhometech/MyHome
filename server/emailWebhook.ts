import { Request, Response, NextFunction } from 'express';
import { emailService } from './emailService';
import { storage } from './storage';
import multer from 'multer';

// Configure multer for parsing webhook data
const upload = multer();

/**
 * SendGrid Inbound Parse Webhook Handler
 * This endpoint receives emails forwarded via SendGrid's Inbound Parse service
 */
export async function handleSendGridWebhook(req: Request, res: Response) {
  try {
    console.log('Received SendGrid webhook:', req.body);
    
    // Extract email data from SendGrid webhook format
    const {
      from,
      subject,
      text,
      html,
      to,
      attachments
    } = req.body;

    // Parse the "to" address to find the user
    const userId = await emailService.parseUserFromEmail(to);
    if (!userId) {
      console.log('No user found for email address:', to);
      return res.status(200).json({ message: 'Email processed but no user found' });
    }

    // Process attachments if present
    const processedAttachments = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        processedAttachments.push({
          filename: file.originalname,
          content: file.buffer,
          contentType: file.mimetype
        });
      }
    }

    // Create email data object
    const emailData = {
      from,
      subject: subject || 'Forwarded Document',
      html,
      text,
      attachments: processedAttachments
    };

    // Get user email for processing
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(200).json({ message: 'User not found' });
    }

    // Process the email
    const result = await emailService.processIncomingEmail(emailData, user.email);
    
    console.log('Email processing result:', result);
    
    res.status(200).json({
      message: 'Email processed successfully',
      documentsCreated: result.documentsCreated
    });

  } catch (error) {
    console.error('Error processing SendGrid webhook:', error);
    res.status(500).json({ 
      message: 'Error processing email',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Mailgun Webhook Handler
 * Alternative webhook for Mailgun service
 */
export async function handleMailgunWebhook(req: Request, res: Response) {
  try {
    console.log('Received Mailgun webhook:', req.body);
    
    const {
      sender: from,
      subject,
      'body-plain': text,
      'body-html': html,
      recipient: to
    } = req.body;

    const userId = await emailService.parseUserFromEmail(to);
    if (!userId) {
      return res.status(200).json({ message: 'No user found for email' });
    }

    // Process attachments
    const processedAttachments = [];
    const attachmentCount = parseInt(req.body['attachment-count'] || '0');
    
    for (let i = 1; i <= attachmentCount; i++) {
      const attachmentKey = `attachment-${i}`;
      if (req.files && typeof req.files === 'object' && attachmentKey in req.files) {
        const files = req.files[attachmentKey];
        const file = Array.isArray(files) ? files[0] : files;
        if (file && 'buffer' in file) {
          processedAttachments.push({
            filename: file.originalname || `attachment-${i}`,
            content: file.buffer,
            contentType: file.mimetype || 'application/octet-stream'
          });
        }
      }
    }

    const emailData = {
      from,
      subject: subject || 'Forwarded Document',
      html,
      text,
      attachments: processedAttachments
    };

    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(200).json({ message: 'User not found' });
    }

    const result = await emailService.processIncomingEmail(emailData, user.email);
    
    res.status(200).json({
      message: 'Email processed successfully',
      documentsCreated: result.documentsCreated
    });

  } catch (error) {
    console.error('Error processing Mailgun webhook:', error);
    res.status(500).json({ 
      message: 'Error processing email',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Test endpoint for simulating email receipt
 * Useful for development and testing
 */
export async function handleTestEmail(req: Request, res: Response) {
  try {
    const { userEmail, emailContent, attachments } = req.body;
    
    if (!userEmail || !emailContent) {
      return res.status(400).json({ 
        message: 'Missing required fields: userEmail, emailContent' 
      });
    }

    const emailData = {
      from: 'test@example.com',
      subject: emailContent.subject || 'Test Email Forward',
      html: emailContent.html,
      text: emailContent.text,
      attachments: attachments || []
    };

    const result = await emailService.processIncomingEmail(emailData, userEmail);
    
    res.json({
      message: 'Test email processed successfully',
      result
    });

  } catch (error) {
    console.error('Error processing test email:', error);
    res.status(500).json({ 
      message: 'Error processing test email',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Middleware for validating webhook signatures
export function validateWebhookSignature(req: Request, res: Response, next: NextFunction) {
  // Add signature validation logic here based on your email service
  // For now, we'll skip validation in development
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  
  // TODO: Implement proper signature validation
  next();
}