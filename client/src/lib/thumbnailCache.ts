/**
 * THMB-4: In-memory LRU cache for signed thumbnail URLs with TTL
 */

export type ThumbnailVariant = 96 | 240 | 480;

interface CacheEntry {
  url: string;
  expiresAt: number;
  variant: ThumbnailVariant;
}

interface CacheKey {
  documentId: string;
  sourceHash: string;
  variant: ThumbnailVariant;
}

class ThumbnailCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 500; // Cache up to 500 thumbnail URLs
  private defaultTTL = 15 * 60 * 1000; // 15 minutes default TTL

  private getCacheKey({ documentId, sourceHash, variant }: CacheKey): string {
    return `${documentId}:${sourceHash}:${variant}`;
  }

  /**
   * Set a thumbnail URL in cache with TTL
   */
  set(key: CacheKey, url: string, ttlMs?: number): void {
    const cacheKey = this.getCacheKey(key);
    const expiresAt = Date.now() + (ttlMs || this.defaultTTL);
    
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(cacheKey, {
      url,
      expiresAt,
      variant: key.variant
    });

    console.log(`🗂️ [CACHE] Cached thumbnail: ${cacheKey} (expires in ${Math.round((ttlMs || this.defaultTTL) / 1000)}s)`);
  }

  /**
   * Get a thumbnail URL from cache
   */
  get(key: CacheKey): string | null {
    const cacheKey = this.getCacheKey(key);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      console.log(`⏰ [CACHE] Expired thumbnail: ${cacheKey}`);
      return null;
    }
    
    // Move to end (LRU behavior)
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, entry);
    
    console.log(`✅ [CACHE] Hit thumbnail: ${cacheKey}`);
    return entry.url;
  }

  /**
   * Check if a thumbnail URL exists in cache
   */
  has(key: CacheKey): boolean {
    return this.get(key) !== null;
  }

  /**
   * Remove a specific thumbnail from cache
   */
  delete(key: CacheKey): void {
    const cacheKey = this.getCacheKey(key);
    this.cache.delete(cacheKey);
  }

  /**
   * Remove all thumbnails for a document (all variants)
   */
  deleteDocument(documentId: string, sourceHash: string): void {
    const keysToDelete: string[] = [];
    const prefix = `${documentId}:${sourceHash}:`;
    
    // Convert Map keys to array for iteration
    Array.from(this.cache.keys()).forEach(key => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`🗑️ [CACHE] Deleted ${keysToDelete.length} thumbnails for document ${documentId}`);
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    // Convert Map entries to array for iteration
    Array.from(this.cache.entries()).forEach(([key, entry]) => {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`🧹 [CACHE] Cleaned up ${keysToDelete.length} expired thumbnails`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    console.log(`🗑️ [CACHE] Cleared all thumbnail cache entries`);
  }
}

// Global thumbnail cache instance
export const thumbnailCache = new ThumbnailCache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  thumbnailCache.cleanup();
}, 5 * 60 * 1000);