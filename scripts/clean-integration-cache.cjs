const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  '.expo',
  '.metro-cache',
  'packages/mobile/.expo',
  'packages/mobile/dist',
  'packages/mobile/dist-web',
  'packages/mobile/web-build',
  'packages/admin/.next',
  'node_modules/.cache',
  'packages/mobile/node_modules/.cache',
];

for (const relative of targets) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log('[KEEP cache] supprimé:', relative);
}

console.log('[KEEP cache] caches générés locaux nettoyés.');
console.log('[KEEP cache] START_KEEP_LIVE_CLEAN.bat conserve aussi Expo --clear + navigateur privé/nocache.');
