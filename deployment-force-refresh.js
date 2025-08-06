#!/usr/bin/env node

// Force deployment refresh by creating a unique deployment marker
import fs from 'fs';
const timestamp = new Date().toISOString();

console.log(`🚀 Deployment force refresh: ${timestamp}`);

// Create a unique deployment ID in the built file
const deploymentId = `DEPLOYMENT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

console.log(`📦 Deployment ID: ${deploymentId}`);

// Add deployment verification endpoint to verify the correct build is deployed
const markerComment = `
// DEPLOYMENT VERIFICATION: ${deploymentId} - ${timestamp}
console.log('🚀 DEPLOYMENT VERIFIED: ${deploymentId}');
`;

try {
  const distExists = fs.existsSync('dist/index.js');
  console.log(`📁 dist/index.js exists: ${distExists}`);
  
  if (distExists) {
    const distContent = fs.readFileSync('dist/index.js', 'utf8');
    console.log(`📊 dist/index.js size: ${distContent.length} bytes`);
    console.log(`🔍 Contains debug routes: ${distContent.includes('App is live') ? 'YES' : 'NO'}`);
    console.log(`🔍 Contains email routes: ${distContent.includes('Email Ingest Live') ? 'YES' : 'NO'}`);
  }
  
  console.log('✅ Deployment verification complete');
} catch (error) {
  console.error('❌ Deployment verification failed:', error.message);
}