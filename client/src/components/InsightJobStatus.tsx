// TICKET 17: Frontend component to show insight generation status
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface JobQueueStatus {
  ocrQueue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  insightQueue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    duplicatesSkipped: number;
  };
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    heapPercent: number;
  };
}

export function InsightJobStatus() {
  const { data: status, isLoading } = useQuery<JobQueueStatus>({
    queryKey: ['/api/admin/job-queues'],
    refetchInterval: 10000, // Refresh every 10 seconds
    retry: false
  });

  if (isLoading || !status) {
    return null;
  }

  const totalInsightJobs = status.insightQueue.pending + status.insightQueue.processing;
  
  if (totalInsightJobs === 0) {
    return null; // Hide when no jobs are processing
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Brain className="h-4 w-4 text-blue-500" />
          AI Insights Processing
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {status.insightQueue.processing > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{status.insightQueue.processing} generating</span>
            </div>
          )}
          
          {status.insightQueue.pending > 0 && (
            <div className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              <span>{status.insightQueue.pending} queued</span>
            </div>
          )}
          
          {status.insightQueue.completed > 0 && (
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>{status.insightQueue.completed} completed</span>
            </div>
          )}
        </div>
        
        <div className="mt-2">
          <Badge variant="secondary" className="text-xs">
            AI Insights will appear shortly after upload
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}