import { normalizeOptionalCoordinate } from '../discoveryCoordinate';

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
