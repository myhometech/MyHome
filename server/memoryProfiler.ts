/**
 * Advanced Memory Profiler for MyHome GCS Infrastructure
 * Comprehensive memory analysis and leak detection
 */

import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
  heapPercent: number;
}

interface ObjectRetention {
  type: string;
  count: number;
  size: number;
  samples: any[];
}

interface GCMetrics {
  forced: number;
  natural: number;
  lastRun: number;
  averageFrequency: number;
}

export class MemoryProfiler {
  private snapshots: MemorySnapshot[] = [];
  private gcMetrics: GCMetrics = {
    forced: 0,
    natural: 0,
    lastRun: Date.now(),
    averageFrequency: 0
  };
  private retainedObjects = new Map<string, ObjectRetention>();
  private isEnabled = process.env.MEMORY_PROFILING === 'true';

  constructor() {
    // Only enable in development or when explicitly requested
    const isValidEnv = process.env.NODE_ENV === 'development' || 
                      process.env.MEMORY_PROFILING === 'true';
    
    if (this.isEnabled && isValidEnv) {
      this.startProfiling();
      console.log('🔍 Memory profiler enabled');
    } else if (this.isEnabled && !isValidEnv) {
      console.warn('⚠️ Memory profiling disabled in production for performance');
      this.isEnabled = false;
    }
  }

  /**
   * Start continuous memory profiling
   */
  private startProfiling(): void {
    // Take snapshots every 10 seconds
    setInterval(() => {
      this.takeSnapshot();
    }, 10000);

    // Monitor GC activity
    if (global.gc) {
      const originalGC = global.gc;
      global.gc = async () => {
        const start = performance.now();
        this.gcMetrics.forced++;
        originalGC();
        const duration = performance.now() - start;
        this.gcMetrics.lastRun = Date.now();
        console.log(`🧹 Forced GC completed in ${duration.toFixed(2)}ms`);
        this.takeSnapshot();
      };
    }

    // Monitor process warnings for memory leaks
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning' || 
          warning.message.includes('memory')) {
        console.warn('⚠️ Memory-related warning detected:', warning.message);
        this.takeSnapshot();
      }
    });
  }

  /**
   * Take memory snapshot
   */
  takeSnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
      heapPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100
    };

    this.snapshots.push(snapshot);
    
    // Keep only last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots.shift();
    }

    // Alert on critical memory usage
    if (snapshot.heapPercent > 90) {
      console.error(`🚨 CRITICAL MEMORY: ${snapshot.heapPercent.toFixed(1)}% heap usage`);
      this.analyzeRetention();
    }

    return snapshot;
  }

  /**
   * Analyze object retention patterns
   */
  private analyzeRetention(): void {
    // Basic retention analysis without v8 profiler
    const keys = Object.keys(global).length;
    const processKeys = Object.keys(process).length;
    
    console.log(`📊 Object retention analysis:`);
    console.log(`   Global objects: ${keys}`);
    console.log(`   Process objects: ${processKeys}`);
    
    // Check for common leak patterns
    this.checkCommonLeaks();
  }

  /**
   * Check for common memory leak patterns
   */
  private checkCommonLeaks(): void {
    const leaks: string[] = [];

    // Check event listeners
    const eventListenerCount = process.listenerCount ? 
      Object.keys(process.eventNames()).length : 0;
    if (eventListenerCount > 50) {
      leaks.push(`High event listener count: ${eventListenerCount}`);
    }

    // Check timers (estimated)
    const activeHandles = (process as any)._getActiveHandles?.()?.length || 0;
    if (activeHandles > 100) {
      leaks.push(`High active handles: ${activeHandles}`);
    }

    if (leaks.length > 0) {
      console.warn('⚠️ Potential memory leaks detected:');
      leaks.forEach(leak => console.warn(`   ${leak}`));
    }
  }

  /**
   * Analyze memory growth trends
   */
  getMemoryTrends(): {
    trend: 'increasing' | 'stable' | 'decreasing';
    averageGrowth: number;
    peakUsage: number;
    gcEfficiency: number;
  } {
    if (this.snapshots.length < 10) {
      return {
        trend: 'stable',
        averageGrowth: 0,
        peakUsage: 0,
        gcEfficiency: 0
      };
    }

    const recent = this.snapshots.slice(-10);
    const growthRates = recent.slice(1).map((snapshot, i) => 
      snapshot.heapUsed - recent[i].heapUsed
    );

    const averageGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
    const peakUsage = Math.max(...this.snapshots.map(s => s.heapPercent));
    
    // Calculate GC efficiency
    const beforeGC = this.snapshots.filter((_, i) => 
      i < this.snapshots.length - 1 && 
      this.snapshots[i + 1].heapUsed < this.snapshots[i].heapUsed
    );
    const gcEfficiency = beforeGC.length > 0 ? 
      beforeGC.reduce((acc, s, i) => {
        const afterGC = this.snapshots[this.snapshots.indexOf(s) + 1];
        return acc + ((s.heapUsed - afterGC.heapUsed) / s.heapUsed);
      }, 0) / beforeGC.length : 0;

    return {
      trend: averageGrowth > 1024 * 1024 ? 'increasing' : 
             averageGrowth < -1024 * 1024 ? 'decreasing' : 'stable',
      averageGrowth: averageGrowth / (1024 * 1024), // MB per snapshot
      peakUsage,
      gcEfficiency: gcEfficiency * 100
    };
  }

  /**
   * Generate comprehensive memory report
   */
  generateReport(): string {
    const current = this.takeSnapshot();
    const trends = this.getMemoryTrends();
    
    const report = `
# Memory Profiling Report - ${new Date().toISOString()}

## Current Memory Usage
- Heap Used: ${(current.heapUsed / 1024 / 1024).toFixed(2)} MB (${current.heapPercent.toFixed(1)}%)
- Heap Total: ${(current.heapTotal / 1024 / 1024).toFixed(2)} MB
- RSS: ${(current.rss / 1024 / 1024).toFixed(2)} MB
- External: ${(current.external / 1024 / 1024).toFixed(2)} MB
- Array Buffers: ${(current.arrayBuffers / 1024 / 1024).toFixed(2)} MB

## Memory Trends
- Trend: ${trends.trend}
- Average Growth: ${trends.averageGrowth.toFixed(2)} MB per 10s
- Peak Usage: ${trends.peakUsage.toFixed(1)}%
- GC Efficiency: ${trends.gcEfficiency.toFixed(1)}%

## Garbage Collection
- Forced GC Runs: ${this.gcMetrics.forced}
- Last GC: ${new Date(this.gcMetrics.lastRun).toLocaleTimeString()}

## Recommendations
${this.getRecommendations(current, trends)}
`;

    return report;
  }

  /**
   * Get memory optimization recommendations
   */
  private getRecommendations(current: MemorySnapshot, trends: any): string {
    const recommendations: string[] = [];

    if (current.heapPercent > 90) {
      recommendations.push('🚨 CRITICAL: Immediate garbage collection needed');
      recommendations.push('- Force GC with global.gc() if available');
      recommendations.push('- Check for retained file buffers and streams');
    }

    if (trends.trend === 'increasing') {
      recommendations.push('📈 Memory growth detected');
      recommendations.push('- Review file upload handling for buffer retention');
      recommendations.push('- Check GCS client connection pooling');
      recommendations.push('- Analyze OCR processing memory usage');
    }

    if (current.arrayBuffers > 50 * 1024 * 1024) {
      recommendations.push('🗂️ High ArrayBuffer usage detected');
      recommendations.push('- Check file upload buffer management');
      recommendations.push('- Ensure proper stream cleanup after GCS operations');
    }

    if (trends.gcEfficiency < 20) {
      recommendations.push('♻️ Low GC efficiency');
      recommendations.push('- Objects may be retained by closures or event listeners');
      recommendations.push('- Check for circular references in upload handlers');
    }

    return recommendations.length > 0 ? 
      recommendations.join('\n') : 
      '✅ Memory usage appears normal';
  }

  /**
   * Force emergency memory cleanup
   */
  emergencyCleanup(): void {
    console.log('🚨 Starting emergency memory cleanup...');
    
    // Force garbage collection if available
    if (typeof global.gc === 'function') {
      global.gc();
      console.log('✅ Forced garbage collection');
    }

    // Clear snapshots except recent ones
    if (this.snapshots.length > 20) {
      this.snapshots = this.snapshots.slice(-20);
      console.log('✅ Cleared old memory snapshots');
    }

    // Clear retained objects map
    this.retainedObjects.clear();
    console.log('✅ Cleared retained objects tracking');

    const afterCleanup = this.takeSnapshot();
    console.log(`🧹 Cleanup complete: ${afterCleanup.heapPercent.toFixed(1)}% heap usage`);
  }
}

export const memoryProfiler = new MemoryProfiler();