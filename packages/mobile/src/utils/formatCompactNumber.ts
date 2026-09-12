// Adel (03/09/2026) : "si demain il y a 10 millions d'abonnés, il faut pas
// mettre 10 millions en chiffre, il faut mettre les deux premiers chiffres et
// l'initiale -- comme TikTok pour les vues" -- format compact (1,2K / 340K /
// 2,1M / 10M) au lieu du nombre brut, partout où un compteur (abonnés, vues,
// victoires...) peut grimper haut.
export function formatCompactNumber(value: number): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs < 1000) return `${n}`;
  const format = (divided: number, suffix: string) => {
    const rounded = Math.floor(divided * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
    return `${sign}${text}${suffix}`;
  };
  if (abs < 1_000_000) return format(abs / 1000, 'K');
  if (abs < 1_000_000_000) return format(abs / 1_000_000, 'M');
  return format(abs / 1_000_000_000, 'B');
}
