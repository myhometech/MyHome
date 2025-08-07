
#!/usr/bin/env node

// Production start script with memory management
console.log('🚀 Starting production server with memory management...');
console.log('📊 Environment:', process.env.NODE_ENV);
console.log('⚡ Port:', process.env.PORT || 5000);

// Check if we have GC enabled
if (typeof global.gc === 'function') {
  console.log('✅ Garbage collection available');
} else {
  console.log('⚠️ Garbage collection not available - run with --expose-gc');
}

// Import and start the server
try {
  require('./dist/index.js');
} catch (error) {
  console.error('❌ Failed to start production server:', error);
  process.exit(1);
}
