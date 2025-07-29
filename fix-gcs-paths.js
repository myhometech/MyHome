#!/usr/bin/env node

/**
 * Fix GCS Paths for Recent Documents
 * Updates database records for documents already stored in GCS
 */

import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 GCS Path Fix Script');
console.log('='.repeat(50));

// Initialize database connection
const sql = neon(process.env.DATABASE_URL);

// Initialize Google Cloud Storage
const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GCS_PROJECT_ID
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

async function fixGCSPaths() {
  try {
    console.log(`📊 Checking documents without GCS paths in bucket: ${bucketName}`);
    
    // Get documents without GCS paths
    const documentsResult = await sql(`
      SELECT id, user_id, name, file_name, gcs_path 
      FROM documents 
      WHERE gcs_path IS NULL 
      ORDER BY id DESC
    `);
    
    console.log(`Found ${documentsResult.length} documents without GCS paths`);
    
    let fixed = 0;
    let notFound = 0;
    let errors = 0;
    
    for (const doc of documentsResult) {
      try {
        console.log(`\n🔍 Processing: ${doc.name} (ID: ${doc.id})`);
        
        // Common GCS path patterns for documents that were uploaded directly to GCS
        const possiblePaths = [
          `users/${doc.user_id}/temp_${Date.now()}_${Math.random().toString(36).substr(2, 15)}/${doc.file_name}`,
          `${doc.user_id}/temp_${Date.now()}_${Math.random().toString(36).substr(2, 15)}/${doc.file_name}`,
          `users/${doc.user_id}/documents/${doc.id}/${doc.file_name}`,
        ];
        
        // Since we can't guess the exact temp path, let's look for files with similar names in the bucket
        console.log(`  🔍 Searching bucket for files matching: ${doc.file_name}`);
        
        const [files] = await bucket.getFiles({
          prefix: `users/${doc.user_id}/`,
        });
        
        // Look for files that match this document
        const matchingFiles = files.filter(file => {
          const fileName = file.name.split('/').pop();
          return fileName === doc.file_name;
        });
        
        console.log(`  📁 Found ${matchingFiles.length} potential matches`);
        
        if (matchingFiles.length === 0) {
          console.log(`  ❌ No matching files found in GCS`);
          notFound++;
          continue;
        }
        
        // Use the most recent file (assuming it's the correct one)
        const targetFile = matchingFiles[0];
        const gcsPath = targetFile.name;
        
        console.log(`  ✅ Found file: ${gcsPath}`);
        
        // Update database
        await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [gcsPath, doc.id]);
        console.log(`  💾 Updated database with GCS path`);
        
        fixed++;
        
      } catch (error) {
        console.log(`  ❌ Error processing ${doc.name}: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Fix Summary:');
    console.log(`  ✅ Successfully fixed: ${fixed} documents`);
    console.log(`  ❌ Not found in GCS: ${notFound} documents`);
    console.log(`  💥 Errors: ${errors} documents`);
    
    if (fixed > 0) {
      console.log('\n🎉 GCS paths updated successfully!');
      console.log('📋 Next steps:');
      console.log('  1. Test document loading in the application');
      console.log('  2. Verify all documents are now accessible');
    }
    
  } catch (error) {
    console.error('💥 Fix script failed:', error);
    process.exit(1);
  }
}

// Alternative approach: Check server logs to find actual GCS paths
async function findGCSPathsFromLogs() {
  console.log('\n🔍 Alternative: Extracting GCS paths from recent uploads...');
  
  // Get recent documents that should have been uploaded to GCS
  const recentDocs = await sql(`
    SELECT id, user_id, name, file_name, created_at
    FROM documents 
    WHERE gcs_path IS NULL 
    AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
  `);
  
  console.log(`Found ${recentDocs.length} recent documents to check`);
  
  // For documents uploaded today, we can try to find them by checking common patterns
  for (const doc of recentDocs) {
    console.log(`\n📋 Document ${doc.id}: ${doc.name}`);
    
    // Try to list files in user directory
    try {
      const [files] = await bucket.getFiles({
        prefix: `users/${doc.user_id}/`,
      });
      
      // Look for files that might match based on name and approximate upload time
      const potentialMatches = files.filter(file => {
        const parts = file.name.split('/');
        const fileName = parts[parts.length - 1];
        return fileName === doc.file_name || fileName.includes(doc.file_name.replace('.pdf', ''));
      });
      
      if (potentialMatches.length > 0) {
        console.log(`  🎯 Found ${potentialMatches.length} potential matches:`);
        potentialMatches.forEach((file, idx) => {
          console.log(`    ${idx + 1}. ${file.name}`);
        });
        
        // Use the first match
        const selectedFile = potentialMatches[0];
        await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [selectedFile.name, doc.id]);
        console.log(`  ✅ Updated document ${doc.id} with path: ${selectedFile.name}`);
      } else {
        console.log(`  ❌ No matches found for ${doc.file_name}`);
      }
      
    } catch (error) {
      console.log(`  💥 Error checking files: ${error.message}`);
    }
  }
}

// Run the fix
async function main() {
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !process.env.GCS_BUCKET_NAME) {
      throw new Error('Missing GCS configuration');
    }
    
    await findGCSPathsFromLogs();
    
  } catch (error) {
    console.error('❌ Fix setup failed:', error.message);
    process.exit(1);
  }
}

main();