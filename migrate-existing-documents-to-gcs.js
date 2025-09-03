
#!/usr/bin/env node

/**
 * Migrate Existing Documents to GCS
 * Uploads local documents to GCS and updates database paths
 */

import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';
import { StorageService } from './server/storage/StorageService.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 Starting Document Migration to GCS');
console.log('='.repeat(50));

const sql = neon(process.env.DATABASE_URL);

async function migrateDocuments() {
  try {
    // Initialize storage service
    const storageService = StorageService.initialize();
    console.log('✅ Storage service initialized');

    // Get documents without GCS paths that have local files
    const documentsResult = await sql(`
      SELECT id, user_id, name, file_name, file_path, mime_type, gcs_path 
      FROM documents 
      WHERE gcs_path IS NULL 
      AND file_path IS NOT NULL 
      AND file_path != ''
      ORDER BY id DESC
    `);

    console.log(`📊 Found ${documentsResult.length} documents to migrate`);

    let migrated = 0;
    let failed = 0;
    let notFound = 0;

    for (const doc of documentsResult) {
      try {
        console.log(`\n🔄 Processing: ${doc.name} (ID: ${doc.id})`);
        console.log(`  📁 Local path: ${doc.file_path}`);

        // Check if local file exists
        if (!fs.existsSync(doc.file_path)) {
          console.log(`  ❌ Local file not found: ${doc.file_path}`);
          notFound++;
          continue;
        }

        // Read file into buffer
        const fileBuffer = fs.readFileSync(doc.file_path);
        console.log(`  📖 Read file: ${fileBuffer.length} bytes`);

        // Generate GCS key
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substr(2, 15);
        const gcsKey = `users/${doc.user_id}/documents/${timestamp}_${randomId}/${doc.file_name}`;

        // Upload to GCS
        const gcsPath = await storageService.upload(fileBuffer, gcsKey, doc.mime_type);
        console.log(`  ☁️ Uploaded to GCS: ${gcsPath}`);

        // Update database with GCS path
        await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [gcsPath, doc.id]);
        console.log(`  💾 Updated database with GCS path`);

        migrated++;

        // Optional: Remove local file after successful upload (uncomment if desired)
        // fs.unlinkSync(doc.file_path);
        // console.log(`  🗑️ Removed local file`);

      } catch (error) {
        console.log(`  ❌ Migration failed for ${doc.name}: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`  ✅ Successfully migrated: ${migrated} documents`);
    console.log(`  ❌ Migration failed: ${failed} documents`);
    console.log(`  📂 Local files not found: ${notFound} documents`);
    console.log(`  📈 Total processed: ${documentsResult.length} documents`);

    if (migrated > 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('📋 Next steps:');
      console.log('  1. Test document access in the application');
      console.log('  2. Verify thumbnails are generating properly');
      console.log('  3. Consider cleaning up local files after verification');
    }

  } catch (error) {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateDocuments().then(() => {
  console.log('\n✨ Migration script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Migration script error:', error);
  process.exit(1);
});
