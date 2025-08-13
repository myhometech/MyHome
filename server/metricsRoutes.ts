/**
 * TICKET 7: Metrics Dashboard API Routes
 * 
 * Provides endpoints for observability dashboards to access conversion performance data,
 * error rates, and email processing summaries.
 */

import { Router } from 'express';
import { metricsService } from './metricsService.js';

export const metricsRouter = Router();

/**
 * TICKET 7: Get conversion performance statistics
 * Endpoint: GET /api/metrics/performance
 */
metricsRouter.get('/performance', (req, res) => {
  try {
    const stats = metricsService.getPerformanceStats();
    
    // Format for dashboard consumption
    const response = {
      overview: {
        total_conversions: stats.volumeStats.totalConversions,
        successful_conversions: stats.volumeStats.successfulConversions,
        total_retries: stats.volumeStats.totalRetries,
        overall_error_rate: Math.round(stats.errorRate.overall * 100) / 100
      },
      duration_metrics: {
        p50_duration_ms: Math.round(stats.duration.p50),
        p95_duration_ms: Math.round(stats.duration.p95),
        mean_duration_ms: Math.round(stats.duration.mean)
      },
      error_breakdown: {
        by_engine: stats.errorRate.byEngine,
        by_reason: stats.errorRate.byReason
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching performance metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch performance metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * TICKET 7: Get recent email conversion summaries
 * Endpoint: GET /api/metrics/email-summaries
 */
metricsRouter.get('/email-summaries', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const summaries = metricsService.getRecentEmailSummaries(limit);
    
    res.json({
      summaries,
      count: summaries.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching email summaries:', error);
    res.status(500).json({
      error: 'Failed to fetch email summaries',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * TICKET 7: Simple health check for metrics system
 * Endpoint: GET /api/metrics/health
 */
metricsRouter.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'metrics-observability',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime())
  });
});

/**
 * TICKET 7: Cleanup old metrics (maintenance endpoint)
 * Endpoint: POST /api/metrics/cleanup
 */
metricsRouter.post('/cleanup', (req, res) => {
  try {
    const olderThanHours = parseInt(req.body.olderThanHours as string) || 24;
    const olderThanMs = olderThanHours * 60 * 60 * 1000;
    
    metricsService.cleanup(olderThanMs);
    
    res.json({
      message: `Cleaned up metrics older than ${olderThanHours} hours`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error cleaning up metrics:', error);
    res.status(500).json({
      error: 'Failed to cleanup metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});