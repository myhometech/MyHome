import {
  users,
  documents,
  documentShares,
  emailForwards,
  userForwardingMappings,
  categories,
  type User,
  type UpsertUser,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, and, inArray, isNotNull, gte, lte, sql, or } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Category operations
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, updates: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<void>;
  
  // Document operations
  getDocuments(userId: string, categoryId?: number, search?: string, expiryFilter?: 'expired' | 'expiring-soon' | 'this-month'): Promise<Document[]>;
  getDocument(id: number, userId: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  deleteDocument(id: number, userId: string): Promise<void>;
  updateDocumentName(id: number, userId: string, newName: string): Promise<Document | undefined>;
  updateDocument(id: number, userId: string, updates: { name?: string; expiryDate?: string | null }): Promise<Document | undefined>;
  updateDocumentOCR(id: number, userId: string, extractedText: string): Promise<Document | undefined>;
  getDocumentStats(userId: string): Promise<{
    totalDocuments: number;
    totalSize: number;
    categoryCounts: { categoryId: number; count: number }[];
  }>;
  getExpiryAlerts(userId: string): Promise<{
    expired: ExpiringDocument[];
    expiringSoon: ExpiringDocument[];
    expiringThisMonth: ExpiringDocument[];
  }>;
  
  // Document sharing operations
  shareDocument(documentId: number, sharedByUserId: string, sharedWithEmail: string, permissions: 'view' | 'edit'): Promise<DocumentShare>;
  unshareDocument(shareId: number, userId: string): Promise<void>;
  getDocumentShares(documentId: number, userId: string): Promise<DocumentShare[]>;
  getSharedWithMeDocuments(userId: string): Promise<Document[]>;
  canAccessDocument(documentId: number, userId: string): Promise<boolean>;
  
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
}

export interface ExpiringDocument {
  id: number;
  name: string;
  expiryDate: string;
  categoryName?: string;
  daysUntilExpiry: number;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Category operations
  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories).orderBy(categories.name);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  async updateCategory(id: number, updates: Partial<InsertCategory>): Promise<Category | undefined> {
    const [updatedCategory] = await db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();
    return updatedCategory;
  }

  async deleteCategory(id: number): Promise<void> {
    // First, set all documents with this category to null (uncategorized)
    await db
      .update(documents)
      .set({ categoryId: null })
      .where(eq(documents.categoryId, id));
    
    // Then delete the category
    await db.delete(categories).where(eq(categories.id, id));
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
              sql`${documents.expiryDate} < ${today.toISOString().split('T')[0]}`
            )
          );
          break;
        case 'expiring-soon':
          conditions.push(
            and(
              isNotNull(documents.expiryDate),
              sql`${documents.expiryDate} >= ${today.toISOString().split('T')[0]}`,
              sql`${documents.expiryDate} <= ${sevenDaysFromNow.toISOString().split('T')[0]}`
            )
          );
          break;
        case 'this-month':
          conditions.push(
            and(
              isNotNull(documents.expiryDate),
              sql`${documents.expiryDate} >= ${today.toISOString().split('T')[0]}`,
              sql`${documents.expiryDate} <= ${endOfMonth.toISOString().split('T')[0]}`
            )
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

  async getDocumentStats(userId: string): Promise<{
    totalDocuments: number;
    totalSize: number;
    categoryCounts: { categoryId: number; count: number }[];
  }> {
    const userDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId));

    const totalDocuments = userDocs.length;
    const totalSize = userDocs.reduce((sum, doc) => sum + doc.fileSize, 0);
    
    const categoryCounts = userDocs.reduce((acc, doc) => {
      if (doc.categoryId) {
        const existing = acc.find(c => c.categoryId === doc.categoryId);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ categoryId: doc.categoryId, count: 1 });
        }
      }
      return acc;
    }, [] as { categoryId: number; count: number }[]);

    return { totalDocuments, totalSize, categoryCounts };
  }

  async getExpiryAlerts(userId: string): Promise<{
    expired: ExpiringDocument[];
    expiringSoon: ExpiringDocument[];
    expiringThisMonth: ExpiringDocument[];
  }> {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get documents with expiry dates
    const docsWithExpiry = await db
      .select({
        id: documents.id,
        name: documents.name,
        expiryDate: documents.expiryDate,
        categoryName: categories.name,
      })
      .from(documents)
      .leftJoin(categories, eq(documents.categoryId, categories.id))
      .where(
        and(
          eq(documents.userId, userId),
          isNotNull(documents.expiryDate)
        )
      )
      .orderBy(documents.expiryDate);

    const processDocument = (doc: any): ExpiringDocument => {
      const expiryDate = new Date(doc.expiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        id: doc.id,
        name: doc.name,
        expiryDate: typeof doc.expiryDate === 'string' ? doc.expiryDate : doc.expiryDate.toISOString(),
        categoryName: doc.categoryName || undefined,
        daysUntilExpiry,
      };
    };

    const expired: ExpiringDocument[] = [];
    const expiringSoon: ExpiringDocument[] = [];
    const expiringThisMonth: ExpiringDocument[] = [];

    docsWithExpiry.forEach(doc => {
      if (doc.expiryDate) {
        const processed = processDocument(doc);
        const expiryDate = new Date(doc.expiryDate);

        if (expiryDate < now) {
          expired.push(processed);
        } else if (expiryDate <= sevenDaysFromNow) {
          expiringSoon.push(processed);
        } else if (expiryDate <= thirtyDaysFromNow) {
          expiringThisMonth.push(processed);
        }
      }
    });

    return { expired, expiringSoon, expiringThisMonth };
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
        ocrProcessed: documents.ocrProcessed,
        uploadedAt: documents.uploadedAt,
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
        snippet: snippet || (doc.extractedText ? doc.extractedText.substring(0, 100) + '...' : ''),
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
}

export const storage = new DatabaseStorage();
