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
} from "drizzle-orm/pg-core";
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

// User storage table (mandatory for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document categories
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  icon: varchar("icon", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(),
});

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
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
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
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentShare = typeof documentShares.$inferSelect;
export type InsertDocumentShare = z.infer<typeof insertDocumentShareSchema>;
export type EmailForward = typeof emailForwards.$inferSelect;
export type InsertEmailForward = z.infer<typeof insertEmailForwardSchema>;
