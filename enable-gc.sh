#!/bin/bash

# Script to enable garbage collection for MyHome application
# This addresses the critical memory leak issue where manual GC calls fail

echo "🔧 Enabling manual garbage collection for Node.js..."

# Set NODE_OPTIONS to include --expose-gc
export NODE_OPTIONS="--expose-gc ${NODE_OPTIONS:-}"

# Verify GC is available
echo "📊 Testing GC availability..."
GC_STATUS=$(node -e "console.log(global.gc ? 'AVAILABLE' : 'NOT_AVAILABLE')")

if [ "$GC_STATUS" = "AVAILABLE" ]; then
    echo "✅ Garbage collection successfully enabled!"
    echo "🚀 Restarting server with GC enabled..."
    
    # Kill current npm process and restart with GC
    pkill -f "tsx server/index.ts" 2>/dev/null || true
    sleep 2
    
    # Start with tsx and GC enabled
    NODE_ENV=development tsx server/index.ts
else
    echo "❌ Failed to enable garbage collection"
    echo "🔍 Current NODE_OPTIONS: $NODE_OPTIONS"
    exit 1
fi