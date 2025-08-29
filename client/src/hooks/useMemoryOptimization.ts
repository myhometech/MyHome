
import { useEffect, useRef, useCallback } from 'react';

export function useMemoryOptimization() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const intervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  // Initialize AbortController
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    
    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort();
      }
      
      // Clear all timeouts
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current.clear();
      
      // Clear all intervals
      intervalsRef.current.forEach(interval => clearInterval(interval));
      intervalsRef.current.clear();
    };
  }, []);

  // Memory-safe setTimeout
  const safeSetTimeout = useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(() => {
      if (!abortControllerRef.current?.signal.aborted) {
        callback();
      }
      timeoutsRef.current.delete(timeout);
    }, delay);
    
    timeoutsRef.current.add(timeout);
    return timeout;
  }, []);

  // Memory-safe setInterval
  const safeSetInterval = useCallback((callback: () => void, delay: number) => {
    const interval = setInterval(() => {
      if (!abortControllerRef.current?.signal.aborted) {
        callback();
      } else {
        clearInterval(interval);
        intervalsRef.current.delete(interval);
      }
    }, delay);
    
    intervalsRef.current.add(interval);
    return interval;
  }, []);

  // Get abort signal for fetch requests
  const getAbortSignal = useCallback(() => {
    return abortControllerRef.current?.signal;
  }, []);

  // Check if component is still mounted
  const isMounted = useCallback(() => {
    return !abortControllerRef.current?.signal.aborted;
  }, []);

  return {
    safeSetTimeout,
    safeSetInterval,
    getAbortSignal,
    isMounted
  };
}
