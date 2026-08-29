/**
 * KEEP Design System — Spacing, radius, typography scale.
 * Centralisé pour éviter toute valeur magique dispersée dans les écrans
 * (cohérence mobile/tablette obligatoire — cf. cahier des charges).
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 34, fontWeight: '700' as const },
  h2: { fontSize: 26, fontWeight: '700' as const },
  h3: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '600' as const },
  caption: { fontSize: 14, fontWeight: '500' as const },
  button: { fontSize: 16, fontWeight: '700' as const },
};

// Touch targets accessibles (Apple HIG / Material minimum ~44-48pt)
export const minTouchTarget = 48;
