import { Router, Request, Response } from 'express';
import { llmUsageLogger } from '../llmUsageLogger.js';

const router = Router();

/**
 * Get LLM usage analytics for Admin Dashboard
 * @route GET /api/admin/llm-usage/analytics
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange as string || '7d';
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }
    
    const analytics = await llmUsageLogger.getUsageAnalytics(startDate, endDate);
    
    res.json({
      timeRange,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      analytics
    });
    
  } catch (error) {
    console.error('Error fetching LLM usage analytics:', error);
    res.status(500).json({ 
      message: 'Failed to fetch LLM usage analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get detailed LLM usage logs for Admin Dashboard
 * @route GET /api/admin/llm-usage/logs
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const provider = req.query.provider as string;
    const status = req.query.status as string;
    const userId = req.query.userId as string;
    
    const logs = await llmUsageLogger.getUsageLogs({
      page,
      limit,
      provider,
      status,
      userId
    });
    
    res.json(logs);
    
  } catch (error) {
    console.error('Error fetching LLM usage logs:', error);
    res.status(500).json({ 
      message: 'Failed to fetch LLM usage logs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get LLM usage summary for specific user
 * @route GET /api/admin/llm-usage/user/:userId
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const timeRange = req.query.timeRange as string || '30d';
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }
    
    const userUsage = await llmUsageLogger.getUserUsage(userId, startDate, endDate);
    
    res.json({
      userId,
      timeRange,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      usage: userUsage
    });
    
  } catch (error) {
    console.error('Error fetching user LLM usage:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user LLM usage',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as llmUsageRoutes };