import { test, expect, type Page } from '@playwright/test';

/**
 * Flux navigateur KEEP (mobile web, Expo/React Native Web sur :8081) --
 * couvre ce que `packages/backend/scripts/e2e-smoke-test.ts` ne peut pas
 * atteindre (clics réels, transitions d'écran, état visuel). Ne teste PAS
 * la reconnaissance avec un vrai micro/audio (hors de portée automatisée,
 * voir docs/KEEP_REGRESSION_TESTS.md) -- seulement ce qui est vérifiable
 * sans dépendre d'une identification réelle.
 *
 * Chaque test Playwright démarre avec un contexte navigateur ISOLÉ (pas de
 * cookies/localStorage résiduels d'une session manuelle précédente) --
 * donc une nouvelle session Supabase anonyme "propre" à chaque run, sans
 * quota déjà épuisé par les tests manuels d'Adel plus tôt dans la session.
 */

const MOBILE_URL = process.env.KEEP_MOBILE_URL || 'http://localhost:8081';

const NAV_TABS = ['Session KEEP', 'Découvrir', 'Mes musiques', 'Profil'] as const;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

test.describe('0. BUG BLOQUANT découvert par cette suite -- crash au chargement', () => {
  test('DOCUMENTE UN BUG RÉEL : le chargement de la page plante (page blanche) avant même l’écran idle', async ({ page }) => {
    // Découvert en écrivant cette suite (24/08/2026), PAS un problème
    // d'environnement de test : OnboardingScreen.tsx utilise
    // `useFocusEffect` (@react-navigation/native, ligne ~78) de façon
    // inconditionnelle. App.tsx (ligne 72) rend `<OnboardingScreen />`
    // DIRECTEMENT quand `user` est falsy -- EN DEHORS de `<Navigation />`,
    // donc en dehors de tout `<NavigationContainer>` (seul endroit où
    // NavigationContainer est monté, voir navigation/Navigation.tsx).
    // `useUserStore` est persisté de façon ASYNCHRONE (safeStorage.ts ->
    // AsyncStorage/localStorage) : sur CHAQUE chargement de page, `user`
    // vaut `null` au tout premier rendu (avant que la réhydratation asynchrone
    // ne se termine) -- donc OnboardingScreen se monte TOUJOURS au premier
    // rendu, MÊME pour un invité déjà connu avec un `keep-user` valide en
    // localStorage (vérifié empiriquement : pré-remplir un `keep-user` valide
    // avant navigation ne change RIEN, le crash est identique). Résultat :
    // `useFocusEffect` jette "Couldn't find a navigation object. Is your
    // component inside NavigationContainer?", aucun ErrorBoundary ne
    // l'intercepte -- toute l'app reste blanche en permanence (confirmé :
    // le HTML de #root reste vide même après 15s d'attente).
    //
    // Ce test échoue INTENTIONNELLEMENT tant que ce bug n'est pas corrigé --
    // c'est la preuve reproductible, pas une erreur d'écriture de test.
    // Corrélation git : App.tsx, Navigation.tsx et OnboardingScreen.tsx sont
    // TOUS les trois actuellement modifiés et non commités (voir `git status`)
    // -- probable régression très récente introduite par le correctif
    // `useFocusEffect` ("reste MONTÉ entre deux ouvertures de la modale
    // CreateAccount", commentaire ligne ~69 d'OnboardingScreen.tsx), qui a
    // réglé un bug (état obsolète au réouverture de la modale CreateAccount)
    // tout en en introduisant un nouveau, bien plus grave, sur l'écran
    // d'entrée racine. Adel n'a probablement pas revu ce cas car son propre
    // navigateur a déjà un `user` en mémoire d'onglet depuis ses tests
    // précédents dans la même session -- ce crash au tout premier rendu passe
    // inaperçu tant que l'onglet n'est jamais rechargé depuis zéro.
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(MOBILE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    const bodyText = (await page.locator('body').innerText()).trim();
    expect(
      bodyText.length,
      `page blanche confirmée -- 0 caractère de contenu rendu. Erreurs capturées : ${pageErrors.join(' | ')}`
    ).toBeGreaterThan(0);
  });
});

test.describe('1. Écran idle Guest', () => {
  test('charge avec le branding KEEP, les 4 onglets nav et le bouton Capturer ce moment', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(MOBILE_URL, { waitUntil: 'load' });

    await expect(page.getByText('KEEP', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Capturer ce moment', { exact: true })).toBeVisible();

    for (const label of NAV_TABS) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    expect(errors, `erreurs console au chargement de l'écran idle:\n${errors.join('\n')}`).toEqual([]);
  });
});

test.describe('2. Transition capture (garde-fou anti-bannière obsolète)', () => {
  test('taper Capturer ce moment ouvre la session active : timer, "0 morceaux détectés", aucune bannière', async ({ page }) => {
    await page.goto(MOBILE_URL, { waitUntil: 'load' });
    await page.getByText('Capturer ce moment', { exact: true }).click();

    // Titre de la session active.
    await expect(page.getByText('KEEP capture ce moment', { exact: true })).toBeVisible({ timeout: 15000 });

    // Timer au format HH:MM:SS, doit apparaître très vite après le tap.
    await expect(page.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeVisible({ timeout: 5000 });

    // "0 morceaux détectés" -- session fraîche, aucun morceau encore identifié.
    await expect(page.getByText(/^0 morceaux détectés/)).toBeVisible({ timeout: 5000 });

    // BUG RÉEL corrigé le 24/08/2026 : la bannière d'inscription
    // ("Ta musique mérite son profil.") s'affichait EN MÊME TEMPS que
    // "0 morceaux détectés" -- incohérent, KEEP n'a pas encore pu atteindre
    // de limite pour une session tout juste démarrée. Garde-fou direct :
    // aucune des deux bannières de limite ne doit être présente ici.
    await expect(page.getByText('Ta musique mérite son profil.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Tu as identifié toute ta musique gratuite.', { exact: true })).toHaveCount(0);

    // Aucune bannière d'erreur (liveErrorBanner) ne doit être visible à ce
    // stade -- la première tentative de capture (10s, voir
    // recognitionSettings.ts) n'a pas encore eu le temps d'échouer.
    const errorBannerTexts = [
      'Permission microphone refusée',
      "Autorise l'accès au micro",
      'KEEP n’entend pas assez de son',
      'Reconnaissance momentanément indisponible',
    ];
    for (const text of errorBannerTexts) {
      await expect(page.getByText(text)).toHaveCount(0);
    }
  });
});

test.describe('3. Onglets de navigation (garde-fou anti-page-blanche)', () => {
  for (const tab of NAV_TABS) {
    test(`l'onglet "${tab}" s'affiche sans page blanche ni erreur console`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(MOBILE_URL, { waitUntil: 'load' });

      await page.getByText(tab, { exact: true }).first().click();
      // Laisse le temps à l'écran (et ses éventuels effets async) de se
      // monter avant de vérifier le contenu et les erreurs.
      await page.waitForTimeout(800);

      const bodyText = (await page.locator('body').innerText()).trim();
      expect(bodyText.length, `page blanche détectée sur l'onglet "${tab}"`).toBeGreaterThan(0);

      expect(errors, `erreurs console sur l'onglet "${tab}":\n${errors.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('Bonus -- résilience localStorage corrompu (garde-fou racine du bug page blanche)', () => {
  test('un store persisté avec un JSON corrompu ne fait pas planter le chargement (voir store/safeStorage.ts)', async ({ page }) => {
    // Reproduit exactement la cause racine réelle documentée dans
    // packages/mobile/src/store/safeStorage.ts : une entrée localStorage
    // corrompue faisait planter zustand/persist AU CHARGEMENT DU MODULE,
    // avant le premier rendu React -- page blanche non récupérable par un
    // simple refresh. `addInitScript` pose ces clés AVANT que le bundle de
    // l'app ne s'exécute, comme le "vrai" localStorage corrompu d'Adel.
    await page.addInitScript(() => {
      window.localStorage.setItem('keep-user', '{not valid json!!');
      window.localStorage.setItem('keep-session-history', '{"broken":');
      window.localStorage.setItem('keep-music-services', 'undefined');
    });

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(MOBILE_URL, { waitUntil: 'load' });

    await expect(page.getByText('KEEP', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Capturer ce moment', { exact: true })).toBeVisible();

    expect(errors, `erreurs JS non interceptées avec localStorage corrompu:\n${errors.join('\n')}`).toEqual([]);
  });
});
