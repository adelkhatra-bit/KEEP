import { clampWords, CLAMP_WORDS } from '../clampWords';

describe('clampWords (écran Offres compact)', () => {
  it('garde un texte court tel quel', () => {
    expect(clampWords('Achat ponctuel')).toEqual({ short: 'Achat ponctuel', clamped: false });
  });
  it('coupe à 2 mots avec une ellipse (règle d’Adel)', () => {
    const long = Array.from({ length: 40 }, (_, i) => `mot${i}`).join(' ');
    const r = clampWords(long);
    expect(r.clamped).toBe(true);
    expect(r.short.replace('…', '').trim().split(' ')).toHaveLength(CLAMP_WORDS);
    expect(long.startsWith(r.short.replace('…', ''))).toBe(true);
  });
  it('ne coupe pas pile à la limite', () => {
    const exact = Array.from({ length: CLAMP_WORDS }, () => 'a').join(' ');
    expect(clampWords(exact).clamped).toBe(false);
  });
});
