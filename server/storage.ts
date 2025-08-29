import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { 
  users, categories, documents, emailForwards, households, userHouseholdMembership, pendingInvites,
  documentInsights, vehicles, documentEvents, userAssets, conversations, messages, documentText,
  type User, type InsertUser, type Category, type InsertCategory, 
  type Document, type InsertDocument, type EmailForward, type InsertEmailForward, 
  type Household, type InsertHousehold, type DocumentInsight, type InsertDocumentInsight,
  type Vehicle, type InsertVehicle, type PendingInvite, type InsertPendingInvite,
  type DocumentEvent, type InsertDocumentEvent, type UserAsset, type InsertUserAsset,
  type Conversation, type InsertConversation, type Message, type InsertMessage,
  type DocumentText, type InsertDocumentText, type SearchSnippetsRequest, type SearchSnippetsResponse,
  type SearchResult, type SearchSnippet
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
  flagDocumentInsight(id: string, flagged: boolean, reason?: string): Promise<DocumentInsight | undefined>;
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
  createUserAsset(asset: InsertUserAsset & { userId: string }): Promise<UserAsset>;
  getUserAssets(userId: string): Promise<UserAsset[]>;
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
  getUserHousehold(userId: string): Promise<any>;
  getHouseholdMembers(householdId: string): Promise<any[]>;
  getUserHouseholdMembership(userId: string): Promise<any>;
  createHouseholdMembership(membership: any): Promise<any>;

  // TICKET 2: Pending invite operations
  createPendingInvite(invite: InsertPendingInvite): Promise<PendingInvite>;
  getPendingInviteByToken(token: string): Promise<PendingInvite | undefined>;
  getPendingInvitesByHousehold(householdId: string): Promise<PendingInvite[]>;
  deletePendingInvite(id: number): Promise<void>;

  // TICKET 3: Role-based operations
  removeHouseholdMembership(userId: string): Promise<void>;
  getUserHouseholdMembership(userId: string): Promise<any>;

  // TICKET 4: Document audit logging
  logDocumentEvent(event: InsertDocumentEvent): Promise<DocumentEvent>;
  getDocumentEvents(documentId: number): Promise<DocumentEvent[]>;
  getUserDocumentEvents(userId: string, limit?: number): Promise<DocumentEvent[]>;
  
  // Email body document operations
  createEmailBodyDocument(userId: string, emailData: any, pdfBuffer: Buffer): Promise<Document>;

  // Chat operations
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  getUserConversations(tenantId: string, archived?: boolean, limit?: number, cursor?: string): Promise<Conversation[]>;
  getConversation(id: string, tenantId: string): Promise<Conversation | undefined>;
  archiveConversation(id: string, tenantId: string): Promise<Conversation | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  getConversationMessages(conversationId: string, tenantId: string, limit?: number, cursor?: string): Promise<Message[]>;

  // Document search text operations
  createDocumentText(documentText: InsertDocumentText): Promise<DocumentText>;
  getDocumentText(docId: number): Promise<DocumentText | undefined>;
  updateDocumentText(docId: number, updates: Partial<InsertDocumentText>): Promise<DocumentText | undefined>;
  deleteDocumentText(docId: number): Promise<void>;
  searchDocumentSnippets(request: SearchSnippetsRequest, tenantId: string): Promise<SearchSnippetsResponse>;

  // CHAT-008: Document facts operations
  createDocumentFact(fact: InsertDocumentFact): Promise<SelectDocumentFact>;
  getDocumentFacts(docId: number, userId: string): Promise<SelectDocumentFact[]>;
  updateDocumentFact(id: number, updates: Partial<InsertDocumentFact>): Promise<SelectDocumentFact | undefined>;
  deleteDocumentFact(id: number, userId: string): Promise<void>;
}

export class PostgresStorage implements IStorage {
  constructor(private db: any) {}

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

  async createDocument(documentData: InsertDocument): Promise<Document> {
    // Deduplicate tags before creating document
    const deduplicatedTags = documentData.tags ? this.deduplicateTags(documentData.tags) : [];
    const result = await this.db.insert(documents).values({
      ...documentData,
      tags: deduplicatedTags,
    }).returning();
    return result[0];
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
      const searchCondition = or(
        ilike(documents.name, `%${search}%`),
        ilike(documents.extractedText, `%${search}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
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
    // Deduplicate tags if they're being updated
    const updateData = { ...updates };
    if (updateData.tags) {
      updateData.tags = this.deduplicateTags(updateData.tags);
    }
    const result = await this.db
      .update(documents)
      .set(updateData)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return result[0];
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
    const deduplicatedTags = this.deduplicateTags(tags);
    const [updatedDoc] = await this.db
      .update(documents)
      .set({ tags: deduplicatedTags })
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
    return results.map((doc: any) => {
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
    }).sort((a: any, b: any) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
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

  async flagDocumentInsight(id: string, flagged: boolean, reason?: string): Promise<DocumentInsight | undefined> {
    const updateData: any = { 
      flagged, 
      updatedAt: new Date() 
    };
    
    if (flagged && reason) {
      updateData.flaggedReason = reason;
      updateData.flaggedAt = new Date();
    } else if (!flagged) {
      // When unflagging, clear the reason and timestamp
      updateData.flaggedReason = null;
      updateData.flaggedAt = null;
    }

    const [updatedInsight] = await this.db
      .update(documentInsights)
      .set(updateData)
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

  async getManualTrackedEvents(userId: string): Promise<any[]>{
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

  // Household operations moved to actual implementations below
  async getHouseholdMembership(userId: string): Promise<any> {
    return this.getUserHouseholdMembership(userId);
  }

  async getHousehold(householdId: string): Promise<any> {
    const [household] = await this.db
      .select()
      .from(households)
      .where(eq(households.id, householdId));
    return household;
  }

  async getHouseholdMemberCount(householdId: string): Promise<number> {
    const members = await this.getHouseholdMembers(householdId);
    return members.length;
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

  // User assets operations
  async createUserAsset(asset: InsertUserAsset & { userId: string }): Promise<UserAsset> {
    const [newAsset] = await this.db
      .insert(userAssets)
      .values(asset)
      .returning();
    return newAsset;
  }

  async getUserAssets(userId: string): Promise<UserAsset[]> {
    return await this.db
      .select()
      .from(userAssets)
      .where(eq(userAssets.userId, userId))
      .orderBy(desc(userAssets.createdAt));
  }

  async deleteUserAsset(id: number, userId: string): Promise<void> {
    await this.db
      .delete(userAssets)
      .where(and(eq(userAssets.id, id), eq(userAssets.userId, userId)));
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

  async getUserHousehold(userId: string): Promise<any> {
    // Get user's household membership
    const [membership] = await this.db
      .select()
      .from(userHouseholdMembership)
      .where(eq(userHouseholdMembership.userId, userId));
    
    if (!membership) return null;

    // Get household details
    const [household] = await this.db
      .select()
      .from(households)
      .where(eq(households.id, membership.householdId));
    
    return household ? { ...household, role: membership.role } : null;
  }

  async getHouseholdMembers(householdId: string): Promise<any[]> {
    return await this.db
      .select({
        id: userHouseholdMembership.id,
        userId: userHouseholdMembership.userId,
        role: userHouseholdMembership.role,
        joinedAt: userHouseholdMembership.joinedAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(userHouseholdMembership)
      .innerJoin(users, eq(userHouseholdMembership.userId, users.id))
      .where(eq(userHouseholdMembership.householdId, householdId));
  }

  async getUserHouseholdMembership(userId: string): Promise<any> {
    const [membership] = await this.db
      .select()
      .from(userHouseholdMembership)
      .where(eq(userHouseholdMembership.userId, userId));
    return membership;
  }

  async createHouseholdMembership(membership: any): Promise<any> {
    const [newMembership] = await this.db
      .insert(userHouseholdMembership)
      .values(membership)
      .returning();
    return newMembership;
  }

  // TICKET 2: Pending invite operations
  async createPendingInvite(invite: InsertPendingInvite): Promise<PendingInvite> {
    const [newInvite] = await this.db
      .insert(pendingInvites)
      .values(invite)
      .returning();
    return newInvite;
  }

  async getPendingInviteByToken(token: string): Promise<PendingInvite | undefined> {
    const [invite] = await this.db
      .select()
      .from(pendingInvites)
      .where(and(
        eq(pendingInvites.token, token),
        sql`${pendingInvites.expiresAt} > NOW()`
      ));
    return invite;
  }

  async getPendingInvitesByHousehold(householdId: string): Promise<PendingInvite[]> {
    return await this.db
      .select()
      .from(pendingInvites)
      .where(and(
        eq(pendingInvites.householdId, householdId),
        sql`${pendingInvites.expiresAt} > NOW()`
      ))
      .orderBy(desc(pendingInvites.createdAt));
  }

  async deletePendingInvite(id: number): Promise<void> {
    await this.db.delete(pendingInvites).where(eq(pendingInvites.id, id));
  }

  // TICKET 3: Role-based operations
  async removeHouseholdMembership(userId: string): Promise<void> {
    await this.db.delete(userHouseholdMembership).where(eq(userHouseholdMembership.userId, userId));
  }

  // TICKET 4: Document audit logging operations
  async logDocumentEvent(event: InsertDocumentEvent): Promise<DocumentEvent> {
    const [loggedEvent] = await this.db
      .insert(documentEvents)
      .values(event)
      .returning();
    return loggedEvent;
  }

  async getDocumentEvents(documentId: number): Promise<DocumentEvent[]> {
    return await this.db
      .select({
        id: documentEvents.id,
        documentId: documentEvents.documentId,
        userId: documentEvents.userId,
        householdId: documentEvents.householdId,
        action: documentEvents.action,
        metadata: documentEvents.metadata,
        createdAt: documentEvents.createdAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(documentEvents)
      .leftJoin(users, eq(documentEvents.userId, users.id))
      .where(eq(documentEvents.documentId, documentId))
      .orderBy(desc(documentEvents.createdAt));
  }

  async getUserDocumentEvents(userId: string, limit: number = 50): Promise<DocumentEvent[]> {
    return await this.db
      .select({
        id: documentEvents.id,
        documentId: documentEvents.documentId,
        userId: documentEvents.userId,
        householdId: documentEvents.householdId,
        action: documentEvents.action,
        metadata: documentEvents.metadata,
        createdAt: documentEvents.createdAt,
        document: {
          id: documents.id,
          name: documents.name,
        }
      })
      .from(documentEvents)
      .leftJoin(documents, eq(documentEvents.documentId, documents.id))
      .where(eq(documentEvents.userId, userId))
      .orderBy(desc(documentEvents.createdAt))
      .limit(limit);
  }

  // Email body document operations
  async createEmailBodyDocument(userId: string, emailData: any, pdfBuffer: Buffer): Promise<Document> {
    console.log('📧 Creating email body document with GCS storage');
    
    // Import storage provider and generate unique key
    const { storageProvider } = await import('./storage/StorageService');
    const { nanoid } = await import('nanoid');
    
    const documentId = nanoid();
    const fileName = `Email_${emailData.subject || 'No_Subject'}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const gcsKey = `${userId}/${documentId}/${fileName}`;
    
    try {
      // Upload PDF buffer to GCS
      console.log(`📧 Uploading email PDF to GCS: ${gcsKey}`);
      const storage = storageProvider();
      await storage.upload(pdfBuffer, gcsKey, 'application/pdf');
      console.log(`✅ Email PDF uploaded successfully: ${gcsKey}`);
      
      // Create document record with GCS path
      const document = await this.createDocument({
        name: `Email: ${emailData.subject || 'No Subject'}`,
        userId,
        fileName: `Email: ${emailData.subject || 'No Subject'}.pdf`,
        filePath: '', // Empty for GCS documents
        gcsPath: gcsKey, // Set GCS path
        isEncrypted: true, // Mark as cloud storage
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
        tags: emailData.tags || ['email', 'email-body'],
        emailContext: emailData
      });
      
      console.log(`✅ Email document created: ID ${document.id}, GCS path: ${gcsKey}`);
      return document;
      
    } catch (error) {
      console.error('❌ Failed to upload email PDF to GCS:', error);
      throw new Error(`Failed to create email document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Chat operations
  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [newConversation] = await this.db.insert(conversations).values(conversation).returning();
    return newConversation;
  }

  async getUserConversations(tenantId: string, archived: boolean = false, limit: number = 50, cursor?: string): Promise<Conversation[]> {
    let query = this.db.select().from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.archived, archived)));

    if (cursor) {
      query = query.where(and(
        eq(conversations.tenantId, tenantId), 
        eq(conversations.archived, archived),
        sql`${conversations.createdAt} < (SELECT created_at FROM conversations WHERE id = ${cursor})`
      ));
    }

    return await query
      .orderBy(desc(conversations.createdAt))
      .limit(limit);
  }

  async getConversation(id: string, tenantId: string): Promise<Conversation | undefined> {
    const [conversation] = await this.db.select().from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)));
    return conversation;
  }

  async archiveConversation(id: string, tenantId: string): Promise<Conversation | undefined> {
    const [archivedConversation] = await this.db
      .update(conversations)
      .set({ 
        archived: true, 
        archivedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
      .returning();
    return archivedConversation;
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await this.db.insert(messages).values(message).returning();
    return newMessage;
  }

  async getConversationMessages(conversationId: string, tenantId: string, limit: number = 100, cursor?: string): Promise<Message[]> {
    let query = this.db.select().from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.tenantId, tenantId)));

    if (cursor) {
      query = query.where(and(
        eq(messages.conversationId, conversationId), 
        eq(messages.tenantId, tenantId),
        sql`${messages.createdAt} > (SELECT created_at FROM messages WHERE id = ${cursor})`
      ));
    }

    return await query
      .orderBy(messages.createdAt) // ASC for conversation messages
      .limit(limit);
  }

  // Document search text operations
  async createDocumentText(documentTextData: InsertDocumentText): Promise<DocumentText> {
    const [newDocumentText] = await this.db.insert(documentText).values(documentTextData).returning();
    return newDocumentText;
  }

  async getDocumentText(docId: number): Promise<DocumentText | undefined> {
    const [result] = await this.db.select().from(documentText).where(eq(documentText.docId, docId));
    return result;
  }

  async updateDocumentText(docId: number, updates: Partial<InsertDocumentText>): Promise<DocumentText | undefined> {
    const [updatedDocumentText] = await this.db
      .update(documentText)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(documentText.docId, docId))
      .returning();
    return updatedDocumentText;
  }

  async deleteDocumentText(docId: number): Promise<void> {
    await this.db.delete(documentText).where(eq(documentText.docId, docId));
  }

  async searchDocumentSnippets(request: SearchSnippetsRequest, tenantId: string): Promise<SearchSnippetsResponse> {
    try {
      const {
        query,
        filters = {},
        limit = 20,
        snippetLimit = 3,
        snippetCharWindow = 280
      } = request;

      // Build the full-text search query
      const searchQuery = sql`plainto_tsquery('english', ${query})`;
      
      // Base query with full-text search
      let dbQuery = this.db
        .select({
          docId: documentText.docId,
          text: documentText.text,
          pageBreaks: documentText.pageBreaks,
          title: documents.name,
          score: sql<number>`ts_rank_cd(${documentText.tsv}, ${searchQuery})`,
          // Document metadata for filtering
          tags: documents.tags,
          uploadedAt: documents.uploadedAt,
          extractedText: documents.extractedText,
          emailContext: documents.emailContext,
          expiryDate: documents.expiryDate,
        })
        .from(documentText)
        .innerJoin(documents, eq(documentText.docId, documents.id))
        .where(and(
          eq(documentText.tenantId, tenantId),
          sql`${documentText.tsv} @@ ${searchQuery}`
        ));

      // Apply filters
      const conditions: any[] = [
        eq(documentText.tenantId, tenantId),
        sql`${documentText.tsv} @@ ${searchQuery}`
      ];

      if (filters.docType && filters.docType.length > 0) {
        // Filter by document tags (docType is determined by AI categorization stored in tags)
        conditions.push(sql`EXISTS (SELECT 1 FROM unnest(COALESCE(${documents.tags}, ARRAY[]::text[])) AS tag WHERE tag = ANY(${filters.docType}))`);
      }

      if (filters.provider) {
        // Search for provider in document text or email context
        conditions.push(or(
          ilike(documentText.text, `%${filters.provider}%`),
          sql`${documents.emailContext}->>'from' ILIKE ${`%${filters.provider}%`}`
        ));
      }

      if (filters.dateFrom || filters.dateTo) {
        // Filter by expiry date (invoice date) or upload date as fallback
        const dateConditions: any[] = [];
        
        if (filters.dateFrom) {
          dateConditions.push(sql`COALESCE(${documents.expiryDate}, ${documents.uploadedAt}) >= ${filters.dateFrom}`);
        }
        
        if (filters.dateTo) {
          dateConditions.push(sql`COALESCE(${documents.expiryDate}, ${documents.uploadedAt}) <= ${filters.dateTo}`);
        }
        
        conditions.push(and(...dateConditions));
      }

      if (filters.createdByUserId) {
        conditions.push(eq(documents.userId, filters.createdByUserId));
      }

      // Apply all conditions
      if (conditions.length > 2) { // More than the base conditions
        dbQuery = dbQuery.where(and(...conditions));
      }

      // Execute query with ranking and limit
      const searchResults = await dbQuery
        .orderBy(sql`ts_rank_cd(${documentText.tsv}, ${searchQuery}) DESC`, desc(documents.uploadedAt))
        .limit(limit);

      // Generate snippets for each result
      const results: SearchResult[] = [];
      
      for (const result of searchResults) {
        const snippets = this.extractSnippets(
          result.text,
          query,
          result.pageBreaks,
          snippetLimit,
          snippetCharWindow
        );

        // Extract metadata
        const metadata = {
          docType: result.tags?.find(tag => ['bill', 'invoice', 'statement', 'receipt', 'contract', 'insurance', 'tax'].includes(tag.toLowerCase())),
          provider: this.extractProvider(result.text, result.emailContext),
          invoiceDate: result.expiryDate?.toISOString().split('T')[0],
        };

        results.push({
          docId: result.docId.toString(),
          title: result.title,
          score: Math.min(result.score, 1), // Normalize score to 0-1 range
          snippets,
          metadata: Object.keys(metadata).some(key => metadata[key as keyof typeof metadata]) ? metadata : undefined
        });
      }

      return {
        results,
        totalResults: results.length,
        hasMore: results.length === limit,
      };

    } catch (error) {
      console.error('Error in searchDocumentSnippets:', error);
      throw new Error('Failed to search document snippets');
    }
  }

  private extractSnippets(
    text: string,
    query: string,
    pageBreaks: number[],
    snippetLimit: number,
    snippetCharWindow: number
  ): SearchSnippet[] {
    const snippets: SearchSnippet[] = [];
    const queryWords = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();

    // Find all match positions
    const matches: { start: number; end: number }[] = [];
    
    for (const word of queryWords) {
      let index = 0;
      while (index < textLower.length) {
        const found = textLower.indexOf(word, index);
        if (found === -1) break;
        matches.push({ start: found, end: found + word.length });
        index = found + 1;
      }
    }

    // Sort matches by position
    matches.sort((a, b) => a.start - b.start);

    // Create snippets around matches
    const usedRanges = new Set<string>();
    
    for (const match of matches.slice(0, snippetLimit)) {
      const center = Math.floor((match.start + match.end) / 2);
      const snippetStart = Math.max(0, center - Math.floor(snippetCharWindow / 2));
      const snippetEnd = Math.min(text.length, snippetStart + snippetCharWindow);
      
      // Avoid overlapping snippets
      const rangeKey = `${snippetStart}-${snippetEnd}`;
      if (usedRanges.has(rangeKey)) continue;
      usedRanges.add(rangeKey);

      // Find page number using pageBreaks
      const page = this.findPageNumber(snippetStart, pageBreaks);
      
      // Extract snippet text and clean it up
      let snippetText = text.slice(snippetStart, snippetEnd);
      if (snippetStart > 0) snippetText = '...' + snippetText;
      if (snippetEnd < text.length) snippetText = snippetText + '...';

      snippets.push({
        text: snippetText.trim(),
        start: snippetStart,
        end: snippetEnd,
        page
      });

      if (snippets.length >= snippetLimit) break;
    }

    return snippets;
  }

  private findPageNumber(charOffset: number, pageBreaks: number[]): number {
    if (!pageBreaks.length) return 1;
    
    for (let i = 0; i < pageBreaks.length; i++) {
      if (charOffset < pageBreaks[i]) {
        return Math.max(1, i); // Pages are 1-indexed
      }
    }
    
    return pageBreaks.length; // Last page
  }

  private extractProvider(text: string, emailContext: any): string | undefined {
    // Try to extract from email context first
    if (emailContext?.from) {
      const fromField = emailContext.from.toLowerCase();
      const commonProviders = ['o2', 'vodafone', 'ee', 'three', 'bt', 'virgin', 'sky', 'council', 'hmrc', 'dvla'];
      
      for (const provider of commonProviders) {
        if (fromField.includes(provider)) {
          return provider.toUpperCase();
        }
      }
    }

    // Fallback to text search for provider names
    const textLower = text.toLowerCase();
    const providerPatterns = [
      /\b(o2|vodafone|ee|three)\b/i,
      /\b(british telecom|bt)\b/i,
      /\b(virgin media|virgin)\b/i,
      /\b(sky)\b/i,
      /\b(council tax|council)\b/i,
      /\b(hmrc|tax office)\b/i,
      /\b(dvla)\b/i,
    ];

    for (const pattern of providerPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    return undefined;
  }

  /**
   * Helper function to deduplicate tags while preserving order
   */
  private deduplicateTags(tags: string[]): string[] {
    const uniqueTags = new Set(tags.filter(tag => tag && tag.trim()));
    return Array.from(uniqueTags);
  }

  // CHAT-008: Document facts operations implementation
  async createDocumentFact(fact: InsertDocumentFact): Promise<SelectDocumentFact> {
    const [newFact] = await this.db.insert(documentFacts).values(fact).returning();
    return newFact;
  }

  async getDocumentFacts(docId: number, userId: string): Promise<SelectDocumentFact[]> {
    return await this.db
      .select()
      .from(documentFacts) 
      .where(and(eq(documentFacts.docId, docId), eq(documentFacts.userId, userId)))
      .orderBy(desc(documentFacts.confidence));
  }

  async updateDocumentFact(id: number, updates: Partial<InsertDocumentFact>): Promise<SelectDocumentFact | undefined> {
    const [updatedFact] = await this.db
      .update(documentFacts)
      .set(updates)
      .where(eq(documentFacts.id, id))
      .returning();
    return updatedFact;
  }

  async deleteDocumentFact(id: number, userId: string): Promise<void> {
    await this.db.delete(documentFacts).where(and(eq(documentFacts.id, id), eq(documentFacts.userId, userId)));
  }
}

// Initialize and export storage instance
import { db } from "./db";
export const storage = new PostgresStorage(db);