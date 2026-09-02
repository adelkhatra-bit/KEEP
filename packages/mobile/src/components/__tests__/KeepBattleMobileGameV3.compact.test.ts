// @ts-nocheck
import fs from 'fs';
import path from 'path';

// Ce fichier est stocké avec des fins de ligne CRLF ; on les normalise en LF
// pour que les assertions littérales multi-lignes restent stables quel que
// soit l'OS/checkout Git qui exécute les tests.
const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Battle mobile style selector', () => {
  const source = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const audioSource = readNormalized(__dirname, '..', '..', 'services', 'audioPreviewService.ts');

  it('renders one inline Battle invite between artwork and Qui chante', () => {
    const visual = source.indexOf('<View style={s.visual}>');
    // Adel (02/09/2026) : "à l'étape huit pourquoi tu mets pas cette
    // invitation" -- la bannière d'invitation existe maintenant aussi sur
    // l'écran "PARTIE TERMINÉE" (avant s.visual dans le fichier, cet écran
    // n'a pas de jaquette). On cherche donc l'occurrence dans l'écran de
    // manche active spécifiquement, celle qui suit s.visual.
    const invite = source.indexOf('souhaite faire un Battle avec vous. Acceptez-vous ?', visual);
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

  it('also shows the incoming Battle invite on the finished-game screen (Adel, 02/09/2026: "à l\'étape huit pourquoi tu mets pas cette invitation")', () => {
    const finishedHeader = source.indexOf('PARTIE TERMINÉE');
    const finishedInvite = source.indexOf('souhaite faire un Battle avec vous. Acceptez-vous ?', finishedHeader);
    const finishedHero = source.indexOf('s.finishHero', finishedHeader);
    expect(finishedHeader).toBeGreaterThanOrEqual(0);
    expect(finishedInvite).toBeGreaterThan(finishedHeader);
    expect(finishedInvite).toBeLessThan(finishedHero);
  });

  it('uses phone-sized Battle decision controls and immediate accept feedback', () => {
    expect(source).toContain('minHeight: 142');
    expect(source).toContain('minHeight: 64');
    expect(source).toContain('borderWidth: 3');
    expect(source).toContain('CONNEXION AU BATTLE…');
    expect(source).toContain("if (!response.arenaId) throw new Error('BATTLE_ACCEPTED_WITHOUT_ARENA')");
    expect(source).toContain('setAudioReady(false);\n      void stopTrackPreview();');
  });

  it('pauses the solo round while the player decides on an invite, including audio loading', () => {
    expect(source).toContain('pausedSoloRemaining');
    expect(source).toContain("incoming[0] ? 'PAUSE'");
    expect(source).toContain("incoming[0] ? 'INVITATION BATTLE'");
    expect(source).toContain('if (!round || incoming[0] || pausedSoloRemaining !== null) return undefined');
    expect(source).toContain("[solo?.themeCode, soloIndex, playVerified, incoming[0]?.id, pausedSoloRemaining]");
    expect(source).toContain('setPausedSoloRemaining(soloStartedAt ? Math.max(0, ROUND_MS - (Date.now() - soloStartedAt)) : ROUND_MS)');
    expect(source).toContain('soloStartedAtRef.current = Date.now() - (ROUND_MS - savedRemaining); setSoloStartedAt(soloStartedAtRef.current)');
  });

  it('never lets the round-2+ timeout-detection effect fire on the previous round\'s stale audioReady/soloStartedAt (Adel, 02/09/2026: "la première musique ça fonctionne, la deuxième ça bloque, pas de son, et ça répond automatiquement tout seul")', () => {
    // BUG RÉEL confirmé en direct (instrumentation HTMLMediaElement.pause/play
    // sur le site déployé) : quand soloIndex avance, deux effets qui en
    // dépendent tous les deux s'exécutent dans le MÊME commit React. Celui de
    // démarrage de manche remet audioReady/soloStartedAt à zéro via setState,
    // mais celui de détection de timeout -- déjà planifié pour ce même commit
    // -- lisait encore la fermeture de l'ANCIEN rendu (audioReady=true,
    // soloStartedAt = l'horodatage de la manche précédente), calculait un
    // temps restant à 0 par erreur, et déclenchait un faux "trop tard" qui
    // coupait le son de la manche qui venait de démarrer. Un ref toujours à
    // jour (soloStartedAtRef) doit être utilisé à la place de la fermeture
    // d'état dans ce calcul précis.
    expect(source).toContain('const soloStartedAtRef = React.useRef(0);');
    const timeoutEffect = source.indexOf("if (!solo || activeIncomingId || !audioReady || soloAnswer) return;");
    expect(timeoutEffect).toBeGreaterThan(-1);
    const nextLines = source.slice(timeoutEffect, timeoutEffect + 1200);
    expect(nextLines).toContain('const startedAt = soloStartedAtRef.current;');
    expect(nextLines).toContain('const remaining = pausedSoloRemaining ?? (startedAt ? Math.max(0, ROUND_MS - (Date.now() - startedAt)) : ROUND_MS);');
    expect(nextLines).toContain('if (remaining > 0) return;');
    // displayedSoloRemaining (dérivé de l'état soloStartedAt, sujet à la
    // fermeture obsolète) ne doit plus jamais servir de garde à cet effet.
    expect(nextLines).not.toContain('displayedSoloRemaining > 0');
  });

  it('keeps solo on refusal and switches to the returned shared arena on acceptance', () => {
    expect(source).toContain('const response = await respondBattleChallenge(item.id, accept)');
    expect(source).toContain('if (accept) {');
    expect(source).toContain("if (!response.arenaId) throw new Error('BATTLE_ACCEPTED_WITHOUT_ARENA')");
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
    expect(source).toContain('`BATTLE · ${themeLabel(themeCode)}`');
    expect(source).toContain('await sendBattleChallenge(player.profileId, themeCode, roundCount)');
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

  it('shows a complete endgame (round count now selectable, 8/15/20/30) with replay and challenge choices', () => {
    expect(source).toContain('PARFAIT · ${solo.rounds.length}/${solo.rounds.length}');
    expect(source).toContain('REFAIRE UNE PARTIE');
    expect(source).toContain('DÉFIER UN JOUEUR');
    expect(source).toContain('INVITER UN AMI');
    expect(source).toContain('setSoloFinished(true); celebrate()');
  });

  it('shows the real arena winner history as a clickable Top 3 palmares', () => {
    expect(source).toContain('loadKeepBattleArenaWinnerHistory(arena.id, 20)');
    expect(source).toContain('PALMARÈS · TOP 3');
    expect(source).toContain('entry.wins} victoire');
    expect(source).toContain('onOpenProfile(entry.username)');
    expect(source).toContain('palmaresRow: { minHeight: 50');
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

  it('uses clearly readable smartphone-sized Battle action targets', () => {
    expect(source).toContain("inviteActions: { flexDirection: 'row', gap: 12, width: '100%' }");
    expect(source).toContain('invite: { marginTop: 10, minHeight: 142');
    expect(source).toContain('no: { flex: 1, minHeight: 64');
    expect(source).toContain('yes: { flex: 1, minHeight: 64');
    expect(source).toContain('hitSlop={10}');
    expect(source).toContain("inviteQuestion: { color: '#F3EDF7', fontSize: 16, lineHeight: 22");
    expect(source).toContain("inviteName: { color: '#FFF', fontSize: 17");
    expect(source).toContain("borderWidth: 3, borderColor: '#E5F266'");
    expect(source).toContain('CONNEXION AU BATTLE…');
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

  it('leaves enough time to see the cover art, the red/green result, AND lets the track play to its natural end even on a fast answer (Adel, 01/09/2026: "on a même pas eu le temps de voir la jaquette"; 02/09/2026: "ralentir la cadence" + "écouter la musique jusqu\'à la fin même s\'il a été très rapide")', () => {
    expect(source).toContain('setSoloIndex((v) => v + 1); setSoloAnswer(null); }, Math.max(2800, naturalRemaining))');
    expect(source).toContain('const naturalRemaining = soloStartedAt ? (soloStartedAt + ROUND_MS + 800) - Date.now() : 0;');
    expect(source).not.toContain('setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 360)');
    expect(source).not.toContain('setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 1800)');
    expect(source).not.toContain('setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 2800)');
  });

  // Adel (02/09/2026) : "je vois plus la mauvaise réponse en rouge ... y a
  // plus le bouton pour ajouter à la playlist ... t'as remis l'éclair, y a
  // plus l'animation ... trouve une solution mais dans le code à chaque
  // fois de faire un audit pour ne pas enlever des fonctions." Ces trois
  // signalements se sont avérés être un bundle web caché par le navigateur,
  // pas une vraie régression (vérifié en lisant directement le bundle
  // déployé) -- mais l'audit qu'il demande mérite un vrai filet, pas
  // seulement ma vérification manuelle ponctuelle. Ce test verrouille les
  // trois comportements pour qu'une régression future casse la suite au
  // lieu de dépendre d'un signalement en prod.
  it('keeps the red wrong-answer highlight, the animated result icon (no static lightning), and the session-save buttons', () => {
    expect(source).toContain("answerWrong: { borderColor: '#FF6C8C'");
    expect(source).toContain("s.answerWrong]}");
    expect(source).toContain('function ResultIcon(');
    expect(source).toContain('<ResultIcon icon={perfect ?');
    // Le rond de fin de partie ne doit plus utiliser l'éclair fixe -- seul un
    // usage legitime et distinct (bannière "gagne la manche" en arène) garde
    // le symbole ⚡ ailleurs dans ce fichier.
    expect(source).not.toContain("perfect ? '👑' : soloScore >= 6 ? '🏆' : '⚡'");
    expect(source).toContain('ENREGISTRER CE BATTLE DANS MA SESSION');
    expect(source).toContain('VOIR CES MORCEAUX DANS MA SESSION');
  });

  // Adel (02/09/2026) : "l'humain ne voit pas très bien ... trouve une
  // solution dans le code pour ne plus avoir ce problème" -- plusieurs
  // écritures (kicker "Loki BATTLE", clockHint, username des joueurs en
  // ligne, badges d'équipe...) étaient tombées à 8-9px au fil des
  // itérations précédentes. Un plancher de 11px a été appliqué partout dans
  // ce fichier ; ce test empêche qu'une future retouche fasse redescendre
  // une taille de police en dessous.
  it('never lets any Battle text size drop below the 11px readability floor', () => {
    const sizes = Array.from(source.matchAll(/fontSize: ?(\d+(?:\.\d+)?)/g)).map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    const tooSmall = sizes.filter((size) => size < 11);
    expect(tooSmall).toEqual([]);
  });
});

describe('Loki Battle accept reliability', () => {
  const battle = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const live = readNormalized(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts');

  it('uses the arena state returned by accept without requiring a second network call', () => {
    expect(live).toContain('arenaState: (data as any)?.arenaState ?? null');
    expect(battle).toContain('response.arenaState || await loadArenaAfterAccept(response.arenaId)');
  });

  it('reacts immediately and uses large touch targets for accept/refuse', () => {
    expect(battle).toContain('setAudioReady(false);\n      void stopTrackPreview();');
    expect(battle).toContain('minHeight: 64');
    expect(battle).toContain('borderWidth: 3');
    expect(battle).toContain('hitSlop={10}');
    expect(battle).toContain("inviteQuestion: { color: '#F3EDF7', fontSize: 16, lineHeight: 22");
    expect(battle).toContain('CONNEXION AU BATTLE…');
  });
});

describe('Loki Battle persistent group invitations', () => {
  const battle = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const live = readNormalized(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts');

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
