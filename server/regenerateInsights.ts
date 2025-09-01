
import { storage } from './storage.js';
import { aiInsightService } from './aiInsightService.js';

async function regenerateAllInsights() {
  console.log('🔄 Starting insight regeneration process...');
  
  try {
    // Step 1: Delete all existing insights
    console.log('🗑️ Deleting all existing insights...');
    const deleteResult = await storage.safeQuery(`
      DELETE FROM insights
    `);
    console.log(`✅ Deleted existing insights`);

    // Step 2: Get all documents with extracted text
    console.log('📄 Fetching documents with extracted text...');
    const documents = await storage.safeQuery(`
      SELECT 
        d.id,
        d.name,
        d.extractedText,
        d.userId,
        d.mimeType,
        c.name as categoryName
      FROM documents d
      LEFT JOIN categories c ON d.categoryId = c.id
      WHERE d.extractedText IS NOT NULL 
        AND d.extractedText != ''
        AND LENGTH(TRIM(d.extractedText)) > 10
      ORDER BY d.createdAt DESC
    `);

    console.log(`📊 Found ${documents.length} documents to process`);

    let processed = 0;
    let errors = 0;

    // Step 3: Generate insights for each document
    for (const doc of documents) {
      try {
        console.log(`🔍 Processing document ${doc.id}: ${doc.name}`);
        
        const insights = await aiInsightService.generateInsights(
          doc.extractedText,
          doc.categoryName || 'general',
          doc.name,
          doc.mimeType || 'application/octet-stream'
        );

        // Store insights in database
        for (const insight of insights) {
          await storage.safeQuery(`
            INSERT INTO insights (
              id, documentId, userId, type, title, content, confidence, 
              category, metadata, createdAt, tier
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            crypto.randomUUID(),
            doc.id,
            doc.userId,
            insight.type,
            insight.title,
            insight.content,
            insight.confidence,
            insight.category,
            JSON.stringify(insight.metadata || {}),
            new Date().toISOString(),
            insight.tier || 'primary'
          ]);
        }

        processed++;
        console.log(`✅ Generated ${insights.length} insights for document ${doc.id}`);
        
        // Add small delay to avoid overwhelming the AI service
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        errors++;
        console.error(`❌ Failed to process document ${doc.id}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log('🎉 Insight regeneration completed!');
    console.log(`📊 Summary: ${processed} documents processed, ${errors} errors`);
    
  } catch (error) {
    console.error('❌ Insight regeneration failed:', error);
    throw error;
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  regenerateAllInsights()
    .then(() => {
      console.log('✅ Regeneration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Regeneration script failed:', error);
      process.exit(1);
    });
}

export { regenerateAllInsights };
