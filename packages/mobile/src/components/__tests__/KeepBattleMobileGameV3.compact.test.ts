// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Battle mobile style selector', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const audioSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'audioPreviewService.ts'), 'utf8');

  it('renders one inline Battle invite above answers', () => {
    const question = source.indexOf('<Text style={s.question}>Qui chante ?</Text>');
    const invite = source.indexOf('style={[s.invite');
    const answers = source.indexOf('<View style={s.answers}>');
    expect(question).toBeGreaterThanOrEqual(0);
    expect(invite).toBeGreaterThan(question);
    expect(answers).toBeGreaterThan(invite);
    expect(source).not.toContain("invite: { position: 'absolute'");
    expect(source).not.toContain("Alert.alert('Défi envoyé'");
    expect(source).toContain('REFUSER');
    expect(source).toContain('ACCEPTER');
  });

  it('pauses the solo round while the player decides on an invite, including audio loading', () => {
    expect(source).toContain('pausedSoloRemaining');
    expect(source).toContain("incoming[0] ? 'PAUSE'");
    expect(source).toContain("incoming[0] ? 'INVITATION BATTLE'");
    expect(source).toContain('if (!round || incoming[0] || pausedSoloRemaining !== null) return undefined');
    expect(source).toContain("[solo?.themeCode, soloIndex, playVerified, incoming[0]?.id, pausedSoloRemaining]");
    expect(source).toContain('setPausedSoloRemaining(soloStartedAt ? Math.max(0, ROUND_MS - (Date.now() - soloStartedAt)) : ROUND_MS)');
    expect(source).toContain('setSoloStartedAt(Date.now() - (ROUND_MS - savedRemaining))');
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

  it('makes the match style explicit before the challenge is accepted', () => {
    expect(source).toContain('STYLE DU MATCH');
    expect(source).toContain('Style proposé : {themeLabel(incoming[0].themeCode)}');
    expect(source).toContain('BATTLE · {themeLabel(themeCode)}');
    expect(source).toContain('await sendBattleChallenge(player.profileId, themeCode)');
  });

  it('schedules multiplayer playback against the shared round timestamp', () => {
    expect(source).toContain('scheduleTrackPreviewSegment');
    expect(source).toContain('const startsAt = round.startedAt ? new Date(round.startedAt).getTime() : Date.now()');
    expect(source).toContain('previewUrl, 0, duration, startsAt');
    expect(audioSource).toContain('export async function scheduleTrackPreviewSegment');
    expect(audioSource).toContain('startAtEpochMs - Date.now()');
  });

  it('uses one team gauge for multiplayer groups', () => {
    expect(source).toContain('const teamA = players.filter');
    expect(source).toContain('const teamB = players.filter');
    expect(source).toContain('ÉQUIPE A · {teamA.length}');
    expect(source).toContain('ÉQUIPE B · {teamB.length}');
    expect(source).toContain('style={[s.powerLeft, { width: `${leftShare}%` }]}');
  });

  it('shows a complete 8-round endgame with replay and challenge choices', () => {
    expect(source).toContain('PARFAIT · 8/8');
    expect(source).toContain('REFAIRE UNE PARTIE');
    expect(source).toContain('DÉFIER UN JOUEUR');
    expect(source).toContain('INVITER UN AMI');
    expect(source).toContain('setSoloFinished(true); celebrate()');
  });

  it('stops automatic multiplayer restart and shows rematch actions', () => {
    expect(source).toContain("arena.status === 'WAITING' && arena.lastResult");
    expect(source).toContain('REVANCHE');
    expect(source).toContain('AJOUTER UN JOUEUR');
    expect(source).toContain('QUITTER LE BATTLE');
    expect(source).toContain('buildKeepBattleArenaInviteLink');
    expect(source).toContain('!arena.isHost || arena.lastResult || arena.seats.length < 2');
    expect(source).toContain('winner?.score ?? arena.lastResult.score');
  });

  it('keeps the horizontal music-style selector compact on 390x844', () => {
    expect(source).toContain('style={s.themeScroll}');
    expect(source).toContain("themeScroll: { flexGrow: 0, flexShrink: 0, height: 38, maxHeight: 38 }");
    expect(source).toContain("theme: { height: 32, minHeight: 32");
    expect(source).toContain("themeRow: { gap: 6, paddingRight: 12, alignItems: 'center' }");
  });
});
