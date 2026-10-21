#!/usr/bin/env node
// Robot de mesure du trafic images Storage (ERR-SUPABASE-EGRESS-IMAGES-20261021).
//
// Rejoue de vrais parcours dans Chromium (PC 1440 + mobile 390) sur un export
// web local, avec le faux Supabase synthétique, et COMPTE pour chaque parcours :
// - le nombre de requêtes d'images Storage et les octets servis ;
// - le nombre de téléchargements du MÊME fichier (remontages d'écran) ;
// - le nombre d'appels API (PostgREST/RPC) pour repérer les appels inutiles.
// Puis teste l'envoi d'une photo de profil depuis le PC : poids réellement
// envoyé, format, en-tête de cache.
//
// Deux profils de poids, mesurés en lecture seule le 21/10/2026 sur les
// objets publics de production (seulement les TAILLES, aucune image réelle) :
//   AVANT = poids actuels (avatar PNG 2,19 Mo…)
//   APRÈS = poids des versions optimisées préparées localement (≈ 30 Ko).
// Les fichiers servis sont des PNG synthétiques valides complétés à la taille
// exacte (bloc PNG auxiliaire), donc aucune donnée d'utilisateur.
//
// Important : avec l'interception réseau Playwright, le cache HTTP du
// navigateur est désactivé. Les chiffres correspondent donc à un appareil SANS
// cache — exactement le cas d'un robot qui ouvre un navigateur neuf, et celui
// d'un iPhone pour une image > ~0,5 Mo (non mise en cache par iOS).
//
// Usage : node e2e/journeys/image-egress-robot.cjs <dist> [--profil avant|apres|les-deux]
// Sortie : artifacts/image-egress/RAPPORT.md + mesures.json. Code 1 si un
// critère d'acceptation échoue en profil « après ».
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const fake = require('./fake-supabase.cjs');

function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(name); } catch { /* essai suivant */ }
  }
  throw new Error('Module playwright introuvable : installer playwright ou playwright-core (npm install --no-save playwright).');
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const args = process.argv.slice(2);
const DIST = path.resolve(args.find((a) => !a.startsWith('--')) || process.env.DIST || path.join(REPO_ROOT, 'packages', 'mobile', 'dist-journeys'));
const PROFILE_ARG = (args[args.indexOf('--profil') + 1] && args.includes('--profil')) ? args[args.indexOf('--profil') + 1] : 'les-deux';
const OUT_DIR = path.resolve(process.env.IMAGE_EGRESS_OUT || path.join(REPO_ROOT, 'artifacts', 'image-egress'));
const PORT = Number(process.env.IMAGE_EGRESS_PORT || 4731);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/KEEP`;
const STORAGE = 'https://rrhqsqzcplvmwxizqnla.supabase.co/storage/v1/object/public';

// Poids mesurés (octets) — lecture seule de storage.objects, 21/10/2026.
const WEIGHTS = {
  avant: { moi: 2246114, membre: 1429905, autre: 57798, soiree: 539269, cache: 'public, max-age=3600' },
  apres: { moi: 32 * 1024, membre: 35 * 1024, autre: 23 * 1024, soiree: 368 * 1024, cache: 'public, max-age=2592000' },
};

const AVATAR_URLS = {
  moi: `${STORAGE}/avatars/${fake.UID}/avatar.png?v=1`,
  membre: `${STORAGE}/avatars/${fake.SELLER}/avatar.jpg?v=1`,
  autre: `${STORAGE}/avatars/0b5e7a1c-0000-4000-8000-00000000d004/avatar.jpg?v=1`,
};

// ------------------------------------------------------------ PNG synthétique
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const pngCache = new Map();
/** PNG 64×64 uni valide, complété par un bloc auxiliaire « loKi » jusqu'à `size` octets. */
function syntheticPng(size, rgb) {
  const key = `${size}-${rgb.join(',')}`;
  if (pngCache.has(key)) return pngCache.get(key);
  const w = 64, h = 64;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const core = [chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw))];
  const iend = chunk('IEND', Buffer.alloc(0));
  const base = head.length + core.reduce((s, b) => s + b.length, 0) + iend.length;
  const padding = Math.max(0, size - base - 12);
  const png = Buffer.concat([head, ...core, ...(padding > 0 ? [chunk('loKi', Buffer.alloc(padding, 0x20))] : []), iend]);
  pngCache.set(key, png);
  return png;
}

// ------------------------------------------------------------ serveur local
function startServer() {
  const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    let url;
    try { url = decodeURIComponent(req.url.split('?')[0]); } catch { url = '/'; }
    if (url === '/KEEP/version.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"sha":"robot-images"}'); }
    let file = path.join(DIST, url.replace(/^\/KEEP/, '') || '/');
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

// ------------------------------------------------------------ faux Supabase + avatars
const ID_KEYS = ['id', 'profile_id', 'profileId', 'other_profile_id', 'sender_id', 'senderId', 'owner_id', 'seller_id', 'sellerId', 'author_id', 'user_id'];
function whoIs(obj) {
  for (const key of ID_KEYS) {
    if (obj[key] === fake.UID) return 'moi';
    if (obj[key] === fake.SELLER) return 'membre';
  }
  if (obj.username === fake.USERNAME) return 'moi';
  if (obj.username === fake.SELLER_USERNAME || obj.other_username === fake.SELLER_USERNAME) return 'membre';
  return 'autre';
}
/** Donne un avatar Storage à chaque personne présente dans une réponse JSON du faux Supabase. */
function withAvatars(value) {
  if (Array.isArray(value)) return value.map(withAvatars);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = withAvatars(v);
  for (const k of Object.keys(out)) {
    if (/avatar_?url$/i.test(k) && (out[k] === null || out[k] === '')) out[k] = AVATAR_URLS[whoIs(out)];
  }
  return out;
}

function measuringRoute(sb, weights, meter) {
  return async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (!/supabase\.co$/.test(u.hostname)) {
      if (u.href.startsWith('data:') || u.href.startsWith('blob:')) return route.continue();
      meter.blocked.push(u.href.slice(0, 100));
      return route.abort();
    }
    if (u.pathname.startsWith('/storage/v1/object/public/')) {
      const who = u.pathname.includes(fake.UID) ? 'moi' : u.pathname.includes(fake.SELLER) ? 'membre' : u.pathname.includes('/event-images/') ? 'soiree' : 'autre';
      const body = syntheticPng(weights[who], who === 'moi' ? [200, 60, 90] : who === 'membre' ? [60, 120, 200] : [90, 160, 90]);
      meter.images.push({ url: u.pathname, bytes: body.length });
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'cache-control': weights.cache, 'access-control-allow-origin': '*' }, body });
    }
    if (u.pathname.startsWith('/storage/v1/object/') && req.method() !== 'GET') {
      const buf = req.postDataBuffer() || Buffer.alloc(0);
      const text = buf.toString('latin1');
      const cache = (text.match(/name="cacheControl"\r\n\r\n([^\r]*)/) || [])[1] || req.headers()['cache-control'] || '';
      const type = (text.match(/name=""[^\r]*\r\nContent-Type: ([^\r]+)/i) || text.match(/Content-Type: (image\/[a-z]+)/i) || [])[1] || req.headers()['content-type'] || '';
      meter.uploads.push({ path: u.pathname.replace('/storage/v1/object/', ''), bodyBytes: buf.length, fileType: type, cacheControl: cache });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Key: u.pathname.replace('/storage/v1/object/', ''), Id: 'robot' }) });
    }
    if (u.pathname.startsWith('/rest/v1/')) meter.api.push(`${req.method()} ${u.pathname.replace('/rest/v1/', '')}`);
    // Laisse le faux Supabase répondre, puis ajoute les avatars aux personnes.
    const proxy = {
      request: () => req,
      abort: (...a) => route.abort(...a),
      continue: (...a) => route.continue(...a),
      fulfill: (opts) => {
        if (opts && typeof opts.body === 'string' && /json/.test(String(opts.contentType || ''))) {
          try { opts = { ...opts, body: JSON.stringify(withAvatars(JSON.parse(opts.body))) }; } catch { /* corps non JSON */ }
        }
        return route.fulfill(opts);
      },
    };
    return sb.respond(proxy);
  };
}

async function openPage(browser, viewport, weights, fakeOptions = {}) {
  const sb = fake.createFakeSupabase({ origin: ORIGIN, groupMessages: true, ...fakeOptions });
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await fake.isolateRealtime(ctx);
  await ctx.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); localStorage.setItem('keep_has_seen_onboarding_guide', 'true'); } catch { /* stockage indisponible */ }
  }, [fake.AUTH_STORAGE_KEY, JSON.stringify(sb.session)]);
  const page = await ctx.newPage();
  const meter = { images: [], uploads: [], api: [], blocked: [], pageErrors: [] };
  page.on('pageerror', (e) => meter.pageErrors.push(String(e.message).slice(0, 160)));
  await page.route((url) => !url.href.startsWith(ORIGIN), measuringRoute(sb, weights, meter));
  return { ctx, page, meter };
}

const PC = ['PC 1440x900', { width: 1440, height: 900 }];
const MOBILE = ['Mobile 390x844', { width: 390, height: 844 }];

// Attend que plus aucune image ne soit demandée pendant 2 s (max 15 s), pour
// comparer AVANT/APRÈS à charge égale même si les gros fichiers sont lents.
let currentMeter = null;
async function settle(page, ms = 3500) {
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(ms);
  const started = Date.now();
  let last = currentMeter ? currentMeter.images.length : 0;
  let stableSince = Date.now();
  while (Date.now() - started < 15000) {
    await page.waitForTimeout(250);
    const now = currentMeter ? currentMeter.images.length : 0;
    if (now !== last) { last = now; stableSince = Date.now(); }
    if (Date.now() - stableSince >= 2000) break;
  }
}
async function skipIntro(page) {
  await page.getByText('Passer', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
}

const JOURNEYS = [
  {
    id: 'profil-public-membre',
    titre: 'Profil public d’un membre',
    devices: [PC, MOBILE],
    async run(page) {
      await page.goto(`${BASE}/profile/${fake.SELLER_USERNAME}`, { waitUntil: 'load' });
      await skipIntro(page);
      await settle(page);
    },
  },
  {
    id: 'mon-profil',
    titre: 'Mon profil',
    devices: [PC, MOBILE],
    async run(page) {
      await page.goto(`${BASE}/Main/Profile`, { waitUntil: 'load' });
      await skipIntro(page);
      await settle(page);
    },
  },
  {
    id: 'tchat-groupe',
    titre: 'Tchat : liste puis groupe',
    devices: [MOBILE],
    async run(page) {
      await page.goto(`${BASE}/Main/Profile`, { waitUntil: 'load' });
      await skipIntro(page);
      const open = page.locator('[aria-label="Ouvrir le Tchat"], [aria-label="Activer et ouvrir le Tchat"]').first();
      await open.waitFor({ timeout: 40000 });
      await open.click({ force: true });
      await page.getByText(fake.GROUP_NAME).first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.getByText(fake.GROUP_NAME).first().click();
      await settle(page, 4000);
    },
  },
  {
    id: 'navigation-onglets',
    titre: 'Navigation : Profil → Découvertes → Profil (remontages)',
    devices: [MOBILE],
    async run(page) {
      await page.goto(`${BASE}/Main/Profile`, { waitUntil: 'load' });
      await skipIntro(page);
      await settle(page, 2500);
      await page.goto(`${BASE}/Main/Discover`, { waitUntil: 'load' });
      await settle(page, 2500);
      await page.goto(`${BASE}/profile/${fake.SELLER_USERNAME}`, { waitUntil: 'load' });
      await settle(page, 2500);
      await page.goto(`${BASE}/Main/Profile`, { waitUntil: 'load' });
      await settle(page, 2500);
    },
  },
];

// Envoi d'une photo de profil depuis le PC : 2,2 Mo choisis → poids réellement envoyé.
async function uploadJourney(browser, weights) {
  const { ctx, page, meter } = await openPage(browser, PC[1], weights);
  const fixture = path.join(OUT_DIR, 'photo-test-2,2Mo.png');
  // Photo synthétique de 2048×2048 px (bruit coloré) : vrai décodage + vrai canvas.
  const big = (() => {
    const w = 2048, h = 2048;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    let seed = 7;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const o = y * (w * 3 + 1) + 1 + x * 3;
        raw[o] = (x >> 3) ^ (seed & 15); raw[o + 1] = (y >> 3) ^ ((seed >> 4) & 15); raw[o + 2] = ((x + y) >> 4) ^ ((seed >> 8) & 15);
      }
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
  })();
  fs.writeFileSync(fixture, big);
  const result = { choisi_octets: big.length, envoye: null, erreur: null, pageErrors: meter.pageErrors };
  try {
    await page.goto(`${BASE}/profile-settings`, { waitUntil: 'load' });
    await skipIntro(page);
    const button = page.getByText('Changer la photo', { exact: true }).first();
    await button.waitFor({ timeout: 40000 });
    const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
    await button.click();
    await (await chooser).setFiles(fixture);
    for (let i = 0; i < 40 && !meter.uploads.length; i++) await page.waitForTimeout(250);
    result.envoye = meter.uploads[0] || null;
    if (!result.envoye) result.erreur = 'aucun envoi Storage observé';
  } catch (e) {
    result.erreur = String(e && e.message ? e.message : e).split('\n')[0].slice(0, 200);
  } finally {
    await ctx.close();
  }
  return result;
}

function summarize(meter) {
  const perUrl = {};
  for (const im of meter.images) perUrl[im.url] = (perUrl[im.url] || 0) + 1;
  const bytes = meter.images.reduce((s, im) => s + im.bytes, 0);
  return {
    requetes_images: meter.images.length,
    fichiers_distincts: Object.keys(perUrl).length,
    max_telechargements_meme_fichier: Math.max(0, ...Object.values(perUrl)),
    octets_images: bytes,
    appels_api: meter.api.length,
    appels_api_distincts: new Set(meter.api).size,
    top_api: Object.entries(meter.api.reduce((m, a) => ((m[a] = (m[a] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`),
    erreurs_page: meter.pageErrors.length,
  };
}

const ko = (b) => `${Math.round(b / 1024).toLocaleString('fr-FR')} Ko`;

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error(`Export web introuvable : ${DIST}/index.html. Lancer d’abord « npx expo export --platform web --output-dir dist-journeys » dans packages/mobile.`);
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const profiles = PROFILE_ARG === 'les-deux' ? ['avant', 'apres'] : [PROFILE_ARG];
  const pw = loadPlaywright();
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const server = await startServer();
  const browser = await pw.chromium.launch(launchOptions);
  const mesures = { date: new Date().toISOString(), version: process.env.EXPO_PUBLIC_BUILD_SHA || process.env.GITHUB_SHA || 'locale', parcours: [], envoi: null };
  try {
    for (const journey of JOURNEYS) {
      for (const [appareil, viewport] of journey.devices) {
        const row = { id: journey.id, titre: journey.titre, appareil };
        for (const profile of profiles) {
          const { ctx, page, meter } = await openPage(browser, viewport, WEIGHTS[profile]);
          currentMeter = meter;
          try { await journey.run(page); row[`${profile}_etape`] = 'OK'; } catch (e) { row[`${profile}_etape`] = 'bloqué : ' + String(e.message || e).split('\n')[0].slice(0, 120); }
          row[profile] = summarize(meter);
          await ctx.close();
        }
        mesures.parcours.push(row);
        const a = row.avant, b = row.apres;
        console.log(`${journey.titre} — ${appareil} : ${a ? `avant ${ko(a.octets_images)} (${a.requetes_images} req.)` : ''}${b ? ` · après ${ko(b.octets_images)} (${b.requetes_images} req.)` : ''}`);
      }
    }
    mesures.envoi = await uploadJourney(browser, WEIGHTS.apres);
    console.log('Envoi photo PC :', JSON.stringify(mesures.envoi.envoye || mesures.envoi.erreur));
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  // Critères d'acceptation (profil « après » + code d'envoi actuel).
  const checks = [];
  for (const row of mesures.parcours) {
    if (row.apres) checks.push([`${row.titre} — ${row.appareil} : images ≤ 200 Ko par parcours sans cache (hors image de soirée)`, row.apres.octets_images <= 200 * 1024 || row.id === 'soirees']);
    if (row.avant && row.apres && row.avant.octets_images > 0) checks.push([`${row.titre} — ${row.appareil} : au moins 90 % d'octets en moins`, row.apres.octets_images <= row.avant.octets_images * 0.1]);
  }
  const up = mesures.envoi && mesures.envoi.envoye;
  checks.push(['Envoi PC : une photo de 2048 px est réduite à moins de 150 Ko avant envoi', Boolean(up && up.bodyBytes < 150 * 1024)]);
  checks.push(['Envoi PC : format JPEG', Boolean(up && /jpeg/i.test(up.fileType))]);
  checks.push(['Envoi PC : cache long versionné (2592000 s)', Boolean(up && /2592000/.test(up.cacheControl))]);
  mesures.criteres = checks.map(([libelle, ok]) => ({ libelle, ok }));

  const lines = [];
  lines.push('# Robot de mesure — trafic images Storage');
  lines.push('');
  lines.push(`- Date : ${mesures.date} · version : ${mesures.version}`);
  lines.push('- Chromium, faux Supabase synthétique, cache navigateur désactivé (= appareil neuf / iPhone pour une image > 0,5 Mo).');
  lines.push('- AVANT = poids actuels des objets publics ; APRÈS = poids des versions optimisées.');
  lines.push('');
  lines.push('| Parcours | Appareil | Avant (octets images · requêtes) | Après | Même fichier téléchargé jusqu’à | Appels API |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of mesures.parcours) {
    const a = r.avant, b = r.apres;
    lines.push(`| ${r.titre} | ${r.appareil} | ${a ? `${ko(a.octets_images)} · ${a.requetes_images}` : '—'} | ${b ? `${ko(b.octets_images)} · ${b.requetes_images}` : '—'} | ${(b || a).max_telechargements_meme_fichier}× | ${(b || a).appels_api} (${(b || a).top_api.join(', ')}) |`);
  }
  lines.push('');
  lines.push('## Envoi d’une photo de profil depuis le PC');
  if (up) lines.push(`- Photo choisie : ${ko(mesures.envoi.choisi_octets)} (2048×2048 px) → envoyée : ${ko(up.bodyBytes)} (corps complet), type ${up.fileType}, cache « ${up.cacheControl} », chemin ${up.path.replace(/[0-9a-f-]{36}/, '<id>')}`);
  else lines.push(`- Échec : ${mesures.envoi && mesures.envoi.erreur}`);
  lines.push('');
  lines.push(`- Temps réel : ${fake.realtimeStats.blocked} connexion(s) WebSocket vers supabase.co interceptée(s) et fermée(s) dans le navigateur du robot, jamais transmise(s) au serveur (ERR-ROBOT-REALTIME-WEBSOCKET-LEAK-20261021).`);
  lines.push('');
  lines.push('## Critères');
  for (const c of mesures.criteres) lines.push(`- ${c.ok ? '✅' : '❌'} ${c.libelle}`);
  fs.writeFileSync(path.join(OUT_DIR, 'RAPPORT.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'mesures.json'), JSON.stringify(mesures, null, 1));
  console.log('\n' + lines.join('\n'));
  const relevant = profiles.includes('apres') ? mesures.criteres : mesures.criteres.filter((c) => /Envoi PC/.test(c.libelle));
  process.exit(relevant.every((c) => c.ok) ? 0 : 1);
})().catch((e) => {
  console.error('Robot de mesure interrompu :', e);
  process.exit(1);
});
