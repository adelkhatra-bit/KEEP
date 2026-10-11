// @ts-nocheck
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261002007000_loki_pulse_fast_nonblocking.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Loki Pulse fast non-blocking contract', () => {
  it('normalizes style keys once and compares arrays', () => {
    expect(migration).toContain('declared_genre_keys');
    expect(migration).toContain('track_genre_keys');
    expect(migration).toContain('b.track_genre_keys && b.declared_genre_keys');
  });

  it('never waits on simultaneous Home/Profile reads', () => {
    expect(migration).toContain('pg_try_advisory_xact_lock');
  });

  it('keeps the original personalization families', () => {
    for (const token of ['favorite_artists','inferred_artists','music_country_codes','music_language_codes','keep_battle_track_themes','music_pulse_theme_affinity']) {
      expect(migration).toContain(token);
    }
  });
});
