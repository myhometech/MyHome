import { useToast } from '@/hooks/use-toast';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryCondition?: (error: any) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryCondition: (error) => {
    // Retry on network errors and 5xx server errors
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }
};

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelay);
}

export async function apiRequestWithRetry<T = any>(
  url: string,
  options: RequestInit = {},
  retryConfig: Partial<RetryConfig> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new ApiError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData.code,
          response.status >= 500 && response.status < 600
        );
        
        throw error;
      }

      return await response.json();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on the last attempt or if error is not retryable
      if (attempt === config.maxRetries || !config.retryCondition!(error)) {
        break;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, config.baseDelay, config.maxDelay);
      console.warn(`API request failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms:`, error.message);
      
      await sleep(delay);
    }
  }

  throw lastError;
}

// Enhanced version of the existing apiRequest with better error handling
export async function enhancedApiRequest<T = any>(
  method: string,
  url: string,
  body?: any,
  options: RequestInit & { retryConfig?: Partial<RetryConfig> } = {}
): Promise<T> {
  const { retryConfig, ...fetchOptions } = options;
  
  const requestOptions: RequestInit = {
    method,
    ...fetchOptions,
  };

  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    requestOptions.body = JSON.stringify(body);
  }

  try {
    return await apiRequestWithRetry<T>(url, requestOptions, retryConfig);
  } catch (error: any) {
    // Transform error for better user experience
    if (error instanceof ApiError) {
      // Don't show technical details to users
      if (error.status === 401) {
        throw new Error('Please log in to continue');
      } else if (error.status === 403) {
        throw new Error('You don\'t have permission to perform this action');
      } else if (error.status === 404) {
        throw new Error('The requested resource was not found');
      } else if (error.status && error.status >= 500) {
        throw new Error('Server error. Please try again in a moment');
      }
    }
    
    // Network error
    if (!navigator.onLine) {
      throw new Error('You\'re offline. Please check your internet connection');
    }
    
    throw error;
  }
}

// Hook for API requests with integrated error handling and toast notifications
export function useApiRequest() {
  const { toast } = useToast();

  const request = async <T = any>(
    method: string,
    url: string,
    body?: any,
    options: {
      retryConfig?: Partial<RetryConfig>;
      showErrorToast?: boolean;
      showSuccessToast?: boolean;
      successMessage?: string;
    } = {}
  ): Promise<T> => {
    const { showErrorToast = true, showSuccessToast = false, successMessage, ...apiOptions } = options;

    try {
      const result = await enhancedApiRequest<T>(method, url, body, apiOptions);
      
      if (showSuccessToast) {
        toast({
          title: successMessage || 'Operation completed successfully',
          variant: 'default',
        });
      }
      
      return result;
    } catch (error: any) {
      if (showErrorToast) {
        toast({
          title: 'Error',
          description: error.message || 'An unexpected error occurred',
          variant: 'destructive',
        });
      }
      throw error;
    }
  };

  // Convenience methods
  return {
    request,
    get: <T = any>(url: string, options?: Parameters<typeof request>[3]) => 
      request<T>('GET', url, undefined, options),
    post: <T = any>(url: string, body?: any, options?: Parameters<typeof request>[3]) => 
      request<T>('POST', url, body, options),
    patch: <T = any>(url: string, body?: any, options?: Parameters<typeof request>[3]) => 
      request<T>('PATCH', url, body, options),
    delete: <T = any>(url: string, options?: Parameters<typeof request>[3]) => 
      request<T>('DELETE', url, undefined, options),
  };
}