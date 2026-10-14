import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Battle group invitation capacity contract', () => {
  const component = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const liveService = read(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261014220000_battle_group_invite_capacity_and_expiry.sql');
  const soloMigration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261010130000_battle_solo_pack_fast.sql');

  it('does not let an expired invite block an arena start', () => {
    expect(migration).toContain("status = ''PENDING'' and expires_at > now()");
    expect(migration).toContain('BATTLE_START_PENDING_INVITE_GUARD_NOT_FOUND');
  });

  it('reserves a single seat per pending invitee and enforces the cap server-side', () => {
    expect(migration).toContain('for update');
    expect(migration).toContain('count(distinct c.target_id)');
    expect(migration).toContain('active_count+coalesce(pending_count,0)>=a.max_players');
    expect(migration).toContain('BATTLE_INVITE_CAPACITY_CHECK_NOT_FOUND');
  });

  it('keeps open-seat counts and public joins consistent with pending invitations', () => {
    expect(migration).toContain('y.max_players-y.players-y.pending_invites');
    expect(migration).toContain('active_count+coalesce(pending_count,0)<a.max_players');
    expect(migration).toContain('BATTLE_STATE_OPEN_SEATS_NOT_FOUND');
  });

  it('limits the client group selection to nine opponents plus the host', () => {
    expect(component).toContain('const BATTLE_ARENA_MAX_PLAYERS = 10;');
    expect(component).toContain('const BATTLE_ARENA_MAX_OPPONENTS = BATTLE_ARENA_MAX_PLAYERS - 1;');
    expect(component).toContain('selectedBattlePlayerIds.size >= BATTLE_ARENA_MAX_OPPONENTS');
  });

  it('does not reload sender credit, target presence, or arena state for every selected opponent', () => {
    const challengeStart = component.indexOf('const challenge = async (');
    const challengeEnd = component.indexOf('const [selectedBattlePlayerIds', challengeStart);
    const challengeFlow = component.slice(challengeStart, challengeEnd);
    const groupStart = component.indexOf('const startSelectedBattle = async');
    const groupEnd = component.indexOf('const renderPlayerStatsModal', groupStart);
    const groupFlow = component.slice(groupStart, groupEnd);
    expect(challengeFlow).not.toContain('loadLiveSoloPlayers(30, roundCount)');
    expect(groupFlow).toContain('loadBattleCreditStatusIfAuthenticated()');
    expect(groupFlow).toContain('challenge(targets[index], { credit: freshCredit, skipArenaReload: index > 0 })');
    expect(liveService).toContain('coalesced(`loadLiveSoloPlayers:${limit}:${roundCount}`');
  });

  it('prevents overlapping lobby and spectator refreshes on both shared runtimes', () => {
    expect(component).toContain('if (refreshSocialInFlightRef.current) return refreshSocialInFlightRef.current;');
    expect(component).toContain('if (!alive || battleSocialPollInFlightRef.current) return;');
    expect(component).toContain('if (!alive || spectatingPollInFlightRef.current) return;');
  });

  it('bounds online arena polling and avoids unchanged state renders', () => {
    expect(component).toContain('if (!requestedId || arenaRefreshInFlightRef.current) return;');
    expect(component).toContain('setInterval(() => { void refreshArena(); }, 1500)');
    expect(component).toContain('setInterval(() => { void refreshArena(); }, 5000)');
    expect(component).toContain('JSON.stringify(current) === JSON.stringify(result)');
    expect(component).toContain('setInterval(refreshRematchStatus, 5000)');
    expect(component).toContain('setInterval(load, 15000)');
    expect(component).toContain('setInterval(() => { void refreshMySoloRank(); }, 30000)');
  });

  it('reduces the Battle clock wakeups outside active rounds and while disabled', () => {
    expect(component).toContain('if (!enabled) return undefined;');
    expect(component).toContain('const isBattleClockActive = Boolean(solo) || arena?.status === \'ACTIVE\';');
    expect(component).toContain('? setInterval(() => setNow(Date.now()), 100)');
    expect(component).toContain(': setInterval(() => setNow(Date.now()), 1000)');
  });

  it('retains the bounded Solo catalogue query already prepared in the source', () => {
    expect(soloMigration).toContain('order by random()');
    expect(soloMigration).toContain('limit 500');
    expect(soloMigration).toContain('keep_battle_solo_pack');
  });
});
