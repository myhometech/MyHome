
#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting production deployment...');

// Check if dist/index.js exists
const distPath = path.join(__dirname, 'dist', 'index.js');
if (!fs.existsSync(distPath)) {
  console.error('❌ dist/index.js not found. Build may have failed.');
  process.exit(1);
}

console.log('✅ dist/index.js found, starting server...');

// Start the Node.js server
const server = spawn('node', ['dist/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', PORT: '5000' }
});

server.on('error', (error) => {
  console.error('❌ Server failed to start:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  server.kill('SIGINT');
});
