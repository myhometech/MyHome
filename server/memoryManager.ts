// Memory Management Service - Emergency Memory Optimization
import { performance } from 'perf_hooks';

interface GCStats {
  forced: number;
  automatic: number;
  lastRun: Date;
  heapBefore: number;
  heapAfter: number;
  reduction: number;
}

class MemoryManager {
  private gcStats: GCStats = {
    forced: 0,
    automatic: 0,
    lastRun: new Date(),
    heapBefore: 0,
    heapAfter: 0,
    reduction: 0
  };

  private gcInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startAutomaticGC();
  }

  // Force garbage collection with monitoring
  public forceGC(): { success: boolean; reduction: number; stats: any } {
    try {
      const before = process.memoryUsage();
      const heapBefore = before.heapUsed;
      
      if (global.gc) {
        console.log(`🗑️ FORCING GC: Heap at ${(heapBefore / 1024 / 1024).toFixed(1)}MB`);
        global.gc();
        
        const after = process.memoryUsage();
        const heapAfter = after.heapUsed;
        const reduction = heapBefore - heapAfter;
        
        this.gcStats.forced++;
        this.gcStats.lastRun = new Date();
        this.gcStats.heapBefore = heapBefore;
        this.gcStats.heapAfter = heapAfter;
        this.gcStats.reduction = reduction;
        
        console.log(`✅ GC COMPLETE: Freed ${(reduction / 1024 / 1024).toFixed(1)}MB, heap now ${(heapAfter / 1024 / 1024).toFixed(1)}MB`);
        
        return {
          success: true,
          reduction: reduction / 1024 / 1024,
          stats: {
            before: heapBefore / 1024 / 1024,
            after: heapAfter / 1024 / 1024,
            freed: reduction / 1024 / 1024
          }
        };
      } else {
        console.warn('⚠️ GC not exposed - start Node with --expose-gc flag');
        return { success: false, reduction: 0, stats: null };
      }
    } catch (error) {
      console.error('❌ GC failed:', error);
      return { success: false, reduction: 0, stats: null };
    }
  }

  // Start automatic GC every 5 minutes during high memory pressure
  private startAutomaticGC(): void {
    this.gcInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      // Force GC if heap usage > 90%
      if (heapPercent > 90) {
        console.log(`🚨 AUTO-GC TRIGGERED: Heap at ${heapPercent.toFixed(1)}%`);
        this.forceGC();
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  // Emergency cleanup for critical memory situations
  public emergencyCleanup(): void {
    console.log('🆘 EMERGENCY MEMORY CLEANUP INITIATED');
    
    // Force immediate garbage collection
    this.forceGC();
    
    // Clear any global caches if available
    if (global.gc) {
      // Run GC twice for thorough cleanup
      setTimeout(() => {
        console.log('🔄 Second GC pass...');
        this.forceGC();
      }, 1000);
    }
  }

  public getStats(): GCStats {
    return { ...this.gcStats };
  }

  public stop(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }
}

export const memoryManager = new MemoryManager();