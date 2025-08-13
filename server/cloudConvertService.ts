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

// TICKET 6: Enhanced error handling with mapping to conversion reasons
export type ConversionReason = 
  | 'ok' 
  | 'skipped_unsupported' 
  | 'skipped_too_large' 
  | 'skipped_password_protected' 
  | 'error';

// Error class for CloudConvert operations
export class CloudConvertError extends Error {
  constructor(
    public code: string,
    message: string,
    public jobId?: string,
    public taskId?: string,
    public httpStatus?: number,
    public conversionReason?: ConversionReason,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'CloudConvertError';
  }
}

// TICKET 6: Configuration error that requires immediate attention
export class CloudConvertConfigError extends CloudConvertError {
  constructor(message: string, httpStatus?: number) {
    super('CONFIGURATION_ERROR', message, undefined, undefined, httpStatus, 'error', false);
    this.name = 'CloudConvertConfigError';
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
        await this.handleJobError(job);
        return job; // handleJobError throws, but TypeScript doesn't know that
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

  // TICKET 6: Enhanced request method with comprehensive error mapping and retry policy
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
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, requestOptions);
        
        if (options.returnResponse) {
          return response;
        }

        if (response.ok) {
          return await response.json();
        }

        // TICKET 6: Comprehensive error mapping with CloudConvert-specific logic
        const errorText = await response.text();
        lastError = await this.mapCloudConvertError(response.status, errorText, attempt, maxAttempts);
        
        // Check if error is retryable
        if (lastError instanceof CloudConvertError && lastError.isRetryable && attempt < maxAttempts) {
          const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(`⏳ Retryable error (${response.status}), attempt ${attempt}/${maxAttempts}, retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw lastError;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          if (error instanceof CloudConvertError) {
            throw error;
          }
          
          throw new CloudConvertError(
            'REQUEST_FAILED',
            `Request failed after ${maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`,
            undefined, undefined, undefined, 'error', false
          );
        }

        // Exponential backoff for network errors only
        if (!(error instanceof CloudConvertError)) {
          const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(`⏳ Network error, retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // CloudConvert errors should not be retried unless explicitly marked as retryable
          throw error;
        }
      }
    }

    throw lastError || new CloudConvertError('REQUEST_FAILED', 'Request failed after all attempts', undefined, undefined, undefined, 'error', false);
  }
  // TICKET 6: Map CloudConvert errors to our conversion reasons
  private async mapCloudConvertError(status: number, errorText: string, attempt: number, maxAttempts: number): Promise<CloudConvertError> {
    let conversionReason: ConversionReason;
    let isRetryable = false;
    let code: string;
    
    switch (status) {
      case 401:
      case 403:
        // Authentication/authorization issues - alert configuration team
        conversionReason = 'error';
        code = 'CONFIGURATION_ERROR';
        await this.alertConfigurationError(status, errorText);
        break;
        
      case 415:
        // Unsupported media type
        conversionReason = 'skipped_unsupported';
        code = 'UNSUPPORTED_FORMAT';
        break;
        
      case 422:
        // Unprocessable entity - often password-protected files
        conversionReason = this.detectPasswordProtected(errorText) 
          ? 'skipped_password_protected' 
          : 'skipped_unsupported';
        code = conversionReason === 'skipped_password_protected' 
          ? 'PASSWORD_PROTECTED' 
          : 'UNPROCESSABLE_ENTITY';
        break;
        
      case 413:
        // Payload too large
        conversionReason = 'skipped_too_large';
        code = 'FILE_TOO_LARGE';
        break;
        
      case 429:
        // Rate limiting - retryable
        conversionReason = 'error';
        code = 'RATE_LIMITED';
        isRetryable = attempt < maxAttempts;
        break;
        
      case 408:
      case 504:
        // Timeout errors - retryable
        conversionReason = 'error';
        code = 'TIMEOUT';
        isRetryable = attempt < maxAttempts;
        break;
        
      case 500:
      case 502:
      case 503:
        // Server errors - retryable
        conversionReason = 'error';
        code = 'SERVER_ERROR';
        isRetryable = attempt < maxAttempts;
        break;
        
      default:
        conversionReason = 'error';
        code = `HTTP_${status}`;
        isRetryable = status >= 500 && attempt < maxAttempts;
    }
    
    return new CloudConvertError(
      code,
      `CloudConvert API error (${status}): ${errorText}`,
      undefined,
      undefined,
      status,
      conversionReason,
      isRetryable
    );
  }
  
  // TICKET 6: Detect password-protected files from error messages
  private detectPasswordProtected(errorText: string): boolean {
    const passwordKeywords = [
      'password',
      'protected',
      'encrypted',
      'locked',
      'authentication required',
      'permission denied'
    ];
    
    const lowerErrorText = errorText.toLowerCase();
    return passwordKeywords.some(keyword => lowerErrorText.includes(keyword));
  }
  
  // TICKET 6: Alert configuration errors to operations team
  private async alertConfigurationError(status: number, errorText: string): Promise<void> {
    try {
      // Import Sentry dynamically to avoid initialization issues
      const Sentry = await import('@sentry/node');
      
      const configError = new CloudConvertConfigError(
        `CloudConvert configuration error (${status}): ${errorText}`,
        status
      );
      
      // Log to Sentry with high priority
      Sentry.withScope(scope => {
        scope.setTag('service', 'cloudconvert');
        scope.setTag('error_type', 'configuration');
        scope.setLevel('error');
        scope.setContext('cloudconvert_error', {
          httpStatus: status,
          errorText,
          timestamp: new Date().toISOString(),
          apiKey: this.config.apiKey ? '***REDACTED***' : 'MISSING'
        });
        Sentry.captureException(configError);
      });
      
      console.error(`🚨 CloudConvert Configuration Error (${status}): ${errorText}`);
      
    } catch (sentryError) {
      console.error('Failed to alert configuration error:', sentryError);
      console.error(`🚨 CloudConvert Configuration Error (${status}): ${errorText}`);
    }
  }
  
  // TICKET 6: Enhanced job error handling with Sentry integration
  private async handleJobError(job: CloudConvertJob): Promise<void> {
    const errorTasks = job.tasks.filter((t: CloudConvertTask) => t.status === 'error');
    const errorMessages = errorTasks.map((t: CloudConvertTask) => `${t.name}: ${t.message}`).join(', ');
    
    try {
      // Import Sentry dynamically
      const Sentry = await import('@sentry/node');
      
      // Create detailed error for Sentry
      const jobError = new CloudConvertError(
        'JOB_FAILED', 
        `CloudConvert job failed: ${errorMessages}`, 
        job.id,
        undefined,
        undefined,
        'error',
        false
      );
      
      // Log to Sentry with job details
      Sentry.withScope(scope => {
        scope.setTag('service', 'cloudconvert');
        scope.setTag('error_type', 'job_failure');
        scope.setLevel('error');
        scope.setContext('cloudconvert_job', {
          jobId: job.id,
          status: job.status,
          taskCount: job.tasks.length,
          errorTaskCount: errorTasks.length,
          tasks: job.tasks.map(t => ({
            id: t.id,
            name: t.name,
            operation: t.operation,
            status: t.status,
            message: t.message
          }))
        });
        Sentry.captureException(jobError);
      });
      
      console.error(`❌ CloudConvert job ${job.id} failed with ${errorTasks.length} error(s): ${errorMessages}`);
      
    } catch (sentryError) {
      console.error('Failed to log job error to Sentry:', sentryError);
    }
    
    throw new CloudConvertError('JOB_FAILED', `Job failed: ${errorMessages}`, job.id);
  }
}

// Create singleton instance
export const cloudConvertService = new CloudConvertService();