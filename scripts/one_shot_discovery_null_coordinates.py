from pathlib import Path

screen = Path('packages/mobile/src/screens/DiscoverScreen.tsx')
service = Path('packages/mobile/src/services/discoveryCoordinate.ts')
test = Path('packages/mobile/src/services/__tests__/discoveryCoordinate.test.ts')

s = screen.read_text(encoding='utf-8')

import_anchor = "import { loadPublicProfileSnapshot, PublicProfileSnapshot } from '../services/publicProfileStateService';\n"
import_line = "import { normalizeOptionalCoordinate } from '../services/discoveryCoordinate';\n"
if import_line not in s:
    if import_anchor not in s:
        raise SystemExit('Discover import anchor missing')
    s = s.replace(import_anchor, import_anchor + import_line, 1)

old = "    approxLat: Number.isFinite(Number(row.approx_lat)) ? Number(row.approx_lat) : undefined,\n    approxLng: Number.isFinite(Number(row.approx_lng)) ? Number(row.approx_lng) : undefined,"
new = "    approxLat: normalizeOptionalCoordinate(row.approx_lat),\n    approxLng: normalizeOptionalCoordinate(row.approx_lng),"
if old not in s:
    raise SystemExit('Discover coordinate normalization anchor missing')
s = s.replace(old, new, 1)
screen.write_text(s, encoding='utf-8')

service.parent.mkdir(parents=True, exist_ok=True)
service.write_text("""/**
 * Supabase renvoie `null` lorsqu'un profil n'a jamais partagé sa position.
 * `Number(null)` vaut 0 en JavaScript : sans ce garde-fou, un profil sans GPS
 * était interprété comme étant en 0,0 et affichait une fausse distance.
 */
export function normalizeOptionalCoordinate(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
""", encoding='utf-8')

test.parent.mkdir(parents=True, exist_ok=True)
test.write_text("""import { normalizeOptionalCoordinate } from '../discoveryCoordinate';

describe('normalizeOptionalCoordinate', () => {
  it('ne transforme jamais une coordonnée Supabase nulle en 0', () => {
    expect(normalizeOptionalCoordinate(null)).toBeUndefined();
    expect(normalizeOptionalCoordinate(undefined)).toBeUndefined();
    expect(normalizeOptionalCoordinate('')).toBeUndefined();
  });

  it('conserve les vraies coordonnées, y compris zéro explicite', () => {
    expect(normalizeOptionalCoordinate(45.764)).toBe(45.764);
    expect(normalizeOptionalCoordinate('4.836')).toBe(4.836);
    expect(normalizeOptionalCoordinate(0)).toBe(0);
    expect(normalizeOptionalCoordinate('0')).toBe(0);
  });

  it('ignore les valeurs non numériques', () => {
    expect(normalizeOptionalCoordinate('Lyon')).toBeUndefined();
    expect(normalizeOptionalCoordinate(Number.NaN)).toBeUndefined();
  });
});
""", encoding='utf-8')

print('Discover null-coordinate fix staged safely')
