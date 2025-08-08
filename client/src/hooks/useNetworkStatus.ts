import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastOfflineTime, setLastOfflineTime] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      // Network restored - no logging in production
      setIsOnline(true);
    };

    const handleOffline = () => {
      // Network lost - no logging in production
      setIsOnline(false);
      setLastOfflineTime(new Date());
    };

    // Test actual connectivity to our API
    const testConnectivity = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch('/api/auth/user', {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok && response.status !== 401) {
          // 401 is expected if not logged in, but means server is reachable
          throw new Error(`Server responded with ${response.status}`);
        }

        if (!isOnline) {
          // API connectivity confirmed
          setIsOnline(true);
        }
      } catch (error) {
        // API connectivity test failed
        if (isOnline) {
          setIsOnline(false);
          setLastOfflineTime(new Date());
        }
      }
    };

    // Test connectivity every 30 seconds
    const connectivityInterval = setInterval(testConnectivity, 30000);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(connectivityInterval);
    };
  }, [isOnline]);

  return {
    isOnline,
    lastOfflineTime,
    wasRecentlyOffline: lastOfflineTime && Date.now() - lastOfflineTime.getTime() < 60000
  };
}