import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { NeonDatabase } from '@neondatabase/serverless';
import { 
  users, categories, documents, emailForwards, households, userHouseholdMembership,
  type User, type Category, type Document, type EmailForward, type Household
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
  getCategory(id: number): Promise<Category | undefined>;
  updateCategory(id: number, updates: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<void>;

  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getUserDocuments(userId: string, sort?: string, filters?: any): Promise<Document[]>;
  getDocument(id: number, userId: string): Promise<Document | undefined>;
  getDocumentById(id: number): Promise<Document | undefined>;
  updateDocument(id: number, userId: string, updates: any): Promise<Document | undefined>;
  updateDocumentName(id: number, userId: string, newName: string): Promise<Document | undefined>;
  deleteDocument(id: number, userId: string): Promise<void>;

  // SEARCH FUNCTIONALITY
  searchDocuments(userId: string, query: string, limit?: number): Promise<Array<Document & { relevanceScore?: number, matchType?: string }>>;

  // Legacy insight operations (simplified for now)
  createInsight(insight: any): Promise<any>;
  getUserInsights(userId: string): Promise<any[]>;
  updateInsight(id: number, updates: any): Promise<any>;
  deleteInsight(id: number): Promise<void>;

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
  updateManualEvent(id: number, updates: any): Promise<any>;
  deleteManualEvent(id: number): Promise<void>;

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

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await this.db.insert(categories).values(category).returning();
    return newCategory;
  }

  async getUserCategories(userId: string): Promise<Category[]> {
    return await this.db.select().from(categories).where(eq(categories.userId, userId));
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

  async deleteCategory(id: number): Promise<void> {
    await this.db.delete(categories).where(eq(categories.id, id));
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

  // Legacy insight operations (simplified for compatibility)
  async createInsight(insight: any): Promise<any> {
    console.warn('Insight operations not implemented in clean storage');
    return null;
  }

  async getUserInsights(userId: string): Promise<any[]> {
    console.warn('Insight operations not implemented in clean storage');
    return [];
  }

  async updateInsight(id: number, updates: any): Promise<any> {
    console.warn('Insight operations not implemented in clean storage');
    return null;
  }

  async deleteInsight(id: number): Promise<void> {
    console.warn('Insight operations not implemented in clean storage');
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

  async updateManualEvent(id: number, updates: any): Promise<any> {
    console.warn('ManualEvent operations not implemented in clean storage');
    return null;
  }

  async deleteManualEvent(id: number): Promise<void> {
    console.warn('ManualEvent operations not implemented in clean storage');
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

// Export storage instance (will be initialized in index.ts)
export let storage: PostgresStorage;