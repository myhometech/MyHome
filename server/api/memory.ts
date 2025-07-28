// Memory Management API Routes
import { Router } from 'express';
import { memoryManager } from '../memoryManager.js';
import { ocrQueue } from '../ocrQueue.js';
import { sessionCleanup } from '../sessionCleanup.js';

const router = Router();

// Force garbage collection (admin only)
router.post('/gc', async (req, res) => {
  try {
    const result = memoryManager.forceGC();
    res.json({
      success: true,
      message: result.success ? 'Garbage collection completed' : 'GC not available',
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'GC failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Emergency memory cleanup
router.post('/emergency-cleanup', async (req, res) => {
  try {
    memoryManager.emergencyCleanup();
    await sessionCleanup.emergencyCleanup();
    ocrQueue.clearQueue();
    
    res.json({
      success: true,
      message: 'Emergency cleanup initiated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Emergency cleanup failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get memory stats
router.get('/stats', (req, res) => {
  const memUsage = process.memoryUsage();
  const gcStats = memoryManager.getStats();
  const queueStats = ocrQueue.getStats();
  
  res.json({
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      heapPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      rss: memUsage.rss,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    },
    gc: gcStats,
    queue: queueStats,
    timestamp: new Date().toISOString()
  });
});

// Get OCR queue status
router.get('/ocr-queue', (req, res) => {
  const stats = ocrQueue.getStats();
  res.json(stats);
});

export default router;