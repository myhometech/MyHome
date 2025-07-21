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
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

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
  emailHash: varchar("email_hash", { length: 10 }).notNull().unique(),
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

// Create schemas
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

// Types  
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;

// Standalone expiry reminders (not tied to documents)
export const expiryReminders = pgTable("expiry_reminders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  expiryDate: timestamp("expiry_date").notNull(),
  category: varchar("category"), // e.g., "subscription", "membership", "insurance", "license"
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
