
#!/usr/bin/env node

// Simple health check script
const http = require('http');

const port = process.env.PORT || 5000;
const host = '0.0.0.0';

console.log('🔍 Health check starting...');
console.log('🔍 Checking server at:', `http://${host}:${port}`);

const options = {
  hostname: host,
  port: port,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  console.log('✅ Server responded with status:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('✅ Response:', data);
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('❌ Health check failed:', err.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ Health check timed out');
  req.destroy();
  process.exit(1);
});

req.setTimeout(5000);
req.end();
