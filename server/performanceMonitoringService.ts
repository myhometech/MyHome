/**
 * Performance Monitoring Service
 * Tracks database query performance and system metrics
 */

interface QueryMetric {
  query: string;
  executionTime: number;
  resultCount?: number;
  userId?: string;
  endpoint: string;
  timestamp: Date;
  error?: string;
}

interface SystemMetric {
  metric: string;
  value: number;
  unit: string;
  timestamp: Date;
}

class PerformanceMonitoringService {
  private queryMetrics: QueryMetric[] = [];
  private systemMetrics: SystemMetric[] = [];
  private slowQueryThreshold = 1000; // 1 second
  private maxMetricsHistory = 10000;

  /**
   * Record database query performance
   */
  recordQuery(
    query: string,
    executionTime: number,
    endpoint: string,
    userId?: string,
    resultCount?: number,
    error?: string
  ): void {
    const metric: QueryMetric = {
      query: this.sanitizeQuery(query),
      executionTime,
      resultCount,
      userId,
      endpoint,
      timestamp: new Date(),
      error,
    };

    this.queryMetrics.push(metric);

    // Log slow queries
    if (executionTime > this.slowQueryThreshold) {
      console.warn(`🐌 Slow query detected (${executionTime}ms):`, {
        endpoint,
        query: metric.query,
        userId,
        resultCount,
      });
    }

    // Log failed queries
    if (error) {
      console.error(`❌ Query failed (${executionTime}ms):`, {
        endpoint,
        query: metric.query,
        error,
        userId,
      });
    }

    // Trim metrics history
    if (this.queryMetrics.length > this.maxMetricsHistory) {
      this.queryMetrics = this.queryMetrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Record system performance metric
   */
  recordSystemMetric(metric: string, value: number, unit: string): void {
    this.systemMetrics.push({
      metric,
      value,
      unit,
      timestamp: new Date(),
    });

    // Trim metrics history
    if (this.systemMetrics.length > this.maxMetricsHistory) {
      this.systemMetrics = this.systemMetrics.slice(-this.maxMetricsHistory);
    }
    });

    // Trim system metrics
    if (this.systemMetrics.length > this.maxMetricsHistory) {
      this.systemMetrics = this.systemMetrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Get performance analytics
   */
  getPerformanceAnalytics(timeRangeHours: number = 24): {
    queryStats: {
      totalQueries: number;
      avgExecutionTime: number;
      slowQueries: number;
      failedQueries: number;
      queriesPerHour: number;
    };
    slowestQueries: Array<{
      query: string;
      executionTime: number;
      endpoint: string;
      timestamp: Date;
    }>;
    endpointStats: Array<{
      endpoint: string;
      count: number;
      avgTime: number;
      slowQueries: number;
    }>;
    systemStats: Array<{
      metric: string;
      avgValue: number;
      maxValue: number;
      unit: string;
    }>;
  } {
    const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
    
    const recentQueries = this.queryMetrics.filter(q => q.timestamp > cutoffTime);
    const recentSystemMetrics = this.systemMetrics.filter(m => m.timestamp > cutoffTime);

    // Query statistics
    const totalQueries = recentQueries.length;
    const avgExecutionTime = totalQueries > 0 
      ? Math.round(recentQueries.reduce((sum, q) => sum + q.executionTime, 0) / totalQueries)
      : 0;
    const slowQueries = recentQueries.filter(q => q.executionTime > this.slowQueryThreshold).length;
    const failedQueries = recentQueries.filter(q => q.error).length;
    const queriesPerHour = Math.round(totalQueries / timeRangeHours);

    // Slowest queries
    const slowestQueries = recentQueries
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, 10)
      .map(q => ({
        query: q.query,
        executionTime: q.executionTime,
        endpoint: q.endpoint,
        timestamp: q.timestamp,
      }));

    // Endpoint statistics
    const endpointGroups = new Map<string, QueryMetric[]>();
    recentQueries.forEach(q => {
      if (!endpointGroups.has(q.endpoint)) {
        endpointGroups.set(q.endpoint, []);
      }
      endpointGroups.get(q.endpoint)!.push(q);
    });

    const endpointStats = Array.from(endpointGroups.entries()).map(([endpoint, queries]) => ({
      endpoint,
      count: queries.length,
      avgTime: Math.round(queries.reduce((sum, q) => sum + q.executionTime, 0) / queries.length),
      slowQueries: queries.filter(q => q.executionTime > this.slowQueryThreshold).length,
    })).sort((a, b) => b.avgTime - a.avgTime);

    // System statistics
    const systemGroups = new Map<string, SystemMetric[]>();
    recentSystemMetrics.forEach(m => {
      if (!systemGroups.has(m.metric)) {
        systemGroups.set(m.metric, []);
      }
      systemGroups.get(m.metric)!.push(m);
    });

    const systemStats = Array.from(systemGroups.entries()).map(([metric, values]) => ({
      metric,
      avgValue: Math.round(values.reduce((sum, v) => sum + v.value, 0) / values.length * 100) / 100,
      maxValue: Math.max(...values.map(v => v.value)),
      unit: values[0].unit,
    }));

    return {
      queryStats: {
        totalQueries,
        avgExecutionTime,
        slowQueries,
        failedQueries,
        queriesPerHour,
      },
      slowestQueries,
      endpointStats,
      systemStats,
    };
  }

  /**
   * Get query recommendations based on performance data
   */
  getOptimizationRecommendations(): Array<{
    type: 'slow_query' | 'frequent_query' | 'missing_index' | 'high_error_rate';
    priority: 'high' | 'medium' | 'low';
    description: string;
    query?: string;
    endpoint?: string;
  }> {
    const recommendations = [];
    const recentQueries = this.queryMetrics.filter(
      q => q.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    // Identify slow queries
    const slowQueries = recentQueries.filter(q => q.executionTime > this.slowQueryThreshold);
    if (slowQueries.length > 10) {
      recommendations.push({
        type: 'slow_query' as const,
        priority: 'high' as const,
        description: `${slowQueries.length} slow queries detected (>1s). Consider adding database indexes.`,
      });
    }

    // Identify frequent queries
    const queryGroups = new Map<string, QueryMetric[]>();
    recentQueries.forEach(q => {
      const key = q.endpoint + '|' + q.query.substring(0, 50);
      if (!queryGroups.has(key)) {
        queryGroups.set(key, []);
      }
      queryGroups.get(key)!.push(q);
    });

    queryGroups.forEach((queries, key) => {
      if (queries.length > 100) {
        const avgTime = queries.reduce((sum, q) => sum + q.executionTime, 0) / queries.length;
        if (avgTime > 500) {
          recommendations.push({
            type: 'frequent_query' as const,
            priority: 'medium' as const,
            description: `Frequent slow query detected: ${queries.length} calls averaging ${Math.round(avgTime)}ms`,
            query: queries[0].query,
            endpoint: queries[0].endpoint,
          });
        }
      }
    });

    // Check for high error rates
    const failedQueries = recentQueries.filter(q => q.error);
    const errorRate = failedQueries.length / recentQueries.length * 100;
    if (errorRate > 5) {
      recommendations.push({
        type: 'high_error_rate' as const,
        priority: 'high' as const,
        description: `High query error rate detected: ${errorRate.toFixed(1)}% of queries failing`,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   */
  private sanitizeQuery(query: string): string {
    return query
      .replace(/VALUES\s*\([^)]*\)/gi, 'VALUES (...)')
      .replace(/'\w+@\w+\.\w+'/g, "'***@***.***'")
      .replace(/password[^,\s)]+/gi, 'password***')
      .substring(0, 200);
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(olderThanHours: number = 168): void { // 7 days default
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    this.queryMetrics = this.queryMetrics.filter(q => q.timestamp > cutoffTime);
    this.systemMetrics = this.systemMetrics.filter(m => m.timestamp > cutoffTime);
    
    console.log(`Cleared metrics older than ${olderThanHours} hours`);
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(): void {
    // Clear old metrics every 6 hours
    setInterval(() => {
      this.clearOldMetrics();
    }, 6 * 60 * 60 * 1000);
  }

  /**
   * Clear old metrics based on age
   */
  private clearOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    this.queryMetrics = this.queryMetrics.filter(
      metric => metric.timestamp > cutoffTime
    );
    
    this.systemMetrics = this.systemMetrics.filter(
      metric => metric.timestamp > cutoffTime
    );
  }
}

export const performanceMonitoringService = new PerformanceMonitoringService();

// Start periodic cleanup
performanceMonitoringService.startPeriodicCleanup();up();