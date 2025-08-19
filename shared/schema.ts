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
  subscriptionTier: varchar("subscription_tier", { length: 20 }).default("free").notNull(), // 'free', 'beginner', 'pro', or 'duo'
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
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }), // For Duo users
  name: varchar("name", { length: 50 }).notNull(),
  icon: varchar("icon", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(),
}, (table) => [
  index("idx_categories_user").on(table.userId),
  index("idx_categories_household").on(table.householdId),
  // Unique constraint per user or household
  unique("unique_category_per_user").on(table.userId, table.name),
  unique("unique_category_per_household").on(table.householdId, table.name),
]);

// Documents table
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }), // For Duo users
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
  
  // Email Body PDF fields for deduplication and linking
  messageId: text("message_id"), // Mailgun message ID for deduplication
  bodyHash: text("body_hash"), // SHA-256 hash of email body content
  emailContext: jsonb("email_context"), // Email metadata: { from, to, subject, receivedAt, ingestGroupId }
  documentReferences: jsonb("document_references"), // Document relations: [{ type, relation, documentId, createdAt }]
  
  // TICKET 3: Attachment classification and conversion tracking
  conversionStatus: varchar("conversion_status", { length: 30 }).default("not_applicable"), // 'not_applicable', 'pending', 'completed', 'skipped_unsupported', 'skipped_too_large', 'skipped_password_protected', 'failed'
  sourceDocumentId: integer("source_document_id").references(() => documents.id), // Reference to original document (for converted PDFs)
  originalMimeType: varchar("original_mime_type", { length: 100 }), // Original MIME type before conversion (for converted documents)
  conversionJobId: text("conversion_job_id"), // CloudConvert job ID for tracking
  conversionMetadata: jsonb("conversion_metadata"), // { engine: 'libreoffice|imagemagick|chrome', duration: number, fileSize: number }
  
  // TICKET 5: Enhanced provenance and conversion tracking
  conversionEngine: varchar("conversion_engine", { length: 20 }), // 'cloudconvert' | 'puppeteer' | null
  conversionInputSha256: text("conversion_input_sha256"), // SHA-256 hash of input content for tracking
  conversionReason: varchar("conversion_reason", { length: 30 }), // 'ok' | 'skipped_unsupported' | 'skipped_too_large' | 'skipped_password_protected' | 'error'
  derivedFromDocumentId: integer("derived_from_document_id").references(() => documents.id), // For converted docs, reference to original
  source: varchar("source", { length: 20 }).default("manual"), // 'manual', 'email', 'api' (replacing uploadSource for consistency)
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
  
  // Email Body PDF indexes for deduplication and lookup
  index("idx_documents_message_id").on(table.messageId),
  index("idx_documents_body_hash").on(table.bodyHash),
  
  // TICKET 7: Email metadata search indexes
  index("idx_documents_email_context_gin").on(table.emailContext), // GIN index for JSONB queries
  index("idx_documents_upload_source").on(table.uploadSource), // Filter by source
  
  // TICKET 3: Attachment classification and conversion indexes
  index("idx_documents_conversion_status").on(table.conversionStatus), // Filter by conversion status
  index("idx_documents_source_document").on(table.sourceDocumentId), // Find converted documents from originals
  index("idx_documents_conversion_job").on(table.conversionJobId), // Track conversion jobs
  
  // TICKET 5: Enhanced provenance tracking indexes
  index("idx_documents_conversion_engine").on(table.conversionEngine), // Filter by conversion engine
  index("idx_documents_derived_from").on(table.derivedFromDocumentId), // Find derived documents
  index("idx_documents_conversion_reason").on(table.conversionReason), // Filter by conversion outcome
  
  // Unique constraint for email body PDF deduplication per user
  // Prevents duplicate email body PDFs for same (userId, messageId, bodyHash) when uploadSource='email'
  unique("doc_email_body_uniq").on(table.userId, table.messageId, table.bodyHash),
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

// Households table for Duo plan shared workspaces
export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  planType: varchar("plan_type", { length: 20 }).default("duo").notNull(), // Currently only 'duo'
  seatLimit: integer("seat_limit").default(2).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User household membership for Duo plans
export const userHouseholdMembership = pgTable("user_household_membership", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).default("household_user").notNull(), // 'owner', 'duo_partner', 'household_user'
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  // Unique constraint: user can only be in one household
  unique("unique_user_household").on(table.userId),
  index("idx_household_members").on(table.householdId),
]);

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

// Type definitions for new tables
export type Household = typeof households.$inferSelect;
export type InsertHousehold = typeof households.$inferInsert;

export type UserHouseholdMembership = typeof userHouseholdMembership.$inferSelect;
export type InsertUserHouseholdMembership = typeof userHouseholdMembership.$inferInsert;

export type StripeWebhook = typeof stripeWebhooks.$inferSelect;
export type InsertStripeWebhook = typeof insertStripeWebhookSchema._output;

// Dynamic subscription tier type - supports arbitrary tier names via Stripe configuration
export type SubscriptionTier = string;

// Household insert schema
export const insertHouseholdSchema = createInsertSchema(households).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// User household membership schema
export const insertUserHouseholdMembershipSchema = createInsertSchema(userHouseholdMembership).omit({
  id: true,
  joinedAt: true,
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

// TICKET 1: LLM Usage Log types
export type LlmUsageLog = typeof llmUsageLogs.$inferSelect;
export type InsertLlmUsageLog = z.infer<typeof insertLlmUsageLogSchema>;
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
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }), // For Duo users
  insightId: varchar("insight_id").notNull(), // Unique identifier for this insight
  message: text("message").notNull(), // TICKET 4: User-facing message
  type: varchar("type", { length: 50 }).notNull(), // 'summary', 'action_items', 'key_dates', 'financial', 'expiring', etc.
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(), // 0.00-100.00 (supports decimal confidence scores)
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
  index("idx_document_insights_household").on(table.householdId),
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

// User types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

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



// TICKET 2: Pending invites table for household sharing
export const pendingInvites = pgTable("pending_invites", {
  id: serial("id").primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(), // 'duo_partner', 'household_user'
  token: varchar("token", { length: 255 }).notNull().unique(),
  invitedByUserId: varchar("invited_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_pending_invites_household").on(table.householdId),
  index("idx_pending_invites_email").on(table.email),
  index("idx_pending_invites_token").on(table.token),
  index("idx_pending_invites_expires").on(table.expiresAt),
  // Prevent duplicate invites for the same email to the same household
  unique("unique_household_email_invite").on(table.householdId, table.email),
]);

export type PendingInvite = typeof pendingInvites.$inferSelect;
export type InsertPendingInvite = typeof pendingInvites.$inferInsert;

export const insertPendingInviteSchema = createInsertSchema(pendingInvites).omit({
  id: true,
  token: true,
  createdAt: true,
});

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
  linkedAssetId: integer("linked_asset_id").references(() => userAssets.id, { onDelete: "set null" }),
  linkedDocumentIds: integer("linked_document_ids").array().default([]), // Array of document IDs
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
  dueDate: z.string().transform((str) => new Date(str)).refine((date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }, "Due date must be today or in the future"),
  repeatInterval: z.enum(["monthly", "quarterly", "annually"]).nullable().optional(),
  linkedDocumentIds: z.array(z.number().int()).max(10, "Maximum 10 linked documents allowed").optional(),
  notes: z.string().optional(),
  source: z.enum(["manual", "document"]).default("manual"),
  status: z.enum(["active", "dismissed"]).default("active"),
}).omit({
  id: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
});

// TICKET 1: Vehicles table for DVLA-enriched data
export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vrn: text("vrn").notNull(), // Vehicle Registration Number
  // Basic vehicle information
  make: varchar("make", { length: 100 }),
  model: varchar("model", { length: 100 }),
  yearOfManufacture: integer("year_of_manufacture"),
  fuelType: varchar("fuel_type", { length: 50 }),
  colour: varchar("colour", { length: 50 }),
  // Tax information
  taxStatus: varchar("tax_status", { length: 50 }), // e.g., "Taxed", "SORN", "Untaxed"
  taxDueDate: date("tax_due_date"),
  // MOT information
  motStatus: varchar("mot_status", { length: 50 }), // e.g., "Valid", "No details held", "Expired"
  motExpiryDate: date("mot_expiry_date"),
  // Environmental information
  co2Emissions: integer("co2_emissions"), // CO2 emissions in g/km
  euroStatus: varchar("euro_status", { length: 20 }), // e.g., "EURO 6", "EURO 5"
  engineCapacity: integer("engine_capacity"), // Engine capacity in cc
  revenueWeight: integer("revenue_weight"), // Revenue weight in kg
  // Data management
  dvlaLastRefreshed: timestamp("dvla_last_refreshed"),
  source: text("source").default("manual"), // "manual", "dvla", "import"
  notes: text("notes"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_vehicles_user_id").on(table.userId),
  index("idx_vehicles_vrn").on(table.vrn),
  index("idx_vehicles_user_vrn").on(table.userId, table.vrn), // Composite index for user vehicle lookups
  index("idx_vehicles_tax_due").on(table.taxDueDate),
  index("idx_vehicles_mot_expiry").on(table.motExpiryDate),
]);

// Vehicle types and schemas
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

// TICKET 3: Vehicle creation schema with DVLA enrichment
export const createVehicleSchema = z.object({
  vrn: z.string()
    .min(1, "VRN is required")
    .max(10, "VRN too long")
    .regex(/^[A-Z0-9\s-]+$/i, "VRN contains invalid characters")
    .transform(val => val.trim().toUpperCase().replace(/[\s-]/g, '')),
  notes: z.string().optional().nullable().default(null),
  // Allow manual fallback fields if DVLA lookup fails
  make: z.string().optional().nullable().default(null),
  model: z.string().optional().nullable().default(null),
  yearOfManufacture: z.number()
    .int("Year must be a whole number")
    .min(1900, "Year must be 1900 or later")
    .max(new Date().getFullYear() + 1, "Year cannot be in the future")
    .optional().nullable().default(null),
  fuelType: z.enum(["PETROL", "DIESEL", "ELECTRIC", "HYBRID", "OTHER"], {
    errorMap: () => ({ message: "Fuel type must be PETROL, DIESEL, ELECTRIC, HYBRID, or OTHER" })
  }).optional().nullable().default(null),
  colour: z.string().optional().nullable().default(null),
});

// Full vehicle schema for manual creation and updates (existing functionality) 
export const insertVehicleSchema = z.object({
  userId: z.string(),  // Required for all vehicle operations
  vrn: z.string().min(1, "VRN is required").max(10, "VRN too long").transform(val => val.toUpperCase().replace(/\s/g, '')),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  yearOfManufacture: z.number().int().nullable().optional(),
  fuelType: z.string().nullable().optional(),
  colour: z.string().nullable().optional(),
  taxStatus: z.string().nullable().optional(),
  taxDueDate: z.date().nullable().optional(),
  motStatus: z.string().nullable().optional(),
  motExpiryDate: z.date().nullable().optional(),
  co2Emissions: z.number().int().nullable().optional(),
  euroStatus: z.string().nullable().optional(),
  engineCapacity: z.number().int().nullable().optional(),
  revenueWeight: z.number().int().nullable().optional(),
  source: z.enum(["manual", "dvla", "import"]).default("manual"),
  notes: z.string().optional().nullable(),
  dvlaLastRefreshed: z.date().optional().nullable(),
});

// Schema for updating only user-editable fields (TICKET 3 requirement)
export const updateVehicleUserFieldsSchema = z.object({
  notes: z.string().optional(),
  // Users can only edit manual/user fields, not DVLA fields
}).strict();

// Re-export feature flag schemas
export * from "./featureFlagSchema";
