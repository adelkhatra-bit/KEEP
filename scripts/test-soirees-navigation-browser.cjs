// Real rendered application; test-only account and intercepted backend, no production writes.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('@playwright/test')); }
const { seedApprovedDevice, isolateSurfaceGateFromProduction, gateAuthPages } = require('./web-visible-surface-gate.cjs');
const base = process.argv[2];
const output = process.env.LOKI_PROOF_DIR || '/tmp/loki-soirees-proof';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    for (const [width, height, mobile] of [[1440, 900, false], [1366, 650, false], [390, 844, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, locale: 'fr-FR' });
      await seedApprovedDevice(context);
      const page = await context.newPage();
      gateAuthPages.add(page);
      await isolateSurfaceGateFromProduction(page);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/Main/Parties/', { waitUntil: 'domcontentloaded' });
      await page.getByTestId('parties-home-actions').waitFor({ state: 'visible', timeout: 30000 }).catch(async error => { await page.screenshot({ path: path.join(output, 'failure.png') }); console.error(await page.locator('body').innerText(), errors); throw error; });
      for (let cycle = 0; cycle < 2; cycle++) {
        await page.getByRole('button', { name: 'Ouvrir directement Battle', exact: true }).click();
        await page.getByTestId('desktop-battle-stage').waitFor({ state: 'visible' });
        if (cycle === 0) {
          await page.screenshot({ path: path.join(output, `battle-${width}.png`), fullPage: false });
          if (!mobile) {
            const stage = await page.getByTestId('desktop-battle-stage').boundingBox();
            const setup = await page.getByText('FORMAT DU BATTLE', { exact: true }).boundingBox();
            assert(stage.width > width * 0.7, 'Battle must fill desktop content area');
            assert(setup, 'Battle setup must be visible');
          }
        }
        if (mobile) await page.getByText('Soirées', { exact: true }).click();
        else await page.getByTestId('desktop-nav-Parties').click();
        await page.getByTestId('parties-home-actions').waitFor({ state: 'visible' });
        assert.equal(await page.getByTestId('desktop-battle-stage').count(), 0, 'Soirées must close Battle');
      }
      await page.screenshot({ path: path.join(output, `soirees-${width}.png`), fullPage: false });
      assert.deepEqual(errors, [], 'No uncaught application errors');
      console.log(`PASS ${width}x${height}: Battle → global Soirées twice; no JS errors`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
