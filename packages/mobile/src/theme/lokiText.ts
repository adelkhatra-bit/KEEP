export const lokiText = {
  screenTitle: { fontSize: 28, fontWeight: '800' as const, lineHeight: 36 },
  blockTitle: { fontSize: 18, fontWeight: '800' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '500' as const, lineHeight: 21 },
  secondary: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '800' as const, lineHeight: 14, letterSpacing: 0.4 },
  button: { fontSize: 15, fontWeight: '800' as const, lineHeight: 18 },
} as const;

export type LokiTextVariant = keyof typeof lokiText;

export const LOKI_MIN_FONT_SIZE = 11;
