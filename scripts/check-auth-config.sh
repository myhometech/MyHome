#!/bin/bash
# AUTH-324: CI static check for OAuth configuration guardrails
# Prevents hard-coded callback URLs or redirect URIs from being committed

set -e

echo "🔍 [AUTH-324] Checking for hard-coded OAuth configurations..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any violations found
VIOLATIONS=0

# Check for hard-coded callbackURL in code
echo "🔍 Checking for hard-coded callbackURL..."
if grep -r --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
   --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=tests/fixtures \
   'callbackURL: *["\'"'"']\/auth\/google\/callback["\'"'"']' . 2>/dev/null; then
  echo -e "${RED}❌ Found hard-coded callbackURL — must use config/auth.ts${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check for hard-coded redirect_uri with hosts
echo "🔍 Checking for hard-coded redirect_uri with hosts..."
if grep -r --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
   --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=tests/fixtures \
   'redirect_uri' . 2>/dev/null | grep -E 'https?://' | grep -v 'config/auth'; then
  echo -e "${RED}❌ Found redirect_uri with hard-coded host — must use config/auth.ts${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check for hard-coded OAuth origins
echo "🔍 Checking for hard-coded OAuth origins..."
if grep -r --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
   --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=tests/fixtures \
   'origin.*https\?://' . 2>/dev/null | grep -v 'config/auth' | grep -E '(localhost|myhome-docs\.com)'; then
  echo -e "${RED}❌ Found hard-coded OAuth origin — must use config/auth.ts${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check for environment-specific URLs outside of config
echo "🔍 Checking for environment URLs outside config..."
if grep -r --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
   --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=tests/fixtures \
   --exclude="*/config/auth.ts" --exclude="*/startup/checkAuthConfig.ts" \
   'myhome-docs\.com\|localhost:5000' . 2>/dev/null; then
  echo -e "${YELLOW}⚠️  Found environment-specific URLs outside config files${NC}"
  echo -e "${YELLOW}   Consider if these should use config/auth.ts for consistency${NC}"
fi

if [ $VIOLATIONS -eq 0 ]; then
  echo -e "${GREEN}✅ [AUTH-324] No OAuth configuration violations found${NC}"
  exit 0
else
  echo -e "${RED}❌ [AUTH-324] Found $VIOLATIONS OAuth configuration violation(s)${NC}"
  echo -e "${RED}   All OAuth URLs must be configured through server/config/auth.ts${NC}"
  echo -e "${RED}   See docs/auth/google.md for proper configuration${NC}"
  exit 1
fi