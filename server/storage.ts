import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { type NeonDatabase } from '@neondatabase/serverless';
import { 
  users, categories, documents, emailForwards, households, userHouseholdMembership,
  documentInsights, vehicles,
  type User, type InsertUser, type Category, type InsertCategory, 
  type Document, type InsertDocument, type EmailForward, type InsertEmailForward, 
  type Household, type InsertHousehold, type DocumentInsight, type InsertDocumentInsight,
  type Vehicle, type InsertVehicle
} from '../shared/schema.js';

export interface IStorage {
  // User operations
  createUser(user: InsertUser): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;

  // Category operations
  createCategory(category: InsertCategory): Promise<Category>;
  getUserCategories(userId: string): Promise<Category[]>;
  getCategories(userId: string): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  updateCategory(id: number, updates: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number, userId?: string): Promise<void>;

  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getUserDocuments(userId: string, sort?: string, filters?: any): Promise<Document[]>;
  getDocuments(userId: string, categoryId?: number, search?: string, expiryFilter?: string, filters?: any, sort?: string): Promise<Document[]>;
  getDocument(id: number, userId: string): Promise<Document | undefined>;
  getDocumentById(id: number): Promise<Document | undefined>;
  updateDocument(id: number, userId: string, updates: any): Promise<Document | undefined>;
  updateDocumentName(id: number, userId: string, newName: string): Promise<Document | undefined>;
  updateDocumentTags(id: number, userId: string, tags: string[]): Promise<Document | undefined>;
  updateDocumentOCRAndSummary(id: number, ocrText: string, summary: string): Promise<Document | undefined>;
  updateDocumentSummary(id: number, userId: string, summary: string): Promise<Document | undefined>;
  updateDocumentOCR(id: number, ocrText: string): Promise<Document | undefined>;
  deleteDocument(id: number, userId: string): Promise<void>;

  // SEARCH FUNCTIONALITY
  searchDocuments(userId: string, query: string, limit?: number): Promise<Array<Document & { relevanceScore?: number, matchType?: string }>>;

  // User operations  
  updateUserLastLogin(userId: string): Promise<void>;
  
  // Document insight operations
  createDocumentInsight(insight: InsertDocumentInsight): Promise<DocumentInsight>;
  getUserInsights(userId: string): Promise<DocumentInsight[]>;
  getInsights(userId: string, status?: string, type?: string, priority?: string): Promise<DocumentInsight[]>;
  getDocumentInsights(documentId: number, userId?: string, tier?: string): Promise<DocumentInsight[]>;
  getCriticalInsights(userId: string): Promise<DocumentInsight[]>;
  updateInsight(id: string, updates: Partial<InsertDocumentInsight>): Promise<DocumentInsight | undefined>;
  updateInsightStatus(id: string, status: string): Promise<DocumentInsight | undefined>;
  deleteInsight(id: string): Promise<void>;
  deleteDocumentInsight(id: string): Promise<void>;

  // Email forwarding operations
  createEmailForward(emailForward: InsertEmailForward): Promise<EmailForward>;
  updateEmailForward(id: number, updates: Partial<InsertEmailForward>): Promise<EmailForward | undefined>;
  getEmailForwards(userId: string): Promise<EmailForward[]>;

  // Subscription operations (simplified)
  createSubscription(subscription: any): Promise<any>;
  getSubscription(userId: string): Promise<any>;
  updateSubscription(userId: string, updates: any): Promise<any>;

  // Manual event operations  
  createManualEvent(event: any): Promise<any>;
  getUserManualEvents(userId: string): Promise<any[]>;
  getManualTrackedEvents(userId: string): Promise<any[]>;
  getManualTrackedEvent(id: string, userId: string): Promise<any>;
  createManualTrackedEvent(event: any): Promise<any>;
  updateManualEvent(id: number, updates: any): Promise<any>;
  updateManualTrackedEvent(id: string, updates: any): Promise<any>;
  deleteManualEvent(id: number): Promise<void>;
  deleteManualTrackedEvent(id: string): Promise<void>;

  // User assets operations
  createUserAsset(asset: any): Promise<any>;
  getUserAssets(userId: string): Promise<any[]>;
  deleteUserAsset(id: number, userId: string): Promise<void>;

  // Vehicle operations
  getVehicles(userId: string): Promise<Vehicle[]>;
  getVehicle(id: string, userId: string): Promise<Vehicle | undefined>;
  getVehicleByVRN(vrn: string, userId: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, userId: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: string, userId: string): Promise<void>;

  // Household operations
  createHousehold(household: any): Promise<Household>;
  getHouseholds(): Promise<Household[]>;
}

export class PostgresStorage implements IStorage {
  constructor(private db: NeonDatabase) {}

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await this.db.insert(users).values(user).returning();
    return newUser;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await this.db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await this.db.insert(categories).values(category).returning();
    return newCategory;
  }

  async getUserCategories(userId: string): Promise<Category[]> {
    return await this.db.select().from(categories).where(eq(categories.userId, userId));
  }

  async getCategories(userId: string): Promise<Category[]> {
    return await this.getUserCategories(userId);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await this.db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async updateCategory(id: number, updates: Partial<InsertCategory>): Promise<Category | undefined> {
    const [updatedCategory] = await this.db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();
    return updatedCategory;
  }

  async deleteCategory(id: number, userId?: string): Promise<void> {
    if (userId) {
      await this.db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
    } else {
      await this.db.delete(categories).where(eq(categories.id, id));
    }
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await this.db.insert(documents).values(document).returning();
    return newDocument;
  }

  async getUserDocuments(userId: string, sort?: string, filters?: any): Promise<Document[]> {
    const conditions = [eq(documents.userId, userId)];

    if (filters?.category) {
      conditions.push(eq(documents.categoryId, parseInt(filters.category)));
    }

    return await this.db
      .select()
      .from(documents)
      .where(and(...conditions))
      .orderBy(desc(documents.uploadedAt));
  }

  async getDocuments(userId: string, categoryId?: number, search?: string, expiryFilter?: string, filters?: any, sort?: string): Promise<Document[]> {
    const conditions = [eq(documents.userId, userId)];

    if (categoryId) {
      conditions.push(eq(documents.categoryId, categoryId));
    }

    if (search) {
      conditions.push(
        or(
          ilike(documents.name, `%${search}%`),
          ilike(documents.extractedText, `%${search}%`)
        )
      );
    }

    return await this.db
      .select()
      .from(documents)
      .where(and(...conditions))
      .orderBy(desc(documents.uploadedAt));
  }

  async getDocument(id: number, userId: string): Promise<Document | undefined> {
    const [document] = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
    return document;
  }

  async getDocumentById(id: number): Promise<Document | undefined> {
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id));
    return document;
  }

  async updateDocument(id: number, userId: string, updates: any): Promise<Document | undefined> {
    const [updatedDoc] = await this.db
      .update(documents)
      .set(updates)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return updatedDoc;
  }

  async updateDocumentName(id: number, userId: string, newName: string): Promise<Document | undefined> {
    const [updatedDoc] = await this.db
      .update(documents)
      .set({ name: newName })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return updatedDoc;
  }

  async updateDocumentTags(id: number, userId: string, tags: string[]): Promise<Document | undefined> {
    const [updatedDoc] = await this.db
      .update(documents)
      .set({ tags })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return updatedDoc;
  }

  async updateDocumentOCRAndSummary(id: number, ocrText: string, summary: string): Promise<Document | undefined> {
    const [updatedDoc] = await this.db
      .update(documents)
      .set({ 
        extractedText: ocrText, 
        summary, 
        ocrProcessed: true 
      })
      .where(eq(documents.id, id))
      .returning();
    return updatedDoc;
  }

  async updateDocumentSummary(id: number, userId: string, summary: string): Promise<Document | undefined> {
    const [updatedDoc] = await this.db
      .update(documents)
      .set({ summary })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return updatedDoc;
  }

  async updateDocumentOCR(id: number, ocrText: string): Promise<Document | undefined> {
    const [updatedDoc] = await this.db
      .update(documents)
      .set({ 
        extractedText: ocrText, 
        ocrProcessed: true 
      })
      .where(eq(documents.id, id))
      .returning();
    return updatedDoc;
  }

  async deleteDocument(id: number, userId: string): Promise<void> {
    await this.db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }

  // ENHANCED SEARCH IMPLEMENTATION FOR SEARCH-AS-YOU-TYPE
  async searchDocuments(userId: string, query: string, limit: number = 10): Promise<Array<Document & { relevanceScore?: number, matchType?: string }>> {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query}%`;
    const lowerQuery = query.toLowerCase();

    const results = await this.db
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
        emailContext: documents.emailContext,
        gcsPath: documents.gcsPath,
        encryptedDocumentKey: documents.encryptedDocumentKey,
        encryptionMetadata: documents.encryptionMetadata,
        isEncrypted: documents.isEncrypted,
        status: documents.status,
        documentReferences: documents.documentReferences,
        conversionStatus: documents.conversionStatus,
        conversionJobId: documents.conversionJobId,
        conversionMetadata: documents.conversionMetadata,
      })
      .from(documents)
      .where(
        and(
          eq(documents.userId, userId),
          or(
            ilike(documents.name, searchPattern),
            ilike(documents.fileName, searchPattern),
            ilike(documents.extractedText, searchPattern),
            ilike(documents.summary, searchPattern),
            sql`${documents.emailContext}->>'subject' ILIKE ${searchPattern}`,
            sql`${documents.emailContext}->>'from' ILIKE ${searchPattern}`,
            sql`EXISTS (SELECT 1 FROM unnest(COALESCE(${documents.tags}, ARRAY[]::text[])) AS tag WHERE LOWER(tag) LIKE ${searchPattern})`
          )
        )
      )
      .orderBy(desc(documents.uploadedAt))
      .limit(limit);

    // Add relevance scoring and match type detection
    return results.map(doc => {
      let relevanceScore = 0;
      let matchType = 'other';

      if (doc.name?.toLowerCase().includes(lowerQuery)) {
        relevanceScore = doc.name.toLowerCase() === lowerQuery ? 100 : 60;
        matchType = 'title';
      } else if (doc.fileName?.toLowerCase().includes(lowerQuery)) {
        relevanceScore = 50;
        matchType = 'filename';
      } else if (doc.tags?.some((tag: string) => tag.toLowerCase().includes(lowerQuery))) {
        relevanceScore = 45;
        matchType = 'tags';
      } else if (doc.summary?.toLowerCase().includes(lowerQuery)) {
        relevanceScore = 40;
        matchType = 'summary';
      } else if ((doc.emailContext as any)?.subject?.toLowerCase().includes(lowerQuery)) {
        relevanceScore = 35;
        matchType = 'email_subject';
      } else if ((doc.emailContext as any)?.from?.toLowerCase().includes(lowerQuery)) {
        relevanceScore = 30;
        matchType = 'email_from';
      } else if (doc.extractedText?.toLowerCase().includes(lowerQuery)) {
        relevanceScore = 20;
        matchType = 'content';
      }

      return {
        ...doc,
        relevanceScore,
        matchType
      };
    }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  // Document insight operations
  async createDocumentInsight(insight: InsertDocumentInsight): Promise<DocumentInsight> {
    const [newInsight] = await this.db.insert(documentInsights).values(insight).returning();
    return newInsight;
  }

  async getUserInsights(userId: string): Promise<DocumentInsight[]> {
    return await this.db
      .select()
      .from(documentInsights)
      .where(eq(documentInsights.userId, userId))
      .orderBy(desc(documentInsights.createdAt));
  }

  async getInsights(userId: string, status?: string, type?: string, priority?: string): Promise<DocumentInsight[]> {
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

    return await this.db
      .select()
      .from(documentInsights)
      .where(and(...conditions))
      .orderBy(desc(documentInsights.dueDate), desc(documentInsights.createdAt));
  }

  async getDocumentInsights(documentId: number, userId?: string, tier?: string): Promise<DocumentInsight[]> {
    const conditions = [eq(documentInsights.documentId, documentId)];
    
    if (userId) {
      conditions.push(eq(documentInsights.userId, userId));
    }
    if (tier) {
      conditions.push(eq(documentInsights.tier, tier));
    }

    return await this.db
      .select()
      .from(documentInsights)
      .where(and(...conditions))
      .orderBy(desc(documentInsights.priority), desc(documentInsights.createdAt));
  }

  async getCriticalInsights(userId: string): Promise<DocumentInsight[]> {
    return await this.db
      .select()
      .from(documentInsights)
      .where(
        and(
          eq(documentInsights.userId, userId),
          eq(documentInsights.priority, 'high'),
          eq(documentInsights.status, 'open')
        )
      )
      .orderBy(desc(documentInsights.dueDate), desc(documentInsights.createdAt));
  }

  async updateInsight(id: string, updates: Partial<InsertDocumentInsight>): Promise<DocumentInsight | undefined> {
    const [updatedInsight] = await this.db
      .update(documentInsights)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(documentInsights.id, id))
      .returning();
    return updatedInsight;
  }

  async updateInsightStatus(id: string, status: string): Promise<DocumentInsight | undefined> {
    const [updatedInsight] = await this.db
      .update(documentInsights)
      .set({ status, updatedAt: new Date() })
      .where(eq(documentInsights.id, id))
      .returning();
    return updatedInsight;
  }

  async deleteInsight(id: string): Promise<void> {
    await this.db.delete(documentInsights).where(eq(documentInsights.id, id));
  }

  async deleteDocumentInsight(id: string): Promise<void> {
    await this.db.delete(documentInsights).where(eq(documentInsights.id, id));
  }

  // Email forwarding operations
  async createEmailForward(emailForward: InsertEmailForward): Promise<EmailForward> {
    const [newEmailForward] = await this.db
      .insert(emailForwards)
      .values(emailForward)
      .returning();
    return newEmailForward;
  }

  async updateEmailForward(id: number, updates: Partial<InsertEmailForward>): Promise<EmailForward | undefined> {
    const [updatedEmailForward] = await this.db
      .update(emailForwards)
      .set(updates)
      .where(eq(emailForwards.id, id))
      .returning();
    return updatedEmailForward;
  }

  async getEmailForwards(userId: string): Promise<EmailForward[]> {
    return await this.db
      .select()
      .from(emailForwards)
      .where(eq(emailForwards.userId, userId))
      .orderBy(desc(emailForwards.processedAt));
  }

  // Subscription operations (simplified for now)
  async createSubscription(subscription: any): Promise<any> {
    console.warn('Subscription operations not implemented in clean storage');
    return null;
  }

  async getSubscription(userId: string): Promise<any> {
    console.warn('Subscription operations not implemented in clean storage');
    return null;
  }

  async updateSubscription(userId: string, updates: any): Promise<any> {
    console.warn('Subscription operations not implemented in clean storage');
    return null;
  }

  // Manual event operations
  async createManualEvent(event: any): Promise<any> {
    console.warn('ManualEvent operations not implemented in clean storage');
    return null;
  }

  async getUserManualEvents(userId: string): Promise<any[]> {
    console.warn('ManualEvent operations not implemented in clean storage');
    return [];
  }

  async getManualTrackedEvents(userId: string): Promise<any[]> {
    console.warn('ManualTrackedEvent operations not implemented in clean storage');
    return [];
  }

  async getManualTrackedEvent(id: string, userId: string): Promise<any> {
    console.warn('ManualTrackedEvent operations not implemented in clean storage');
    return null;
  }

  async createManualTrackedEvent(event: any): Promise<any> {
    console.warn('ManualTrackedEvent operations not implemented in clean storage');
    return null;
  }

  async updateManualEvent(id: number, updates: any): Promise<any> {
    console.warn('ManualEvent operations not implemented in clean storage');
    return null;
  }

  async updateManualTrackedEvent(id: string, updates: any): Promise<any> {
    console.warn('ManualTrackedEvent operations not implemented in clean storage');
    return null;
  }

  async deleteManualEvent(id: number): Promise<void> {
    console.warn('ManualEvent operations not implemented in clean storage');
  }

  async deleteManualTrackedEvent(id: string): Promise<void> {
    console.warn('ManualTrackedEvent operations not implemented in clean storage');
  }



  // User assets operations
  async createUserAsset(asset: any): Promise<any> {
    console.warn('UserAsset operations not implemented in clean storage');
    return null;
  }

  async getUserAssets(userId: string): Promise<any[]> {
    console.warn('UserAsset operations not implemented in clean storage');
    return [];
  }

  async deleteUserAsset(id: number, userId: string): Promise<void> {
    console.warn('UserAsset operations not implemented in clean storage');
  }

  // Admin and statistics operations
  async getEncryptionStats(): Promise<any> {
    console.warn('Encryption stats not implemented in clean storage');
    return {};
  }

  async getAdminStats(): Promise<any> {
    console.warn('Admin stats not implemented in clean storage');
    return {};
  }

  async getAllUsersWithStats(): Promise<any[]> {
    console.warn('User stats not implemented in clean storage');
    return [];
  }

  async getSystemActivities(): Promise<any[]> {
    console.warn('System activities not implemented in clean storage');
    return [];
  }

  async getGCSUsage(): Promise<any> {
    console.warn('GCS usage not implemented in clean storage');
    return {};
  }

  async getOpenAIUsage(): Promise<any> {
    console.warn('OpenAI usage not implemented in clean storage');
    return {};
  }

  async updateUserStatus(userId: string, status: string): Promise<any> {
    console.warn('User status updates not implemented in clean storage');
    return null;
  }

  async getSearchAnalytics(): Promise<any[]> {
    console.warn('Search analytics not implemented in clean storage');
    return [];
  }

  // Document sharing operations
  async shareDocument(documentId: number, shareWith: string[], permissions: string): Promise<any> {
    console.warn('Document sharing not implemented in clean storage');
    return null;
  }

  async getDocumentShares(documentId: number): Promise<any[]> {
    console.warn('Document sharing not implemented in clean storage');
    return [];
  }

  async unshareDocument(shareId: number, userId: string): Promise<void> {
    console.warn('Document sharing not implemented in clean storage');
  }

  async getSharedWithMeDocuments(userId: string): Promise<any[]> {
    console.warn('Document sharing not implemented in clean storage');
    return [];
  }

  // Household operations
  async getHouseholdMembership(userId: string): Promise<any> {
    console.warn('Household operations not implemented in clean storage');
    return null;
  }

  async getHousehold(householdId: string): Promise<any> {
    console.warn('Household operations not implemented in clean storage');
    return null;
  }

  async getHouseholdMembers(householdId: string): Promise<any[]> {
    console.warn('Household operations not implemented in clean storage');
    return [];
  }

  async getHouseholdMemberCount(householdId: string): Promise<number> {
    console.warn('Household operations not implemented in clean storage');
    return 0;
  }

  async createHouseholdMembership(membership: any): Promise<any> {
    console.warn('Household operations not implemented in clean storage');
    return null;
  }

  async removeHouseholdMembership(userId: string): Promise<void> {
    console.warn('Household operations not implemented in clean storage');
  }

  // Blog operations
  async getPublishedBlogPosts(): Promise<any[]> {
    console.warn('Blog operations not implemented in clean storage');
    return [];
  }

  async getBlogPostBySlug(slug: string): Promise<any> {
    console.warn('Blog operations not implemented in clean storage');
    return null;
  }

  async createBlogPost(post: any): Promise<any> {
    console.warn('Blog operations not implemented in clean storage');
    return null;
  }

  async updateBlogPost(id: number, updates: any): Promise<any> {
    console.warn('Blog operations not implemented in clean storage');
    return null;
  }

  async deleteBlogPost(id: number): Promise<void> {
    console.warn('Blog operations not implemented in clean storage');
  }

  // Expiry reminders operations
  async getExpiryReminders(userId: string): Promise<any[]> {
    console.warn('Expiry reminders not implemented in clean storage');
    return [];
  }

  async createExpiryReminder(reminder: any): Promise<any> {
    console.warn('Expiry reminders not implemented in clean storage');
    return null;
  }

  async updateExpiryReminder(id: number, updates: any): Promise<any> {
    console.warn('Expiry reminders not implemented in clean storage');
    return null;
  }

  async deleteExpiryReminder(id: number): Promise<void> {
    console.warn('Expiry reminders not implemented in clean storage');
  }

  async markReminderCompleted(id: number): Promise<any> {
    console.warn('Expiry reminders not implemented in clean storage');
    return null;
  }

  // Feature flag operations
  async getAllFeatureFlags(): Promise<any[]> {
    console.warn('Feature flags not implemented in clean storage');
    return [];
  }

  async toggleFeatureFlag(flagName: string): Promise<any> {
    console.warn('Feature flags not implemented in clean storage');
    return null;
  }

  async getFeatureFlagOverrides(userId: string): Promise<any[]> {
    console.warn('Feature flags not implemented in clean storage');
    return [];
  }

  async getFeatureFlagAnalytics(): Promise<any> {
    console.warn('Feature flags not implemented in clean storage');
    return {};
  }

  // Vehicle operations
  async getVehicles(userId: string): Promise<Vehicle[]> {
    return await this.db
      .select()
      .from(vehicles)
      .where(eq(vehicles.userId, userId))
      .orderBy(desc(vehicles.createdAt));
  }

  async getVehicle(id: string, userId: string): Promise<Vehicle | undefined> {
    const [vehicle] = await this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)));
    return vehicle;
  }

  async getVehicleByVRN(vrn: string, userId: string): Promise<Vehicle | undefined> {
    const [vehicle] = await this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.vrn, vrn), eq(vehicles.userId, userId)));
    return vehicle;
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const [newVehicle] = await this.db
      .insert(vehicles)
      .values(vehicle)
      .returning();
    return newVehicle;
  }

  async updateVehicle(id: string, userId: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const [updatedVehicle] = await this.db
      .update(vehicles)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)))
      .returning();
    return updatedVehicle;
  }

  async deleteVehicle(id: string, userId: string): Promise<void> {
    await this.db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)));
  }

  // Additional document operations
  async addDocumentReference(documentId: number, referenceId: number): Promise<void> {
    console.warn('Document references not implemented in clean storage');
  }

  // Household operations
  async createHousehold(household: any): Promise<Household> {
    const [newHousehold] = await this.db.insert(households).values(household).returning();
    return newHousehold;
  }

  async getHouseholds(): Promise<Household[]> {
    return await this.db.select().from(households);
  }
}

// Initialize and export storage instance
import { db } from "./db";
export const storage = new PostgresStorage(db);