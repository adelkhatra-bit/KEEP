// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Battle notification actions', () => {
  const notifications = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8');
  const parties = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');
  const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');

  it('shows Battle invitations as explicit accept/refuse actions', () => {
    expect(notifications).toContain("return 'INVITATION BATTLE'");
    expect(notifications).toContain('STYLE DU MATCH');
    expect(notifications).toContain('REFUSER');
    expect(notifications).toContain('ACCEPTER');
    expect(notifications).toContain('respondBattleChallenge(challengeId, accept)');
  });

  it('routes accepted invitations to the exact Battle arena, not Listen/home', () => {
    expect(notifications).toContain("screen: 'Parties'");
    expect(notifications).toContain("params: { openBattle: true, arenaId: arenaId || undefined, source: 'notification' }");
    expect(parties).toContain('if (!route?.params?.openBattle) return');
    expect(parties).toContain('initialArenaId={route?.params?.arenaId}');
    expect(battle).toContain('initialArenaId?: string | null');
    expect(battle).toContain('const loaded = await loadKeepBattleArena(initialArenaId)');
  });

  it('routes native Battle notification taps into the notification action screen', () => {
    expect(push).toContain("Linking.openURL('keep://notifications')");
    expect(push).toContain('addNotificationResponseReceivedListener');
    expect(push).toContain('getLastNotificationResponseAsync');
  });
});
