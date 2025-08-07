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
  userAssets,
  manualTrackedEvents,
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
  type UserAsset,
  type InsertUserAsset,
  type ManualTrackedEvent,
  type InsertManualTrackedEvent,
  vehicles,
  type Vehicle,
  type InsertVehicle,
} from "@shared/schema";

// Add blog post types
type BlogPost = typeof blogPosts.$inferSelect;
type InsertBlogPost = typeof blogPosts.$inferInsert;
import { db } from "./db";
import { safeTransaction, checkDatabaseHealth } from "./db-connection";

// Drizzle-compatible safe query wrapper
const safeQuery = async <T>(callback: () => Promise<T>): Promise<T | []> => {
  try {
    return await callback();
  } catch (error) {
    console.error('Database query failed:', error);
    // Return empty array as fallback for arrays, null for single items
    return [] as any;
  }
};
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
  updateDocument(id: number, userId: string, updates: { name?: string; expiryDate?: string | null; filePath?: string; gcsPath?: string; encryptedDocumentKey?: string; encryptionMetadata?: string; isEncrypted?: boolean; status?: string }): Promise<Document | undefined>;
  updateDocumentOCR(id: number, userId: string, extractedText: string): Promise<Document | undefined>;
  updateDocumentOCRAndSummary(id: number, userId: string, extractedText: string, summary: string): Promise<Document | undefined>;
  updateDocumentOCRStatus(id: number, userId: string, ocrStatus: { status: string; ocrProcessed: boolean; extractedText: string | null }): Promise<Document | undefined>;
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
  
  // Insight operations  
  createDocumentInsight(insight: InsertDocumentInsight): Promise<DocumentInsight>;
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
  
  // TICKET 4: AI Insights Dashboard operations
  getInsights(userId: string, status?: string, type?: string, priority?: string): Promise<DocumentInsight[]>;
  updateInsightStatus(insightId: string, userId: string, status: 'open' | 'dismissed' | 'resolved'): Promise<DocumentInsight | undefined>;
  deleteInsight(insightId: string, userId: string): Promise<DocumentInsight | undefined>;
  
  // User Assets operations
  getUserAssets(userId: string): Promise<UserAsset[]>;
  createUserAsset(asset: InsertUserAsset & { userId: string }): Promise<UserAsset>;
  deleteUserAsset(id: number, userId: string): Promise<void>;

  // Manual Tracked Events operations (TICKET B1)
  getManualTrackedEvents(userId: string): Promise<ManualTrackedEvent[]>;
  getManualTrackedEvent(id: string, userId: string): Promise<ManualTrackedEvent | undefined>;
  createManualTrackedEvent(event: InsertManualTrackedEvent & { createdBy: string }): Promise<ManualTrackedEvent>;
  updateManualTrackedEvent(id: string, userId: string, updates: Partial<InsertManualTrackedEvent>): Promise<ManualTrackedEvent | undefined>;
  deleteManualTrackedEvent(id: string, userId: string): Promise<void>;

  // Vehicle operations (TICKET 1 & 2)
  getVehicles(userId: string): Promise<Vehicle[]>;
  getVehicle(id: string, userId: string): Promise<Vehicle | undefined>;
  getVehicleByVRN(vrn: string, userId: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, userId: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: string, userId: string): Promise<void>;

  // Admin operations
  getAdminStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalDocuments: number;
    totalStorageBytes: number;
    uploadsThisMonth: number;
    newUsersThisMonth: number;
  }>;
  getAllUsersWithStats(): Promise<Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isActive: boolean;
    documentCount: number;
    storageUsed: number;
    lastLoginAt: string | null;
    createdAt: string;
  }>>;
  getSystemActivities(severity?: string): Promise<Array<{
    id: number;
    type: string;
    description: string;
    userId: string;
    userEmail: string;
    severity: string;
    metadata?: Record<string, any>;
    timestamp: string;
  }>>;
  updateUserStatus(userId: string, isActive: boolean): Promise<void>;
  getSearchAnalytics(timeRange?: string, tierFilter?: string): Promise<{
    totalSearches: number;
    uniqueUsers: number;
    noResultRate: number;
    averageResultsPerQuery: number;
    topQueries: Array<{
      query: string;
      count: number;
      resultCount: number;
      lastSearched: string;
    }>;
    searchesByTier: {
      free: number;
      premium: number;
    };
    searchesByTimeRange: Array<{
      date: string;
      searches: number;
    }>;
  }>;
  getGCSUsage(): Promise<{
    totalStorageGB: number;
    totalStorageTB: number;
    costThisMonth: number;
    requestsThisMonth: number;
    bandwidthGB: number;
    trend: 'up' | 'down' | 'stable';
    trendPercentage: number;
  }>;
  getOpenAIUsage(): Promise<{
    totalTokens: number;
    costThisMonth: number;
    requestsThisMonth: number;
    modelBreakdown: Array<{
      model: string;
      tokens: number;
      cost: number;
      requests: number;
    }>;
    trend: 'up' | 'down' | 'stable';
    trendPercentage: number;
  }>;
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

  async updateDocument(id: number, userId: string, updates: { name?: string; expiryDate?: string | null; filePath?: string; gcsPath?: string; encryptedDocumentKey?: string; encryptionMetadata?: string; isEncrypted?: boolean; status?: string }): Promise<Document | undefined> {
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
    
    // TICKET 5: Support additional fields for email document processing
    if (updates.filePath !== undefined) {
      updateData.filePath = updates.filePath;
    }
    
    if (updates.gcsPath !== undefined) {
      updateData.gcsPath = updates.gcsPath;
    }
    
    if (updates.encryptedDocumentKey !== undefined) {
      updateData.encryptedDocumentKey = updates.encryptedDocumentKey;
    }
    
    if (updates.encryptionMetadata !== undefined) {
      updateData.encryptionMetadata = updates.encryptionMetadata;
    }
    
    if (updates.isEncrypted !== undefined) {
      updateData.isEncrypted = updates.isEncrypted;
    }
    
    if (updates.status !== undefined) {
      updateData.status = updates.status;
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

  // TICKET 5: Update document OCR status for browser scan failures
  async updateDocumentOCRStatus(id: number, userId: string, ocrStatus: { status: string; ocrProcessed: boolean; extractedText: string | null }): Promise<Document | undefined> {
    const [updatedDoc] = await db
      .update(documents)
      .set({ 
        status: ocrStatus.status,
        ocrProcessed: ocrStatus.ocrProcessed,
        extractedText: ocrStatus.extractedText
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
        gcsPath: documents.gcsPath,
        uploadSource: documents.uploadSource,
        status: documents.status,
        categorizationSource: documents.categorizationSource,
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
      newUsersThisMonth
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
    lastLoginAt: string | null;
    createdAt: string;
  }>> {
    const allUsers = await db.select().from(users);
    const allDocuments = await db.select().from(documents);
    
    return allUsers.map(user => {
      const userDocs = allDocuments.filter(doc => doc.userId === user.id);
      const documentCount = userDocs.length;
      const storageUsed = userDocs.reduce((sum, doc) => sum + doc.fileSize, 0);
      
      return {
        id: user.id,
        email: user.email || '',
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        documentCount,
        storageUsed,
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
        createdAt: user.createdAt?.toISOString() || new Date().toISOString()
      };
    });
  }

  async getSystemActivities(severity?: string): Promise<Array<{
    id: number;
    type: string;
    description: string;
    userId: string;
    userEmail: string;
    severity: string;
    metadata?: Record<string, any>;
    timestamp: string;
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
      type: string;
      description: string;
      userId: string;
      userEmail: string;
      severity: string;
      metadata?: Record<string, any>;
      timestamp: string;
    }> = [];

    // Add user registrations
    recentUsers.forEach((user, index) => {
      if (user.createdAt) {
        activities.push({
          id: index + 1000,
          type: 'user_registered',
          description: `New user registered`,
          userId: user.id,
          userEmail: user.email || '',
          severity: 'info',
          timestamp: user.createdAt?.toISOString() || new Date().toISOString(),
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
            userEmail: user.email || '',
            severity: 'info',
            timestamp: doc.uploadedAt?.toISOString() || new Date().toISOString(),
          });
        }
      }
    }

    const sortedActivities = activities.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, 20);

    // Filter by severity if provided
    if (severity) {
      return sortedActivities.filter(activity => activity.severity === severity);
    }

    return sortedActivities;
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
    console.log('🔍 [INSIGHT DEBUG] Creating insight with values:', {
      id: insight.id,
      documentId: insight.documentId,
      documentIdType: typeof insight.documentId,
      userId: insight.userId,
      userIdType: typeof insight.userId,
      type: insight.type,
      priority: insight.priority,
      tier: insight.tier,
      confidence: insight.confidence,
      confidenceType: typeof insight.confidence,
      fullInsight: JSON.stringify(insight, null, 2)
    });
    
    // Validate and sanitize critical fields before database insertion
    if (insight.documentId !== null && insight.documentId !== undefined) {
      if (typeof insight.documentId === 'string') {
        const parsed = parseInt(insight.documentId);
        if (isNaN(parsed)) {
          console.error('❌ [INSIGHT_TYPE_ERROR] documentId string is not parseable:', insight.documentId);
          throw new Error(`Invalid documentId: cannot parse "${insight.documentId}" to integer`);
        }
        insight.documentId = parsed;
        console.log('🔧 [INSIGHT FIX] Converted documentId from string to number:', parsed);
      } else if (typeof insight.documentId !== 'number') {
        console.error('❌ [INSIGHT_TYPE_ERROR] documentId is not a number:', insight.documentId, 'type:', typeof insight.documentId);
        throw new Error(`Invalid documentId type: expected number, got ${typeof insight.documentId}`);
      }
    }

    // Fix confidence type mismatch - handle string/number conversion
    if (insight.confidence !== null && insight.confidence !== undefined) {
      if (typeof insight.confidence === 'string') {
        const parsed = parseFloat(insight.confidence);
        if (isNaN(parsed)) {
          console.error('❌ [INSIGHT_TYPE_ERROR] confidence string is not parseable:', insight.confidence);
          throw new Error(`Invalid confidence: cannot parse "${insight.confidence}" to numeric`);
        }
        (insight as any).confidence = parsed;
        console.log('🔧 [INSIGHT FIX] Converted confidence from string to number:', parsed);
      } else if (typeof insight.confidence !== 'number') {
        console.error('❌ [INSIGHT_TYPE_ERROR] confidence is not a number:', insight.confidence, 'type:', typeof insight.confidence);
        throw new Error(`Invalid confidence type: expected number, got ${typeof insight.confidence}`);
      }
      
      // Clamp confidence to 0-100 range
      const numericConfidence = insight.confidence as number;
      if (numericConfidence > 100) {
        (insight as any).confidence = 100;
        console.log('🔧 [INSIGHT FIX] Clamped confidence to max 100');
      } else if (numericConfidence < 0) {
        (insight as any).confidence = 0;
        console.log('🔧 [INSIGHT FIX] Clamped confidence to min 0');
      }
    }
    
    try {
      const [newInsight] = await db
        .insert(documentInsights)
        .values(insight)
        .returning();
        
      console.log('✅ [INSIGHT DEBUG] Successfully created insight:', newInsight.id);
      return newInsight;
    } catch (dbError: any) {
      console.error('❌ [INSIGHT_TYPE_ERROR] Database insertion failed:', {
        error: dbError.message,
        code: dbError.code,
        insight: {
          documentId: insight.documentId,
          confidence: insight.confidence,
          type: insight.type,
          title: insight.title
        }
      });
      
      // Re-throw with structured error for debugging
      throw new Error(`Insight database insertion failed (${dbError.code}): ${dbError.message}`);
    }
  }

  // INSIGHT-102: Get insights for specific document with tier filtering
  async getDocumentInsights(documentId: number, userId: string, tier?: string): Promise<DocumentInsight[]> {
    const conditions = [
      eq(documentInsights.documentId, documentId),
      eq(documentInsights.userId, userId),
      eq(documentInsights.status, 'open') // Only show active insights
    ];
    
    // INSIGHT-102: Filter by tier if specified
    if (tier) {
      conditions.push(eq(documentInsights.tier, tier));
    }

    return await db
      .select()
      .from(documentInsights)
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${documentInsights.priority}
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END`,
        documentInsights.dueDate,
        desc(documentInsights.createdAt)
      );
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

  // TICKET 4: AI Insights Dashboard operations
  async getInsights(userId: string, status?: string, type?: string, priority?: string, tier?: string): Promise<DocumentInsight[]> {
    const conditions = [eq(documentInsights.userId, userId)];
    
    if (status) {
      conditions.push(eq(documentInsights.status, status));
    }
    if (type) {
      conditions.push(eq(documentInsights.type, type));
    }
    if (priority) {
      conditions.push(eq(documentInsights.priority, priority));
    }
    // INSIGHT-101: Add tier filtering
    if (tier) {
      conditions.push(eq(documentInsights.tier, tier));
    }

    return await db
      .select()
      .from(documentInsights)
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${documentInsights.priority}
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END`,
        documentInsights.dueDate,
        desc(documentInsights.createdAt)
      );
  }

  async updateInsightStatus(insightId: string, userId: string, status: 'open' | 'dismissed' | 'resolved'): Promise<DocumentInsight | undefined> {
    console.log(`[STORAGE DEBUG] Updating insight ${insightId} for user ${userId} to status: ${status}`);
    
    // First check if the insight exists
    const existingInsight = await db
      .select()
      .from(documentInsights)
      .where(
        and(
          eq(documentInsights.id, insightId),
          eq(documentInsights.userId, userId)
        )
      )
      .limit(1);
    
    console.log(`[STORAGE DEBUG] Found insight:`, existingInsight[0] ? { id: existingInsight[0].id, currentStatus: existingInsight[0].status } : 'Not found');
    
    if (!existingInsight[0]) {
      console.log(`[STORAGE DEBUG] Insight ${insightId} not found for user ${userId}`);
      return undefined;
    }
    
    const [updatedInsight] = await db
      .update(documentInsights)
      .set({ 
        status,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(documentInsights.id, insightId),
          eq(documentInsights.userId, userId)
        )
      )
      .returning();
    
    console.log(`[STORAGE DEBUG] Updated insight:`, updatedInsight ? { id: updatedInsight.id, newStatus: updatedInsight.status } : 'Update failed');
    return updatedInsight;
  }

  async deleteInsight(insightId: string, userId: string): Promise<DocumentInsight | undefined> {
    const [deletedInsight] = await db
      .delete(documentInsights)
      .where(
        and(
          eq(documentInsights.id, insightId),
          eq(documentInsights.userId, userId)
        )
      )
      .returning();
    
    return deletedInsight;
  }

  // TICKET 8: Get critical insights for homepage dashboard (max 4 items)
  async getCriticalInsights(userId: string): Promise<DocumentInsight[]> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

    // Get expiring soon (limit 2)
    const expiringSoon = await db
      .select()
      .from(documentInsights)
      .where(
        and(
          eq(documentInsights.userId, userId),
          eq(documentInsights.status, 'open'),
          eq(documentInsights.priority, 'high'),
          isNotNull(documentInsights.dueDate),
          sql`${documentInsights.dueDate} >= ${now.toISOString().split('T')[0]}`,
          sql`${documentInsights.dueDate} <= ${thirtyDaysFromNow.toISOString().split('T')[0]}`
        )
      )
      .orderBy(documentInsights.dueDate)
      .limit(2);

    // Get missing or incomplete info
    const missingData = await db
      .select()
      .from(documentInsights)
      .where(
        and(
          eq(documentInsights.userId, userId),
          eq(documentInsights.status, 'open'),
          eq(documentInsights.type, 'missing_data'),
          eq(documentInsights.priority, 'high')
        )
      )
      .orderBy(desc(documentInsights.createdAt))
      .limit(1);

    // Get time-sensitive events
    const timeSensitiveEvents = await db
      .select()
      .from(documentInsights)
      .where(
        and(
          eq(documentInsights.userId, userId),
          eq(documentInsights.status, 'open'),
          eq(documentInsights.type, 'event'),
          isNotNull(documentInsights.dueDate),
          sql`${documentInsights.dueDate} >= ${now.toISOString().split('T')[0]}`,
          sql`${documentInsights.dueDate} <= ${thirtyDaysFromNow.toISOString().split('T')[0]}`
        )
      )
      .orderBy(documentInsights.dueDate)
      .limit(1);

    // Combine and limit to max 4 insights
    const allCritical = [...expiringSoon, ...missingData, ...timeSensitiveEvents];
    
    // Remove duplicates and sort by urgency
    const unique = Array.from(new Map(allCritical.map(insight => [insight.id, insight])).values());
    
    return unique
      .sort((a, b) => {
        // Sort by priority first, then by due date
        const priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 };
        const priorityDiff = (priorityOrder[a.priority as keyof typeof priorityOrder] || 3) - 
                           (priorityOrder[b.priority as keyof typeof priorityOrder] || 3);
        
        if (priorityDiff !== 0) return priorityDiff;
        
        // Then by due date (earliest first)
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        
        // If only one has a due date, prioritize it
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
        
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      })
      .slice(0, 4);
  }

  // User Assets operations
  async getUserAssets(userId: string): Promise<UserAsset[]> {
    return await db
      .select()
      .from(userAssets)
      .where(eq(userAssets.userId, userId))
      .orderBy(userAssets.type, userAssets.name);
  }

  async createUserAsset(asset: InsertUserAsset & { userId: string }): Promise<UserAsset> {
    const [newAsset] = await db
      .insert(userAssets)
      .values({
        ...asset,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newAsset;
  }

  async deleteUserAsset(id: number, userId: string): Promise<void> {
    await db
      .delete(userAssets)
      .where(and(eq(userAssets.id, id), eq(userAssets.userId, userId)));
  }

  // Missing admin methods implementation
  async updateUserStatus(userId: string, isActive: boolean): Promise<void> {
    await db
      .update(users)
      .set({ isActive })
      .where(eq(users.id, userId));
  }

  async getSearchAnalytics(timeRange?: string, tierFilter?: string): Promise<{
    totalSearches: number;
    uniqueUsers: number;
    noResultRate: number;
    averageResultsPerQuery: number;
    topQueries: Array<{
      query: string;
      count: number;
      resultCount: number;
      lastSearched: string;
    }>;
    searchesByTier: {
      free: number;
      premium: number;
    };
    searchesByTimeRange: Array<{
      date: string;
      searches: number;
    }>;
  }> {
    // Mock implementation for now - in production this would query search logs
    return {
      totalSearches: 1250,
      uniqueUsers: 45,
      noResultRate: 0.12,
      averageResultsPerQuery: 3.8,
      topQueries: [
        {
          query: "insurance policy",
          count: 125,
          resultCount: 4,
          lastSearched: new Date().toISOString(),
        },
        {
          query: "tax documents",
          count: 98,
          resultCount: 8,
          lastSearched: new Date().toISOString(),
        },
        {
          query: "warranty",
          count: 67,
          resultCount: 3,
          lastSearched: new Date().toISOString(),
        }
      ],
      searchesByTier: {
        free: 800,
        premium: 450,
      },
      searchesByTimeRange: [
        { date: new Date().toISOString(), searches: 45 },
        { date: new Date(Date.now() - 86400000).toISOString(), searches: 38 },
        { date: new Date(Date.now() - 172800000).toISOString(), searches: 52 },
      ],
    };
  }

  async getGCSUsage(): Promise<{
    totalStorageGB: number;
    totalStorageTB: number;
    costThisMonth: number;
    requestsThisMonth: number;
    bandwidthGB: number;
    trend: 'up' | 'down' | 'stable';
    trendPercentage: number;
  }> {
    // Real GCS metrics using Google Cloud Monitoring API
    try {
      const { gcsUsageService } = await import('./services/gcsUsageService');
      return await gcsUsageService.getGCSUsage();
    } catch (error) {
      console.error('Failed to fetch real GCS usage:', error);
      // Fallback to basic metrics on error
      return {
        totalStorageGB: 0,
        totalStorageTB: 0,
        costThisMonth: 0,
        requestsThisMonth: 0,
        bandwidthGB: 0,
        trend: 'stable' as const,
        trendPercentage: 0,
      };
    }
  }

  async getOpenAIUsage(): Promise<{
    totalTokens: number;
    costThisMonth: number;
    requestsThisMonth: number;
    modelBreakdown: Array<{
      model: string;
      tokens: number;
      cost: number;
      requests: number;
    }>;
    trend: 'up' | 'down' | 'stable';
    trendPercentage: number;
  }> {
    // Mock implementation - in production this would query OpenAI usage logs
    return {
      totalTokens: 125000,
      costThisMonth: 18.75,
      requestsThisMonth: 450,
      modelBreakdown: [
        {
          model: 'gpt-4o',
          tokens: 85000,
          cost: 12.50,
          requests: 280,
        },
        {
          model: 'gpt-4o-mini',
          tokens: 30000,
          cost: 4.25,
          requests: 120,
        },
        {
          model: 'gpt-3.5-turbo',
          tokens: 10000,
          cost: 2.00,
          requests: 50,
        }
      ],
      trend: 'down',
      trendPercentage: 8.3,
    };
  }

  // Manual Tracked Events operations (TICKET B1)
  async getManualTrackedEvents(userId: string): Promise<ManualTrackedEvent[]> {
    try {
      return await db
        .select()
        .from(manualTrackedEvents)
        .where(eq(manualTrackedEvents.createdBy, userId))
        .orderBy(desc(manualTrackedEvents.dueDate));
    } catch (error) {
      console.error("Error fetching manual tracked events:", error);
      return [];
    }
  }

  async getManualTrackedEvent(id: string, userId: string): Promise<ManualTrackedEvent | undefined> {
    try {
      const [event] = await db
        .select()
        .from(manualTrackedEvents)
        .where(and(eq(manualTrackedEvents.id, id), eq(manualTrackedEvents.createdBy, userId)));
      return event || undefined;
    } catch (error) {
      console.error("Error fetching manual tracked event:", error);
      return undefined;
    }
  }

  async createManualTrackedEvent(event: InsertManualTrackedEvent & { createdBy: string }): Promise<ManualTrackedEvent> {
    // Validate linked document ownership if provided
    if (event.linkedDocumentIds && event.linkedDocumentIds.length > 0) {
      const documentOwnershipCheck = await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(
          inArray(documents.id, event.linkedDocumentIds.map(id => {
            console.log('🔍 [PARSE DEBUG] Converting event.linkedDocumentId:', id, 'type:', typeof id);
            const parsed = parseInt(id);
            if (isNaN(parsed)) {
              console.error('❌ [PARSE ERROR] Invalid event document ID:', id);
              throw new Error(`Invalid event document ID: ${id}`);
            }
            return parsed;
          })),
          eq(documents.userId, event.createdBy)
        ));
      
      if (documentOwnershipCheck.length !== event.linkedDocumentIds.length) {
        throw new Error("Invalid document ownership - some linked documents don't belong to the user");
      }
    }

    // Validate linked asset ownership if provided
    if (event.linkedAssetId) {
      const assetOwnershipCheck = await db
        .select({ id: userAssets.id })
        .from(userAssets)
        .where(and(
          eq(userAssets.id, (() => {
            console.log('🔍 [PARSE DEBUG] Converting event.linkedAssetId:', event.linkedAssetId, 'type:', typeof event.linkedAssetId);
            const parsed = parseInt(event.linkedAssetId);
            if (isNaN(parsed)) {
              console.error('❌ [PARSE ERROR] Invalid event asset ID:', event.linkedAssetId);
              throw new Error(`Invalid event asset ID: ${event.linkedAssetId}`);
            }
            return parsed;
          })()),
          eq(userAssets.userId, event.createdBy)
        ));
      
      if (assetOwnershipCheck.length === 0) {
        throw new Error("Invalid asset ownership - linked asset doesn't belong to the user");
      }
    }

    const [newEvent] = await db
      .insert(manualTrackedEvents)
      .values({
        ...event,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newEvent;
  }

  async updateManualTrackedEvent(id: string, userId: string, updates: Partial<InsertManualTrackedEvent>): Promise<ManualTrackedEvent | undefined> {
    // Validate ownership first
    const existingEvent = await this.getManualTrackedEvent(id, userId);
    if (!existingEvent) {
      return undefined;
    }

    // Validate linked document ownership if being updated
    if (updates.linkedDocumentIds && updates.linkedDocumentIds.length > 0) {
      const documentOwnershipCheck = await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(
          inArray(documents.id, updates.linkedDocumentIds.map(id => {
            console.log('🔍 [PARSE DEBUG] Converting linkedDocumentId:', id, 'type:', typeof id);
            const parsed = parseInt(id);
            if (isNaN(parsed)) {
              console.error('❌ [PARSE ERROR] Invalid document ID:', id);
              throw new Error(`Invalid document ID: ${id}`);
            }
            return parsed;
          })),
          eq(documents.userId, userId)
        ));
      
      if (documentOwnershipCheck.length !== updates.linkedDocumentIds.length) {
        throw new Error("Invalid document ownership - some linked documents don't belong to the user");
      }
    }

    // Validate linked asset ownership if being updated
    if (updates.linkedAssetId) {
      const assetOwnershipCheck = await db
        .select({ id: userAssets.id })
        .from(userAssets)
        .where(and(
          eq(userAssets.id, (() => {
            console.log('🔍 [PARSE DEBUG] Converting linkedAssetId:', updates.linkedAssetId, 'type:', typeof updates.linkedAssetId);
            const parsed = parseInt(updates.linkedAssetId);
            if (isNaN(parsed)) {
              console.error('❌ [PARSE ERROR] Invalid asset ID:', updates.linkedAssetId);
              throw new Error(`Invalid asset ID: ${updates.linkedAssetId}`);
            }
            return parsed;
          })()),
          eq(userAssets.userId, userId)
        ));
      
      if (assetOwnershipCheck.length === 0) {
        throw new Error("Invalid asset ownership - linked asset doesn't belong to the user");
      }
    }

    const [updatedEvent] = await db
      .update(manualTrackedEvents)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(manualTrackedEvents.id, id), eq(manualTrackedEvents.createdBy, userId)))
      .returning();
    
    return updatedEvent || undefined;
  }

  async deleteManualTrackedEvent(id: string, userId: string): Promise<void> {
    await db
      .delete(manualTrackedEvents)
      .where(and(eq(manualTrackedEvents.id, id), eq(manualTrackedEvents.createdBy, userId)));
  }

  // Vehicle operations (TICKET 1 & 2)
  async getVehicles(userId: string): Promise<Vehicle[]> {
    return await safeQuery(async () => {
      return await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.userId, userId))
        .orderBy(desc(vehicles.createdAt));
    });
  }

  async getVehicle(id: string, userId: string): Promise<Vehicle | undefined> {
    return await safeQuery(async () => {
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)));
      return vehicle || undefined;
    });
  }

  async getVehicleByVRN(vrn: string, userId: string): Promise<Vehicle | undefined> {
    return await safeQuery(async () => {
      // Normalize VRN for lookup (remove spaces, uppercase)
      const normalizedVRN = vrn.replace(/\s/g, '').toUpperCase();
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.vrn, normalizedVRN), eq(vehicles.userId, userId)));
      return vehicle || undefined;
    });
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    return await safeQuery(async () => {
      const [newVehicle] = await db
        .insert(vehicles)
        .values({
          ...vehicle,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return newVehicle;
    });
  }

  async updateVehicle(id: string, userId: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    return await safeQuery(async () => {
      const [updatedVehicle] = await db
        .update(vehicles)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)))
        .returning();
      return updatedVehicle || undefined;
    });
  }

  async deleteVehicle(id: string, userId: string): Promise<void> {
    await safeQuery(async () => {
      await db
        .delete(vehicles)
        .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)));
    });
  }
}

export const storage = new DatabaseStorage();
