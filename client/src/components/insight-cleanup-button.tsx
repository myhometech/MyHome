
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, CheckCircle, AlertTriangle } from 'lucide-react';

export function InsightCleanupButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runCleanup = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/documents/cleanup-orphaned-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for session auth
      });

      if (!response.ok) {
        throw new Error(`Cleanup failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
      
      // Refresh the page to see updated insights
      if (data.cleaned > 0) {
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={runCleanup}
        disabled={isLoading}
        variant="outline"
        className="flex items-center gap-2"
      >
        <Trash2 className="h-4 w-4" />
        {isLoading ? 'Cleaning up...' : 'Clean Up Orphaned Insights'}
      </Button>

      {result && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Found {result.orphanedFound} orphaned insights, cleaned up {result.cleaned}.
            {result.cleaned > 0 && ' Page will refresh in 2 seconds.'}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Error: {error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
