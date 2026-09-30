import fs from 'fs';
import path from 'path';

describe('Battle content anti-repeat memory', () => {
  const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001022000_battle_content_memory_anti_repeat.sql'), 'utf8');

  it('stores only a bounded recent window per profile', () => {
    expect(migration).toContain('keep_battle_content_memory');
    expect(migration).toContain('limit 120');
    expect(migration).toContain('limit 240');
  });

  it('prioritizes tracks and wrong artists that were not shown recently', () => {
    expect(migration).toContain('recent_penalty');
    expect(migration).toContain('v_recent_tracks');
    expect(migration).toContain('v_recent_artists');
  });

  it('covers both Solo and multiplayer Battle server generation', () => {
    expect(migration).toContain('keep_battle_solo_pack');
    expect(migration).toContain('keep_battle_arena_seed_rounds');
    expect(migration).toContain('keep_battle_remember_content');
  });
});
