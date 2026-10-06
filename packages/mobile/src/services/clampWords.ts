// Adel (06/10/2026) : textes longs = ~23 premiers mots puis « En savoir plus ».
export const CLAMP_WORDS = 23;

export function clampWords(text: string, max = CLAMP_WORDS): { short: string; clamped: boolean } {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return { short: text, clamped: false };
  return { short: `${words.slice(0, max).join(' ')}…`, clamped: true };
}
