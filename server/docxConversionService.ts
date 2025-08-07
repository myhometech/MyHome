/**
 * DOCX Conversion Service
 * Converts DOCX files to PDF for viewing and OCR processing
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resourceTracker } from './resourceTracker';
import mammoth from 'mammoth';

interface ConversionResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
  metadata?: {
    originalSize: number;
    convertedSize?: number;
    conversionTime: number;
    method: string;
  };
  extractedText?: string; // For text extraction results
}

export class DocxConversionService {
  private static instance: DocxConversionService;
  private tempDir: string;

  constructor() {
    this.tempDir = process.env.TEMP_DIR || '/tmp';
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  static getInstance(): DocxConversionService {
    if (!DocxConversionService.instance) {
      DocxConversionService.instance = new DocxConversionService();
    }
    return DocxConversionService.instance;
  }

  /**
   * Extract text from DOCX file using Mammoth
   */
  async extractTextFromDocx(docxPath: string): Promise<ConversionResult> {
    const startTime = Date.now();
    const resourceId = resourceTracker.trackFile(docxPath);
    
    try {
      console.log(`🔄 DOCX_TEXT_EXTRACTION: Starting text extraction for ${docxPath}`);
      
      if (!fs.existsSync(docxPath)) {
        throw new Error(`DOCX file not found: ${docxPath}`);
      }

      const originalSize = fs.statSync(docxPath).size;
      
      // Extract text using Mammoth
      const result = await mammoth.extractRawText({ path: docxPath });
      const extractedText = result.value;
      const conversionTime = Date.now() - startTime;
      
      console.log(`✅ DOCX_TEXT_EXTRACTION: Extracted ${extractedText.length} characters in ${conversionTime}ms`);
      
      return {
        success: true,
        extractedText,
        metadata: {
          originalSize,
          conversionTime,
          method: 'mammoth'
        }
      };
    } catch (error) {
      console.error('❌ DOCX_TEXT_EXTRACTION: Text extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown text extraction error'
      };
    } finally {
      await resourceTracker.releaseResource(resourceId);
    }
  }

  /**
   * Convert DOCX file to PDF using LibreOffice headless mode
   */
  async convertDocxToPdf(docxPath: string, outputDir?: string): Promise<ConversionResult> {
    const startTime = Date.now();
    const resourceId = resourceTracker.trackFile(docxPath);
    
    try {
      console.log(`🔄 DOCX_CONVERSION: Starting conversion for ${docxPath}`);
      
      if (!fs.existsSync(docxPath)) {
        throw new Error(`DOCX file not found: ${docxPath}`);
      }

      const originalSize = fs.statSync(docxPath).size;
      const outputDirectory = outputDir || this.tempDir;
      
      // Ensure output directory exists
      if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
      }

      // Generate unique output filename
      const docxFilename = path.basename(docxPath, '.docx');
      const pdfPath = path.join(outputDirectory, `${docxFilename}_converted.pdf`);
      
      // Try LibreOffice conversion first
      const libreOfficeResult = await this.convertWithLibreOffice(docxPath, outputDirectory);
      
      if (libreOfficeResult.success) {
        // LibreOffice creates PDF with same base name as input
        const expectedPdfPath = path.join(outputDirectory, `${docxFilename}.pdf`);
        
        // Rename to our expected path if different
        if (fs.existsSync(expectedPdfPath) && expectedPdfPath !== pdfPath) {
          fs.renameSync(expectedPdfPath, pdfPath);
        }
        
        if (fs.existsSync(pdfPath)) {
          const convertedSize = fs.statSync(pdfPath).size;
          const conversionTime = Date.now() - startTime;
          
          console.log(`✅ DOCX_CONVERSION: Successfully converted ${docxPath} to ${pdfPath} in ${conversionTime}ms`);
          
          return {
            success: true,
            pdfPath,
            metadata: {
              originalSize,
              convertedSize,
              conversionTime,
              method: 'libreoffice'
            }
          };
        }
      }

      // Fallback: try alternative conversion methods if available
      // For now, we'll return the LibreOffice error
      return {
        success: false,
        error: libreOfficeResult.error || 'DOCX conversion failed'
      };

    } catch (error) {
      console.error('❌ DOCX_CONVERSION: Conversion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown conversion error'
      };
    } finally {
      // Clean up tracked resources
      await resourceTracker.releaseResource(resourceId);
    }
  }

  /**
   * Convert using LibreOffice headless mode
   */
  private async convertWithLibreOffice(docxPath: string, outputDir: string): Promise<ConversionResult> {
    return new Promise((resolve) => {
      console.log(`🔄 DOCX_CONVERSION: Attempting LibreOffice conversion`);
      
      // LibreOffice headless command
      const libreOfficeCmd = 'soffice';
      const args = [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', outputDir,
        docxPath
      ];

      const libreOfficeProcess = spawn(libreOfficeCmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000 // 30 second timeout
      });

      let stdout = '';
      let stderr = '';

      libreOfficeProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      libreOfficeProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      libreOfficeProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ DOCX_CONVERSION: LibreOffice conversion completed successfully`);
          resolve({
            success: true,
            metadata: {
              originalSize: 0,
              conversionTime: 0,
              method: 'libreoffice'
            }
          });
        } else {
          console.error(`❌ DOCX_CONVERSION: LibreOffice failed with code ${code}`);
          console.error(`❌ DOCX_CONVERSION: stderr: ${stderr}`);
          resolve({
            success: false,
            error: `LibreOffice conversion failed (code ${code}): ${stderr || stdout}`
          });
        }
      });

      libreOfficeProcess.on('error', (error) => {
        console.error(`❌ DOCX_CONVERSION: LibreOffice spawn error:`, error);
        resolve({
          success: false,
          error: `LibreOffice not available: ${error.message}`
        });
      });
    });
  }

  /**
   * Check if DOCX file is supported for conversion
   */
  isDocxFile(mimeType: string): boolean {
    const docxMimeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-word.document.macroEnabled.12',
      'application/msword' // Legacy DOC files
    ];
    
    return docxMimeTypes.includes(mimeType);
  }

  /**
   * Check if LibreOffice is available on the system
   */
  async checkLibreOfficeAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const testProcess = spawn('soffice', ['--version'], { stdio: 'pipe' });
      
      testProcess.on('close', (code) => {
        resolve(code === 0);
      });

      testProcess.on('error', () => {
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        testProcess.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🧹 DOCX_CONVERSION: Cleaned up ${filePath}`);
        }
      } catch (error) {
        console.error(`❌ DOCX_CONVERSION: Failed to clean up ${filePath}:`, error);
      }
    }
  }

  /**
   * Get service status for debugging
   */
  async getServiceStatus(): Promise<{
    available: boolean;
    libreOfficeAvailable: boolean;
    tempDir: string;
  }> {
    const libreOfficeAvailable = await this.checkLibreOfficeAvailability();
    
    return {
      available: libreOfficeAvailable,
      libreOfficeAvailable,
      tempDir: this.tempDir
    };
  }
}

export default DocxConversionService.getInstance();