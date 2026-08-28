/**
 * Supabase renvoie `null` lorsqu'un profil n'a jamais partagé sa position.
 * `Number(null)` vaut 0 en JavaScript : sans ce garde-fou, un profil sans GPS
 * était interprété comme étant en 0,0 et affichait une fausse distance.
 */
export function normalizeOptionalCoordinate(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
