'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name) {
  const file = path.join(__dirname, '../packages/admin/lib', name);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(mod.exports, require, mod);
  return mod.exports;
}
const { healthState, parseSystemHealth, healthIntegrationHref } = load('systemHealth.ts');
const { problemReportIssueUrl } = load('problemReportIssue.ts');
test('décision Santé canonique conservée sans table ni runtime parallèles', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/keep-product-contract.json'))).adminSystemHealth;
  assert.equal(contract.healthTable, 'provider_health');
  assert.equal(contract.intervalMinutes, 5);
  assert.equal(contract.reportSource, 'app_problem_reports');
  for (const key of ['unknownNeverGreen', 'freshSuccessRequired', 'oneAlertPerIncident',
    'fixedRequiresExistingShaAndTestGuard', 'issueDraftExcludesPrivatePayload', 'singleCountryAndCurrencyPerDisplay']) assert.equal(contract[key], true);
});
test('vert uniquement après test réussi récent, pas après présence de clé ni contrôle périmé', () => {
  const now = Date.now();
  const service = { provider: 'BREVO', status: 'OK', last_checked_at: new Date(now).toISOString(), last_error: null };
  assert.equal(healthState(service, now), 'OK');
  for (const status of ['ACTIVE', 'UNKNOWN', 'NOT_CONFIGURED', 'healthy']) assert.equal(healthState({ ...service, status }, now), 'UNKNOWN');
  for (const checked of [null, 'invalid', new Date(now - 11 * 60000).toISOString(), new Date(now + 120000).toISOString()]) {
    assert.equal(healthState({ ...service, last_checked_at: checked }, now), 'UNKNOWN');
  }
  assert.equal(healthState({ ...service, status: 'ERROR', last_checked_at: null }, now), 'ERROR', 'Incident non effacé par contrôle absent');
});
test('compteurs inconnus explicites et réponse invalide refusée', () => {
  const data = { services: [], notifications: [], daily: { new_reports: 3, failed_emails: null, push_no_device: 0, waiting_qr: 7 } };
  assert.deepEqual(parseSystemHealth(data), data);
  for (const bad of [null, {}, { ...data, daily: {} }, { ...data, daily: { ...data.daily, waiting_qr: -1 } },
    { ...data, services: [{ provider: 'BREVO', status: 'OK' }] }]) assert.throws(() => parseSystemHealth(bad));
});
test('raccourcis clés existantes et tâches, aucun second admin', () => {
  assert.equal(healthIntegrationHref('BREVO'), '/integrations#integration-BREVO_API_KEY');
  assert.equal(healthIntegrationHref('ACRCLOUD'), '/integrations#integration-ACRCLOUD_ACCESS_KEY');
  assert.equal(healthIntegrationHref('EXPO_PUSH'), '/operations');
});
test('Santé historique ne confond plus clé configurée/endpoint joignable et succès opérationnel', () => {
  const operations = fs.readFileSync(path.join(__dirname, '../packages/admin/pages/operations.tsx'), 'utf8');
  assert.match(operations, /CLÉ ACCEPTÉE · VOIR SANTÉ/);
  assert.match(operations, /SERVICE JOIGNABLE · CATALOGUE À TESTER/);
  assert.doesNotMatch(operations, /text: 'OPÉRATIONNELLE'|text: 'OPÉRATIONNEL'/);
});
test('brouillon Copilot limité au groupe technique, pas aux données privées', () => {
  const key = 'a'.repeat(32);
  const url = new URL(problemReportIssueUrl({ group_key: key, report_count: 3, message: 'secret', username: 'private' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/adelkhatra-bit/KEEP/issues/new');
  assert.match(url.searchParams.get('body'), /Signalements : 3/);
  assert.match(url.searchParams.get('body'), /reconcile\/claude-main-20260825/);
  assert.doesNotMatch(url.href, /secret|private/);
  for (const group of [{ group_key: '../.env', report_count: 3 }, { group_key: key, report_count: 0 }]) assert.equal(problemReportIssueUrl(group), null);
});
