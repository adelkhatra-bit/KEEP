import { earPoints, earLevel, earChallenges, communityReport, EarRaw } from '../earReport';

const base: EarRaw = { given: 0, early_hits: 0, early_keeps: 0, received: 0, followers: 0, followers_30: 0, styles_explored: 0, genres: [], pioneer_styles: [], audience: [] };

describe('Mon oreille', () => {
  it('le repérage précoce pèse plus que la simple réaction', () => {
    expect(earPoints({ ...base, given: 10 })).toBe(10);
    expect(earPoints({ ...base, early_hits: 2, pioneer_styles: [{ genre: 'afro', rank: 1 }] })).toBe(20);
  });
  it('niveaux et progression', () => {
    expect(earLevel(0).label).toBe('Oreille curieuse');
    expect(earLevel(35).label).toBe('Oreille experte');
    expect(earLevel(35).toNext).toBe(45);
    expect(earLevel(500).next).toBeNull();
  });
  it('défis : le plus proche non fait en premier', () => {
    const c = earChallenges({ ...base, given: 18, styles_explored: 1 });
    expect(c[0].key).toBe('given');
    expect(c.every((x) => !x.done)).toBe(true);
  });
  it('rapport : forces, faiblesses, opportunités chiffrées', () => {
    const r = communityReport({
      ...base, followers: 5, followers_30: 2,
      genres: [{ genre: 'afro', tracks: 4, likes: 9, mehs: 1, dislikes: 0 }, { genre: 'rock', tracks: 2, likes: 0, mehs: 2, dislikes: 3 }],
      audience: [{ genre: 'rap', fans: 3 }], pioneer_styles: [{ genre: 'amapiano', rank: 2 }],
    });
    expect(r.strengths[0]).toContain('Afro : 90 %');
    expect(r.strengths.join(' ')).toContain('n°2');
    expect(r.weaknesses[0]).toContain('Rock');
    expect(r.opportunities[0]).toContain('Rap');
  });
  it('compte vide : aucune phrase inventée', () => {
    const r = communityReport(base);
    expect(r.strengths).toHaveLength(0);
    expect(r.weaknesses[0]).toContain('Aucun partage');
  });
});
