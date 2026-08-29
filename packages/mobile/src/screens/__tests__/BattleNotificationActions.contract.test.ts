// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Battle notification actions', () => {
  const notifications = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8');
  const parties = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');
  const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');
  const backendPush = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'src', 'lib', 'pushNotifications.ts'), 'utf8');

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

  it('exposes REFUSER / ACCEPTER directly on native Battle push notifications', () => {
    expect(push).toContain("const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE'");
    expect(push).toContain("buttonTitle: 'REFUSER'");
    expect(push).toContain("buttonTitle: 'ACCEPTER'");
    expect(push).toContain('setNotificationCategoryAsync(BATTLE_CATEGORY');
    expect(push).toContain('respondBattleChallenge(challengeId, accept)');
    expect(push).toContain('respondBattleChallenge(challengeId, accept).catch(() => {})');
    expect(push).not.toContain(".then(() => Linking.openURL('keep://notifications'))");
    expect(backendPush).toContain("categoryId: BATTLE_CATEGORY");
    expect(backendPush).toContain("const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE'");
  });

  it('keeps the incoming challenge compact directly under Qui chante', () => {
    const visual = battle.indexOf('<View style={s.visual}>');
    const invite = battle.indexOf('souhaite faire un Battle avec vous. Acceptez-vous ?');
    const question = battle.indexOf("<Text style={s.question}>Qui chante ?</Text>");
    const answers = battle.indexOf('<View style={s.answers}>');
    expect(visual).toBeGreaterThan(-1);
    expect(invite).toBeGreaterThan(visual);
    expect(question).toBeGreaterThan(invite);
    expect(answers).toBeGreaterThan(question);
    expect(battle).toContain("size={24}");
    expect(battle).toContain("<Text style={s.noText}>REFUSER</Text>");
    expect(battle).toContain("<Text style={s.yesText}>ACCEPTER</Text>");
  });

  it('routes native Battle notification taps into the notification action screen', () => {
    expect(push).toContain("Linking.openURL('keep://notifications')");
    expect(push).toContain('addNotificationResponseReceivedListener');
    expect(push).toContain('getLastNotificationResponseAsync');
  });
});
