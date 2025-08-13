import { CloudConvertService, ConvertInput, CloudConvertError } from '../cloudConvertService';
import { Buffer } from 'buffer';

// Mock fetch for testing
global.fetch = jest.fn();

describe('CloudConvertService', () => {
  let service: CloudConvertService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables for testing
    process.env.CLOUDCONVERT_API_KEY = 'test_api_key';
    process.env.CLOUDCONVERT_SANDBOX = 'true';
    process.env.CLOUDCONVERT_REGION = 'eu-central-1';
    process.env.CLOUDCONVERT_TIMEOUT_MS = '10000';
    
    service = new CloudConvertService();
  });
  
  afterEach(() => {
    delete process.env.CLOUDCONVERT_API_KEY;
    delete process.env.CLOUDCONVERT_SANDBOX;
    delete process.env.CLOUDCONVERT_REGION;
    delete process.env.CLOUDCONVERT_TIMEOUT_MS;
  });

  describe('constructor', () => {
    it('should throw error if API key is missing', () => {
      delete process.env.CLOUDCONVERT_API_KEY;
      
      expect(() => new CloudConvertService()).toThrow(CloudConvertError);
      expect(() => new CloudConvertService()).toThrow('CLOUDCONVERT_API_KEY environment variable is required');
    });

    it('should use sandbox URL when sandbox is enabled', () => {
      expect(service['baseUrl']).toBe('https://api.sandbox.cloudconvert.com/v2');
    });

    it('should use production URL when sandbox is disabled', () => {
      process.env.CLOUDCONVERT_SANDBOX = 'false';
      const prodService = new CloudConvertService();
      expect(prodService['baseUrl']).toBe('https://api.cloudconvert.com/v2');
    });
  });

  describe('convertToPdf', () => {
    const mockInputs: ConvertInput[] = [
      {
        kind: 'html',
        filename: 'body.html',
        html: '<html><body><h1>Test Email</h1></body></html>'
      },
      {
        kind: 'file',
        filename: 'document.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('mock docx content')
      }
    ];

    const mockJob = {
      id: 'test-job-123',
      status: 'waiting' as const,
      tasks: [
        {
          id: 'input_0',
          name: 'input_0',
          operation: 'import/upload',
          status: 'waiting' as const,
          result: {
            form: {
              url: 'https://upload.example.com',
              parameters: { key: 'value' }
            }
          }
        },
        {
          id: 'input_1', 
          name: 'input_1',
          operation: 'import/upload',
          status: 'waiting' as const,
          result: {
            form: {
              url: 'https://upload.example.com',
              parameters: { key: 'value' }
            }
          }
        }
      ]
    };

    const mockCompletedJob = {
      ...mockJob,
      status: 'finished' as const,
      tasks: [
        ...mockJob.tasks,
        {
          id: 'export_0',
          name: 'export_0', 
          operation: 'export/url',
          status: 'finished' as const,
          result: {
            files: [{
              filename: 'body.pdf',
              size: 12345,
              url: 'https://download.example.com/body.pdf'
            }]
          }
        },
        {
          id: 'export_1',
          name: 'export_1',
          operation: 'export/url', 
          status: 'finished' as const,
          result: {
            files: [{
              filename: 'document.pdf',
              size: 67890,
              url: 'https://download.example.com/document.pdf'
            }]
          }
        }
      ]
    };

    beforeEach(() => {
      (global.fetch as jest.Mock)
        // Create job
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockJob)
        })
        // Upload file 1
        .mockResolvedValueOnce({
          ok: true
        })
        // Upload file 2
        .mockResolvedValueOnce({
          ok: true
        })
        // Check job status
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCompletedJob)
        })
        // Download PDF 1
        .mockResolvedValueOnce({
          ok: true,
          buffer: () => Promise.resolve(Buffer.from('mock pdf 1 content'))
        })
        // Download PDF 2
        .mockResolvedValueOnce({
          ok: true,
          buffer: () => Promise.resolve(Buffer.from('mock pdf 2 content'))
        });
    });

    it('should successfully convert HTML and file to PDFs', async () => {
      const result = await service.convertToPdf(mockInputs);

      expect(result.jobId).toBe('test-job-123');
      expect(result.files).toHaveLength(2);
      expect(result.files[0].filename).toBe('body.pdf');
      expect(result.files[1].filename).toBe('document.pdf');
      expect(result.files[0].pdfBuffer).toBeInstanceOf(Buffer);
      expect(result.files[1].pdfBuffer).toBeInstanceOf(Buffer);
    });

    it('should handle job creation failure', async () => {
      (global.fetch as jest.Mock).mockReset().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request')
      });

      await expect(service.convertToPdf(mockInputs)).rejects.toThrow(CloudConvertError);
      await expect(service.convertToPdf(mockInputs)).rejects.toThrow('API_CLIENT_ERROR');
    });

    it('should handle upload failure', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockJob)
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500
        });

      await expect(service.convertToPdf(mockInputs)).rejects.toThrow(CloudConvertError);
    });

    it('should handle job timeout', async () => {
      const longRunningJob = { ...mockJob, status: 'processing' as const };
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockJob)
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(longRunningJob)
        });

      // Mock setTimeout to make it resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await expect(service.convertToPdf(mockInputs)).rejects.toThrow(CloudConvertError);
      await expect(service.convertToPdf(mockInputs)).rejects.toThrow('JOB_TIMEOUT');
    });

    it('should handle job error status', async () => {
      const errorJob = {
        ...mockJob,
        status: 'error' as const,
        tasks: [
          {
            ...mockJob.tasks[0],
            status: 'error' as const,
            message: 'Conversion failed'
          }
        ]
      };
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockJob)
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(errorJob)
        });

      await expect(service.convertToPdf(mockInputs)).rejects.toThrow(CloudConvertError);
      await expect(service.convertToPdf(mockInputs)).rejects.toThrow('JOB_FAILED');
    });
  });

  describe('engine selection', () => {
    it('should select LibreOffice for Office documents', () => {
      const service = new CloudConvertService();
      
      expect(service['getEngineForMimeType']('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('libreoffice');
      expect(service['getEngineForMimeType']('application/vnd.ms-excel')).toBe('libreoffice');
      expect(service['getEngineForMimeType']('application/msword')).toBe('libreoffice');
    });

    it('should select ImageMagick for images', () => {
      const service = new CloudConvertService();
      
      expect(service['getEngineForMimeType']('image/jpeg')).toBe('imagemagick');
      expect(service['getEngineForMimeType']('image/png')).toBe('imagemagick');
    });

    it('should use auto for unknown types', () => {
      const service = new CloudConvertService();
      
      expect(service['getEngineForMimeType']('application/unknown')).toBe('auto');
    });
  });

  describe('retry logic', () => {
    it('should retry on 429 rate limit', async () => {
      const mockInputs: ConvertInput[] = [{
        kind: 'html',
        filename: 'body.html',
        html: '<html><body>Test</body></html>'
      }];

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: () => '1' }
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'test', status: 'waiting', tasks: [] })
        });

      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      // This should not throw due to retry
      expect(service['makeRequest']('POST', '/jobs', {})).resolves.toBeDefined();
    });

    it('should not retry on 4xx client errors (except 429)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request')
      });

      await expect(service['makeRequest']('POST', '/jobs', {})).rejects.toThrow(CloudConvertError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx server errors', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error')
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error')
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error')
        });

      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await expect(service['makeRequest']('POST', '/jobs', {})).rejects.toThrow(CloudConvertError);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});