// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Battle challenge UX', () => {
  const notifications = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8');
  const parties = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');
  const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');
  const backendPush = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'src', 'lib', 'pushNotifications.ts'), 'utf8');
  const wakeupMigration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260829124800_keep_battle_restore_background_wakeup_push.sql'), 'utf8');
  const inboxMigration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260829124700_fix_keep_battle_challenge_inbox_ambiguity.sql'), 'utf8');

  it('keeps the incoming challenge inside the Battle card between artwork and question', () => {
    const visual = battle.indexOf('<View style={s.visual}>');
    const invite = battle.indexOf('souhaite faire un Battle avec vous. Acceptez-vous ?');
    const question = battle.indexOf("<Text style={s.question}>Qui chante ?</Text>");
    const answers = battle.indexOf('<View style={s.answers}>');
    expect(visual).toBeGreaterThan(-1);
    expect(invite).toBeGreaterThan(visual);
    expect(question).toBeGreaterThan(invite);
    expect(answers).toBeGreaterThan(question);
    expect(battle).toContain("<Text style={s.noText}>REFUSER</Text>");
    expect(battle).toContain("'ACCEPTER'");
  });

  it('handles accept/refuse directly from the live Battle state', () => {
    expect(battle).toContain('respondBattleChallenge(item.id, accept)');
    expect(battle).toContain('setIncoming((rows) => rows.filter((x) => x.id !== item.id))');
    expect(battle).toContain('setArena(await loadKeepBattleArena(response.arenaId))');
    expect(battle).toContain('respondingChallengeId');
  });

  it('fixes the incoming challenge RPC ambiguity that prevented the card from loading', () => {
    expect(inboxMigration).toContain('update public.keep_battle_challenges c');
    expect(inboxMigration).toContain("where c.status='PENDING' and c.expires_at<=now()");
    expect(inboxMigration).toContain("where c.target_id=auth.uid() and c.status='PENDING' and c.expires_at>now()");
  });

  it('creates a background wake-up notification but marks it as inline Battle UI', () => {
    expect(wakeupMigration).toContain('insert into public.notifications');
    expect(wakeupMigration).toContain("'BATTLE_CHALLENGE'");
    expect(wakeupMigration).toContain("'presentation','battle_inline'");
    expect(wakeupMigration).toContain("'openMode','stay_in_place'");
  });

  it('suppresses foreground Battle push and never bounces the user to Notifications/home', () => {
    expect(push).toContain("String(data.presentation || '') === 'battle_inline'");
    expect(push).toContain('shouldShowBanner: !inlineBattle');
    expect(push).toContain('shouldShowList: !inlineBattle');
    expect(push).not.toContain("void Linking.openURL('keep://notifications')");
    expect(push).not.toContain(".then(() => Linking.openURL('keep://notifications'))");
  });

  it('keeps native action buttons only for real incoming Battle wake-up pushes', () => {
    expect(backendPush).toContain("const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE'");
    expect(backendPush).toContain("normalizedType === 'BATTLE_CHALLENGE'");
    expect(backendPush).toContain("String(data?.presentation || '') === 'battle_inline'");
    expect(backendPush).toContain('categoryId: BATTLE_CATEGORY');
  });

  it('keeps the legacy notification screen safe if an old notification is opened', () => {
    expect(notifications).toContain('respondBattleChallenge(challengeId, accept)');
    expect(parties).toContain('initialArenaId={route?.params?.arenaId}');
  });

  it('renders the 1v1 gauge with real player names, points and one central bar', () => {
    expect(battle).toContain('players.length === 2 ? `@${first.username}`');
    expect(battle).toContain('players.length === 2 ? `@${second.username}`');
    expect(battle).toContain('{teamAScore} pts');
    expect(battle).toContain('{teamBScore} pts');
    expect(battle).toContain('style={[s.powerLeft, { width: `${leftShare}%` }]}');
  });
});
