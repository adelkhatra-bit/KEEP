// @ts-nocheck
// Branch-head verification: hardened in-card Battle accept/refuse flow.
import fs from 'fs';
import path from 'path';

describe('Loki Music Battle challenge UX', () => {
  const notifications = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8');
  const parties = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');
  const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const live = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts'), 'utf8');
  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');
  const backendPush = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'src', 'lib', 'pushNotifications.ts'), 'utf8');
  const wakeupMigration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260829124800_keep_battle_restore_background_wakeup_push.sql'), 'utf8');
  const inboxMigration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260829124700_fix_keep_battle_challenge_inbox_ambiguity.sql'), 'utf8');

  it('keeps incoming decisions inside Battle rather than redirecting the user', () => {
    expect(battle).toContain('loadIncomingBattleChallenges()');
    expect(battle).toContain('requestBattleChallengeDecision(incoming[0], false)');
    expect(battle).toContain('requestBattleChallengeDecision(incoming[0], true)');
    expect(battle).toContain('REFUSER');
    expect(battle).toContain('ACCEPTER');
    expect(battle).toContain("Les invitations restent en file d'attente pendant le Solo");
  });

  it('handles accept/refuse directly from live Battle using the arena returned by Supabase', () => {
    expect(battle).toContain('respondBattleChallenge(item.id, accept)');
    expect(battle).toContain('setIncoming((rows) => rows.filter((x) => x.id !== item.id))');
    expect(battle).toContain('const loadedArena = response.arenaState || await loadArenaAfterAccept(response.arenaId)');
    expect(battle).toContain('setArena(loadedArena)');
    expect(live).toContain('arenaState: (data as any)?.arenaState ?? null');
    expect(battle).toContain('respondingChallengeId');
    expect(battle).toContain('CONNEXION…');
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
    // Au premier plan, Loki possède déjà sa bannière interne : aucune
    // deuxième bannière ni entrée dans la liste système pour le même événement.
    expect(push).toContain('shouldShowBanner: false,');
    expect(push).toContain('shouldShowList: false,');
    expect(push).not.toContain("void Linking.openURL('keep://notifications')");
    expect(push).not.toContain(".then(() => Linking.openURL('keep://notifications'))");
  });


  it('keeps Battle decision out of Notifications and native push actions', () => {
    expect(notifications).not.toContain('respondBattleChallenge(challengeId, accept)');
    expect(notifications).not.toContain('accessibilityLabel="Refuser le Battle"');
    expect(notifications).not.toContain('accessibilityLabel="Accepter le Battle"');
    expect(push).not.toContain('KEEP_BATTLE_REFUSE');
    expect(push).not.toContain('KEEP_BATTLE_ACCEPT');
    expect(backendPush).not.toContain('categoryId: BATTLE_CATEGORY');
    expect(battle).toContain('requestBattleChallengeDecision(incoming[0], false)');
    expect(battle).toContain('requestBattleChallengeDecision(incoming[0], true)');
  });
});
