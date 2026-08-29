// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Battle challenge UX', () => {
  const notifications = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8');
  const parties = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');
  const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');
  const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260829124200_keep_battle_in_app_invites_only.sql'), 'utf8');

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
    expect(battle).toContain("<Text style={s.yesText}>ACCEPTER</Text>");
  });

  it('handles accept/refuse directly from the live Battle state', () => {
    expect(battle).toContain('respondBattleChallenge(item.id, accept)');
    expect(battle).toContain('setIncoming((rows) => rows.filter((x) => x.id !== item.id))');
    expect(battle).toContain('setArena(await loadKeepBattleArena(response.arenaId))');
  });

  it('does not create a recipient notification when a Battle challenge is sent', () => {
    const functionStart = migration.indexOf('create or replace function public.keep_battle_challenge_send');
    const functionEnd = migration.indexOf('end;$function$;');
    const sendFunction = migration.slice(functionStart, functionEnd);
    expect(sendFunction).not.toContain('insert into public.notifications');
    expect(migration).toContain("delete from public.notifications");
    expect(migration).toContain("'BATTLE_CHALLENGE'");
  });

  it('still supports the legacy notification route safely without making it the Battle entry point', () => {
    expect(notifications).toContain('respondBattleChallenge(challengeId, accept)');
    expect(parties).toContain('initialArenaId={route?.params?.arenaId}');
    expect(push).not.toContain(".then(() => Linking.openURL('keep://notifications'))");
  });
});
