#!/usr/bin/env node

/**
 * Debug GCS Path Mismatch
 * Investigates the difference between database paths and actual GCS files
 */

import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Debugging GCS Path Mismatch');
console.log('='.repeat(50));

const sql = neon(process.env.DATABASE_URL);
const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GCS_PROJECT_ID
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

async function debugMismatch() {
  try {
    // List all files in the bucket with details
    console.log('📂 All files in GCS bucket:');
    const [files] = await bucket.getFiles();
    
    files.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name}`);
    });
    
    console.log(`\nTotal files: ${files.length}`);
    
    // Get documents for current user
    const currentUserId = '94a7b7f0-3266-4a4f-9d4e-875542d30e62';
    console.log(`\n🔍 Documents for user: ${currentUserId}`);
    
    const userDocs = await sql(`
      SELECT id, name, file_name, gcs_path 
      FROM documents 
      WHERE user_id = $1 
      ORDER BY id DESC
    `, [currentUserId]);
    
    console.log(`Found ${userDocs.length} documents for current user:`);
    
    for (const doc of userDocs) {
      console.log(`\n📄 Document ${doc.id}: ${doc.name}`);
      console.log(`   File name: ${doc.file_name}`);
      console.log(`   GCS path: ${doc.gcs_path || 'NULL'}`);
      
      if (doc.gcs_path) {
        // Check if file exists
        const file = bucket.file(doc.gcs_path);
        const [exists] = await file.exists();
        console.log(`   Exists: ${exists ? '✅' : '❌'}`);
      }
      
      // Look for any files that match this document's filename
      const matchingFiles = files.filter(file => {
        const fileName = file.name.split('/').pop();
        const userPath = file.name.includes(currentUserId);
        return fileName === doc.file_name && userPath;
      });
      
      if (matchingFiles.length > 0) {
        console.log(`   📁 Matching files found:`);
        matchingFiles.forEach(file => {
          console.log(`     - ${file.name}`);
        });
        
        // If no GCS path set, update it
        if (!doc.gcs_path && matchingFiles.length === 1) {
          const correctPath = matchingFiles[0].name;
          await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [correctPath, doc.id]);
          console.log(`   🔧 Updated GCS path to: ${correctPath}`);
        }
      } else {
        console.log(`   ❌ No matching files found`);
      }
    }
    
    // Special check for document ID 56 (the one with the error)
    console.log('\n🔍 Special check for document 56:');
    const doc56 = await sql(`SELECT * FROM documents WHERE id = 56`);
    if (doc56.length > 0) {
      const doc = doc56[0];
      console.log(`Document 56: ${doc.name}`);
      console.log(`File name: ${doc.file_name}`);
      console.log(`Current GCS path: ${doc.gcs_path || 'NULL'}`);
      
      // Look for any files that could be this document
      const possibleFiles = files.filter(file => {
        const fileName = file.name.split('/').pop();
        const userPath = file.name.includes(doc.user_id);
        
        // Check for exact match or similar names
        return userPath && (
          fileName === doc.file_name ||
          fileName === 'MyVodafoneBill_July-2025-2.pdf' ||
          fileName.includes('Vodafone') ||
          fileName.includes('Bill')
        );
      });
      
      console.log(`Possible files for document 56:`);
      possibleFiles.forEach(file => {
        console.log(`  - ${file.name}`);
      });
      
      if (possibleFiles.length > 0 && !doc.gcs_path) {
        const selectedFile = possibleFiles[0];
        await sql(`UPDATE documents SET gcs_path = $1 WHERE id = 56`, [selectedFile.name]);
        console.log(`🔧 Updated document 56 GCS path to: ${selectedFile.name}`);
      }
    }
    
  } catch (error) {
    console.error('💥 Debug script failed:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    await debugMismatch();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 Debug and fix completed!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();