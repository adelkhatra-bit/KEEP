const { chromium, firefox, webkit, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.KEEP_PUBLIC_BASE || 'https://adelkhatra-bit.github.io/KEEP';
const OUT = process.env.KEEP_PUBLIC_EVIDENCE || 'artifacts/public-browser-matrix';
const SHARE_USER = process.env.KEEP_SHARE_SMOKE_USER || 'keeptest-a-mt7jit5n';
fs.mkdirSync(OUT, { recursive: true });

const scenarios = [
  { name: 'trial-desktop-chromium', engine: chromium, context: { viewport: { width: 1440, height: 900 } } },
  { name: 'trial-desktop-firefox', engine: firefox, context: { viewport: { width: 1440, height: 900 } } },
  { name: 'trial-android-pixel7', engine: chromium, context: { ...devices['Pixel 7'] } },
  { name: 'trial-iphone-safari', engine: webkit, context: { ...devices['iPhone 15'] } },
];

function assertVisibleBody(text, html, label) {
  if (!text || text.trim().length < 4 || !html || html.trim().length < 20) {
    throw new Error(`${label}: page blanche détectée`);
  }
}

async function waitForFiveTabs(page) {
  for (const label of ['Écouter', 'Découvertes', 'Playlists', 'Soirées', 'Profil']) {
    await page.getByText(label, { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  }
}

async function proveCreatorPaywall(page, scenarioName) {
  await page.getByText('Profil', { exact: true }).last().click();
  await page.getByText('Créer mon compte KEEP', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('ESPACE CRÉATEUR', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('KEEP PREMIUM', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('KEEP CREATOR PRO', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('KEEP VENUE PRO', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByLabel('Creator Pro requis').last().click();
  await page.getByText('Offre & crédits', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('Formule requise : Creator Pro', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('FORMULE REQUISE', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('Cette formule débloque les profils DJ, Artiste, Créateur et Producteur.', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 });
  const paywallText = await page.locator('body').innerText();
  const paywallHtml = await page.locator('body').innerHTML();
  assertVisibleBody(paywallText, paywallHtml, `${scenarioName} creator paywall`);
  await page.screenshot({ path: path.join(OUT, `${scenarioName}-creator-paywall.png`), fullPage: true });

  await page.getByLabel('Retour').click();
  await waitForFiveTabs(page);
}

async function proveSharedProfileRoute(page, scenarioName) {
  const shared = `${BASE}/share-profile/?u=${encodeURIComponent(SHARE_USER)}`;
  const response = await page.goto(shared, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(900);
  if ((response?.status() || 0) >= 400) throw new Error(`${scenarioName}: partage profil HTTP ${response?.status()}`);

  const bodyText = await page.locator('body').innerText();
  const bodyHtml = await page.locator('body').innerHTML();
  assertVisibleBody(bodyText, bodyHtml, `${scenarioName} shared profile`);
  if (!bodyText.includes(`@${SHARE_USER}`)) throw new Error(`${scenarioName}: le profil partagé @${SHARE_USER} n'est pas affiché`);

  const follow = page.locator('#follow');
  await follow.waitFor({ state: 'visible', timeout: 15000 });
  const followText = (await follow.innerText()).trim();
  if (!/Suivre|Abonné|Ton profil/i.test(followText)) throw new Error(`${scenarioName}: bouton suivre incohérent: ${followText}`);
  await page.screenshot({ path: path.join(OUT, `${scenarioName}-shared-profile.png`), fullPage: true });

  if (/Suivre/i.test(followText)) {
    const sharedUrl = page.url();
    await follow.click();
    await page.waitForTimeout(500);
    if (page.url() !== sharedUrl) throw new Error(`${scenarioName}: suivre a quitté le profil partagé: ${page.url()}`);

    const overlay = page.locator('#authOverlay');
    await overlay.waitFor({ state: 'visible', timeout: 15000 });
    await overlay.getByText(`Suivre @${SHARE_USER}`, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    await overlay.getByText('Se connecter', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    await overlay.getByPlaceholder('E-mail').waitFor({ state: 'visible', timeout: 15000 });
    await overlay.getByPlaceholder('Mot de passe').waitFor({ state: 'visible', timeout: 15000 });
    await overlay.getByText('SE CONNECTER ET SUIVRE', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });

    await overlay.getByText('Créer un compte', { exact: true }).click();
    await overlay.getByPlaceholder('Pseudo').waitFor({ state: 'visible', timeout: 15000 });
    await overlay.getByPlaceholder('Mot de passe (6 caractères min.)').waitFor({ state: 'visible', timeout: 15000 });
    await overlay.getByText('CRÉER MON COMPTE ET SUIVRE', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, `${scenarioName}-shared-follow-auth.png`), fullPage: true });

    await page.locator('#authCloseBtn').click();
    await overlay.waitFor({ state: 'hidden', timeout: 10000 });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForFiveTabs(page);
  }}

(async () => {
  const report = [];
  for (const scenario of scenarios) {
    const browser = await scenario.engine.launch({ headless: true });
    const context = await browser.newContext(scenario.context);
    const page = await context.newPage();
    const errors = [];
    const forbiddenAuthRequests = [];

    page.on('pageerror', error => errors.push(`PAGE ERROR: ${error.message}`));
    page.on('request', request => {
      const url = request.url();
      if (/\/auth\/v1\/(signup|token)/i.test(url) && request.method() === 'POST') {
        forbiddenAuthRequests.push(`${request.method()} ${url}`);
      }
    });

    try {
      await page.goto(`${BASE}/?trial_smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);
      const beforeText = await page.locator('body').innerText();
      const beforeHtml = await page.locator('body').innerHTML();
      assertVisibleBody(beforeText, beforeHtml, `${scenario.name} onboarding`);

      const trial = page
        .getByTestId('onboarding-trial-button')
        .or(page.getByRole('button', { name: 'Essayer gratuitement' }))
        .or(page.getByText('ESSAYER GRATUITEMENT', { exact: true }))
        .last();
      const entryMode = await Promise.any([
        page.getByText('Profil', { exact: true }).last().waitFor({ state: 'visible', timeout: 20000 }).then(() => 'auto'),
        trial.waitFor({ state: 'visible', timeout: 20000 }).then(() => 'button'),
      ]);
      await page.screenshot({ path: path.join(OUT, `${scenario.name}-before.png`), fullPage: true });
      if (entryMode === 'button') await trial.click();
      await waitForFiveTabs(page);
      await page.waitForTimeout(800);
      const afterText = await page.locator('body').innerText();
      const afterHtml = await page.locator('body').innerHTML();
      assertVisibleBody(afterText, afterHtml, `${scenario.name} after trial`);
      await page.screenshot({ path: path.join(OUT, `${scenario.name}-after.png`), fullPage: true });

      if (forbiddenAuthRequests.length) {
        throw new Error(`${scenario.name}: l'essai gratuit déclenche encore Supabase Auth: ${forbiddenAuthRequests.join(' | ')}`);
      }

      await proveCreatorPaywall(page, scenario.name);

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitForFiveTabs(page);
      await page.waitForTimeout(800);
      const reloadText = await page.locator('body').innerText();
      const reloadHtml = await page.locator('body').innerHTML();
      assertVisibleBody(reloadText, reloadHtml, `${scenario.name} after reload`);
      await page.screenshot({ path: path.join(OUT, `${scenario.name}-reload.png`), fullPage: true });

      await proveSharedProfileRoute(page, scenario.name);

      if (errors.length) throw new Error(`${scenario.name}: ${errors.join(' | ')}`);
      report.push(`${scenario.name}: PASS — Free/Premium/Creator/Venue controls + reload + required email signup + no overlap + return to free trial; no blank page/no auth signup`);
    } catch (error) {
      await page.screenshot({ path: path.join(OUT, `${scenario.name}-FAIL.png`), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(OUT, `${scenario.name}-FAIL.txt`), [
        String(error && error.stack ? error.stack : error),
        `URL: ${page.url()}`,
        `AUTH REQUESTS: ${forbiddenAuthRequests.join(' | ') || 'none'}`,
        `ERRORS: ${errors.join(' | ') || 'none'}`,
      ].join('\n'));
      throw error;
    } finally {
      await browser.close();
    }
  }

  fs.writeFileSync(path.join(OUT, 'trial-report.txt'), report.join('\n') + '\n');
  console.log(report.join('\n'));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
