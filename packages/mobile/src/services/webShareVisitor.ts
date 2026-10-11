import { Platform } from 'react-native';

/**
 * Visiteur d'un lien partagé sur le web (Adel, 06/10/2026) : « je partage mon profil, il faut que l'utilisateur voie comme
 * un utilisateur connecté, sauf avec des fonctions bloquées ». Avant, le lien ouvrait une page séparée (share-profile.html)
 * avec son propre design ; sur le web un invité tombait sinon sur l'écran d'appairage QR. Désormais un lien `?u=<pseudo>&share=…`
 * ouvre la VRAIE application en mode invité (fonctions d'écriture bloquées par la porte de compte existante), directement
 * sur le profil partagé. La règle « pas d'accès ordinateur sans appairage » reste vraie pour tout le reste : sans lien
 * partagé, le web affiche toujours l'appairage QR. La visite survit au rafraîchissement (sessionStorage, onglet seulement).
 */
const KEY = 'loki-web-share-visit';
const PSEUDO = /^[A-Za-z0-9_.-]{1,40}$/;

export function shareVisitUsernameFromUrl(href: string): string {
  try {
    const url = new URL(href);
    if (!url.searchParams.has('share')) return '';
    const u = String(url.searchParams.get('u') || '').trim().replace(/^@+/, '');
    return PSEUDO.test(u) ? u : '';
  } catch { return ''; }
}

let visitUsername = '';
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const fromUrl = shareVisitUsernameFromUrl(window.location.href);
  try {
    if (fromUrl) window.sessionStorage.setItem(KEY, fromUrl);
    visitUsername = fromUrl || String(window.sessionStorage.getItem(KEY) || '');
  } catch { visitUsername = fromUrl; }
  if (!PSEUDO.test(visitUsername)) visitUsername = '';
}

/** Pseudo du profil partagé ouvert dans cet onglet (web uniquement), sinon ''. */
export function webShareVisitUsername(): string { return visitUsername; }
export function isWebShareVisit(): boolean { return Boolean(visitUsername); }
/** Le visiteur a créé son compte / s'est connecté : fin de la visite invitée. */
export function endWebShareVisit(): void {
  visitUsername = '';
  try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(KEY); } catch { /* rien */ }
}
