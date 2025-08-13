/**
 * TICKET 7: Basic Observability & Metrics Service
 * 
 * Provides visibility into conversion performance without overhauling monitoring infrastructure.
 * Emits metrics for duration, success rates, error patterns, and retry counts.
 */

import * as Sentry from '@sentry/node';

// Metric types for structured logging and Sentry breadcrumbs
export type ConversionEngine = 'cloudconvert' | 'puppeteer';
export type ConversionType = 'body' | 'attachment';
export type ConversionErrorReason = 
  | 'configuration_error'
  | 'skipped_password_protected' 
  | 'skipped_unsupported'
  | 'skipped_too_large'
  | 'timeout'
  | 'network_error'
  | 'processing_error'
  | 'unknown';

export interface ConversionMetrics {
  // Duration metrics
  durationMs: number;
  engine: ConversionEngine;
  type: ConversionType;
  
  // Success/failure tracking
  success: boolean;
  errorReason?: ConversionErrorReason;
  
  // Additional context
  fileSize?: number;
  mimeType?: string;
  retryCount?: number;
  jobId?: string;
}

export interface EmailConversionSummary {
  emailId: string;
  from: string;
  subject: string;
  totalAttachments: number;
  originalsStored: number;
  pdfsProduced: number;
  conversionEngine: ConversionEngine;
  
  // Breakdown by outcome
  skippedCounts: {
    password_protected: number;
    unsupported: number;
    too_large: number;
    errors: number;
  };
  
  // Performance data
  totalDurationMs: number;
  averageDurationMs: number;
}

class MetricsService {
  private metrics: ConversionMetrics[] = [];
  private emailSummaries: EmailConversionSummary[] = [];
  
  /**
   * TICKET 7: Record conversion duration metric
   */
  recordDuration(
    durationMs: number, 
    engine: ConversionEngine, 
    type: ConversionType,
    additionalContext?: {
      fileSize?: number;
      mimeType?: string;
      jobId?: string;
    }
  ): void {
    const metric: ConversionMetrics = {
      durationMs,
      engine,
      type,
      success: true,
      ...additionalContext
    };
    
    this.metrics.push(metric);
    
    // Emit structured log for dashboard consumption
    console.log(`📊 METRIC pdf.convert.duration_ms{engine=${engine},type=${type}} ${durationMs}ms`, {
      metric: 'pdf.convert.duration_ms',
      value: durationMs,
      tags: { engine, type },
      context: additionalContext
    });
    
    // Add Sentry breadcrumb for observability
    Sentry.addBreadcrumb({
      category: 'conversion.duration',
      message: `${engine} ${type} conversion completed`,
      level: 'info',
      data: {
        durationMs,
        engine,
        type,
        ...additionalContext
      }
    });
  }
  
  /**
   * TICKET 7: Record successful conversion
   */
  recordSuccess(
    engine: ConversionEngine, 
    type: ConversionType,
    context?: {
      fileSize?: number;
      mimeType?: string;
      jobId?: string;
    }
  ): void {
    this.metrics.push({
      durationMs: 0, // Duration recorded separately
      engine,
      type,
      success: true,
      ...context
    });
    
    // Emit structured log
    console.log(`📊 METRIC pdf.convert.success_total{engine=${engine},type=${type}} +1`, {
      metric: 'pdf.convert.success_total',
      value: 1,
      tags: { engine, type },
      context
    });
    
    // Sentry breadcrumb
    Sentry.addBreadcrumb({
      category: 'conversion.success',
      message: `${engine} ${type} conversion successful`,
      level: 'info',
      data: { engine, type, ...context }
    });
  }
  
  /**
   * TICKET 7: Record conversion error
   */
  recordError(
    engine: ConversionEngine,
    type: ConversionType,
    reason: ConversionErrorReason,
    context?: {
      errorMessage?: string;
      fileSize?: number;
      mimeType?: string;
      jobId?: string;
    }
  ): void {
    this.metrics.push({
      durationMs: 0,
      engine,
      type,
      success: false,
      errorReason: reason,
      ...context
    });
    
    // Emit structured log
    console.log(`📊 METRIC pdf.convert.error_total{engine=${engine},type=${type},reason=${reason}} +1`, {
      metric: 'pdf.convert.error_total',
      value: 1,
      tags: { engine, type, reason },
      context
    });
    
    // Sentry breadcrumb
    Sentry.addBreadcrumb({
      category: 'conversion.error',
      message: `${engine} ${type} conversion failed: ${reason}`,
      level: 'warning',
      data: { engine, type, reason, ...context }
    });
  }
  
  /**
   * TICKET 7: Record retry attempt
   */
  recordRetry(
    engine: ConversionEngine,
    type: ConversionType,
    retryCount: number,
    context?: {
      errorReason?: string;
      jobId?: string;
    }
  ): void {
    // Emit structured log
    console.log(`📊 METRIC pdf.convert.retry_total{engine=${engine},type=${type}} +1`, {
      metric: 'pdf.convert.retry_total',
      value: 1,
      tags: { engine, type },
      context: { retryCount, ...context }
    });
    
    // Sentry breadcrumb
    Sentry.addBreadcrumb({
      category: 'conversion.retry',
      message: `${engine} ${type} conversion retry attempt ${retryCount}`,
      level: 'info',
      data: { engine, type, retryCount, ...context }
    });
  }
  
  /**
   * TICKET 7: Record complete email conversion summary
   */
  recordEmailSummary(summary: EmailConversionSummary): void {
    this.emailSummaries.push(summary);
    
    // Comprehensive email processing log
    console.log(`📧 EMAIL CONVERSION SUMMARY: ${summary.from} - "${summary.subject}"`, {
      emailId: summary.emailId,
      engine: summary.conversionEngine,
      attachmentStats: {
        total: summary.totalAttachments,
        originals_stored: summary.originalsStored,
        pdfs_produced: summary.pdfsProduced
      },
      skipped_breakdown: summary.skippedCounts,
      performance: {
        total_duration_ms: summary.totalDurationMs,
        average_duration_ms: summary.averageDurationMs
      }
    });
    
    // Sentry breadcrumb for email-level tracking
    Sentry.addBreadcrumb({
      category: 'email.conversion.summary',
      message: `Email processed: ${summary.pdfsProduced} PDFs from ${summary.totalAttachments} attachments`,
      level: 'info',
      data: summary
    });
  }
  
  /**
   * TICKET 7: Get performance statistics for dashboard
   */
  getPerformanceStats(): {
    duration: {
      p50: number;
      p95: number;
      mean: number;
    };
    errorRate: {
      overall: number;
      byEngine: Record<ConversionEngine, number>;
      byReason: Record<ConversionErrorReason, number>;
    };
    volumeStats: {
      totalConversions: number;
      successfulConversions: number;
      totalRetries: number;
    };
  } {
    const durations = this.metrics
      .filter(m => m.durationMs > 0)
      .map(m => m.durationMs)
      .sort((a, b) => a - b);
    
    const errors = this.metrics.filter(m => !m.success);
    const successes = this.metrics.filter(m => m.success);
    
    // Calculate percentiles
    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    
    // Error rate by engine
    const errorsByEngine: Record<string, number> = {};
    const totalByEngine: Record<string, number> = {};
    
    this.metrics.forEach(m => {
      totalByEngine[m.engine] = (totalByEngine[m.engine] || 0) + 1;
      if (!m.success) {
        errorsByEngine[m.engine] = (errorsByEngine[m.engine] || 0) + 1;
      }
    });
    
    // Error rate by reason
    const errorsByReason: Record<string, number> = {};
    errors.forEach(m => {
      if (m.errorReason) {
        errorsByReason[m.errorReason] = (errorsByReason[m.errorReason] || 0) + 1;
      }
    });
    
    return {
      duration: {
        p50: durations[p50Index] || 0,
        p95: durations[p95Index] || 0,
        mean: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
      },
      errorRate: {
        overall: this.metrics.length > 0 ? errors.length / this.metrics.length : 0,
        byEngine: Object.fromEntries(
          Object.entries(totalByEngine).map(([engine, total]) => [
            engine,
            total > 0 ? (errorsByEngine[engine] || 0) / total : 0
          ])
        ) as Record<ConversionEngine, number>,
        byReason: errorsByReason as Record<ConversionErrorReason, number>
      },
      volumeStats: {
        totalConversions: this.metrics.length,
        successfulConversions: successes.length,
        totalRetries: this.metrics.filter(m => m.retryCount && m.retryCount > 0).length
      }
    };
  }
  
  /**
   * TICKET 7: Get recent email summaries for dashboard
   */
  getRecentEmailSummaries(limit: number = 10): EmailConversionSummary[] {
    return this.emailSummaries.slice(-limit);
  }
  
  /**
   * TICKET 7: Clear old metrics (for memory management)
   */
  cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThanMs;
    // Note: In a real implementation, you'd track timestamps
    // For now, just keep the last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
    if (this.emailSummaries.length > 100) {
      this.emailSummaries = this.emailSummaries.slice(-100);
    }
  }
}

// Export singleton instance
export const metricsService = new MetricsService();

/**
 * TICKET 7: Utility function to measure and record conversion duration
 */
export async function measureConversion<T>(
  operation: () => Promise<T>,
  engine: ConversionEngine,
  type: ConversionType,
  context?: {
    fileSize?: number;
    mimeType?: string;
    jobId?: string;
  }
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    metricsService.recordDuration(duration, engine, type, context);
    metricsService.recordSuccess(engine, type, context);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Determine error reason from error type/message
    let reason: ConversionErrorReason = 'unknown';
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('password') || message.includes('encrypted')) {
        reason = 'skipped_password_protected';
      } else if (message.includes('unsupported') || message.includes('format')) {
        reason = 'skipped_unsupported';
      } else if (message.includes('too large') || message.includes('size')) {
        reason = 'skipped_too_large';
      } else if (message.includes('timeout')) {
        reason = 'timeout';
      } else if (message.includes('network') || message.includes('connection')) {
        reason = 'network_error';
      } else if (message.includes('config') || message.includes('auth')) {
        reason = 'configuration_error';
      } else {
        reason = 'processing_error';
      }
    }
    
    if (duration > 0) {
      metricsService.recordDuration(duration, engine, type, context);
    }
    metricsService.recordError(engine, type, reason, {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ...context
    });
    
    throw error;
  }
}