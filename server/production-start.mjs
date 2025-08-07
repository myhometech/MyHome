// Minimal production server with aggressive memory management
import { spawn, execSync } from 'child_process';

console.log('🚀 Starting production server with memory optimization...');

// Kill any existing processes
try {
  execSync('pkill -f "dist/index.js"', { stdio: 'ignore' });
} catch (e) {
  // Ignore if no processes found
}

// Start with extreme memory constraints
const server = spawn('node', [
  '--expose-gc',
  '--max-old-space-size=256',
  '--max-semi-space-size=16',
  '--optimize-for-size',
  '--gc_interval=10',
  'dist/index.js'
], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    STORAGE_TYPE: 'local', // Force local storage
    GCS_DISABLED: 'true'   // Additional flag to disable GCS
  },
  stdio: 'inherit'
});

server.on('error', (error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  if (code !== 0) {
    process.exit(code);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.kill('SIGINT');
});