#!/usr/bin/env node
/**
 * Garde-fou "page noire" (Adel, 29/09/2026 : "je ne veux plus jamais qu'il revienne").
 *
 * Le 29/09 le site public affichait une page noire sur ordinateur alors que la
 * CI était verte : le test navigateur vérifiait seulement qu'il y avait du TEXTE
 * dans la page. Or #root était tombé à 0 px de haut (height:auto sur desktop) :
 * le texte existait dans le DOM mais rien n'était visible.
 *
 * Ce script vérifie ce que voit réellement l'utilisateur, dans un vrai Chromium,
 * sur PC, tablette et mobile :
 *   1. #root occupe au moins 90 % de la hauteur de la fenêtre ;
 *   2. la barre des 5 onglets est visible dans la fenêtre ;
 *   3. l'écran Loki (ex-Écouter) affiche son titre à l'écran (hauteur > 0, dans la fenêtre).
 *
 * Usage : node scripts/web-visible-surface-gate.cjs <BASE_URL>
 *   ex. BASE_URL = http://127.0.0.1:8765/KEEP  (avant publication)
 *       BASE_URL = https://adelkhatra-bit.github.io/KEEP  (après publication)
 * Nécessite @playwright/test (ou playwright) et un Chromium installé.
 */
const gateAuthPages = new WeakSet();
const gateAuthEnabled = (page) => gateAuthPages.has(page);
let pw;
try { pw = require('@playwright/test'); } catch { pw = require('playwright'); }
const { chromium, devices } = pw;

const BASE = (process.argv[2] || '').replace(/\/+$/, '');
if (!BASE) {
  console.error('Usage: node scripts/web-visible-surface-gate.cjs <BASE_URL>');
  process.exit(2);
}

const scenarios = [
  { name: 'desktop-1440', context: { viewport: { width: 1440, height: 900 } } },
  { name: 'desktop-1366', context: { viewport: { width: 1366, height: 768 } } },
  { name: 'tablet-1024', context: { viewport: { width: 1024, height: 768 } } },
  { name: 'android-pixel7', context: { ...devices['Pixel 7'] } },
];
const routes = [
  { path: '/', marker: 'Loki Music' },
  { path: '/Main/Listen/', marker: 'Loki Music' },
  { path: '/Main/Discover/', marker: 'Découvertes' },
  { path: '/Main/MyMusic/', marker: 'Playlists' },
  { path: '/Main/Parties/', marker: 'Soirées' },
  { path: '/Main/Profile/', marker: 'Profil' },
];
const TAB_LABELS = ['Loki Music', 'Découvertes', 'Playlists', 'Soirées', 'Profil'];
const LOCAL_SURFACE_ONLY = /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\//i.test(BASE);
const PROD_SUPABASE_HOST = 'rrhqsqzcplvmwxizqnla.supabase.co';

// Décision d'Adel (04/10/2026) : sur ordinateur, Loki ne s'ouvre que par QR
// approuvé depuis le téléphone. Sans session, le site public affiche donc
// l'écran « Connexion ordinateur » (sans barre d'onglets). Le robot simule
// un appareil DÉJÀ approuvé (session locale fictive, aucune écriture en base)
// pour vérifier la vraie surface connectée, et contrôle à part l'écran QR.
const GATE_USER_ID = '00000000-0000-4000-8000-0000000000a1';
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function gateSession() {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const user = {
    id: GATE_USER_ID, aud: 'authenticated', role: 'authenticated', email: 'gate@loki.test',
    email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: { username: 'gate' },
    created_at: new Date().toISOString(),
  };
  const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: GATE_USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.gate`;
  return { user, session: { access_token: jwt, refresh_token: 'gate', token_type: 'bearer', expires_in: 86400, expires_at: exp, user } };
}
const GATE_PROFILE = [{
  id: GATE_USER_ID, username: 'gate', display_name: 'Gate', bio: '', avatar_url: null,
  country_code: 'FR', city: 'Paris', favorite_genres: ['pop'], onboarding_completed_at: new Date().toISOString(),
}];

async function seedApprovedDevice(context) {
  if (!LOCAL_SURFACE_ONLY) return;
  const { session } = gateSession();
  await context.addInitScript((value) => {
    try { localStorage.setItem('sb-rrhqsqzcplvmwxizqnla-auth-token', JSON.stringify(value)); } catch {}
  }, session);
}

async function isolateSurfaceGateFromProduction(page) {
  if (!LOCAL_SURFACE_ONLY) return;
  await page.route(`https://${PROD_SUPABASE_HOST}/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname;
    if (path === '/auth/v1/user' && gateAuthEnabled(page)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gateSession().user) });
      return;
    }
    if (path === '/rest/v1/profiles' && route.request().method() === 'GET' && gateAuthEnabled(page)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GATE_PROFILE) });
      return;
    }
    // Ce gate valide UNIQUEMENT le rendu/viewport. Il ouvrait auparavant
    // 50+ écrans contre le vrai Supabase à chaque déploiement, exactement au
    // moment où les utilisateurs se connectaient. Sur l'instance Free cela a
    // contribué aux PGRST002 et aux /auth/v1 500/504 du 02/10.
    if (path.startsWith('/rest/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (path.startsWith('/auth/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (path.startsWith('/functions/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

async function measure(page, expectedTab) {
  return page.evaluate(({ tabLabels, expectedTab }) => {
    const root = document.getElementById('root');
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const rootRect = root ? root.getBoundingClientRect() : null;
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw
        && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    const textOf = (el) => String(el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
    const leafWithText = (label) => [...document.querySelectorAll('div, span, a, button')]
      .filter((el) => textOf(el) === label)
      .filter((el) => ![...el.children].some((child) => textOf(child) === label));
    // React Navigation Web ne garantit pas role="tab" : selon la version,
    // BottomTabBarButton est rendu comme contrôle pressable / lien. On cible
    // donc les contrôles cliquables qui contiennent le libellé ET vivent dans
    // le quart bas du viewport. Cela mesure la vraie barre sans confondre un
    // titre identique présent dans le contenu de l'écran.
    const controls = [...document.querySelectorAll('[role="button"], [role="link"], a, button')];
    const bottomControlForLabel = (label) => controls.find((el) => {
      if (!textOf(el).includes(label) || !visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.top >= vh * 0.7 && r.bottom <= vh + 2;
    });
    const visibleTabs = tabLabels.filter((label) => Boolean(bottomControlForLabel(label))
      || leafWithText(label).some((el) => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.top >= vh * 0.7 && r.bottom <= vh + 2;
      }));
    const expectedControl = bottomControlForLabel(expectedTab);
    const activeColor = 'rgb(167, 139, 250)';
    const activeTabSelected = expectedControl
      ? expectedControl.getAttribute('aria-selected') === 'true'
        || expectedControl.getAttribute('aria-current') === 'page'
        || [...expectedControl.querySelectorAll('*'), expectedControl].some((el) => getComputedStyle(el).color === activeColor)
      : leafWithText(expectedTab).some((el) => visible(el) && getComputedStyle(el).color === activeColor);
    return {
      vh,
      rootHeight: rootRect ? Math.round(rootRect.height) : -1,
      visibleTabs,
      activeTabSelected,
      booting: document.documentElement.classList.contains('keep-booting'),
    };
  }, { tabLabels: TAB_LABELS, expectedTab });
}

(async () => {
  const failures = [];
  const browser = await chromium.launch({ headless: true });
  for (const scenario of scenarios) {
    const context = await browser.newContext({ ...scenario.context, locale: 'fr-FR' });
    await seedApprovedDevice(context);
    const page = await context.newPage();
    gateAuthPages.add(page);
    await isolateSurfaceGateFromProduction(page);
    for (const route of routes) {
      const url = BASE + route.path;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Le boot-shield se lève au plus tard après 8 s ; on laisse l'app monter.
      await page.waitForFunction(() => !document.documentElement.classList.contains('keep-booting'), null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2500);
      for (const phase of ['open', 'reload']) {
        if (phase === 'reload') {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForFunction(() => !document.documentElement.classList.contains('keep-booting'), null, { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(1800);
        }
        const m = await measure(page, route.marker);
        const label = `${scenario.name} ${route.path} ${phase}`;
        const problems = [];
        if (m.rootHeight < m.vh * 0.9) problems.push(`#root = ${m.rootHeight}px pour une fenêtre de ${m.vh}px (page noire)`);
        if (m.visibleTabs.length < 5) problems.push(`barre des 5 onglets non visible (visibles: ${m.visibleTabs.join(', ') || 'aucun'})`);
        if (!m.activeTabSelected) problems.push(`mauvais onglet actif après ${phase}: « ${route.marker} » n’est pas sélectionné`);
        if (m.booting) problems.push('écran de démarrage jamais levé');
        if (problems.length) failures.push(`${label}: ${problems.join(' ; ')}`);
        console.log(`${problems.length ? 'FAIL' : 'PASS'} ${label} root=${m.rootHeight}/${m.vh} onglets=${m.visibleTabs.length}/5 active=${m.activeTabSelected ? 'OK' : 'FAIL'}`);
      }
    }
    await context.close();
  }

  // Reproduit le bug observé sur l'ordinateur réel :
  // la page est visible avec DevTools docké (viewport étroit), puis devient
  // vide/noire quand DevTools est fermé et que Chrome reprend toute la largeur.
  // Aucun reload entre les tailles : on teste le même arbre React monté.
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'fr-FR' });
    await seedApprovedDevice(context);
    const page = await context.newPage();
    gateAuthPages.add(page);
    await isolateSurfaceGateFromProduction(page);
    await page.goto(BASE + '/Main/Profile/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('keep-booting'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const transitions = [
      { name: 'devtools-docked', width: 820, height: 768 },
      { name: 'devtools-closed', width: 1366, height: 768 },
      { name: 'maximised-wide', width: 1920, height: 1080 },
      { name: 'back-to-laptop', width: 1366, height: 768 },
    ];
    for (const step of transitions) {
      await page.setViewportSize({ width: step.width, height: step.height });
      await page.waitForTimeout(900);
      const m = await measure(page, 'Profil');
      const label = `resize-roundtrip ${step.name} /Main/Profile/`;
      const problems = [];
      if (m.rootHeight < m.vh * 0.9) problems.push(`#root = ${m.rootHeight}px pour une fenêtre de ${m.vh}px (page noire)`);
      if (m.visibleTabs.length < 5) problems.push(`barre des 5 onglets non visible (visibles: ${m.visibleTabs.join(', ') || 'aucun'})`);
      if (!m.activeTabSelected) problems.push('mauvais écran après redimensionnement: onglet Profil non sélectionné');
      if (m.booting) problems.push('écran de démarrage jamais levé');
      if (problems.length) failures.push(`${label}: ${problems.join(' ; ')}`);
      console.log(`${problems.length ? 'FAIL' : 'PASS'} ${label} root=${m.rootHeight}/${m.vh} onglets=${m.visibleTabs.length}/5`);
    }
    await context.close();
  }

  // Écran « Connexion ordinateur » (appareil non approuvé) : il doit remplir la
  // fenêtre et afficher son titre + son bouton, jamais une page noire.
  for (const scenario of scenarios) {
    const context = await browser.newContext({ ...scenario.context, locale: 'fr-FR' });
    const page = await context.newPage();
    await isolateSurfaceGateFromProduction(page);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('keep-booting'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const q = await page.evaluate(() => {
      const root = document.getElementById('root');
      const vh = window.innerHeight;
      const text = String(document.body.innerText || '');
      const foot = [...document.querySelectorAll('div, span')].filter((el) => (el.innerText || '').includes('Aucune création de compte sur ordinateur') && ![...el.children].some((c) => (c.innerText || '').includes('Aucune création')))[0];
      const r = foot ? foot.getBoundingClientRect() : null;
      return {
        vh,
        rootHeight: root ? Math.round(root.getBoundingClientRect().height) : -1,
        hasTitle: text.includes('Connexion ordinateur'),
        footVisible: Boolean(r && r.width > 0 && r.height > 0 && r.bottom <= vh + 2 && r.top >= 0),
      };
    });
    const label = `qr-screen ${scenario.name}`;
    const problems = [];
    if (q.rootHeight < q.vh * 0.9) problems.push(`#root = ${q.rootHeight}px pour une fenêtre de ${q.vh}px (page noire)`);
    if (!q.hasTitle) problems.push('écran « Connexion ordinateur » absent');
    if (!q.footVisible) problems.push('consigne de l’écran QR hors fenêtre');
    if (problems.length) failures.push(`${label}: ${problems.join(' ; ')}`);
    console.log(`${problems.length ? 'FAIL' : 'PASS'} ${label} root=${q.rootHeight}/${q.vh}`);
    await context.close();
  }

  await browser.close();
  if (failures.length) {
    console.error('\nPAGE NOIRE / SURFACE INVISIBLE DÉTECTÉE :\n- ' + failures.join('\n- '));
    process.exit(1);
  }
  console.log('\nSurface visible OK sur PC, tablette et mobile.');
})().catch((err) => { console.error(err); process.exit(1); });
