
// Production start script with proper error handling
import path from 'path';
import { fileURLToPath } from 'url';

console.log('🚀 Starting production server...');
console.log('📊 Environment:', process.env.NODE_ENV);
console.log('⚡ Port:', process.env.PORT || 5000);

// Set production environment
process.env.NODE_ENV = 'production';

// Check if we have GC enabled
if (typeof global.gc === 'function') {
  console.log('✅ Garbage collection available');
} else {
  console.log('⚠️ Garbage collection not available - starting with --expose-gc recommended');
}

// Start the server with proper error handling
try {
  console.log('📁 Loading server from dist/index.js...');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  await import(path.join(__dirname, 'dist', 'index.js'));
  console.log('✅ Production server started successfully');
} catch (error) {
  console.error('❌ Failed to start production server:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}
