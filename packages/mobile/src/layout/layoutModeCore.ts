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
/** Un ordinateur (web + souris) reste un ordinateur dès 640 px : barre latérale COMPACTE entre 640 et 1023 px (Adel, 11/10/2026 : « quand je rétrécis la fenêtre j'ai l'impression de passer sur le mobile »). */
export const DESKTOP_COMPACT_MIN_WIDTH = 640;
export const DESKTOP_COMPACT_SIDEBAR_WIDTH = 72;
export const DESKTOP_SIDEBAR_WIDTH = 232;
export const DESKTOP_CONTENT_MAX_WIDTH = 960;
/** Taille de texte minimale lisible (px) imposée sur tablette et bureau. */
export const MIN_READABLE_FONT_SIZE = 11;

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

/** Barre latérale compacte (icônes + infobulles) : bureau entre 640 et 1023 px. */
export function isCompactDesktopWidth(width: number): boolean {
  return width < DESKTOP_MIN_WIDTH;
}

export function layoutModeFor(width: number, finePointer: boolean, isWeb: boolean = true): LayoutMode {
  // Web + pointeur fin (souris / trackpad) : bureau dès 640 px, quelle que soit la largeur de la fenêtre.
  if (isWeb && finePointer && width >= DESKTOP_COMPACT_MIN_WIDTH) return 'desktop';
  if (!(width >= PHONE_MAX_WIDTH)) return 'phone';
  return 'tablet';
}

