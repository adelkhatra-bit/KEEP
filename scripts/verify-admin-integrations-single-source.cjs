const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'packages/admin/pages/integrations.tsx'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'supabase/functions/keep-admin-control/index.ts'), 'utf8');

const fail = (message) => { throw new Error('KEEP ADMIN INTEGRATIONS: ' + message); };
const must = (condition, message) => { if (!condition) fail(message); };

must(!page.includes('Services à quota / payants'), 'duplicate paid-provider card reintroduced');
must(!page.includes('paidRows'), 'duplicate AudD collection reintroduced');
must(page.includes("row.key === 'AUDD_API_KEY' && !row.configured && acrCloudActive"), 'AudD must not be a blocking alert while ACRCloud is active');
must(page.includes('Optionnel · ACRCloud actif'), 'optional AudD status copy missing');
must(page.includes('attentionRows.map((row) => renderIntegrationRow(row, true))'), 'broken integrations must stay surfaced at the top');
must(page.includes('scrollIntoView({ block: \'center\', behavior: \'smooth\' })'), 'integration row context preservation missing');
must(backend.includes('async function validateAuddToken'), 'AudD provider validation missing');
must(backend.includes('ACRCLOUD_ACCESS_KEY') && backend.includes('ACRCLOUD_ACCESS_SECRET') && backend.includes('ACRCLOUD_HOST'), 'ACRCloud credential set incomplete');
must(backend.includes('Pipedream Connect vérifié et prêt') && backend.includes('status: "ACTIVE" as const'), 'Pipedream success must persist as ACTIVE, never unsupported OK');
must(backend.includes('if (error) throw error;'), 'runtime integration status writes must not fail silently');

const keysSource = fs.readFileSync(path.join(root, 'packages/admin/lib/integrationKeys.ts'), 'utf8');
const urgentList = keysSource.match(/REQUIRED_INTEGRATION_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const/);
must(Boolean(urgentList), 'urgent keys must come from the shared editor contract');
const urgentKeys = [...urgentList[1].matchAll(/'([A-Z0-9_]+)'/g)].map((match) => match[1]);
const functionRoot = path.join(root, 'supabase/functions');
const consumers = fs.readdirSync(functionRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'keep-admin-control' && entry.name !== '_shared')
  .flatMap((entry) => fs.readdirSync(path.join(functionRoot, entry.name))
    .filter((file) => file.endsWith('.ts')).map((file) => path.join(functionRoot, entry.name, file)));
function runtimeCode(file, visited = new Set()) {
  if (visited.has(file)) return '';
  visited.add(file);
  const code = fs.readFileSync(file, 'utf8');
  return code + [...code.matchAll(/from\s+["'](\.\.?\/[^"']+\.ts)["']/g)].map((match) => {
    const dependency = path.resolve(path.dirname(file), match[1]);
    return fs.existsSync(dependency) ? runtimeCode(dependency, visited) : '';
  }).join('\n');
}
const runtimeSources = consumers.map((file) => runtimeCode(file));
for (const key of urgentKeys) {
  must(runtimeSources.some((code) => code.includes('service_get_integration_secret') &&
    new RegExp(`(?:integrationSecret|readIntegrationSecret|getSecret|secret)\\([^\\n]*["']${key}["']`).test(code)),
  `${key}: urgent key has no runtime RPC consumer outside admin-control`);
}
must(!page.includes('À tester'), 'only OK, Refusée and Manquante states may be displayed');
must(page.includes("action: 'integrations.test'"), 'automatic provider check on opening is required');
must(page.includes('Optionnel / plus tard'), 'optional keys must remain in a collapsed section');

console.log('KEEP Super Admin integrations: PASS');
console.log('single provider editor; ACRCloud active path; AudD optional when absent; inline validation locked');
