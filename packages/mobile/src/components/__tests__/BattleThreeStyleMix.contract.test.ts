// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Battle / Solo selected-style mix contract', () => {
  const component = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const liveService = read(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001125000_battle_three_style_balanced_mix.sql');
  const extendedStyles = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261012103000_solo_battle_six_music_styles.sql');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('allows at most six selected styles in the client', () => {
    expect(component).toContain('real.length >= 6');
    expect(component).toContain("Alert.alert('6 styles maximum'");
    expect(liveService).toContain(')).slice(0, 6);');
  });

  it('persists six styles through the new server migration', () => {
    expect(extendedStyles).toContain('keep_battle_save_match_preferences(text[],integer)');
    expect(extendedStyles).toContain('and u.ord <= 6');
    expect(extendedStyles).toContain('pg_get_functiondef(v_oid)');
  });

  it('balances selected themes in both Solo and Battle', () => {
    expect(migration).toContain('partition by d.theme_code');
    expect(migration).toContain('theme_rank');
    expect(migration).toContain('create or replace function public.keep_battle_solo_pack');
    expect(migration).toContain('create or replace function public.keep_battle_arena_seed_rounds');
  });

  it('locks the product rule', () => {
    expect(contract.battlePreferences.maxSelectedStyles).toBe(6);
    expect(contract.battlePreferences.soloMustMixAllSelectedStyles).toBe(true);
    expect(contract.battlePreferences.battleMustMixAllSelectedStyles).toBe(true);
    expect(contract.battlePreferences.selectedStylesPersistInSupabase).toBe(true);
  });
});
