#!/usr/bin/env bash
set -euo pipefail

echo "== Preflight: ensure we're inside client/ =="
if [ ! -f package.json ]; then
  echo "Run this script from inside the client/ folder."
  exit 1
fi

echo "== Check Node version (>=18 <21) =="
node -v
node -e "const v=process.versions.node.split('.').map(Number); if(!(v[0]>=18 && v[0]<21)){process.exit(1)}" || { echo "Node must be >=18 <21"; exit 1; }

echo "== Clean install =="
rm -rf node_modules .pnpm-store .yarn
npm ci

echo "== Lint TypeScript types =="
npx tsc -p tsconfig.json --noEmit

echo "== Check Vite alias config =="
if ! grep -q 'alias.*"@"' vite.config.ts; then
  echo "⚠️  Missing @ alias in vite.config.ts"
  exit 1
fi

if ! grep -q '"@/*"' tsconfig.json; then
  echo "⚠️  Missing @/* path in tsconfig.json"
  exit 1
fi

echo "== Check Tailwind v4 PostCSS plugin =="
if [ ! -f postcss.config.cjs ]; then
  echo "⚠️  Missing postcss.config.cjs"
  exit 1
fi
if ! grep -q "@tailwindcss/postcss" postcss.config.cjs; then
  echo "⚠️  postcss.config.cjs must use @tailwindcss/postcss"
  exit 1
fi
if ! head -n1 src/index.css | grep -q '@import "tailwindcss";'; then
  echo "⚠️  src/index.css must start with @import \"tailwindcss\";"
  exit 1
fi

echo "== Detect missing deps from imports (quick scan) =="
MISSING=0
for pkg in $(grep -Rho "from ['\"][^./][^'\"]*['\"]" src | sed "s/.*from ['\"]\([^'\"]\+\)['\"]/\\1/" | sort -u); do
  if ! npm ls "$pkg" >/dev/null 2>&1; then
    echo "⚠️  Missing dependency: $pkg"
    MISSING=1
  fi
done
if [ $MISSING -ne 0 ]; then
  echo "❌ Install missing deps above with: npm i <name>"
  exit 1
fi

echo "== Build =="
npm run build

echo "✅ Preflight passed."