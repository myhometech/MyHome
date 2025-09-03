/**
 * THMB-EMERGENCY-BYPASS: Health check and diagnostic endpoints
 */

import { Router } from 'express';
import { requireAuth } from '../simpleAuth';
import { checkWorkerHealth, getJobStatusAgeMs } from '../thumbnail/jobHealthCheck';
import { thumbnailJobQueue } from '../thumbnailJobQueue';

const router = Router();

/**
 * GET /healthz/worker - Worker health status
 */
router.get('/worker', async (req, res) => {
  try {
    const health = await checkWorkerHealth();
    
    const status = health.isWorkerHealthy ? 200 : 503;
    
    res.status(status).json({
      healthy: health.isWorkerHealthy,
      queue: health.queueCounts,
      lastHeartbeat: health.lastWorkerHeartbeat,
      avgJobAge: health.avgJobAgeMs,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * GET /internal/queue/summary - Detailed queue diagnostics
 * Requires authentication for security
 */
router.get('/summary', requireAuth, async (req: any, res: any) => {
  try {
    const health = await checkWorkerHealth();
    
    // Test job age check
    const testJobAge = await getJobStatusAgeMs('test-probe').catch(() => null);
    
    const summary = {
      workerHealthy: health.isWorkerHealthy,
      queue: health.queueCounts || { waiting: 0, active: 0, completed: 0, failed: 0 },
      testJobAge: testJobAge,
      config: {
        inlineFallbackEnabled: process.env.THUMBNAIL_INLINE_FALLBACK === 'true',
        redisHost: process.env.REDIS_HOST || '127.0.0.1',
        redisPort: process.env.REDIS_PORT || '6379'
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({
      error: 'Queue summary failed',
      message: error.message
    });
  }
});

export { router as healthRoutes };