
#!/usr/bin/env node

/**
 * Debug and Fix Missing GCS Files
 * Identifies documents with missing cloud storage files and attempts to fix them
 */

import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Debugging Missing GCS Files');
console.log('===============================');

const sql = neon(process.env.DATABASE_URL);
const storage = new Storage({
  credentials: JSON.parse(process.env.NEW_GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GCS_PROJECT_ID
});

const bucketName = process.env.GCS_BUCKET_NAME || 'myhometech-storage';
const bucket = storage.bucket(bucketName);

async function debugMissingFiles() {
  try {
    console.log('🔍 Checking document 159 specifically...');
    
    // Get the specific document that's failing
    const doc159 = await sql(`
      SELECT id, user_id, name, file_name, file_path, gcs_path, upload_source
      FROM documents 
      WHERE id = 159
    `);

    if (doc159.length === 0) {
      console.log('❌ Document 159 not found in database');
      return;
    }

    const doc = doc159[0];
    console.log(`📄 Document 159: ${doc.name}`);
    console.log(`👤 User ID: ${doc.user_id}`);
    console.log(`📂 File name: ${doc.file_name}`);
    console.log(`🗂️ File path: ${doc.file_path}`);
    console.log(`☁️ GCS path: ${doc.gcs_path || 'NULL'}`);
    console.log(`📧 Upload source: ${doc.upload_source || 'NULL'}`);

    // List all files in the bucket for this user
    console.log('\n📂 Searching for files in GCS bucket...');
    
    // Try different path patterns
    const searchPatterns = [
      `${doc.user_id}/`,
      `documents/${doc.user_id}/`,
      `users/${doc.user_id}/`,
      '' // Search entire bucket
    ];

    let foundFiles = [];
    
    for (const pattern of searchPatterns) {
      console.log(`\n🔍 Searching with pattern: "${pattern}"`);
      
      try {
        const [files] = await bucket.getFiles({
          prefix: pattern
        });

        const relevantFiles = files.filter(file => {
          const fileName = file.name.toLowerCase();
          const docFileName = doc.file_name.toLowerCase();
          
          return fileName.includes('scanned-document') ||
                 fileName.includes('08082025') ||
                 fileName.includes(docFileName.substring(0, 10)) ||
                 fileName.includes(doc.user_id);
        });

        if (relevantFiles.length > 0) {
          console.log(`   ✅ Found ${relevantFiles.length} relevant files:`);
          relevantFiles.forEach(file => {
            console.log(`     - ${file.name}`);
            foundFiles.push(file);
          });
        } else {
          console.log(`   ❌ No relevant files found with this pattern`);
        }
      } catch (searchError) {
        console.log(`   ⚠️ Error searching with pattern "${pattern}":`, searchError.message);
      }
    }

    // If we found potential matches, try to fix the record
    if (foundFiles.length > 0) {
      console.log(`\n🔧 Attempting to fix document record...`);
      
      // Use the most recently created file
      const selectedFile = foundFiles.sort((a, b) => 
        new Date(b.metadata.timeCreated) - new Date(a.metadata.timeCreated)
      )[0];
      
      console.log(`✅ Selected file: ${selectedFile.name}`);
      
      // Update the database record
      await sql(`
        UPDATE documents 
        SET gcs_path = $1, file_path = $1
        WHERE id = $2
      `, [selectedFile.name, 159]);
      
      console.log('💾 Updated document 159 with correct GCS path');
      
      // Verify the file is accessible
      try {
        const [exists] = await selectedFile.exists();
        if (exists) {
          console.log('✅ File verified to exist in GCS');
        } else {
          console.log('❌ File still not accessible (this shouldn\'t happen)');
        }
      } catch (verifyError) {
        console.log('⚠️ Error verifying file:', verifyError.message);
      }
      
    } else {
      console.log('\n❌ No matching files found in GCS bucket');
      console.log('This suggests the file was never uploaded or was deleted');
      
      // Show some sample files to help debug
      console.log('\n📋 Sample files in bucket (first 10):');
      try {
        const [allFiles] = await bucket.getFiles({ maxResults: 10 });
        allFiles.forEach(file => {
          console.log(`  - ${file.name}`);
        });
      } catch (listError) {
        console.log('⚠️ Error listing bucket files:', listError.message);
      }
    }

    // Check for other documents with similar issues
    console.log('\n\n🔍 Checking for other documents with missing GCS files...');
    
    const problematicDocs = await sql(`
      SELECT id, name, file_name, gcs_path, upload_source
      FROM documents 
      WHERE (gcs_path IS NOT NULL AND gcs_path != '')
      AND user_id = $1
      ORDER BY id DESC
      LIMIT 20
    `, [doc.user_id]);

    console.log(`Found ${problematicDocs.length} recent documents for this user`);
    
    for (const doc of problematicDocs.slice(0, 5)) {
      if (doc.gcs_path) {
        try {
          const file = bucket.file(doc.gcs_path);
          const [exists] = await file.exists();
          
          if (!exists) {
            console.log(`❌ Document ${doc.id} (${doc.name}) - file missing: ${doc.gcs_path}`);
          } else {
            console.log(`✅ Document ${doc.id} (${doc.name}) - file exists`);
          }
        } catch (checkError) {
          console.log(`⚠️ Document ${doc.id} (${doc.name}) - error checking: ${checkError.message}`);
        }
      }
    }

  } catch (error) {
    console.error('💥 Debug script failed:', error);
  }
}

// Run the debug script
debugMissingFiles().then(() => {
  console.log('\n✅ Debug script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
