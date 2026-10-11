// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Battle / Solo eight-style mix contract', () => {
  const component = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const liveService = read(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001125000_battle_three_style_balanced_mix.sql');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('allows up to eight selected styles in the client', () => {
    expect(component).toContain('real.length >= 8');
    expect(component).toContain("Alert.alert('8 styles maximum'");
    expect(liveService).toContain(')).slice(0, 8);');
  });

  it('persists up to eight styles on the server', () => {
    expect(read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261012003000_battle_eight_theme_selection.sql')).toContain('limit 8');
    expect(migration).toContain("create or replace function public.keep_battle_save_match_preferences");
  });

  it('balances selected themes in both Solo and Battle', () => {
    expect(migration).toContain('partition by d.theme_code');
    expect(migration).toContain('theme_rank');
    expect(migration).toContain('create or replace function public.keep_battle_solo_pack');
    expect(migration).toContain('create or replace function public.keep_battle_arena_seed_rounds');
  });

  it('locks the product rule', () => {
    expect(contract.battlePreferences.maxSelectedStyles).toBe(8);
    expect(contract.battlePreferences.soloMustMixAllSelectedStyles).toBe(true);
    expect(contract.battlePreferences.battleMustMixAllSelectedStyles).toBe(true);
    expect(contract.battlePreferences.selectedStylesPersistInSupabase).toBe(true);
  });
});
