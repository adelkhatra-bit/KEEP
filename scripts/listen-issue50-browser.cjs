#!/usr/bin/env node
// Tests du vrai export Expo, avec micro et serveur simulés : aucune écriture réelle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(base)) {
  throw new Error('Ce test accepte uniquement un export local isolé.');
}
const out = process.env.KEEP_LISTEN_EVIDENCE || '/tmp/keep-listen-evidence';
fs.mkdirSync(out, { recursive: true });
const uid = '00000000-0000-4000-8000-000000000050';
const proposed = { title: 'Titre proposé', artist: 'Artiste proposé', confidence: 0.95, engine: 'ACRCloud' };
const alternatives = [1, 2, 3].map((i) => ({ title: `Autre titre ${i}`, artist: `Autre artiste ${i}`, confidence: 0.8 }));
const user = { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'listen@loki.test', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), app_metadata: {}, user_metadata: { username: 'listen' } };
const exp = Math.floor(Date.now() / 1000) + 86400;
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const session = { user, access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', is_anonymous: false, exp })}.fixture`, refresh_token: 'fixture', token_type: 'bearer', expires_in: 86400, expires_at: exp };

async function measure(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const issues = [];
    const rgb = (text) => (text.match(/[\d.]+/g) || []).map(Number);
    const luminance = (color) => color.slice(0, 3).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    for (const el of [node, ...node.querySelectorAll('*')]) {
      if (![...el.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim())) continue;
      const box = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      if (box.width === 0 || box.height === 0 || css.visibility === 'hidden') continue;
      if (box.left < -1 || box.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1) issues.push(`Texte coupé : ${el.textContent}`);
      if (Number.parseFloat(css.fontSize) < 11) issues.push(`Texte trop petit : ${el.textContent}`);
      let background = [11, 10, 18];
      for (let parent = el; parent; parent = parent.parentElement) {
        const value = rgb(getComputedStyle(parent).backgroundColor);
        if (value.length === 3 || value[3] === 1) { background = value; break; }
      }
      if (contrast(rgb(css.color), background) < 4.5) issues.push(`Contraste insuffisant : ${el.textContent}`);
    }
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, issues, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: 'fr-FR' });
      const page = await context.newPage();
      const errors = [];
      const corrections = [];
      const tasteWrites = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // Avertissement de montage préexistant, hors écran Écouter ; ne pas le masquer dans les preuves.
        if (message.text().startsWith("The 'navigation' object hasn't been initialized yet.")) {
          console.warn('Limite héritée : navigation initiale appelée avant montage.');
        } else errors.push(message.text());
      });
      await context.addInitScript(({ session }) => {
        localStorage.setItem('sb-rrhqsqzcplvmwxizqnla-auth-token', JSON.stringify(session));
        localStorage.setItem('@keep/mic-primer-shown-v1', '1');
        localStorage.setItem('@keep/coach-marks-seen-v1', '1');
        const streams = [];
        window.__listenStreams = streams;
        window.__listenSpeech = false;
        navigator.mediaDevices.getUserMedia = async () => {
          const audio = new AudioContext();
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          const dest = audio.createMediaStreamDestination();
          osc.frequency.value = 440;
          gain.gain.value = .3;
          osc.connect(gain).connect(dest);
          osc.start();
          const timer = setInterval(() => { gain.gain.value = window.__listenSpeech && Math.floor(Date.now() / 350) % 2 ? 0 : .3; }, 50);
          dest.stream.getTracks()[0].addEventListener('ended', () => { clearInterval(timer); osc.stop(); void audio.close(); });
          streams.push(dest.stream);
          return dest.stream;
        };
      }, { session });
      await context.routeWebSocket('**/*', () => {});
      await context.route('**/*', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.origin === new URL(base).origin) return route.continue();
        if (url.hostname !== 'rrhqsqzcplvmwxizqnla.supabase.co') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
        const name = url.pathname.split('/').pop();
        let data = [];
        if (url.pathname === '/auth/v1/user') data = user;
        else if (url.pathname === '/rest/v1/profiles') data = [{ id: uid, username: 'listen', country_code: 'FR', city: 'Paris', favorite_genres: ['Pop'], onboarding_completed_at: new Date().toISOString() }];
        else if (name === 'keep_battle_credit_status' || name === 'keep_download_credit_status') data = { remaining: 20, freeBalance: 20, costPerKeep: 3 };
        else if (/listen.*status|record_listen/.test(name)) data = { ok: true, used: 1, limit: 5, free_balance: 20, over_quota: false };
        else if (name === 'keep_pulse_preferences_state') data = { completed: true, dismissCount: 1 };
        else if (name === 'keep-music-fallback') data = { ok: true, recognition: { ...proposed, alternatives, __listenEconomyRecorded: true } };
        else if (name === 'keep-music-memory') data = { ok: true, recognition: null };
        else if (name === 'keep-music-keyless-source') data = { ok: true, candidates: alternatives };
        else if (name === 'keep_recognition_corrections') { corrections.push(req.postDataJSON()); data = {}; }
        if (req.method() !== 'GET' && /keep_decision|taste_signal|track_likes|track_dislikes/.test(name)) tasteWrites.push(name);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      const start = page.getByRole('button', { name: 'Trouver le morceau qui joue' });
      await start.waitFor({ state: 'visible', timeout: 45000 });
      await start.click();
      await page.getByRole('button', { name: 'Pas la bonne', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      assert.deepEqual((await measure(page, '[data-testid="listen-fixed-banner"]')).issues, []);
      assert.equal((await measure(page, '[data-testid="listen-fixed-banner"]')).overflow, false);
      await page.getByRole('button', { name: 'Pas la bonne', exact: true }).click();
      for (const result of alternatives) await page.getByRole('button', { name: `Choisir ${result.title} — ${result.artist}`, exact: true }).waitFor({ state: 'visible' }).catch(async (error) => {
        await page.screenshot({ path: path.join(out, `failure-${width}.png`) });
        console.error(await page.locator('body').innerText());
        throw error;
      });
      assert.equal(await page.locator('input,textarea').filter({ visible: true }).count(), 0);
      assert.deepEqual((await measure(page, '[data-testid="recognition-sheet"]')).issues, []);
      await page.getByRole('button', { name: 'Choisir Autre titre 1 — Autre artiste 1', exact: true }).click();
      await page.getByTestId('recognition-sheet').waitFor({ state: 'hidden' });
      await page.getByText('Autre titre 1', { exact: true }).waitFor({ state: 'visible' });
      assert.equal(await page.getByText('Titre proposé', { exact: true }).count(), 0);
      assert.equal(corrections.length, 2);
      assert.equal(corrections[1].chosen_track.title, 'Autre titre 1');
      assert.deepEqual(tasteWrites, []);
      await page.getByRole('button', { name: 'Pas la bonne', exact: true }).click();
      await page.getByRole('button', { name: 'Chercher moi-même', exact: true }).last().click();
      await page.getByRole('button', { name: 'Chercher Pop', exact: true }).click();
      await page.getByRole('button', { name: 'Choisir Autre titre 2 — Autre artiste 2', exact: true }).click();
      await page.getByTestId('recognition-sheet').waitFor({ state: 'hidden' });
      await page.getByText('Autre titre 2', { exact: true }).waitFor();
      assert.equal(corrections.at(-1).chosen_track.title, 'Autre titre 2');
      assert.equal(await page.locator('input:visible,textarea:visible').count(), 0);
      await page.evaluate(() => { window.__listenSpeech = true; });
      await page.getByTestId('listen-speech-status').waitFor({ state: 'visible', timeout: 20000 });
      assert.deepEqual((await measure(page, '[data-testid="listen-speech-status"]')).issues, []);
      assert.ok(await page.getByTestId('listen-speech-status').evaluate((node) => Number(getComputedStyle(node.parentElement).zIndex) >= 10), 'Pastille au-dessus des couches animées');
      await page.screenshot({ path: path.join(out, `listen-${width}.png`) });
      const robot = page.getByTestId('robot-says');
      await robot.waitFor({ state: 'visible' });
      {
        const box = await robot.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width, 'Bulle robot entière');
        assert.deepEqual((await measure(page, '[data-testid="robot-says"]')).issues, []);
      }
      await page.getByRole('button', { name: 'SESSION', exact: true }).click();
      await page.getByText('Autre titre 2', { exact: true }).waitFor({ state: 'visible' });
      assert.ok(await page.evaluate(() => window.__listenStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'))));
      await page.getByRole('button', { name: /Retour/ }).first().click();
      await start.waitFor({ state: 'visible' });
      await page.waitForTimeout(1000);
      assert.equal(await page.getByTestId('listen-fixed-banner').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`Écouter ${width}px : correction, SESSION, speech, contraste et débordement OK (fixtures isolées).`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
