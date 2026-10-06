// Adel (06/10/2026, soir) : RÈGLE « 2 mots maximum, ensuite En savoir plus » (remplace la limite de 23 mots).
export const CLAMP_WORDS = 2;

export function clampWords(text: string, max = CLAMP_WORDS): { short: string; clamped: boolean } {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return { short: text, clamped: false };
  return { short: `${words.slice(0, max).join(' ')}…`, clamped: true };
}
