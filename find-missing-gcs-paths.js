#!/usr/bin/env node

/**
 * Find Missing GCS Paths
 * Maps documents in database to their actual GCS file locations
 */

import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Finding Missing GCS Paths');
console.log('='.repeat(50));

const sql = neon(process.env.DATABASE_URL);
const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GCS_PROJECT_ID
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

async function findMissingPaths() {
  try {
    // Get documents without GCS paths
    const documentsResult = await sql(`
      SELECT id, user_id, name, file_name, gcs_path 
      FROM documents 
      WHERE gcs_path IS NULL 
      ORDER BY id DESC 
      LIMIT 10
    `);
    
    console.log(`Found ${documentsResult.length} documents without GCS paths`);
    
    // List all files in the bucket
    console.log('\n📂 Listing files in GCS bucket...');
    const [files] = await bucket.getFiles();
    console.log(`Found ${files.length} files in bucket`);
    
    let fixed = 0;
    
    for (const doc of documentsResult) {
      console.log(`\n🔍 Processing: ${doc.name} (ID: ${doc.id}, User: ${doc.user_id})`);
      console.log(`  📄 Looking for file: ${doc.file_name}`);
      
      // Find matching files
      const matchingFiles = files.filter(file => {
        const fileName = file.name.split('/').pop();
        const userPath = file.name.includes(`users/${doc.user_id}/`) || file.name.includes(`${doc.user_id}/`);
        return fileName === doc.file_name && userPath;
      });
      
      console.log(`  📁 Found ${matchingFiles.length} matching files:`);
      
      if (matchingFiles.length > 0) {
        // Sort by name to get the most recent (assuming temp paths have timestamps)
        matchingFiles.sort((a, b) => b.name.localeCompare(a.name));
        
        const selectedFile = matchingFiles[0];
        console.log(`  ✅ Selected: ${selectedFile.name}`);
        
        // Update database
        await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [selectedFile.name, doc.id]);
        console.log(`  💾 Updated database`);
        
        fixed++;
      } else {
        console.log(`  ❌ No matching files found`);
        
        // Show all files for this user to help debug
        const userFiles = files.filter(file => 
          file.name.includes(`users/${doc.user_id}/`) || file.name.includes(`${doc.user_id}/`)
        );
        
        if (userFiles.length > 0) {
          console.log(`  📋 User's files in bucket:`);
          userFiles.slice(0, 5).forEach(file => {
            console.log(`    - ${file.name}`);
          });
          if (userFiles.length > 5) {
            console.log(`    ... and ${userFiles.length - 5} more`);
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`📊 Successfully mapped ${fixed} documents to GCS paths`);
    
    // Verify the fixes
    console.log('\n🔍 Verifying updated documents...');
    const updatedDocs = await sql(`
      SELECT id, name, gcs_path 
      FROM documents 
      WHERE gcs_path IS NOT NULL 
      ORDER BY id DESC 
      LIMIT 10
    `);
    
    console.log('✅ Documents with GCS paths:');
    updatedDocs.forEach(doc => {
      console.log(`  ${doc.id}: ${doc.name} → ${doc.gcs_path}`);
    });
    
  } catch (error) {
    console.error('💥 Script failed:', error);
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
    
    await findMissingPaths();
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();