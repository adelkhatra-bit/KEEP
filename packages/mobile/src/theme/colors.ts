/**
 * KEEP Design System — Colors
 *
 * Direction: premium, moderne, sombre, violet KEEP, lisible, international.
 * Règle absolue du cahier des charges : PASSER = rouge/corail, GARDER = turquoise/vert menthe.
 * Ne jamais inverser ces deux couleurs (risque de confusion d'action destructrice vs positive).
 */

export const colors = {
  // Fond
  background: '#0B0A12',
  backgroundElevated: '#151320',
  backgroundCard: '#1C1930',
  border: '#2A2640',

  // Marque — violet KEEP
  primary: '#7C5CFC',
  primaryDark: '#5B3FE0',
  primaryLight: '#A78BFA',

  // Actions du parcours GARDER (écran central de l'app)
  keep: '#2DE1C2', // turquoise / vert menthe joyeux — bouton GARDER
  keepPressed: '#22B8A0',
  pass: '#FF5C72', // corail — bouton PASSER (jamais utilisé pour GARDER)
  passPressed: '#E14A5F',

  // Texte
  textPrimary: '#F5F3FF',
  textSecondary: '#B4AFCB',
  textMuted: '#7A7594',

  // États
  success: '#2DE1C2',
  warning: '#FFB454',
  danger: '#FF5C72',
  info: '#5CA8FC',

  // Badges
  demoBadgeBg: 'rgba(255, 180, 84, 0.16)',
  demoBadgeBorder: '#FFB454',
  demoBadgeText: '#FFB454',

  smartBadgeBg: 'rgba(124, 92, 252, 0.18)',
  smartBadgeText: '#A78BFA',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const gradients = {
  primary: ['#7C5CFC', '#5B3FE0'],
  keepGlow: ['#2DE1C2', '#1FA890'],
};

export type ColorToken = keyof typeof colors;
