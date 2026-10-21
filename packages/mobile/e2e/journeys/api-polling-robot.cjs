#!/usr/bin/env node
// Robot de mesure des appels API répétés (ERR-SUPABASE-API-POLLING-20261021).
//
// Ouvre de vrais écrans de l'export web dans Chromium avec le faux Supabase
// synthétique (aucun appel à la production), puis fait passer 30 minutes
// d'horloge simulée (Playwright clock) dans deux situations :
//   1. onglet VISIBLE  — ce que l'app doit continuer à rafraîchir ;
//   2. onglet CACHÉ    — l'ordinateur laissé ouvert : idéalement 0 appel.
// Compte les appels Supabase (API, RPC, fonctions) par minute simulée.
//
// Usage : node e2e/journeys/api-polling-robot.cjs <dist> [--minutes 30]
// Sortie : artifacts/api-polling/RAPPORT.md + mesures.json ; code 1 si un
// écran fait encore des appels périodiques onglet caché.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const fake = require('./fake-supabase.cjs');

function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(name); } catch { /* essai suivant */ }
  }
  throw new Error('Module playwright introuvable : installer playwright ou playwright-core (npm install --no-save playwright).');
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const args = process.argv.slice(2);
const DIST = path.resolve(args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || process.env.DIST || path.join(REPO_ROOT, 'packages', 'mobile', 'dist-journeys'));
const MINUTES = Number(args.includes('--minutes') ? args[args.indexOf('--minutes') + 1] : 30) || 30;
const OUT_DIR = path.resolve(process.env.API_POLLING_OUT || path.join(REPO_ROOT, 'artifacts', 'api-polling'));
const PORT = Number(process.env.API_POLLING_PORT || 4741);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/KEEP`;
// Au-delà de ce nombre d'appels onglet caché sur la période, l'écran est en échec.
const HIDDEN_BUDGET = Number(process.env.API_POLLING_HIDDEN_BUDGET || 2);

function startServer() {
  const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    let url;
    try { url = decodeURIComponent(req.url.split('?')[0]); } catch { url = '/'; }
    // Pas d'information de version : sinon l'app croit à une mise à jour, recharge la page
    // en boucle et chaque redémarrage fausse le comptage des appels.
    if (url === '/KEEP/version.json') { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('absent'); }
    let file = path.join(DIST, url.replace(/^\/KEEP/, '') || '/');
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

// Visibilité de l'onglet pilotable : react-native-web lit document.visibilityState.
const VISIBILITY_SCRIPT = () => {
  window.__lokiHidden = false;
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return window.__lokiHidden ? 'hidden' : 'visible'; } });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return Boolean(window.__lokiHidden); } });
  window.__lokiSetHidden = (hidden) => { window.__lokiHidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
};

async function openScreen(browser, viewport, fakeOptions = {}) {
  const sb = fake.createFakeSupabase({ origin: ORIGIN, groupMessages: true, ...fakeOptions });
  // L'horloge simulée avance de plus d'une heure : un jeton factice valable 1 h
  // provoquerait une rafale de renouvellements qui n'existe pas en vrai. Jeton
  // valable 10 ans ici, pour ne mesurer que les vrais rafraîchissements.
  const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  Object.assign(sb.session, {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: fake.UID, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600 })}.sig`,
    expires_in: exp - Math.floor(Date.now() / 1000),
    expires_at: exp,
  });
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await ctx.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); localStorage.setItem('keep_has_seen_onboarding_guide', 'true'); } catch { /* stockage indisponible */ }
  }, [fake.AUTH_STORAGE_KEY, JSON.stringify(sb.session)]);
  await ctx.addInitScript(VISIBILITY_SCRIPT);
  const page = await ctx.newPage();
  const meter = { calls: [], recording: false };
  await page.route((url) => !url.href.startsWith(ORIGIN), (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (!/supabase\.co$/.test(u.hostname)) {
      if (u.href.startsWith('data:') || u.href.startsWith('blob:')) return route.continue();
      return route.abort();
    }
    if (meter.recording && /^\/(rest|functions|auth)\//.test(u.pathname)) {
      meter.calls.push(`${req.method()} ${u.pathname.replace('/rest/v1/rpc/', 'rpc:').replace('/rest/v1/', '').replace('/functions/v1/', 'fn:')}`);
    }
    return sb.respond(route);
  });
  await page.clock.install();
  return { ctx, page, meter };
}

const PC = ['PC 1440x900', { width: 1440, height: 900 }];
const MOBILE = ['Mobile 390x844', { width: 390, height: 844 }];

const SCREENS = [
  { id: 'mon-profil', titre: 'Mon profil (stories, tchat, robot)', device: PC, async open(page) { await page.goto(`${BASE}/Main/Profile`, { waitUntil: 'load' }); } },
  { id: 'profil-membre', titre: 'Profil d’un membre (présence)', device: PC, async open(page) { await page.goto(`${BASE}/profile/${fake.SELLER_USERNAME}`, { waitUntil: 'load' }); } },
  { id: 'soirees', titre: 'Soirées (invitations Battle)', device: MOBILE, async open(page) { await page.goto(`${BASE}/Main/Parties`, { waitUntil: 'load' }); } },
  {
    id: 'tchat-groupe',
    titre: 'Tchat ouvert sur un groupe',
    device: MOBILE,
    async open(page) {
      await page.goto(`${BASE}/Main/Profile`, { waitUntil: 'load' });
      await page.getByText('Passer', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
      const open = page.locator('[aria-label="Ouvrir le Tchat"], [aria-label="Activer et ouvrir le Tchat"]').first();
      await open.waitFor({ timeout: 40000 });
      await open.click({ force: true });
      await page.getByText(fake.GROUP_NAME).first().waitFor({ timeout: 20000 });
      await page.getByText(fake.GROUP_NAME).first().click();
    },
  },
];

async function measure(page, meter, minutes) {
  meter.calls.length = 0;
  meter.recording = true;
  // Pas de 2,5 s (fastForward : chaque minuteur dû se déclenche une fois par pas, les
  // animations ne sont pas rejouées image par image) : les minuteurs de 2,5 s à 90 s gardent leur rythme.
  const stepMs = 2500;
  for (let t = 0; t < minutes * 60_000; t += stepMs) await page.clock.fastForward(stepMs);
  meter.recording = false;
  const byCall = {};
  for (const c of meter.calls) byCall[c] = (byCall[c] || 0) + 1;
  // Présence « En ligne » Battle (toutes les 4 min) : choix produit volontaire (Adel, 05/09/2026),
  // comptée à part pour ne pas masquer les vrais sondages.
  const presence = meter.calls.filter((c) => c.endsWith('keep_battle_manual_availability_ping')).length;
  return { total: meter.calls.length, horsPresence: meter.calls.length - presence, presence, parMinute: +(meter.calls.length / minutes).toFixed(2), top: Object.entries(byCall).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}×${v}`) };
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error(`Export web introuvable : ${DIST}/index.html. Lancer d’abord « npx expo export --platform web --output-dir dist-journeys » dans packages/mobile.`);
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pw = loadPlaywright();
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const server = await startServer();
  const browser = await pw.chromium.launch(launchOptions);
  const results = [];
  try {
    const only = (process.env.API_POLLING_ONLY || '').split(',').map((v) => v.trim()).filter(Boolean);
    for (const screen of SCREENS.filter((s) => !only.length || only.includes(s.id))) {
      const [appareil, viewport] = screen.device;
      const row = { id: screen.id, titre: screen.titre, appareil, minutes: MINUTES };
      const { ctx, page, meter } = await openScreen(browser, viewport);
      try {
        await screen.open(page);
        await page.waitForTimeout(6000); // démarrage réel (temps naturel)
        await page.clock.pauseAt(Date.now() + 1000);
        await measure(page, meter, 1); // fin du démarrage, non comptée
        row.visible = await measure(page, meter, MINUTES);
        await page.evaluate(() => window.__lokiSetHidden(true));
        row.passage_arriere_plan = await measure(page, meter, 1); // réactions au passage en arrière-plan (une fois)
        row.cache = await measure(page, meter, MINUTES);
        await page.evaluate(() => window.__lokiSetHidden(false));
        row.retour = await measure(page, meter, 1);
        row.etape = 'OK';
      } catch (e) {
        row.etape = 'bloqué : ' + String(e && e.message ? e.message : e).split('\n')[0].slice(0, 160);
      }
      await ctx.close();
      results.push(row);
      console.log(`${row.titre} — ${appareil} : visible ${row.visible ? row.visible.total : '?'} appels / ${MINUTES} min · caché ${row.cache ? row.cache.total : '?'} · retour (1 min) ${row.retour ? row.retour.total : '?'} [${row.etape}]`);
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  const checks = results.map((r) => [`${r.titre} : ≤ ${HIDDEN_BUDGET} appels en ${MINUTES} min onglet caché (hors présence Battle, ${r.cache ? r.cache.presence : '?'} pings)`, Boolean(r.cache) && r.cache.horsPresence <= HIDDEN_BUDGET]);
  const lines = [];
  lines.push('# Robot de mesure — appels API répétés');
  lines.push('');
  lines.push(`- Date : ${new Date().toISOString()} · version : ${process.env.EXPO_PUBLIC_BUILD_SHA || process.env.GITHUB_SHA || 'locale'}`);
  lines.push(`- Chromium, faux Supabase synthétique, ${MINUTES} min d’horloge simulée par situation (aucun appel à la production).`);
  lines.push('');
  lines.push(`| Écran | Appareil | Visible (${MINUTES} min) | Passage en arrière-plan (1 min) | Caché (${MINUTES} min) | Retour au premier plan (1 min) | Principaux appels onglet caché |`);
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of results) lines.push(`| ${r.titre} | ${r.appareil} | ${r.visible ? r.visible.total : '—'} | ${r.passage_arriere_plan ? r.passage_arriere_plan.total : '—'} | ${r.cache ? r.cache.total : '—'} | ${r.retour ? r.retour.total : '—'} | ${r.cache ? (r.cache.top.join(', ') || 'aucun') : r.etape} |`);
  lines.push('');
  lines.push('## Critères');
  for (const [label, ok] of checks) lines.push(`- ${ok ? '✅' : '❌'} ${label}`);
  fs.writeFileSync(path.join(OUT_DIR, 'RAPPORT.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'mesures.json'), JSON.stringify(results, null, 1));
  console.log('\n' + lines.join('\n'));
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
})().catch((e) => {
  console.error('Robot API interrompu :', e);
  process.exit(1);
});
