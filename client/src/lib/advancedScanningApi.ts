/**
 * Advanced Scanning API Client
 * Provides frontend interface for advanced document scanning features
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface ProcessPagesRequest {
  pages: {
    fileName: string;
    corners?: { x: number; y: number }[];
    colorMode: 'auto' | 'color' | 'grayscale' | 'bw';
    rotation?: number;
  }[];
  documentName: string;
  categoryId?: number;
  tags?: string;
}

interface ProcessPagesResponse {
  success: boolean;
  document: {
    id: number;
    name: string;
    fileName: string;
    fileSize: number;
    pageCount: number;
    confidence: number;
    extractedText: string;
    processingMetadata: {
      totalTextLength: number;
      compressionRatio: number;
      averageConfidence: number;
      enhancementApplied: string[];
    };
  };
}

interface EnhanceImageResponse {
  success: boolean;
  enhanced: string; // base64 encoded image
  metadata: {
    enhancement: string[];
    originalSize: { width: number; height: number };
    processedSize: { width: number; height: number };
  };
  originalSize: number;
  enhancedSize: number;
  compressionRatio: number;
}

interface ExtractTextResponse {
  success: boolean;
  text: string;
  confidence: number;
  wordCount: number;
  words: {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }[];
  metadata: {
    originalSize: number;
    enhancedSize: number;
    processingTime: number;
  };
}

interface ScanningHealthResponse {
  success: boolean;
  status: 'operational' | 'unavailable';
  capabilities: {
    multiPageScanning: boolean;
    edgeDetection: boolean;
    perspectiveCorrection: boolean;
    ocrLanguages: string[];
    colorFilters: string[];
    maxPages: number;
    maxFileSize: string;
  };
  timestamp: string;
}

class AdvancedScanningAPI {
  private baseUrl = `${API_BASE_URL}/api/scanning`;

  /**
   * Process multiple scanned pages and generate searchable PDF
   */
  async processPages(
    files: File[], 
    metadata: ProcessPagesRequest
  ): Promise<ProcessPagesResponse> {
    const formData = new FormData();
    
    // Add files
    files.forEach(file => {
      formData.append('pages', file);
    });
    
    // Add metadata
    formData.append('metadata', JSON.stringify(metadata));

    const response = await fetch(`${this.baseUrl}/process-pages`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to process pages');
    }

    return response.json();
  }

  /**
   * Enhance a single image for better OCR results
   */
  async enhanceImage(file: File): Promise<EnhanceImageResponse> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${this.baseUrl}/enhance-image`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to enhance image');
    }

    return response.json();
  }

  /**
   * Extract text from a single image using advanced OCR
   */
  async extractText(file: File): Promise<ExtractTextResponse> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${this.baseUrl}/extract-text`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to extract text');
    }

    return response.json();
  }

  /**
   * Check OCR service health and capabilities
   */
  async checkHealth(): Promise<ScanningHealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to check scanning service health');
    }

    return response.json();
  }
}

// Export singleton instance
export const advancedScanningAPI = new AdvancedScanningAPI();
export type { ProcessPagesRequest, ProcessPagesResponse, EnhanceImageResponse, ExtractTextResponse, ScanningHealthResponse };