/**
 * THMB-RATE-HOTFIX: Thumbnail request coalescing to prevent duplicate work
 * Ensures only one job per {documentId, sourceHash} is enqueued at a time
 */

// In-memory coalescing for Replit (use Redis SETNX in production)
const inProgress = new Set<string>();

/**
 * Mark a document key as being processed if it's not already in progress
 * @param key Format: `${documentId}:${sourceHash}`
 * @returns true if successfully marked (not in progress), false if already processing
 */
export function markIfFree(key: string): boolean {
  if (inProgress.has(key)) {
    console.log(`🔄 [COALESCE] Key ${key} already in progress, skipping enqueue`);
    return false;
  }
  
  inProgress.add(key);
  console.log(`✅ [COALESCE] Marked ${key} as in progress`);
  return true;
}

/**
 * Clear the in-progress mark for a document key
 * @param key Format: `${documentId}:${sourceHash}`
 */
export function clearMark(key: string): void {
  const deleted = inProgress.delete(key);
  if (deleted) {
    console.log(`🧹 [COALESCE] Cleared ${key} from in-progress set`);
  }
}

/**
 * Check if a key is currently being processed
 * @param key Format: `${documentId}:${sourceHash}`
 */
export function isInProgress(key: string): boolean {
  return inProgress.has(key);
}

/**
 * Get current stats for monitoring
 */
export function getStats() {
  return {
    inProgressCount: inProgress.size,
    keys: Array.from(inProgress)
  };
}