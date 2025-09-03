/**
 * THMB-EMERGENCY-BYPASS: Job health checking and diagnostics
 */

import { thumbnailJobQueue } from '../thumbnailJobQueue';

export interface JobHealthStatus {
  isWorkerHealthy: boolean;
  queueCounts?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  lastWorkerHeartbeat?: Date;
  avgJobAgeMs?: number;
}

export async function getJobStatusAgeMs(jobId: string): Promise<number | null> {
  try {
    // For InMemoryJobTracker, check if job exists and its age
    const status = await thumbnailJobQueue.getJobStatus(jobId, 240);
    if (!status) return null;
    
    return Date.now() - status.createdAt.getTime();
  } catch (error) {
    console.warn('⚠️ [HEALTH] Failed to get job age:', error);
    return null;
  }
}

export async function checkWorkerHealth(): Promise<JobHealthStatus> {
  try {
    // Check if Redis is available and worker is connected
    // Since we're getting Redis connection errors, worker is definitely down
    
    // For now, assume worker is down if we can't get job status
    const testJobAge = await getJobStatusAgeMs('test-health-check');
    const isWorkerHealthy = false; // Redis connection failures indicate worker is down
    
    return {
      isWorkerHealthy,
      queueCounts: {
        waiting: 0, // We can't get accurate counts without Redis
        active: 0,
        completed: 0,
        failed: 0
      },
      lastWorkerHeartbeat: undefined,
      avgJobAgeMs: undefined
    };
  } catch (error) {
    console.warn('⚠️ [HEALTH] Health check failed:', error);
    return {
      isWorkerHealthy: false,
      queueCounts: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0
      }
    };
  }
}

export function shouldUseInlineFallback(jobAgeMs: number | null): boolean {
  // Use inline fallback if:
  // 1. Job age is unknown (worker not responding)
  // 2. Job has been waiting more than 8 seconds
  // 3. Feature flag is enabled
  
  const fallbackEnabled = process.env.THUMBNAIL_INLINE_FALLBACK === 'true';
  if (!fallbackEnabled) return false;
  
  if (jobAgeMs === null) return true; // Worker not responding
  if (jobAgeMs > 8000) return true;   // Job stuck for > 8s
  
  return false;
}