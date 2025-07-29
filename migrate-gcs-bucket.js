#!/usr/bin/env node

/**
 * GCS Bucket Migration Script
 * Migrates documents from old bucket to new bucket (myhome-docs-prod)
 */

import { Storage } from '@google-cloud/storage';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon } from '@neondatabase/serverless';
import { documents } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 GCS Bucket Migration Script');
console.log('='.repeat(50));

// Initialize Google Cloud Storage
const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GCS_PROJECT_ID
});

const newBucketName = process.env.GCS_BUCKET_NAME; // myhome-docs-prod
const oldBucketName = 'myhome-storage-backup'; // Previous bucket name

console.log(`🔧 Migration will move files from ${oldBucketName} to ${newBucketName}`);

// Initialize database connection
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function migrateDocuments() {
  try {
    console.log(`📊 Starting migration from ${oldBucketName} to ${newBucketName}`);
    
    // Get all documents from database
    console.log('📋 Fetching documents from database...');
    const allDocuments = await db.select().from(documents);
    console.log(`Found ${allDocuments.length} documents to check`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const doc of allDocuments) {
      try {
        console.log(`\n🔍 Processing: ${doc.name} (ID: ${doc.id})`);
        
        // Check if document has GCS path
        if (!doc.gcs_path) {
          console.log(`  ⏭️  No GCS path found, skipping`);
          skipped++;
          continue;
        }
        
        const oldFilePath = doc.gcs_path;
        console.log(`  📂 Current path: ${oldFilePath}`);
        
        // Check if file exists in old bucket
        const oldFile = storage.bucket(oldBucketName).file(oldFilePath);
        const [oldExists] = await oldFile.exists();
        
        if (!oldExists) {
          console.log(`  ❌ File not found in old bucket: ${oldFilePath}`);
          // Check if already in new bucket
          const newFile = storage.bucket(newBucketName).file(oldFilePath);
          const [newExists] = await newFile.exists();
          
          if (newExists) {
            console.log(`  ✅ Already exists in new bucket`);
            skipped++;
          } else {
            console.log(`  🚨 File missing from both buckets!`);
            errors++;
          }
          continue;
        }
        
        // Check if already exists in new bucket
        const newFile = storage.bucket(newBucketName).file(oldFilePath);
        const [newExists] = await newFile.exists();
        
        if (newExists) {
          console.log(`  ✅ Already exists in new bucket, skipping copy`);
          skipped++;
          continue;
        }
        
        // Copy file from old bucket to new bucket
        console.log(`  🔄 Copying to new bucket...`);
        await oldFile.copy(newFile);
        
        // Verify the copy was successful
        const [copyExists] = await newFile.exists();
        if (copyExists) {
          console.log(`  ✅ Successfully migrated: ${oldFilePath}`);
          migrated++;
          
          // Optional: Delete from old bucket after successful copy
          // await oldFile.delete();
          // console.log(`  🗑️  Deleted from old bucket`);
        } else {
          console.log(`  ❌ Migration failed: ${oldFilePath}`);
          errors++;
        }
        
      } catch (error) {
        console.log(`  ❌ Error processing ${doc.name}: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`  ✅ Successfully migrated: ${migrated} files`);
    console.log(`  ⏭️  Skipped (already exists): ${skipped} files`);
    console.log(`  ❌ Errors: ${errors} files`);
    
    if (migrated > 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('📋 Next steps:');
      console.log('  1. Test document loading in the application');
      console.log('  2. Verify all documents are accessible');
      console.log('  3. Consider cleanup of old bucket (manual step)');
    } else if (skipped > 0 && errors === 0) {
      console.log('\n✅ All documents already migrated!');
    } else {
      console.log('\n⚠️  Migration completed with issues. Check errors above.');
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
    console.log(`  New bucket: ${newBucketName}`);
    console.log(`  Old bucket: ${oldBucketName}`);
    console.log(`  Project ID: ${process.env.GCS_PROJECT_ID}`);
    
    await migrateDocuments();
    
  } catch (error) {
    console.error('❌ Migration setup failed:', error.message);
    process.exit(1);
  }
}

main();