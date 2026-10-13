import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261013174500_solo_same_country_harder_distractors.sql'),
  'utf8',
);

describe('Solo hard mode: authentic artist origins and credible wrong answers', () => {
  it('preserves four alternatives per question and never changes FREE rewards', () => {
    expect(sql).toContain('jsonb_array_length(x.choices)=4');
    expect(sql).toContain("'stakeFree',0,'rewardFree',0");
    expect(sql).toContain('BATTLE_THEME_CATALOG_TOO_SMALL');
    expect(sql).toContain('keep_battle_remember_content');
  });

  it('uses explicit editorial origin, never infers nationality from ISRC or language', () => {
    expect(sql).toContain('keep_solo_artist_countries');
    expect(sql).toContain('on conflict(artist_key) do nothing');
    expect(sql).toContain("('taylor swift','US')");
    expect(sql).toContain("('frank sinatra','US')");
    expect(sql).toContain("('aya nakamura','FR')");
    expect(sql).toContain("('jul','FR')");
    expect(sql).toContain("('stromae','BE')");
    expect(sql).toContain("('drake','CA')");
  });

  it('never offers a different known country alongside a known-country correct artist', () => {
    expect(sql).toContain('(p.origin_country_code is not null and d.origin_country_code=p.origin_country_code)');
    expect(sql).toContain('(p.origin_country_code is null and d.origin_country_code is null)');
    expect(sql).toContain('origin_artist_count>=4');
    expect(sql).toContain('case when origin_country_code is not null then 0 else 1 end');
  });

  it('prefers matching genres, exact musical theme, and close release dates', () => {
    expect(sql).toContain('d.theme_code=p.theme_code');
    expect(sql).toContain('d.genres && p.genres');
    expect(sql).toContain('abs(p.release_year::integer-d.release_year::integer)<=6');
    expect(sql).not.toContain('global_sample as');
  });

  it('keeps artist-country annotations private while using the existing RPC security model', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on public.keep_solo_artist_countries from public,anon,authenticated');
    expect(sql).toContain('SECURITY DEFINER');
  });
});
