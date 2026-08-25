import { test, expect } from '@playwright/test';

/**
 * Garde d'authentification Super Admin (Next.js, :3001) -- branchée le
 * 24/08/2026 (voir packages/admin/components/AdminLayout.tsx +
 * pages/login.tsx). AdminLayout affiche "Vérification de la session…" puis
 * `window.location.href = '/login'` dès que `getSession()` répond sans
 * session active (ou après un filet de sécurité de 5s si `getSession()` ne
 * répond jamais, voir commentaire du fichier) -- jamais un accès "ouvert"
 * au dashboard, même en Mode Démo.
 */

const ADMIN_URL = process.env.KEEP_ADMIN_URL || 'http://localhost:3001';

test.describe('4. Garde d’authentification Super Admin', () => {
  test('un visiteur non authentifié sur / est redirigé vers /login (jamais le dashboard)', async ({ page }) => {
    // La redirection ("Vérification de la session…" -> `window.location.href
    // = '/login'`, voir AdminLayout.tsx) peut se produire en quelques
    // centaines de ms si `getSession()` répond vite (observé en pratique) --
    // on n'affirme donc PAS que l'état transitoire reste observable, juste
    // que la destination finale est bien /login, jamais le dashboard. Filet
    // de sécurité de 5s codé dans AdminLayout.tsx si getSession() ne répond
    // jamais -- 15s laisse largement la marge pour ce pire cas.
    await page.goto(`${ADMIN_URL}/`, { waitUntil: 'load' });
    await page.waitForURL('**/login', { timeout: 15000 });

    expect(page.url()).toContain('/login');
    // Le dashboard (lien nav "Utilisateurs", visible uniquement une fois
    // connecté) ne doit jamais avoir été atteint.
    await expect(page.getByText('Utilisateurs', { exact: true })).toHaveCount(0);
  });
});

test.describe('5. Formulaire de connexion Super Admin', () => {
  test('/login affiche un vrai formulaire e-mail + mot de passe', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'load' });

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'Adresse e-mail');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('placeholder', 'Mot de passe');

    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();

    // Champs réellement requis (pas de faux formulaire décoratif).
    await expect(emailInput).toHaveAttribute('required', '');
    await expect(passwordInput).toHaveAttribute('required', '');
  });
});
