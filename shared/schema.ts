import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  boolean,
  unique,
  uuid,
  date,
  numeric,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (mandatory for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - supports email/password and OAuth authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email"), // Made nullable for OAuth providers that don't provide email
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  passwordHash: varchar("password_hash"), // Made nullable for OAuth-only accounts
  authProvider: varchar("auth_provider", { length: 20 }).default("email").notNull(), // 'email', 'google', 'apple', 'twitter'
  providerId: varchar("provider_id"), // External user ID from OAuth provider (nullable)
  role: varchar("role", { length: 20 }).default("user").notNull(), // 'user' or 'admin'
  subscriptionTier: varchar("subscription_tier", { length: 20 }).default("free").notNull(), // 'free' or 'premium'
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  subscriptionStatus: varchar("subscription_status", { length: 20 }).default("inactive"), // 'active', 'inactive', 'canceled', 'past_due'
  subscriptionId: varchar("subscription_id"),
  subscriptionRenewalDate: timestamp("subscription_renewal_date"),
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  passwordResetToken: varchar("password_reset_token"),
  passwordResetTokenExpiry: timestamp("password_reset_token_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Unique constraint for OAuth providers: no duplicate provider accounts
  unique("unique_provider_account").on(table.authProvider, table.providerId),
  // Unique constraint for email accounts (when email is provided)
  unique("unique_email_account").on(table.email),
]);

// Document categories
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 50 }).notNull(),
  icon: varchar("icon", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(),
}, (table) => [
  index("idx_categories_user").on(table.userId),
  // Unique constraint per user
  unique("unique_category_per_user").on(table.userId, table.name),
]);

// Documents table
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => categories.id),
  name: varchar("name", { length: 255 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  tags: text("tags").array(),
  expiryDate: timestamp("expiry_date"),
  extractedText: text("extracted_text"),
  summary: text("summary"),
  ocrProcessed: boolean("ocr_processed").default(false),
  // Encryption fields
  encryptedDocumentKey: text("encrypted_document_key"),
  encryptionMetadata: text("encryption_metadata"),
  isEncrypted: boolean("is_encrypted").default(true),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  // DOC-302: Email ingestion fields
  gcsPath: text("gcs_path"), // Path in Google Cloud Storage
  uploadSource: varchar("upload_source", { length: 20 }).default("manual"), // 'manual', 'email', 'api'
  status: varchar("status", { length: 20 }).default("active"), // 'pending', 'active', 'failed'
  // DOC-303: AI categorization fields
  categorizationSource: varchar("categorization_source", { length: 20 }).default("rules"), // 'rules', 'ai', 'manual'
}, (table) => [
  // Primary user-based indexes for common queries
  index("idx_documents_user_id").on(table.userId),
  index("idx_documents_user_category").on(table.userId, table.categoryId),
  index("idx_documents_user_uploaded").on(table.userId, table.uploadedAt),
  
  // Search optimization indexes
  index("idx_documents_name_search").on(table.name),
  index("idx_documents_filename_search").on(table.fileName),
  
  // GIN indexes for full-text search and arrays
  index("idx_documents_tags_gin").on(table.tags),
  
  // Expiry date index for alerts
  index("idx_documents_expiry").on(table.expiryDate),
  
  // OCR processing status for background jobs
  index("idx_documents_ocr_status").on(table.ocrProcessed),
]);

// Document sharing table
export const documentShares = pgTable("document_shares", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  sharedByUserId: varchar("shared_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedWithEmail: varchar("shared_with_email", { length: 255 }).notNull(),
  sharedWithUserId: varchar("shared_with_user_id").references(() => users.id, { onDelete: "cascade" }),
  permissions: varchar("permissions", { length: 20 }).notNull().default("view"), // 'view' or 'edit'
  sharedAt: timestamp("shared_at").defaultNow(),
}, (table) => [
  index("idx_document_shares_document").on(table.documentId),
  index("idx_document_shares_shared_with").on(table.sharedWithUserId),
]);

// User email forwarding mappings
export const userForwardingMappings = pgTable("user_forwarding_mappings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  emailHash: varchar("email_hash", { length: 20 }).notNull().unique(),
  forwardingAddress: varchar("forwarding_address", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_forwarding_hash").on(table.emailHash),
]);

// Email processing table for forwarded emails
export const emailForwards = pgTable("email_forwards", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fromEmail: varchar("from_email", { length: 255 }).notNull(),
  subject: text("subject").notNull(),
  emailBody: text("email_body"),
  hasAttachments: boolean("has_attachments").default(false),
  attachmentCount: integer("attachment_count").default(0),
  processedAt: timestamp("processed_at").defaultNow(),
  documentsCreated: integer("documents_created").default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'processed', 'failed'
  errorMessage: text("error_message"),
}, (table) => [
  index("idx_email_forwards_user").on(table.userId),
  index("idx_email_forwards_status").on(table.status),
]);

// Blog posts table for public-facing blog
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  featuredImage: varchar("featured_image", { length: 255 }),
  authorId: varchar("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  published: boolean("published").default(false).notNull(),
  publishedAt: timestamp("published_at"),
  tags: text("tags").array(),
  readTimeMinutes: integer("read_time_minutes").default(5),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_blog_posts_published").on(table.published),
  index("idx_blog_posts_slug").on(table.slug),
  index("idx_blog_posts_author").on(table.authorId),
]);

// Create schemas
export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  authProvider: z.enum(["email", "google", "apple", "twitter"]).default("email"),
  providerId: z.string().optional(),
});

// OAuth registration schema for provider-based signups
export const oauthRegisterSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  authProvider: z.enum(["google", "apple", "twitter"]),
  providerId: z.string().min(1, "Provider ID is required"),
});

// Email registration schema for traditional email/password signups
export const emailRegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
});

export const insertDocumentShareSchema = createInsertSchema(documentShares).omit({
  id: true,
  sharedAt: true,
});

export const insertEmailForwardSchema = createInsertSchema(emailForwards).omit({
  id: true,
  processedAt: true,
});

// Stripe webhooks table for event tracking
export const stripeWebhooks = pgTable("stripe_webhooks", {
  id: serial("id").primaryKey(),
  eventId: varchar("event_id").notNull().unique(), // Stripe event ID for deduplication
  eventType: varchar("event_type").notNull(), // checkout.session.completed, etc.
  processedAt: timestamp("processed_at").defaultNow(),
  data: jsonb("data").notNull(), // Full event data from Stripe
});

export const insertStripeWebhookSchema = createInsertSchema(stripeWebhooks).omit({
  id: true,
  processedAt: true,
});

// TICKET 1: LLM Usage Logging Table
export const llmUsageLogs = pgTable("llm_usage_logs", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // e.g., 'together.ai', 'openai'
  model: text("model").notNull(), // e.g., 'mistralai/Mistral-7B-Instruct', 'gpt-4o'
  tokensUsed: integer("tokens_used").notNull(),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }), // optional: estimate from token rate
  durationMs: integer("duration_ms"),
  status: text("status", { enum: ["success", "error"] }).notNull(),
  route: text("route"), // e.g., '/api/insight/generate'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Indexes for performance on filterable fields
  index("idx_llm_usage_created_at").on(table.createdAt),
  index("idx_llm_usage_user_id").on(table.userId),
  index("idx_llm_usage_model").on(table.model),
  index("idx_llm_usage_provider").on(table.provider),
  index("idx_llm_usage_status").on(table.status),
]);

export const insertLlmUsageLogSchema = createInsertSchema(llmUsageLogs).omit({
  id: true,
  createdAt: true,
});

// Stripe webhook types
export type StripeWebhook = typeof stripeWebhooks.$inferSelect;
export type InsertStripeWebhook = z.infer<typeof insertStripeWebhookSchema>;

// TICKET 1: LLM Usage Log types
export type LlmUsageLog = typeof llmUsageLogs.$inferSelect;
export type InsertLlmUsageLog = z.infer<typeof insertLlmUsageLogSchema>;

// Types  
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
export type OAuthRegisterData = z.infer<typeof oauthRegisterSchema>;
export type EmailRegisterData = z.infer<typeof emailRegisterSchema>;

// Auth provider enum for type safety
export type AuthProvider = "email" | "google" | "apple" | "twitter";

// DOC-305: Enhanced expiry reminders with AI suggestion support
export const expiryReminders = pgTable("expiry_reminders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }), // DOC-305: Link to documents
  title: varchar("title").notNull(),
  description: text("description"),
  expiryDate: timestamp("expiry_date").notNull(),
  reminderDate: timestamp("reminder_date").notNull(), // DOC-305: When to trigger reminder
  category: varchar("category"), // e.g., "subscription", "membership", "insurance", "license"
  source: varchar("source", { length: 20 }).default("manual"), // DOC-305: 'ai', 'ocr', 'manual'
  status: varchar("status", { length: 20 }).default("pending"), // DOC-305: 'pending', 'confirmed', 'dismissed'
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_expiry_reminders_user").on(table.userId),
  index("idx_expiry_reminders_document").on(table.documentId), // DOC-305: Document lookups
  index("idx_expiry_reminders_status").on(table.status), // DOC-305: Status filtering
  index("idx_expiry_reminders_source").on(table.source), // DOC-305: Source filtering
]);

export type InsertExpiryReminder = typeof expiryReminders.$inferInsert;
export type ExpiryReminder = typeof expiryReminders.$inferSelect;

// TICKET 4: Document Insights table for AI-powered dashboard (extends DOC-501)
export const documentInsights = pgTable("document_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  insightId: varchar("insight_id").notNull(), // Unique identifier for this insight
  message: text("message").notNull(), // TICKET 4: User-facing message
  type: varchar("type", { length: 50 }).notNull(), // 'summary', 'action_items', 'key_dates', 'financial', 'expiring', etc.
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  confidence: integer("confidence").notNull(), // 0-100 (stored as integer for database efficiency)
  priority: varchar("priority", { length: 10 }).notNull().default("medium"), // 'low', 'medium', 'high'
  dueDate: date("due_date"), // TICKET 4: Due date for actionable insights
  actionUrl: text("action_url"), // TICKET 4: URL to take action
  status: varchar("status", { length: 20 }).notNull().default("open"), // TICKET 4: 'open', 'dismissed', 'resolved'
  metadata: jsonb("metadata"), // Additional structured data
  processingTime: integer("processing_time"), // Time taken to generate insight (ms)
  aiModel: varchar("ai_model", { length: 50 }).default("gpt-4o"),
  source: varchar("source", { length: 20 }).default("ai"), // 'ai', 'manual', 'rule-based'
  // INSIGHT-101: Tiered insight classification
  tier: varchar("tier", { length: 20 }).default("primary"), // 'primary', 'secondary'
  insightVersion: varchar("insight_version", { length: 10 }).default("v2.0"), // Version tracking for insight generation
  generatedAt: timestamp("generated_at").defaultNow(), // Timestamp for insight generation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Existing DOC-501 indexes
  index("idx_document_insights_document").on(table.documentId),
  index("idx_document_insights_user").on(table.userId),
  index("idx_document_insights_type").on(table.type),
  index("idx_document_insights_priority").on(table.priority),
  unique("unique_insight_per_document").on(table.documentId, table.insightId),
  // TICKET 4: New indexes for dashboard
  index("idx_insights_user_status").on(table.userId, table.status),
  index("idx_insights_due_date").on(table.dueDate),
  // INSIGHT-101: Index for tier filtering
  index("idx_insights_tier").on(table.tier),
]);

export type InsertDocumentInsight = typeof documentInsights.$inferInsert;
export type DocumentInsight = typeof documentInsights.$inferSelect;

// Zod schema for document insights
export const insertDocumentInsightSchema = createInsertSchema(documentInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Zod schemas for validation
export const insertExpiryReminderSchema = createInsertSchema(expiryReminders, {
  expiryDate: z.string().transform((str) => new Date(str)),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

// User forwarding mapping types
export type InsertUserForwardingMapping = typeof userForwardingMappings.$inferInsert;
export type UserForwardingMapping = typeof userForwardingMappings.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentShare = typeof documentShares.$inferSelect;
export type InsertDocumentShare = z.infer<typeof insertDocumentShareSchema>;
export type EmailForward = typeof emailForwards.$inferSelect;
export type InsertEmailForward = z.infer<typeof insertEmailForwardSchema>;

// User Assets table for properties and vehicles
export const userAssets = pgTable("user_assets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'house' or 'car'
  // House fields
  address: text("address"), // For houses
  postcode: varchar("postcode", { length: 20 }), // For houses
  // Car fields  
  make: varchar("make", { length: 100 }), // For cars
  model: varchar("model", { length: 100 }), // For cars
  year: integer("year"), // For cars
  registration: varchar("registration", { length: 50 }), // For cars
  vin: varchar("vin", { length: 50 }), // For cars (optional)
  // Common optional fields
  estimatedValue: integer("estimated_value"), // Optional estimated value in cents
  notes: text("notes"), // Optional notes about the asset
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_assets_user").on(table.userId),
  index("idx_user_assets_type").on(table.type),
]);

export type UserAsset = typeof userAssets.$inferSelect;
export type InsertUserAsset = typeof userAssets.$inferInsert;

export const insertUserAssetSchema = createInsertSchema(userAssets).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

// Manual Tracked Events table (TICKET B1)
export const manualTrackedEvents = pgTable("manual_tracked_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 20 }).notNull(), // 'insurance', 'vehicle', 'utilities', 'mortgage', 'maintenance', 'other'
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  repeatInterval: varchar("repeat_interval", { length: 20 }), // 'monthly', 'quarterly', 'annually'
  notes: text("notes"),
  linkedAssetId: uuid("linked_asset_id").references(() => userAssets.id, { onDelete: "set null" }),
  linkedDocumentIds: uuid("linked_document_ids").array().default([]), // Array of document IDs
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  source: varchar("source", { length: 20 }).default("manual").notNull(), // 'manual' | 'document'
  status: varchar("status", { length: 20 }).default("active").notNull(), // 'active' | 'dismissed'
}, (table) => [
  index("idx_manual_events_user").on(table.createdBy),
  index("idx_manual_events_due_date").on(table.dueDate),
  index("idx_manual_events_category").on(table.category),
  index("idx_manual_events_status").on(table.status),
]);

// Manual Tracked Event types and schemas
export type ManualTrackedEvent = typeof manualTrackedEvents.$inferSelect;
export type InsertManualTrackedEvent = typeof manualTrackedEvents.$inferInsert;

export const insertManualTrackedEventSchema = createInsertSchema(manualTrackedEvents, {
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  category: z.enum(["insurance", "vehicle", "utilities", "mortgage", "maintenance", "other"]),
  dueDate: z.string().refine((date) => {
    const parsedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parsedDate >= today;
  }, "Due date must be today or in the future"),
  repeatInterval: z.enum(["monthly", "quarterly", "annually"]).optional(),
  linkedDocumentIds: z.array(z.string().uuid()).max(10, "Maximum 10 linked documents allowed").optional(),
  notes: z.string().optional(),
  source: z.enum(["manual", "document"]).default("manual"),
  status: z.enum(["active", "dismissed"]).default("active"),
}).omit({
  id: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
});

// Re-export feature flag schemas
export * from "./featureFlagSchema";
