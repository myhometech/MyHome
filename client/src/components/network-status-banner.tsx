import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Wifi, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NetworkStatusBanner() {
  const { isOnline, wasRecentlyOffline } = useNetworkStatus();

  // Show reconnected banner briefly after coming back online
  if (isOnline && wasRecentlyOffline) {
    return (
      <Alert className="rounded-none border-x-0 bg-green-50 border-green-200">
        <Wifi className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          Connection restored! You're back online.
        </AlertDescription>
      </Alert>
    );
  }

  if (!isOnline) {
    return (
      <Alert variant="destructive" className="rounded-none border-x-0">
        <WifiOff className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            You're currently offline. Documents may not load properly.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="ml-4 text-xs"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}