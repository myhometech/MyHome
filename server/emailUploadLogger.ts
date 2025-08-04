/**
 * TICKET 6: Email Upload Logging and Monitoring
 * 
 * Comprehensive logging service for email upload events and errors.
 * Provides structured, queryable logs for observability and troubleshooting.
 */

interface EmailUploadSuccessLog {
  eventType: 'email_upload_success';
  timestamp: string;
  userId: string;
  documentId: number;
  fileName: string;
  sender: string;
  recipient: string;
  subject: string;
  fileSize: number;
  storageKey: string;
  mimeType: string;
  processingTimeMs: number;
  requestId?: string;
}

interface EmailUploadErrorLog {
  eventType: 'email_upload_error';
  timestamp: string;
  errorType: 'validation' | 'authentication' | 'user_not_found' | 'storage' | 'processing' | 'system';
  errorCode: string;
  errorMessage: string;
  sender: string;
  recipient: string;
  subject: string;
  fileName?: string;
  userId?: string;
  documentId?: number;
  requestId?: string;
  stackTrace?: string;
}

interface EmailWebhookLog {
  eventType: 'email_webhook_received';
  timestamp: string;
  recipient: string;
  sender: string;
  subject: string;
  attachmentCount: number;
  totalSize: number;
  userAgent: string;
  requestId?: string;
}

interface EmailProcessingSummaryLog {
  eventType: 'email_processing_summary';
  timestamp: string;
  userId: string;
  sender: string;
  recipient: string;
  subject: string;
  totalAttachments: number;
  successfulDocuments: number;
  failedDocuments: number;
  totalProcessingTimeMs: number;
  requestId?: string;
}

export class EmailUploadLogger {
  private static generateRequestId(): string {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log successful email document creation
   */
  static logSuccess(data: {
    userId: string;
    documentId: number;
    fileName: string;
    sender: string;
    recipient: string;
    subject: string;
    fileSize: number;
    storageKey: string;
    mimeType: string;
    processingTimeMs: number;
    requestId?: string;
  }): void {
    const logEntry: EmailUploadSuccessLog = {
      eventType: 'email_upload_success',
      timestamp: new Date().toISOString(),
      ...data
    };

    // Structured console log for observability tools
    console.log('📧✅ EMAIL_UPLOAD_SUCCESS', JSON.stringify(logEntry));
    
    // Human-readable log for development
    console.log(`✅ Email document created: Document ${data.documentId} from ${data.sender} (${data.fileName}, ${data.fileSize} bytes)`);
  }

  /**
   * Log email upload errors with detailed context
   */
  static logError(data: {
    errorType: 'validation' | 'authentication' | 'user_not_found' | 'storage' | 'processing' | 'system';
    errorCode: string;
    errorMessage: string;
    sender: string;
    recipient: string;
    subject: string;
    fileName?: string;
    userId?: string;
    documentId?: number;
    requestId?: string;
    error?: Error;
  }): void {
    const logEntry: EmailUploadErrorLog = {
      eventType: 'email_upload_error',
      timestamp: new Date().toISOString(),
      stackTrace: data.error?.stack,
      ...data
    };

    // Structured console log for observability tools
    console.error('📧❌ EMAIL_UPLOAD_ERROR', JSON.stringify(logEntry));
    
    // Human-readable log for development
    console.error(`❌ Email upload failed [${data.errorType}:${data.errorCode}]: ${data.errorMessage} (from ${data.sender}, file: ${data.fileName || 'unknown'})`);
  }

  /**
   * Log incoming webhook reception
   */
  static logWebhookReceived(data: {
    recipient: string;
    sender: string;
    subject: string;
    attachmentCount: number;
    totalSize: number;
    userAgent: string;
    requestId?: string;
  }): string {
    const requestId = data.requestId || this.generateRequestId();
    
    const logEntry: EmailWebhookLog = {
      eventType: 'email_webhook_received',
      timestamp: new Date().toISOString(),
      requestId,
      ...data
    };

    // Structured console log for observability tools
    console.log('📧📨 EMAIL_WEBHOOK_RECEIVED', JSON.stringify(logEntry));
    
    // Human-readable log for development
    console.log(`📨 Email webhook: ${data.sender} → ${data.recipient} (${data.attachmentCount} attachments, ${data.totalSize} bytes) [${requestId}]`);
    
    return requestId;
  }

  /**
   * Log processing summary for an email
   */
  static logProcessingSummary(data: {
    userId: string;
    sender: string;
    recipient: string;
    subject: string;
    totalAttachments: number;
    successfulDocuments: number;
    failedDocuments: number;
    totalProcessingTimeMs: number;
    requestId?: string;
  }): void {
    const logEntry: EmailProcessingSummaryLog = {
      eventType: 'email_processing_summary',
      timestamp: new Date().toISOString(),
      ...data
    };

    // Structured console log for observability tools
    console.log('📧📊 EMAIL_PROCESSING_SUMMARY', JSON.stringify(logEntry));
    
    // Human-readable log for development
    const status = data.failedDocuments > 0 ? 'PARTIAL' : 'SUCCESS';
    console.log(`📊 Email processing ${status}: ${data.successfulDocuments}/${data.totalAttachments} documents created for ${data.userId} from ${data.sender} (${data.totalProcessingTimeMs}ms)`);
  }

  /**
   * Log signature verification issues
   */
  static logSignatureError(data: {
    sender: string;
    recipient: string;
    timestamp: string;
    token: string;
    signatureLength: number;
    requestId?: string;
  }): void {
    this.logError({
      errorType: 'authentication',
      errorCode: 'INVALID_SIGNATURE',
      errorMessage: 'Mailgun signature verification failed - potential tampering detected',
      sender: data.sender,
      recipient: data.recipient,
      subject: 'Unknown (signature failed)',
      requestId: data.requestId
    });
  }

  /**
   * Log user extraction/validation errors
   */
  static logUserError(data: {
    errorCode: 'USER_EXTRACTION_FAILED' | 'USER_NOT_FOUND' | 'USER_LOOKUP_ERROR';
    recipient: string;
    sender: string;
    subject: string;
    userId?: string;
    errorMessage: string;
    requestId?: string;
    error?: Error;
  }): void {
    this.logError({
      errorType: 'user_not_found',
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
      sender: data.sender,
      recipient: data.recipient,
      subject: data.subject,
      userId: data.userId,
      requestId: data.requestId,
      error: data.error
    });
  }

  /**
   * Log attachment validation errors
   */
  static logAttachmentError(data: {
    sender: string;
    recipient: string;
    subject: string;
    attachmentCount: number;
    validCount: number;
    invalidAttachments: string[];
    requestId?: string;
  }): void {
    this.logError({
      errorType: 'validation',
      errorCode: 'NO_VALID_ATTACHMENTS',
      errorMessage: `No valid attachments found: ${data.invalidAttachments.join(', ')}`,
      sender: data.sender,
      recipient: data.recipient,
      subject: data.subject,
      requestId: data.requestId
    });
  }

  /**
   * Log storage-related errors
   */
  static logStorageError(data: {
    userId: string;
    fileName: string;
    sender: string;
    recipient: string;
    subject: string;
    documentId?: number;
    storageKey?: string;
    errorMessage: string;
    requestId?: string;
    error?: Error;
  }): void {
    this.logError({
      errorType: 'storage',
      errorCode: 'STORAGE_OPERATION_FAILED',
      errorMessage: data.errorMessage,
      sender: data.sender,
      recipient: data.recipient,
      subject: data.subject,
      fileName: data.fileName,
      userId: data.userId,
      documentId: data.documentId,
      requestId: data.requestId,
      error: data.error
    });
  }

  /**
   * Log document processing errors
   */
  static logProcessingError(data: {
    userId: string;
    fileName: string;
    sender: string;
    recipient: string;
    subject: string;
    documentId?: number;
    errorMessage: string;
    requestId?: string;
    error?: Error;
  }): void {
    this.logError({
      errorType: 'processing',
      errorCode: 'DOCUMENT_PROCESSING_FAILED',
      errorMessage: data.errorMessage,
      sender: data.sender,
      recipient: data.recipient,
      subject: data.subject,
      fileName: data.fileName,
      userId: data.userId,
      documentId: data.documentId,
      requestId: data.requestId,
      error: data.error
    });
  }

  /**
   * Search logs by criteria (for debugging and monitoring)
   */
  static searchTips(): string {
    return `
📋 Email Upload Log Search Tips:

1. Search by sender: grep "EMAIL_UPLOAD" logs | grep "sender.*example@domain.com"
2. Search by document ID: grep "documentId.*123" logs  
3. Search by user ID: grep "userId.*user-id-here" logs
4. Search by error type: grep "EMAIL_UPLOAD_ERROR.*validation" logs
5. Search by request ID: grep "email_1234567890_abc123def" logs
6. Get processing summary: grep "EMAIL_PROCESSING_SUMMARY" logs
7. Find webhook activity: grep "EMAIL_WEBHOOK_RECEIVED" logs

JSON logs can be piped to jq for advanced filtering:
grep "EMAIL_UPLOAD_SUCCESS" logs | jq '.fileName'
    `;
  }
}