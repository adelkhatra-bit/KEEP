// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Battle mobile style selector', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const audioSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'audioPreviewService.ts'), 'utf8');

  it('renders one inline Battle invite between artwork and Qui chante', () => {
    const visual = source.indexOf('<View style={s.visual}>');
    const invite = source.indexOf('souhaite faire un Battle avec vous. Acceptez-vous ?');
    const question = source.indexOf('<Text style={s.question}>Qui chante ?</Text>');
    const answers = source.indexOf('<View style={s.answers}>');
    expect(visual).toBeGreaterThanOrEqual(0);
    expect(invite).toBeGreaterThan(visual);
    expect(question).toBeGreaterThan(invite);
    expect(answers).toBeGreaterThan(question);
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

  it('keeps solo on refusal and switches to the returned shared arena on acceptance', () => {
    expect(source).toContain('const response = await respondBattleChallenge(item.id, accept)');
    expect(source).toContain('if (accept && response.arenaId)');
    expect(source).toContain('await stopTrackPreview()');
    expect(source).toContain('await leaveSoloBattle().catch(() => {})');
    expect(source).toContain('setSolo(null); setBrowseOnline(false); setAudioReady(false)');
    expect(source).toContain('const loadedArena = response.arenaState || await loadArenaAfterAccept(response.arenaId)');
    expect(source).toContain('setArena(loadedArena)');
    expect(source).toContain('for (let attempt = 0; attempt < 5; attempt += 1)');
    expect(source).toContain('void respond(incoming[0], false)');
    expect(source).toContain('void respond(incoming[0], true)');
  });

  it('makes the match style explicit before the challenge is accepted', () => {
    expect(source).toContain('STYLE DU MATCH');
    expect(source).toContain('⚡ {themeLabel(incoming[0].themeCode)}');
    expect(source).toContain('BATTLE · {themeLabel(themeCode)}');
    expect(source).toContain('await sendBattleChallenge(player.profileId, themeCode)');
  });

  it('polls incoming challenges throughout Battle before an arena starts', () => {
    expect(source).toContain('if (!enabled || arena) return;');
    expect(source).toContain('if (!enabled || arena) return undefined;');
    expect(source).toContain('loadIncomingBattleChallenges()');
  });

  it('schedules multiplayer playback against the shared round timestamp', () => {
    expect(source).toContain('scheduleTrackPreviewSegment');
    expect(source).toContain('const startsAt = round.startedAt ? new Date(round.startedAt).getTime() : Date.now()');
    expect(source).toContain('previewUrl, 0, duration, startsAt');
    expect(audioSource).toContain('export async function scheduleTrackPreviewSegment');
    expect(audioSource).toContain('startAtEpochMs - Date.now()');
  });

  it('keeps one Safari web audio element alive across rounds so the next track starts without another tap', () => {
    expect(audioSource).toContain('let webAudio: any = null');
    expect(audioSource).toContain('if (!webAudio)');
    expect(audioSource).toContain('webAudio = new HtmlAudio()');
    expect(audioSource).toContain('await playWebSegment(key, previewUrl, positionMillis, durationMillis, onStateChange)');
    expect(audioSource).not.toContain('webAudio = null');
    expect(audioSource).toContain('if (activeStartTimer)');
  });

  it('uses one TikTok-style pressure gauge with real names for 1v1 and teams for groups', () => {
    expect(source).toContain('const teamA = players.filter');
    expect(source).toContain('const teamB = players.filter');
    expect(source).toContain('players.length === 2 ? `@${first.username}`');
    expect(source).toContain('players.length === 2 ? `@${second.username}`');
    expect(source).toContain('`ÉQUIPE A · ${teamA.length}`');
    expect(source).toContain('`ÉQUIPE B · ${teamB.length}`');
    expect(source).toContain('{teamAScore} pts');
    expect(source).toContain('{teamBScore} pts');
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

  it('uses smartphone-sized Battle action targets and readable invite text', () => {
    expect(source).toContain("inviteActions: { flexDirection: 'row', gap: 10, width: '100%' }");
    expect(source).toContain('no: { flex: 1, minHeight: 56');
    expect(source).toContain('yes: { flex: 1, minHeight: 56');
    expect(source).toContain('hitSlop={10}');
    expect(source).toContain("inviteQuestion: { color: '#F3EDF7', fontSize: 15, lineHeight: 20");
    expect(source).toContain("inviteName: { color: '#FFF', fontSize: 16");
    expect(source).toContain("borderWidth: 2, borderColor: '#E5F266'");
    expect(source).toContain('CONNEXION…');
    expect(source).toContain('respondingChallengeId');
  });

  it('keeps the horizontal music-style selector compact on 390x844', () => {
    expect(source).toContain('style={s.themeScroll}');
    expect(source).toContain("themeScroll: { flexGrow: 0, flexShrink: 0, height: 38, maxHeight: 38 }");
    expect(source).toContain("theme: { height: 32, minHeight: 32");
    expect(source).toContain("themeRow: { gap: 6, paddingRight: 12, alignItems: 'center' }");
  });

  it('explains credit failures instead of leaving accept/challenge apparently dead', () => {
    expect(source).toContain('BATTLE_CHALLENGER_NO_CREDIT');
    expect(source).toContain('BATTLE_TARGET_NO_CREDIT');
    expect(source).toContain('Il te faut au moins 3 Free');
  });

  it('advances solo rapidly after an answer', () => {
    expect(source).toContain('setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 360)');
    expect(source).not.toContain('setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 950)');
  });
});


describe('KEEP Battle accept reliability', () => {
  const battle = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const live = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts'), 'utf8');

  it('uses the arena state returned by accept without requiring a second network call', () => {
    expect(live).toContain('arenaState: (data as any)?.arenaState ?? null');
    expect(battle).toContain('response.arenaState || await loadArenaAfterAccept(response.arenaId)');
  });

  it('uses large smartphone touch targets for accept and refuse', () => {
    expect(battle).toContain('minHeight: 56');
    expect(battle).toContain('borderWidth: 2');
    expect(battle).toContain('hitSlop={10}');
    expect(battle).toContain("inviteQuestion: { color: '#F3EDF7', fontSize: 15, lineHeight: 20");
  });
});


describe('KEEP Battle persistent group invitations', () => {
  const battle = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const live = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts'), 'utf8');

  it('invites additional players into the same arena instead of replacing the group', () => {
    expect(live).toContain("rpc('keep_battle_arena_challenge_send'");
    expect(battle).toContain('sendBattleArenaChallenge(arena.id, player.profileId)');
    expect(battle).toContain('GROUPE {arena.seats.length}/10');
    expect(battle).toContain("invited ? 'INVITÉ' : 'INVITER'");
    expect(battle).toContain('arena.openSeats > 0');
  });

  it('keeps post-match add-player controls smartphone sized', () => {
    expect(battle).toContain('arenaInviteButton: { minWidth: 94, minHeight: 52');
    expect(battle).toContain('arenaInviteRow: { minHeight: 62');
    expect(battle).toContain('INVITER UN AMI PAR LIEN');
  });
});
