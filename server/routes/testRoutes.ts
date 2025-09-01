
import { Router } from 'express';
import { storage } from '../storage';
import { StorageService } from '../storage/StorageService';
import fs from 'fs';
import path from 'path';

const router = Router();

// DELETE ALL DOCUMENTS AND INSIGHTS FOR TESTING
router.delete('/reset-user-data', async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;
    console.log(`🧹 TESTING: Complete data reset requested for user ${userId}`);

    let deletedCounts = {
      insights: 0,
      documents: 0,
      files: 0,
      categories: 0,
      facts: 0
    };

    // 1. Delete all insights first
    const allInsights = await storage.getInsights(userId);
    for (const insight of allInsights) {
      try {
        await storage.deleteInsight(insight.id);
        deletedCounts.insights++;
        console.log(`✅ Deleted insight ${insight.id}`);
      } catch (error) {
        console.warn(`Failed to delete insight ${insight.id}:`, error);
      }
    }

    // 2. Delete all document files and records
    const allDocuments = await storage.getDocuments(userId);
    for (const document of allDocuments) {
      try {
        // Delete from GCS if exists
        if (document.gcsPath) {
          try {
            const storageService = StorageService.initialize();
            await storageService.delete(document.gcsPath);
            console.log(`✅ Deleted GCS file: ${document.gcsPath}`);
          } catch (gcsError) {
            console.warn(`Failed to delete GCS file ${document.gcsPath}:`, gcsError);
          }
        }

        // Delete local file if exists
        if (document.filePath && fs.existsSync(document.filePath)) {
          try {
            await fs.promises.unlink(document.filePath);
            console.log(`✅ Deleted local file: ${document.filePath}`);
            deletedCounts.files++;
          } catch (fileError) {
            console.warn(`Failed to delete local file ${document.filePath}:`, fileError);
          }
        }

        // Delete document record
        await storage.deleteDocument(document.id, userId);
        deletedCounts.documents++;
        console.log(`✅ Deleted document ${document.id}: ${document.name}`);

      } catch (error) {
        console.warn(`Failed to delete document ${document.id}:`, error);
      }
    }

    // 3. Delete document facts
    try {
      const allDocs = await storage.getDocuments(userId);
      for (const doc of allDocs) {
        const facts = await storage.getDocumentFacts(doc.id, userId);
        for (const fact of facts) {
          try {
            await storage.deleteDocumentFact(fact.id);
            deletedCounts.facts++;
          } catch (factError) {
            console.warn(`Failed to delete fact ${fact.id}:`, factError);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to clean up facts:', error);
    }

    // 4. Delete categories (optional - only user-created ones)
    try {
      const categories = await storage.getUserCategories(userId);
      for (const category of categories) {
        if (category.userId === userId) { // Only delete user-created categories
          try {
            await storage.deleteCategory(category.id, userId);
            deletedCounts.categories++;
            console.log(`✅ Deleted category ${category.id}: ${category.name}`);
          } catch (categoryError) {
            console.warn(`Failed to delete category ${category.id}:`, categoryError);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to clean up categories:', error);
    }

    console.log(`🧹 TESTING: Complete data reset completed for user ${userId}:`, deletedCounts);

    res.json({
      success: true,
      message: 'All user data deleted successfully',
      deleted: deletedCounts,
      userId,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Failed to reset user data:', error);
    res.status(500).json({
      message: 'Failed to reset user data',
      error: error.message,
    });
  }
});

// Get user data summary for testing
router.get('/user-data-summary', async (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const userId = req.user.id;

    const [insights, documents, categories] = await Promise.all([
      storage.getInsights(userId),
      storage.getDocuments(userId),
      storage.getUserCategories(userId)
    ]);

    const summary = {
      userId,
      insights: insights.length,
      documents: documents.length,
      categories: categories.filter(c => c.userId === userId).length,
      userCreatedCategories: categories.filter(c => c.userId === userId).map(c => ({
        id: c.id,
        name: c.name
      })),
      documentSample: documents.slice(0, 5).map(d => ({
        id: d.id,
        name: d.name,
        fileName: d.fileName
      })),
      insightSample: insights.slice(0, 5).map(i => ({
        id: i.id,
        title: i.title,
        type: i.type,
        documentId: i.documentId
      }))
    };

    res.json(summary);

  } catch (error: any) {
    console.error('Failed to get user data summary:', error);
    res.status(500).json({
      message: 'Failed to get user data summary',
      error: error.message,
    });
  }
});

export default router;
