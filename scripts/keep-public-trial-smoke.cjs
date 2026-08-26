const { chromium, webkit, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.KEEP_PUBLIC_BASE || 'https://adelkhatra-bit.github.io/KEEP';
const OUT = process.env.KEEP_PUBLIC_EVIDENCE || 'artifacts/public-browser-matrix';
fs.mkdirSync(OUT, { recursive: true });

const scenarios = [
  { name: 'trial-desktop-chromium', engine: chromium, context: { viewport: { width: 1440, height: 900 } } },
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

      const trial = page.getByText('ESSAYER GRATUITEMENT', { exact: true }).last();
      await trial.waitFor({ state: 'visible', timeout: 20000 });
      await page.screenshot({ path: path.join(OUT, `${scenario.name}-before.png`), fullPage: true });
      await trial.click();

      await waitForFiveTabs(page);
      await page.waitForTimeout(800);
      const afterText = await page.locator('body').innerText();
      const afterHtml = await page.locator('body').innerHTML();
      assertVisibleBody(afterText, afterHtml, `${scenario.name} after trial`);
      await page.screenshot({ path: path.join(OUT, `${scenario.name}-after.png`), fullPage: true });

      if (forbiddenAuthRequests.length) {
        throw new Error(`${scenario.name}: l'essai gratuit déclenche encore Supabase Auth: ${forbiddenAuthRequests.join(' | ')}`);
      }

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitForFiveTabs(page);
      await page.waitForTimeout(800);
      const reloadText = await page.locator('body').innerText();
      const reloadHtml = await page.locator('body').innerHTML();
      assertVisibleBody(reloadText, reloadHtml, `${scenario.name} after reload`);
      await page.screenshot({ path: path.join(OUT, `${scenario.name}-reload.png`), fullPage: true });

      if (errors.length) throw new Error(`${scenario.name}: ${errors.join(' | ')}`);
      report.push(`${scenario.name}: PASS — trial opens KEEP, 5 tabs visible, reload survives, no auth signup`);
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
