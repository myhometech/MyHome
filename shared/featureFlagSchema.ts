import { pgTable, text, boolean, timestamp, uuid, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Feature flag definitions table
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  category: text("category").notNull(), // 'core', 'advanced', 'ai', 'automation', 'collaboration'
  tierRequired: text("tier_required").notNull(), // 'free', 'premium'
  enabled: boolean("enabled").notNull().default(true),
  rolloutStrategy: text("rollout_strategy").notNull().default('tier_based'), // 'tier_based', 'percentage', 'user_list'
  rolloutPercentage: integer("rollout_percentage").default(100), // For percentage-based rollouts
  rolloutConfig: jsonb("rollout_config"), // Additional rollout configuration
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User-specific feature flag overrides
export const featureFlagOverrides = pgTable("feature_flag_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  featureFlagId: uuid("feature_flag_id").notNull().references(() => featureFlags.id, { onDelete: 'cascade' }),
  isEnabled: boolean("is_enabled").notNull(),
  overrideReason: text("override_reason"), // 'admin_override', 'beta_tester', 'customer_support'
  expiresAt: timestamp("expires_at"), // Optional expiration for temporary overrides
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Feature flag evaluation events for analytics
export const featureFlagEvents = pgTable("feature_flag_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  featureFlagName: text("feature_flag_name").notNull(),
  wasEnabled: boolean("was_enabled").notNull(),
  evaluationReason: text("evaluation_reason").notNull(), // 'tier_access', 'override', 'rollout_percentage', 'disabled'
  userTier: text("user_tier").notNull(),
  sessionId: text("session_id"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Zod schemas for type safety
export const insertFeatureFlagSchema = createInsertSchema(featureFlags, {
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category: z.enum(['core', 'advanced', 'ai', 'automation', 'collaboration']),
  tierRequired: z.enum(['free', 'premium']),
  rolloutStrategy: z.enum(['tier_based', 'percentage', 'user_list', 'disabled']),
  rolloutPercentage: z.number().min(0).max(100).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFeatureFlagOverrideSchema = createInsertSchema(featureFlagOverrides, {
  overrideReason: z.enum(['admin_override', 'beta_tester', 'customer_support', 'testing']).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFeatureFlagEventSchema = createInsertSchema(featureFlagEvents, {
  evaluationReason: z.enum(['tier_access', 'override', 'rollout_percentage', 'disabled', 'not_found']),
  userTier: z.enum(['free', 'premium']),
}).omit({
  id: true,
  timestamp: true,
});

// TypeScript types
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlagOverride = typeof featureFlagOverrides.$inferSelect;
export type InsertFeatureFlagOverride = z.infer<typeof insertFeatureFlagOverrideSchema>;
export type FeatureFlagEvent = typeof featureFlagEvents.$inferSelect;
export type InsertFeatureFlagEvent = z.infer<typeof insertFeatureFlagEventSchema>;

// Rollout configuration types
export interface PercentageRolloutConfig {
  seed?: string; // For deterministic user assignment
  excludeUserIds?: string[];
}

export interface UserListRolloutConfig {
  includeUserIds: string[];
  excludeUserIds?: string[];
}

export type RolloutConfig = PercentageRolloutConfig | UserListRolloutConfig | Record<string, any>;