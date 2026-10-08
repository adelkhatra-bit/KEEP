'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'packages/admin/lib/releaseEvidence.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', compiled)(mod.exports, require, mod);
const api = mod.exports;
const sha = 'a'.repeat(40);
const site = { repository: api.REPOSITORY, branch: api.CANONICAL_BRANCH, sha, builtAt: '2026-10-06T23:00:00Z' };
const fix = { id: 'fixture', screen: 'Profil', status: 'FIXED', fixed_in_sha: sha, regression_test_path: 'scripts/admin-release-evidence.test.cjs', resolved_at: null };
const overview = { open_count: 12, fixed_count: 1, documented_count: 1, fixes_limit: 100, latest_app: null, fixes: [fix] };

test('décision validée conservée dans le contrat produit unique', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-product-contract.json'), 'utf8')).adminReleaseEvidence;
  assert.equal(contract.siteVersionUrl, api.VERSION_URL);
  assert.equal(contract.overviewFixesLimit, 100);
  for (const key of ['fixedRequiresFullShaAndRegressionTest', 'documentedDoesNotMeanTestedOrDeployed',
    'unavailableCountersNeverDefaultToZero', 'githubControlsReadOnlyCanonicalHead']) assert.equal(contract[key], true);
});

test('provenance version.json strictement canonique, pas build installé inféré', () => {
  assert.deepEqual(api.parseSiteVersion(site), site);
  for (const value of [null, {}, { ...site, branch: 'main' }, { ...site, repository: 'other/repo' },
    { ...site, sha: '0138b4e5' }, { ...site, builtAt: 'inconnu' }]) {
    assert.throws(() => api.parseSiteVersion(value));
  }
});
test('compteurs exacts ou erreur, aucune valeur absente transformée en zéro', () => {
  assert.deepEqual(api.parseOverview(overview), overview);
  for (const value of [null, {}, { ...overview, open_count: null }, { ...overview, open_count: -1 },
    { ...overview, open_count: '12' }, { ...overview, documented_count: 2 },
    { ...overview, fixes: [{}] }, { ...overview, fixes_limit: 300 },
    { ...overview, latest_app: { platform: 'web', created_at: site.builtAt } }]) {
    assert.throws(() => api.parseOverview(value));
  }
});
test('SHA complet et chemins tests sûrs uniquement, jamais URL externe ou traversal', () => {
  assert.ok(api.validSha(sha.toUpperCase()));
  assert.equal(api.validSha(sha + '\n'), false);
  assert.equal(api.commitLink(sha), `https://github.com/adelkhatra-bit/KEEP/commit/${sha}`);
  for (const p of ['scripts/admin-release-evidence.test.cjs', 'scripts/verify-product-contract.cjs',
    'packages/mobile/src/services/__tests__/musicOwnStory.test.ts']) assert.ok(api.validTestPath(p));
  for (const p of ['../../.env', 'packages/../test.test.ts', '/scripts/a.test.cjs',
    'https://evil.invalid/a.test.cjs', 'scripts/.env', 'scripts/a.test.cjs?token=x', 'scripts/a%2ftest.test.cjs', 'scripts/a.test.cjs\n']) {
    assert.equal(api.testLink(sha, p), null);
  }
  assert.equal(api.commitLink('d57de3f'), null);
});
test('corrigé, documenté, observé et test réussi jamais confondus', () => {
  assert.equal(api.evidenceState(fix, site), 'SHA du site · test à vérifier');
  assert.equal(api.evidenceState(fix, { ...site, sha: 'b'.repeat(40) }), 'Documenté · livraison à vérifier');
  assert.equal(api.evidenceState(fix, null), 'Documenté · livraison à vérifier');
  assert.equal(api.evidenceState({ ...fix, regression_test_path: null }, site), 'Preuve incomplète');
});
test('lecture version sans token, timeout, pas cache, mauvais HTTP explicite', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.ok(url.startsWith(api.VERSION_URL));
      assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error'); assert.ok(options.signal);
      assert.equal(options.headers, undefined);
      return { ok: true, json: async () => site };
    };
    assert.deepEqual(await api.readSiteVersion(), site);
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(api.readSiteVersion(), /503/);
  } finally { global.fetch = original; }
});
test('UI et RPC restent dans admin existant, pas export des messages privés', () => {
  const component = fs.readFileSync(path.join(root, 'packages/admin/components/ReleaseEvidence.tsx'), 'utf8');
  const reports = fs.readFileSync(path.join(root, 'packages/admin/pages/problem-reports.tsx'), 'utf8');
  assert.match(component, /admin_problem_report_overview/);
  assert.match(component, /test à vérifier|test réussi/);
  assert.doesNotMatch(component, /JSON\.stringify|download=|fix\.message\b|\.username\b|\.context\b/);
  assert.match(reports, /admin_problem_report_record_fix/);
  assert.match(reports, /validSha\(sha\.trim\(\)\)/);
  assert.match(reports, /admin_problem_reports_with_evidence/);
  assert.doesNotMatch(reports, /onClick=\{\(\) => void setStatus\(r\.id, 'FIXED'\)/);
});

test('le raccourci Utilisateurs conserve le basePath via le routeur Next', () => {
  const operations = fs.readFileSync(path.join(root, 'packages/admin/pages/operations.tsx'), 'utf8');
  assert.match(operations, /import Link from 'next\/link'/);
  assert.match(operations, /<Link href="\/users"/);
  assert.doesNotMatch(operations, /<a href="\/users"/);
});
