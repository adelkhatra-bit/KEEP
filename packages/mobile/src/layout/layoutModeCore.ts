// Logique pure (sans react-native) : testable en Node.
/**
 * UNE SEULE source pour « téléphone / tablette / bureau » (Adel, 11/10/2026).
 *
 * Cause racine de « je ne vois aucun changement sur ordinateur » : le vrai rendu
 * bureau ne démarrait qu'à 1100 px alors qu'un PC Windows réglé à 175 % d'échelle
 * n'offre que 1098 px CSS (712 px avec le panneau Claude ouvert). Seuils dispersés :
 * 800 (SessionHistory), 900 (index.js, GlobalChatDock), 1100 (index.js, QR, rail).
 *
 * Règles :
 *  - téléphone  : largeur < 900  -> rendu verrouillé, jamais modifié ;
 *  - tablette   : 900 <= largeur < 1024 (ou >= 1024 sans souris) ;
 *  - bureau     : web, largeur >= 1024 ET pointeur fin (souris/trackpad).
 * Les constantes sont reprises telles quelles par le CSS de index.js (mêmes nombres).
 */
export const PHONE_MAX_WIDTH = 900;
export const DESKTOP_MIN_WIDTH = 1024;
export const DESKTOP_SIDEBAR_WIDTH = 232;
export const DESKTOP_CONTENT_MAX_WIDTH = 960;
/** Taille de texte minimale lisible (px) imposée sur tablette et bureau. */
export const MIN_READABLE_FONT_SIZE = 11;

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

export function layoutModeFor(width: number, finePointer: boolean, isWeb: boolean = true): LayoutMode {
  if (!(width >= PHONE_MAX_WIDTH)) return 'phone';
  if (isWeb && finePointer && width >= DESKTOP_MIN_WIDTH) return 'desktop';
  return 'tablet';
}

