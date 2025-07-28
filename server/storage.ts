import {
  users,
  documents,
  documentShares,
  emailForwards,
  userForwardingMappings,
  stripeWebhooks,
  categories,
  expiryReminders,
  blogPosts,
  featureFlags,
  featureFlagOverrides,
  featureFlagEvents,
  documentInsights,
  type User,
  type InsertUser,
  type Document,
  type InsertDocument,
  type DocumentShare,
  type InsertDocumentShare,
  type EmailForward,
  type InsertEmailForward,
  type Category,
  type InsertCategory,
  type UserForwardingMapping,
  type InsertUserForwardingMapping,
  type ExpiryReminder,
  type InsertExpiryReminder,
  type StripeWebhook,
  type InsertStripeWebhook,
  type FeatureFlag,
  type InsertFeatureFlag,
  type FeatureFlagOverride,
  type InsertFeatureFlagOverride,
  type FeatureFlagEvent,
  type InsertFeatureFlagEvent,
  type DocumentInsight,
  type InsertDocumentInsight,
} from "@shared/schema";

// Add blog post types
type BlogPost = typeof blogPosts.$inferSelect;
type InsertBlogPost = typeof blogPosts.$inferInsert;
import { db } from "./db";
import { safeQuery, safeTransaction, checkDatabaseHealth } from "./db-connection";
import { eq, desc, ilike, and, inArray, isNotNull, gte, lte, sql, or } from "drizzle-orm";

export interface IStorage {
  // User operations (email/password auth only)
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>; // DOC-302: Added getUserById method
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  
  // Category operations
  getCategories(userId: string): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, userId: string, updates: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number, userId: string): Promise<void>;
  
  // Document operations
  getDocuments(userId: string, categoryId?: number, search?: string, expiryFilter?: 'expired' | 'expiring-soon' | 'this-month'): Promise<Document[]>;
  getDocument(id: number, userId: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  deleteDocument(id: number, userId: string): Promise<void>;
  updateDocumentName(id: number, userId: string, newName: string): Promise<Document | undefined>;
  updateDocument(id: number, userId: string, updates: { name?: string; expiryDate?: string | null }): Promise<Document | undefined>;
  updateDocumentOCR(id: number, userId: string, extractedText: string): Promise<Document | undefined>;
  updateDocumentOCRAndSummary(id: number, userId: string, extractedText: string, summary: string): Promise<Document | undefined>;
  updateDocumentSummary(id: number, userId: string, summary: string): Promise<void>;
  updateDocumentTags(id: number, userId: string, tags: string[]): Promise<void>;


  
  // Document sharing operations
  shareDocument(documentId: number, sharedByUserId: string, sharedWithEmail: string, permissions: 'view' | 'edit'): Promise<DocumentShare>;
  unshareDocument(shareId: number, userId: string): Promise<void>;
  getDocumentShares(documentId: number, userId: string): Promise<DocumentShare[]>;
  getSharedWithMeDocuments(userId: string): Promise<Document[]>;
  canAccessDocument(documentId: number, userId: string): Promise<boolean>;
  
  // Encryption operations
  updateDocumentEncryptionKey(documentId: number, encryptedKey: string): Promise<void>;
  getDocumentsWithEncryptionKeys(): Promise<Array<{ id: number; encryptedDocumentKey: string | null }>>;
  getEncryptionStats(): Promise<{ totalDocuments: number; encryptedDocuments: number; unencryptedDocuments: number }>;
  
  // Email forwarding operations
  createEmailForward(emailForward: InsertEmailForward): Promise<EmailForward>;
  updateEmailForward(id: number, updates: Partial<InsertEmailForward>): Promise<EmailForward | undefined>;
  getEmailForwards(userId: string): Promise<EmailForward[]>;
  
  // User forwarding mapping operations
  getUserForwardingMapping(userId: string): Promise<UserForwardingMapping | undefined>;
  createUserForwardingMapping(mapping: InsertUserForwardingMapping): Promise<UserForwardingMapping>;
  getUserByForwardingHash(emailHash: string): Promise<User | undefined>;
  
  // Search operations
  searchDocuments(userId: string, query: string): Promise<any[]>;

  // Expiry reminder operations
  getExpiryReminders(userId: string): Promise<ExpiryReminder[]>;
  createExpiryReminder(reminder: InsertExpiryReminder): Promise<ExpiryReminder>;
  updateExpiryReminder(id: number, userId: string, updates: Partial<InsertExpiryReminder>): Promise<ExpiryReminder | undefined>;
  deleteExpiryReminder(id: number, userId: string): Promise<void>;
  markReminderCompleted(id: number, userId: string, isCompleted: boolean): Promise<ExpiryReminder | undefined>;

  // Feature flag operations (admin only)
  getAllFeatureFlags(): Promise<FeatureFlag[]>;
  toggleFeatureFlag(flagId: string, enabled: boolean): Promise<void>;
  getFeatureFlagOverrides(): Promise<any[]>;
  getFeatureFlagAnalytics(): Promise<any>;

  // Stripe operations
  createStripeWebhook(webhook: InsertStripeWebhook): Promise<StripeWebhook>;
  getStripeWebhookByEventId(eventId: string): Promise<StripeWebhook | undefined>;
  
  // Blog operations
  getPublishedBlogPosts(): Promise<BlogPost[]>;
  getBlogPostBySlug(slug: string): Promise<BlogPost | undefined>;
  createBlogPost(post: InsertBlogPost): Promise<BlogPost>;
  updateBlogPost(id: number, updates: Partial<InsertBlogPost>): Promise<BlogPost | undefined>;
  deleteBlogPost(id: number): Promise<void>;

  // Encryption operations
  getEncryptionStats(): Promise<{
    totalDocuments: number;
    encryptedDocuments: number;
    unencryptedDocuments: number;
    encryptionPercentage: number;
  }>;
  updateDocumentEncryption(
    id: number,
    userId: string,
    encryptedDocumentKey: string,
    encryptionMetadata: string,
    newFilePath: string
  ): Promise<Document | undefined>;

  // DOC-501: Document insights operations
  createDocumentInsight(insight: InsertDocumentInsight): Promise<DocumentInsight>;
  getDocumentInsights(documentId: number, userId: string): Promise<DocumentInsight[]>;
  deleteDocumentInsight(documentId: number, userId: string, insightId: string): Promise<void>;
}



export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // DOC-302: getUserById method (alias for getUser for compatibility)
  async getUserById(id: string): Promise<User | undefined> {
    return this.getUser(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.stripeCustomerId, customerId));
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Category operations
  async getCategories(userId: string): Promise<Category[]> {
    return await db.select().from(categories).where(eq(categories.userId, userId)).orderBy(categories.name);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  async updateCategory(id: number, userId: string, updates: Partial<InsertCategory>): Promise<Category | undefined> {
    const [updatedCategory] = await db
      .update(categories)
      .set(updates)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning();
    return updatedCategory;
  }

  async deleteCategory(id: number, userId: string): Promise<void> {
    // First, set all user's documents with this category to null (uncategorized)
    await db
      .update(documents)
      .set({ categoryId: null })
      .where(and(eq(documents.categoryId, id), eq(documents.userId, userId)));
    
    // Then delete the category (only if owned by user)
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  }

  // Document operations
  async getDocuments(userId: string, categoryId?: number, search?: string, expiryFilter?: 'expired' | 'expiring-soon' | 'this-month'): Promise<Document[]> {
    const conditions = [eq(documents.userId, userId)];
    
    if (categoryId) {
      conditions.push(eq(documents.categoryId, categoryId));
    }
    
    if (search) {
      conditions.push(
        sql`(${documents.name} ILIKE ${`%${search}%`} OR ${documents.extractedText} ILIKE ${`%${search}%`})`
      );
    }
    
    // Add expiry filter conditions
    if (expiryFilter) {
      const today = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(today.getDate() + 7);
      
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      switch (expiryFilter) {
        case 'expired':
          conditions.push(
            and(
              isNotNull(documents.expiryDate),
              lte(documents.expiryDate, today)
            )!
          );
          break;
        case 'expiring-soon':
          conditions.push(
            and(
              isNotNull(documents.expiryDate),
              gte(documents.expiryDate, today),
              lte(documents.expiryDate, sevenDaysFromNow)
            )!
          );
          break;
        case 'this-month':
          conditions.push(
            and(
              isNotNull(documents.expiryDate),
              gte(documents.expiryDate, today),
              lte(documents.expiryDate, endOfMonth)
            )!
          );
          break;
      }
    }
    
    return await db
      .select()
      .from(documents)
      .where(and(...conditions))
      .orderBy(desc(documents.uploadedAt));
  }

  async getDocument(id: number, userId: string): Promise<Document | undefined> {
    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
    return document;
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }

  async deleteDocument(id: number, userId: string): Promise<void> {
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }

  async updateDocumentName(id: number, userId: string, newName: string): Promise<Document | undefined> {
    const [updatedDoc] = await db
      .update(documents)
      .set({ name: newName })
      .where(
        and(eq(documents.id, id), eq(documents.userId, userId))
      )
      .returning();
    
    return updatedDoc;
  }

  async updateDocument(id: number, userId: string, updates: { name?: string; expiryDate?: string | null }): Promise<Document | undefined> {
    const updateData: any = {};
    
    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }
    
    if (updates.expiryDate !== undefined) {
      // Convert string date to Date object, or set to null
      if (updates.expiryDate === null || updates.expiryDate === '') {
        updateData.expiryDate = null;
      } else {
        updateData.expiryDate = new Date(updates.expiryDate);
      }
    }
    
    const [updatedDoc] = await db
      .update(documents)
      .set(updateData)
      .where(
        and(eq(documents.id, id), eq(documents.userId, userId))
      )
      .returning();
    
    return updatedDoc;
  }

  async updateDocumentOCR(id: number, userId: string, extractedText: string): Promise<Document | undefined> {
    const [updatedDoc] = await db
      .update(documents)
      .set({ 
        extractedText,
        ocrProcessed: true 
      })
      .where(
        and(eq(documents.id, id), eq(documents.userId, userId))
      )
      .returning();
    
    return updatedDoc;
  }

  async updateDocumentOCRAndSummary(id: number, userId: string, extractedText: string, summary: string): Promise<Document | undefined> {
    const [updatedDoc] = await db
      .update(documents)
      .set({ 
        extractedText,
        summary,
        ocrProcessed: true 
      })
      .where(
        and(eq(documents.id, id), eq(documents.userId, userId))
      )
      .returning();
    
    return updatedDoc;
  }

  async updateDocumentSummary(id: number, userId: string, summary: string): Promise<void> {
    await db
      .update(documents)
      .set({ summary })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }

  async updateDocumentTags(id: number, userId: string, tags: string[]): Promise<void> {
    await db
      .update(documents)
      .set({ tags })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }







  // Document sharing methods
  async shareDocument(documentId: number, sharedByUserId: string, sharedWithEmail: string, permissions: 'view' | 'edit' = 'view'): Promise<DocumentShare> {
    // Check if document exists and belongs to the user
    const document = await this.getDocument(documentId, sharedByUserId);
    if (!document) {
      throw new Error("Document not found or access denied");
    }

    // Check if already shared with this email
    const existingShare = await db
      .select()
      .from(documentShares)
      .where(
        and(
          eq(documentShares.documentId, documentId),
          eq(documentShares.sharedWithEmail, sharedWithEmail)
        )
      );

    if (existingShare.length > 0) {
      throw new Error("Document is already shared with this email");
    }

    // Find user by email if they exist
    const [sharedWithUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, sharedWithEmail));

    const [newShare] = await db
      .insert(documentShares)
      .values({
        documentId,
        sharedByUserId,
        sharedWithEmail,
        sharedWithUserId: sharedWithUser?.id || null,
        permissions,
      })
      .returning();

    return newShare;
  }

  async unshareDocument(shareId: number, userId: string): Promise<void> {
    // Only allow the document owner to unshare
    await db
      .delete(documentShares)
      .where(
        and(
          eq(documentShares.id, shareId),
          eq(documentShares.sharedByUserId, userId)
        )
      );
  }

  async getDocumentShares(documentId: number, userId: string): Promise<DocumentShare[]> {
    // Only allow document owner to see shares
    const document = await this.getDocument(documentId, userId);
    if (!document) {
      throw new Error("Document not found or access denied");
    }

    return await db
      .select()
      .from(documentShares)
      .where(eq(documentShares.documentId, documentId))
      .orderBy(desc(documentShares.sharedAt));
  }

  async getSharedWithMeDocuments(userId: string): Promise<Document[]> {
    // Get user's email to find documents shared with them
    const user = await this.getUser(userId);
    if (!user?.email) {
      return [];
    }

    const sharedDocuments = await db
      .select({
        id: documents.id,
        userId: documents.userId,
        categoryId: documents.categoryId,
        name: documents.name,
        fileName: documents.fileName,
        filePath: documents.filePath,
        fileSize: documents.fileSize,
        mimeType: documents.mimeType,
        tags: documents.tags,
        expiryDate: documents.expiryDate,
        extractedText: documents.extractedText,
        summary: documents.summary,
        ocrProcessed: documents.ocrProcessed,
        uploadedAt: documents.uploadedAt,
        encryptedDocumentKey: documents.encryptedDocumentKey,
        encryptionMetadata: documents.encryptionMetadata,
        isEncrypted: documents.isEncrypted,
      })
      .from(documents)
      .innerJoin(documentShares, eq(documents.id, documentShares.documentId))
      .where(
        or(
          eq(documentShares.sharedWithEmail, user.email),
          eq(documentShares.sharedWithUserId, userId)
        )
      )
      .orderBy(desc(documents.uploadedAt));

    return sharedDocuments;
  }

  async canAccessDocument(documentId: number, userId: string): Promise<boolean> {
    // Check if user owns the document
    const ownedDocument = await this.getDocument(documentId, userId);
    if (ownedDocument) {
      return true;
    }

    // Check if document is shared with user
    const user = await this.getUser(userId);
    if (!user?.email) {
      return false;
    }

    const [sharedDocument] = await db
      .select()
      .from(documentShares)
      .where(
        and(
          eq(documentShares.documentId, documentId),
          or(
            eq(documentShares.sharedWithEmail, user.email),
            eq(documentShares.sharedWithUserId, userId)
          )
        )
      );

    return !!sharedDocument;
  }

  // Email forwarding methods
  async createEmailForward(emailForward: InsertEmailForward): Promise<EmailForward> {
    const [newEmailForward] = await db
      .insert(emailForwards)
      .values(emailForward)
      .returning();
    return newEmailForward;
  }

  async updateEmailForward(id: number, updates: Partial<InsertEmailForward>): Promise<EmailForward | undefined> {
    const [updatedEmailForward] = await db
      .update(emailForwards)
      .set(updates)
      .where(eq(emailForwards.id, id))
      .returning();
    return updatedEmailForward;
  }

  async getEmailForwards(userId: string): Promise<EmailForward[]> {
    return await db
      .select()
      .from(emailForwards)
      .where(eq(emailForwards.userId, userId))
      .orderBy(desc(emailForwards.processedAt));
  }

  // Smart search implementation
  async searchDocuments(userId: string, query: string): Promise<any[]> {
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 1);
    
    if (searchTerms.length === 0) {
      return [];
    }

    // Build dynamic search conditions
    const searchConditions: any[] = [];
    
    for (const term of searchTerms) {
      searchConditions.push(
        or(
          ilike(documents.name, `%${term}%`),
          ilike(documents.fileName, `%${term}%`),
          ilike(documents.extractedText, `%${term}%`),
          ilike(documents.summary, `%${term}%`),
          sql`${documents.tags}::text ILIKE ${'%' + term + '%'}`
        )
      );
    }

    const results = await db
      .select({
        id: documents.id,
        userId: documents.userId,
        categoryId: documents.categoryId,
        name: documents.name,
        fileName: documents.fileName,
        filePath: documents.filePath,
        fileSize: documents.fileSize,
        mimeType: documents.mimeType,
        tags: documents.tags,
        expiryDate: documents.expiryDate,
        extractedText: documents.extractedText,
        summary: documents.summary,
        ocrProcessed: documents.ocrProcessed,
        uploadedAt: documents.uploadedAt,
        categoryName: categories.name,
      })
      .from(documents)
      .leftJoin(categories, eq(documents.categoryId, categories.id))
      .where(
        and(
          eq(documents.userId, userId),
          or(...searchConditions)
        )
      )
      .orderBy(desc(documents.uploadedAt))
      .limit(20);

    // Enhance results with match information and snippets
    return results.map(doc => {
      const lowerName = doc.name.toLowerCase();
      const lowerFileName = doc.fileName.toLowerCase();
      const lowerExtractedText = (doc.extractedText || '').toLowerCase();
      const lowerSummary = (doc.summary || '').toLowerCase();
      const tagsText = (doc.tags || []).join(' ').toLowerCase();
      const categoryName = (doc.categoryName || '').toLowerCase();
      
      let matchType = 'name';
      let snippet = '';

      // Determine primary match type
      if (searchTerms.some(term => lowerName.includes(term))) {
        matchType = 'name';
      } else if (searchTerms.some(term => categoryName.includes(term))) {
        matchType = 'category';
      } else if (searchTerms.some(term => tagsText.includes(term))) {
        matchType = 'tag';
      } else if (searchTerms.some(term => lowerSummary.includes(term))) {
        matchType = 'summary';
        // Create snippet from summary
        const matchingTerm = searchTerms.find(term => lowerSummary.includes(term));
        if (matchingTerm && doc.summary) {
          const index = lowerSummary.indexOf(matchingTerm);
          const start = Math.max(0, index - 50);
          const end = Math.min(doc.summary.length, index + matchingTerm.length + 50);
          snippet = doc.summary.substring(start, end);
          if (start > 0) snippet = '...' + snippet;
          if (end < doc.summary.length) snippet = snippet + '...';
        }
      } else if (searchTerms.some(term => lowerExtractedText.includes(term))) {
        matchType = 'content';
        // Create snippet from extracted text
        const matchingTerm = searchTerms.find(term => lowerExtractedText.includes(term));
        if (matchingTerm && doc.extractedText) {
          const index = lowerExtractedText.indexOf(matchingTerm);
          const start = Math.max(0, index - 50);
          const end = Math.min(doc.extractedText.length, index + matchingTerm.length + 50);
          snippet = doc.extractedText.substring(start, end);
          if (start > 0) snippet = '...' + snippet;
          if (end < doc.extractedText.length) snippet = snippet + '...';
        }
      }

      return {
        ...doc,
        categoryName: doc.categoryName,
        matchType,
        snippet: snippet || (doc.summary ? doc.summary.substring(0, 150) + '...' : (doc.extractedText ? doc.extractedText.substring(0, 100) + '...' : '')),
      };
    });
  }

  // User forwarding mapping operations
  async getUserForwardingMapping(userId: string): Promise<UserForwardingMapping | undefined> {
    const [mapping] = await db
      .select()
      .from(userForwardingMappings)
      .where(eq(userForwardingMappings.userId, userId));
    return mapping;
  }

  async createUserForwardingMapping(mapping: InsertUserForwardingMapping): Promise<UserForwardingMapping> {
    const [newMapping] = await db
      .insert(userForwardingMappings)
      .values(mapping)
      .returning();
    return newMapping;
  }

  async getUserByForwardingHash(emailHash: string): Promise<User | undefined> {
    const result = await db
      .select({ user: users })
      .from(userForwardingMappings)
      .innerJoin(users, eq(userForwardingMappings.userId, users.id))
      .where(eq(userForwardingMappings.emailHash, emailHash));
    
    return result[0]?.user;
  }

  // Expiry reminder operations
  async getExpiryReminders(userId: string): Promise<ExpiryReminder[]> {
    return await db
      .select()
      .from(expiryReminders)
      .where(eq(expiryReminders.userId, userId))
      .orderBy(expiryReminders.expiryDate);
  }

  async createExpiryReminder(reminder: InsertExpiryReminder): Promise<ExpiryReminder> {
    const [newReminder] = await db
      .insert(expiryReminders)
      .values(reminder)
      .returning();
    return newReminder;
  }

  async updateExpiryReminder(id: number, userId: string, updates: Partial<InsertExpiryReminder>): Promise<ExpiryReminder | undefined> {
    const [updatedReminder] = await db
      .update(expiryReminders)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(expiryReminders.id, id), eq(expiryReminders.userId, userId)))
      .returning();
    return updatedReminder;
  }

  async deleteExpiryReminder(id: number, userId: string): Promise<void> {
    await db
      .delete(expiryReminders)
      .where(and(eq(expiryReminders.id, id), eq(expiryReminders.userId, userId)));
  }

  async markReminderCompleted(id: number, userId: string, isCompleted: boolean): Promise<ExpiryReminder | undefined> {
    const [updatedReminder] = await db
      .update(expiryReminders)
      .set({ isCompleted, updatedAt: new Date() })
      .where(and(eq(expiryReminders.id, id), eq(expiryReminders.userId, userId)))
      .returning();
    return updatedReminder;
  }

  // Admin functions
  async updateUserLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getAdminStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalDocuments: number;
    totalStorageBytes: number;
    uploadsThisMonth: number;
    newUsersThisMonth: number;
  }> {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const allUsers = await db.select().from(users);
    const allDocuments = await db.select().from(documents);
    
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(u => u.isActive).length;
    const totalDocuments = allDocuments.length;
    const totalStorageBytes = allDocuments.reduce((sum, doc) => sum + doc.fileSize, 0);
    
    const uploadsThisMonth = allDocuments.filter(doc => 
      doc.uploadedAt && new Date(doc.uploadedAt) >= firstDayOfMonth
    ).length;
    
    const newUsersThisMonth = allUsers.filter(user => 
      user.createdAt && new Date(user.createdAt) >= firstDayOfMonth
    ).length;

    return {
      totalUsers,
      activeUsers,
      totalDocuments,
      totalStorageBytes,
      uploadsThisMonth,
      newUsersThisMonth,
    };
  }

  async getAllUsersWithStats(): Promise<Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isActive: boolean;
    documentCount: number;
    storageUsed: number;
    lastLoginAt: Date | null;
    createdAt: Date | null;
  }>> {
    const allUsers = await db.select().from(users);
    const allDocuments = await db.select().from(documents);
    
    return allUsers.map(user => {
      const userDocs = allDocuments.filter(doc => doc.userId === user.id);
      const documentCount = userDocs.length;
      const storageUsed = userDocs.reduce((sum, doc) => sum + doc.fileSize, 0);
      
      return {
        ...user,
        documentCount,
        storageUsed,
      };
    });
  }

  async getSystemActivities(): Promise<Array<{
    id: number;
    type: 'user_registered' | 'document_uploaded' | 'user_login';
    description: string;
    userId: string;
    userEmail: string;
    timestamp: Date;
  }>> {
    const recentUsers = await db.select().from(users)
      .orderBy(desc(users.createdAt))
      .limit(10);
    
    const recentDocuments = await db.select({
      id: documents.id,
      name: documents.name,
      userId: documents.userId,
      uploadedAt: documents.uploadedAt,
    }).from(documents)
      .orderBy(desc(documents.uploadedAt))
      .limit(20);

    const activities: Array<{
      id: number;
      type: 'user_registered' | 'document_uploaded' | 'user_login';
      description: string;
      userId: string;
      userEmail: string;
      timestamp: Date;
    }> = [];

    // Add user registrations
    recentUsers.forEach((user, index) => {
      if (user.createdAt) {
        activities.push({
          id: index + 1000,
          type: 'user_registered',
          description: `New user registered`,
          userId: user.id,
          userEmail: user.email,
          timestamp: user.createdAt,
        });
      }
    });

    // Add document uploads
    for (const doc of recentDocuments) {
      if (doc.uploadedAt) {
        const user = recentUsers.find(u => u.id === doc.userId);
        if (user) {
          activities.push({
            id: doc.id + 2000,
            type: 'document_uploaded',
            description: `Uploaded document: ${doc.name}`,
            userId: doc.userId,
            userEmail: user.email,
            timestamp: doc.uploadedAt,
          });
        }
      }
    }

    return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 20);
  }
  // Stripe operations
  async createStripeWebhook(webhook: InsertStripeWebhook): Promise<StripeWebhook> {
    const [result] = await db.insert(stripeWebhooks).values(webhook).returning();
    return result;
  }

  async getStripeWebhookByEventId(eventId: string): Promise<StripeWebhook | undefined> {
    const [webhook] = await db
      .select()
      .from(stripeWebhooks)
      .where(eq(stripeWebhooks.eventId, eventId));
    return webhook;
  }

  // Blog operations
  async getPublishedBlogPosts(): Promise<BlogPost[]> {
    return await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.published, true))
      .orderBy(desc(blogPosts.publishedAt));
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
    const [post] = await db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.published, true)));
    return post;
  }

  async createBlogPost(post: InsertBlogPost): Promise<BlogPost> {
    const [newPost] = await db
      .insert(blogPosts)
      .values({
        ...post,
        publishedAt: post.published ? new Date() : null,
        updatedAt: new Date(),
      })
      .returning();
    return newPost;
  }

  async updateBlogPost(id: number, updates: Partial<InsertBlogPost>): Promise<BlogPost | undefined> {
    const [updatedPost] = await db
      .update(blogPosts)
      .set({
        ...updates,
        publishedAt: updates.published ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, id))
      .returning();
    return updatedPost;
  }

  async deleteBlogPost(id: number): Promise<void> {
    await db
      .delete(blogPosts)
      .where(eq(blogPosts.id, id));
  }

  // Encryption operations
  async updateDocumentEncryptionKey(documentId: number, encryptedKey: string): Promise<void> {
    await db
      .update(documents)
      .set({ 
        encryptedDocumentKey: encryptedKey,
        isEncrypted: true 
      })
      .where(eq(documents.id, documentId));
  }

  async getDocumentsWithEncryptionKeys(): Promise<Array<{ id: number; encryptedDocumentKey: string | null }>> {
    return await db
      .select({
        id: documents.id,
        encryptedDocumentKey: documents.encryptedDocumentKey,
      })
      .from(documents)
      .where(isNotNull(documents.encryptedDocumentKey));
  }

  async getEncryptionStats(): Promise<{
    totalDocuments: number;
    encryptedDocuments: number;
    unencryptedDocuments: number;
    encryptionPercentage: number;
  }> {
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(documents);
    
    const encryptedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(and(
        eq(documents.isEncrypted, true),
        isNotNull(documents.encryptedDocumentKey)
      ));

    const totalDocuments = totalResult[0]?.count || 0;
    const encryptedDocuments = encryptedResult[0]?.count || 0;
    const unencryptedDocuments = totalDocuments - encryptedDocuments;
    const encryptionPercentage = totalDocuments > 0 ? Math.round((encryptedDocuments / totalDocuments) * 100) : 0;

    return {
      totalDocuments,
      encryptedDocuments,
      unencryptedDocuments,
      encryptionPercentage
    };
  }

  async updateDocumentEncryption(
    id: number,
    userId: string,
    encryptedDocumentKey: string,
    encryptionMetadata: string,
    newFilePath: string
  ): Promise<Document | undefined> {
    const [updatedDocument] = await db
      .update(documents)
      .set({
        encryptedDocumentKey,
        encryptionMetadata,
        filePath: newFilePath,
        isEncrypted: true
      })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return updatedDocument;
  }

  // ===== FEATURE FLAG OPERATIONS =====

  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    return await db.select().from(featureFlags).orderBy(featureFlags.category, featureFlags.name);
  }

  async toggleFeatureFlag(flagId: string, enabled: boolean): Promise<void> {
    await db
      .update(featureFlags)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(featureFlags.id, flagId));
  }

  async getFeatureFlagOverrides(): Promise<any[]> {
    const overrides = await db
      .select({
        id: featureFlagOverrides.id,
        userId: featureFlagOverrides.userId,
        userEmail: users.email,
        featureFlagName: featureFlags.name,
        isEnabled: featureFlagOverrides.isEnabled,
        overrideReason: featureFlagOverrides.overrideReason,
        expiresAt: featureFlagOverrides.expiresAt,
        createdAt: featureFlagOverrides.createdAt,
      })
      .from(featureFlagOverrides)
      .innerJoin(featureFlags, eq(featureFlagOverrides.featureFlagId, featureFlags.id))
      .innerJoin(users, eq(featureFlagOverrides.userId, users.id))
      .orderBy(featureFlagOverrides.createdAt);

    return overrides;
  }

  async getFeatureFlagAnalytics(): Promise<any> {
    // Get basic stats
    const totalFlags = await db.select({ count: sql<number>`count(*)` }).from(featureFlags);
    const activeFlags = await db.select({ count: sql<number>`count(*)` }).from(featureFlags).where(eq(featureFlags.enabled, true));
    const totalOverrides = await db.select({ count: sql<number>`count(*)` }).from(featureFlagOverrides);
    const premiumFlags = await db.select({ count: sql<number>`count(*)` }).from(featureFlags).where(eq(featureFlags.tierRequired, 'premium'));

    return {
      totalFlags: totalFlags[0]?.count || 0,
      activeFlags: activeFlags[0]?.count || 0,
      totalOverrides: totalOverrides[0]?.count || 0,
      premiumFlags: premiumFlags[0]?.count || 0,
    };
  }

  // Health check method
  async checkDatabaseHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: string;
    circuitState: string;
  }> {
    return await checkDatabaseHealth();
  }

  // DOC-501: Document insights operations
  async createDocumentInsight(insight: InsertDocumentInsight): Promise<DocumentInsight> {
    const [newInsight] = await db
      .insert(documentInsights)
      .values(insight)
      .returning();
    return newInsight;
  }

  async getDocumentInsights(documentId: number, userId: string): Promise<DocumentInsight[]> {
    return await db
      .select()
      .from(documentInsights)
      .where(
        and(
          eq(documentInsights.documentId, documentId),
          eq(documentInsights.userId, userId)
        )
      )
      .orderBy(documentInsights.priority, documentInsights.createdAt);
  }

  async deleteDocumentInsight(documentId: number, userId: string, insightId: string): Promise<void> {
    await db
      .delete(documentInsights)
      .where(
        and(
          eq(documentInsights.documentId, documentId),
          eq(documentInsights.userId, userId),
          eq(documentInsights.insightId, insightId)
        )
      );
  }
}

export const storage = new DatabaseStorage();
