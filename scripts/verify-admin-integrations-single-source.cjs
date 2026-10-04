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

console.log('KEEP Super Admin integrations: PASS');
console.log('single provider editor; ACRCloud active path; AudD optional when absent; inline validation locked');
