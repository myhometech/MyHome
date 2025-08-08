#!/bin/bash
# Production deployment seed script
# This script is designed to be run after successful deployment

set -e

echo "🚀 Post-deployment admin seeding starting..."
echo "📅 Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Check if we're running in a container
if [ -f "/.dockerenv" ]; then
    echo "🐳 Running inside Docker container"
    SEED_COMMAND="node /app/dist/scripts/seedAdmin.js"
else
    echo "🖥️  Running on host system"
    
    # Check if built seed script exists
    if [ -f "dist/scripts/seedAdmin.js" ]; then
        SEED_COMMAND="NODE_ENV=production node dist/scripts/seedAdmin.js"
    else
        echo "❌ Built seed script not found. Please run 'npm run build' first."
        exit 1
    fi
fi

# Wait for database to be ready (max 30 seconds)
echo "⏳ Waiting for database connection..."
RETRY_COUNT=0
MAX_RETRIES=6

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if timeout 5 $SEED_COMMAND --verify-only 2>/dev/null; then
        echo "✅ Database connection verified"
        break
    else
        echo "🔄 Database not ready yet, retrying in 5 seconds..."
        sleep 5
        RETRY_COUNT=$((RETRY_COUNT + 1))
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Database connection failed after $MAX_RETRIES attempts"
    exit 1
fi

# Run the actual seeding
echo "🌱 Running admin baseline data seeding..."
$SEED_COMMAND

if [ $? -eq 0 ]; then
    echo "✅ Post-deployment admin seeding completed successfully"
    
    # Optional: Send success notification
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data '{"text":"🌱 Admin seeding completed for '"$(hostname)"' at '"$(date)"'"}' \
            "$SLACK_WEBHOOK_URL" 2>/dev/null || echo "⚠️  Slack notification failed"
    fi
    
    exit 0
else
    echo "❌ Post-deployment admin seeding failed"
    
    # Optional: Send failure notification
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data '{"text":"❌ Admin seeding FAILED for '"$(hostname)"' at '"$(date)"'"}' \
            "$SLACK_WEBHOOK_URL" 2>/dev/null || echo "⚠️  Slack notification failed"
    fi
    
    exit 1
fi