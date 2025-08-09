import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastOfflineTime, setLastOfflineTime] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network connection restored');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('🚫 Network connection lost');
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
          console.log('🌐 API connectivity confirmed, updating network status');
          setIsOnline(true);
        }
      } catch (error) {
        console.log('🚫 API connectivity test failed:', error);
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