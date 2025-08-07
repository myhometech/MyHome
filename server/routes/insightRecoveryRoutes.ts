/**
 * Insight Recovery Routes
 * API endpoints for recovering failed insight jobs
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import InsightRecoveryService from '../services/insightRecoveryService';

const router = Router();

/**
 * POST /api/admin/insights/recover
 * Recover failed insight jobs from the past 7 days
 */
router.post('/recover', requireAuth, async (req: any, res) => {
  try {
    console.log('🔄 [INSIGHT_RECOVERY] Manual recovery initiated by user:', req.user?.id);
    
    const result = await InsightRecoveryService.recoverFailedInsightJobs();
    
    console.log('✅ [INSIGHT_RECOVERY] Recovery completed:', result.summary);
    
    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [INSIGHT_TYPE_ERROR] Recovery endpoint failed:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown recovery error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/admin/insights/recovery-report
 * Generate and return a recovery report
 */
router.get('/recovery-report', requireAuth, async (req: any, res) => {
  try {
    console.log('📄 [INSIGHT_RECOVERY] Recovery report requested by user:', req.user?.id);
    
    const report = await InsightRecoveryService.createRecoveryReport();
    
    res.json({
      success: true,
      report,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [INSIGHT_TYPE_ERROR] Recovery report failed:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate recovery report',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;