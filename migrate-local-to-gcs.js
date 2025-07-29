#!/usr/bin/env node

/**
 * Local to GCS Migration Script
 * Migrates existing local documents to Google Cloud Storage
 */

import { Storage } from '@google-cloud/storage';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Local to GCS Migration Script');
console.log('='.repeat(50));

// Initialize Google Cloud Storage
const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GCS_PROJECT_ID
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);
const uploadsDir = './uploads';

// Initialize database connection
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function migrateLocalDocuments() {
  try {
    console.log(`📊 Migrating local files to GCS bucket: ${bucketName}`);
    
    // Get all documents from database using raw SQL since we can't import the schema
    console.log('📋 Fetching documents from database...');
    const documentsResult = await sql(`SELECT id, user_id, name, file_name, gcs_path FROM documents ORDER BY id DESC`);
    console.log(`Found ${documentsResult.length} documents in database`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const doc of documentsResult) {
      try {
        console.log(`\n🔍 Processing: ${doc.name} (ID: ${doc.id})`);
        
        // Skip if already has GCS path
        if (doc.gcs_path) {
          console.log(`  ✅ Already has GCS path: ${doc.gcs_path}`);
          skipped++;
          continue;
        }
        
        // Look for the local file in uploads directory
        const possibleFiles = [
          join(uploadsDir, doc.file_name),
          join(uploadsDir, `${doc.id}-${doc.file_name}`),
          join(uploadsDir, `document-${doc.id}.pdf`),
        ];
        
        let localFilePath = null;
        for (const filePath of possibleFiles) {
          if (existsSync(filePath)) {
            localFilePath = filePath;
            break;
          }
        }
        
        // Check files in uploads directory that might match this document
        if (!localFilePath) {
          console.log(`  ⚠️  Local file not found, checking uploads directory...`);
          
          // Look for files that might belong to this document by checking creation time
          const { execSync } = await import('child_process');
          try {
            const uploadFiles = execSync('ls -la uploads/', { encoding: 'utf8' });
            console.log(`  📂 Files in uploads: ${uploadFiles.split('\n').length - 3} files found`);
          } catch (e) {
            console.log(`  📂 Could not list uploads directory`);
          }
          
          console.log(`  ⏭️  Skipping - no local file found`);
          skipped++;
          continue;
        }
        
        console.log(`  📁 Found local file: ${localFilePath}`);
        
        // Read the file
        const fileBuffer = readFileSync(localFilePath);
        console.log(`  📊 File size: ${Math.round(fileBuffer.length / 1024)}KB`);
        
        // Create GCS path
        const gcsPath = `users/${doc.user_id}/documents/${doc.id}/${doc.file_name}`;
        console.log(`  ☁️  Target GCS path: ${gcsPath}`);
        
        // Check if already exists in GCS
        const gcsFile = bucket.file(gcsPath);
        const [exists] = await gcsFile.exists();
        
        if (exists) {
          console.log(`  ✅ Already exists in GCS, updating database only`);
        } else {
          // Upload to GCS
          console.log(`  ⬆️  Uploading to GCS...`);
          await gcsFile.save(fileBuffer, {
            metadata: {
              contentType: doc.file_name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
              metadata: {
                originalName: doc.file_name,
                documentId: doc.id.toString(),
                userId: doc.user_id,
                migratedFrom: 'local',
                migratedAt: new Date().toISOString()
              }
            }
          });
          console.log(`  ✅ Successfully uploaded to GCS`);
        }
        
        // Update database with GCS path
        await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [gcsPath, doc.id]);
        console.log(`  💾 Updated database with GCS path`);
        
        migrated++;
        
      } catch (error) {
        console.log(`  ❌ Error processing ${doc.name}: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`  ✅ Successfully migrated: ${migrated} documents`);
    console.log(`  ⏭️  Skipped (already migrated or no file): ${skipped} documents`);
    console.log(`  ❌ Errors: ${errors} documents`);
    
    if (migrated > 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('📋 Next steps:');
      console.log('  1. Test document loading in the application');
      console.log('  2. Verify all documents are accessible');
      console.log('  3. Consider cleanup of local uploads directory (manual step)');
    } else {
      console.log('\n✅ All documents already migrated or no files to migrate!');
    }
    
  } catch (error) {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  }
}

// Run migration with proper error handling
async function main() {
  try {
    // Verify environment variables
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS not found');
    }
    if (!process.env.GCS_BUCKET_NAME) {
      throw new Error('GCS_BUCKET_NAME not found');
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not found');
    }
    
    console.log(`🔧 Migration Configuration:`);
    console.log(`  Target bucket: ${bucketName}`);
    console.log(`  Project ID: ${process.env.GCS_PROJECT_ID}`);
    console.log(`  Local uploads: ${uploadsDir}`);
    
    await migrateLocalDocuments();
    
  } catch (error) {
    console.error('❌ Migration setup failed:', error.message);
    process.exit(1);
  }
}

main();