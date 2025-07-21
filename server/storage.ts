import {
  users,
  documents,
  categories,
  type User,
  type UpsertUser,
  type Document,
  type InsertDocument,
  type Category,
  type InsertCategory,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, and, inArray, isNotNull, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Category operations
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  
  // Document operations
  getDocuments(userId: string, categoryId?: number, search?: string): Promise<Document[]>;
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

  // Document operations
  async getDocuments(userId: string, categoryId?: number, search?: string): Promise<Document[]> {
    let query = db.select().from(documents).where(eq(documents.userId, userId));
    
    const conditions = [eq(documents.userId, userId)];
    
    if (categoryId) {
      conditions.push(eq(documents.categoryId, categoryId));
    }
    
    if (search) {
      conditions.push(
        sql`(${documents.name} ILIKE ${`%${search}%`} OR ${documents.extractedText} ILIKE ${`%${search}%`})`
      );
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
}

export const storage = new DatabaseStorage();
