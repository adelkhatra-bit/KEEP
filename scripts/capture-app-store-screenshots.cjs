#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const fakeSupabase = require('../packages/mobile/e2e/journeys/fake-supabase.cjs');
const { DEVICES, SCREENSHOTS, validateScreenshotDirectory } = require('./app-store-screenshot-contract.cjs');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1:8081';
const FIXTURE_HOST = 'appstore-fixture.supabase.co';
const TEST_EMAIL = 'claude-audit-free-user@mailinator.com';
const profileId = fakeSupabase.UID;
const fixtureTracks = [
  ['Minuit à Paris', 'Soleil Nova'],
  ['Lumière dorée', 'Studio Rivage'],
  ['Rêves électriques', 'Nuit Claire'],
  ['Reflets du soir', 'Les Ondes'],
  ['Danse sous la pluie', 'Mila Rêve'],
  ['Les heures bleues', 'Atlas Bloom'],
  ['Au bord du monde', 'Léo Marin'],
  ['Un été sans fin', 'Nova Belle'],
  ['Étoiles en mouvement', 'Luna Vale'],
  ['La ville respire', 'Miroir Sud'],
  ['Vagues tranquilles', 'Émile Sol'],
  ['Le ciel nous suit', 'June Azur'],
  ['Après l’orage', 'Maya d’Or'],
  ['L’ailleurs est proche', 'Romy Lune'],
  ['Les couleurs du vent', 'Sacha Rive'],
  ['Un peu de lumière', 'Nina Bleu'],
  ['Le temps suspendu', 'Noé Rivage'],
  ['Nos chemins secrets', 'Eden Solaire'],
];
const profile = {
  id: profileId,
  username: fakeSupabase.USERNAME,
  display_name: 'Testeur KEEP',
  avatar_url: null,
  discovery_hidden: false,
};
const track = (index) => ({
  id: `0b5e7a1c-0000-4000-8000-${String(index).padStart(12, '0')}`,
  title: fixtureTracks[(index - 1) % fixtureTracks.length][0],
  artist: fixtureTracks[(index - 1) % fixtureTracks.length][1],
  album: 'Horizons synthétiques',
  artwork_url: null,
  preview_url: null,
  genres: ['Pop', 'House'],
  provider_ids: {},
  external_urls: {},
  available_on: [],
});
const storyRow = {
  profile_id: profileId,
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  track: track(1),
  profile,
};
const pulseRows = Array.from({ length: 18 }, (_, index) => {
  const item = track(index + 1);
  return {
    track_id: item.id,
    title: item.title,
    artist: item.artist,
    album: item.album,
    artwork_url: item.artwork_url,
    preview_url: item.preview_url,
    genres: item.genres,
    provider_ids: item.provider_ids,
    external_urls: item.external_urls,
    available_on: item.available_on,
    relevance_score: 100 - index,
    is_new: index < 3,
  };
});

function json(route, value, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(value),
  });
}

function fixtureUser(session) {
  return {
    ...session.user,
    email: TEST_EMAIL,
    user_metadata: { ...session.user.user_metadata, keep_username: fakeSupabase.USERNAME, email_verified: true },
  };
}

async function assertTextContrast(page) {
  const conflicts = await page.evaluate(() => {
    const luminance = (cssColor) => {
      const parts = cssColor.match(/[\d.]+/g)?.map(Number);
      if (!parts || parts.length < 3) return 1;
      const channels = parts.slice(0, 3).map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const visible = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0
        && box.top < innerHeight && box.left < innerWidth && Number(style.opacity) > 0 && style.visibility !== 'hidden';
    };
    const conflicts = [];
    for (const element of document.querySelectorAll('body *')) {
      if (!element.children.length && /[\p{L}\p{N}]/u.test(element.textContent || '') && visible(element)) {
        const foreground = luminance(getComputedStyle(element).color);
        let background = 0;
        for (let parent = element; parent && parent !== document.documentElement; parent = parent.parentElement) {
          const color = getComputedStyle(parent).backgroundColor;
          const channels = color.match(/[\d.]+/g)?.map(Number) || [];
          const alpha = color.startsWith('rgba') || color.includes('/') ? channels[3] ?? 1 : 1;
          if (channels.length >= 3 && alpha > 0.05) {
            background = luminance(color);
            break;
          }
        }
        if (foreground < 0.16 && background < 0.16) {
          conflicts.push(element.textContent.trim().slice(0, 40));
          if (conflicts.length >= 8) break;
        }
      }
    }
    return conflicts;
  });
  if (conflicts.length) throw new Error(`Texte foncé sur fond foncé détecté : ${conflicts.join(' · ')}`);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    throw new Error('Playwright absent : installer playwright dans l’environnement du workflow.');
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const fake = fakeSupabase.createFakeSupabase({ origin: ORIGIN });
    fake.session.user = fixtureUser(fake.session);
    const storageKey = `sb-${FIXTURE_HOST.split('.')[0]}-auth-token`;

    for (const device of DEVICES) {
      const output = path.join(ROOT, 'artifacts', `app-store-${device.key}`);
      fs.rmSync(output, { recursive: true, force: true });
      fs.mkdirSync(output, { recursive: true });

      const context = await browser.newContext({
        viewport: device.viewport,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        locale: 'fr-FR',
        colorScheme: 'dark',
      });
      await context.addInitScript(([key, session]) => {
        localStorage.setItem(key, JSON.stringify(session));
        localStorage.setItem('keep_has_seen_onboarding_guide', 'true');
      }, [storageKey, fake.session]);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(`${device.key}: ${error.message}`));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) return route.continue();
        if (url.hostname === FIXTURE_HOST) {
          if (url.pathname === '/auth/v1/user') return json(route, fake.session.user);
          if (url.pathname === '/auth/v1/token') return json(route, fake.session);
          if (url.pathname === '/rest/v1/keep_decisions' && url.searchParams.get('profile_id') === `eq.${profileId}`) {
            return json(route, [storyRow]);
          }
          if (url.pathname === '/rest/v1/rpc/keep_loki_pulse') return json(route, pulseRows);
          if (url.pathname === '/rest/v1/rpc/keep_feature_flag_enabled_for_me') {
            return json(route, url.searchParams.get('p_key') === 'keep_battle' || route.request().postDataJSON()?.p_key === 'keep_battle');
          }
          if (url.pathname === '/rest/v1/rpc/keep_pulse_preferences_state') {
            return json(route, { completed: true, shouldPrompt: false, favoriteGenres: ['Pop', 'House'], languageCodes: ['fr'], countryCodes: ['FR'], preferredLanguageTag: 'fr-FR', version: 1 });
          }
          if (url.pathname === '/rest/v1/rpc/keep_story_masked_pins') return json(route, []);
          return fake.respond(route);
        }
        return route.abort();
      });

      await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.getByText('Loki Music', { exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
      const coach = page.getByLabel('Passer le mini-tour').last();
      await coach.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      if (await coach.isVisible().catch(() => false)) await coach.click({ force: true });
      await page.waitForTimeout(1200);

      const capture = async (index) => {
        const { file } = SCREENSHOTS[index];
        await assertTextContrast(page);
        await page.screenshot({ path: path.join(output, file), type: 'jpeg', quality: 95 });
        console.log(`${device.type} · ${file}`);
      };
      const tab = async (label) => {
        const item = page.getByText(label, { exact: true }).last();
        await item.waitFor({ state: 'visible', timeout: 30000 });
        await item.click({ force: true });
      };

      await tab('Loki Music');
      await page.getByLabel('Trouver le morceau qui joue').last().waitFor({ state: 'visible', timeout: 30000 });
      await capture(0);

      await tab('Profil');
      const pulse = page.getByTestId('profile-loki-pulse-track-bubbles');
      await pulse.waitFor({ state: 'visible', timeout: 30000 });
      await page.getByText('LOKI PULSE', { exact: true }).last().waitFor({ state: 'visible', timeout: 30000 });
      await pulse.scrollIntoViewIfNeeded();
      await capture(1);

      await page.getByLabel('Menu du profil').last().scrollIntoViewIfNeeded();
      await page.getByLabel('Ouvrir ta story').waitFor({ state: 'visible', timeout: 30000 });
      await capture(2);

      await tab('Soirées');
      await page.getByLabel('Ouvrir directement Battle').waitFor({ state: 'visible', timeout: 30000 });
      await page.getByLabel('Ouvrir directement Battle').click({ force: true });
      await page.getByText('NOMBRE DE MORCEAUX', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      await capture(3);

      await tab('Profil');
      await page.getByLabel('Menu du profil').last().click({ force: true });
      const offers = page.locator('[aria-label="Free"]:visible').last();
      await offers.waitFor({ state: 'visible', timeout: 30000 });
      await offers.click({ force: true });
      await page.getByText('Offre & crédits', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      await capture(4);

      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio }));
      if (viewport.width !== device.viewport.width || viewport.height !== device.viewport.height || viewport.scale !== 3) {
        throw new Error(`${device.type}: viewport inattendu ${JSON.stringify(viewport)}`);
      }
      await context.close();
      for (const result of validateScreenshotDirectory(output, device)) {
        console.log(`Validé ${result.file}: ${result.width}x${result.height} — ${result.label}`);
      }
    }

    if (errors.length) throw new Error(`Erreurs JavaScript dans l’application : ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
