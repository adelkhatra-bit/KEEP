'use strict';
// Même export et fixtures isolées que admin-release-evidence-browser.cjs.
// KEEP_ADMIN_TEST_URL=http://127.0.0.1:3090/KEEP/admin-preview
// KEEP_ADMIN_SCREENSHOTS=/tmp/keep-admin-evidence NODE_PATH=<Playwright> node scripts/admin-navigation-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox, webkit, devices } = require('playwright');
const engine = process.env.KEEP_ADMIN_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[engine];
assert.ok(browserType, 'Moteur Chromium, Firefox ou WebKit requis');
const navigation = require('../packages/admin/lib/adminNavigation.json');
const base = (process.env.KEEP_ADMIN_TEST_URL || 'http://127.0.0.1:3090/KEEP/admin-preview').replace(/\/+$/, '');
const local = new URL(base);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(local.hostname), 'Loopback uniquement');
assert.equal(local.pathname, '/KEEP/admin-preview');
assert.equal(local.search + local.hash, '');
const screenshots = process.env.KEEP_ADMIN_SCREENSHOTS;
const overview = {
  catalog: { total: 1234, added24h: 24, added7d: 168 },
  queue: { pending: 12, processing: 2 },
  styles: [{ key: 'rock', label: 'Rock', profiles: 42, score: 100 }],
  discoverers: [{ id: 'fixture', username: 'découvreur', tracks: 18 }],
  platforms: [{ provider: 'spotify', items: 150 }],
  pulse: { pairs: 100, repeated: 25, repeatPercent: 25 },
  pulseLatencyMs: 18.5, observedAt: '2026-10-08T10:00:00Z',
};

async function scenario(browser, width, height, role = 'SUPER_ADMIN') {
  const device = width < 900 && engine !== 'firefox'
    ? devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 7'] : {};
  const context = await browser.newContext({ ...device, viewport: { width, height }, deviceScaleFactor: 1 });
  const id = '00000000-0000-0000-0000-000000000001';
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from('{"alg":"none"}').toString('base64url'),
    Buffer.from(JSON.stringify({ exp, sub: id })).toString('base64url'), 'fixture'].join('.');
  await context.addInitScript(({ token, exp, id }) => {
    localStorage.setItem('keep-superadmin-auth-v1', JSON.stringify({
      access_token: token, refresh_token: 'fixture-only', token_type: 'bearer', expires_at: exp, expires_in: 3600,
      user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {} },
    }));
  }, { token, exp, id });
  let unavailable = false;
  let empty = false;
  let malformed = false;
  const mutations = [];
  await context.routeWebSocket('wss://fixture.invalid/**', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin === local.origin) return route.continue();
    const json = (data, status = 200) => route.fulfill({
      status, contentType: 'application/json', headers: {
        'access-control-allow-origin': local.origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': request.headers()['access-control-request-headers'] || Object.keys(request.headers()).join(', '),
        'access-control-allow-credentials': 'true',
      }, body: JSON.stringify(data),
    });
    if (target.hostname !== 'fixture.invalid') return route.abort();
    if (request.method() === 'OPTIONS') return json({});
    const rpc = target.pathname.split('/').pop();
    if (['PATCH', 'PUT', 'DELETE'].includes(request.method()) || rpc === 'keep_loki_pulse') mutations.push(target.pathname);
    if (rpc === 'get_my_admin_role') return json(role);
    if (rpc === 'admin_dashboard_stats') return json({
      from: '2026-10-01', to: '2026-10-08', country: 'FR',
      usersTotal: 10, newUsers: 2, verifiedEmails: 10, activePaid: 1,
      keeps: 0, follows: 0, shares: 0, eventsCreated: 0,
      dailySignups: [], planMix: [], sharesByChannel: [], countryMix: [],
    });
    if (rpc === 'admin_finance_report') return json({
      revenueByCurrency: [], refundsByCurrency: [], costsByCurrency: [],
      recentTransactions: [], recentCosts: [],
    });
    if (rpc === 'admin_problem_report_overview') return json({
      open_count: 12, fixed_count: 0, documented_count: 0, fixes_limit: 100, latest_app: null, fixes: [],
    });
    if (rpc === 'admin_music_overview') return unavailable ? json({ message: 'fixture indisponible' }, 503)
      : json(malformed ? {} : empty ? { ...overview, catalog: { total: 0, added24h: 0, added7d: 0 },
        queue: { pending: 0, processing: 0 }, styles: [], discoverers: [], platforms: [],
        pulse: { pairs: 0, repeated: 0, repeatPercent: null }, pulseLatencyMs: null } : overview);
    if (['admin_pending_support_count', 'admin_event_pending_count'].includes(rpc)) return json(0);
    if (target.pathname.includes('/functions/v1/')) return json({ ok: true, data: [], minimumConfidence: 0.72 });
    return json([]);
  });
  const page = await context.newPage();
  const errors = [];
  const broken = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  page.on('response', response => {
    if (new URL(response.url()).origin === local.origin && response.status() >= 400) broken.push(response.url());
  });
  await page.goto(`${base}/music/`);
  await page.waitForURL(`${base}/musique/?tab=music`);
  const music = page.getByRole('region', { name: 'Statistiques musicales' });
  if (role !== 'SUPER_ADMIN') {
    await page.getByText('Accès limité', { exact: true }).waitFor();
    const menu = page.getByRole('navigation', { name: 'Rubriques', exact: true });
    await page.getByRole('button', { name: 'Afficher le menu Super Admin' }).click();
    assert.equal(await menu.getByRole('link').count(), 3, 'FINANCE : Accueil, Musique, Argent');
    await menu.getByRole('link', { name: 'Musique', exact: true }).click();
    await page.waitForURL(`${base}/musique/?tab=marketplace`);
    await page.getByRole('navigation', { name: 'Onglets Musique' }).getByRole('link', { name: 'Ventes', exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Onglets Musique' }).getByRole('link').count(), 1);
    assert.equal(await page.getByText('Accès limité', { exact: true }).count(), 0);
    await page.goto(`${base}/musique/?fixture=bare#anchor`);
    await page.waitForURL(`${base}/musique/?fixture=bare&tab=marketplace#anchor`);
    await page.getByRole('navigation', { name: 'Onglets Musique' }).getByRole('link', { name: 'Ventes', exact: true }).waitFor();
    assert.equal(await page.getByText('Accès limité', { exact: true }).count(), 0, 'Rubrique directe choisit un onglet autorisé');
    await context.close();
    return;
  }
  await music.getByText('1 234', { exact: true }).waitFor();
  const menu = page.getByRole('navigation', { name: 'Rubriques', exact: true });
  if (width < 1180) await page.getByRole('button', { name: 'Afficher le menu Super Admin' }).click();
  assert.deepEqual(await menu.getByRole('link').allTextContents(), navigation.map(g => g.title));
  for (const link of await menu.getByRole('link').all()) assert.equal(await link.isVisible(), true);
  if (screenshots) {
    fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, `admin-${width}.png`) });
  }
  if (width < 900) await menu.getByRole('link', { name: 'Musique', exact: true }).click();
  if (screenshots) await page.screenshot({ path: path.join(screenshots, `admin-music-${width}.png`) });
  await music.getByRole('button', { name: 'Explication : Pulse', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /sans|Aucun appel de Pulse/);
  await page.getByRole('button', { name: 'Compris', exact: true }).click();
  const fits = async () => {
    if (new URL(page.url()).searchParams.get('tab') === 'operations') {
      const evidence = page.getByRole('region', { name: 'Versions et preuves' });
      await evidence.getByText('12', { exact: true }).waitFor();
      await evidence.getByRole('button', { name: 'Actualiser', exact: true }).waitFor();
    }
    assert.equal(await page.evaluate(() => {
      const main = document.querySelector('.main');
      return document.documentElement.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight
        && main.scrollWidth <= main.clientWidth && main.clientHeight > 100;
    }), true, `Pas de débordement : ${page.url()} / ${width}`);
  };
  await fits();
  empty = true;
  await music.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await music.getByText('Aucun', { exact: true }).first().waitFor();
  assert.match(await music.innerText(), /Titres\s*0/);
  assert.match(await music.innerText(), /Temps\s*Indisponible/);
  unavailable = true;
  await music.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await music.getByRole('alert').waitFor();
  assert.match(await music.innerText(), /Titres\s*Indisponible/);
  assert.equal(await music.getByText('0', { exact: true }).count(), 0);
  unavailable = false; empty = false;
  malformed = true;
  await music.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await music.getByRole('alert').waitFor();
  assert.match(await music.innerText(), /Titres\s*Indisponible/);
  malformed = false;
  for (const group of navigation) {
    for (const item of group.items) {
      const oldPath = item.href === '/' ? '/' : `${item.href}/`;
      const response = await page.goto(`${base}${oldPath}?fixture=preserved#anchor`);
      assert.equal(response.status(), 200, `Ancienne route ${item.href}`);
      const tab = item.href === '/' ? 'index' : item.href.slice(1);
      await page.waitForURL(url => url.pathname === `${local.pathname}/${group.slug}/` && url.searchParams.get('tab') === tab);
      const current = new URL(page.url());
      assert.equal(current.searchParams.get('fixture'), 'preserved');
      assert.equal(current.hash, '#anchor');
      const tabs = page.getByRole('navigation', { name: `Onglets ${group.title}`, exact: true });
      await tabs.getByRole('link', { name: item.label, exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await tabs.getByRole('link').count(), group.items.length);
      assert.equal(await tabs.locator('[aria-current="page"]').innerText(), item.label);
      await fits();
      await page.reload();
      await tabs.locator('[aria-current="page"]').waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await tabs.locator('[aria-current="page"]').innerText(), item.label);
      for (const sibling of item === group.items[0] ? group.items : []) {
        await tabs.getByRole('link', { name: sibling.label, exact: true }).click();
        await page.waitForURL(url => url.searchParams.get('tab') === (sibling.href === '/' ? 'index' : sibling.href.slice(1)));
        await page.waitForFunction(label => document.querySelector('.admin-tabs [aria-current="page"]')?.textContent === label, sibling.label);
        await fits();
        await page.waitForLoadState('networkidle');
      }
    }
  }
  await page.goto(`${base}/argent/?tab=team`);
  await page.getByText('Accès limité', { exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation', { name: 'Onglets Utilisateurs' }).count(), 0);
  assert.deepEqual(mutations, [], 'Aucune écriture hors RPC par navigation');
  assert.deepEqual(errors, [], 'Aucune erreur JavaScript');
  assert.deepEqual(broken, [], 'Aucune route ni asset cassé');
  console.log(`PASS ${engine} ${width}×${height} : 8 rubriques, 20 pages, anciens liens/reload/onglets, états et dimensions`);
  await context.close();
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  try {
    await scenario(browser, 390, 844);
    await scenario(browser, 1440, 900);
    await scenario(browser, 390, 844, 'FINANCE');
    const signedOut = await browser.newContext({ viewport: { width: 390, height: 400 } });
    const page = await signedOut.newPage();
    await page.goto(`${base}/`);
    await page.getByRole('button', { name: 'MOT DE PASSE OUBLIÉ ?', exact: true }).click();
    await page.getByRole('button', { name: 'SE CONNECTER', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => {
      const main = document.querySelector('main');
      return main.scrollHeight > main.clientHeight && main.scrollTop > 0 && document.body.scrollHeight <= innerHeight;
    }), true, 'Connexion et récupération défilent dans leur fenêtre sur petit écran');
    assert.equal(await page.getByRole('button', { name: 'SE CONNECTER', exact: true }).isVisible(), true);
    await signedOut.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
