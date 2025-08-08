const fs = require('fs');
const path = require('path');

// Find all TypeScript files in server directory
function findTsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && entry.name !== 'vite.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

// Clean up console logging in a file
function cleanConsoleLogging(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let modified = content;
  let changeCount = 0;
  
  // Remove or guard console statements
  const patterns = [
    // Simple console.log statements
    { regex: /(\s*)console\.log\([^;]*\);?\n?/g, replacement: '$1// Debug logging removed\n' },
    { regex: /(\s*)console\.error\([^;]*\);?\n?/g, replacement: '$1// Error logging removed\n' },
    { regex: /(\s*)console\.warn\([^;]*\);?\n?/g, replacement: '$1// Warning logging removed\n' },
    { regex: /(\s*)console\.debug\([^;]*\);?\n?/g, replacement: '$1// Debug logging removed\n' },
    { regex: /(\s*)console\.info\([^;]*\);?\n?/g, replacement: '$1// Info logging removed\n' }
  ];
  
  for (const pattern of patterns) {
    const before = modified;
    modified = modified.replace(pattern.regex, pattern.replacement);
    if (before !== modified) {
      changeCount++;
    }
  }
  
  if (changeCount > 0) {
    fs.writeFileSync(filePath, modified);
    console.log(`Cleaned ${changeCount} console statements in ${filePath}`);
    return true;
  }
  return false;
}

// Process all server files
const serverFiles = findTsFiles('server');
let totalCleaned = 0;

console.log(`Processing ${serverFiles.length} TypeScript files in server/`);

for (const file of serverFiles) {
  if (cleanConsoleLogging(file)) {
    totalCleaned++;
  }
}

console.log(`Console cleanup complete! Modified ${totalCleaned} files.`);
