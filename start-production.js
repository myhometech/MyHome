#!/usr/bin/env node

// Production startup script that builds server-only bundle to avoid static file conflicts
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 PRODUCTION STARTUP: Building server-only bundle to avoid static file conflicts');

// Build ONLY the server bundle - no static files that confuse Replit
try {
  console.log('🔨 Building server bundle...');
  execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });
  console.log('✅ Server bundle built successfully');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

const distPath = join(__dirname, 'dist', 'index.js');

if (!existsSync(distPath)) {
  console.error('❌ Built server not found at:', distPath);
  process.exit(1);
}

console.log('🔍 Starting Node.js server from:', distPath);

// Start the server with production optimizations
const serverProcess = spawn('node', [
  '--expose-gc',
  '--max-old-space-size=512',
  '--optimize-for-size', 
  distPath
], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.PORT || '5000'
  },
  stdio: 'inherit'
});

serverProcess.on('error', (error) => {
  console.error('❌ Server process failed:', error);
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  console.log(`🔄 Server exited with code ${code}`);
  if (code !== 0) {
    process.exit(code);
  }
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('📡 SIGTERM received - shutting down gracefully...');
  serverProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('📡 SIGINT received - shutting down gracefully...');
  serverProcess.kill('SIGINT');
});

console.log('✅ Production server process started successfully');