/**
 * THMB-RATE-HOTFIX: User-scoped soft rate limiting with token bucket
 * Prevents individual users from overwhelming the thumbnail system
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();
const CAPACITY = 10;        // Max tokens per user
const REFILL_PER_SEC = 2;   // Tokens refilled per second

/**
 * Check if a user is allowed to make a thumbnail request
 * @param userId The user ID
 * @returns true if request is allowed, false if rate limited
 */
export function allow(userId: string): boolean {
  const now = Date.now();
  
  // Get or create bucket for user
  let bucket = buckets.get(userId);
  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: now };
    buckets.set(userId, bucket);
  }
  
  // Refill tokens based on time elapsed
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(elapsed / 1000) * REFILL_PER_SEC;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
  
  // Check if user has tokens available
  if (bucket.tokens <= 0) {
    console.log(`🚫 [RATE-LIMIT] User ${userId} exceeded rate limit (${bucket.tokens} tokens)`);
    return false;
  }
  
  // Consume a token
  bucket.tokens--;
  buckets.set(userId, bucket);
  
  console.log(`✅ [RATE-LIMIT] User ${userId} allowed (${bucket.tokens} tokens remaining)`);
  return true;
}

/**
 * Get current bucket stats for monitoring
 */
export function getStats() {
  return {
    userCount: buckets.size,
    users: Array.from(buckets.entries()).map(([userId, bucket]) => ({
      userId: userId.substring(0, 8) + '...',
      tokens: bucket.tokens,
      lastRefill: bucket.lastRefill
    }))
  };
}

/**
 * Clean up old buckets (run periodically)
 */
export function cleanup() {
  const now = Date.now();
  const OLD_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  let cleaned = 0;
  for (const [userId, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > OLD_THRESHOLD) {
      buckets.delete(userId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 [RATE-LIMIT] Cleaned up ${cleaned} old user buckets`);
  }
}

// Cleanup old buckets every 10 minutes
setInterval(cleanup, 10 * 60 * 1000);