import fs from 'fs';
import path from 'path';
import { normalizeProfileTextList } from '../profileService';

const profileSource = fs.readFileSync(path.resolve(__dirname, '..', 'profileService.ts'), 'utf8').replace(/\r\n/g, '\n');

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

  it('persists the complete profile contract including avatar, location, private info and social links', () => {
    expect(profileSource).toContain("avatar_url: persistedAvatar || null");
    expect(profileSource).toContain("country_code: keepTextUnlessExplicitlyCleared");
    expect(profileSource).toContain("city: keepTextUnlessExplicitlyCleared");
    expect(profileSource).toContain("website: keepTextUnlessExplicitlyCleared");
    expect(profileSource).toContain("client.from('social_links').upsert");
    expect(profileSource).toContain("client.from('profile_private_info').upsert");
    expect(profileSource).toContain("birth_date: birthDate");
    expect(profileSource).toContain("gender,");
    expect(profileSource).toContain("avatar: typeof profile?.avatar_url === 'string' ? profile.avatar_url : ''");
  });
});
