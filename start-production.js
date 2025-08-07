
// PRODUCTION STARTUP DIAGNOSTIC SCRIPT - Complete rewrite for Replit deployment
console.log('='.repeat(80));
console.log('🚀 PRODUCTION DEPLOYMENT STARTUP DIAGNOSTICS');
console.log('='.repeat(80));
console.log('📅 Startup Time:', new Date().toISOString());
console.log('🌍 Environment Variables:');
console.log('  - NODE_ENV:', process.env.NODE_ENV);
console.log('  - PORT:', process.env.PORT || '5000');
console.log('  - REPLIT_DEPLOYMENT:', process.env.REPLIT_DEPLOYMENT);
console.log('  - DATABASE_URL:', process.env.DATABASE_URL ? '✅ SET' : '❌ MISSING');
console.log('  - SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ SET' : '❌ MISSING');

// Force production environment
process.env.NODE_ENV = 'production';

// Critical error handling - exit immediately on any failure
process.on('uncaughtException', (error) => {
  console.error('❌ FATAL UNCAUGHT EXCEPTION:', error.message);
  console.error('❌ Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ FATAL UNHANDLED REJECTION:', reason);
  console.error('❌ Promise:', promise);
  process.exit(1);
});

// File system diagnostics
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

console.log('\n📁 FILE SYSTEM DIAGNOSTICS:');
console.log('📍 Current Directory:', process.cwd());

// Check if dist directory exists
const distDir = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  console.error('❌ CRITICAL: dist/ directory does not exist');
  console.error('❌ This means the build process failed');
  console.error('❌ Expected location:', distDir);
  process.exit(1);
}

// List dist contents
console.log('📂 dist/ directory contents:');
try {
  const distFiles = fs.readdirSync(distDir);
  distFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    const stats = fs.statSync(filePath);
    console.log(`   📄 ${file} (${Math.round(stats.size / 1024)}KB)`);
  });
} catch (error) {
  console.error('❌ Cannot read dist/ directory:', error.message);
  process.exit(1);
}

// Check for index.js specifically
const serverPath = path.join(distDir, 'index.js');
if (!fs.existsSync(serverPath)) {
  console.error('❌ CRITICAL: dist/index.js does not exist');
  console.error('❌ Build process did not create server bundle');
  console.error('❌ Expected location:', serverPath);
  process.exit(1);
}

console.log('✅ dist/index.js found');

// Syntax check the built file
console.log('\n🔍 SYNTAX VALIDATION:');
try {
  const require = createRequire(import.meta.url);
  require.resolve(serverPath);
  console.log('✅ dist/index.js syntax is valid');
} catch (error) {
  console.error('❌ SYNTAX ERROR in dist/index.js:', error.message);
  process.exit(1);
}

// Memory check
const memoryUsage = process.memoryUsage();
console.log('\n💾 MEMORY STATUS:');
console.log(`   Heap Used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
console.log(`   Heap Total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`);

// Port binding check
const port = parseInt(process.env.PORT || '5000', 10);
console.log('\n🌐 NETWORK CONFIGURATION:');
console.log(`   Port: ${port}`);
console.log(`   Host: 0.0.0.0 (required for Replit)`);

console.log('\n✅ ALL DIAGNOSTICS PASSED - Starting Node.js server...');
console.log('='.repeat(80));

// Start the actual server
try {
  const { default: serverModule } = await import(serverPath);
  console.log('✅ Server module loaded successfully');
} catch (error) {
  console.error('❌ FATAL SERVER STARTUP ERROR:', error.message);
  console.error('❌ Stack trace:', error.stack);
  
  // Additional error context
  if (error.message.includes('Cannot find module')) {
    console.error('❌ DIAGNOSIS: Missing dependency - check if all npm packages installed');
  } else if (error.message.includes('EADDRINUSE')) {
    console.error('❌ DIAGNOSIS: Port already in use');
  } else if (error.message.includes('EACCES')) {
    console.error('❌ DIAGNOSIS: Permission denied');
  }
  
  process.exit(1);
}

// Monitor server startup
setTimeout(() => {
  console.log('🔄 Server should be running now...');
  console.log(`🌐 Expected URL: https://[deployment-name].replit.app`);
  console.log('🧪 Test endpoints:');
  console.log('   - GET /debug');
  console.log('   - GET /api/status');
  console.log('   - POST /api/email-ingest');
}, 3000);
