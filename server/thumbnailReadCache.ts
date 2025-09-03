/**
 * THMB-UNBLOCK: Server-side LRU cache for signed thumbnail URLs
 * Prevents duplicate GCS hits when multiple components request same thumbnail
 */

interface CachedThumbnail {
  url: string;
  exp: number;
}

// Simple in-memory LRU cache (use Redis in production with multiple instances)
const cache = new Map<string, CachedThumbnail>();
const accessOrder = new Map<string, number>();
let counter = 0;
const MAX_SIZE = 10000;
const DEFAULT_TTL_SEC = 15 * 60; // 15 minutes

function evictOldest() {
  if (cache.size <= MAX_SIZE) return;
  
  let oldestKey = '';
  let oldestAccess = Infinity;
  
  for (const [key, access] of Array.from(accessOrder.entries())) {
    if (access < oldestAccess) {
      oldestAccess = access;
      oldestKey = key;
    }
  }
  
  if (oldestKey) {
    cache.delete(oldestKey);
    accessOrder.delete(oldestKey);
    console.log(`🧹 [CACHE] Evicted oldest thumbnail cache entry: ${oldestKey}`);
  }
}

export function getCached(docId: string, hash: string, variant: number): { url: string; ttlSeconds: number } | null {
  const key = `${docId}:${hash}:${variant}`;
  const cached = cache.get(key);
  
  if (!cached) {
    return null;
  }
  
  // Check if expired
  const now = Date.now();
  if (now >= cached.exp) {
    cache.delete(key);
    accessOrder.delete(key);
    console.log(`⏰ [CACHE] Expired thumbnail cache entry: ${key}`);
    return null;
  }
  
  // Update access order
  accessOrder.set(key, ++counter);
  
  const ttlSeconds = Math.max(60, Math.floor((cached.exp - now) / 1000));
  console.log(`💾 [CACHE] Hit for ${key}, TTL: ${ttlSeconds}s`);
  
  return { url: cached.url, ttlSeconds };
}

export function setCached(docId: string, hash: string, variant: number, url: string, ttlSec: number = DEFAULT_TTL_SEC): void {
  const key = `${docId}:${hash}:${variant}`;
  const exp = Date.now() + ttlSec * 1000;
  
  cache.set(key, { url, exp });
  accessOrder.set(key, ++counter);
  
  evictOldest();
  
  console.log(`💾 [CACHE] Cached ${key} for ${ttlSec}s`);
}

export function getStats() {
  const now = Date.now();
  const valid = Array.from(cache.entries()).filter(([_, cached]) => now < cached.exp).length;
  
  return {
    total: cache.size,
    valid,
    expired: cache.size - valid
  };
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, cached] of Array.from(cache.entries())) {
    if (now >= cached.exp) {
      cache.delete(key);
      accessOrder.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 [CACHE] Cleaned ${cleaned} expired thumbnail cache entries`);
  }
}, 5 * 60 * 1000);