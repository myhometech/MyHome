import fetch, { FormData } from 'node-fetch';
import { Buffer } from 'buffer';
import { metricsService, measureConversion, type ConversionEngine, type ConversionType } from './metricsService.js';
import * as Sentry from '@sentry/node';

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

// Task summary type for enhanced error logging (used in createJob method)
type TaskSummary = {
  name: string;
  operation: string;
  input?: string | string[];
};

export class CloudConvertService implements ICloudConvertService {
  private config: CloudConvertConfig;
  private baseUrl: string;
  private isHealthy: boolean = false;

  constructor() {
    this.config = {
      apiKey: process.env.CLOUDCONVERT_API_KEY || '',
      sandbox: process.env.CLOUDCONVERT_SANDBOX === 'true',
      region: process.env.CLOUDCONVERT_REGION || 'auto',
      timeoutMs: parseInt(process.env.CLOUDCONVERT_TIMEOUT_MS || '30000')
    };

    if (!this.config.apiKey) {
      console.error('🚨 CloudConvert API key is missing. Set CLOUDCONVERT_API_KEY environment variable.');
      throw new CloudConvertConfigError('CLOUDCONVERT_API_KEY environment variable is required');
    }

    this.baseUrl = this.config.sandbox 
      ? 'https://api.sandbox.cloudconvert.com/v2'
      : 'https://api.cloudconvert.com/v2';

    const maskedKey = this.config.apiKey.slice(0, 8) + '...' + this.config.apiKey.slice(-4);
    console.log(`✅ CloudConvert service initialized (${this.config.sandbox ? 'sandbox' : 'production'} mode) with key ${maskedKey}`);
    
    // TICKET: Register this instance globally for healthcheck coordination
    globalCloudConvertService = this;
  }

  // TICKET: Method to set health status from healthcheck
  setHealthy(healthy: boolean): void {
    this.isHealthy = healthy;
  }

  async convertToPdf(inputs: ConvertInput[]): Promise<ConvertResult> {
    // TICKET: Prevent job creation when service is unhealthy
    if (!this.isHealthy) {
      throw new CloudConvertConfigError(
        'CloudConvert service is not healthy - likely due to invalid API key or insufficient permissions. Please check the startup logs for details.',
        403
      );
    }

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

  // TICKET 7: Metrics helper methods
  
  private determineConversionType(inputs: ConvertInput[]): ConversionType {
    // If any input is HTML (email body), consider it body conversion
    const hasHtml = inputs.some(input => input.kind === 'html');
    return hasHtml ? 'body' : 'attachment';
  }
  
  private calculateTotalInputSize(inputs: ConvertInput[]): number {
    return inputs.reduce((total, input) => {
      if (input.kind === 'html') {
        return total + Buffer.from(input.html, 'utf-8').length;
      } else {
        return total + input.buffer.length;
      }
    }, 0);
  }
  
  private recordConversionMetrics(inputs: ConvertInput[], files: any[], jobId: string): void {
    // Record success metrics for each input type
    const htmlInputs = inputs.filter(input => input.kind === 'html');
    const fileInputs = inputs.filter(input => input.kind === 'file');
    
    htmlInputs.forEach(() => {
      metricsService.recordSuccess('cloudconvert', 'body', { jobId });
    });
    
    fileInputs.forEach((input) => {
      metricsService.recordSuccess('cloudconvert', 'attachment', {
        jobId,
        mimeType: input.kind === 'file' ? input.mime : undefined,
        fileSize: input.kind === 'file' ? input.buffer.length : undefined
      });
    });
  }

  private async createJob(inputs: ConvertInput[]): Promise<CloudConvertJob> {
    // Validate API key before creating job
    if (!this.config.apiKey) {
      throw new CloudConvertConfigError('CLOUDCONVERT_API_KEY is not configured');
    }

    const tasks: Record<string, any> = {};

    // TICKET: Use explicit task naming for better error logging
    inputs.forEach((input, index) => {
      const taskName = `convert_${index}`;
      const inputTaskName = `input_${index}`;
      const exportTaskName = `export_${index}`;

      // Input task (upload)
      tasks[inputTaskName] = {
        operation: 'import/upload'
      };

      // Convert task with explicit naming
      if (input.kind === 'html') {
        const CHROME_VERSION = process.env.CC_CHROME_ENGINE_VERSION || '';
        const convertTask: any = {
          operation: 'convert',
          input: inputTaskName,
          input_format: 'html',
          output_format: 'pdf',
          engine: 'chrome',
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
        if (CHROME_VERSION) {
          convertTask.engine_version = CHROME_VERSION;
        }
        tasks[taskName] = convertTask;
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

    // TICKET: Create task summary for enhanced error logging
    const taskSummary: TaskSummary[] = Object.entries(tasks).map(([name, t]: any) => ({
      name, 
      operation: t.operation, 
      input: t.input
    }));

    const jobPayload = {
      tasks,
      tag: 'myhome-email-conversion'
    };

    // TICKET: Enhanced error handling with context capture
    let job: any;
    try {
      job = await this.makeRequest('POST', '/jobs', jobPayload);
    } catch (error) {
      if (error instanceof CloudConvertError) {
        // Add task summary to existing error for better debugging
        console.error('[CloudConvert] Job creation failed', { 
          code: error.code,
          status: error.httpStatus,
          taskSummary 
        });

        // Send enhanced error to Sentry
        Sentry.withScope(scope => {
          scope.setTag('service', 'cloudconvert');
          scope.setTag('error_type', 'job_create_failed');
          scope.setLevel('error');
          scope.setContext('job_create_error', {
            code: error.code,
            status: error.httpStatus,
            message: error.message,
            taskSummary,
            timestamp: new Date().toISOString()
          });
          Sentry.captureException(error);
        });

        throw error;
      }
      
      // Unexpected error - wrap with context
      console.error('[CloudConvert] Unexpected job creation error', { error, taskSummary });
      throw new CloudConvertError(
        'JOB_CREATE_FAILED', 
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        undefined, undefined, undefined, 'error', false
      );
    }
    
    // TICKET: Enhanced job validation with detailed response debugging
    if (!job || typeof job !== 'object') {
      console.error('[CloudConvert] Invalid job response - not an object', { 
        job, 
        jobType: typeof job,
        taskSummary 
      });
      
      Sentry.withScope(scope => {
        scope.setTag('service', 'cloudconvert');
        scope.setTag('error_type', 'invalid_job_response');
        scope.setLevel('error');
        scope.setContext('invalid_response', {
          job,
          jobType: typeof job,
          taskSummary,
          timestamp: new Date().toISOString()
        });
        Sentry.captureMessage('CloudConvert returned non-object job response', 'error');
      });
      
      throw new CloudConvertError('JOB_CREATE_FAILED', `CloudConvert job creation returned invalid response - expected object, got ${typeof job}`, undefined, undefined, undefined, 'error', false);
    }

    if (!job.id) {
      console.error('[CloudConvert] Invalid job response - missing job.id', { 
        job, 
        jobKeys: Object.keys(job || {}),
        hasData: !!job.data,
        taskSummary 
      });
      
      Sentry.withScope(scope => {
        scope.setTag('service', 'cloudconvert');
        scope.setTag('error_type', 'missing_job_id');
        scope.setLevel('error');
        scope.setContext('invalid_response', {
          job,
          jobKeys: Object.keys(job || {}),
          taskSummary,
          timestamp: new Date().toISOString()
        });
        Sentry.captureMessage('CloudConvert returned job response without id field', 'error');
      });
      
      // Check if this is actually an error response masquerading as a job
      if (job.error || job.message || job.errors) {
        const errorMessage = job.message || job.error || JSON.stringify(job.errors || job);
        throw new CloudConvertError('JOB_CREATE_FAILED', `CloudConvert job creation failed: ${errorMessage}`, undefined, undefined, undefined, 'error', false);
      }
      
      throw new CloudConvertError('JOB_CREATE_FAILED', `CloudConvert job creation returned response without job.id field. Response keys: [${Object.keys(job).join(', ')}]`, undefined, undefined, undefined, 'error', false);
    }

    return job;
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
    // Defensive programming: ensure tasks array exists
    const tasks = Array.isArray(job.tasks) ? job.tasks : [];
    if (tasks.length === 0) {
      throw new CloudConvertError('NO_TASKS_FOUND', 'Job has no tasks available for upload');
    }

    const uploadPromises = inputs.map(async (input, index) => {
      const inputTask = tasks.find(t => t.name === `input_${index}`);
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

        // TICKET 7: Record retry metric
        metricsService.recordRetry('cloudconvert', 'attachment', attempt, {
          errorReason: error instanceof Error ? error.message : 'Unknown error'
        });
        
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
    // Defensive programming: ensure tasks array exists
    const tasks = Array.isArray(job.tasks) ? job.tasks : [];
    const exportTasks = tasks.filter(t => t.operation === 'export/url' && t.status === 'finished');
    
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

/**
 * TICKET: CloudConvert healthcheck at startup
 * Verifies API key and scopes before attempting any conversions
 */
// TICKET: Enhanced healthcheck to track service health state
let globalCloudConvertService: CloudConvertService | null = null;

export async function cloudConvertHealthcheck(): Promise<void> {
  const key = process.env.CLOUDCONVERT_API_KEY;
  if (!key) {
    console.error('[CloudConvert] CLOUDCONVERT_API_KEY missing');
    // Set global flag to skip conversions but keep ingestion running
    (globalThis as any).__CC_DISABLED__ = true;
    throw new Error('CLOUDCONVERT_API_KEY missing');
  }

  try {
    // TICKET: Use /jobs endpoint to test the API key and permissions
    const response = await fetch('https://api.cloudconvert.com/v2/jobs?per_page=1', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      const status = response.status;
      
      console.error('[CloudConvert] healthcheck FAILED', { status, data: errorData });
      
      // Set global flag to skip conversions but keep ingestion running
      (globalThis as any).__CC_DISABLED__ = true;
      
      // Mark service as unhealthy
      if (globalCloudConvertService) {
        globalCloudConvertService.setHealthy(false);
      }
      
      throw new Error(`CloudConvert healthcheck failed (status=${status}): ${errorData}`);
    }

    const jobData = await response.json() as any;
    const jobCount = Array.isArray(jobData.data) ? jobData.data.length : 0;
    console.log(`[CloudConvert] healthcheck OK user=${jobCount} jobs accessible`);
    
    // Clear disabled flag and mark service as healthy
    (globalThis as any).__CC_DISABLED__ = false;
    if (globalCloudConvertService) {
      globalCloudConvertService.setHealthy(true);
    }
    
  } catch (error) {
    const status = (error as any)?.status || (error as any)?.response?.status;
    const data = (error as any)?.response?.data;
    console.error('[CloudConvert] healthcheck FAILED', { status, data });
    
    // Set global flag to skip conversions but keep ingestion running
    (globalThis as any).__CC_DISABLED__ = true;
    
    // Mark service as unhealthy
    if (globalCloudConvertService) {
      globalCloudConvertService.setHealthy(false);
    }

    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error(`CloudConvert healthcheck failed: ${String(error)}`);
  }
}



/**
 * TICKET: Helper function to extract job ID from various SDK response shapes
 */
function getJobId(job: any): string | undefined {
  if (!job || typeof job !== 'object') return undefined;
  return job.id || job?.data?.id; // tolerate SDK/transport variations
}

/**
 * TICKET: Enhanced job creation following ticket specifications
 */
export async function createCcHtmlJob(html: string) {
  if ((globalThis as any).__CC_DISABLED__) {
    throw new CloudConvertError('CC_DISABLED', 'CloudConvert is disabled due to failed healthcheck');
  }
  const key = process.env.CLOUDCONVERT_API_KEY;
  if (!key) throw new CloudConvertError('CONFIG_MISSING_KEY', 'CLOUDCONVERT_API_KEY missing');

  const CHROME_VERSION = process.env.CC_CHROME_ENGINE_VERSION || '';
  const convertPdfTask: any = {
    operation: 'convert',
    input: 'import_html',
    input_format: 'html',
    output_format: 'pdf',
    engine: 'chrome',
    pdf: { page_size: 'A4', margin: '12mm', print_background: true }
  };
  if (CHROME_VERSION) {
    convertPdfTask.engine_version = CHROME_VERSION;
  }

  const tasks = {
    import_html: { operation: 'import/raw', content: html, filename: 'body.html' },
    convert_pdf: convertPdfTask,
    export_url: { operation: 'export/url', input: 'convert_pdf' }
  };

  let job: any;
  try {
    job = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tasks })
    }).then(response => {
      if (!response.ok) {
        return response.text().then(errorData => {
          const status = response.status;
          let data: any = {};
          
          try {
            data = JSON.parse(errorData);
          } catch (e) {
            // Keep as string if not valid JSON
          }

          console.error('[CloudConvert] jobs.create error', { status, data, tasks: Object.keys(tasks) });
          throw new CloudConvertError('JOB_CREATE_FAILED', `Job creation failed (${status}: ${data?.message || errorData})`, undefined, undefined, status, 'error', false);
        });
      }
      return response.json();
    });
  } catch (e: any) {
    const status = e?.status || e?.response?.status;
    const data = e?.response?.data;
    console.error('[CloudConvert] jobs.create error', { status, data, tasks: Object.keys(tasks) });
    throw new CloudConvertError('JOB_CREATE_FAILED', `Job creation error: ${e.message}`, undefined, undefined, status, 'error', false);
  }

  const jobId = getJobId(job);
  if (!jobId) {
    console.error('[CloudConvert] jobs.create invalid response', {
      typeofJob: typeof job, hasId: !!job?.id, hasDataId: !!job?.data?.id, sample: JSON.stringify(job || {})
    });
    throw new CloudConvertError('JOB_CREATE_FAILED', 'Invalid response - missing job.id', undefined, undefined, undefined, 'error', false);
  }

  return { job, jobId };
}

/**
 * TICKET: Wait and download with defensive error handling (updated to match ticket specs)
 */
export async function waitAndDownloadFirstPdf(cc: any, jobId: string): Promise<Buffer> {
  const key = process.env.CLOUDCONVERT_API_KEY;
  if (!key) {
    throw new CloudConvertConfigError('CLOUDCONVERT_API_KEY missing');
  }

  // Wait for job completion
  let job: any;
  const maxWaitTime = 60000; // 60 seconds
  const pollInterval = 2000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new CloudConvertError('JOB_WAIT_FAILED', `Failed to check job status: ${response.status}`, jobId, undefined, response.status, 'error', false);
    }

    job = await response.json();
    
    if (job.status === 'finished') {
      break;
    } else if (job.status === 'error') {
      const tasks = Array.isArray(job?.tasks) ? job.tasks : [];
      const errorTasks = tasks.filter((t: any) => t.status === 'error');
      const errorMessages = errorTasks.map((t: any) => `${t.name}: ${t.message}`).join(', ');
      
      console.error('[CloudConvert] job failed', { jobId, errorMessages, tasks: tasks.map((t: any) => ({ name: t.name, status: t.status })) });
      throw new CloudConvertError('JOB_FAILED', `Job failed: ${errorMessages}`, jobId, undefined, undefined, 'error', false);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  if (!job || job.status !== 'finished') {
    throw new CloudConvertError('JOB_TIMEOUT', `Job did not complete within ${maxWaitTime}ms`, jobId, undefined, undefined, 'error', false);
  }

  // Find export task and download PDF
  const tasks = Array.isArray(job?.tasks) ? job.tasks : [];
  const exportTask = tasks.find((t: any) => t.operation === 'export/url' && t.status === 'finished');

  if (!exportTask?.result?.files?.[0]?.url) {
    console.error('[CloudConvert] export result missing', { 
      jobId, 
      tasks: tasks.map((t: any) => ({ 
        name: t.name, 
        operation: t.operation, 
        status: t.status 
      })) 
    });
    throw new CloudConvertError('EXPORT_RESULT_MISSING', 'Export task result missing', jobId, undefined, undefined, 'error', false);
  }

  const url = exportTask.result.files[0].url;
  const downloadResponse = await fetch(url);
  
  if (!downloadResponse.ok) {
    throw new CloudConvertError('DOWNLOAD_FAILED', `Failed to download PDF: ${downloadResponse.status}`, jobId, undefined, downloadResponse.status, 'error', false);
  }

  return Buffer.from(await downloadResponse.arrayBuffer());
}

/**
 * TICKET: Top-level conversion function as specified in ticket
 */
export async function convertEmailBodyHtmlToPdf(html: string): Promise<Buffer> {
  const { job, jobId } = await createCcHtmlJob(html);
  return waitAndDownloadFirstPdf(job, jobId);
}

/**
 * TICKET: Retry wrapper for 429/5xx with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>, 
  isRetryable: (e: any) => boolean, 
  max: number = 3
): Promise<T> {
  let attempt = 0;
  
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      
      if (attempt >= max || !isRetryable(error)) {
        throw error;
      }
      
      const backoff = Math.min(2000 * attempt, 8000);
      console.log(`[CloudConvert] Retry attempt ${attempt}/${max} after ${backoff}ms`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

/**
 * Helper to determine if error is retryable (429 or 5xx)
 */
export const isRetryableError = (error: any): boolean => {
  const status = error?.httpStatus ?? error?.status ?? error?.response?.status;
  return status === 429 || (status >= 500 && status <= 599);
};

// Healthcheck function is already exported above

// Create singleton instance
export const cloudConvertService = new CloudConvertService();