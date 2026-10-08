'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { chromium } = require('playwright');
const base = (process.env.KEEP_ADMIN_TEST_URL || 'http://127.0.0.1:3090/KEEP/admin-preview').replace(/\/+$/, '');
const target = new URL(base);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Fixtures sur loopback seulement');
assert.equal(target.pathname, '/KEEP/admin-preview');
const screenshots = process.env.KEEP_ADMIN_SCREENSHOTS || '/tmp/keep-admin-keys-captures';

async function scenario(browser, width, height, pem) {
  const context = await browser.newContext({ viewport: { width, height } });
  const id = '00000000-0000-4000-8000-000000000001';
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from('{"alg":"none"}').toString('base64url'), Buffer.from(JSON.stringify({ exp, sub: id })).toString('base64url'), 'fixture'].join('.');
  await context.addInitScript(({ token, exp, id }) => localStorage.setItem('keep-superadmin-auth-v1', JSON.stringify({
    access_token: token, refresh_token: 'fixture-only', token_type: 'bearer', expires_at: exp, expires_in: 3600,
    user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {} },
  })), { token, exp, id });
  const row = (key, configured = false, hint = null) => ({ key, category: key.startsWith('APPLE_IAP') ? 'payments' : 'music', label: key, secret: key.endsWith('PRIVATE_KEY'), configured, hint });
  const rows = [
    row('APPLE_MUSICKIT_PRIVATE_KEY'), row('APPLE_MUSICKIT_KEY_ID'), row('APPLE_MUSICKIT_TEAM_ID', true),
    row('YOUTUBE_API_KEY', true), row('GOOGLE_TRANSLATE_API_KEY', true),
    row('SPOTIFY_CLIENT_ID'), row('SPOTIFY_CLIENT_SECRET'),
    row('APPLE_IAP_PRIVATE_KEY'), row('DEEZER_APP_ID'), row('STRIPE_SECRET_KEY'), row('RESEND_API_KEY'),
  ];
  let checks = 0;
  const saves = [];
  let testUnavailable = false;
  await context.routeWebSocket('wss://fixture.invalid/**', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === target.origin) return route.continue();
    if (url.hostname !== 'fixture.invalid') return route.abort();
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
    if (request.method() === 'OPTIONS') return json({});
    const rpc = url.pathname.split('/').pop();
    if (rpc === 'get_my_admin_role') return json('SUPER_ADMIN');
    if (rpc === 'admin_integration_runtime_status') return json([]);
    if (rpc === 'keep-admin-control') {
      const body = request.postDataJSON();
      if (body.action === 'integrations.list') return json({ data: rows });
      if (body.action === 'integrations.test') {
        checks += 1;
        if (testUnavailable) return json({ error: 'fixture indisponible' }, 503);
        return json({ data: rows.map((item) => ({
          key: item.key, status: item.configured ? 'ACTIVE' : 'NOT_CONFIGURED',
          last_checked_at: new Date().toISOString(), last_error: item.configured ? null : 'Valeur manquante',
        })) });
      }
      if (body.action === 'integrations.set') {
        saves.push(body);
        const saved = rows.find((item) => item.key === body.key);
        saved.configured = true;
        saved.updatedAt = new Date().toISOString();
        if (body.fileName) {
          assert.equal(body.fileName, 'AuthKey_MWL46J72TM.p8');
          assert.equal(body.keyId, 'MWL46J72TM');
          saved.hint = 'Clé MWL46J72TM';
          rows.find((item) => item.key === 'APPLE_MUSICKIT_KEY_ID').configured = true;
        }
        return json({ ok: true });
      }
    }
    if (['admin_pending_support_count', 'admin_event_pending_count'].includes(rpc)) return json(0);
    return json([]);
  });
  const page = await context.newPage();
  const errors = [];
  const httpErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).origin === target.origin && response.status() >= 400) httpErrors.push(response.status());
  });
  assert.equal((await page.goto(`${base}/integrations/`)).status(), 200);
  await page.getByText('À corriger maintenant', { exact: false }).waitFor();
  assert.equal(checks, 1, 'Test automatique une seule fois à l’ouverture');
  assert.doesNotMatch(await page.locator('main').innerText(), /À tester/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const optional = page.locator('details').filter({ has: page.getByText('Optionnel / plus tard', { exact: true }) });
  assert.equal(await optional.getAttribute('open'), null);
  assert.equal(await page.locator('#integration-DEEZER_APP_ID').isVisible(), false);
  await optional.locator('summary').click();
  await page.locator('#integration-APPLE_IAP_PRIVATE_KEY').getByRole('button', { name: '📂 Choisir le fichier .p8', exact: true }).waitFor();
  await page.locator('#p8-APPLE_IAP_PRIVATE_KEY').setInputFiles({ name: 'AuthKey_MWL46J72TM.p8', mimeType: 'application/octet-stream', buffer: Buffer.from(pem) });
  await page.locator('#integration-APPLE_IAP_PRIVATE_KEY').getByText('Mauvais type de clé Apple.', { exact: false }).waitFor();
  await optional.locator('summary').click();
  const apple = page.locator('#integration-APPLE_MUSICKIT_PRIVATE_KEY');
  await apple.scrollIntoViewIfNeeded();
  await page.locator('#p8-APPLE_MUSICKIT_PRIVATE_KEY').setInputFiles({ name: 'AuthKey_MWL46J72TM.txt', mimeType: 'text/plain', buffer: Buffer.from(pem) });
  await apple.getByText('Choisis un fichier .p8.', { exact: false }).waitFor();
  // Même chemin que le bouton fichier, via un vrai événement de glisser-déposer.
  await apple.locator('textarea').evaluate((element, pem) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([pem], 'AuthKey_MWL46J72TM.p8', { type: 'application/octet-stream' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, pem);
  await apple.getByText('Clé MWL46J72TM', { exact: true }).waitFor();
  const keyId = page.locator('#integration-APPLE_MUSICKIT_KEY_ID input');
  assert.equal(await keyId.inputValue(), 'MWL46J72TM');
  await keyId.fill('AAAAAAAAAA');
  await apple.getByRole('alert').waitFor();
  await apple.getByRole('button', { name: 'TESTER + ENREGISTRER', exact: true }).click();
  assert.equal(saves.length, 0, 'Mismatch bloque la sauvegarde');
  await keyId.fill('MWL46J72TM');
  await apple.getByRole('button', { name: 'TESTER + ENREGISTRER', exact: true }).click();
  await apple.getByRole('button', { name: 'TESTER + REMPLACER', exact: true }).waitFor();
  assert.equal(saves.length, 1);
  assert.equal(checks, 2, 'Contrôle automatique après sauvegarde');
  assert.equal(await apple.locator('textarea').inputValue(), '', 'PEM retiré du formulaire après sauvegarde');
  assert.equal(await apple.locator('textarea').getAttribute('rows'), '3');
  await apple.scrollIntoViewIfNeeded();
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, `cles-${width}x${height}.png`) });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal((await page.reload()).status(), 200);
  await apple.getByText('Clé MWL46J72TM', { exact: true }).waitFor();
  assert.equal(checks, 3, 'Rechargement déclenche un nouveau contrôle');
  testUnavailable = true;
  await page.getByRole('button', { name: 'Actualiser les statuts', exact: true }).click();
  await apple.getByText('❌ Refusée', { exact: true }).waitFor();
  assert.doesNotMatch(await apple.innerText(), /✅ OK/);
  assert.deepEqual(errors, []);
  assert.deepEqual(httpErrors, []);
  console.log(`Clés Chromium ${width}×${height} : ouverture/reload HTTP200, import/drop, mismatch, test après sauvegarde, panne explicite, aucun débordement (fixtures, pas test fournisseur réel)`);
  await context.close();
}
(async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const bytes = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(bytes).toString('base64')}\n-----END PRIVATE KEY-----`;
  const browser = await chromium.launch({ headless: true });
  try { for (const [width, height] of [[390, 844], [1440, 900]]) await scenario(browser, width, height, pem); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
