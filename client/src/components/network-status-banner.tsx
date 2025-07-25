import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Wifi, Signal } from 'lucide-react';

export function NetworkStatusBanner() {
  const { isOnline, connectionType, isSlowConnection } = useNetworkStatus();

  if (isOnline && !isSlowConnection) {
    return null; // Don't show banner when connection is good
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {!isOnline ? (
        <Alert className="border-0 rounded-none bg-red-600 text-white">
          <WifiOff className="h-4 w-4" />
          <AlertDescription className="text-white">
            You're offline. Some features may not work properly.
          </AlertDescription>
        </Alert>
      ) : isSlowConnection ? (
        <Alert className="border-0 rounded-none bg-yellow-600 text-white">
          <Signal className="h-4 w-4" />
          <AlertDescription className="text-white">
            Slow connection detected ({connectionType}). Some features may be limited.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}