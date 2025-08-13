import { Buffer } from 'buffer';

// CloudConvert types for conditional import
interface CloudConvertError extends Error {
  code?: string;
  message: string;
}

// Attachment data interface from email webhook
export interface AttachmentData {
  filename: string;
  contentType: string;
  content: string; // Base64 encoded
  size?: number;
}

// Classification result types
export type AttachmentClassification = 
  | { type: 'pdf'; action: 'store_only' }
  | { type: 'office'; action: 'convert_to_pdf'; engine: 'libreoffice' }
  | { type: 'image'; action: 'convert_to_pdf'; engine: 'imagemagick' }
  | { type: 'unsupported'; action: 'store_only'; reason: 'unsupported_format' }
  | { type: 'too_large'; action: 'store_only'; reason: 'exceeds_10mb_limit' };

export type ConversionStatus = 
  | 'not_applicable'
  | 'pending' 
  | 'completed'
  | 'skipped_unsupported'
  | 'skipped_too_large' 
  | 'skipped_password_protected'
  | 'failed';

// Results of processing an attachment
export interface AttachmentProcessingResult {
  originalDocument: {
    documentId: number;
    filename: string;
    gcsPath: string;
    fileSize: number;
    mimeType: string;
    conversionStatus: ConversionStatus;
  };
  convertedDocument?: {
    documentId: number;
    filename: string;
    gcsPath: string;
    fileSize: number;
    mimeType: string;
    sourceDocumentId: number;
    originalMimeType: string;
    conversionJobId?: string;
    conversionMetadata?: any;
  };
  success: boolean;
  error?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export class AttachmentClassificationService {
  
  /**
   * TICKET 3: Classify attachment by MIME type and size
   */
  classifyAttachment(attachment: AttachmentData): AttachmentClassification {
    const { contentType, size = 0 } = attachment;
    
    // Enforce 10MB cap per file
    if (size > MAX_FILE_SIZE) {
      return { type: 'too_large', action: 'store_only', reason: 'exceeds_10mb_limit' };
    }
    
    // PDF → store only (no conversion)
    if (contentType === 'application/pdf') {
      return { type: 'pdf', action: 'store_only' };
    }
    
    // Office documents → send to CloudConvert with LibreOffice
    if (this.isOfficeDocument(contentType)) {
      return { type: 'office', action: 'convert_to_pdf', engine: 'libreoffice' };
    }
    
    // Images → send to CloudConvert with ImageMagick
    if (this.isImageDocument(contentType)) {
      return { type: 'image', action: 'convert_to_pdf', engine: 'imagemagick' };
    }
    
    // Unsupported → store only, mark conversion=skipped_unsupported
    return { type: 'unsupported', action: 'store_only', reason: 'unsupported_format' };
  }
  
  /**
   * TICKET 3: Check if MIME type is a supported Office document
   */
  private isOfficeDocument(mimeType: string): boolean {
    const officeMimeTypes = [
      // Modern Office formats (OOXML)
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      
      // Legacy Office formats
      'application/msword', // .doc
      'application/vnd.ms-excel', // .xls
      'application/vnd.ms-powerpoint', // .ppt
      
      // Other supported formats
      'application/vnd.oasis.opendocument.text', // .odt
      'application/vnd.oasis.opendocument.spreadsheet', // .ods
      'application/vnd.oasis.opendocument.presentation', // .odp
      'text/rtf', // .rtf
    ];
    
    return officeMimeTypes.includes(mimeType);
  }
  
  /**
   * TICKET 3: Check if MIME type is a supported image format
   */
  private isImageDocument(mimeType: string): boolean {
    const imageMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/tiff',
      'image/bmp',
      'image/gif',
      'image/heic', // Apple format
      'image/heif', // Apple format
    ];
    
    return imageMimeTypes.includes(mimeType);
  }
  
  /**
   * TICKET 3: Convert attachment classification to conversion status
   */
  getConversionStatus(classification: AttachmentClassification): ConversionStatus {
    switch (classification.action) {
      case 'store_only':
        if (classification.type === 'pdf') {
          return 'not_applicable';
        } else if (classification.type === 'too_large') {
          return 'skipped_too_large';
        } else if (classification.type === 'unsupported') {
          return 'skipped_unsupported';
        }
        return 'not_applicable';
      case 'convert_to_pdf':
        return 'pending';
      default:
        return 'not_applicable';
    }
  }

  /**
   * TICKET 3: Determine processing route for an attachment
   */
  determineProcessingRoute(attachment: AttachmentData): {
    action: 'store_only' | 'convert_to_pdf';
    reason: string;
    conversionStatus?: ConversionStatus;
  } {
    const classification = this.classifyAttachment(attachment);
    const conversionStatus = this.getConversionStatus(classification);
    
    switch (classification.action) {
      case 'store_only':
        if (classification.type === 'pdf') {
          return {
            action: 'store_only',
            reason: 'PDF file, no conversion needed',
            conversionStatus
          };
        } else if (classification.type === 'too_large') {
          return {
            action: 'store_only',
            reason: `File exceeds 10MB limit (${Math.round((attachment.size || 0) / 1024 / 1024)}MB)`,
            conversionStatus
          };
        } else if (classification.type === 'unsupported') {
          return {
            action: 'store_only',
            reason: `Unsupported file type: ${attachment.contentType}`,
            conversionStatus
          };
        }
        return {
          action: 'store_only',
          reason: 'No conversion required',
          conversionStatus
        };
      
      case 'convert_to_pdf':
        return {
          action: 'convert_to_pdf',
          reason: `Convert ${classification.type} document to PDF using ${classification.engine}`,
          conversionStatus
        };
      
      default:
        return {
          action: 'store_only',
          reason: 'Unknown classification',
          conversionStatus: 'not_applicable'
        };
    }
  }
  
  /**
   * TICKET 3: Convert non-PDF attachment to PDF using CloudConvert
   */
  async convertAttachmentToPdf(
    attachment: AttachmentData, 
    classification: AttachmentClassification
  ): Promise<{
    success: boolean;
    pdfBuffer?: Buffer;
    filename?: string;
    jobId?: string;
    metadata?: any;
    error?: string;
  }> {
    if (classification.action !== 'convert_to_pdf') {
      return { success: false, error: 'Attachment does not require conversion' };
    }
    
    // Check if CloudConvert API key is available
    if (!process.env.CLOUDCONVERT_API_KEY) {
      console.warn(`⚠️ CloudConvert API key not configured, cannot convert ${attachment.filename}`);
      return { 
        success: false, 
        error: 'CloudConvert API key not configured',
        metadata: { reason: 'api_key_missing' }
      };
    }
    
    try {
      // Decode base64 content
      const fileBuffer = Buffer.from(attachment.content, 'base64');
      
      // Prepare CloudConvert input
      const convertInput = {
        kind: 'file' as const,
        filename: attachment.filename,
        mime: attachment.contentType,
        buffer: fileBuffer
      };
      
      console.log(`🔄 Converting ${attachment.filename} (${attachment.contentType}) to PDF using ${classification.engine}`);
      
      // Dynamically import CloudConvert service
      const { cloudConvertService } = await import('./cloudConvertService.js');
      
      // Convert using CloudConvert
      const startTime = Date.now();
      const result = await cloudConvertService.convertToPdf([convertInput]);
      const duration = Date.now() - startTime;
      
      if (result.files.length === 0) {
        return { success: false, error: 'No PDF files generated by CloudConvert' };
      }
      
      const pdfFile = result.files[0];
      const pdfFilename = attachment.filename.replace(/\.[^.]+$/, '.pdf');
      
      console.log(`✅ Successfully converted ${attachment.filename} to PDF (${pdfFile.pdfBuffer.length} bytes) in ${duration}ms`);
      
      return {
        success: true,
        pdfBuffer: pdfFile.pdfBuffer,
        filename: pdfFilename,
        jobId: result.jobId,
        metadata: {
          engine: classification.engine,
          duration,
          originalFileSize: fileBuffer.length,
          convertedFileSize: pdfFile.pdfBuffer.length,
          ...pdfFile.meta
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to convert ${attachment.filename} to PDF:`, error);
      
      // Check for password-protected documents
      if ((error as any).code === 'CLOUDCONVERT_ERROR' && 
          (error.message.includes('password') || error.message.includes('encrypted'))) {
        return { 
          success: false, 
          error: 'Document is password-protected',
          metadata: { reason: 'password_protected' }
        };
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown conversion error' 
      };
    }
  }
  
  /**
   * TICKET 3: Get display name for conversion status
   */
  getConversionStatusDisplayName(status: ConversionStatus): string {
    switch (status) {
      case 'not_applicable': return 'No conversion needed';
      case 'pending': return 'Conversion pending';
      case 'completed': return 'Converted to PDF';
      case 'skipped_unsupported': return 'Unsupported format';
      case 'skipped_too_large': return 'File too large';
      case 'skipped_password_protected': return 'Password protected';
      case 'failed': return 'Conversion failed';
      default: return 'Unknown status';
    }
  }
  
  /**
   * TICKET 3: Check if a document should have a PDF conversion
   */
  shouldConvertToPdf(mimeType: string, fileSize: number): boolean {
    // Don't convert PDFs
    if (mimeType === 'application/pdf') {
      return false;
    }
    
    // Don't convert files over 10MB
    if (fileSize > MAX_FILE_SIZE) {
      return false;
    }
    
    // Convert supported Office and image formats
    return this.isOfficeDocument(mimeType) || this.isImageDocument(mimeType);
  }
}

// Create singleton instance
export const attachmentClassificationService = new AttachmentClassificationService();