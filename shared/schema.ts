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
  householdId: uuid("household_id"), // For Duo users
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
  householdId: uuid("household_id"), // For Duo users
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
  sourceDocumentId: integer("source_document_id"), // Reference to original document (for converted PDFs)
  originalMimeType: varchar("original_mime_type", { length: 100 }), // Original MIME type before conversion (for converted documents)
  conversionJobId: text("conversion_job_id"), // CloudConvert job ID for tracking
  conversionMetadata: jsonb("conversion_metadata"), // { engine: 'libreoffice|imagemagick|chrome', duration: number, fileSize: number }
  
  // TICKET 5: Enhanced provenance and conversion tracking
  conversionEngine: varchar("conversion_engine", { length: 20 }), // 'cloudconvert' | 'puppeteer' | null
  conversionInputSha256: text("conversion_input_sha256"), // SHA-256 hash of input content for tracking
  conversionReason: varchar("conversion_reason", { length: 30 }), // 'ok' | 'skipped_unsupported' | 'skipped_too_large' | 'skipped_password_protected' | 'error'
  derivedFromDocumentId: integer("derived_from_document_id"), // For converted docs, reference to original
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

// CHAT-008: Document facts for structured field extraction
export const documentFacts = pgTable("document_facts", {
  id: serial("id").primaryKey(),
  householdId: uuid("household_id"), // Tenant separation (maps to tenantId in spec)
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  docId: integer("doc_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  field: text("field").notNull(), // e.g. totalAmount, dueDate, invoiceDate, accountNumber, provider
  value: text("value").notNull(), // normalized string value (ISO date, decimal, plain text)
  currency: varchar("currency", { length: 10 }), // optional (e.g. GBP, USD, EUR)
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(), // 0–1 (from OCR/Insight extraction)
  page: integer("page"), // page number if known
  bbox: jsonb("bbox"), // optional coordinates for highlight in viewer
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Primary indexes for fast queries
  index("idx_document_facts_doc_field").on(table.docId, table.field),
  index("idx_document_facts_household_field").on(table.householdId, table.field),
  index("idx_document_facts_user_field").on(table.userId, table.field),
  
  // Additional query optimization indexes
  index("idx_document_facts_field").on(table.field),
  index("idx_document_facts_user_doc").on(table.userId, table.docId),
  index("idx_document_facts_confidence").on(table.confidence),
  
  // Unique constraint: one fact per document-field combination (upsert pattern)
  unique("unique_document_fact").on(table.docId, table.field),
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
  name: varchar("name", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  planType: varchar("plan_type", { length: 20 }).default("duo").notNull(), // Currently only 'duo'
  seatLimit: integer("seat_limit").default(2).notNull(),
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: "cascade" }),
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

// Model escalation audit log for comprehensive tracking
export const modelEscalationLogs = pgTable("model_escalation_logs", {
  id: serial("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  messageId: text("message_id").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  initialModel: text("initial_model").notNull(),
  finalModel: text("final_model").notNull(),
  escalationTrigger: text("escalation_trigger"), // 'low_confidence', 'insufficient_evidence', 'complex_query', 'manual_request'
  initialConfidence: numeric("initial_confidence", { precision: 3, scale: 2 }),
  finalConfidence: numeric("final_confidence", { precision: 3, scale: 2 }),
  tokensIn: integer("tokens_in").notNull(),
  tokensOut: integer("tokens_out").notNull(),
  latencyMsTotal: integer("latency_ms_total").notNull(),
  latencyMsLlm: integer("latency_ms_llm").notNull(),
  docIdsTouched: integer("doc_ids_touched").array(),
  escalated: boolean("escalated").default(false).notNull(),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Indexes for analytics queries
  index("idx_escalation_logs_created_at").on(table.createdAt),
  index("idx_escalation_logs_user_id").on(table.userId),
  index("idx_escalation_logs_tenant_id").on(table.tenantId),
  index("idx_escalation_logs_final_model").on(table.finalModel),
  index("idx_escalation_logs_escalated").on(table.escalated),
  index("idx_escalation_logs_escalation_trigger").on(table.escalationTrigger),
]);

export const insertLlmUsageLogSchema = createInsertSchema(llmUsageLogs).omit({
  id: true,
  createdAt: true,
});

export const insertModelEscalationLogSchema = createInsertSchema(modelEscalationLogs).omit({
  id: true,
  createdAt: true,
});

// TICKET 1: LLM Usage Log types
export type LlmUsageLog = typeof llmUsageLogs.$inferSelect;
export type InsertLlmUsageLog = z.infer<typeof insertLlmUsageLogSchema>;

// Model escalation log types
export type ModelEscalationLog = typeof modelEscalationLogs.$inferSelect;
export type InsertModelEscalationLog = z.infer<typeof insertModelEscalationLogSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
export type OAuthRegisterData = z.infer<typeof oauthRegisterSchema>;
export type EmailRegisterData = z.infer<typeof emailRegisterSchema>;

// TICKET 4: Document Events Audit Logging
export const documentEvents = pgTable("document_events", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 50 }).notNull(), // 'upload', 'delete', 'rename', 'ai_insight', 'share', 'download'
  metadata: jsonb("metadata"), // Additional context like old/new values, insight type, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_document_events_document_id").on(table.documentId),
  index("idx_document_events_user_id").on(table.userId),
  index("idx_document_events_household_id").on(table.householdId),
  index("idx_document_events_action").on(table.action),
  index("idx_document_events_created_at").on(table.createdAt),
]);

export const insertDocumentEventSchema = createInsertSchema(documentEvents).omit({
  id: true,
  createdAt: true,
});

export type DocumentEvent = typeof documentEvents.$inferSelect;
export type InsertDocumentEvent = z.infer<typeof insertDocumentEventSchema>;

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
  // User flagging for incorrect insights
  flagged: boolean("flagged").default(false).notNull(), // User can flag incorrect insights
  flaggedReason: text("flagged_reason"), // Optional reason for flagging
  flaggedAt: timestamp("flagged_at"), // When insight was flagged
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

// Chat system tables for conversation persistence
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: varchar("tenant_id").notNull(), // Maps to userId for individual users, householdId for Duo users
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archived: boolean("archived").default(false),
  archivedAt: timestamp("archived_at"),
}, (table) => [
  index("ix_conversations_tenant_created_at").on(table.tenantId, table.createdAt),
  index("ix_conversations_user_created_at").on(table.userId, table.createdAt),
]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull(), // Maps to userId for individual users, householdId for Duo users  
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }), // null for assistant/system messages
  role: varchar("role", { length: 20 }).notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(),
  citations: jsonb("citations"), // [{docId,page,bbox:[x1,y1,x2,y2]}]
  verdict: jsonb("verdict"), // {grounded:boolean, confidence:float, slots:{...}}
  usage: jsonb("usage"), // {prompt_tokens:int, completion_tokens:int, model:string}
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ix_messages_conversation_created_at").on(table.conversationId, table.createdAt),
  index("ix_messages_tenant_created_at").on(table.tenantId, table.createdAt),
]);

// Chat schema types
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Chat validation schemas
export const insertConversationSchema = createInsertSchema(conversations, {
  title: z.string().max(255).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  archived: true,
  archivedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages, {
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1, "Content is required"),
  citations: z.array(z.object({
    docId: z.number(),
    page: z.number().optional(),
    bbox: z.array(z.number()).length(4).optional(), // [x1,y1,x2,y2]
  })).optional(),
  verdict: z.object({
    grounded: z.boolean(),
    confidence: z.number().min(0).max(1),
    slots: z.record(z.any()).optional(),
  }).optional(),
  usage: z.object({
    prompt_tokens: z.number().int().min(0),
    completion_tokens: z.number().int().min(0), 
    model: z.string(),
  }).optional(),
}).omit({
  id: true,
  createdAt: true,
});

// Document search text table for full-text search
export const documentText = pgTable("document_text", {
  docId: integer("doc_id").primaryKey().notNull().references(() => documents.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull(), // Maps to userId for individual users, householdId for Duo users
  text: text("text").notNull(), // concatenated plain text (pages joined with delimiters)
  pageBreaks: integer("page_breaks").array().notNull(), // cumulative char offsets where each page starts
  tsv: text("tsv"), // generated column for FTS - using text type as tsvector isn't directly supported
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ix_document_text_tenant").on(table.tenantId, table.docId),
  // GIN index for full-text search will be created manually via SQL
]);

// Document search schema types
export type DocumentText = typeof documentText.$inferSelect;
export type InsertDocumentText = z.infer<typeof insertDocumentTextSchema>;

// Document search validation schemas
export const insertDocumentTextSchema = createInsertSchema(documentText, {
  text: z.string().min(1, "Text content is required"),
  pageBreaks: z.array(z.number().int().min(0)).min(1, "At least one page break is required"),
}).omit({
  tsv: true, // Generated column
  updatedAt: true,
});

// Search request/response schemas
export const searchSnippetsRequestSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  filters: z.object({
    docType: z.array(z.string()).optional(),
    provider: z.string().optional(),
    dateFrom: z.string().datetime().optional(), 
    dateTo: z.string().datetime().optional(),
    createdByUserId: z.string().nullable().optional(),
  }).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  snippetLimit: z.number().int().min(1).max(10).default(3),
  snippetCharWindow: z.number().int().min(50).max(500).default(280),
});

export type SearchSnippetsRequest = z.infer<typeof searchSnippetsRequestSchema>;

export const searchSnippetSchema = z.object({
  text: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  page: z.number().int(),
});

export const searchResultSchema = z.object({
  docId: z.string(),
  title: z.string(),
  score: z.number(),
  snippets: z.array(searchSnippetSchema),
  metadata: z.object({
    docType: z.string().optional(),
    provider: z.string().optional(),
    invoiceDate: z.string().optional(),
  }).optional(),
});

export const searchSnippetsResponseSchema = z.object({
  results: z.array(searchResultSchema),
  totalResults: z.number().int(),
  hasMore: z.boolean().optional(),
  cursor: z.string().optional(),
});

export type SearchSnippet = z.infer<typeof searchSnippetSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchSnippetsResponse = z.infer<typeof searchSnippetsResponseSchema>;

// Chat orchestration schemas
export const chatRequestSchema = z.object({
  conversationId: z.string().min(1, "Conversation ID is required"),
  message: z.string().min(1, "Message is required").max(1000, "Message too long"),
  filters: z.object({
    provider: z.string().optional(),
    docType: z.array(z.string()).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  }).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// CHAT-015: Legacy citation schema (maintained for backward compatibility)
export const citationSchema = z.object({
  docId: z.string(),
  page: z.number().int().min(1),
});

// CHAT-015: New minimal citation source schema for deep-linking
export const sourceLocationSchema = z.object({
  page: z.number().int().min(1),
  charStart: z.number().int().optional(),
  charEnd: z.number().int().optional(),
  anchorText: z.string().max(80).optional(),
});

export const sourceSchema = z.object({
  docId: z.string(),
  loc: sourceLocationSchema,
});

export const verdictSchema = z.object({
  grounded: z.boolean(),
  confidence: z.number().min(0).max(1),
});

// CHAT-015: Updated chat response schema with minimal sources
export const chatResponseSchema = z.object({
  conversationId: z.string(),
  answer: z.string(),
  sources: z.array(sourceSchema),
  verdict: verdictSchema,
}).refine(data => data.sources.length <= 3, {
  message: "Maximum 3 sources allowed for minimal citation UI"
});

// CHAT-015: Legacy response schema (for backward compatibility)
export const legacyChatResponseSchema = z.object({
  conversationId: z.string(),
  answer: z.string(),
  citations: z.array(citationSchema),
  slots: z.object({
    amount: z.string().optional(),
    currency: z.string().optional(),
    dueDate: z.string().optional(),
  }).optional(),
  confidence: z.number().min(0).max(1),
});

// CHAT-015: Type exports for minimal citation UI
export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type LegacyChatResponse = z.infer<typeof legacyChatResponseSchema>;

// LLM response parsing schemas
// CHAT-015: Updated LLM response for minimal citation (internal use - still uses citations)
export const llmChatResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(citationSchema),
  slots: z.object({
    amount: z.string().optional(),
    currency: z.string().optional(),
    dueDate: z.string().optional(),
  }).optional(),
  confidence: z.number().min(0).max(1),
});

export type LLMChatResponse = z.infer<typeof llmChatResponseSchema>;

// CHAT-008: Document facts schemas
export const insertDocumentFactSchema = createInsertSchema(documentFacts);
export const selectDocumentFactSchema = documentFacts.$inferSelect;

export type InsertDocumentFact = typeof documentFacts.$inferInsert;
export type SelectDocumentFact = typeof documentFacts.$inferSelect;

// Thumbnail generation system tables
export const thumbnailJobs = pgTable("thumbnail_jobs", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).default("queued").notNull(), // 'queued', 'processing', 'completed', 'failed'
  contentHash: text("content_hash").notNull(), // SHA-256 hash of source document content
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  variants: text("variants").array().notNull(), // ['96', '240', '480']
  processingStartedAt: timestamp("processing_started_at"),
  completedAt: timestamp("completed_at"),
  failedAt: timestamp("failed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  processingTimeMs: integer("processing_time_ms"), // For performance monitoring
  jobIdempotencyKey: text("job_idempotency_key").notNull(), // {documentId}:{contentHash}
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_thumbnail_jobs_document").on(table.documentId),
  index("idx_thumbnail_jobs_user").on(table.userId),
  index("idx_thumbnail_jobs_status").on(table.status),
  index("idx_thumbnail_jobs_content_hash").on(table.contentHash),
  index("idx_thumbnail_jobs_idempotency").on(table.jobIdempotencyKey),
  unique("thumbnail_job_idempotency_unique").on(table.jobIdempotencyKey),
]);

export const thumbnails = pgTable("thumbnails", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: integer("job_id").notNull().references(() => thumbnailJobs.id, { onDelete: "cascade" }),
  variant: varchar("variant", { length: 10 }).notNull(), // '96', '240', '480'
  contentHash: text("content_hash").notNull(), // SHA-256 hash of source document content
  gcsPath: text("gcs_path").notNull(), // /thumbnails/{docId}/{variant}/v{contentHash}.jpg
  format: varchar("format", { length: 10 }).notNull(), // 'jpeg', 'png'
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  fileSize: integer("file_size").notNull(), // In bytes for monitoring
  quality: integer("quality").default(80), // JPEG quality used
  generationTimeMs: integer("generation_time_ms"), // Time to generate this variant
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_thumbnails_document").on(table.documentId),
  index("idx_thumbnails_user").on(table.userId),
  index("idx_thumbnails_job").on(table.jobId),
  index("idx_thumbnails_content_hash").on(table.contentHash),
  index("idx_thumbnails_variant").on(table.variant),
  index("idx_thumbnails_gcs_path").on(table.gcsPath),
  // Unique constraint: one thumbnail per document/variant/content hash
  unique("thumbnail_unique_variant").on(table.documentId, table.variant, table.contentHash),
]);

// Thumbnail system schemas
export const insertThumbnailJobSchema = createInsertSchema(thumbnailJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertThumbnailSchema = createInsertSchema(thumbnails).omit({
  id: true,
  createdAt: true,
});

export const thumbnailVariantResponseSchema = z.object({
  variant: z.string(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
  fileSize: z.number(),
  format: z.string(),
});

export const thumbnailResponseSchema = z.object({
  documentId: z.number(),
  variants: z.record(thumbnailVariantResponseSchema),
  generatedAt: z.string(),
  jobId: z.number(),
});

export const createThumbnailJobSchema = z.object({
  documentId: z.number(),
  variants: z.array(z.enum(["96", "240", "480"])).default(["96", "240", "480"]),
});

// Type exports for thumbnail system
export type InsertThumbnailJob = typeof thumbnailJobs.$inferInsert;
export type SelectThumbnailJob = typeof thumbnailJobs.$inferSelect;
export type InsertThumbnail = typeof thumbnails.$inferInsert;
export type SelectThumbnail = typeof thumbnails.$inferSelect;
export type ThumbnailVariantResponse = z.infer<typeof thumbnailVariantResponseSchema>;
export type ThumbnailResponse = z.infer<typeof thumbnailResponseSchema>;
export type CreateThumbnailJob = z.infer<typeof createThumbnailJobSchema>;

// Re-export feature flag schemas
export * from "./featureFlagSchema";
