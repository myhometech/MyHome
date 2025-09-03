/**
 * THMB-4: React hook for thumbnail fetching with 200/202 handling and real-time updates
 * THMB-RATE-HOTFIX: Enhanced 429 resilience, request coalescing, and 202 backoff
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { thumbnailCache, type ThumbnailVariant } from '@/lib/thumbnailCache';

// THMB-FE-READONCE: Enhanced request deduplication with JSON-only responses to prevent double parsing
const inflight = new Map<string, Promise<any>>();

function sleep(ms: number): Promise<void> { 
  return new Promise(r => setTimeout(r, ms)); 
}

// THMB-AUTH-HOTFIX: Centralized auth headers helper
function getAuthHeaders(): Record<string, string> {
  // For session-based auth, we rely on cookies, but ensure proper headers
  return {
    'Accept': 'application/json',
    'Cache-Control': 'no-cache'
  };
}

// THMB-AUTH-HOTFIX: Session refresh helper (using auth/user endpoint)
async function refreshAuthIfNeeded(): Promise<boolean> {
  try {
    console.log('🔄 [AUTH] Attempting session refresh via /api/auth/user');
    const response = await fetch('/api/auth/user', {
      method: 'GET',
      credentials: 'include',
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      console.log('✅ [AUTH] Session refresh successful');
      return true;
    } else {
      console.warn('⚠️ [AUTH] Session refresh failed with status:', response.status);
      return false;
    }
  } catch (error) {
    console.warn('⚠️ [AUTH] Session refresh failed:', error);
    return false;
  }
}

async function fetchJSONWithBackoff(url: string, key: string, attempt = 1): Promise<any> {
  // THMB-FE-READONCE: De-dupe in-flight requests per key
  if (inflight.has(key)) {
    console.log(`🔄 [DEDUP] Returning existing request for ${key}`);
    return inflight.get(key)!;
  }
  
  const p = (async () => {
    // THMB-AUTH-HOTFIX: Enhanced auth debugging
    const headers = getAuthHeaders();
    console.log(`🔒 [AUTH] Sending request to ${url} with headers:`, Object.keys(headers));
    
    const res = await fetch(url, { 
      headers,
      credentials: 'include'
    });
    
    // Log response details for debugging
    console.log(`📡 [FETCH] ${url} → ${res.status} ${res.statusText}`);
    if (res.status === 401) {
      console.warn(`🚫 [AUTH] 401 detected on ${url} - checking auth state`);
    }
    
    // Happy path: JSON 200/202
    const ctype = res.headers.get('content-type')?.toLowerCase() || '';
    const isJson = ctype.includes('application/json');

    if (res.status === 200 || res.status === 202) {
      if (!isJson) {
        // Defensive: if server ever returns non-JSON here, try to decode once from a clone for diagnostics
        const preview = await res.clone().text().catch(() => '');
        throw new Error(`NON_JSON_${res.status}: ${ctype} ${preview.slice(0, 120)}`);
      }
      return res.json(); // parsed exactly once
    }

    // THMB-AUTH-HOTFIX: Handle 401 with token refresh (single retry)
    if (res.status === 401 && attempt === 1) {
      console.log(`🔄 [AUTH] 401 detected, attempting refresh for ${key}`);
      const refreshed = await refreshAuthIfNeeded();
      if (refreshed) {
        console.log(`✅ [AUTH] Refresh successful, retrying ${key}`);
        return fetchJSONWithBackoff(url, key, attempt + 1);
      } else {
        console.warn(`❌ [AUTH] Refresh failed for ${key}`);
        throw new Error('NOT_AUTHENTICATED');
      }
    }

    // Residual 429 handling (should be rare after edge/proxy fixes)
    if (res.status === 429) {
      if (attempt >= 5) {
        return { status: 'queued', retryAfterMs: 1500 }; // degrade gracefully as JSON
      }
      const ra = res.headers.get('retry-after');
      const retryAfterMs = ra && /^\d+$/.test(ra) ? Number(ra) * 1000 : 1500;
      const base = Math.min(8000, 2 ** attempt * 300) + Math.floor(Math.random() * 200);
      await sleep(Math.max(retryAfterMs, base));
      return fetchJSONWithBackoff(url, key, attempt + 1);
    }

    // Handle 401 on retry attempt (auth refresh failed or still unauthorized)
    if (res.status === 401) {
      throw new Error('NOT_AUTHENTICATED');
    }

    // Other errors: attempt to parse JSON once; if not JSON, read a clone for message
    if (isJson) {
      const err = await res.json().catch(() => ({}));
      const code = err?.errorCode || `HTTP_${res.status}`;
      throw new Error(code);
    } else {
      const preview = await res.clone().text().catch(() => '');
      throw new Error(`HTTP_${res.status}_NON_JSON ${preview.slice(0, 120)}`);
    }
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

export interface ThumbnailState {
  status: 'idle' | 'ready' | 'queued' | 'failed';
  urls?: Partial<Record<ThumbnailVariant, string>>;
  errorCode?: string;
  isPolling?: boolean;
}

interface ThumbnailResponse {
  status: 'ready' | 'queued';
  documentId: number;
  variant: number;
  url?: string;
  ttlSeconds?: number;
  jobId?: string;
  retryAfterMs?: number;
}

interface ThumbnailErrorResponse {
  errorCode: string; // THMB-API-STD: Standardized error field
  message: string;
  code?: string; // Legacy fallback
}

const POLL_INTERVALS = [1000, 2000, 4000, 8000]; // 1s → 2s → 4s → 8s
const MAX_POLL_DURATION = 30000; // Stop polling after 30 seconds

/**
 * Custom hook for fetching and managing thumbnail state
 */
export function useThumbnail(documentId: string, sourceHash: string) {
  const [state, setState] = useState<ThumbnailState>({ status: 'idle' });
  const pollTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // Cache key helpers
  const getCacheKey = useCallback((variant: ThumbnailVariant) => ({
    documentId,
    sourceHash,
    variant
  }), [documentId, sourceHash]);

  // Cleanup function
  const cleanup = useCallback(() => {
    pollTimeoutsRef.current.forEach(clearTimeout);
    pollTimeoutsRef.current = [];
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Telemetry helpers
  const logTelemetry = useCallback((event: string, data: any) => {
    console.log(`📊 [TELEMETRY] ${event}:`, {
      documentId,
      sourceHash,
      timestamp: new Date().toISOString(),
      ...data
    });
    // TODO: Send to analytics service
  }, [documentId, sourceHash]);

  // THMB-RATE-HOTFIX: Fetch a specific variant with improved handling
  const fetchVariant = useCallback(async (variant: ThumbnailVariant): Promise<string | null> => {
    if (!mountedRef.current) return null;

    // Check cache first
    const cached = thumbnailCache.get(getCacheKey(variant));
    if (cached) {
      console.log(`💾 [CACHE] Using cached thumbnail for doc ${documentId}, variant ${variant}`);
      return cached;
    }

    const startTime = Date.now();
    logTelemetry('thumbnail.view.requested', { variant });

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // THMB-EDGE-UNBLOCK: Use edge proxy to avoid upstream 429s
      const key = `${documentId}:${sourceHash}:${variant}`;
      const data = await fetchJSONWithBackoff(
        `/edge/thumbnail?id=${documentId}&variant=${variant}`,
        key
      );

      const latencyMs = Date.now() - startTime;

      if (data.status === 'ready' && data.url) {
        // Cache the URL with provided TTL
        const ttlMs = (data.ttlSeconds || 15 * 60) * 1000; // Default 15 minutes
        thumbnailCache.set(getCacheKey(variant), data.url, ttlMs);
        
        logTelemetry('thumbnail.view.ready', { variant, latencyMs });
        return data.url;
      } 
      else if (data.status === 'queued') {
        // THMB-RATE-HOTFIX: Start polling with server-provided retry guidance
        const retryAfterMs = data.retryAfterMs || 1500;
        console.log(`📋 [QUEUE] Starting poll for ${key} with ${retryAfterMs}ms initial delay`);
        startPolling(variant, retryAfterMs, data.jobId);
        return null;
      }

      return null;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return null; // Ignore aborted requests
      }
      
      console.error(`❌ [THUMBNAIL] Failed to fetch variant ${variant} for document ${documentId}:`, error);
      throw error;
    }
  }, [documentId, sourceHash, getCacheKey, logTelemetry]);

  // THMB-RATE-HOTFIX: Single poller per document - start with 240px then fetch others when ready  
  const startPolling = useCallback((variant: ThumbnailVariant, initialDelay: number, jobId?: string) => {
    if (!mountedRef.current) return;
    
    pollStartTimeRef.current = Date.now();
    let attemptIndex = 0;

    // THMB-RATE-HOTFIX: Start with initial delay from server (retryAfterMs)
    const initialTimeoutId = setTimeout(() => {
      poll();
    }, initialDelay);
    pollTimeoutsRef.current.push(initialTimeoutId);

    const poll = () => {
      if (!mountedRef.current) return;
      
      // Check if we've exceeded max poll duration
      if (Date.now() - pollStartTimeRef.current > MAX_POLL_DURATION) {
        logTelemetry('thumbnail.view.timeout', { variant, jobId, attempts: attemptIndex });
        if (mountedRef.current) {
          setState(prev => ({ ...prev, isPolling: false }));
        }
        return;
      }

      // Update polling state
      setState(prev => ({ ...prev, isPolling: true, status: 'queued' }));

      fetchVariant(variant)
        .then(url => {
          if (!mountedRef.current) return;
          
          if (url) {
            // Success! Update state with the URL
            logTelemetry('thumbnail.view.completed', { variant, attempts: attemptIndex, jobId });
            setState(prev => ({
              ...prev,
              status: 'ready',
              urls: { ...prev.urls, [variant]: url },
              isPolling: false
            }));
          } else {
            // Still not ready, schedule next poll with progressive intervals
            const delay = POLL_INTERVALS[Math.min(attemptIndex, POLL_INTERVALS.length - 1)];
            const nextTimeoutId = setTimeout(poll, delay);
            pollTimeoutsRef.current.push(nextTimeoutId);
            attemptIndex++;
          }
        })
        .catch(error => {
          if (!mountedRef.current) return;
          
          // THMB-RATE-HOTFIX: More graceful error handling
          console.error(`❌ [THUMBNAIL] Polling failed for variant ${variant}:`, error);
          
          // Don't fail immediately on rate limit or network errors, retry a few times
          if ((error.message?.includes('HTTP_429') || error.message?.includes('NetworkError')) && attemptIndex < 3) {
            const retryDelay = 2000 + (attemptIndex * 1000); // 2s, 3s, 4s
            console.log(`⏳ [THUMBNAIL] Retrying poll in ${retryDelay}ms due to: ${error.message}`);
            const retryTimeoutId = setTimeout(poll, retryDelay);
            pollTimeoutsRef.current.push(retryTimeoutId);
            attemptIndex++;
          } else {
            setState(prev => ({
              ...prev,
              status: 'failed',
              errorCode: error.message,
              isPolling: false
            }));
          }
        });
    };
  }, [fetchVariant, logTelemetry]);

  // Main fetch function
  const fetchThumbnails = useCallback(async () => {
    if (!mountedRef.current) return;
    
    cleanup(); // Clear any existing requests
    
    setState({ status: 'idle' });

    try {
      // Try to fetch 240px first (primary variant for cards)
      const url240 = await fetchVariant(240);
      
      if (!mountedRef.current) return;

      if (url240) {
        setState(prev => ({
          ...prev,
          status: 'ready',
          urls: { ...prev.urls, 240: url240 }
        }));

        // Opportunistically fetch other variants in background
        [96, 480].forEach(async (variant) => {
          try {
            const url = await fetchVariant(variant as ThumbnailVariant);
            if (url && mountedRef.current) {
              setState(prev => ({
                ...prev,
                urls: { ...prev.urls, [variant]: url }
              }));
            }
          } catch (error) {
            // Ignore errors for opportunistic fetches
            console.warn(`⚠️ [THUMBNAIL] Opportunistic fetch failed for ${variant}px:`, error);
          }
        });
      } else {
        // 240px not ready, will be polling
        setState(prev => ({ ...prev, status: 'queued' }));
      }

    } catch (error: any) {
      if (!mountedRef.current) return;
      
      setState({
        status: 'failed',
        errorCode: error.message
      });
    }
  }, [fetchVariant, cleanup]);

  // Handle real-time thumbnail.created events
  const handleThumbnailCreated = useCallback((event: any) => {
    if (!mountedRef.current) return;
    
    // Check if this event is for our document
    if (event.documentId !== parseInt(documentId) || event.sourceHash !== sourceHash) {
      return;
    }

    console.log(`📢 [THUMBNAIL] Real-time update for document ${documentId}`);

    // Cancel any ongoing polls
    cleanup();

    // Update state with new URLs from event
    if (event.variants) {
      const urls: Partial<Record<ThumbnailVariant, string>> = {};
      
      // Cache the URLs from the event
      Object.entries(event.variants).forEach(([variant, url]) => {
        const v = parseInt(variant) as ThumbnailVariant;
        if ([96, 240, 480].includes(v) && typeof url === 'string') {
          urls[v] = url;
          thumbnailCache.set(getCacheKey(v), url, 15 * 60 * 1000); // Cache for 15 minutes
        }
      });

      setState(prev => ({
        ...prev,
        status: 'ready',
        urls: { ...prev.urls, ...urls },
        isPolling: false
      }));

      logTelemetry('ai_thumbnail_impression', { 
        variants: Object.keys(urls),
        realTimeUpdate: true 
      });
    } else {
      // No URLs in event, refetch the primary variant
      fetchVariant(240).then(url => {
        if (url && mountedRef.current) {
          setState(prev => ({
            ...prev,
            status: 'ready',
            urls: { ...prev.urls, 240: url },
            isPolling: false
          }));
        }
      });
    }
  }, [documentId, sourceHash, cleanup, getCacheKey, logTelemetry, fetchVariant]);

  // Initialize
  useEffect(() => {
    mountedRef.current = true;
    fetchThumbnails();
    
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [fetchThumbnails, cleanup]);

  // Handle image load errors (e.g., expired signed URLs)
  const handleImageError = useCallback((variant: ThumbnailVariant) => {
    console.log(`🔄 [THUMBNAIL] Image error for ${variant}px, refetching URL`);
    
    // Remove from cache and refetch
    thumbnailCache.delete(getCacheKey(variant));
    
    fetchVariant(variant).then(url => {
      if (url && mountedRef.current) {
        setState(prev => ({
          ...prev,
          urls: { ...prev.urls, [variant]: url }
        }));
      }
    }).catch(error => {
      console.error(`❌ [THUMBNAIL] Failed to recover from image error:`, error);
    });
  }, [getCacheKey, fetchVariant]);

  // Refresh thumbnails manually
  const refresh = useCallback(() => {
    // Clear cache for this document
    thumbnailCache.deleteDocument(documentId, sourceHash);
    fetchThumbnails();
  }, [documentId, sourceHash, fetchThumbnails]);

  return {
    ...state,
    refresh,
    handleImageError,
    handleThumbnailCreated
  };
}