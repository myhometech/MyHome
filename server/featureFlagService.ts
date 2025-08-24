import { eq, and, sql } from "drizzle-orm";
import { db } from "./db";
import { featureFlags, featureFlagOverrides, featureFlagEvents, type FeatureFlag, type InsertFeatureFlagEvent, type RolloutConfig } from "@shared/featureFlagSchema";
import { FEATURES } from "@shared/features";
import crypto from 'crypto';

interface FeatureFlagEvaluation {
  enabled: boolean;
  reason: 'tier_access' | 'override' | 'rollout_percentage' | 'disabled' | 'not_found';
  flagConfig?: FeatureFlag;
}

interface FeatureFlagContext {
  userId: string;
  userTier: 'free' | 'premium';
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
}

class FeatureFlagService {
  private flagCache: Map<string, FeatureFlag[]> = new Map();
  private overrideCache: Map<string, Map<string, boolean>> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute

  /**
   * Initialize database with current hardcoded feature flags
   */
  async initializeFeatureFlags(): Promise<void> {
    try {
      console.log('Initializing feature flags in database...');

      for (const [key, feature] of Object.entries(FEATURES)) {
        const existingFlag = await db
          .select()
          .from(featureFlags)
          .where(eq(featureFlags.name, key))
          .limit(1);

        if (existingFlag.length === 0) {
          await db.insert(featureFlags).values({
            name: key,
            description: feature.description,
            category: feature.category,
            tierRequired: feature.tier,
            enabled: true,
            rolloutStrategy: 'tier_based',
            rolloutPercentage: 100,
          });
          console.log(`Created feature flag: ${key}`);
        }
      }

      console.log('Feature flags initialization completed');
    } catch (error) {
      console.error('Failed to initialize feature flags:', error);
      throw error;
    }
  }

  /**
   * Evaluate if a feature is enabled for a user
   */
  async isFeatureEnabled(
    featureName: string, 
    context: FeatureFlagContext,
    logEvent: boolean = true
  ): Promise<boolean> {
    const evaluation = await this.evaluateFeature(featureName, context);

    if (logEvent) {
      await this.logFeatureEvent(featureName, context, evaluation);
    }

    return evaluation.enabled;
  }

  /**
   * Get all enabled features for a user (for batch evaluation)
   */
  async getAllEnabledFeatures(context: FeatureFlagContext): Promise<string[]> {
    const flags = await this.getCachedFlags();
    const enabledFeatures: string[] = [];

    for (const flag of flags) {
      const evaluation = await this.evaluateFeature(flag.name, context, false);
      if (evaluation.enabled) {
        enabledFeatures.push(flag.name);
      }
    }

    // Log batch evaluation event
    await this.logBatchEvaluationEvent(context, enabledFeatures);

    return enabledFeatures;
  }

  /**
   * Core feature evaluation logic
   */
  private async evaluateFeature(
    featureName: string, 
    context: FeatureFlagContext,
    useCache: boolean = true
  ): Promise<FeatureFlagEvaluation> {
    // Check for user-specific override first
    const override = await this.getUserOverride(context.userId, featureName, useCache);
    if (override !== null) {
      return {
        enabled: override,
        reason: 'override'
      };
    }

    // Get flag configuration
    const flag = await this.getFlag(featureName, useCache);
    if (!flag) {
      return {
        enabled: false,
        reason: 'not_found'
      };
    }

    // Check if flag is globally disabled
    if (!flag.enabled) {
      return {
        enabled: false,
        reason: 'disabled',
        flagConfig: flag
      };
    }

    // Evaluate based on rollout strategy
    const enabled = await this.evaluateRolloutStrategy(flag, context);

    return {
      enabled,
      reason: enabled ? 'tier_access' : 'rollout_percentage',
      flagConfig: flag
    };
  }

  /**
   * Evaluate rollout strategy
   */
  private async evaluateRolloutStrategy(flag: FeatureFlag, context: FeatureFlagContext): Promise<boolean> {
    switch (flag.rolloutStrategy) {
      case 'disabled':
        return false;

      case 'tier_based':
        // Standard tier-based access
        if (flag.tierRequired === 'free') return true;
        return context.userTier === 'premium';

      case 'percentage':
        // Percentage-based rollout with deterministic user assignment
        if (!flag.rolloutPercentage || flag.rolloutPercentage === 0) return false;
        if (flag.rolloutPercentage >= 100) {
          // Still check tier requirement
          if (flag.tierRequired === 'free') return true;
          return context.userTier === 'premium';
        }

        const userHash = this.getUserHash(context.userId, flag.name);
        const inRollout = userHash < flag.rolloutPercentage;

        if (!inRollout) return false;

        // User is in rollout percentage, check tier requirement
        if (flag.tierRequired === 'free') return true;
        return context.userTier === 'premium';

      case 'user_list':
        // Specific user list (if configured)
        const config = flag.rolloutConfig as any;
        if (config?.includeUserIds?.includes(context.userId)) {
          if (flag.tierRequired === 'free') return true;
          return context.userTier === 'premium';
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Generate deterministic hash for user assignment (0-99)
   */
  private getUserHash(userId: string, featureName: string): number {
    const hash = crypto.createHash('sha256');
    hash.update(`${userId}:${featureName}`);
    const hex = hash.digest('hex');
    return parseInt(hex.substring(0, 8), 16) % 100;
  }

  /**
   * Get cached flags or fetch from database
   */
  private async getCachedFlags(useCache: boolean = true): Promise<FeatureFlag[]> {
    const cacheKey = 'all_flags';
    const now = Date.now();

    if (useCache && this.flagCache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey) || 0;
      if (now < expiry) {
        return this.flagCache.get(cacheKey)!;
      }
    }

    const flags = await db.select().from(featureFlags);

    this.flagCache.set(cacheKey, flags);
    this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

    return flags;
  }

  /**
   * Get specific flag configuration
   */
  private async getFlag(featureName: string, useCache: boolean = true): Promise<FeatureFlag | null> {
    const flags = await this.getCachedFlags(useCache);
    return flags.find(f => f.name === featureName) || null;
  }

  /**
   * Get user-specific override
   */
  private async getUserOverride(userId: string, featureName: string, useCache: boolean = true): Promise<boolean | null> {
    const now = Date.now();
    const cacheKey = userId;

    if (useCache && this.overrideCache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(`override_${cacheKey}`) || 0;
      if (now < expiry) {
        const userOverrides = this.overrideCache.get(cacheKey)!;
        return userOverrides.get(featureName) || null;
      }
    }

    // Fetch user overrides from database
    const overrides = await db
      .select({
        featureName: featureFlags.name,
        isEnabled: featureFlagOverrides.isEnabled,
        expiresAt: featureFlagOverrides.expiresAt,
      })
      .from(featureFlagOverrides)
      .innerJoin(featureFlags, eq(featureFlagOverrides.featureFlagId, featureFlags.id))
      .where(eq(featureFlagOverrides.userId, userId));

    // Build cache map
    const userOverrideMap = new Map<string, boolean>();
    for (const override of overrides) {
      // Check if override has expired
      if (override.expiresAt && new Date(override.expiresAt) < new Date()) {
        continue;
      }
      userOverrideMap.set(override.featureName, override.isEnabled);
    }

    this.overrideCache.set(cacheKey, userOverrideMap);
    this.cacheExpiry.set(`override_${cacheKey}`, now + this.CACHE_TTL);

    return userOverrideMap.get(featureName) || null;
  }

  /**
   * Log feature evaluation event
   */
  private async logFeatureEvent(
    featureName: string, 
    context: FeatureFlagContext, 
    evaluation: FeatureFlagEvaluation
  ): Promise<void> {
    try {
      const eventData: InsertFeatureFlagEvent = {
        userId: context.userId,
        featureFlagName: featureName,
        wasEnabled: evaluation.enabled,
        evaluationReason: evaluation.reason,
        userTier: context.userTier,
        sessionId: context.sessionId,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      };

      await db.insert(featureFlagEvents).values(eventData);
    } catch (error) {
      console.error('Failed to log feature flag event:', error);
      // Don't throw - logging failure shouldn't break feature evaluation
    }
  }

  /**
   * Log batch evaluation event (sampled)
   */
  private async logBatchEvaluationEvent(context: FeatureFlagContext, enabledFeatures: string[]): Promise<void> {
    // Sample batch events (log 10% of them to reduce noise)
    if (Math.random() > 0.1) return;

    try {
      const eventData: InsertFeatureFlagEvent = {
        userId: context.userId,
        featureFlagName: 'BATCH_EVALUATION',
        wasEnabled: true,
        evaluationReason: 'tier_access',
        userTier: context.userTier,
        sessionId: context.sessionId,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      };

      await db.insert(featureFlagEvents).values(eventData);
    } catch (error) {
      console.error('Failed to log batch evaluation event:', error);
    }
  }

  /**
   * Clear cache (for testing or immediate updates)
   */
  clearCache(): void {
    this.flagCache.clear();
    this.overrideCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Admin: Create or update feature flag
   */
  async upsertFeatureFlag(flagData: any): Promise<FeatureFlag> {
    const existing = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.name, flagData.name))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(featureFlags)
        .set({ ...flagData, updatedAt: new Date() })
        .where(eq(featureFlags.id, existing[0].id))
        .returning();

      this.clearCache();
      return updated;
    } else {
      const [created] = await db
        .insert(featureFlags)
        .values(flagData)
        .returning();

      this.clearCache();
      return created;
    }
  }

  /**
   * Admin: Set user override
   */
  async setUserOverride(
    userId: string, 
    featureName: string, 
    isEnabled: boolean, 
    reason: string = 'admin_override',
    expiresAt?: Date
  ): Promise<void> {
    const flag = await this.getFlag(featureName, false);
    if (!flag) {
      throw new Error(`Feature flag '${featureName}' not found`);
    }

    // Remove existing override
    await db
      .delete(featureFlagOverrides)
      .where(
        and(
          eq(featureFlagOverrides.userId, userId),
          eq(featureFlagOverrides.featureFlagId, flag.id)
        )
      );

    // Add new override
    await db.insert(featureFlagOverrides).values({
      userId,
      featureFlagId: flag.id,
      isEnabled,
      overrideReason: reason as any,
      expiresAt,
    });

    this.clearCache();
  }

  /**
   * Get feature flag analytics
   */
  async getFeatureAnalytics(featureName: string, days: number = 30): Promise<any> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results = await db
      .select({
        date: sql<string>`DATE(timestamp)`,
        totalEvaluations: sql<number>`COUNT(*)`,
        enabledEvaluations: sql<number>`SUM(CASE WHEN was_enabled THEN 1 ELSE 0 END)`,
        uniqueUsers: sql<number>`COUNT(DISTINCT user_id)`,
      })
      .from(featureFlagEvents)
      .where(
        and(
          eq(featureFlagEvents.featureFlagName, featureName),
          sql`timestamp >= ${cutoffDate}`
        )
      )
      .groupBy(sql`DATE(timestamp)`)
      .orderBy(sql`DATE(timestamp)`);

    return results;
  }
}

export const featureFlagService = new FeatureFlagService();