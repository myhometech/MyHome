/**
 * TICKET 8: Worker Health Check System
 * Provides comprehensive health monitoring for the Email Render Worker
 */

import type { EmailRenderWorker } from './emailRenderWorker';

export interface WorkerHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  worker: {
    initialized: boolean;
    queueStats?: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      concurrency: number;
    };
    browserPool?: {
      totalBrowsers: number;
      availableBrowsers: number;
      inUseBrowsers: number;
    };
    errors: string[];
  };
  metrics: {
    queueDepth: number;
    concurrencyInUse: number;
    alertsActive: string[];
  };
  config: {
    maxConcurrency: number;
    jobTimeoutMs: number;
    pageTimeoutMs: number;
    maxQueueDepthAlert: number;
  };
}

export class WorkerHealthChecker {
  private worker: EmailRenderWorker | null = null;
  private errors: string[] = [];
  private lastHealthCheck: WorkerHealthStatus | null = null;

  constructor(worker: EmailRenderWorker | null) {
    this.worker = worker;
  }

  updateWorker(worker: EmailRenderWorker | null): void {
    this.worker = worker;
    this.errors = [];
  }

  addError(error: string): void {
    this.errors.push(`[${new Date().toISOString()}] ${error}`);
    // Keep only last 10 errors
    if (this.errors.length > 10) {
      this.errors = this.errors.slice(-10);
    }
  }

  async getHealthStatus(): Promise<WorkerHealthStatus> {
    const timestamp = new Date().toISOString();
    
    // Base configuration
    const config = {
      maxConcurrency: parseInt(process.env.RENDER_MAX_CONCURRENCY || '2'),
      jobTimeoutMs: parseInt(process.env.RENDER_JOB_TIMEOUT_MS || '15000'),
      pageTimeoutMs: parseInt(process.env.RENDER_PAGE_TIMEOUT_MS || '8000'),
      maxQueueDepthAlert: parseInt(process.env.RENDER_MAX_QUEUE_DEPTH_ALERT || '500')
    };

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let queueStats;
    let browserPool;
    const alertsActive: string[] = [];

    try {
      if (!this.worker) {
        status = 'unhealthy';
        this.addError('Worker not initialized');
      } else {
        // Get queue statistics
        queueStats = await this.worker.getQueueStats();
        
        if (queueStats) {
          browserPool = queueStats.browserStats;

          // Check alert conditions
          if (queueStats.waiting > config.maxQueueDepthAlert) {
            alertsActive.push(`Queue depth ${queueStats.waiting} > ${config.maxQueueDepthAlert}`);
            status = 'degraded';
          }

          if (queueStats.failed > 10) {
            alertsActive.push(`High failure count: ${queueStats.failed}`);
            if (queueStats.failed > 50) {
              status = 'unhealthy';
            } else {
              status = 'degraded';
            }
          }

          if (queueStats.active >= config.maxConcurrency && queueStats.waiting > 100) {
            alertsActive.push('Worker at max capacity with high queue backlog');
            status = 'degraded';
          }
        }
      }
    } catch (error) {
      status = 'unhealthy';
      this.addError(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const healthStatus: WorkerHealthStatus = {
      status,
      timestamp,
      worker: {
        initialized: !!this.worker,
        queueStats,
        browserPool,
        errors: [...this.errors] // Copy to prevent mutation
      },
      metrics: {
        queueDepth: queueStats?.waiting || 0,
        concurrencyInUse: queueStats?.active || 0,
        alertsActive
      },
      config
    };

    this.lastHealthCheck = healthStatus;
    return healthStatus;
  }

  getLastHealthStatus(): WorkerHealthStatus | null {
    return this.lastHealthCheck;
  }

  clearErrors(): void {
    this.errors = [];
  }
}

// Global health checker instance
export let workerHealthChecker: WorkerHealthChecker | null = null;

export function initializeWorkerHealthChecker(worker: EmailRenderWorker | null): void {
  if (!workerHealthChecker) {
    workerHealthChecker = new WorkerHealthChecker(worker);
  } else {
    workerHealthChecker.updateWorker(worker);
  }
}