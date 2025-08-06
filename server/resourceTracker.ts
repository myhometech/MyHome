import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

interface TrackedResource {
  id: string;
  type: 'file' | 'buffer' | 'worker' | 'stream';
  path?: string;
  size?: number;
  created: Date;
  cleanup?: () => Promise<void> | void;
}

export class ResourceTracker {
  private static instance: ResourceTracker;
  private resources: Map<string, TrackedResource> = new Map();
  private cleanupTasks: Set<() => Promise<void>> = new Set();

  private constructor() {
    // Register cleanup on process exit
    process.on('exit', () => this.syncCleanup());
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      console.error('🚨 Uncaught exception, cleaning up resources:', error);
      this.syncCleanup();
    });
  }

  public static getInstance(): ResourceTracker {
    if (!ResourceTracker.instance) {
      ResourceTracker.instance = new ResourceTracker();
    }
    return ResourceTracker.instance;
  }

  /**
   * Track a temporary file for cleanup
   */
  public trackFile(filePath: string, cleanup?: () => Promise<void>): string {
    const id = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.resources.set(id, {
      id,
      type: 'file',
      path: filePath,
      created: new Date(),
      cleanup: cleanup || (() => this.deleteFile(filePath))
    });
    return id;
  }

  /**
   * Track a memory buffer for cleanup
   */
  public trackBuffer(buffer: Buffer | any, cleanup?: () => void): string {
    const id = `buffer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.resources.set(id, {
      id,
      type: 'buffer',
      size: buffer?.length || 0,
      created: new Date(),
      cleanup: cleanup || (() => { 
        // Nullify buffer reference for GC
        if (buffer) {
          buffer = null;
        }
      })
    });
    return id;
  }

  /**
   * Track a worker or service for cleanup
   */
  public trackWorker(workerId: string, cleanup: () => Promise<void>): string {
    const id = `worker_${workerId}_${Date.now()}`;
    this.resources.set(id, {
      id,
      type: 'worker',
      created: new Date(),
      cleanup
    });
    return id;
  }

  /**
   * Release a specific tracked resource
   */
  public async releaseResource(id: string): Promise<void> {
    const resource = this.resources.get(id);
    if (!resource) return;

    try {
      if (resource.cleanup) {
        await resource.cleanup();
      }
      this.resources.delete(id);
      console.log(`🧹 Released ${resource.type} resource: ${id}`);
    } catch (error) {
      console.error(`❌ Failed to cleanup resource ${id}:`, error);
    }
  }

  /**
   * Release all resources of a specific type
   */
  public async releaseResourcesByType(type: TrackedResource['type']): Promise<void> {
    const resourcesOfType = Array.from(this.resources.values()).filter(r => r.type === type);
    
    await Promise.allSettled(
      resourcesOfType.map(resource => this.releaseResource(resource.id))
    );
  }

  /**
   * Force cleanup of old resources (older than specified age)
   */
  public async cleanupStaleResources(maxAgeMs: number = 30 * 60 * 1000): Promise<void> {
    const now = new Date();
    const staleResources = Array.from(this.resources.values()).filter(
      resource => now.getTime() - resource.created.getTime() > maxAgeMs
    );

    if (staleResources.length > 0) {
      console.log(`🧹 Cleaning up ${staleResources.length} stale resources...`);
      await Promise.allSettled(
        staleResources.map(resource => this.releaseResource(resource.id))
      );
    }
  }

  /**
   * Get current resource summary
   */
  public getResourceSummary(): { count: number; types: Record<string, number>; totalSize: number } {
    const types: Record<string, number> = {};
    let totalSize = 0;

    for (const resource of this.resources.values()) {
      types[resource.type] = (types[resource.type] || 0) + 1;
      totalSize += resource.size || 0;
    }

    return {
      count: this.resources.size,
      types,
      totalSize
    };
  }

  /**
   * Register a cleanup task to run on shutdown
   */
  public registerCleanupTask(task: () => Promise<void>): void {
    this.cleanupTasks.add(task);
  }

  /**
   * Delete a file safely
   */
  private async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      console.log(`🗑️ Deleted temporary file: ${filePath}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`⚠️ Could not delete file ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Graceful shutdown handler
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`🛑 Received ${signal}, cleaning up resources...`);
    
    try {
      // Run custom cleanup tasks
      await Promise.allSettled(
        Array.from(this.cleanupTasks).map(task => task())
      );

      // Cleanup all tracked resources
      await Promise.allSettled(
        Array.from(this.resources.keys()).map(id => this.releaseResource(id))
      );

      console.log('✅ Resource cleanup completed');
    } catch (error) {
      console.error('❌ Error during resource cleanup:', error);
    }

    process.exit(0);
  }

  /**
   * Synchronous cleanup for process exit
   */
  private syncCleanup(): void {
    console.log('🧹 Performing synchronous resource cleanup...');
    
    // Synchronous file cleanup only
    for (const resource of this.resources.values()) {
      if (resource.type === 'file' && resource.path) {
        try {
          const fs = require('fs');
          if (fs.existsSync(resource.path)) {
            fs.unlinkSync(resource.path);
            console.log(`🗑️ Sync deleted: ${resource.path}`);
          }
        } catch (error: any) {
          console.warn(`⚠️ Could not sync delete ${resource.path}:`, error.message);
        }
      }
    }
  }
}

// Create a global instance
export const resourceTracker = ResourceTracker.getInstance();

// Auto-cleanup stale resources every 5 minutes
setInterval(() => {
  resourceTracker.cleanupStaleResources().catch(error => 
    console.error('❌ Auto-cleanup failed:', error)
  );
}, 5 * 60 * 1000);