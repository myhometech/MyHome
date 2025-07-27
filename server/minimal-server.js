#!/usr/bin/env node

// Ultra-minimal server to test white screen issue
const express = require('express');
const path = require('path');

console.log('🔥 Starting minimal production server...');

const app = express();

// Basic middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../dist/public')));

// Basic health check
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    status: 'ok',
    memory: {
      heapUsed: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100) + '%',
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal
    }
  });
});

// Basic auth endpoint to satisfy frontend
app.get('/api/auth/user', (req, res) => {
  res.status(401).json({ message: 'Authentication required' });
});

// Basic blog posts endpoint
app.get('/api/blog/posts', (req, res) => {
  res.json([
    {
      id: 1,
      title: "Test Blog Post",
      excerpt: "This is a test post",
      slug: "test-post",
      readTimeMinutes: 5,
      tags: ["test"]
    }
  ]);
});

// Catch-all for React routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/public/index.html'));
});

const port = process.env.PORT || 5000;
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Minimal server running on port ${port}`);
  console.log(`Memory usage: ${JSON.stringify(process.memoryUsage())}`);
});

// Force GC every 5 seconds
if (global.gc) {
  setInterval(() => {
    global.gc();
    console.log('GC forced, memory:', process.memoryUsage());
  }, 5000);
}