import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261013220000_solo_fr_us_genre_country_lock.sql'), 'utf8');

describe('Solo category consistency — France, US and other verified origins', () => {
  it('selects French singers only for French chanson and French rap category', () => {
    expect(sql).toContain("theme_code in ('CHANSON_FR','RAP_FR') and country_code='FR'");
    expect(sql).toContain("theme_code='RAP_US' and country_code='US'");
  });

  it('does not fabricate nationality when the catalogue does not know the origin', () => {
    expect(sql).toContain('country_pool_count>=4');
    expect(sql).toContain('d.country_code is not distinct from p.country_code');
    expect(sql).toContain('on conflict(artist_key) do nothing');
  });

  it('keeps artist options limited to four, playlists excluded and session rewards intact', () => {
    expect(sql).toContain('jsonb_array_length(x.choices)=4');
    expect(sql).toContain('BATTLE_THEME_CATALOG_TOO_SMALL');
    expect(sql).toContain('public.playlist_tracks');
    expect(sql).toContain("'stakeFree',0,'rewardFree',0");
  });

  it('enriches French category with verified real artists', () => {
    expect(sql).toContain("('alain bashung','FR','editorial-curation')");
    expect(sql).toContain("('françoise hardy','FR','editorial-curation')");
    expect(sql).toContain("('jeanne mas','FR','editorial-curation')");
    expect(sql).toContain("('grand corps malade','FR','editorial-curation')");
  });
});
