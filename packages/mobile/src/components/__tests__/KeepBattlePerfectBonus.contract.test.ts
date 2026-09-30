import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Battle multiplayer perfect bonus — fastest perfect only', () => {
  const battle = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const service = read(__dirname, '..', '..', 'services', 'keepBattleExperienceService.ts');
  const offers = read(__dirname, '..', '..', 'screens', 'OffersScreen.tsx');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001005500_battle_explicit_decision_all_perfect_bonus_transfers.sql');
  const accounting = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001004500_battle_perfect_bonus_free_accounting.sql');

  it('selects one perfect player by cumulative response speed', () => {
    expect(battle).toContain('.filter((entry) => entry.correct === arena.roundCount)');
    expect(battle).toContain('a.responseMs - b.responseMs');
    expect(battle).toContain('SANS-FAUTE · LE PLUS RAPIDE');
    expect(battle).toContain('TU PRENDS LE BONUS SYSTÈME');
    expect(battle).not.toContain('BONUS POUR CHAQUE PARFAIT');
    expect(battle).not.toContain('FREE PAR JOUEUR PARFAIT');
  });

  it('enforces the same single-winner rule server-side', () => {
    expect(migration).toContain('order by r.total_response_ms asc');
    expect(migration).toContain("'FASTEST_PERFECT_ONLY'");
    expect(migration).toContain('on conflict(arena_id,match_no) do nothing');
    expect(migration).not.toContain('ALL_PERFECT_PLAYERS');
  });

  it('explains the rule consistently before the match and in Offers', () => {
    expect(service).toContain('Un seul bonus sans-faute');
    expect(offers).toContain('UN SEUL bonus');
    expect(offers).toContain('sans-faute le plus rapide');
    expect(offers).not.toContain('chaque sans-faute reçoit');
  });

  it('keeps bonus accounting inside Battle winnings', () => {
    expect(accounting).toContain('keep_battle_perfect_bonus_events');
    expect(accounting).toContain("'ARENA_BONUS'::text as battle_type");
    expect(accounting).toContain('battle_adjustment := public.keep_battle_credit_adjustment_for_profile(p_uid);');
  });
});
