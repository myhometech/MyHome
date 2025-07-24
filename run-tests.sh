#!/bin/bash

# MyHome Application Testing Script
echo "🏠 MyHome Application Testing Suite"
echo "=================================="

# Check if server is running
echo "📡 Checking if server is running..."
if curl -f -s http://localhost:5000/api/auth/user >/dev/null 2>&1; then
    echo "✅ Server is running on localhost:5000"
else
    echo "❌ Server not running. Please start with 'npm run dev'"
    exit 1
fi

# Run the testing agent
echo ""
echo "🧪 Running comprehensive tests..."
node test-automation-agent.js

# Check if user wants interactive mode
echo ""
echo "Would you like to run interactive testing mode? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo ""
    echo "🤖 Starting interactive testing session..."
    node test-automation-agent.js --interactive
fi

echo ""
echo "📊 Test report generated: test-report.json"
echo "🏁 Testing complete!"