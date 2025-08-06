#!/usr/bin/env node

// Startup script to enable garbage collection
// This script ensures --expose-gc is available for memory management

console.log('🚀 Starting MyHome with garbage collection enabled...');
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

// Check if --expose-gc is already enabled
if (global.gc) {
  console.log('✅ Garbage collection already exposed');
} else {
  console.log('⚠️  Garbage collection not exposed');
  console.log('ℹ️  Attempting to enable via environment variable...');
  
  // Try setting NODE_OPTIONS to enable GC
  if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('--expose-gc')) {
    process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --expose-gc';
    console.log(`🔧 Set NODE_OPTIONS: ${process.env.NODE_OPTIONS}`);
  }
}

// Import and start the server
console.log('🎯 Loading server...');
import('./server/index.ts').catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});