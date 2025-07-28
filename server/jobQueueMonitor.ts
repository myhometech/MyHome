// Job Queue Monitor for TICKET 17 - Background Job Status
import express from 'express';

interface QueueStatus {
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

/**
 * TICKET 17: Monitor job queue status for admin dashboard
 */
export async function setupJobQueueMonitoring(app: express.Application): Promise<void> {
  
  // Admin endpoint for job queue monitoring
  app.get('/api/admin/job-queues', async (req, res) => {
    try {
      const { ocrQueue } = await import('./ocrQueue');
      const { insightJobQueue } = await import('./insightJobQueue');
      
      const memUsage = process.memoryUsage();
      
      const status: QueueStatus = {
        ocrQueue: ocrQueue.getStats(),
        insightQueue: insightJobQueue.getStats(),
        memoryUsage: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          heapPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        }
      };
      
      res.json(status);
    } catch (error) {
      console.error('Failed to get job queue status:', error);
      res.status(500).json({ message: 'Failed to get job queue status' });
    }
  });

  // Endpoint to get detailed insight queue status
  app.get('/api/admin/insight-queue-details', async (req, res) => {
    try {
      const { insightJobQueue } = await import('./insightJobQueue');
      const status = insightJobQueue.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Failed to get insight queue details:', error);
      res.status(500).json({ message: 'Failed to get insight queue details' });
    }
  });

  console.log('📊 Job queue monitoring endpoints initialized');
}