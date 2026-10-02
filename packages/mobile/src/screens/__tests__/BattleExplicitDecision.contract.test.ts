import fs from 'fs';
import path from 'path';

describe('Battle explicit decision everywhere', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');
  const banner = read(__dirname, '..', '..', 'components', 'GlobalNotificationBanner.tsx');
  const battle = read(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx');
  const rematch = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260930212000_keep_battle_rematch_cancel_status_timeout.sql');
  const bonus = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001013000_battle_fastest_perfect_bonus_product_lock.sql');

  it('polls server truth globally and renders a non-dismissible decision modal', () => {
    expect(banner).toContain('loadIncomingBattleChallenges');
    expect(banner).toContain('loadPendingArenaRematches');
    // 969e92b1 : plus de sondage global à 800 ms (incident 02/10/2026, contrat authResilience) ; resynchronisation au retour au premier plan.
    expect(banner).toContain("AppState.addEventListener('change'");
    expect(banner).not.toContain('BATTLE_DECISION_POLL_MS');
    expect(banner).toContain('DÉCISION REQUISE');
    expect(banner).toContain('REFUSER');
    expect(banner).toContain('ACCEPTER');
  });

  it('locks an accepted online Battle until explicit quit', () => {
    expect(battle).toContain("setGameInProgress(true, 'EN_LIGNE'");
    expect(battle).toContain('Pour sortir, utilise QUITTER LE BATTLE.');
    expect(battle).toContain('leaveKeepBattleArena(arenaId)');
  });

  it('shows explicit rematch answers and lets the proposer withdraw before another acceptance', () => {
    expect(battle).toContain('REVANCHE EN ATTENTE · RÉPONSE OBLIGATOIRE');
    expect(battle).toContain('RETIRER MA DEMANDE');
    expect(battle).toContain("'✓ ACCEPTÉ'");
    expect(battle).toContain("'× REFUSÉ / PARTI'");
    expect(rematch).toContain('BATTLE_REMATCH_ALREADY_ACCEPTED');
  });

  it('keeps one deterministic fastest-perfect bonus winner server-side', () => {
    expect(bonus).toContain('order by r.total_response_ms asc');
    expect(bonus).toContain("'FASTEST_PERFECT_ONLY'");
    expect(bonus).toContain('drop function if exists public.keep_battle_apply_all_perfect_bonuses();');
  });
});
