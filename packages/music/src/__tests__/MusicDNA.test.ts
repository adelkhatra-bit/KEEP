import { computeMusicDNA, compareMusicDNA } from '../MusicDNA';

describe('MusicDNA', () => {
  it('calcule les genres dominants à partir des GARDER (jamais des PASSER)', () => {
    const dna = computeMusicDNA([
      { artist: 'A', genres: ['afro house'], decision: 'KEPT', createdAt: '2026-01-01' },
      { artist: 'B', genres: ['afro house'], decision: 'KEPT', createdAt: '2026-01-02' },
      { artist: 'C', genres: ['metal'], decision: 'PASSED', createdAt: '2026-01-03' },
    ]);
    expect(dna.topGenres[0].genre).toBe('afro house');
    expect(dna.totalDecisions).toBe(2);
  });

  it('un ADN concentré sur un seul genre a une diversité proche de 0', () => {
    const dna = computeMusicDNA([
      { artist: 'A', genres: ['afro house'], decision: 'KEPT', createdAt: '2026-01-01' },
      { artist: 'B', genres: ['afro house'], decision: 'KEPT', createdAt: '2026-01-02' },
    ]);
    expect(dna.diversityScore).toBe(0);
  });

  it('deux ADN identiques ont une compatibilité de 1', () => {
    const dna = computeMusicDNA([{ artist: 'A', genres: ['pop', 'afro house'], decision: 'KEPT', createdAt: '2026-01-01' }]);
    expect(compareMusicDNA(dna, dna)).toBeCloseTo(1, 5);
  });

  it('deux ADN sans genre commun ont une compatibilité de 0', () => {
    const dnaA = computeMusicDNA([{ artist: 'A', genres: ['metal'], decision: 'KEPT', createdAt: '2026-01-01' }]);
    const dnaB = computeMusicDNA([{ artist: 'B', genres: ['classical'], decision: 'KEPT', createdAt: '2026-01-01' }]);
    expect(compareMusicDNA(dnaA, dnaB)).toBe(0);
  });
});
