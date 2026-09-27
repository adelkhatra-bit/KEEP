const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..', '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'github-ai-command-center.json'), 'utf8'));
const contract = config.ciArchitecture.browserContracts.PROFILE_MARKETPLACE;
const ORIGIN = process.env.KEEP_WEB_ORIGIN || 'http://127.0.0.1:8081';
const outDir = process.env.KEEP_PROFILE_MARKETPLACE_ARTIFACT_DIR || path.join(root, 'artifacts', 'profile-marketplace-contract');
fs.mkdirSync(outDir, { recursive: true });

const fixture = contract.fixture;
const selectors = contract.selectors;
const audioBuffer = Buffer.from('UklGRlIAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YS4AAAAAAP//AAD//wAA//8AAP//AAD//wAA//8AAP//wAA=', 'base64');

function json(status, body) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function headCount(total) {
  return {
    status: 200,
    headers: {
      'access-control-allow-origin': '*',
      'content-range': `0-0/${total}`,
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      prefer: 'count=exact',
    },
    body: '',
  };
}

async function installRoutes(context) {
  await context.route('https://media.keep.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      },
      body: audioBuffer,
    });
  });

  await context.route('https://rrhqsqzcplvmwxizqnla.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname.endsWith('/rest/v1/profiles')) {
      await route.fulfill(json(200, [{
        id: fixture.profileId,
        username: fixture.username,
        display_name: fixture.username,
        avatar_url: null,
        bio: 'Créateur test pour contrat marketplace',
        city: 'Paris',
        country_code: 'FR',
        website: null,
        kind: 'CREATOR',
        is_public: true,
        favorite_genres: ['House', 'Afro', 'Techno'],
        favorite_artists: ['Artiste Mystère'],
      }]));
      return;
    }

    if (pathname.endsWith('/rest/v1/profile_username_aliases')) {
      await route.fulfill(json(200, []));
      return;
    }

    if (pathname.endsWith('/rest/v1/social_links')) {
      await route.fulfill(json(200, []));
      return;
    }

    if (pathname.endsWith('/rest/v1/follows') && method === 'HEAD') {
      const total = url.search.includes('followee_id=eq.') ? 128 : 42;
      await route.fulfill(headCount(total));
      return;
    }

    if (pathname.endsWith('/auth/v1/user')) {
      await route.fulfill(json(401, { message: 'Auth session missing' }));
      return;
    }

    if (pathname.endsWith('/rest/v1/rpc/keep_feature_flag_enabled_for_me')) {
      await route.fulfill(json(200, false));
      return;
    }
    if (pathname.endsWith('/rest/v1/rpc/keep_public_profile_presence')) {
      await route.fulfill(json(200, { last_seen_at: null, online: false }));
      return;
    }
    if (pathname.endsWith('/rest/v1/rpc/keep_public_profile_snapshot')) {
      await route.fulfill(json(200, [{
        direct_public_keeps: 0,
        social_public_keeps: 0,
        total_public_keeps: 0,
        followers: 128,
        following: 42,
        account_verified: true,
        plan_code: 'CREATOR_PRO',
        certification_tier: 'CREATOR_PRO',
      }]));
      return;
    }
    if (pathname.endsWith('/rest/v1/rpc/keep_public_profile_tracks')) {
      await route.fulfill(json(200, []));
      return;
    }
    if (pathname.endsWith('/rest/v1/rpc/keep_profile_discovery_impacts')) {
      await route.fulfill(json(200, {}));
      return;
    }
    if (pathname.endsWith('/rest/v1/rpc/keep_playlist_sale_masked_track_ids')) {
      await route.fulfill(json(200, []));
      return;
    }
    if (pathname.endsWith('/rest/v1/rpc/keep_playlist_sale_offers_for_profile')) {
      await route.fulfill(json(200, [{
        offer_id: fixture.offerId,
        playlist_id: fixture.playlistId,
        playlist_name: fixture.playlistName,
        payment_mode: 'MONEY',
        price_cents: 500,
        free_price: null,
        currency_code: 'EUR',
        track_count: 3,
        genres: ['House', 'Afro', 'Techno'],
      }]));
      return;
    }
    if (pathname.endsWith('/rest/v1/rpc/keep_playlist_sale_offer_preview_tracks')) {
      await route.fulfill(json(200, [
        { track_id: 'track-1', preview_url: fixture.previewUrl },
        { track_id: 'track-2', preview_url: fixture.previewUrl },
        { track_id: 'track-3', preview_url: fixture.previewUrl },
      ]));
      return;
    }
    if (pathname.endsWith('/rest/v1/rpc/keep_public_certification_tiers')) {
      await route.fulfill(json(200, []));
      return;
    }

    await route.fulfill(json(200, []));
  });
}

async function installAudioProbe(context) {
  await context.addInitScript(() => {
    const NativeAudio = window.Audio;
    const instances = [];
    function WrappedAudio(...args) {
      const element = new NativeAudio(...args);
      const state = {
        playCalls: 0,
        pauseCalls: 0,
        playRejected: null,
        events: [],
      };
      const originalPlay = element.play.bind(element);
      element.play = (...playArgs) => {
        state.playCalls += 1;
        return Promise.resolve(originalPlay(...playArgs))
          .then((value) => {
            state.events.push('play-promise-resolved');
            return value;
          })
          .catch((error) => {
            state.playRejected = String(error?.message || error);
            throw error;
          });
      };
      const originalPause = element.pause.bind(element);
      element.pause = (...pauseArgs) => {
        state.pauseCalls += 1;
        state.events.push('pause-call');
        return originalPause(...pauseArgs);
      };
      for (const evt of ['play', 'pause', 'ended', 'canplay', 'loadeddata']) {
        element.addEventListener(evt, () => state.events.push(evt));
      }
      instances.push(state);
      return element;
    }
    WrappedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(WrappedAudio, NativeAudio);
    window.Audio = WrappedAudio;
    window.__keepAudioDebug = { instances };
  });
}

async function clickRobust(page, locator, label) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 15000 });
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await locator.click({ timeout: 3000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(180 * attempt);
    }
  }
  throw new Error(`${label}: ${String(lastError?.message || lastError || 'click failed')}`);
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  await installRoutes(context);
  await installAudioProbe(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`PAGE: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`CONSOLE: ${message.text()}`);
  });

  await page.goto(`${ORIGIN}${contract.routePath}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByText(selectors.saleBadgeText, { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.screenshot({ path: path.join(outDir, `${viewport.name}-01-profile.png`), fullPage: true });

  const launchPreview = page.getByLabel(selectors.previewLaunchLabel).last();
  await clickRobust(page, launchPreview, `${viewport.name} launch preview`);

  await page.getByText('PÉPITES À DÉCOUVRIR', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText(fixture.playlistName, { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText(/1\/3|1\/2|1\/1/, { exact: false }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.screenshot({ path: path.join(outDir, `${viewport.name}-02-modal-open.png`), fullPage: true });

  await page.waitForFunction(() => {
    const debug = window.__keepAudioDebug?.instances?.[0];
    return debug && debug.playCalls >= 1 && debug.events.includes('play') && !debug.playRejected;
  }, { timeout: 20000 });

  const previewToggle = page.getByLabel(selectors.previewTapLabel).last();
  await clickRobust(page, previewToggle, `${viewport.name} pause preview`);
  await page.waitForFunction(() => {
    const debug = window.__keepAudioDebug?.instances?.[0];
    return debug && debug.pauseCalls >= 1;
  }, { timeout: 10000 });
  await page.getByText(/pause/i).last().waitFor({ state: 'visible', timeout: 10000 });

  await clickRobust(page, previewToggle, `${viewport.name} resume preview`);
  await page.waitForFunction(() => {
    const debug = window.__keepAudioDebug?.instances?.[0];
    return debug && debug.playCalls >= 2;
  }, { timeout: 15000 });
  await page.screenshot({ path: path.join(outDir, `${viewport.name}-03-resumed.png`), fullPage: true });

  const close = page.getByLabel(selectors.modalCloseLabel).last();
  await clickRobust(page, close, `${viewport.name} close modal`);
  await page.getByText('PÉPITES À DÉCOUVRIR', { exact: true }).last().waitFor({ state: 'hidden', timeout: 10000 });

  if (errors.length) throw new Error(`${viewport.name} browser errors\n${errors.join('\n')}`);

  await context.close();
  return `${viewport.name}: PASS`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of contract.viewports) {
      results.push(await runViewport(browser, viewport));
    }
    fs.writeFileSync(path.join(outDir, 'report.txt'), [
      'PROFILE_MARKETPLACE CONTRACT: PASS',
      ...results,
      `Route: ${ORIGIN}${contract.routePath}`,
      `Assertions: ${contract.assertions.join(' | ')}`,
    ].join('\n'));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
