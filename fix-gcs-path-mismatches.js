#!/usr/bin/env node

/**
 * Fix GCS Path Mismatches
 * Corrects database records that point to non-existent GCS files
 */

import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Fixing GCS Path Mismatches');
console.log('='.repeat(50));

const sql = neon(process.env.DATABASE_URL);
const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GCS_PROJECT_ID
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

async function fixPathMismatches() {
  try {
    // Get all documents with GCS paths
    const documentsResult = await sql(`
      SELECT id, user_id, name, file_name, gcs_path 
      FROM documents 
      WHERE gcs_path IS NOT NULL 
      ORDER BY id DESC
    `);
    
    console.log(`Checking ${documentsResult.length} documents with GCS paths`);
    
    // List all files in bucket first
    const [files] = await bucket.getFiles();
    console.log(`Found ${files.length} files in GCS bucket`);
    
    let fixed = 0;
    let verified = 0;
    let missing = 0;
    
    for (const doc of documentsResult) {
      console.log(`\n🔍 Checking: ${doc.name} (ID: ${doc.id})`);
      console.log(`  📂 Current path: ${doc.gcs_path}`);
      
      // Check if current path exists
      const currentFile = bucket.file(doc.gcs_path);
      const [exists] = await currentFile.exists();
      
      if (exists) {
        console.log(`  ✅ Path verified - file exists`);
        verified++;
        continue;
      }
      
      console.log(`  ❌ File not found at current path`);
      
      // Look for the actual file in the user's directory
      const userFiles = files.filter(file => {
        const belongsToUser = file.name.includes(`users/${doc.user_id}/`) || 
                            file.name.includes(`${doc.user_id}/`);
        const fileName = file.name.split('/').pop();
        const matchesName = fileName === doc.file_name;
        return belongsToUser && matchesName;
      });
      
      console.log(`  🔍 Found ${userFiles.length} potential matches for user`);
      
      if (userFiles.length > 0) {
        // Use the first match (they should all be the same file)
        const correctFile = userFiles[0];
        console.log(`  ✅ Found correct path: ${correctFile.name}`);
        
        // Update database
        await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [correctFile.name, doc.id]);
        console.log(`  💾 Updated database with correct path`);
        
        fixed++;
      } else {
        console.log(`  ⚠️  No matching files found - document may be missing`);
        
        // Show what files exist for this user
        const allUserFiles = files.filter(file => 
          file.name.includes(`users/${doc.user_id}/`) || file.name.includes(`${doc.user_id}/`)
        );
        if (allUserFiles.length > 0) {
          console.log(`  📋 Available files for this user:`);
          allUserFiles.forEach(file => {
            console.log(`    - ${file.name}`);
          });
        } else {
          console.log(`  📭 No files found for user ${doc.user_id}`);
        }
        
        missing++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Fix Summary:');
    console.log(`  ✅ Verified correct: ${verified} documents`);
    console.log(`  🔧 Fixed paths: ${fixed} documents`);
    console.log(`  ❌ Missing files: ${missing} documents`);
    
    if (fixed > 0) {
      console.log('\n🎉 Path corrections completed!');
      
      // Show updated results
      const updatedDocs = await sql(`
        SELECT id, name, gcs_path 
        FROM documents 
        WHERE gcs_path IS NOT NULL 
        ORDER BY id DESC 
        LIMIT 10
      `);
      
      console.log('\n📋 Updated document paths:');
      updatedDocs.forEach(doc => {
        console.log(`  ${doc.id}: ${doc.name}`);
        console.log(`    → ${doc.gcs_path}`);
      });
    }
    
  } catch (error) {
    console.error('💥 Fix script failed:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !process.env.GCS_BUCKET_NAME) {
      throw new Error('Missing GCS configuration');
    }
    
    console.log(`🔧 Configuration:`);
    console.log(`  Bucket: ${bucketName}`);
    console.log(`  Project: ${process.env.GCS_PROJECT_ID}`);
    
    await fixPathMismatches();
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();