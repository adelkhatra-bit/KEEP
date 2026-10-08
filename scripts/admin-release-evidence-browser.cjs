'use strict';
// Export admin local : KEEP_ADMIN_BASE_PATH=/KEEP/admin-preview, https://fixture.invalid uniquement.
// Servir out sous /KEEP/admin-preview, sans fallback SPA/racine.
// NODE_PATH=<outils Playwright> KEEP_ADMIN_TEST_URL=http://127.0.0.1:3090/KEEP/admin-preview node scripts/admin-release-evidence-browser.cjs
// Aucun compte réel, aucune requête production, aucun fichier de preuve privé.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = (process.env.KEEP_ADMIN_TEST_URL || 'http://127.0.0.1:3090/KEEP/admin-preview').replace(/\/+$/, '');
const url = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Test autorisé uniquement sur loopback');
assert.equal(url.pathname, '/KEEP/admin-preview', 'Le test exige le basePath admin canonique');
assert.equal(url.search + url.hash, '', 'Pas de query/fragment dans la racine de test');
const sha = 'a'.repeat(40);
const testPath = 'scripts/admin-release-evidence.test.cjs';

async function scenario(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  let unavailable = false;
  let stored = { id: '00000000-0000-0000-0000-000000000001', created_at: '2026-10-06T23:00:00Z',
    kind: 'MANUAL', status: 'NEW', message: 'Signalement de fixture uniquement', screen: 'Profil',
    platform: 'ios', app_version: '1.0.0', username: 'fixture', fixed_in_sha: null, regression_test_path: null };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from('{"alg":"none"}').toString('base64url'), Buffer.from(JSON.stringify({ exp, sub: stored.id })).toString('base64url'), 'fixture'].join('.');
  await context.addInitScript(({ token, exp, id }) => {
    localStorage.setItem('keep-superadmin-auth-v1', JSON.stringify({
      access_token: token, refresh_token: 'fixture-only', token_type: 'bearer', expires_at: exp, expires_in: 3600,
      user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {} },
    }));
  }, { token, exp, id: stored.id });
  await context.routeWebSocket('wss://fixture.invalid/**', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin === url.origin) return route.continue();
    const json = async (data, status = 200) => route.fulfill({
      status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data),
    });
    if (target.href.startsWith('https://adelkhatra-bit.github.io/KEEP/version.json')) {
      return unavailable ? json({ error: 'fixture inaccessible' }, 503) :
        json({ repository: 'adelkhatra-bit/KEEP', branch: 'reconcile/claude-main-20260825', sha, builtAt: stored.created_at });
    }
    if (target.hostname !== 'fixture.invalid') return route.abort();
    if (request.method() === 'OPTIONS') return json({});
    const rpc = target.pathname.split('/').pop();
    if (rpc === 'get_my_admin_role') return json('SUPER_ADMIN');
    if (rpc === 'admin_problem_report_overview') return unavailable ? json({ message: 'fixture migration absente' }, 404) : json({
      open_count: 12, fixed_count: 2, documented_count: 1, fixes_limit: 100,
      latest_app: { app_version: '1.0.0', platform: 'ios', build_sha: sha, created_at: stored.created_at },
      fixes: [{ ...stored, status: 'FIXED', fixed_in_sha: sha, regression_test_path: testPath, resolved_at: stored.created_at },
        { ...stored, id: '00000000-0000-0000-0000-000000000002', status: 'FIXED', screen: 'Story', resolved_at: null }],
    });
    if (rpc === 'admin_problem_reports_with_evidence') return json([stored]);
    if (rpc === 'admin_problem_report_record_fix') {
      const args = request.postDataJSON();
      assert.equal(args.p_sha, sha); assert.equal(args.p_test, testPath);
      stored = { ...stored, status: 'FIXED', fixed_in_sha: args.p_sha, regression_test_path: args.p_test };
      return json(true);
    }
    if (rpc === 'admin_problem_report_set_status') {
      stored = { ...stored, status: request.postDataJSON().p_status }; return json(true);
    }
    if (target.pathname.includes('/functions/v1/')) return json({ ok: true, data: [], minimumConfidence: 0.72 });
    if (rpc === 'admin_push_delivery_summary') return json(['TOKENS_REGISTERED', 'CREATED', 'NO_DEVICE', 'SENT', 'DELIVERED', 'FAILED', 'ATTEMPTS_24H'].map(status => ({ status, total: 0 })));
    if (['admin_pending_support_count', 'admin_event_pending_count'].includes(rpc)) return json(0);
    return json([]);
  });
  const page = await context.newPage();
  const errors = [];
  const httpErrors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => {
    if (new URL(response.url()).origin === url.origin && response.status() >= 400) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  const operationsResponse = await page.goto(`${base}/operations/`);
  assert.equal(operationsResponse.status(), 200, 'Export statique Opérations accessible');
  const evidence = page.getByRole('region', { name: 'Versions et preuves' });
  await evidence.waitFor();
  await page.waitForFunction(() => document.querySelector('section[aria-label="Versions et preuves"]')?.textContent.includes('aaaaaaaa'));
  assert.match(await evidence.innerText(), /Problèmes ouverts\s*12/);
  assert.match(await evidence.innerText(), /Preuve incomplète/);
  assert.match(await evidence.innerText(), /SHA du site · test à vérifier/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Débordement operations ${width}`);
  await evidence.getByLabel('En savoir plus', { exact: true }).click();
  assert.match(await evidence.innerText(), /pas une version installée partout/);
  await page.reload();
  await evidence.waitFor();
  await page.waitForFunction(() => document.querySelector('section[aria-label="Versions et preuves"]')?.textContent.includes('aaaaaaaa'));
  unavailable = true;
  await evidence.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await evidence.getByText('Version inaccessible · réseau ou provenance à vérifier').waitFor();
  assert.match(await evidence.innerText(), /Problèmes ouverts\s*Indisponible/);
  assert.doesNotMatch(await evidence.innerText(), /Problèmes ouverts\s*0/);
  unavailable = false;
  const reportsUrl = `${base}/problem-reports/`;
  const reportsLink = evidence.getByRole('link', { name: 'Signalements & preuves', exact: true });
  assert.equal(await reportsLink.getAttribute('href'), `${url.pathname}/problem-reports/`);
  await reportsLink.click();
  await page.waitForURL(reportsUrl);
  await page.getByRole('button', { name: '✓ Corrigé', exact: true }).waitFor();
  assert.equal(page.url(), reportsUrl, 'Clic interne conserve le basePath');
  const reportsResponse = await page.reload();
  assert.equal(reportsResponse.status(), 200, 'Signalements accessible aussi sans routeur client');
  assert.equal(page.url(), reportsUrl, 'Reload conserve le basePath');
  await page.getByRole('button', { name: '✓ Corrigé', exact: true }).click();
  const save = page.getByRole('button', { name: 'Enregistrer preuves' });
  assert.ok(await save.isDisabled());
  await page.getByLabel('SHA du correctif').fill(sha);
  await page.getByLabel('Chemin du test anti-régression').fill('../../.env');
  assert.ok(await save.isDisabled());
  await page.getByLabel('Chemin du test anti-régression').fill(testPath);
  await save.click();
  await page.getByRole('button', { name: 'Associer preuves', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Associer preuves', exact: true }).waitFor();
  await page.getByText('Correctif & test', { exact: true }).click();
  assert.equal(await page.getByRole('link', { name: `Commit ${sha}` }).getAttribute('href'), `https://github.com/adelkhatra-bit/KEEP/commit/${sha}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Débordement signalements ${width}`);
  assert.deepEqual(errors, []);
  assert.deepEqual(httpErrors, [], 'Aucun HTTP >=400 pour pages/assets exportés');
  console.log(`Chromium ${width}×${height} : ${base}, clic Opérations → Signalements + reload HTTP200, versions, erreurs explicites, preuves et formulaire sécurisé OK (fixtures isolées)`);
  await context.close();
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try { for (const [width, height] of [[390, 844], [1440, 900]]) await scenario(browser, width, height); }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
