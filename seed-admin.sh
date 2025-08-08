#!/bin/bash
# Admin baseline data seeding script
# Usage: ./seed-admin.sh [development|production]

set -e

# Default environment
ENV=${1:-development}

echo "🌱 Running admin seed script in $ENV environment..."

if [ "$ENV" = "production" ]; then
    echo "🏭 Production mode: Using built seed script"
    
    # Ensure the script is built
    if [ ! -f "dist/scripts/seedAdmin.js" ]; then
        echo "🔨 Building seed script..."
        npm run build
    fi
    
    NODE_ENV=production node dist/scripts/seedAdmin.js
else
    echo "🛠️ Development mode: Using TypeScript directly"
    NODE_ENV=development npx tsx server/scripts/seedAdmin.ts
fi

echo "✅ Admin seed script completed"