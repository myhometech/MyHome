
import { db } from './db';
import { documentInsights } from '../shared/schema';
import { eq, isNull, or } from 'drizzle-orm';
import { aiInsightService } from './aiInsightService';

interface LegacyInsight {
  id: string;
  title: string;
  content: string;
  type: string;
  priority?: string;
  category?: string;
  metadata?: any;
}

// Map old priority values to new category values
const priorityToCategoryMap: Record<string, string> = {
  'high': 'financial',
  'medium': 'important_dates', 
  'low': 'general',
  'critical': 'financial',
  'urgent': 'important_dates',
  'normal': 'general'
};

// Analyze content to suggest category using AI
async function analyzeContentForCategory(title: string, content: string, type: string): Promise<string> {
  try {
    const prompt = `Analyze this document insight and categorize it as one of: financial, important_dates, or general.

Title: ${title}
Content: ${content}
Type: ${type}

Consider:
- financial: Bills, payments, taxes, loans, investments, financial deadlines
- important_dates: Deadlines, renewals, expirations, appointments, events
- general: Summaries, contacts, general information, compliance

Respond with only one word: financial, important_dates, or general`;

    const response = await aiInsightService.callLLM(prompt);
    const category = response.toLowerCase().trim();
    
    if (['financial', 'important_dates', 'general'].includes(category)) {
      return category;
    }
    
    // Fallback based on content analysis
    return fallbackCategoryAnalysis(title, content, type);
  } catch (error) {
    console.error('AI category analysis failed:', error);
    return fallbackCategoryAnalysis(title, content, type);
  }
}

// Fallback category analysis without AI
function fallbackCategoryAnalysis(title: string, content: string, type: string): string {
  const text = `${title} ${content}`.toLowerCase();
  
  // Financial keywords
  const financialKeywords = [
    'payment', 'bill', 'due', 'tax', 'invoice', 'loan', 'mortgage', 
    'credit', 'bank', 'account', 'balance', 'fee', 'charge', 'cost',
    'price', 'money', 'dollar', 'pound', 'euro', 'financial', 'budget'
  ];
  
  // Important dates keywords
  const dateKeywords = [
    'expire', 'expiry', 'deadline', 'due date', 'renewal', 'renew',
    'appointment', 'meeting', 'event', 'schedule', 'calendar', 'remind',
    'license', 'passport', 'insurance', 'registration', 'subscription'
  ];
  
  // Check for financial indicators
  if (financialKeywords.some(keyword => text.includes(keyword)) || type === 'financial_info') {
    return 'financial';
  }
  
  // Check for date-related indicators
  if (dateKeywords.some(keyword => text.includes(keyword)) || type === 'key_dates') {
    return 'important_dates';
  }
  
  // Default to general
  return 'general';
}

export async function migrateInsightsToCategory() {
  console.log('🔄 Starting insights migration from priority to category...');
  
  try {
    // Find insights that don't have a category or have null category
    const insightsToMigrate = await db
      .select()
      .from(documentInsights)
      .where(or(
        isNull(documentInsights.category),
        eq(documentInsights.category, ''),
        eq(documentInsights.category, 'null')
      ));
    
    console.log(`📊 Found ${insightsToMigrate.length} insights to migrate`);
    
    if (insightsToMigrate.length === 0) {
      console.log('✅ No insights need migration');
      return;
    }
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const insight of insightsToMigrate) {
      try {
        let newCategory = 'general'; // default
        
        // Try to parse metadata for old priority
        let metadata = {};
        try {
          metadata = typeof insight.metadata === 'string' 
            ? JSON.parse(insight.metadata) 
            : insight.metadata || {};
        } catch (e) {
          console.warn(`Failed to parse metadata for insight ${insight.id}`);
        }
        
        // Check if there's a priority in metadata
        const oldPriority = (metadata as any)?.priority;
        if (oldPriority && priorityToCategoryMap[oldPriority]) {
          newCategory = priorityToCategoryMap[oldPriority];
        } else {
          // Use AI or fallback analysis
          newCategory = await analyzeContentForCategory(
            insight.title, 
            insight.content, 
            insight.type
          );
        }
        
        // Update the insight with the new category
        await db
          .update(documentInsights)
          .set({ 
            category: newCategory,
            updatedAt: new Date()
          })
          .where(eq(documentInsights.id, insight.id));
        
        migratedCount++;
        console.log(`✅ Migrated insight ${insight.id}: "${insight.title}" -> ${newCategory}`);
        
        // Add a small delay to avoid overwhelming the AI service
        if (migratedCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to migrate insight ${insight.id}:`, error);
      }
    }
    
    console.log(`🎉 Migration complete! Migrated: ${migratedCount}, Errors: ${errorCount}`);
    
    // Verify the migration
    const remainingUncategorized = await db
      .select()
      .from(documentInsights)
      .where(or(
        isNull(documentInsights.category),
        eq(documentInsights.category, ''),
        eq(documentInsights.category, 'null')
      ));
    
    console.log(`📊 Remaining uncategorized insights: ${remainingUncategorized.length}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateInsightsToCategory()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}
