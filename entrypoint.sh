#!/usr/bin/env bash
set -euo pipefail

echo "🐳 Starting MyHome container..."
echo "🔧 NODE_ENV: ${NODE_ENV:-development}"
echo "🔧 API_BASE_URL: ${API_BASE_URL:-/api}"
echo "🔧 ENV: ${ENV:-production}"

# Generate runtime config.json from environment variables
echo "📝 Generating runtime configuration..."
cat > ./public/config.json <<EOF
{
  "API_BASE_URL": "${API_BASE_URL:-/api}",
  "SENTRY_DSN": "${SENTRY_DSN:-}",
  "ENV": "${ENV:-production}",
  "VERSION": "${GIT_SHA:-${VERSION:-1.0.0}}"
}
EOF

echo "✅ Runtime configuration created:"
cat ./public/config.json

# Ensure uploads directory exists with proper permissions
mkdir -p uploads
chmod 755 uploads

# Create server/public directory if it doesn't exist and copy config
mkdir -p server/public
cp ./public/config.json ./server/public/config.json

echo "🚀 Starting server with PM2..."

# Start server with PM2 using ecosystem file
if [ -f "pm2.config.cjs" ]; then
  echo "📋 Using PM2 ecosystem configuration"
  exec pm2-runtime start pm2.config.cjs
else
  echo "🔧 Using direct PM2 runtime"
  exec pm2-runtime --name myhome-server dist/index.js
fi