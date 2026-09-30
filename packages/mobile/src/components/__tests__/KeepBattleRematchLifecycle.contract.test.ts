import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('KEEP Battle rematch lifecycle', () => {
  const game = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const service = read(__dirname, '..', '..', 'services', 'keepBattleService.ts');
  const migration = read(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260930212000_keep_battle_rematch_cancel_status_timeout.sql');

  it('does nothing after match end until the player explicitly requests REVANCHE', () => {
    expect(game).toContain("!rematchDeadline ? (");
    expect(game).toContain("proposeKeepBattleArenaRematch(arena.id)");
    expect(game).toContain("Match terminé. Tu peux partir quand tu veux ou proposer une revanche.");
  });

  it('shows names, live statuses and the countdown while waiting', () => {
    expect(game).toContain('REVANCHE EN ATTENTE · {rematchRemaining}s');
    expect(game).toContain('participant.username');
    expect(game).toContain("'… EN ATTENTE'");
    expect(game).toContain("'✓ ACCEPTÉ'");
    expect(game).toContain('loadKeepBattleArenaRematchStatus(arena.id)');
  });

  it('lets only the proposer withdraw before another participant accepts', () => {
    expect(service).toContain("keep_battle_arena_cancel_rematch");
    expect(game).toContain('RETIRER MA DEMANDE');
    expect(migration).toContain('BATTLE_REMATCH_ALREADY_ACCEPTED');
    expect(migration).toContain('rematch_proposer_id');
  });

  it('times out non-responders and lets accepted players continue without them', () => {
    expect(migration).toContain('BATTLE_ARENA_REMATCH_MISSED');
    expect(migration).toContain('Désolé, tu as loupé ce Battle. Attends le prochain tour.');
    expect(migration).toContain("if active_count>=2 then");
    expect(migration).toContain("perform public.keep_battle_arena_start(a.id)");
  });
});
