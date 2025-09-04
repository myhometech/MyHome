set -euo pipefail

cleanup() {
  if [ -f .pid ]; then
    kill "$(cat .pid)" 2>/dev/null || true
    rm -f .pid
  fi
}
trap cleanup EXIT

PORT="${PORT:-5000}"

echo "== Clean build (server only) =="
rm -rf dist
npm run build

echo "== Start API (prod-like) =="
NODE_ENV=production PORT="$PORT" node dist/server/index.js > run.log 2>&1 & echo $! > .pid

echo "== Wait for server to come up =="
for i in {1..20}; do
  if curl -sf "http://localhost:$PORT/api/health" >/dev/null; then
    break
  fi
  sleep 0.5
done

echo "== Health check =="
if curl -sf "http://localhost:$PORT/api/health" | grep -q "^ok$"; then
  echo "Health OK"
else
  echo "Health FAILED"
  tail -n 120 run.log || true
  exit 1
fi

echo "== Optional DB ping (skips if no DATABASE_URL) =="
if [ -n "${DATABASE_URL:-}" ]; then
  node -e "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query('select 1');await c.end();console.log('DB OK',r.rows[0]);})().catch(e=>{console.error('DB FAIL',e);process.exit(1)})"
else
  echo "DATABASE_URL not set; skipping DB ping"
fi

echo "✅ Confidence sweep passed"
