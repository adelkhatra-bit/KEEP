#!/usr/bin/env node
'use strict';

// Test du runtime partagé avec une session et un transport isolés.
// Ce test ne constitue pas une preuve d'import sur un compte de production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const artifacts = process.env.KEEP_MUSIC_LINK_ARTIFACTS || path.join(os.tmpdir(), 'keep-music-link-browser');
fs.mkdirSync(artifacts, { recursive: true });
const base = process.argv[2] || 'http://127.0.0.1:8081';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(base)) {
  throw new Error('Le test isolé doit viser uniquement le runtime local.');
}
const id = '00000000-0000-4000-8000-000000000048';
const trackId = '00000000-0000-4000-8000-000000000049';
const source = 'https://youtu.be/loki-test-48';
const links = {
  youtube: source,
  spotify: 'https://open.spotify.com/track/loki-test-48',
  appleMusic: 'https://music.apple.com/fr/album/loki-test-48/48',
  deezer: 'https://www.deezer.com/track/48',
};
const track = { id: trackId, title: 'Titre partagé CI', artist: 'Artiste CI', genres: ['Pop'], platformLinks: links };
const profile = {
  id, username: 'music-link-ci', display_name: 'Music Link CI', bio: '', avatar_url: null,
  country_code: 'FR', city: 'Paris', favorite_genres: ['Pop'],
  onboarding_completed_at: new Date().toISOString(), is_public: true,
};
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function run(width, browser) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  let imports = 0;
  let previews = 0;
  let library = [];
  const errors = [];
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const user = {
    id, aud: 'authenticated', role: 'authenticated', is_anonymous: false,
    email: 'music-link-ci@loki.test', email_confirmed_at: new Date().toISOString(),
    app_metadata: {}, user_metadata: { username: profile.username }, created_at: new Date().toISOString(),
  };
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', aud: 'authenticated', exp })}.fixture`,
    refresh_token: 'isolated-browser-fixture', token_type: 'bearer', expires_in: 86400, expires_at: exp, user,
  };
  await context.addInitScript((value) => {
    localStorage.setItem('sb-rrhqsqzcplvmwxizqnla-auth-token', JSON.stringify(value));
  }, session);
  await context.route('https://rrhqsqzcplvmwxizqnla.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path === '/auth/v1/user') data = user;
    else if (path === '/rest/v1/profiles') data = [profile];
    else if (path === '/rest/v1/music_library_items') data = library;
    else if (path === '/functions/v1/keep-resolve-music-link') {
      const body = route.request().postDataJSON();
      assert.equal(body.url, source);
      if (body.preview) {
        previews += 1;
        assert.equal(imports, 0, 'L’aperçu ne doit pas importer.');
        data = { track };
      } else {
        imports += 1;
        library = [{
          id: trackId, profile_id: id, track_id: trackId, provider: 'youtube',
          provider_track_id: 'loki-test-48', source_kind: 'shared_link',
          title: track.title, artist: track.artist, metadata: { platformLinks: links },
        }];
        data = { track, imported: true };
      }
    } else if (path === '/rest/v1/rpc/keep_my_music_stats') {
      data = { genres: [{ name: 'Pop', score: imports * 2 }], artists: [{ name: 'Artiste CI', score: imports * 2 }], hearts: 3, dislikes: 1, keeps: 4, imported: { youtube: imports } };
    } else if (path.startsWith('/functions/v1/')) data = { ok: true };
    else if (path.startsWith('/auth/v1/')) data = {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  // Les éventuels endpoints secondaires du backend ne touchent aucune base.
  await context.route('http://127.0.0.1:3010/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response?.ok(), 'Le bundle doit se charger.');
    await page.getByText('Profil', { exact: true }).last().click({ timeout: 30000 });
    const add = page.getByTestId('shared-music-add-link');
    await add.waitFor({ state: 'visible', timeout: 30000 });
    await page.evaluate((url) => navigator.clipboard.writeText(url), source);
    await add.click();
    const preview = page.getByTestId('shared-music-preview');
    await preview.getByText(track.title, { exact: true }).waitFor({ state: 'visible' });
    assert.equal(previews, 1);
    assert.equal(imports, 0);
    assert.equal(await preview.locator('input,textarea').count(), 0, 'Aucun clavier pour l’import.');
    await page.getByTestId('shared-music-confirm').click();
    const item = page.getByTestId('shared-music-library-item');
    await item.getByText(track.title, { exact: true }).waitFor({ state: 'visible' });
    assert.equal(imports, 1);
    for (const key of Object.keys(links)) assert.equal(await item.getByTestId(`shared-music-open-${key}`).count(), 1);
    await page.getByTestId('my-music-style-open').click();
    const stats = page.getByTestId('my-music-stats');
    await stats.getByText('Pop · 2', { exact: true }).waitFor({ state: 'visible' });
    await stats.getByText('Artiste CI · 2', { exact: true }).waitFor({ state: 'visible' });
    await stats.getByText('YouTube · 1', { exact: true }).waitFor({ state: 'visible' });
    await stats.getByText('GARDER · 4', { exact: true }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifacts, `music-link-style-${width}.png`), fullPage: true });
    const dimensions = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      rootHeight: document.getElementById('root').getBoundingClientRect().height, height: innerHeight,
    }));
    assert.ok(dimensions.scrollWidth <= dimensions.width + 1, 'Aucun débordement horizontal.');
    assert.ok(dimensions.rootHeight >= dimensions.height * 0.9, 'Aucune page blanche sur ordinateur.');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Profil', { exact: true }).last().click({ timeout: 30000 });
    await page.getByTestId('shared-music-library-item').getByText(track.title, { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(imports, 1, 'Le reload ne réimporte pas le titre.');
    assert.deepEqual(errors, [], 'Aucune erreur JavaScript.');
    console.log(`PASS ${width}px : presse-papiers → aperçu → profil → Mon style → reload (transport isolé, hors production).`);
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, `music-link-failure-${width}.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1440]) await run(width, browser);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
