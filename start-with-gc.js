#!/usr/bin/env node

// Start development server with garbage collection enabled
// This ensures proper memory management for OCR and image processing

process.env.NODE_OPTIONS = '--expose-gc ' + (process.env.NODE_OPTIONS || '');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Starting MyHome with enhanced memory management...');
console.log('🔧 NODE_OPTIONS:', process.env.NODE_OPTIONS);
console.log('🔧 NODE_ENV:', process.env.NODE_ENV);

// Verify GC is available
if (global.gc) {
  console.log('✅ Manual garbage collection is available');
  // Test GC functionality
  const beforeMem = process.memoryUsage();
  global.gc();
  const afterMem = process.memoryUsage();
  console.log(`🧹 GC test: ${Math.round(beforeMem.heapUsed/1024/1024)}MB -> ${Math.round(afterMem.heapUsed/1024/1024)}MB`);
} else {
  console.log('⚠️ Manual garbage collection not available');
}

// Import and start the server
import('./server/index.ts').catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});