
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

// Use the same connection details as the main app
const connectionString = process.env.DATABASE_URL || 'postgresql://myhomedocs_owner:Q2CgNfHxSYKR@ep-weathered-smoke-a2lhq6c5.eu-central-1.aws.neon.tech/myhomedocs?sslmode=require';

const client = postgres(connectionString, { 
  ssl: 'require',
  max: 1 
});

async function debugFeatureFlags() {
  try {
    console.log('🔍 [DEBUG] Checking feature flags table...');
    
    // Check if table exists
    const tableExists = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'feature_flags'
      );
    `;
    console.log('🔍 [DEBUG] Feature flags table exists:', tableExists[0]?.exists);
    
    if (tableExists[0]?.exists) {
      // Check table structure
      const tableStructure = await client`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'feature_flags'
        ORDER BY ordinal_position;
      `;
      console.log('🔍 [DEBUG] Table structure:', tableStructure);
      
      // Check data count
      const count = await client`SELECT COUNT(*) FROM feature_flags;`;
      console.log('🔍 [DEBUG] Total feature flags:', count[0]?.count);
      
      // Get sample data
      const sampleData = await client`SELECT * FROM feature_flags LIMIT 5;`;
      console.log('🔍 [DEBUG] Sample data:', sampleData);
    }
    
    // Check feature flag events table
    const eventsTableExists = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'feature_flag_events'
      );
    `;
    console.log('🔍 [DEBUG] Feature flag events table exists:', eventsTableExists[0]?.exists);
    
    if (eventsTableExists[0]?.exists) {
      const eventsCount = await client`SELECT COUNT(*) FROM feature_flag_events;`;
      console.log('🔍 [DEBUG] Total feature flag events:', eventsCount[0]?.count);
    }
    
  } catch (error) {
    console.error('❌ [DEBUG] Error checking feature flags:', error);
  } finally {
    await client.end();
  }
}

debugFeatureFlags();
