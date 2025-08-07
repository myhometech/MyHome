
#!/usr/bin/env node

// Production start script with enhanced diagnostics
console.log('🚀 PRODUCTION START: Initializing server...');
console.log('📊 Environment Variables:');
console.log('  - NODE_ENV:', process.env.NODE_ENV);
console.log('  - PORT:', process.env.PORT || '5000');
console.log('  - REPLIT_DEPLOYMENT:', process.env.REPLIT_DEPLOYMENT);

// Set production environment
process.env.NODE_ENV = 'production';

// Enhanced error handling for startup
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION during startup:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION during startup:', reason);
  process.exit(1);
});

// Check if we have GC enabled
if (typeof global.gc === 'function') {
  console.log('✅ Garbage collection available');
} else {
  console.log('⚠️ Garbage collection not available - starting anyway');
}

// Verify dist/index.js exists
const fs = require('fs');
const path = require('path');
const distPath = path.join(__dirname, 'dist', 'index.js');

if (!fs.existsSync(distPath)) {
  console.error('❌ CRITICAL: dist/index.js not found at:', distPath);
  console.error('❌ Available files in dist/:');
  try {
    const distFiles = fs.readdirSync(path.join(__dirname, 'dist'));
    console.error('   ', distFiles.join(', '));
  } catch (e) {
    console.error('   dist/ directory does not exist');
  }
  process.exit(1);
}

console.log('✅ dist/index.js found, starting server...');

// Start the server with proper error handling
try {
  console.log('📁 Loading server from dist/index.js...');
  require('./dist/index.js');
  console.log('✅ Production server startup initiated');
} catch (error) {
  console.error('❌ FATAL: Failed to start production server:', error);
  console.error('❌ Error stack:', error.stack);
  process.exit(1);
}

// Keep process alive and log status
setTimeout(() => {
  console.log('🔄 Production server should be running now');
  console.log('🌐 Expected to be accessible on port:', process.env.PORT || '5000');
}, 2000);
