import { normalizeProfileTextList } from '../profileService';

describe('profileService production resilience', () => {
  it('normalizes the real Inside-style preference shape without throwing', () => {
    const genres = normalizeProfileTextList([
      'R&B/Soul',
      'Hip-hop/Rap',
      'Hip-Hop/Rap',
      ' Dance ',
      'Pop',
      'Funk',
      'Slow / Love',
      'Afrique du Nord',
      'Afrobeat',
      'House',
      'Latin',
      'Musiques du monde',
    ]);
    expect(genres).toContain('R&B/Soul');
    expect(genres).toContain('Hip-hop/Rap');
    expect(genres.filter((value) => value.toLowerCase() === 'hip-hop/rap')).toHaveLength(1);
    expect(genres).toContain('Dance');
  });

  it('treats malformed server values as empty data instead of crashing a profile', () => {
    expect(normalizeProfileTextList(null)).toEqual([]);
    expect(normalizeProfileTextList({ bad: true })).toEqual([]);
    expect(normalizeProfileTextList(['Rock', null, 42, '  ', 'ROCK'] as unknown)).toEqual(['Rock']);
  });

  it('bounds corrupted or abusive payloads before they reach the UI', () => {
    const huge = Array.from({ length: 2000 }, (_, index) => `Genre ${index}`);
    expect(normalizeProfileTextList(huge)).toHaveLength(250);
  });
});
