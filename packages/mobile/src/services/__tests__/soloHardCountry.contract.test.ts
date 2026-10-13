import fs from 'fs';
import path from 'path';

describe('Solo difficulty: coherent artist origin, genre and era', () => {
  const migration = fs.readFileSync(path.resolve(__dirname, '../../../../supabase/migrations/20261013174500_solo_same_country_harder_distractors.sql'), 'utf8');

  it('never mixes known countries inside one four-choice question', () => {
    expect(migration).toContain('d.country_code is not distinct from p.country_code');
    expect(migration).toContain('country_pool_count>=4');
    expect(migration).toContain('jsonb_array_length(x.choices)=4');
    expect(migration).toContain('jsonb_array_length(v_rounds)');
  });

  it('prioritizes the same musical theme, overlapping genres, and a nearby release era', () => {
    expect(migration).toContain('case when d.theme_code=p.theme_code then 0 else 1 end');
    expect(migration).toContain('case when d.genres && p.genres then 0 else 1 end');
    expect(migration).toContain('abs(p.release_year::integer-d.release_year::integer)<=6');
    expect(migration).not.toContain('global_sample');
    expect(migration).not.toContain('v_sample_artists');
  });

  it('does not invent nationality from track language or ISRC', () => {
    expect(migration).toContain('keep_solo_artist_countries');
    expect(migration).toContain('on conflict(artist_key) do nothing');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on table public.keep_solo_artist_countries from public,anon,authenticated');
    expect(migration).not.toContain('split_part(isrc');
  });
});
