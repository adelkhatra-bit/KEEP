import fs from 'fs';
import path from 'path';

const mobile = path.resolve(__dirname, '..', '..', '..');
const repo = path.resolve(mobile, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(repo, relativePath), 'utf8');

describe('6 styles Solo/Battle, no hidden truncation', () => {
  const game = read('packages/mobile/src/components/KeepBattleMobileGameV3.tsx');
  const live = read('packages/mobile/src/services/keepBattleLiveService.ts');
  const battle = read('packages/mobile/src/services/keepBattleService.ts');
  const migration = read('supabase/migrations/20261012103000_solo_battle_six_music_styles.sql');

  it('allows exactly six visible music styles from user preferences', () => {
    expect(game).toContain('real.length >= 6');
    expect(game).toContain('6 styles maximum');
    expect(live).toContain(".filter((code) => code && code !== 'MIX'))).slice(0, 6)");
    expect(battle).toContain(".filter((code) => code && code !== 'MIX'))).slice(0, 6)");
  });

  it('preserves four answer choices while increasing styles at each server entry point', () => {
    expect(migration).toContain('keep_battle_solo_pack(text,integer,text[])');
    expect(migration).toContain('keep_battle_save_match_preferences(text[],integer)');
    expect(migration).toContain('keep_battle_arena_seed_rounds(uuid,integer)');
    expect(migration).toContain("'\\1limit 6'");
    expect(migration).toContain("'and u.ord <= 6'");
    expect(migration).toContain('exactly four choices');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('pg_get_functiondef(v_oid)');
    expect(migration).not.toMatch(/\\bDELETE\\s+FROM\\b/i);
    expect(migration).not.toContain('DROP TABLE');
  });
});
