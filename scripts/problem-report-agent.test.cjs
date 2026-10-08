'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const agent = require('./problem-report-agent.cjs');
const root = path.resolve(__dirname, '..');
const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
const report = (n, extra = {}) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  status: 'NEW', kind: 'SHAKE', screen: 'Profile', message: 'Texte utilisateur privé',
  platform: 'ios', app_version: '1.0', build_sha: a, ...extra,
});
const fix = { fixed_in_sha: b, regression_test_path: 'scripts/problem-report-agent.test.cjs' };
const ancestor = (from, to) => from === to || (from === a && to === b);

test('regroupement code + écran, indépendant de version/appareil, jamais un deuxième tri/table', () => {
  const groups = agent.groupReports([
    report(1, { message: '[AUTO] PREVIEW_PLAY_FAILED — tamponnement' }),
    report(2, { message: '[AUTO] PREVIEW_PLAY_FAILED — timeout', device: 'autre' }),
    report(3, { screen: 'Listen', message: '[AUTO] PREVIEW_PLAY_FAILED' }),
    report(4), report(5),
  ]);
  assert.deepEqual(groups.map(g => g.rows.length), [2, 1, 2]);
  assert.notEqual(groups[0].key, groups[1].key);
  assert.equal(agent.groupReports([groups[0].rows[1]])[0].key, groups[0].key);
  const note = agent.analysisNote(groups[0], groups[0].rows[0], 42);
  for (const expected of ['Cause probable', 'Module', 'Fichiers', 'Écran', 'Appareil', 'Version', 'Build']) assert.ok(note.includes(expected));
});

test('DÉJÀ CORRIGÉ exige un build strictement ancêtre ; inconnu, égal, plus récent ou divergent restent ouverts', () => {
  assert.equal(agent.fixStatus(report(1), fix, ancestor), 'NEEDS_UPDATE');
  for (const build_sha of [b, c, null, '', '1.2.3', '$(commande)']) {
    assert.equal(agent.fixStatus(report(1, { build_sha }), fix, ancestor), null);
  }
  assert.equal(agent.fixStatus(report(1), { ...fix, fixed_in_sha: 'abc' }, ancestor), null);
  assert.equal(agent.fixStatus(report(1), { ...fix, regression_test_path: '../secret.test.cjs' }, ancestor), null);
  assert.equal(agent.fixStatus(report(1), fix, () => false), null);
});

test('transport Supabase ne peut écrire QUE les sept colonnes de suivi de la table existante', async () => {
  const calls = [];
  const store = agent.reportStore('fixture-only', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => [report(1)] };
  });
  await store.read();
  await store.update(report(1).id, Object.fromEntries(agent.FOLLOWUP.map(key => [key, null])), 'NEW');
  assert.equal(calls.length, 2);
  const write = calls[1];
  assert.equal(write.options.method, 'PATCH');
  assert.equal(new URL(write.url).pathname, '/rest/v1/app_problem_reports');
  assert.equal(new URL(write.url).searchParams.get('status'), 'eq.NEW');
  assert.deepEqual(Object.keys(JSON.parse(write.options.body)), agent.FOLLOWUP);
  for (const column of ['message', 'screen', 'user_id', 'context', 'app_version', 'id', '__proto__']) {
    await assert.rejects(store.update(report(1).id, JSON.parse(`{"${column}":"x"}`), 'NEW'), /hors suivi/);
  }
  await assert.rejects(store.update('x&user_id=neq.x', { status: 'FIXED' }, 'NEW'), /hors suivi/);
  assert.equal(calls.length, 2, 'aucune requête pour une écriture interdite');
  assert.throws(() => agent.reportStore(''), /Secret.*manquant/);
});

test('transport refuse une modification concurrente au lieu de masquer une absence de mise à jour', async () => {
  const store = agent.reportStore('fixture', async () => ({ ok: true, status: 200, json: async () => [] }));
  await assert.rejects(store.update(report(1).id, { status: 'SEEN' }, 'NEW'), /simultanément/);
});

function harness(rows, initialIssues = []) {
  const issues = structuredClone(initialIssues);
  const writes = [];
  const requests = [];
  const store = {
    read: async () => structuredClone(rows),
    update: async (id, patch, expected) => {
      const row = rows.find(r => r.id === id);
      assert.equal(row.status, expected);
      assert.ok(Object.keys(patch).every(key => agent.FOLLOWUP.includes(key)));
      writes.push({ id, patch }); Object.assign(row, patch);
    },
  };
  const api = async (route, method = 'GET', body) => {
    requests.push({ route, method, body });
    if (route.startsWith('issues?')) return structuredClone(issues);
    if (route.startsWith('labels?')) return [{ name: 'signalement' }];
    if (route === 'issues' && method === 'POST') {
      const issue = { number: 42 + issues.length, state: 'open', assignees: [], ...body };
      issues.push(issue); return structuredClone(issue);
    }
    const number = Number(route.split('/')[1]);
    const issue = issues.find(i => i.number === number);
    if (route.endsWith('/assignees')) { issue.assignees = [{ login: 'copilot-swe-agent[bot]' }]; return structuredClone(issue); }
    if (method === 'PATCH' && issue) { Object.assign(issue, body); return structuredClone(issue); }
    throw new Error(`Requête inattendue : ${route}`);
  };
  return { store, api, issues, writes, requests };
}

test('90 fixtures : toutes analysées, une issue par groupe, base reconcile et assignation confirmée, relance sans doublons', async () => {
  const rows = Array.from({ length: 90 }, (_, n) => report(n + 1));
  const h = harness(rows);
  const options = { store: h.store, api: h.api, assignmentApi: h.api, verify: async () => false };
  const result = await agent.runAgent(options);
  assert.equal(result.read, 90);
  assert.equal(result.analyzed, 90);
  assert.equal(result.missing, 0);
  assert.deepEqual(result.errors, []);
  assert.equal(h.issues.length, 1);
  assert.ok(rows.every(r => r.ai_note && r.status === 'IN_PROGRESS'));
  assert.equal(h.requests.find(r => r.route.endsWith('/assignees')).body.agent_assignment.base_branch, 'reconcile/claude-main-20260825');
  await agent.runAgent(options);
  assert.equal(h.issues.length, 1);
  assert.equal(h.requests.filter(r => r.route.endsWith('/assignees')).length, 1);
  assert.equal(h.requests.some(r => r.route.includes('/merge')), false);
  const body = h.issues[0].body;
  assert.ok(!body.includes('Texte utilisateur privé'));
  for (const guard of ['check-contrast.js', 'CI complète verte', 'regression_test_path', 'validation d’Adel', 'couleurs, tailles, espacements', 'module concerné']) assert.ok(body.includes(guard));
});

test('assignation impossible : notes persistées, issue unique conservée et erreur explicite', async () => {
  const rows = [report(1)];
  const h = harness(rows);
  const result = await agent.runAgent({ store: h.store, api: h.api });
  assert.equal(result.missing, 0);
  assert.equal(rows[0].status, 'SEEN');
  assert.match(result.errors[0], /COPILOT_ASSIGNMENT_TOKEN manquant/);
  await agent.runAgent({ store: h.store, api: h.api });
  assert.equal(h.issues.length, 1);
});

test('modération : chaque ligne reçoit une note, aucun correctif ni sanction pour ABUSE/flagged', async () => {
  const rows = [report(1, { flagged: true }), report(2, { kind: 'ABUSE' })];
  const h = harness(rows);
  await agent.runAgent({ store: h.store, api: h.api });
  assert.ok(rows.every(r => r.ai_note && r.status === 'SEEN'));
  assert.equal(h.issues.length, 0);
  assert.ok(h.writes.every(w => !('flagged' in w.patch)));
});

test('correctif publié : marqueur exact, SHA/test et DÉJÀ CORRIGÉ ; accusé existant jamais réinitialisé à chaque passage', async () => {
  const rows = [report(1)];
  const group = agent.groupReports(rows)[0];
  const body = agent.issueBody(group) + `\n<!-- keep-report-fix:{"sha":"${b}","test":"${fix.regression_test_path}"} -->`;
  const h = harness(rows, [{ number: 42, body, state: 'closed', assignees: [] }]);
  const options = { store: h.store, api: h.api, verify: async () => true, ancestor };
  await agent.runAgent(options);
  assert.equal(rows[0].status, 'NEEDS_UPDATE');
  assert.equal(rows[0].fixed_in_sha, b);
  assert.equal(rows[0].regression_test_path, fix.regression_test_path);
  assert.ok(rows[0].ai_note.includes(agent.publishedMarker(b)));
  rows[0].notified_at = '2026-10-08T12:00:00Z';
  await agent.runAgent(options);
  assert.equal(rows[0].notified_at, '2026-10-08T12:00:00Z');
  assert.equal(h.writes.filter(w => 'notified_at' in w.patch).length, 1);
});

test('aucune clôture pour un signalement de régression à partir du build corrigé', async () => {
  const rows = [report(1, { build_sha: b })];
  const group = agent.groupReports(rows)[0];
  const body = agent.issueBody(group) + `\n<!-- keep-report-fix:{"sha":"${b}","test":"${fix.regression_test_path}"} -->`;
  const h = harness(rows, [{ number: 42, body, state: 'closed', assignees: [{ login: 'copilot-swe-agent[bot]' }] }]);
  await agent.runAgent({ store: h.store, api: h.api, verify: async () => true, ancestor });
  assert.equal(rows[0].status, 'IN_PROGRESS');
  assert.equal(h.issues[0].state, 'open');
  assert.ok(!rows[0].ai_note.includes('keep-published'));
});

test('preuve de publication : PR canonique fusionnée, tous les contrôles/jobs verts et vraie étape OTA, pas skipped', async () => {
  const group = agent.groupReports([report(1)])[0];
  let skip = false;
  let merged = true;
  const api = async route => {
    if (route.startsWith(`commits/${b}/pulls`)) return [{
      merged_at: merged ? '2026-10-08T12:00:00Z' : null, merge_commit_sha: b,
      base: { ref: 'reconcile/claude-main-20260825', repo: { full_name: 'adelkhatra-bit/KEEP' } },
      body: agent.issueBody(group),
    }];
    if (route.startsWith('commits/')) return { sha: b };
    if (route.startsWith('contents/')) return { type: 'file' };
    if (route.includes('eas-update-production')) return { workflow_runs: [{ id: 2, status: 'completed', conclusion: 'success', head_sha: b }] };
    if (route.startsWith('actions/workflows/')) return { workflow_runs: [{ id: 1, status: 'completed', conclusion: 'success' }] };
    if (route.includes('/2/jobs')) return { jobs: [{ steps: [{ name: 'Publish latest JS to production', conclusion: skip ? 'skipped' : 'success' }] }] };
    if (route.includes('/1/jobs')) return { jobs: [{ status: 'completed', conclusion: 'success' }] };
    throw new Error(route);
  };
  assert.equal(await agent.verifiedFix(fix, group, api, ancestor), true);
  skip = true;
  assert.equal(await agent.verifiedFix(fix, group, api, ancestor), false);
  skip = false; merged = false;
  assert.equal(await agent.verifiedFix(fix, group, api, ancestor), false);
  assert.equal(await agent.verifiedFix(fix, { ...group, rows: [report(1, { platform: 'android' })] }, api, ancestor), false);
});

test('les propriétaires suggérés existent ; pas de mutation de layout/couleurs du panneau', () => {
  for (const [code, screen] of [['PREVIEW_PLAY_FAILED', 'Profile'], ['STORY_PIN_FAILED', 'Profile'], ['SWIPE_SLOW', 'Profile'], ['SHAKE', 'Parties'], ['SHAKE', 'SessionRecap'], ['MANUAL', 'inconnu']]) {
    for (const file of agent.moduleFor({ code, rows: [report(1, { screen })] }).files) assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261008110000_problem_report_agent.sql'), 'utf8');
  const executable = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(executable, /\b(insert|update|delete|truncate|drop|create table|create policy)\b/i);
  assert.match(sql, /r\.user_id = auth\.uid\(\)/);
  assert.match(sql, /keep-published:/);
  const source = fs.readFileSync(path.join(root, 'packages/mobile/src/services/problemReportService.ts'), 'utf8');
  assert.match(source, /p_ids: \[first\.id\]/, 'n’accuser que la notification effectivement annoncée');
});
