/**
 * Search Optimization Service
 * Handles optimized database search queries with performance monitoring
 */

import { storage } from './storage';
import { documents, categories } from '@shared/schema';
import { eq, and, or, ilike, desc, sql, inArray } from 'drizzle-orm';
import { performanceMonitoringService } from './performanceMonitoringService';

// Import db directly
import { db } from './db';

export interface SearchMetrics {
  query: string;
  executionTime: number;
  resultCount: number;
  userId: string;
  timestamp: Date;
}

export interface OptimizedSearchResult {
  id: number;
  userId: string;
  categoryId: number | null;
  name: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  tags: string[] | null;
  expiryDate: Date | null;
  extractedText: string | null;
  summary: string | null;
  ocrProcessed: boolean | null;
  uploadedAt: Date | null;
  categoryName: string | null;
  matchType: string;
  snippet: string;
  relevanceScore: number;
}

class SearchOptimizationService {
  private metrics: SearchMetrics[] = [];

  /**
   * Optimized document search using database indexes
   */
  async searchDocumentsOptimized(userId: string, query: string): Promise<OptimizedSearchResult[]> {
    const startTime = Date.now();
    
    try {
      const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 1);
      
      if (searchTerms.length === 0) {
        return [];
      }

      // Use optimized query with proper indexes and full-text search
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
            or(
              // Use ILIKE for indexed name searches
              ...searchTerms.map(term => ilike(documents.name, `%${term}%`)),
              ...searchTerms.map(term => ilike(documents.fileName, `%${term}%`)),
              // Full-text search for content (will be optimized with GIN indexes)
              ...searchTerms.map(term => ilike(documents.extractedText, `%${term}%`)),
              ...searchTerms.map(term => ilike(documents.summary, `%${term}%`)),
              // GIN index optimized tag search
              ...searchTerms.map(term => 
                sql`${documents.tags}::text ILIKE ${'%' + term + '%'}`
              ),
              // Category search
              ...searchTerms.map(term => ilike(categories.name, `%${term}%`))
            )
          )
        )
        .orderBy(desc(documents.uploadedAt))
        .limit(50); // Increased limit for better results

      // Enhanced result processing with relevance scoring
      const enhancedResults = results.map(doc => {
        const relevanceScore = this.calculateRelevanceScore(doc as OptimizedSearchResult, searchTerms);
        const matchInfo = this.determineMatchType(doc as OptimizedSearchResult, searchTerms);
        
        return {
          ...doc,
          categoryName: doc.categoryName,
          matchType: matchInfo.type,
          snippet: matchInfo.snippet,
          relevanceScore,
        } as OptimizedSearchResult;
      });

      // Sort by relevance score
      const sortedResults = enhancedResults.sort((a: OptimizedSearchResult, b: OptimizedSearchResult) => b.relevanceScore - a.relevanceScore);

      const executionTime = Date.now() - startTime;
      
      // Record metrics in both services
      this.recordSearchMetrics({
        query,
        executionTime,
        resultCount: sortedResults.length,
        userId,
        timestamp: new Date(),
      });
      
      // Record performance monitoring
      performanceMonitoringService.recordQuery(
        `SELECT documents with search for ${searchTerms.length} terms`,
        executionTime,
        '/api/documents/search',
        userId,
        sortedResults.length
      );

      return sortedResults;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.recordSearchMetrics({
        query,
        executionTime,
        resultCount: 0,
        userId,
        timestamp: new Date(),
      });
      
      // Record failed query in performance monitoring
      performanceMonitoringService.recordQuery(
        `SELECT documents with search for terms`,
        executionTime,
        '/api/documents/search',
        userId,
        0,
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      throw error;
    }
  }

  /**
   * Calculate relevance score for search results
   */
  private calculateRelevanceScore(doc: OptimizedSearchResult, searchTerms: string[]): number {
    let score = 0;
    const lowerName = doc.name.toLowerCase();
    const lowerFileName = doc.fileName.toLowerCase();
    const lowerExtractedText = (doc.extractedText || '').toLowerCase();
    const lowerSummary = (doc.summary || '').toLowerCase();
    const tagsText = (doc.tags || []).join(' ').toLowerCase();
    const categoryName = (doc.categoryName || '').toLowerCase();

    for (const term of searchTerms) {
      // Name matches have highest priority
      if (lowerName.includes(term)) {
        score += lowerName.startsWith(term) ? 10 : 5;
      }
      
      // Filename matches
      if (lowerFileName.includes(term)) {
        score += 3;
      }
      
      // Category matches
      if (categoryName.includes(term)) {
        score += 4;
      }
      
      // Tag matches
      if (tagsText.includes(term)) {
        score += 3;
      }
      
      // Summary matches
      if (lowerSummary.includes(term)) {
        score += 2;
      }
      
      // Content matches (lower priority due to potential noise)
      if (lowerExtractedText.includes(term)) {
        score += 1;
      }
    }

    // Boost score for recent documents
    const daysSinceUpload = doc.uploadedAt ? (Date.now() - new Date(doc.uploadedAt).getTime()) / (1000 * 60 * 60 * 24) : 999;
    if (daysSinceUpload < 7) score += 2;
    else if (daysSinceUpload < 30) score += 1;

    return score;
  }

  /**
   * Determine match type and generate snippet
   */
  private determineMatchType(doc: OptimizedSearchResult, searchTerms: string[]): { type: string; snippet: string } {
    const lowerName = doc.name.toLowerCase();
    const lowerFileName = doc.fileName.toLowerCase();
    const lowerExtractedText = (doc.extractedText || '').toLowerCase();
    const lowerSummary = (doc.summary || '').toLowerCase();
    const tagsText = (doc.tags || []).join(' ').toLowerCase();
    const categoryName = (doc.categoryName || '').toLowerCase();

    // Determine primary match type
    if (searchTerms.some(term => lowerName.includes(term))) {
      return { type: 'name', snippet: doc.name };
    } 
    
    if (searchTerms.some(term => categoryName.includes(term))) {
      return { type: 'category', snippet: `Category: ${doc.categoryName}` };
    }
    
    if (searchTerms.some(term => tagsText.includes(term))) {
      const matchingTags = (doc.tags || []).filter((tag: string) => 
        searchTerms.some(term => tag.toLowerCase().includes(term))
      );
      return { type: 'tag', snippet: `Tags: ${matchingTags.join(', ')}` };
    }
    
    if (searchTerms.some(term => lowerSummary.includes(term))) {
      const matchingTerm = searchTerms.find(term => lowerSummary.includes(term));
      if (matchingTerm && doc.summary) {
        const index = lowerSummary.indexOf(matchingTerm);
        const start = Math.max(0, index - 50);
        const end = Math.min(doc.summary.length, index + matchingTerm.length + 50);
        let snippet = doc.summary.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < doc.summary.length) snippet = snippet + '...';
        return { type: 'summary', snippet };
      }
    }
    
    if (searchTerms.some(term => lowerExtractedText.includes(term))) {
      const matchingTerm = searchTerms.find(term => lowerExtractedText.includes(term));
      if (matchingTerm && doc.extractedText) {
        const index = lowerExtractedText.indexOf(matchingTerm);
        const start = Math.max(0, index - 50);
        const end = Math.min(doc.extractedText.length, index + matchingTerm.length + 50);
        let snippet = doc.extractedText.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < doc.extractedText.length) snippet = snippet + '...';
        return { type: 'content', snippet };
      }
    }

    return { 
      type: 'filename', 
      snippet: doc.summary || doc.extractedText?.substring(0, 100) + '...' || doc.fileName 
    };
  }

  /**
   * Record search performance metrics
   */
  private recordSearchMetrics(metrics: SearchMetrics): void {
    this.metrics.push(metrics);
    
    // Log slow queries
    if (metrics.executionTime > 1000) {
      console.warn(`Slow search query detected:`, {
        query: metrics.query,
        executionTime: metrics.executionTime,
        resultCount: metrics.resultCount,
        userId: metrics.userId,
      });
    }
    
    // Keep only last 1000 metrics in memory
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Get search performance analytics
   */
  getSearchAnalytics(userId?: string): any {
    const relevantMetrics = userId 
      ? this.metrics.filter(m => m.userId === userId)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        totalSearches: 0,
        avgExecutionTime: 0,
        slowQueries: 0,
        popularTerms: [],
      };
    }

    const totalExecutionTime = relevantMetrics.reduce((sum, m) => sum + m.executionTime, 0);
    const slowQueries = relevantMetrics.filter(m => m.executionTime > 1000).length;
    
    // Get popular search terms
    const termCounts = new Map<string, number>();
    relevantMetrics.forEach(m => {
      const terms = m.query.toLowerCase().split(' ').filter(t => t.length > 2);
      terms.forEach(term => {
        termCounts.set(term, (termCounts.get(term) || 0) + 1);
      });
    });
    
    const popularTerms = Array.from(termCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));

    return {
      totalSearches: relevantMetrics.length,
      avgExecutionTime: Math.round(totalExecutionTime / relevantMetrics.length),
      slowQueries,
      popularTerms,
      recentSearches: relevantMetrics.slice(-10).map(m => ({
        query: m.query,
        executionTime: m.executionTime,
        resultCount: m.resultCount,
        timestamp: m.timestamp,
      })),
    };
  }

  /**
   * Batch operation for multiple document IDs with atomic transactions
   */
  async bulkUpdateDocuments(
    userId: string, 
    documentIds: number[], 
    updates: {
      categoryId?: number | null;
      tags?: string[];
      name?: string;
    }
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] };
    
    try {
      await db.transaction(async (tx) => {
        for (const docId of documentIds) {
          try {
            // Verify ownership
            const doc = await tx
              .select({ id: documents.id })
              .from(documents)
              .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
              .limit(1);

            if (doc.length === 0) {
              results.errors.push(`Document ${docId} not found or access denied`);
              results.failed++;
              continue;
            }

            // Perform update
            await tx
              .update(documents)
              .set(updates)
              .where(and(eq(documents.id, docId), eq(documents.userId, userId)));

            results.success++;
          } catch (error) {
            results.errors.push(`Failed to update document ${docId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            results.failed++;
          }
        }
      });
    } catch (error) {
      throw new Error(`Bulk update transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return results;
  }

  /**
   * Bulk delete operation with atomic transaction
   */
  async bulkDeleteDocuments(userId: string, documentIds: number[]): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] };
    
    try {
      await db.transaction(async (tx) => {
        // Verify all documents belong to user first
        const validDocs = await tx
          .select({ id: documents.id, filePath: documents.filePath })
          .from(documents)
          .where(and(
            inArray(documents.id, documentIds),
            eq(documents.userId, userId)
          ));

        if (validDocs.length !== documentIds.length) {
          const foundIds = validDocs.map(d => d.id);
          const notFound = documentIds.filter(id => !foundIds.includes(id));
          notFound.forEach(id => {
            results.errors.push(`Document ${id} not found or access denied`);
            results.failed++;
          });
        }

        // Delete valid documents
        for (const doc of validDocs) {
          try {
            await tx.delete(documents).where(eq(documents.id, doc.id));
            results.success++;
          } catch (error) {
            results.errors.push(`Failed to delete document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            results.failed++;
          }
        }
      });
    } catch (error) {
      throw new Error(`Bulk delete transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return results;
  }
}

export const searchOptimizationService = new SearchOptimizationService();