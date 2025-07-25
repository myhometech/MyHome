import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export function NetworkStatusBanner() {
  const { isOnline, isSlowConnection } = useNetworkStatus();
  const [showOffline, setShowOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowOffline(true);
      setWasOffline(true);
    } else if (wasOffline && isOnline) {
      // Show reconnection message briefly
      setTimeout(() => setShowOffline(false), 3000);
    }
  }, [isOnline, wasOffline]);

  if (!showOffline && isOnline && !isSlowConnection) {
    return null;
  }

  return (
    <div className={`
      fixed top-0 left-0 right-0 z-[100] transition-transform duration-300 transform
      ${showOffline ? 'translate-y-0' : '-translate-y-full'}
    `}>
      <div className={`
        px-4 py-2 text-sm font-medium text-center
        ${!isOnline 
          ? 'bg-red-600 text-white' 
          : wasOffline 
          ? 'bg-green-600 text-white'
          : 'bg-yellow-600 text-white'
        }
      `}>
        <div className="flex items-center justify-center gap-2">
          {!isOnline ? (
            <>
              <WifiOff className="w-4 h-4" />
              <span>You're offline. Some features may not work properly.</span>
            </>
          ) : wasOffline ? (
            <>
              <Wifi className="w-4 h-4" />
              <span>You're back online!</span>
            </>
          ) : isSlowConnection ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Slow connection detected. Please be patient.</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}