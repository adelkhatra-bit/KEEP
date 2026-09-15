#!/usr/bin/env node

/**
 * fix-web-export.cjs
 * Post-process Expo web export for SPA deployment
 * - Add 404.html for route fallback
 * - Ensure package.json is valid if present
 */

const fs = require('fs');
const path = require('path');

const distDir = process.argv[2] || 'dist';

console.log(`[fix-web-export] Processing ${distDir}...`);

if (!fs.existsSync(distDir)) {
  console.error(`[fix-web-export] ERROR: dist directory not found: ${distDir}`);
  process.exit(1);
}

try {
  // 1. Verify index.html exists
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`index.html not found in ${distDir}`);
  }
  console.log('[fix-web-export] ✓ index.html found');

  // 2. Create 404.html for SPA routing fallback
  const notFoundPath = path.join(distDir, '404.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  fs.writeFileSync(notFoundPath, indexContent);
  console.log('[fix-web-export] ✓ 404.html created for SPA routing');

  // 3. Verify and fix any JSON files if they exist
  const files = fs.readdirSync(distDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(distDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        JSON.parse(content);
        console.log(`[fix-web-export] ✓ ${file} JSON valid`);
      } catch (parseErr) {
        console.warn(`[fix-web-export] WARN: ${file} has invalid JSON, skipping: ${parseErr.message}`);
      }
    }
  }

  console.log('[fix-web-export] SUCCESS: Export processed');
  process.exit(0);
} catch (err) {
  console.error('[fix-web-export] FATAL:', err.message);
  process.exit(1);
}
