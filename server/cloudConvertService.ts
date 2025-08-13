import fetch, { FormData } from 'node-fetch';
import { Buffer } from 'buffer';

// CloudConvert Service Configuration
interface CloudConvertConfig {
  apiKey: string;
  sandbox: boolean;
  region: string;
  timeoutMs: number;
}

// Type definitions for conversion inputs
export type ConvertInput =
  | { kind: 'html'; filename: 'body.html'; html: string }
  | { kind: 'file'; filename: string; mime: string; buffer: Buffer };

export type ConvertResult = {
  files: Array<{ filename: string; pdfBuffer: Buffer; meta: Record<string, any> }>;
  jobId: string;
};

export interface ICloudConvertService {
  convertToPdf(inputs: ConvertInput[]): Promise<ConvertResult>;
}

// CloudConvert API response types
interface CloudConvertJob {
  id: string;
  status: 'waiting' | 'processing' | 'finished' | 'error';
  tasks: CloudConvertTask[];
}

interface CloudConvertTask {
  id: string;
  name: string;
  operation: string;
  status: 'waiting' | 'processing' | 'finished' | 'error';
  result?: {
    files: Array<{
      filename: string;
      size: number;
      url: string;
    }>;
  };
  message?: string;
}

// Error class for CloudConvert operations
export class CloudConvertError extends Error {
  constructor(
    public code: string,
    message: string,
    public jobId?: string,
    public taskId?: string
  ) {
    super(message);
    this.name = 'CloudConvertError';
  }
}

export class CloudConvertService implements ICloudConvertService {
  private config: CloudConvertConfig;
  private baseUrl: string;

  constructor() {
    this.config = {
      apiKey: process.env.CLOUDCONVERT_API_KEY || '',
      sandbox: process.env.CLOUDCONVERT_SANDBOX === 'true',
      region: process.env.CLOUDCONVERT_REGION || 'auto',
      timeoutMs: parseInt(process.env.CLOUDCONVERT_TIMEOUT_MS || '30000')
    };

    if (!this.config.apiKey) {
      throw new CloudConvertError('MISSING_API_KEY', 'CLOUDCONVERT_API_KEY environment variable is required');
    }

    this.baseUrl = this.config.sandbox 
      ? 'https://api.sandbox.cloudconvert.com/v2'
      : 'https://api.cloudconvert.com/v2';
  }

  async convertToPdf(inputs: ConvertInput[]): Promise<ConvertResult> {
    const startTime = Date.now();
    
    try {
      // Create CloudConvert job with multiple tasks
      const job = await this.createJob(inputs);
      console.log(`📄 CloudConvert job created: ${job.id}`);

      // Upload input files for each task
      await this.uploadInputs(job, inputs);
      console.log(`📤 Uploaded ${inputs.length} input files`);

      // Wait for job completion
      const completedJob = await this.waitForCompletion(job.id);
      console.log(`✅ CloudConvert job completed: ${job.id}`);

      // Download all PDF results
      const results = await this.downloadResults(completedJob);
      
      const duration = Date.now() - startTime;
      console.log(`📊 CloudConvert conversion completed in ${duration}ms: ${results.length} PDFs generated`);

      return {
        files: results,
        jobId: job.id
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ CloudConvert conversion failed after ${duration}ms:`, error);
      
      if (error instanceof CloudConvertError) {
        throw error;
      }
      
      throw new CloudConvertError(
        'CONVERSION_FAILED',
        `CloudConvert operation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async createJob(inputs: ConvertInput[]): Promise<CloudConvertJob> {
    const tasks: Record<string, any> = {};

    inputs.forEach((input, index) => {
      const taskName = `convert_${index}`;
      const inputTaskName = `input_${index}`;
      const exportTaskName = `export_${index}`;

      // Input task (upload)
      tasks[inputTaskName] = {
        operation: 'import/upload'
      };

      // Convert task
      if (input.kind === 'html') {
        tasks[taskName] = {
          operation: 'convert',
          input: inputTaskName,
          input_format: 'html',
          output_format: 'pdf',
          engine: 'chrome',
          engine_version: 'latest',
          options: {
            page_size: 'A4',
            margin_top: '1in',
            margin_right: '1in',
            margin_bottom: '1in',
            margin_left: '1in',
            print_background: true,
            wait_time: 0,
            wait_for_element: null,
            zoom: 1
          }
        };
      } else {
        // File conversion - let CloudConvert auto-detect format
        tasks[taskName] = {
          operation: 'convert',
          input: inputTaskName,
          output_format: 'pdf',
          // Use LibreOffice for Office docs, ImageMagick for images
          engine: this.getEngineForMimeType(input.mime),
          options: this.getConvertOptions(input.mime)
        };
      }

      // Export task
      tasks[exportTaskName] = {
        operation: 'export/url',
        input: taskName,
        inline: false,
        archive_multiple_files: false
      };
    });

    const jobPayload = {
      tasks,
      tag: 'myhome-email-conversion'
    };

    return this.makeRequest('POST', '/jobs', jobPayload);
  }

  private getEngineForMimeType(mime: string): string {
    if (mime.startsWith('application/vnd.openxmlformats-officedocument') || 
        mime.startsWith('application/vnd.ms-') ||
        mime === 'application/msword') {
      return 'libreoffice';
    }
    
    if (mime.startsWith('image/')) {
      return 'imagemagick';
    }
    
    return 'auto'; // Let CloudConvert decide
  }

  private getConvertOptions(mime: string): Record<string, any> {
    const options: Record<string, any> = {};
    
    if (mime.startsWith('image/')) {
      options.page_size = 'A4';
      options.fit = 'max';
    }
    
    return options;
  }

  private async uploadInputs(job: CloudConvertJob, inputs: ConvertInput[]): Promise<void> {
    const uploadPromises = inputs.map(async (input, index) => {
      const inputTask = job.tasks.find(t => t.name === `input_${index}`);
      if (!inputTask || !inputTask.result) {
        throw new CloudConvertError('UPLOAD_TASK_NOT_FOUND', `Upload task not found for input ${index}`);
      }

      const uploadUrl = (inputTask.result as any).form?.url;
      if (!uploadUrl) {
        throw new CloudConvertError('UPLOAD_URL_NOT_FOUND', `Upload URL not found for input ${index}`);
      }

      // Prepare form data for upload
      const formData = new FormData();
      
      // Add CloudConvert required fields
      if ((inputTask.result as any).form?.parameters) {
        Object.entries((inputTask.result as any).form.parameters).forEach(([key, value]) => {
          formData.append(key, value as string);
        });
      }

      // Add file data
      if (input.kind === 'html') {
        const htmlBuffer = Buffer.from(input.html, 'utf-8');
        formData.append('file', new Blob([htmlBuffer], { type: 'text/html' }), input.filename);
      } else {
        formData.append('file', new Blob([input.buffer], { type: input.mime }), input.filename);
      }

      // Upload with retry logic
      await this.uploadWithRetry(uploadUrl, formData, index);
    });

    await Promise.all(uploadPromises);
  }

  private async uploadWithRetry(uploadUrl: string, formData: FormData, inputIndex: number): Promise<void> {
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData
          // Note: node-fetch v2 timeout handling via AbortController if needed
        });

        if (response.ok) {
          console.log(`📤 Successfully uploaded input ${inputIndex} (attempt ${attempt})`);
          return;
        }

        if (response.status >= 400 && response.status < 500) {
          // Client error - don't retry
          throw new CloudConvertError(
            'UPLOAD_CLIENT_ERROR',
            `Upload failed with status ${response.status}: ${await response.text()}`
          );
        }

        // Server error - retry
        throw new Error(`Upload failed with status ${response.status}`);

      } catch (error) {
        if (attempt === maxAttempts) {
          throw new CloudConvertError(
            'UPLOAD_FAILED',
            `Upload failed after ${maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        console.log(`⏳ Retrying upload for input ${inputIndex} (attempt ${attempt + 1}) after ${delay}ms`);
      }
    }
  }

  private async waitForCompletion(jobId: string): Promise<CloudConvertJob> {
    const maxWaitTime = this.config.timeoutMs;
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const job = await this.makeRequest('GET', `/jobs/${jobId}?include=tasks`);
      
      if (job.status === 'finished') {
        return job;
      }
      
      if (job.status === 'error') {
        const errorTasks = job.tasks.filter((t: CloudConvertTask) => t.status === 'error');
        const errorMessages = errorTasks.map((t: CloudConvertTask) => `${t.name}: ${t.message}`).join(', ');
        throw new CloudConvertError('JOB_FAILED', `Job failed: ${errorMessages}`, jobId);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new CloudConvertError('JOB_TIMEOUT', `Job did not complete within ${maxWaitTime}ms`, jobId);
  }

  private async downloadResults(job: CloudConvertJob): Promise<Array<{ filename: string; pdfBuffer: Buffer; meta: Record<string, any> }>> {
    const exportTasks = job.tasks.filter(t => t.operation === 'export/url' && t.status === 'finished');
    
    const downloadPromises = exportTasks.map(async (task, index) => {
      if (!task.result?.files?.[0]?.url) {
        throw new CloudConvertError('DOWNLOAD_URL_NOT_FOUND', `Download URL not found for task ${task.name}`, job.id, task.id);
      }

      const fileInfo = task.result.files[0];
      const response = await this.makeRequest('GET', fileInfo.url, null, { returnResponse: true });
      
      if (!response.ok) {
        throw new CloudConvertError('DOWNLOAD_FAILED', `Failed to download file: ${response.status}`, job.id, task.id);
      }

      const buffer = await response.buffer();
      
      return {
        filename: fileInfo.filename.replace(/\.[^.]+$/, '.pdf'), // Ensure .pdf extension
        pdfBuffer: buffer,
        meta: {
          originalFilename: fileInfo.filename,
          size: fileInfo.size,
          taskId: task.id,
          index
        }
      };
    });

    return Promise.all(downloadPromises);
  }

  private async makeRequest(method: string, endpoint: string, body?: any, options: { returnResponse?: boolean } = {}): Promise<any> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const requestOptions: any = {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
      // Note: node-fetch v2 uses timeout differently, handled via AbortController if needed
    };

    if (body) {
      requestOptions.body = JSON.stringify(body);
    }

    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, requestOptions);
        
        if (options.returnResponse) {
          return response;
        }

        if (response.ok) {
          return await response.json();
        }

        // Handle rate limiting
        if (response.status === 429) {
          if (attempt === maxAttempts) {
            throw new CloudConvertError('RATE_LIMITED', 'Rate limit exceeded after retries');
          }
          
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * Math.pow(2, attempt - 1);
          console.log(`⏳ Rate limited, retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Don't retry on client errors (except 429)
        if (response.status >= 400 && response.status < 500) {
          const errorText = await response.text();
          throw new CloudConvertError(
            'API_CLIENT_ERROR',
            `API request failed with status ${response.status}: ${errorText}`
          );
        }

        // Retry on server errors
        if (response.status >= 500) {
          if (attempt === maxAttempts) {
            const errorText = await response.text();
            throw new CloudConvertError(
              'API_SERVER_ERROR',
              `API request failed after ${maxAttempts} attempts with status ${response.status}: ${errorText}`
            );
          }
          
          const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(`⏳ Server error, retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw new Error(`Unexpected response status: ${response.status}`);

      } catch (error) {
        if (attempt === maxAttempts) {
          if (error instanceof CloudConvertError) {
            throw error;
          }
          
          throw new CloudConvertError(
            'REQUEST_FAILED',
            `Request failed after ${maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        // Exponential backoff for non-CloudConvert errors
        if (!(error instanceof CloudConvertError)) {
          const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new CloudConvertError('REQUEST_FAILED', 'Request failed after all attempts');
  }
}

// Create singleton instance
export const cloudConvertService = new CloudConvertService();