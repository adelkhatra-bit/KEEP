#!/usr/bin/env node
'use strict';

// Export Expo partagé seulement ; aucune application, page ou donnée de production créée.
// Usage : node scripts/event-story-browser.cjs packages/mobile/dist-event-story
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let playwright;
try { playwright = require('@playwright/test'); } catch { playwright = require('playwright'); }
const { chromium } = playwright;
const output = path.resolve('artifacts/dual-viewport/event-story');
const viewerId = '00000000-0000-4000-8000-000000000052';
const organizerId = '00000000-0000-4000-8000-000000000053';
const eventId = '00000000-0000-4000-8000-000000000054';
const posterUrl = 'https://event-fixture.invalid/poster.svg';
const previewUrl = 'https://event-fixture.invalid/preview.wav';
const supabaseHost = 'rrhqsqzcplvmwxizqnla.supabase.co';
const fixtureNow = Date.now();
const iso = offset => new Date(fixtureNow + offset).toISOString();
const profile = {
  id: viewerId, username: 'eventfixture', display_name: 'Event Fixture', bio: '',
  avatar_url: null, kind: 'USER', profile_kind: 'USER', country_code: 'FR', city: 'Lyon',
  favorite_genres: ['house'], music_country_codes: ['FR'], music_language_codes: ['fr'],
  is_public: true, onboarding_completed_at: iso(-86400000), certification_tier: 'FREE',
};
const organizer = { ...profile, id: organizerId, username: 'organizerfixture', display_name: 'Organisateur fixture', kind: 'DJ' };
const event = {
  event_id: eventId, profile_id: organizerId,
  creator_username: organizer.username, creator_avatar_url: null,
  name: 'Nuit fixture House', image_url: posterUrl, starts_at: iso(86400000), ends_at: iso(100800000),
  venue_name: 'Salle fixture Lyon', country_code: 'FR', currency_code: 'EUR',
  ticket_price_cents: null, genres: ['house'], pinned_at: iso(-3600000), my_rsvp: null,
  moderation_status: 'APPROVED', photo_status: 'APPROVED', text_status: 'APPROVED', is_disabled: false,
  viewer_country_code: 'FR', viewer_currency_code: 'EUR',
};
const secondEvent = { ...event, event_id: '00000000-0000-4000-8000-000000000055', name: 'Seconde soirée fixture' };
const excludedEvents = [
  { ...event, event_id: '00000000-0000-4000-8000-000000000056', name: 'Pays incompatible fixture', country_code: 'US' },
  { ...event, event_id: '00000000-0000-4000-8000-000000000057', name: 'Devise incompatible fixture', currency_code: 'USD' },
  { ...event, event_id: '00000000-0000-4000-8000-000000000058', name: 'Modération refusée fixture', moderation_status: 'REJECTED' },
  { ...event, event_id: '00000000-0000-4000-8000-000000000059', name: 'Soirée désactivée fixture', is_disabled: true },
];
const pulseTracks = Array.from({ length: 30 }, (_, index) => ({
  track_id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
  title: `Pulse fixture ${String(index + 1).padStart(2, '0')}`, artist: 'Artiste fixture',
  genres: ['house'], artwork_url: posterUrl, preview_url: previewUrl, provider_ids: {}, external_urls: {},
  available_on: [], relevance_score: 30 - index, is_new: false,
}));
const preview = Buffer.alloc(44 + 8000 * 2 * 8);
preview.write('RIFF', 0); preview.writeUInt32LE(preview.length - 8, 4); preview.write('WAVEfmt ', 8);
preview.writeUInt32LE(16, 16); preview.writeUInt16LE(1, 20); preview.writeUInt16LE(1, 22);
preview.writeUInt32LE(8000, 24); preview.writeUInt32LE(16000, 28);
preview.writeUInt16LE(2, 32); preview.writeUInt16LE(16, 34);
preview.write('data', 36); preview.writeUInt32LE(preview.length - 44, 40);

async function serveExport(directory) {
  const root = fs.realpathSync(path.resolve(directory));
  assert.ok(fs.statSync(path.join(root, 'index.html')).isFile(), 'Export Expo index.html requis');
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /_expo\/static\/js\/web\//,
    'Le navigateur doit charger le bundle Expo exporté, pas un HTML de fixture');
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json' };
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname.replace(/^\/KEEP(?:\/|$)/, '/');
      let file = path.resolve(root, `.${relative}`);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      // Pages publie le même shell exporté sous ces routes, sans second bundle.
      if (/^\/Main(?:\/(?:Listen|Discover|MyMusic|Parties|Profile))?\/?$/.test(relative)) {
        file = path.join(root, 'index.html');
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
      const real = fs.realpathSync(file);
      if (!real.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(400).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}/KEEP/` };
}

function authSession() {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const user = { id: viewerId, aud: 'authenticated', role: 'authenticated', email: 'event-fixture@example.invalid',
    email_confirmed_at: iso(-86400000), created_at: iso(-86400000), is_anonymous: false,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { username: profile.username } };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: viewerId, role: 'authenticated', aud: 'authenticated', exp })}.fixture-only`,
    refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 86400, expires_at: exp, user };
}

async function assertVisible(locator, label, scroll = true) {
  await locator.waitFor({ state: 'visible', timeout: 20000 });
  if (scroll) await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${label} doit être réellement rendu`);
  const viewport = locator.page().viewportSize();
  assert.ok(box.x >= -2 && box.y >= -2 && box.x + box.width <= viewport.width + 2
    && box.y + box.height <= viewport.height + 2, `${label} doit tenir dans le viewport (${JSON.stringify(box)})`);
}

async function assertShell(page) {
  const skipTour = page.getByText('Passer', { exact: true });
  if (await skipTour.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
    await skipTour.click();
    await skipTour.waitFor({ state: 'hidden' });
  }
  await page.getByText('Profil', { exact: true }).last().click();
  await page.getByTestId('profile-story-bar').waitFor({ state: 'visible' });
  for (const tab of ['Loki Music', 'Découvertes', 'Playlists', 'Soirées', 'Profil']) {
    const label = page.getByText(tab, { exact: true }).last();
    await label.waitFor({ state: 'visible' });
    const control = await label.evaluate(element => {
      const rect = element.closest('[role="button"], [role="link"], a, button')?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    });
    const viewport = page.viewportSize();
    assert.ok(control && control.width > 0 && control.height >= 44 && control.x >= -2
      && control.x + control.width <= viewport.width + 2 && control.y >= viewport.height * 0.7
      && control.y + control.height <= viewport.height + 2, `Action onglet ${tab} visible et utilisable (${JSON.stringify(control)})`);
  }
  const dimensions = await page.evaluate(() => ({
    root: document.getElementById('root')?.getBoundingClientRect().height || 0,
    viewport: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 2,
  }));
  assert.ok(dimensions.root >= dimensions.viewport * 0.9, 'Pas de page noire / root écrasé');
  assert.equal(dimensions.overflow, false, 'Pas de débordement horizontal');
}

async function scenario(browser, base, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'fr-FR',
    timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  const session = authSession();
  const state = { rsvps: [], writes: [], requests: [], unexpected: [], storyReads: 0, marketReads: 0, engagements: new Set() };
  await context.addInitScript(({ session, host }) => {
    localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`, JSON.stringify(session));
  }, { session, host: supabaseHost });
  await context.routeWebSocket('**/*', socket => socket.close());
  const intercept = async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin === new URL(base).origin) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*',
        'content-range': Array.isArray(body) ? (body.length ? `0-${body.length - 1}/${body.length}` : '*/0') : '0-0/1' },
      body: JSON.stringify(body) });
    if (target.href === posterUrl) return route.fulfill({ status: 200, contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#4430a8"/><text x="40" y="150" fill="white" font-size="48">NUIT FIXTURE</text></svg>' });
    if (target.href === previewUrl) return route.fulfill({ status: 200, contentType: 'audio/wav', body: preview });
    if (target.hostname !== supabaseHost) return route.abort();
    state.requests.push({ path: target.pathname, method: request.method() });
    if (request.method() === 'OPTIONS') return json({});
    if (target.pathname === '/auth/v1/user') return json(session.user);
    if (target.pathname.startsWith('/auth/v1/')) return json(session);
    if (target.pathname.startsWith('/functions/v1/')) return json({ ok: true });
    const resource = target.pathname.split('/').pop();
    if (resource === 'profiles') {
      const filter = target.searchParams.get('id') || '';
      const rows = filter.includes(organizerId) ? [organizer] : [profile];
      return json(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] : rows);
    }
    if (resource === 'profile_private_info') {
      const privateInfo = { profile_id: viewerId, birth_date: '1990-01-01', gender: 'PREFER_NOT_TO_SAY' };
      return json(request.headers().accept?.includes('vnd.pgrst.object') ? privateInfo : [privateInfo]);
    }
    if (resource === 'keep_pulse_preferences_state') return json({
      completed: true, should_prompt: false, favorite_genres: ['house'],
      language_codes: ['fr'], country_codes: ['FR'], version: 1,
    });
    if (resource === 'countries') {
      if (target.searchParams.has('code')) {
        assert.equal(target.searchParams.get('code'), 'eq.FR', 'Marché lu pour le pays réel du spectateur');
        state.marketReads += 1;
      }
      const country = { code: 'FR', default_currency_code: 'EUR' };
      return json(request.headers().accept?.includes('vnd.pgrst.object') ? country : [country]);
    }
    if (resource === 'event_rsvps') {
      if (request.method() === 'GET') {
        return json(request.headers().accept?.includes('vnd.pgrst.object') ? state.rsvps[0] || null : state.rsvps);
      }
      if (['POST', 'PATCH'].includes(request.method())) {
        const payload = request.postDataJSON();
        const row = Array.isArray(payload) ? payload[0] : payload;
        assert.equal(row.event_id, eventId, 'RSVP vise la soirée affichée');
        assert.equal(row.profile_id, viewerId, 'RSVP appartient au spectateur authentifié');
        assert.equal(row.status, 'GOING', 'J’Y VAIS persiste GOING');
        state.writes.push(row);
        state.rsvps = [{ ...row, created_at: iso(0) }];
        return json(request.headers().accept?.includes('vnd.pgrst.object') ? state.rsvps[0] : state.rsvps);
      }
      state.unexpected.push(`${request.method()} event_rsvps`);
      return json({ message: 'Écriture inattendue' }, 400);
    }
    if (resource === 'keep_story_events') {
      const args = request.postDataJSON();
      assert.ok(Array.isArray(args.p_profile_ids), 'RPC story utilise les profils liés');
      if (!args.p_profile_ids.includes(organizerId)) return json([]);
      state.storyReads += 1;
      return json([{ ...event, my_rsvp: state.rsvps[0]?.status || null }]);
    }
    if (resource === 'keep_pulse_events') {
      assert.ok(request.postDataJSON().p_limit > 0, 'RPC Pulse bornée');
      return json([...excludedEvents, event, secondEvent].map(row => ({
        ...row, pinned_at: null, my_rsvp: row.event_id === eventId ? state.rsvps[0]?.status || null : null,
      })));
    }
    if (resource === 'keep_record_event_engagement') {
      const args = request.postDataJSON();
      assert.ok([eventId, secondEvent.event_id].includes(args.p_event_id), 'Engagement sur soirée admissible');
      assert.ok(['view', 'share'].includes(args.p_action), 'Action d’engagement canonique');
      const key = `${args.p_event_id}:${args.p_action}`;
      const inserted = !state.engagements.has(key);
      state.engagements.add(key);
      return json(inserted);
    }
    if (resource === 'keep_loki_pulse') return json(pulseTracks);
    if (resource === 'keep_own_profile_snapshot') return json([{ direct_keeps: 0, social_keeps: 0, total_keeps: 0, public_keeps: 0, private_keeps: 0 }]);
    if (resource === 'keep_battle_credit_status') return json([{ balance: 50, available: 50, plan_code: 'FREE' }]);
    if (resource === 'follows') return json([{ follower_id: viewerId, followee_id: organizerId, created_at: iso(-86400000) }]);
    return json([]);
  };
  await context.route('**/*', async route => {
    try { await intercept(route); }
    catch (error) {
      state.unexpected.push(error.message);
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ message: 'Contrat fixture invalide' }) }).catch(() => {});
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(response.status(), 200, 'Export servi HTTP 200');
    await assertShell(page);
    await page.getByText('Profil', { exact: true }).last().click();
    const story = page.getByTestId(`home-story-${organizerId}`);
    await assertVisible(story, 'Bulle de story de l’organisateur');
    await story.click();
    const storyCard = page.getByTestId(`event-discovery-${eventId}`);
    await assertVisible(storyCard, 'Carte soirée dans le lecteur de story existant');
    await assertVisible(storyCard.getByText(event.name, { exact: true }), 'Nom de soirée');
    await assertVisible(storyCard.getByText(`${event.venue_name} · FR`, { exact: true }), 'Lieu et pays de soirée');
    const date = new Date(event.starts_at).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    await assertVisible(storyCard.getByText(date, { exact: true }), 'Date de soirée');
    const poster = storyCard.getByLabel(`Affiche : ${event.name}`);
    await assertVisible(poster, 'Affiche soirée');
    assert.ok(await poster.evaluate(element => {
      const image = element instanceof HTMLImageElement ? element : element.querySelector('img');
      return Boolean(image?.complete && image.naturalWidth > 0);
    }), 'Affiche vraiment chargée, pas une boîte vide');
    const going = page.getByTestId(`event-going-${eventId}`);
    await assertVisible(going, 'J’Y VAIS');
    await page.screenshot({ path: path.join(output, `${width}x${height}-story.png`) });
    await going.click();
    await going.getByText('✓ J’Y VAIS · ENREGISTRÉ', { exact: true }).waitFor();
    assert.equal(state.writes.length, 1, 'Un clic enregistre exactement un RSVP existant');
    assert.equal(state.rsvps[0].status, 'GOING');
    const readsBeforeReload = state.storyReads;
    console.log(`${width}x${height}: reload ${new URL(page.url()).pathname}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertShell(page);
    await page.getByText('Profil', { exact: true }).last().click();
    await story.waitFor({ state: 'visible' });
    await story.click();
    await going.getByText('✓ J’Y VAIS · ENREGISTRÉ', { exact: true }).waitFor();
    assert.ok(state.storyReads > readsBeforeReload, 'Reload relit le RSVP persisté du serveur de fixture');
    assert.equal(state.writes.length, 1, 'Reload ne recrée aucune participation');
    assert.equal(await going.getAttribute('aria-disabled'), 'true', 'Participation déjà enregistrée non duplicable');
    await page.screenshot({ path: path.join(output, `${width}x${height}-reload.png`) });
    await page.getByLabel('Fermer le swipe', { exact: true }).click();
    const pulse = page.getByTestId('profile-loki-pulse-track-bubbles');
    await pulse.scrollIntoViewIfNeeded();
    await pulse.getByLabel('Écouter Pulse fixture 01 dans Loki Pulse', { exact: true }).click();
    const reader = page.getByRole('dialog').last();
    const currentMusic = () => reader.getByText(/^Pulse fixture \d{2}$/, { exact: true }).last();
    await currentMusic().waitFor({ state: 'visible' });
    const observed = new Set();
    for (let index = 1; index <= 20; index += 1) {
      const current = currentMusic();
      await assertVisible(current, `Musique Pulse ${index}`);
      const title = await current.innerText();
      assert.match(title, /^Pulse fixture \d{2}$/, 'La cadence part des vraies musiques du lecteur');
      assert.ok(!observed.has(title), 'Musique distincte avant quota soirée');
      observed.add(title);
      assert.equal(await page.locator('[data-testid^="event-discovery-"]').count(), 0, 'Pas de publicité soirée avant quota');
      // Le contrat crédite une musique seulement après 2 s réellement affichées.
      await page.waitForTimeout(2150);
      await page.getByLabel('Passer cette musique', { exact: true }).click();
      if (index % 10 === 0) {
        const expectedEvent = index === 10 ? event : secondEvent;
        const card = page.getByTestId(`event-discovery-${expectedEvent.event_id}`);
        await assertVisible(card, `Carte Pulse après ${index} musiques vues`);
        await assertVisible(card.getByText(expectedEvent.name, { exact: true }), 'Soirée Pulse admissible');
        assert.equal(await page.locator('[data-testid^="event-discovery-"]').count(), 1, 'Une seule carte par quota de dix');
        await assertVisible(card.getByText(`${event.venue_name} · FR`, { exact: true }), 'Même pays');
        for (const excluded of excludedEvents) {
          assert.equal(await page.getByTestId(`event-discovery-${excluded.event_id}`).count(), 0, `${excluded.name} exclue`);
        }
        await page.waitForTimeout(2150);
        await page.screenshot({ path: path.join(output, `${width}x${height}-pulse-${index}.png`) });
        await card.getByLabel('Passer à la carte suivante', { exact: true }).click();
      } else {
        await reader.getByText(title, { exact: true }).waitFor({ state: 'detached' });
        assert.equal(await page.locator('[data-testid^="event-discovery-"]').count(), 0, 'Aucune soirée intermédiaire');
      }
    }
    assert.equal(observed.size, 20, 'Deux quotas gagnés par vingt musiques distinctes');
    assert.deepEqual(state.unexpected, []);
    assert.deepEqual(errors, [], 'Aucune erreur navigateur ou page blanche');
    assert.ok(state.requests.some(row => row.path.endsWith('/keep_pulse_events')), 'Vraie intégration RPC Pulse appelée');
    assert.ok(state.engagements.has(`${eventId}:view`), 'Vue soirée persistée après présence réelle');
    const summary = `${width}x${height}: story affiche/date/lieu, event_rsvps GOING + reload, Pulse deux cartes/20 musiques, pays/devise/modération filtrés — fixtures isolées`;
    fs.writeFileSync(path.join(output, `${width}x${height}.txt`), summary + '\n');
    console.log(summary);
  } finally {
    const tabs = await page.evaluate(() => ['Loki Music', 'Découvertes', 'Playlists', 'Soirées', 'Profil'].map(label => {
      const candidates = [...document.querySelectorAll('div,span,a,button')].filter(element => element.textContent === label);
      const element = candidates.at(-1);
      const box = element?.getBoundingClientRect();
      return { label, x: box?.x, y: box?.y, width: box?.width, height: box?.height };
    })).catch(() => []);
    console.log(`${width}x${height}: diagnostic onglets ${JSON.stringify(tabs)}`);
    const cards = await page.locator('[data-testid^="event-discovery-"]').evaluateAll(elements =>
      elements.map(element => element.getAttribute('data-testid'))).catch(() => []);
    console.log(`${width}x${height}: cartes soirée rendues ${JSON.stringify(cards)}`);
    await page.screenshot({ path: path.join(output, `${width}x${height}-final.png`), fullPage: true }).catch(() => {});
    await context.close();
  }
}

(async () => {
  const directory = process.argv[2];
  assert.ok(directory && !/^https?:/i.test(directory), 'Fournir un dossier export Expo réel, jamais une URL de production');
  fs.mkdirSync(output, { recursive: true });
  const { server, base } = await serveExport(directory);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.KEEP_CHROMIUM_EXECUTABLE || undefined });
    const failures = [];
    let passed = 0;
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      try { await scenario(browser, base, width, height); passed += 1; }
      catch (error) { failures.push(`${width}x${height}: ${error.message}`); }
    }
    const summary = `Scénarios : 2 ; réussis : ${passed} ; échoués : ${failures.length} ; ignorés : 0`;
    fs.writeFileSync(path.join(output, 'results.txt'), [summary, ...failures].join('\n') + '\n');
    console.log(summary);
    assert.equal(failures.length, 0, failures.join('\n'));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
