/**
 * THMB-4: React hook for thumbnail fetching with 200/202 handling and real-time updates
 * THMB-RATE-HOTFIX: Enhanced 429 resilience, request coalescing, and 202 backoff
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { thumbnailCache, type ThumbnailVariant } from '@/lib/thumbnailCache';

// THMB-RATE-HOTFIX: Enhanced request deduplication and 202/429 handling
const inflight: Map<string, Promise<Response>> = new Map();

function sleep(ms: number): Promise<void> { 
  return new Promise(r => setTimeout(r, ms)); 
}

async function fetchWithBackoff(url: string, key: string, attempt = 1): Promise<Response> {
  // THMB-RATE-HOTFIX: De-dupe in-flight requests per key
  if (inflight.has(key)) {
    console.log(`🔄 [DEDUP] Returning existing request for ${key}`);
    return inflight.get(key)!;
  }
  
  const p = (async (): Promise<Response> => {
    const res = await fetch(url, { 
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    
    // THMB-RATE-HOTFIX: Handle 202 (queued) gracefully - no retry needed
    if (res.status === 202) {
      console.log(`📋 [QUEUE] Request queued for ${key}, server will process`);
      return res;
    }
    
    // THMB-RATE-HOTFIX: Handle any residual 429s (should be rare now)
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 1500;
      const maxAttempts = 6;

      if (attempt >= maxAttempts) {
        console.warn(`🚫 [RATE-LIMIT] Max retries exceeded for ${key}`);
        return res;
      }

      // Exponential backoff with jitter, respect Retry-After
      const base = Math.min(16000, 2 ** attempt * 250);
      const jitter = Math.floor(Math.random() * 250);
      const wait = Math.max(retryAfterMs, base + jitter);
      
      console.log(`⏳ [RATE-LIMIT] Retrying ${key} after ${wait}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(wait);
      return fetchWithBackoff(url, key, attempt + 1);
    }
    
    return res;
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
      const response = await fetchWithBackoff(
        `/edge/thumbnail?id=${documentId}&variant=${variant}`,
        key
      );

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          const errorData: ThumbnailErrorResponse = await response.json().catch(() => ({}));
          // THMB-API-STD: Use standardized errorCode field, fallback to legacy code
          const errorCode = errorData.errorCode || errorData.code || `HTTP_${response.status}`;
          logTelemetry('thumbnail.view.failed', { 
            variant, 
            status: response.status, 
            errorCode,
            latencyMs 
          });
          throw new Error(errorCode);
        }
        throw new Error(`HTTP_${response.status}`);
      }

      const data: ThumbnailResponse = await response.json();

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