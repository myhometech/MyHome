#!/usr/bin/env node

/**
 * File Migration Script
 * Migrates existing files from myhometech-storage to myhometech-eu
 */

import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚚 Starting file migration from myhometech-storage to myhometech-eu');
console.log('='.repeat(70));

const OLD_BUCKET = 'myhometech-storage';
const NEW_BUCKET = 'myhometech-eu';

async function migrateFiles() {
  try {
    // Initialize storage client
    let storage;
    if (process.env.NEW_GOOGLE_APPLICATION_CREDENTIALS) {
      storage = new Storage({
        keyFilename: './server/google-service-account.json',
        projectId: process.env.GCS_PROJECT_ID
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      storage = new Storage({
        credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
        projectId: process.env.GCS_PROJECT_ID
      });
    } else {
      console.log('   ⚠️  No GCS credentials found, cannot perform migration');
      return;
    }

    const oldBucket = storage.bucket(OLD_BUCKET);
    const newBucket = storage.bucket(NEW_BUCKET);

    // Check if old bucket exists
    const [oldExists] = await oldBucket.exists();
    if (!oldExists) {
      console.log('   ℹ️  Old bucket does not exist or is not accessible');
      return;
    }

    // Check if new bucket exists
    const [newExists] = await newBucket.exists();
    if (!newExists) {
      console.log('   ❌ New bucket does not exist');
      return;
    }

    console.log('   ✅ Both buckets are accessible');

    // List all files in old bucket
    console.log('\n📋 Listing files in old bucket...');
    const [files] = await oldBucket.getFiles();
    
    if (files.length === 0) {
      console.log('   ℹ️  No files found in old bucket to migrate');
      return;
    }

    console.log(`   📁 Found ${files.length} files to migrate`);

    let migrated = 0;
    let errors = 0;

    // Migrate each file
    for (const file of files) {
      try {
        console.log(`   🔄 Migrating: ${file.name}`);
        
        // Check if file already exists in new bucket
        const newFile = newBucket.file(file.name);
        const [exists] = await newFile.exists();
        
        if (exists) {
          console.log(`   ⏭️  Already exists: ${file.name}`);
          continue;
        }

        // Copy file to new bucket
        await file.copy(newFile);
        
        // Verify the copy was successful
        const [newExists] = await newFile.exists();
        if (newExists) {
          console.log(`   ✅ Migrated: ${file.name}`);
          migrated++;
        } else {
          console.log(`   ❌ Migration failed: ${file.name}`);
          errors++;
        }

      } catch (error) {
        console.log(`   ❌ Error migrating ${file.name}: ${error.message}`);
        errors++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Total files: ${files.length}`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Skipped (already exist): ${files.length - migrated - errors}`);

    if (errors === 0) {
      console.log('\n🎉 File migration completed successfully!');
    } else {
      console.log(`\n⚠️  Migration completed with ${errors} errors`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateFiles();