import 'dotenv/config';
import { db } from '../db.js';
import { eq, sql } from 'drizzle-orm';
import { featureFlags, type InsertFeatureFlag } from '../../shared/featureFlagSchema.js';
import { llmUsageLogs, type InsertLlmUsageLog } from '../../shared/schema.js';

/**
 * Ensure baseline feature flags exist for admin dashboard
 * This function is idempotent - safe to run multiple times
 */
async function ensureFeatureFlags(): Promise<void> {
  const baselineFlags: InsertFeatureFlag[] = [
    {
      name: 'beta_ai_insights',
      description: 'Enable AI-powered document insights and categorization',
      category: 'ai',
      tierRequired: 'premium',
      enabled: true,
      rolloutStrategy: 'tier_based',
      rolloutPercentage: 100,
    },
    {
      name: 'advanced_search',
      description: 'Enable advanced document search with filters and OCR text search',
      category: 'core',
      tierRequired: 'free',
      enabled: true,
      rolloutStrategy: 'tier_based',
      rolloutPercentage: 100,
    },
    {
      name: 'email_forwarding',
      description: 'Allow users to forward documents via email for automatic import',
      category: 'automation',
      tierRequired: 'premium',
      enabled: false, // Disabled by default for gradual rollout
      rolloutStrategy: 'percentage',
      rolloutPercentage: 0,
    },
    {
      name: 'document_sharing',
      description: 'Enable secure document sharing with external users',
      category: 'collaboration',
      tierRequired: 'premium',
      enabled: true,
      rolloutStrategy: 'tier_based',
      rolloutPercentage: 100,
    },
    {
      name: 'mobile_optimization',
      description: 'Optimized mobile document viewer and camera scanning',
      category: 'core',
      tierRequired: 'free',
      enabled: true,
      rolloutStrategy: 'tier_based',
      rolloutPercentage: 100,
    }
  ];

  let createdCount = 0;
  let updatedCount = 0;

  for (const flagData of baselineFlags) {
    try {
      // Check if flag already exists
      const existing = await db
        .select({ id: featureFlags.id, name: featureFlags.name })
        .from(featureFlags)
        .where(eq(featureFlags.name, flagData.name))
        .limit(1);

      if (existing.length === 0) {
        // Create new feature flag
        const inserted = await db
          .insert(featureFlags)
          .values(flagData)
          .returning({ id: featureFlags.id, name: featureFlags.name });
        
        console.log(`✅ Seed: Created feature flag '${flagData.name}' (id=${inserted[0].id})`);
        createdCount++;
      } else {
        // Update existing feature flag description and settings
        await db
          .update(featureFlags)
          .set({
            description: flagData.description,
            category: flagData.category,
            tierRequired: flagData.tierRequired,
            rolloutStrategy: flagData.rolloutStrategy,
            rolloutPercentage: flagData.rolloutPercentage,
            updatedAt: sql`NOW()`,
          })
          .where(eq(featureFlags.name, flagData.name));
        
        console.log(`🔄 Seed: Updated feature flag '${flagData.name}' (id=${existing[0].id})`);
        updatedCount++;
      }
    } catch (error) {
      console.error(`❌ Seed: Failed to process feature flag '${flagData.name}':`, error);
    }
  }

  console.log(`📊 Seed: Feature flags summary - Created: ${createdCount}, Updated: ${updatedCount}`);
}

/**
 * Ensure baseline activity log entries exist for admin dashboard
 * Creates system activity entries to populate the activity log
 */
async function ensureActivityLogs(): Promise<void> {
  try {
    // Create system seed activity log entry
    const seedLogEntry: InsertLlmUsageLog = {
      requestId: `seed-${Date.now()}`,
      userId: null, // System activity
      provider: 'system',
      model: 'admin-seed',
      tokensUsed: 0,
      costUsd: '0.0000',
      durationMs: 0,
      status: 'success',
      route: '/admin/seed',
    };

    await db.insert(llmUsageLogs).values(seedLogEntry);
    console.log('✅ Seed: Created admin baseline activity log entry');

    // Create a sample LLM usage entry for dashboard metrics
    const sampleUsageEntry: InsertLlmUsageLog = {
      requestId: `sample-${Date.now()}`,
      userId: null, // System activity
      provider: 'together.ai',
      model: 'mistralai/Mistral-7B-Instruct-v0.1',
      tokensUsed: 125,
      costUsd: '0.0025',
      durationMs: 1500,
      status: 'success',
      route: '/api/insight/generate',
    };

    await db.insert(llmUsageLogs).values(sampleUsageEntry);
    console.log('✅ Seed: Created sample LLM usage activity entry for admin metrics');

  } catch (error) {
    console.error('❌ Seed: Failed to create activity log entries:', error);
  }
}

/**
 * Verify seed data was created successfully
 */
async function verifySeededData(): Promise<void> {
  try {
    // Check feature flags count
    const flagsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(featureFlags);
    
    console.log(`🔍 Verification: Found ${flagsCount[0].count} feature flags in database`);

    // Check activity logs count (last 24 hours)
    const recentLogs = await db
      .select({ count: sql<number>`count(*)` })
      .from(llmUsageLogs)
      .where(sql`created_at >= NOW() - INTERVAL '24 hours'`);
    
    console.log(`🔍 Verification: Found ${recentLogs[0].count} activity log entries in last 24 hours`);

    if (flagsCount[0].count === 0) {
      console.warn('⚠️  Warning: No feature flags found after seeding');
    }

    if (recentLogs[0].count === 0) {
      console.warn('⚠️  Warning: No recent activity log entries found after seeding');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

/**
 * Main seed function - runs all seeding operations
 */
async function main(): Promise<void> {
  console.log('🌱 Starting admin baseline data seeding...');
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  
  try {
    await ensureFeatureFlags();
    await ensureActivityLogs();
    await verifySeededData();
    
    console.log('✅ Seed: Admin baseline data seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed: Admin baseline data seeding failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Seed process interrupted, exiting...');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Seed process terminated, exiting...');
  process.exit(1);
});

// Run the seeding if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}