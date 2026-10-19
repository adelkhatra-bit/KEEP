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
/**
 * Adel (17/10/2026) : « sur un ordinateur le design doit être différent ». Un PC à 175 % avec le panneau Claude
 * ouvert n'offre que ~712 px : il recevait la barre d'onglets du téléphone. Sur le web avec une souris, le rendu
 * ordinateur commence dès 700 px (barre latérale réduite aux icônes sous 1024 px). Les téléphones et tablettes
 * tactiles (pas de pointeur fin) gardent leur rendu verrouillé.
 */
export const COMPACT_DESKTOP_MIN_WIDTH = 700;
export const DESKTOP_RAIL_WIDTH = 76;
export const DESKTOP_CONTENT_MAX_WIDTH = 960;
/** Taille de texte minimale lisible (px) imposée sur tablette et bureau. */
export const MIN_READABLE_FONT_SIZE = 11;

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

export function layoutModeFor(width: number, finePointer: boolean, isWeb: boolean = true): LayoutMode {
  if (isWeb && finePointer && width >= COMPACT_DESKTOP_MIN_WIDTH) return 'desktop';
  if (!(width >= PHONE_MAX_WIDTH)) return 'phone';
  if (isWeb && finePointer && width >= DESKTOP_MIN_WIDTH) return 'desktop';
  return 'tablet';
}

