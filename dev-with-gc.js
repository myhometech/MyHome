#!/usr/bin/env node

// Development server startup with garbage collection enabled
// This ensures --expose-gc is available for memory management

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting development server with garbage collection enabled...');

// Kill any existing processes first
process.stdout.write('🧹 Cleaning up existing processes...');
try {
  await new Promise((resolve) => {
    const cleanup = spawn('pkill', ['-f', 'tsx server/index.ts'], { stdio: 'ignore' });
    cleanup.on('close', () => {
      setTimeout(resolve, 1000); // Wait 1 second for cleanup
    });
  });
  console.log(' Done');
} catch (error) {
  console.log(' (No processes to clean)');
}

const serverPath = join(__dirname, 'server', 'index.ts');

// Start tsx with --expose-gc
const args = [
  '--expose-gc',
  '--loader', 'tsx/esm',
  serverPath
];

console.log(`🎯 Starting: node ${args.join(' ')}`);

const child = spawn('node', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development'
  }
});

child.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.log(`🔚 Server exited with code ${code}`);
  }
  process.exit(code || 0);
});

// Handle graceful shutdown
const shutdown = (signal) => {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);
  child.kill(signal);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));