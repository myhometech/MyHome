import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';

export interface ConversionResult {
  pdfPath: string;
  originalImagePath: string;
  success: boolean;
  error?: string;
}

export class PDFConversionService {
  /**
   * Convert multiple scanned images to a single multi-page PDF
   */
  async convertMultipleImagesToPDF(imagePaths: string[], outputDir: string, documentName: string = 'scanned-document'): Promise<ConversionResult> {
    try {
      console.log(`Converting ${imagePaths.length} scanned images to multi-page PDF using pdf-lib`);
      
      if (imagePaths.length === 0) {
        throw new Error('No image paths provided');
      }

      // Verify all files exist
      for (const imagePath of imagePaths) {
        if (!fs.existsSync(imagePath)) {
          throw new Error(`Image file not found: ${imagePath}`);
        }
      }

      // Generate PDF filename
      const timestamp = Date.now();
      const pdfFilename = `document-scan-${documentName}-${timestamp}.pdf`;
      const pdfPath = path.join(outputDir, pdfFilename);

      // Create multi-page PDF
      await this.generateMultiPagePDFFromImages(imagePaths, pdfPath, documentName);

      console.log(`Successfully converted ${imagePaths.length} images to multi-page PDF: ${pdfPath}`);
      
      return {
        pdfPath,
        originalImagePath: imagePaths[0], // Reference to first image
        success: true
      };

    } catch (error: any) {
      console.error('Multi-page PDF conversion failed:', error);
      return {
        pdfPath: '',
        originalImagePath: '',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert a scanned document image to PDF format using pdf-lib for better compatibility
   */
  async convertImageToPDF(imagePath: string, outputDir: string): Promise<ConversionResult> {
    try {
      console.log(`Converting scanned document to PDF using pdf-lib: ${imagePath}`);
      
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // Generate PDF filename
      const imageFilename = path.basename(imagePath, path.extname(imagePath));
      const pdfFilename = `${imageFilename}_document.pdf`;
      const pdfPath = path.join(outputDir, pdfFilename);

      // Use pdf-lib to create a robust PDF
      await this.generatePDFFromImage(imagePath, pdfPath, imageFilename);

      console.log(`Successfully converted image to PDF using pdf-lib: ${pdfPath}`);
      
      return {
        pdfPath,
        originalImagePath: imagePath,
        success: true
      };

    } catch (error: any) {
      console.error('PDF conversion failed:', error);
      return {
        pdfPath: '',
        originalImagePath: imagePath,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate multi-page PDF from multiple images using pdf-lib
   */
  private async generateMultiPagePDFFromImages(imagePaths: string[], outputPath: string, documentName: string): Promise<void> {
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      for (let i = 0; i < imagePaths.length; i++) {
        const imagePath = imagePaths[i];
        console.log(`Processing page ${i + 1}/${imagePaths.length}: ${imagePath}`);
        
        // Read and process the image
        const imageBuffer = await fs.promises.readFile(imagePath);
        let processedImageBuffer = imageBuffer;
        
        // Process image with Sharp for better quality - ensure valid JPEG output
        try {
          const metadata = await sharp(imageBuffer).metadata();
          console.log(`Original image dimensions: ${metadata.width}x${metadata.height}`);
          
          processedImageBuffer = await sharp(imageBuffer)
            .jpeg({ 
              quality: 95, // Increased quality from 85 to 95
              progressive: false,
              mozjpeg: true,
              force: true // Force JPEG format even if input is different
            })
            .toBuffer();
          console.log(`Sharp processed page ${i + 1}: ${processedImageBuffer.length} bytes`);
        } catch (sharpError) {
          console.warn(`Sharp processing failed for page ${i + 1}, using original image:`, sharpError);
        }

        // Embed the image in the PDF
        let pdfImage;
        
        // Try embedding as JPEG first, fall back to PNG if needed
        try {
          pdfImage = await pdfDoc.embedJpg(processedImageBuffer);
        } catch (jpegError) {
          console.log(`JPEG embedding failed for ${imagePath}, trying PNG:`, jpegError.message);
          try {
            pdfImage = await pdfDoc.embedPng(processedImageBuffer);
          } catch (pngError) {
            console.error(`Both JPEG and PNG embedding failed for ${imagePath}:`, pngError);
            throw new Error(`Image embedding failed: ${pngError.message}`);
          }
        }

        // Get image dimensions
        const imageDims = pdfImage.scale(1);
        
        // Calculate page size to fit image (max A4 size)
        const maxWidth = 595; // A4 width in points
        const maxHeight = 842; // A4 height in points
        
        let pageWidth = imageDims.width;
        let pageHeight = imageDims.height;
        
        // Scale down if image is larger than A4
        if (pageWidth > maxWidth || pageHeight > maxHeight) {
          const scaleX = maxWidth / pageWidth;
          const scaleY = maxHeight / pageHeight;
          const scale = Math.min(scaleX, scaleY);
          
          pageWidth = pageWidth * scale;
          pageHeight = pageHeight * scale;
        }

        // Add a page with appropriate size
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        
        // Draw the image to fill the entire page
        page.drawImage(pdfImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
      }

      // Add metadata
      pdfDoc.setTitle(`Scanned Document - ${documentName} (${imagePaths.length} pages)`);
      pdfDoc.setSubject('Multi-page document scanned with MyHome');
      pdfDoc.setCreator('MyHome Document Management System');
      pdfDoc.setProducer('MyHome PDF Converter');
      pdfDoc.setCreationDate(new Date());
      pdfDoc.setModificationDate(new Date());

      // Save the PDF
      const pdfBytes = await pdfDoc.save();
      await fs.promises.writeFile(outputPath, pdfBytes);
      
      console.log(`Multi-page PDF successfully created with pdf-lib: ${outputPath}`);
      
    } catch (error) {
      console.error('pdf-lib multi-page PDF generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate PDF from image using pdf-lib for better compatibility
   */
  private async generatePDFFromImage(imagePath: string, outputPath: string, documentName: string): Promise<void> {
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Read and process the image
      const imageBuffer = await fs.promises.readFile(imagePath);
      let processedImageBuffer = imageBuffer;
      
      // Process image with Sharp for better quality
      try {
        const metadata = await sharp(imageBuffer).metadata();
        console.log(`Original image dimensions: ${metadata.width}x${metadata.height}`);
        
        processedImageBuffer = await sharp(imageBuffer)
          .jpeg({ 
            quality: 95, // Higher quality for better image clarity
            progressive: false,
            mozjpeg: true
          })
          .toBuffer();
      } catch (sharpError) {
        console.warn('Sharp processing failed, using original image:', sharpError);
      }

      // Embed the image in the PDF
      let pdfImage;
      const ext = path.extname(imagePath).toLowerCase();
      
      if (ext === '.png') {
        pdfImage = await pdfDoc.embedPng(processedImageBuffer);
      } else {
        // Default to JPEG for all other formats
        pdfImage = await pdfDoc.embedJpg(processedImageBuffer);
      }

      // Get image dimensions
      const imageDims = pdfImage.scale(1);
      
      // Calculate page size to fit image (max A4 size)
      const maxWidth = 595; // A4 width in points
      const maxHeight = 842; // A4 height in points
      
      let pageWidth = imageDims.width;
      let pageHeight = imageDims.height;
      
      // Scale down if image is larger than A4
      if (pageWidth > maxWidth || pageHeight > maxHeight) {
        const scaleX = maxWidth / pageWidth;
        const scaleY = maxHeight / pageHeight;
        const scale = Math.min(scaleX, scaleY);
        
        pageWidth = pageWidth * scale;
        pageHeight = pageHeight * scale;
      }

      // Add a page with appropriate size
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Draw the image to fill the entire page
      page.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });

      // Add metadata
      pdfDoc.setTitle(`Scanned Document - ${documentName}`);
      pdfDoc.setSubject('Document scanned with MyHome');
      pdfDoc.setCreator('MyHome Document Management System');
      pdfDoc.setProducer('MyHome PDF Converter');
      pdfDoc.setCreationDate(new Date());
      pdfDoc.setModificationDate(new Date());

      // Save the PDF
      const pdfBytes = await pdfDoc.save();
      await fs.promises.writeFile(outputPath, pdfBytes);
      
      console.log(`PDF successfully created with pdf-lib: ${outputPath}`);
      
    } catch (error) {
      console.error('pdf-lib PDF generation failed:', error);
      throw error;
    }
  }

  /**
   * Create HTML template for PDF generation
   */
  private createPDFTemplate(imagePath: string, documentName: string): string {
    const imageBase64 = this.imageToBase64(imagePath);
    const mimeType = this.getMimeType(imagePath);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Scanned Document - ${documentName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, sans-serif;
            background: white;
        }
        
        .document-container {
            width: 100%;
            max-width: 210mm; /* A4 width */
            margin: 0 auto;
            padding: 10mm;
            background: white;
        }
        
        .document-header {
            text-align: center;
            margin-bottom: 5mm;
            font-size: 12px;
            color: #666;
        }
        
        .document-image {
            width: 100%;
            height: auto;
            max-height: 280mm; /* A4 height minus margins */
            object-fit: contain;
            border: 1px solid #ddd;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .document-footer {
            margin-top: 5mm;
            text-align: center;
            font-size: 10px;
            color: #999;
        }
        
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
            
            .document-container {
                padding: 0;
                margin: 0;
                max-width: none;
                width: 100%;
            }
            
            .document-image {
                border: none;
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="document-container">
        <div class="document-header">
            <h3>Scanned Document</h3>
            <p>Document: ${documentName}</p>
            <p>Processed: ${new Date().toLocaleDateString()}</p>
        </div>
        
        <img src="data:${mimeType};base64,${imageBase64}" 
             alt="Scanned Document" 
             class="document-image" />
        
        <div class="document-footer">
            <p>Generated by MyHome Document Management System</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Generate PDF from HTML using Puppeteer
   */
  private async generatePDFFromHTML(htmlContent: string, outputPath: string): Promise<void> {
    let browser;
    
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
        ]
      });

      const page = await browser.newPage();
      
      // Set content and wait for images to load with timeout
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      // Wait for images to fully load
      await page.waitForFunction(() => {
        const images = Array.from(document.images);
        return images.every(img => img.complete);
      }, { timeout: 10000 }).catch(() => {
        console.log('Image loading timeout, proceeding with PDF generation');
      });

      // Generate PDF with A4 settings and proper compatibility
      await page.pdf({
        path: outputPath,
        format: 'A4',
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        },
        printBackground: true,
        preferCSSPageSize: false, // Use format setting instead
        tagged: false, // Disable tagged PDF for better compatibility
        displayHeaderFooter: false,
        omitBackground: false,
        timeout: 30000, // 30 second timeout
        width: '210mm', // A4 width
        height: '297mm' // A4 height
      });

    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Convert image file to base64
   */
  private imageToBase64(imagePath: string): string {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      return imageBuffer.toString('base64');
    } catch (error) {
      throw new Error(`Failed to read image file: ${error}`);
    }
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Check if a file is an image
   */
  isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  }

  /**
   * Clean up temporary files
   */
  cleanup(filePaths: string[]): void {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up temporary file: ${filePath}`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup file ${filePath}:`, error);
      }
    });
  }

  /**
   * Convert email HTML content to PDF format
   */
  async convertEmailToPDF(
    htmlContent: string, 
    emailSubject: string, 
    fromEmail: string, 
    outputDir: string
  ): Promise<ConversionResult> {
    try {
      console.log(`Converting email to PDF: ${emailSubject}`);
      
      // Generate PDF filename
      const timestamp = Date.now();
      const pdfFilename = `email_${timestamp}.pdf`;
      const pdfPath = path.join(outputDir, pdfFilename);

      // Create enhanced HTML template for email PDF
      const emailTemplate = this.createEmailPDFTemplate(htmlContent, emailSubject, fromEmail);
      
      // Generate PDF using Puppeteer
      await this.generatePDFFromHTML(emailTemplate, pdfPath);

      console.log(`Successfully converted email to PDF: ${pdfPath}`);
      
      return {
        pdfPath,
        originalImagePath: '',
        success: true
      };

    } catch (error: any) {
      console.error('Email PDF conversion failed:', error);
      return {
        pdfPath: '',
        originalImagePath: '',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create HTML template for email PDF generation
   */
  private createEmailPDFTemplate(emailContent: string, subject: string, fromEmail: string): string {
    // Strip basic HTML and preserve structure
    const cleanContent = this.sanitizeEmailContent(emailContent);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Email: ${subject}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: white;
            color: #333;
            line-height: 1.6;
        }
        
        .email-container {
            max-width: 210mm;
            margin: 0 auto;
            padding: 15mm;
            background: white;
        }
        
        .email-header {
            border-bottom: 3px solid #2563eb;
            padding-bottom: 8mm;
            margin-bottom: 8mm;
        }
        
        .email-title {
            font-size: 24px;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 4mm;
        }
        
        .email-meta {
            background: #f8fafc;
            padding: 8mm;
            border-radius: 4mm;
            margin-bottom: 8mm;
            border-left: 4px solid #2563eb;
        }
        
        .meta-row {
            display: flex;
            margin-bottom: 2mm;
            font-size: 14px;
        }
        
        .meta-label {
            font-weight: bold;
            color: #374151;
            min-width: 20mm;
        }
        
        .meta-value {
            color: #6b7280;
        }
        
        .email-content {
            background: white;
            padding: 8mm;
            border: 1px solid #e5e7eb;
            border-radius: 4mm;
            font-size: 14px;
            line-height: 1.7;
        }
        
        .email-content h1, .email-content h2, .email-content h3 {
            color: #1f2937;
            margin: 6mm 0 4mm 0;
        }
        
        .email-content p {
            margin-bottom: 4mm;
        }
        
        .email-content table {
            width: 100%;
            border-collapse: collapse;
            margin: 4mm 0;
        }
        
        .email-content th, .email-content td {
            border: 1px solid #d1d5db;
            padding: 2mm;
            text-align: left;
        }
        
        .email-content th {
            background-color: #f3f4f6;
            font-weight: bold;
        }
        
        .footer {
            margin-top: 8mm;
            text-align: center;
            font-size: 10px;
            color: #9ca3af;
            border-top: 1px solid #e5e7eb;
            padding-top: 4mm;
        }
        
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
            
            .email-container {
                padding: 10mm;
                margin: 0;
                max-width: none;
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1 class="email-title">📧 Email Document</h1>
        </div>
        
        <div class="email-meta">
            <div class="meta-row">
                <span class="meta-label">From:</span>
                <span class="meta-value">${fromEmail}</span>
            </div>
            <div class="meta-row">
                <span class="meta-label">Subject:</span>
                <span class="meta-value">${subject}</span>
            </div>
            <div class="meta-row">
                <span class="meta-label">Processed:</span>
                <span class="meta-value">${new Date().toLocaleString()}</span>
            </div>
            <div class="meta-row">
                <span class="meta-label">Document Type:</span>
                <span class="meta-value">Email Import</span>
            </div>
        </div>
        
        <div class="email-content">
            ${cleanContent}
        </div>
        
        <div class="footer">
            <p>Generated by MyHome Document Management System</p>
            <p>Email imported and converted to PDF for document management</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Sanitize and clean email content for PDF rendering
   */
  private sanitizeEmailContent(htmlContent: string): string {
    if (!htmlContent) return '<p>No content available</p>';
    
    // Basic HTML cleaning - remove script tags, clean up formatting
    let cleaned = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/style\s*=\s*"[^"]*"/gi, '')
      .replace(/class\s*=\s*"[^"]*"/gi, '')
      .replace(/id\s*=\s*"[^"]*"/gi, '');
    
    // If it's mostly just text, wrap in paragraphs
    if (!cleaned.includes('<p>') && !cleaned.includes('<div>') && !cleaned.includes('<h')) {
      cleaned = `<p>${cleaned.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
    }
    
    return cleaned || '<p>Email content could not be processed</p>';
  }

  /**
   * Clean up temporary files if needed
   */
  async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up temporary file: ${filePath}`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup file ${filePath}:`, error);
      }
    }
  }
}

export const pdfConversionService = new PDFConversionService();