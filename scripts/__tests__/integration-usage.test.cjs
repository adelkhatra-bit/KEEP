const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const functions = path.join(root, 'supabase/functions');
const usage = fs.readFileSync(path.join(functions, '_shared/integrationUsage.ts'), 'utf8');
const keys = [...usage.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map((match) => match[1]);

function runtimeSource(file, visited = new Set()) {
  if (visited.has(file)) return '';
  visited.add(file);
  const source = fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const imports = [...source.matchAll(/from\s+["'](\.[^"']+\.ts)["']/g)];
  return source + imports.map((match) => runtimeSource(path.resolve(path.dirname(file), match[1]), visited)).join('\n');
}

const consumers = fs.readdirSync(functions, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '_shared' && !/admin|test/.test(entry.name))
  .map((entry) => path.join(functions, entry.name, 'index.ts'))
  .filter(fs.existsSync)
  .map((file) => ({ file, source: runtimeSource(file) }));

test('la liste À corriger est unique et consommée via le Vault par des fonctions produit', () => {
  assert.ok(keys.length > 0);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) {
    const used = consumers.some(({ source }) =>
      source.includes('service_get_integration_secret') && new RegExp(`["']${key}["']`).test(source));
    assert.ok(used, `${key} figure dans À corriger sans consommateur produit service_get_integration_secret`);
  }
});

test('les intégrations différées et Deezer ne polluent pas À corriger', () => {
  for (const key of keys) {
    assert.ok(!/^(MAILJET_|RESEND_|PADDLE_|MUSICAPI_|GOOGLE_PLAY_|DEEZER_|APPLE_IAP_|STRIPE_)/.test(key), key);
  }
  const screen = fs.readFileSync(path.join(root, 'packages/admin/pages/integrations.tsx'), 'utf8');
  assert.ok(screen.includes('ACTIVE_INTEGRATION_KEYS'), 'L’écran doit utiliser le même contrat que la CI');
});
