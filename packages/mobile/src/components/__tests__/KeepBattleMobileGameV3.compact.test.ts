// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Battle mobile style selector', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');

  it('renders one inline Battle invite above answers', () => {
    const question = source.indexOf('<Text style={s.question}>Qui chante ?</Text>');
    const invite = source.indexOf('style={[s.invite');
    const answers = source.indexOf('<View style={s.answers}>');
    expect(question).toBeGreaterThanOrEqual(0);
    expect(invite).toBeGreaterThan(question);
    expect(answers).toBeGreaterThan(invite);
    expect(source).not.toContain("invite: { position: 'absolute'");
    expect(source).not.toContain("Alert.alert('Défi envoyé'");
  });

  it('keeps solo on refusal and switches to shared arena on acceptance', () => {
    expect(source).toContain('const response = await respondBattleChallenge(item.id, accept)');
    expect(source).toContain('if (accept && response.arenaId)');
    expect(source).toContain('await stopTrackPreview()');
    expect(source).toContain('await leaveSoloBattle().catch(() => {})');
    expect(source).toContain('setSolo(null); setAudioReady(false)');
    expect(source).toContain('setArena(await loadKeepBattleArena(response.arenaId))');
    expect(source).toContain('void respond(incoming[0], false)');
    expect(source).toContain('void respond(incoming[0], true)');
  });

  it('uses one team gauge for multiplayer groups', () => {
    expect(source).toContain('const teamA = players.filter');
    expect(source).toContain('const teamB = players.filter');
    expect(source).toContain('ÉQUIPE A · {teamA.length}');
    expect(source).toContain('ÉQUIPE B · {teamB.length}');
    expect(source).toContain('style={[s.powerLeft, { width: `${leftShare}%` }]}');
  });

  it('keeps the horizontal music-style selector compact on 390x844', () => {
    expect(source).toContain('style={s.themeScroll}');
    expect(source).toContain("themeScroll: { flexGrow: 0, flexShrink: 0, height: 38, maxHeight: 38 }");
    expect(source).toContain("theme: { height: 32, minHeight: 32");
    expect(source).toContain("themeRow: { gap: 6, paddingRight: 12, alignItems: 'center' }");
  });
});
