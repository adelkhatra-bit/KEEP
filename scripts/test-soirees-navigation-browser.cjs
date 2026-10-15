// Browser regression for the real Soirées/Battle navigation and desktop layout.
// Uses the local test-only account/backend isolation; no production writes.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('@playwright/test')); }
const { seedApprovedDevice, isolateSurfaceGateFromProduction, gateAuthPages } = require('./web-visible-surface-gate.cjs');
const base = process.argv[2];
const output = process.env.LOKI_PROOF_DIR || '/tmp/loki-soirees-proof';

const visible = (locator) => locator.filter({ visible: true }).last();

(async () => {
  if (!base) throw new Error('Missing local KEEP Web base URL');
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
      page.on('pageerror', error => { errors.push(error.stack || error.message); console.error('BATTLE_PAGE_ERROR', error.stack || error.message); });
      page.on('console', message => {
        if (message.type() === 'error') {
          errors.push(message.text());
          console.error('BATTLE_CONSOLE_ERROR', message.text());
        }
      });
      await page.goto(base + '/Main/Parties/', { waitUntil: 'domcontentloaded' });
      const home = visible(page.getByTestId('parties-home-actions'));
      await home.waitFor({ state: 'visible', timeout: 30000 });
      for (let cycle = 0; cycle < 2; cycle++) {
        await visible(page.getByRole('button', { name: 'Ouvrir directement Battle', exact: true })).click({ timeout: 15000 });
        const stage = visible(page.getByTestId('desktop-battle-stage'));
        await stage.waitFor({ state: 'visible', timeout: 30000 }).catch(async error => {
          console.error('BATTLE_STAGE_NOT_VISIBLE', errors, (await page.locator('body').innerText()).slice(0, 2500));
          await page.screenshot({ path: path.join(output, `battle-crash-${width}.png`), fullPage: false });
          throw error;
        });
        const rootCrash = visible(page.getByText('Loki Music reste disponible', { exact: true }));
        if (await rootCrash.isVisible().catch(() => false)) {
          await page.screenshot({ path: path.join(output, `battle-root-crash-${width}.png`), fullPage: false });
          throw new Error(`Root render boundary while opening Battle at ${width}x${height}: ${(await page.locator('body').innerText()).slice(0, 1600)}`);
        }
        if (cycle === 0) {
          await page.screenshot({ path: path.join(output, `battle-${width}.png`), fullPage: false });
          if (!mobile) {
            // Evaluate the actual rendered element after it is visible; don't
            // call boundingBox on a hidden duplicate left by the navigation stack.
            const box = await stage.evaluate(el => {
              const r = el.getBoundingClientRect();
              const css = getComputedStyle(el);
              return { x:r.x, y:r.y, width:r.width, height:r.height, display:css.display, visibility:css.visibility };
            });
            assert(box.display !== 'none' && box.visibility !== 'hidden' && box.height > 0, 'Battle stage must be visibly rendered');
            assert(box.width > width * 0.7, `Battle must fill desktop content area: ${JSON.stringify(box)}`);
            await page.getByText('FORMAT DU BATTLE', { exact: true }).filter({ visible: true }).last().waitFor({ state: 'visible', timeout: 15000 });
          }
        }
        const globalSoirees = mobile
          ? visible(page.getByRole('button', { name: 'Aller à l’onglet Soirées', exact: true }))
          : visible(page.getByTestId('desktop-nav-Parties'));
        await globalSoirees.click({ timeout: 15000 });
        await visible(page.getByTestId('parties-home-actions')).waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('desktop-battle-stage').filter({ visible: true }).waitFor({ state: 'hidden', timeout: 10000 });
        assert.equal(await page.getByTestId('desktop-battle-stage').filter({ visible: true }).count(), 0, 'Global Soirées must close the Battle panel');
      }
      await page.screenshot({ path: path.join(output, `soirees-${width}.png`), fullPage: false });
      assert.deepEqual(errors, [], 'No uncaught application errors');
      console.log(`PASS ${width}x${height}: Battle → global Soirées twice; no JS errors`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
