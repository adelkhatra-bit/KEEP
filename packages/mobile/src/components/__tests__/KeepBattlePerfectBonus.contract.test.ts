import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Battle multiplayer fastest perfect bonus', () => {
  const battle = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001003500_battle_multiplayer_fastest_perfect_bonus_append_only.sql');

  it('awards the UI bonus only for a perfect multiplayer result and picks the fastest perfect player', () => {
    expect(battle).toContain('.filter((entry) => entry.correct === arena.roundCount)');
    expect(battle).toContain('.sort((a, b) => a.responseMs - b.responseMs || a.placement - b.placement)');
    expect(battle).toContain('const perfectBonusFree = perfectBonusWinner ? stakeForRounds(arena.roundCount) : 0;');
    expect(battle).toContain('SANS-FAUTE · LE PLUS RAPIDE');
    expect(battle).toContain('+{perfectBonusFree} FREE BONUS');
  });

  it('keeps the perfect bonus out of Solo and renders it only in Arena finish', () => {
    const soloStart = battle.indexOf('if (solo) {');
    const arenaStart = battle.indexOf('if (arena) {', soloStart);
    const bonusCard = battle.indexOf('SANS-FAUTE · LE PLUS RAPIDE');
    expect(bonusCard).toBeGreaterThan(arenaStart);
  });

  it('uses a distinct animated end-of-match card when a perfect bonus exists', () => {
    expect(battle).toContain('perfectBonusGlowStyle');
    expect(battle).toContain('jackpotBlink.interpolate');
    expect(battle).toContain('perfectBonusCard');
    expect(battle).toContain('TU PRENDS LE BONUS SYSTÈME');
  });

  it('enforces the money rule server-side, never in Solo', () => {
    expect(migration).toContain("old.status = 'ACTIVE'");
    expect(migration).toContain("new.status = 'WAITING'");
    expect(migration).toContain('participant_count < 2');
    expect(migration).toContain('r.correct_predictions = old.round_count');
    expect(migration).toContain('order by r.total_response_ms asc, r.placement asc, r.profile_id asc');
    expect(migration).toContain('bonus_free := public.keep_battle_stake_for_rounds(old.round_count);');
    expect(migration).toContain("'FASTEST_PERFECT_ONLY'");
    expect(migration).toContain('insert into public.keep_battle_perfect_bonus_events');
    expect(migration).toContain('on conflict(arena_id, match_no) do nothing');
    expect(migration).toContain('sum(b.amount)');
    expect(migration).not.toContain('update public.keep_battle_arena_credit_events');
    expect(migration).not.toContain('do update set result');
    expect(migration).not.toContain('keep_battle_solo_credit_events');
  });
});
