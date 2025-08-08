// scripts/forbid-dev-refs.mjs
import fs from 'fs';
import path from 'path';

// Check both possible build output locations
const possibleRoots = ['client/dist', 'dist/public'];
let root = null;

for (const candidate of possibleRoots) {
  const resolvedPath = path.resolve(candidate);
  if (fs.existsSync(resolvedPath)) {
    root = resolvedPath;
    break;
  }
}

if (!root) {
  console.error(`Build output not found. Checked: ${possibleRoots.join(', ')}`);
  process.exit(1);
}
const forbidden = [
  /localhost:5173/i,
  /\bvite\b/i,
  /\bhmr\b/i,
  /ws:\/\/[^"'\s]+/i
];

console.log(`Scanning build output: ${root}`);

let hits = [];

function scan(p) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(p)) scan(path.join(p, f));
  } else if (stat.isFile()) {
    const buf = fs.readFileSync(p);
    // Heuristic: scan only text-like files
    const isText = /\.(html|js|css|map|txt|json)$/i.test(p);
    if (!isText) return;
    const data = buf.toString('utf8');
    forbidden.forEach((re) => {
      if (re.test(data)) hits.push({ file: p, match: re.toString() });
    });
  }
}

scan(root);

if (hits.length) {
  console.error('❌ Forbidden dev references found in production build:');
  for (const h of hits) console.error(` - ${h.file} matched ${h.match}`);
  process.exit(1);
} else {
  console.log('✅ OK: No dev references detected in production build.');
}