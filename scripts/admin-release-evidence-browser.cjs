'use strict';
// Export admin local : KEEP_ADMIN_BASE_PATH=/KEEP/admin-preview, https://fixture.invalid uniquement.
// Servir out sous /KEEP/admin-preview, sans fallback SPA/racine.
// NODE_PATH=<outils Playwright> KEEP_ADMIN_TEST_URL=http://127.0.0.1:3090/KEEP/admin-preview node scripts/admin-release-evidence-browser.cjs
// Aucun compte réel, aucune requête production, aucun fichier de preuve privé.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = (process.env.KEEP_ADMIN_TEST_URL || 'http://127.0.0.1:3090/KEEP/admin-preview').replace(/\/+$/, '');
const url = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Test autorisé uniquement sur loopback');
assert.equal(url.pathname, '/KEEP/admin-preview', 'Le test exige le basePath admin canonique');
assert.equal(url.search + url.hash, '', 'Pas de query/fragment dans la racine de test');
const sha = 'a'.repeat(40);
const testPath = 'scripts/admin-release-evidence.test.cjs';
const screenshots = process.env.KEEP_ADMIN_SCREENSHOTS || '/tmp/keep57-screenshots';
fs.mkdirSync(screenshots, { recursive: true });

async function scenario(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  let unavailable = false;
  let stored = { id: '00000000-0000-0000-0000-000000000001', created_at: '2026-10-06T23:00:00Z',
    kind: 'MANUAL', status: 'NEW', message: 'Signalement de fixture uniquement', screen: 'Profil',
    platform: 'ios', app_version: '1.0.0', username: 'fixture', fixed_in_sha: null, regression_test_path: null,
    group_key: 'a'.repeat(32), report_count: 3 };
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
    if (rpc === 'admin_system_health') return unavailable ? json({ message: 'fixture inaccessible' }, 503) : json({
      services: [
        { provider: 'BREVO', status: 'ERROR', last_checked_at: new Date().toISOString(), last_error: 'HTTP_403' },
        { provider: 'YOUTUBE', status: 'OK', last_checked_at: new Date().toISOString(), last_error: null },
        { provider: 'ACRCLOUD', status: 'UNKNOWN', last_checked_at: null, last_error: 'NOT_OBSERVED' },
        { provider: 'APPLE_MUSIC_TOKEN', status: 'OK', last_checked_at: '2026-01-01T00:00:00Z', last_error: null },
      ],
      daily: { new_reports: 14, failed_emails: 6, push_no_device: 370, waiting_qr: 243 },
      notifications: [{ id: stored.id, title: 'Incident · BREVO', created_at: stored.created_at }],
    });
    if (rpc === 'admin_dashboard_stats') {
      assert.ok(['FR', 'US'].includes(request.postDataJSON().p_country), 'Un seul pays requis');
      return json({ usersTotal: 1, newUsers: 1, verifiedEmails: 1, activePaid: 0, keeps: 0, follows: 0, shares: 0, eventsCreated: 0,
        dailySignups: [], planMix: [], sharesByChannel: [], countryMix: [{ country: 'FR', count: 1 }, { country: 'US', count: 2 }] });
    }
    if (rpc === 'admin_dashboard_v2') return json({
      people: { real: { total: 1, new: 1, verified: 1, active: 1 }, test: { total: 0, new: 0, verified: 0, active: 0 } },
      money: { byCurrency: [{ currency: 'EUR', net: 10, count: 1 }, { currency: 'USD', net: 20, count: 1 }], marketByCurrency: [], paidSubscribers: 1, freePacksBought: { count: 0, free: 0 } },
      offered: { subscriptions: 0, subscriptionsReal: 0, adminFree: { real: 0, test: 0 }, monthlyFree: { real: 0, test: 0 } },
      freeEconomy: { earnedByType: {}, soloPacksFree: 0, marketFree: 0 }, shares: { real: 0, test: 0, byChannel: [], sharers: 0 }, daily: [],
    });
    if (target.pathname.endsWith('/countries')) return json([{ code: 'FR', name: 'France' }, { code: 'US', name: 'États-Unis' }]);
    if (rpc === 'admin_problem_report_overview') return unavailable ? json({ message: 'fixture migration absente' }, 404) : json({
      open_count: 12, fixed_count: 2, documented_count: 1, fixes_limit: 100,
      latest_app: { app_version: '1.0.0', platform: 'ios', build_sha: sha, created_at: stored.created_at },
      fixes: [{ ...stored, status: 'FIXED', fixed_in_sha: sha, regression_test_path: testPath, resolved_at: stored.created_at },
        { ...stored, id: '00000000-0000-0000-0000-000000000002', status: 'FIXED', screen: 'Story', resolved_at: null }],
    });
    if (rpc === 'admin_problem_report_groups') {
      const filter = request.postDataJSON().p_status;
      return json(filter === 'ALL' || filter === stored.status ? [stored] : []);
    }
    if (rpc === 'admin_problem_report_group_set_status') {
      const args = request.postDataJSON();
      assert.equal(args.p_group_key, stored.group_key);
      if (args.p_status === 'FIXED') {
        assert.equal(args.p_sha, sha); assert.equal(args.p_test, testPath);
        stored = { ...stored, fixed_in_sha: args.p_sha, regression_test_path: args.p_test };
      }
      stored = { ...stored, status: args.p_status };
      return json(3);
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
  await page.goto(`${base}/`);
  const health = page.getByRole('region', { name: 'Santé des services' });
  await health.getByText('Santé · 1 incident(s)', { exact: true }).waitFor();
  assert.ok((await health.innerText()).includes('✅ YOUTUBE'));
  assert.ok((await health.innerText()).includes('❔ ACRCLOUD'));
  assert.ok((await health.innerText()).includes('❔ APPLE_MUSIC_TOKEN'));
  await health.getByText('❌ BREVO', { exact: true }).click();
  assert.equal(await health.getByRole('link', { name: 'Ouvrir la clé / la tâche concernée' }).getAttribute('href'), `${url.pathname}/integrations/#integration-BREVO_API_KEY`);
  await health.getByText('Résumé du jour · UTC · système global', { exact: true }).waitFor();
  assert.match(await health.innerText(), /Nouveaux signalements : 14/);
  const currency = page.getByLabel('Devise', { exact: true });
  await page.getByText('net EUR · 1 paiement(s)').waitFor();
  assert.equal(await page.getByText('net USD · 1 paiement(s)').count(), 0);
  await currency.selectOption('USD');
  await page.getByText('net USD · 1 paiement(s)').waitFor();
  assert.equal(await page.getByText('net EUR · 1 paiement(s)').count(), 0);
  await page.getByLabel('Pays', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: '1 alerte(s) Super Admin' }).click();
  await page.getByRole('link', { name: /Incident · BREVO/ }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Débordement accueil ${width}`);
  await page.screenshot({ path: path.join(screenshots, `sante-${width}.png`), fullPage: true });
  const operationsResponse = await page.goto(`${base}/operations/`);
  assert.equal(operationsResponse.status(), 200, 'Export statique Opérations accessible');
  const evidence = page.getByRole('region', { name: 'Versions et preuves' });
  await evidence.waitFor();
  await page.waitForFunction(() => document.querySelector('section[aria-label="Versions et preuves"]')?.textContent.includes('aaaaaaaa'));
  assert.match(await evidence.innerText(), /Problèmes ouverts\s*12/);
  assert.match(await evidence.innerText(), /Preuve incomplète/);
  assert.match(await evidence.innerText(), /SHA du site · test à vérifier/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Débordement operations ${width}`);
  await evidence.getByText('En savoir plus', { exact: true }).click();
  assert.match(await evidence.innerText(), /pas une version installée partout/);
  await page.reload();
  await evidence.waitFor();
  await page.waitForFunction(() => document.querySelector('section[aria-label="Versions et preuves"]')?.textContent.includes('aaaaaaaa'));
  unavailable = true;
  await evidence.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await evidence.getByText('Version inaccessible · réseau ou provenance à vérifier').waitFor();
  assert.match(await evidence.innerText(), /Problèmes ouverts\s*Indisponible/);
  assert.doesNotMatch(await evidence.innerText(), /Problèmes ouverts\s*0/);
  await page.reload();
  await page.getByRole('region', { name: 'Santé des services' }).getByRole('alert').waitFor();
  assert.doesNotMatch(await page.getByRole('region', { name: 'Santé des services' }).innerText(), /✅|Santé · 0 incident/);
  await page.getByRole('button', { name: 'Alertes santé indisponibles' }).click();
  await page.getByText('Santé indisponible · à vérifier', { exact: true }).waitFor();
  unavailable = false;
  await evidence.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await evidence.getByRole('link', { name: 'Signalements & preuves', exact: true }).waitFor();
  const reportsUrl = `${base}/problem-reports/`;
  const reportsLink = evidence.getByRole('link', { name: 'Signalements & preuves', exact: true });
  assert.equal(await reportsLink.getAttribute('href'), `${url.pathname}/problem-reports/`);
  await reportsLink.click();
  await page.waitForURL(reportsUrl);
  await page.getByRole('button', { name: '✓ Corrigé', exact: true }).waitFor();
  await page.getByText('Profil · 3 signalement(s) · NEW', { exact: true }).waitFor();
  const issue = new URL(await page.getByRole('link', { name: 'Créer une issue Copilot' }).getAttribute('href'));
  assert.match(issue.searchParams.get('body'), /Signalements : 3/);
  assert.doesNotMatch(issue.searchParams.get('body'), /Signalement de fixture|username|fixture@example/);
  await page.screenshot({ path: path.join(screenshots, `signalements-${width}.png`), fullPage: true });
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
  await page.getByRole('button', { name: 'Corrigés', exact: true }).click();
  await page.getByRole('button', { name: 'Associer preuves', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Corrigés', exact: true }).click();
  await page.getByRole('button', { name: 'Associer preuves', exact: true }).waitFor();
  await page.getByText('Correctif & test', { exact: true }).click();
  assert.equal(await page.getByRole('link', { name: `Commit ${sha}` }).getAttribute('href'), `https://github.com/adelkhatra-bit/KEEP/commit/${sha}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Débordement signalements ${width}`);
  assert.deepEqual(errors, []);
  assert.deepEqual(httpErrors, [], 'Aucun HTTP >=400 pour pages/assets exportés');
  console.log(`Chromium ${width}×${height} : santé, cloche, résumé, un pays/une devise, groupe de 3, issue privée protégée, clic/reload HTTP200, versions et formulaire sécurisé OK (fixtures isolées)`);
  await context.close();
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try { for (const [width, height] of [[390, 844], [1440, 900]]) await scenario(browser, width, height); }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
