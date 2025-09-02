import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface VehicleFetchError {
  type: 'auth' | 'forbidden' | 'server' | 'network' | 'timeout';
  code?: string;
  cid?: string;
  status?: number;
  message: string;
  details?: string;
}

export async function fetchVehicles(): Promise<any[]> {
  console.log('[VEHICLES] Starting fetch request to /api/vehicles');
  console.log('[VEHICLES] Network status:', {
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    url: window.location.href
  });
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    console.log('[VEHICLES] Making fetch request...');
    const res = await fetch('/api/vehicles', { 
      credentials: 'include',
      signal: controller.signal
    });
    
    console.log('[VEHICLES] Fetch response received:', {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries())
    });
    
    clearTimeout(timeoutId);
    
    if (res.status === 401) {
      throw { 
        type: 'auth', 
        status: 401,
        message: 'You need to sign in.' 
      } as VehicleFetchError;
    }
    
    if (res.status === 403) {
      throw { 
        type: 'forbidden', 
        status: 403,
        message: 'You lack access to Vehicles.' 
      } as VehicleFetchError;
    }
    
    if (!res.ok) {
      const errorData = await safeJson(res);
      throw { 
        type: 'server', 
        status: res.status,
        code: errorData.code, 
        cid: errorData.cid, 
        message: `Server error (${res.status}): ${errorData.message || 'Could not load vehicles.'}`,
        details: errorData.details || `HTTP ${res.status} ${res.statusText}`
      } as VehicleFetchError;
    }
    
    // Check if response is actually JSON
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await res.text();
      console.error('[VEHICLES] Non-JSON response received:', {
        contentType,
        status: res.status,
        responsePreview: responseText.substring(0, 200)
      });
      throw { 
        type: 'server', 
        status: res.status,
        message: `Server returned non-JSON response (${contentType})`,
        details: `Expected JSON but got: ${contentType}. Preview: ${responseText.substring(0, 200)}`
      } as VehicleFetchError;
    }
    
    let data;
    try {
      data = await res.json();
    } catch (jsonError) {
      console.error('[VEHICLES] JSON parsing failed:', jsonError);
      const responseText = await res.text();
      console.error('[VEHICLES] Raw response text:', responseText.substring(0, 500));
      throw { 
        type: 'server', 
        status: res.status,
        message: `Invalid JSON response from server`,
        details: `Response was not valid JSON. First 500 chars: ${responseText.substring(0, 500)}`
      } as VehicleFetchError;
    }
    
    return Array.isArray(data) ? data : [];
    
  } catch (error: any) {
    console.error('[VEHICLES] Fetch failed with error:', {
      name: error.name,
      message: error.message,
      type: error.type,
      stack: error.stack,
      online: navigator.onLine,
      currentUrl: window.location.href
    });
    
    // Handle network errors and timeouts
    if (error.name === 'AbortError') {
      throw { 
        type: 'timeout', 
        message: 'Request timed out. Please check your connection and try again.',
        details: 'The server took too long to respond'
      } as VehicleFetchError;
    }
    
    if (error.type) {
      // Already a VehicleFetchError, re-throw
      throw error;
    }
    
    // Enhanced network error detection
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('[VEHICLES] Network/CORS error detected');
      throw { 
        type: 'network', 
        message: 'Connection failed. The server may be unreachable or there may be a network issue.',
        details: `Fetch error: ${error.message}. Online: ${navigator.onLine}`
      } as VehicleFetchError;
    }
    
    // Network or other fetch errors
    throw { 
      type: 'network', 
      message: 'Network error. Please check your connection and try again.',
      details: error.message || 'Unknown network error'
    } as VehicleFetchError;
  }
}

async function safeJson(r: Response) { 
  try { 
    return await r.json(); 
  } catch { 
    return {}; 
  } 
}

export function useVehicles() {
  return useQuery({
    queryKey: ['/api/vehicles'],
    queryFn: fetchVehicles,
    retry: (failureCount, error: any) => {
      console.log('[VEHICLES] Fetch error:', { 
        failureCount, 
        errorType: error?.type, 
        status: error?.status,
        message: error?.message,
        cid: error?.cid 
      });
      
      // Don't retry auth errors
      if (error?.type === 'auth') return false;
      if (error?.type === 'forbidden') return false;
      if (error?.type === 'timeout') return failureCount < 1; // Only retry timeouts once
      return failureCount < 2;
    },
    onError: (error: any) => {
      console.error('[VEHICLES] Query failed:', error);
    }
  });
}