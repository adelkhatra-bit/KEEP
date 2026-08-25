import { defineConfig } from '@playwright/test';

/**
 * Config Playwright KEEP (packages/mobile/e2e) -- couvre ce que
 * `packages/backend/scripts/e2e-smoke-test.ts` ne peut pas atteindre :
 * navigation UI réelle dans un navigateur (clics, transitions d'écran,
 * état visuel), jamais les appels API directs déjà couverts là-bas.
 *
 * Cible les serveurs de dev déjà lancés en local (mobile web sur :8081,
 * admin Next.js sur :3001) -- pas de `webServer` ici, ces process sont
 * démarrés/gérés séparément (voir CLAUDE.md -- jamais deux process qui se
 * marchent dessus). Pas de test avec micro/audio réel (hors de portée
 * automatisée, voir docs/KEEP_REGRESSION_TESTS.md).
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    // Micro accordé + périphérique synthétique (jamais de vrai matériel
    // requis, jamais de prompt de permission bloquant) -- nécessaire pour
    // que le tap "Capturer ce moment" démarre la capture sans tomber
    // immédiatement sur la bannière "Permission microphone refusée"
    // (voir micCapture.ts). Ne teste PAS la reconnaissance elle-même (hors
    // de portée sans vrai audio, voir docs/KEEP_REGRESSION_TESTS.md).
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
  ],
});
