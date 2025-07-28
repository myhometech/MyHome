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

// User storage table - email/password authentication only
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  passwordHash: varchar("password_hash").notNull(),
  role: varchar("role", { length: 20 }).default("user").notNull(), // 'user' or 'admin'
  subscriptionTier: varchar("subscription_tier", { length: 20 }).default("free").notNull(), // 'free' or 'premium'
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  subscriptionStatus: varchar("subscription_status", { length: 20 }).default("inactive"), // 'active', 'inactive', 'canceled', 'past_due'
  subscriptionId: varchar("subscription_id"),
  subscriptionRenewalDate: timestamp("subscription_renewal_date"),
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

// Stripe webhook types
export type StripeWebhook = typeof stripeWebhooks.$inferSelect;
export type InsertStripeWebhook = z.infer<typeof insertStripeWebhookSchema>;

// Types  
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;

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

// Re-export feature flag schemas
export * from "./featureFlagSchema";
