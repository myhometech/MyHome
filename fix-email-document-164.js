
#!/usr/bin/env node

/**
 * Fix Missing Email Document 164
 * Searches for and fixes email-imported documents with missing GCS paths
 */

import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Fixing Email Document 164 and Similar Issues');
console.log('===============================================');

const sql = neon(process.env.DATABASE_URL);
const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.NEW_GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GCS_PROJECT_ID
});

const bucketName = process.env.GCS_BUCKET_NAME || 'myhometech-storage';
const bucket = storage.bucket(bucketName);

async function fixEmailDocument164() {
  try {
    // First, check the specific document 164
    console.log('🔍 Checking document 164...');
    const doc164 = await sql(`
      SELECT id, user_id, name, file_name, gcs_path, upload_source, tags
      FROM documents 
      WHERE id = 164
    `);

    if (doc164.length === 0) {
      console.log('❌ Document 164 not found in database');
      return;
    }

    const doc = doc164[0];
    console.log(`📄 Document 164: ${doc.name}`);
    console.log(`👤 User ID: ${doc.user_id}`);
    console.log(`📂 File name: ${doc.file_name}`);
    console.log(`🗂️ Current GCS path: ${doc.gcs_path || 'NULL'}`);
    console.log(`📧 Upload source: ${doc.upload_source || 'NULL'}`);
    console.log(`🏷️ Tags: ${doc.tags || 'NULL'}`);

    // List all files in the bucket for this user
    console.log('\n📂 Searching for matching files in GCS...');
    const [files] = await bucket.getFiles({
      prefix: `users/${doc.user_id}/`
    });

    console.log(`Found ${files.length} files for user ${doc.user_id}`);

    // Look for files that could match this document
    const potentialMatches = files.filter(file => {
      const fileName = file.name.split('/').pop();
      const lowerFileName = fileName?.toLowerCase() || '';
      const lowerDocName = (doc.file_name || '').toLowerCase();
      
      // Check for exact match
      if (fileName === doc.file_name) return true;
      
      // Check for partial matches with Peloton
      if (lowerFileName.includes('peloton') && lowerDocName.includes('peloton')) return true;
      
      // Check for July matches
      if (lowerFileName.includes('july') && lowerDocName.includes('july')) return true;
      
      // Check for PDF matches with similar names
      if (fileName?.endsWith('.pdf') && lowerDocName.endsWith('.pdf')) {
        const docBaseName = lowerDocName.replace('.pdf', '').replace(/[^a-z0-9]/g, '');
        const fileBaseName = lowerFileName.replace('.pdf', '').replace(/[^a-z0-9]/g, '');
        if (docBaseName.length > 3 && fileBaseName.includes(docBaseName.substring(0, 6))) {
          return true;
        }
      }
      
      return false;
    });

    console.log(`\n📋 Found ${potentialMatches.length} potential matches:`);
    potentialMatches.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name}`);
    });

    if (potentialMatches.length > 0) {
      // Use the most recent file (assuming it's the correct one)
      const selectedFile = potentialMatches.sort((a, b) => b.name.localeCompare(a.name))[0];
      console.log(`\n✅ Selected file: ${selectedFile.name}`);
      
      // Update the database
      await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [selectedFile.name, 164]);
      console.log('💾 Updated document 164 with correct GCS path');
    } else {
      console.log('\n❌ No matching files found for document 164');
      
      // Show all files to help debug
      console.log('\n📋 All files for this user:');
      files.slice(0, 10).forEach(file => {
        console.log(`  - ${file.name}`);
      });
      if (files.length > 10) {
        console.log(`  ... and ${files.length - 10} more files`);
      }
    }

    // Now check for other email-imported documents with similar issues
    console.log('\n\n🔍 Checking other email-imported documents...');
    const emailDocs = await sql(`
      SELECT id, user_id, name, file_name, gcs_path
      FROM documents 
      WHERE (upload_source = 'email' OR tags LIKE '%email%' OR gcs_path IS NULL)
      AND id != 164
      ORDER BY id DESC
      LIMIT 10
    `);

    console.log(`Found ${emailDocs.length} other potential email documents`);
    
    let fixed = 0;
    for (const emailDoc of emailDocs) {
      if (emailDoc.gcs_path) continue; // Skip if already has GCS path
      
      console.log(`\n📄 Checking document ${emailDoc.id}: ${emailDoc.name}`);
      
      // Get files for this user
      const [userFiles] = await bucket.getFiles({
        prefix: `users/${emailDoc.user_id}/`
      });
      
      const matches = userFiles.filter(file => {
        const fileName = file.name.split('/').pop();
        return fileName === emailDoc.file_name;
      });
      
      if (matches.length > 0) {
        const selectedFile = matches[0];
        await sql(`UPDATE documents SET gcs_path = $1 WHERE id = $2`, [selectedFile.name, emailDoc.id]);
        console.log(`  ✅ Fixed document ${emailDoc.id} with path: ${selectedFile.name}`);
        fixed++;
      } else {
        console.log(`  ❌ No match found for document ${emailDoc.id}`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Fix Summary:');
    console.log(`  🎯 Document 164: ${potentialMatches.length > 0 ? 'FIXED' : 'NOT FOUND'}`);
    console.log(`  📧 Other email docs fixed: ${fixed}`);
    console.log('\n✅ Email document fix process complete!');

  } catch (error) {
    console.error('💥 Fix script failed:', error);
  }
}

// Run the fix
fixEmailDocument164();
