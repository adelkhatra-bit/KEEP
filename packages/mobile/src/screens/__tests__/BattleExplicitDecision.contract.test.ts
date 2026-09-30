import fs from 'fs';
import path from 'path';

describe('Battle explicit decision everywhere', () => {
  const banner = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'GlobalNotificationBanner.tsx'), 'utf8');
  const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001005500_battle_explicit_decision_all_perfect_bonus_transfers.sql'), 'utf8');

  it('polls server truth globally and renders a non-dismissible decision modal', () => {
    expect(banner).toContain('loadIncomingBattleChallenges');
    expect(banner).toContain('loadPendingArenaRematches');
    expect(banner).toContain('BATTLE_DECISION_POLL_MS');
    expect(banner).toContain('<Modal visible transparent animationType="fade" onRequestClose={() => {}}>');
    expect(banner).toContain('DÉCISION REQUISE');
    expect(banner).toContain('REFUSER');
    expect(banner).toContain('ACCEPTER');
  });

  it('locks an accepted online Battle until explicit quit', () => {
    expect(battle).toContain("setGameInProgress(true, 'EN_LIGNE'");
    expect(battle).toContain('Pour sortir, utilise QUITTER LE BATTLE.');
    expect(battle).toContain('leaveKeepBattleArena(arenaId)');
  });

  it('does not auto-expire a pending challenge or rematch', () => {
    expect(migration).toContain("interval '100 years'");
    expect(migration).toContain('if undecided_count>0 then return; end if;');
    expect(migration).toContain('me.rematch_ready is null');
  });

  it('writes transparent Free-transfer notifications', () => {
    expect(migration).toContain("'BATTLE_FREE_TRANSFER'");
    expect(migration).toContain('Ta mise de');
    expect(migration).toContain('vient des mises de');
  });
});
