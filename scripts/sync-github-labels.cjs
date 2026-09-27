const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/github-ai-command-center.json'), 'utf8'));
const token = process.env.GITHUB_TOKEN || '';
const repo = process.env.GITHUB_REPOSITORY || 'adelkhatra-bit/KEEP';
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';

if (!token) {
  console.error('GITHUB_TOKEN missing');
  process.exit(1);
}

const labelDefinitions = config.labelDefinitions || {};
const headers = {
  'Authorization': 'Bearer ' + token,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'keep-sync-github-labels',
};

async function request(method, endpoint, data) {
  const response = await fetch(`${apiBase}/repos/${repo}${endpoint}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  if (response.status === 404 && method === 'PATCH') return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${endpoint} -> ${response.status} ${text.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function ensureLabel(name, definition) {
  const payload = {
    new_name: name,
    color: definition.color,
    description: definition.description,
  };
  const encoded = encodeURIComponent(name);
  const updated = await request('PATCH', `/labels/${encoded}`, payload);
  if (updated) return 'updated';
  await request('POST', '/labels', { name, color: definition.color, description: definition.description });
  return 'created';
}

async function main() {
  const results = [];
  for (const [name, definition] of Object.entries(labelDefinitions)) {
    if (!definition || !definition.color) continue;
    const status = await ensureLabel(name, definition);
    results.push({ name, status });
  }
  console.log(`SYNC LABELS: ${results.length} labels ensured`);
  for (const result of results) {
    console.log(`- ${result.name}: ${result.status}`);
  }
}

main().catch((error) => {
  console.error(`SYNC LABELS FAILED: ${error.message}`);
  process.exit(1);
});
