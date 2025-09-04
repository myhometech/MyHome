import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, RefreshCw, Database, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DataSummary {
  userId: string;
  insights: number;
  documents: number;
  categories: number;
  userCreatedCategories: any[];
  documentSample: any[];
  insightSample: any[];
}

export function TestDataReset() {
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDataSummary = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/test/user-data-summary', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load summary: ${response.status}`);
      }

      const data = await response.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const resetAllData = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test/reset-user-data', {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Reset failed: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      setSummary(null); // Clear summary after reset

      // Refresh page after successful reset
      setTimeout(() => {
        window.location.reload();
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadDataSummary();
  }, []);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Test Data Reset
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">
              ✅ Reset completed! Deleted {result.deleted.documents} documents, {result.deleted.insights} insights, 
              {result.deleted.categories} categories, and {result.deleted.files} files.
              Page will refresh in 3 seconds...
            </AlertDescription>
          </Alert>
        )}

        {summary && (
          <div className="space-y-3">
            <h4 className="font-medium">Current Data Summary:</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Documents:</strong> {summary.documents}
              </div>
              <div>
                <strong>Insights:</strong> {summary.insights}
              </div>
              <div>
                <strong>Categories:</strong> {summary.categories}
              </div>
              <div>
                <strong>User ID:</strong> {summary.userId.slice(0, 8)}...
              </div>
            </div>

            {summary.documentSample.length > 0 && (
              <div>
                <strong>Sample Documents:</strong>
                <ul className="text-sm text-gray-600 mt-1">
                  {summary.documentSample.map(doc => (
                    <li key={doc.id}>• {doc.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button 
            onClick={loadDataSummary} 
            variant="outline" 
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Summary
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isLoading || !summary}>
                <Trash2 className="h-4 w-4 mr-2" />
                Reset All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete ALL of your:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>{summary?.documents || 0} documents and their files</li>
                    <li>{summary?.insights || 0} insights</li>
                    <li>{summary?.categories || 0} user-created categories</li>
                    <li>All associated facts and metadata</li>
                  </ul>
                  <br />
                  <strong>This action cannot be undone.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetAllData} className="bg-red-600 hover:bg-red-700">
                  Yes, delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default TestDataReset;