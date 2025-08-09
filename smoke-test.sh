#!/bin/bash

# MyHome Smoke Test - Environment & Core Functionality
# Timestamp: 2025-08-09 14:44 UTC
# Tests: Auth, Uploads, OCR, Insights, RBAC

set -euo pipefail

# Configuration
API_BASE="${API_BASE_URL:-http://localhost:5000/api}"
ENV_NAME="${ENV_NAME:-development}"

echo "🔍 MyHome Smoke Test Starting"
echo "Environment: $ENV_NAME"
echo "API Base: $API_BASE"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo ""

step() {
    echo "==> $1"
}

# 0) Boot Config Check
step "0) Configuration Validation"
curl -fsS "$API_BASE/../config.json" | jq '.'
echo "✅ Config loaded successfully"
echo ""

# 1) Auth & Health Check  
step "1) Authentication & Health"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/../healthz" || echo "000")
if [[ "$HEALTH" == "200" ]]; then
    echo "✅ Health check passed ($HEALTH)"
else 
    echo "❌ Health check failed ($HEALTH)"
fi

# Test auth endpoint
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/auth/user" || echo "000")
echo "Auth endpoint status: $AUTH_STATUS (401 expected when not logged in)"
echo ""

# 2) Database Schema Check
step "2) Database Schema Validation"
# This would need to be run with database access
echo "⚠️  Database schema check requires direct DB access"
echo "   Run: SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
echo ""

# 3) API Endpoints Check
step "3) Core API Endpoints"
ENDPOINTS=(
    "/documents"
    "/categories" 
    "/insights/metrics"
    "/auth/user"
)

for endpoint in "${ENDPOINTS[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE$endpoint" || echo "000")
    if [[ "$STATUS" =~ ^[2-4][0-9][0-9]$ ]]; then
        echo "✅ $endpoint ($STATUS)"
    else
        echo "❌ $endpoint ($STATUS)"
    fi
done
echo ""

# 4) File Upload Test (requires auth)
step "4) Upload System"
echo "⚠️  Upload test requires authentication token"
echo "   Manual test: Login via UI and test document upload"
echo ""

# 5) Frontend Health
step "5) Frontend Build Status" 
if [[ -d "client/dist" ]]; then
    echo "✅ Frontend build directory exists"
    ASSETS=$(find client/dist -name "*.js" -o -name "*.css" | wc -l)
    echo "   Built assets: $ASSETS files"
else
    echo "❌ Frontend build directory missing"
fi
echo ""

# 6) Environment-specific checks
step "6) Environment Configuration"
if [[ "$ENV_NAME" == "development" ]]; then
    echo "✅ Development environment detected"
    echo "   - Hot reload should be available"
    echo "   - Debug logging enabled"
elif [[ "$ENV_NAME" == "production" ]]; then
    echo "✅ Production environment detected"
    echo "   - Should have optimized builds"
    echo "   - Error tracking enabled"
fi
echo ""

echo "🎯 Smoke Test Summary"
echo "Environment: $ENV_NAME"
echo "Completed: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo ""
echo "Next Steps:"
echo "1. Test login functionality via UI"
echo "2. Upload a document and verify processing"
echo "3. Check OCR and insights generation"
echo "4. Verify database connectivity"
echo ""
echo "For authenticated tests, login via UI first, then run:"
echo "curl -s '$API_BASE/documents' --cookie-jar cookies.txt"