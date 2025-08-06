#!/bin/bash

# Enable garbage collection for Node.js
export NODE_OPTIONS="--expose-gc ${NODE_OPTIONS}"

echo "🚀 Starting server with NODE_OPTIONS: $NODE_OPTIONS"
echo "📊 Environment: ${NODE_ENV:-development}"

# Check if the server file exists
if [ ! -f "server/index.ts" ]; then
    echo "❌ Server file not found: server/index.ts"
    exit 1
fi

# Start the server with tsx and the exposed gc flag
echo "🎯 Starting: NODE_ENV=${NODE_ENV:-development} tsx server/index.ts"
NODE_ENV=${NODE_ENV:-development} tsx server/index.ts