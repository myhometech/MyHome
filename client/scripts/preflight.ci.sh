#!/usr/bin/env bash
set -euo pipefail

echo "== Preflight: ensure we're inside client/ =="
[ -f package.json ] && jq -r .name package.json >/dev/null || { echo "Run from client/"; exit 1; }

echo "== Check Node version (>=18 <21) =="
node -v
node -e "const v=process.versions.node.split('.').map(Number); if(!(v[0]>=18 && v[0]<21)){process.exit(1)}" || { echo "Node must be >=18 <21"; exit 1; }

echo "== Lockfile + clean install =="
rm -rf node_modules .pnpm-store .yarn
npm ci

echo "== Lint TypeScript types =="
npx tsc -p tsconfig.json --noEmit

echo "== Check Vite alias config exists =="
grep -q 'alias.*"@"' vite.config.ts || { echo "Missing @ alias in vite.config.ts"; exit 1; }
jq -e '.compilerOptions.paths["@/*"]' tsconfig.json >/dev/null || { echo "Missing @/* path in tsconfig.json"; exit 1; }

echo "== Check Tailwind v4 PostCSS plugin =="
test -f postcss.config.cjs || { echo "Missing client/postcss.config.cjs"; exit 1; }
grep -q "@tailwindcss/postcss" postcss.config.cjs || { echo "Use @tailwindcss/postcss in postcss.config.cjs"; exit 1; }
grep -q '^@import "tailwindcss";' src/index.css || { echo 'index.css must start with @import "tailwindcss";'; exit 1; }

echo "== Detect missing deps from imports (simple scan) =="
MISSING=0
for pkg in $(grep -Rho "from ['\"][^./][^'\"]*['\"]" src | sed "s/.*from ['\"]\([^'\"]\+\)['\"]/\\1/" | sort -u); do
  npm ls "$pkg" >/dev/null 2>&1 || { echo "Missing dependency: $pkg"; MISSING=1; }
done
[ $MISSING -eq 0 ] || { echo "Install missing deps above with: npm i <name>"; exit 1; }

echo "== Build =="
npm run build

echo "✅ Preflight passed."