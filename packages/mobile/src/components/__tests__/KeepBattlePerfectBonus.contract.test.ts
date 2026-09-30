import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Battle multiplayer perfect bonus — every perfect player', () => {
  const battle = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001005500_battle_explicit_decision_all_perfect_bonus_transfers.sql');
  const accounting = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001004500_battle_perfect_bonus_free_accounting.sql');

  it('gives the stake-sized bonus to every perfect multiplayer participant', () => {
    expect(battle).toContain('.filter((entry) => entry.correct === arena.roundCount)');
    expect(battle).toContain('perfectBonusPlayers.some');
    expect(battle).toContain('BONUS POUR CHAQUE PARFAIT');
    expect(battle).toContain('FREE PAR JOUEUR PARFAIT');
    expect(migration).toContain('r.correct_predictions=old.round_count');
    expect(migration).toContain("'ALL_PERFECT_PLAYERS'");
    expect(migration).not.toContain('FASTEST_PERFECT_ONLY');
  });

  it('uses an append-only bonus ledger with one event per perfect profile', () => {
    expect(migration).toContain('unique (arena_id,match_no,profile_id)');
    expect(migration).toContain('insert into public.keep_battle_perfect_bonus_events');
    expect(migration).toContain('on conflict(arena_id,match_no,profile_id) do nothing');
    expect(migration).not.toContain('update public.keep_battle_arena_credit_events');
    expect(accounting).toContain('select amount from public.keep_battle_perfect_bonus_events where profile_id=p_uid');
  });

  it('makes the bonus rule visible before an online Battle starts', () => {
    expect(battle).toContain('SANS-FAUTE {roundCount}/{roundCount} = +{stakeForRounds(roundCount)} FREE BONUS');
  });

  it('keeps the bonus out of Solo and on the Arena finish screen', () => {
    const soloStart = battle.indexOf('if (solo) {');
    const arenaStart = battle.indexOf('if (arena) {', soloStart);
    const bonusCard = battle.indexOf('BONUS POUR CHAQUE PARFAIT');
    expect(bonusCard).toBeGreaterThan(arenaStart);
  });
});
