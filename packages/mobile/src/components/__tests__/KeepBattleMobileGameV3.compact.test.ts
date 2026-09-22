// @ts-nocheck
import fs from 'fs';
import path from 'path';

// Ce fichier est stocké avec des fins de ligne CRLF ; on les normalise en LF
// pour que les assertions littérales multi-lignes restent stables quel que
// soit l'OS/checkout Git qui exécute les tests.
const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Music Battle mobile style selector', () => {
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
    expect(source).toContain('minHeight: 132');
    expect(source).toContain('minHeight: 52');
    expect(source).toContain('borderColor: colors.primary');
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
    expect(source).toContain('MES STYLES ACCEPTÉS');
    expect(source).toContain('⚡ {themeLabel(incoming[0].themeCode)}');
    // (21/09/2026) : le libellé "BATTLE · style · N" par joueur a été retiré
    // -- ce n'est plus un bouton d'action mais un badge de statut en lecture
    // seule (voir describe "multi-select redesign" plus bas), le style/N
    // choisis restent visibles au-dessus dans le sélecteur NOMBRE DE MORCEAUX.
    // Adel (04/09/2026) : "j'ai juste à envoyer une invite comme ça je
    // puisse en envoyer plusieurs" -- BATTLE depuis "Joueurs disponibles"
    // crée/rejoint désormais un salon de groupe (arène) au lieu d'un défi
    // 1 contre 1 isolé, pour que plusieurs invites tombent dans le même
    // match au lieu d'en recréer un nouveau à chaque fois.
    expect(source).toContain('const created = await createKeepBattleArena(themeCode, roundCount, realThemes.length > 1 ? realThemes : undefined)');
    expect(source).toContain('await sendBattleArenaChallenge(arenaId, player.profileId)');
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

  it('uses a TikTok-style pressure gauge for 1v1 and a real-name standings list for groups', () => {
    // Adel (04/09/2026) : "on a fait équipe A équipe B mais on sait pas qui
    // est qui" -- BUG DE DESIGN confirmé : au-delà de 2 joueurs, séparer en
    // deux équipes par simple alternance d'index ne correspond à rien dans
    // un match individuel. Remplacé par un classement avec les vrais noms,
    // jauge à 2 côtés conservée uniquement pour un vrai face-à-face à 2.
    expect(source).toContain('const teamA = players.filter');
    expect(source).toContain('const teamB = players.filter');
    expect(source).toContain('players.length === 2 ?');
    expect(source).toContain('<Text style={s.duelName}>{first.username}</Text>');
    expect(source).toContain('<Text style={[s.duelName, { textAlign: \'right\' }]}>{second.username}</Text>');
    expect(source).toContain("style={[s.powerLeft, { width: powerShareAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]}");
    expect(source).toContain('players.length > 2 ? <View style={s.groupStandings}>');
    expect(source).toContain('rank === 0 ? \'👑\' : `#${rank + 1}`');
    expect(source).toContain('<Text style={s.groupStandingName} numberOfLines={1}>{player.username}</Text>');
    // Adel (05/09/2026) : "si demain on est 10, est-ce qu'on va être obligé
    // de Swiper" -- le direct plafonne à 5 joueurs + ma propre ligne pour
    // ne jamais forcer de scroll pendant une manche chronométrée.
    expect(source).toContain('const top = players.slice(0, 5);');
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
    expect(source).toContain('invite: { marginTop: 10, minHeight: 132');
    expect(source).toContain('no: { flex: 1, minHeight: 52');
    expect(source).toContain('yes: { flex: 1, minHeight: 52');
    expect(source).toContain('hitSlop={10}');
    expect(source).toContain("inviteQuestion: { color: colors.textPrimary, fontSize: 15, lineHeight: 21");
    expect(source).toContain("inviteName: { color: '#FFF', fontSize: 17");
    expect(source).toContain('borderColor: colors.primary');
    expect(source).toContain('CONNEXION AU BATTLE…');
    expect(source).toContain('respondingChallengeId');
  });

  it('keeps the horizontal music-style selector compact on 390x844', () => {
    expect(source).toContain('style={s.themeScroll}');
    // Adel (07/09/2026) : la pastille affiche désormais aussi la mise Free du
    // nombre de manches ("🎁N") sur une seconde ligne -- légèrement plus
    // haute qu'avant, mais toujours une simple rangée horizontale compacte.
    expect(source).toContain("themeScroll: { flexGrow: 0, flexShrink: 0, height: 52, maxHeight: 52 }");
    expect(source).toContain("theme: { height: 48, minHeight: 48");
    expect(source).toContain("themeRow: { gap: 6, paddingRight: 12, alignItems: 'center' }");
  });

  it('renders four equal answer choices in solo and online Battle', () => {
    expect(source).toContain('Array.from(dedupMap.values()).slice(0, 4)');
    expect(source).toContain('(round.choices || []).forEach((choice)');
    expect(source).toContain('Écoute · réponds · affronte');
    expect(source).not.toContain('i === 2 && s.answerFull');
    expect(source).toContain('borderColor: colors.primary');
  });

  it('keeps the timer and multiplayer score gauge below the artwork and before Qui chante', () => {
    const soloStart = source.indexOf('<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.soloScroll}>');
    const soloVisual = source.indexOf('<View style={s.visual}>', soloStart);
    const soloClock = source.indexOf('<View style={s.clockRow}>', soloVisual);
    const soloQuestion = source.indexOf('<Text style={s.question}>Qui chante ?</Text>', soloClock);
    expect(soloVisual).toBeLessThan(soloClock);
    expect(soloClock).toBeLessThan(soloQuestion);

    const arenaStart = source.indexOf("if (arena) {");
    const arenaVisual = source.indexOf('<View style={s.visual}>', arenaStart);
    const arenaClock = source.indexOf('<View style={s.clockRow}>', arenaVisual);
    const duelGauge = source.indexOf('players.length === 2 ? <View style={s.duel}>', arenaClock);
    const groupGauge = source.indexOf('players.length > 2 ? <View style={s.groupStandings}>', arenaClock);
    const arenaQuestion = source.indexOf('<Text style={s.question}>Qui chante ?</Text>', arenaClock);
    expect(arenaVisual).toBeLessThan(arenaClock);
    expect(arenaClock).toBeLessThan(duelGauge);
    expect(duelGauge).toBeLessThan(arenaQuestion);
    expect(groupGauge).toBeLessThan(arenaQuestion);
  });

  it('explains credit failures instead of leaving accept/challenge apparently dead', () => {
    expect(source).toContain('BATTLE_CHALLENGER_NO_CREDIT');
    expect(source).toContain('BATTLE_TARGET_NO_CREDIT');
    // Adel (07/09/2026) : "pour huit musiques il perd trois Free, pour 15
    // musiques ... plus la mise est grosse" -- la mise n'est plus fixe à 3,
    // le message doit annoncer le montant REEL requis pour le nombre de
    // manches concerné (embarqué par le serveur dans "...REQUIRED:<n>").
    expect(source).toContain('Il te faut au moins ${');
    expect(source).toContain('parseRequiredFree');
    expect(source).toContain('stakeForRounds');
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
    expect(source).toContain("answerWrong: { borderWidth: 2, borderColor: colors.danger");
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

describe('Loki Music Battle accept reliability', () => {
  const battle = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const live = readNormalized(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts');

  it('uses the arena state returned by accept without requiring a second network call', () => {
    expect(live).toContain('arenaState: (data as any)?.arenaState ?? null');
    expect(battle).toContain('response.arenaState || await loadArenaAfterAccept(response.arenaId)');
  });

  it('reacts immediately and uses large touch targets for accept/refuse', () => {
    expect(battle).toContain('setAudioReady(false);\n      void stopTrackPreview();');
    expect(battle).toContain('minHeight: 52');
    expect(battle).toContain('borderColor: colors.primary');
    expect(battle).toContain('hitSlop={10}');
    expect(battle).toContain("inviteQuestion: { color: colors.textPrimary, fontSize: 15, lineHeight: 21");
    expect(battle).toContain('CONNEXION AU BATTLE…');
  });
});

describe('Loki Music Battle persistent group invitations', () => {
  const battle = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const live = readNormalized(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts');

  it('invites additional players into the same arena instead of replacing the group', () => {
    expect(live).toContain("rpc('keep_battle_arena_challenge_send'");
    expect(battle).toContain('sendBattleArenaChallenge(arena.id, player.profileId)');
    expect(battle).toContain('GROUPE {arena.seats.length}/10');
    expect(battle).toContain("invited ? 'INVITÉ' : targetShort ? `${player.remainingFree}/${stakeForRounds(arena.roundCount)} FREE` : 'INVITER'");
    expect(battle).toContain('arena.openSeats > 0');
  });

  it('keeps post-match add-player controls smartphone sized', () => {
    expect(battle).toContain('arenaInviteButton: { minWidth: 94, minHeight: 52');
    expect(battle).toContain('arenaInviteRow: { minHeight: 62');
    expect(battle).toContain('INVITER UN AMI PAR LIEN');
  });
});

describe('Loki Music Battle credit gating from SOLO invite rail (audit 22/09/2026)', () => {
  const battle = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');

  it('disables the in-solo BATTLE button when the current user or target lacks the required Free', () => {
    expect(battle).toContain('const selfShort = insufficientForRoundCount(roundCount);');
    expect(battle).toContain('const targetShort = insufficientForOpponent(p);');
    expect(battle).toContain('const creditBlocked = selfShort || targetShort;');
    expect(battle).toContain('disabled={Boolean(challengeBusyId) || sent || blocked || creditBlocked}');
    expect(battle).toContain("selfShort ? 'MES FREE INSUFF.' : targetShort ? `${p.remainingFree}/${stakeForRounds(roundCount)} FREE` : 'BATTLE'");
  });

  it('rechecks the sender credit before any challenge leaves the device', () => {
    expect(battle).toContain('const freshCredit = await loadMyKeepBattleCreditStatus().catch(() => myCreditStatus);');
    expect(battle).toContain('const senderShort = freshCredit');
    expect(battle).toContain('if (senderShort) {');
    expect(battle).toContain('return false;');
  });

  it('keeps selected players when no invite was actually sent and only enters the arena after success', () => {
    expect(battle).toContain('let sentCount = 0;');
    expect(battle).toContain('if (await challenge(player)) sentCount += 1;');
    expect(battle).toContain('if (sentCount < 1) return;');
  });

  it('drops an expired/stale building arena before sending a new invite', () => {
    expect(battle).toContain('const existingArena = await loadKeepBattleArena(arenaId).catch(() => null);');
    expect(battle).toContain("existingArena.status !== 'WAITING'");
    expect(battle).toContain('existingArena.openSeats <= 0');
    expect(battle).toContain('setBuildingArena(null);');
  });
});

describe('Loki Music Battle "Joueurs disponibles" multi-select redesign (Adel, 21/09/2026 : case à cocher + barre fixe "Démarrer la Battle")', () => {
  const battle = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');

  it('replaces the per-player BATTLE button with a read-only status badge (Prêt / En attente / Crédits insuffisants / Bloqué)', () => {
    expect(battle).not.toContain('`BATTLE · ${themeLabel(themeCode)} · ${roundCount}`');
    expect(battle).toContain("const statusLabel = sending ? 'Envoi…' : blocked ? `Bloqué ${formatInviteCooldown(blockedMs)}` : sent ? 'En attente' : short ? 'Crédits insuffisants' : 'Prêt';");
    expect(battle).toContain('battleStatusBadge');
  });

  it('adds an accessible per-player checkbox, disabled and never selectable when ineligible', () => {
    expect(battle).toContain('accessibilityRole="checkbox"');
    expect(battle).toContain('const isPlayerSelectable = React.useCallback((player: KeepBattleLivePlayer) => {');
    expect(battle).toContain('if (insufficientForOpponent(player)) return false;');
    expect(battle).toContain('if (outgoingPendingTargetIds.has(player.profileId)) return false;');
    expect(battle).toContain('const toggleBattlePlayerSelection = (player: KeepBattleLivePlayer) => {');
    expect(battle).toContain('if (!isPlayerSelectable(player)) return;');
    expect(battle).toContain('browsePlayerIneligible');
    expect(battle).toContain('battleCheckboxDisabled');
  });

  it('highlights a selected player with the KEEP violet primary color, never color alone (status text always present)', () => {
    expect(battle).toContain("import { colors } from '../theme/colors';");
    expect(battle).toContain('browsePlayerSelected: { borderColor: colors.primary, borderWidth: 2');
    expect(battle).toContain('battleCheckboxOn: { backgroundColor: colors.primary, borderColor: colors.primaryLight }');
  });

  it('prunes the selection when a player becomes ineligible after a round-count/theme filter change', () => {
    expect(battle).toContain('React.useEffect(() => {\n    setSelectedBattlePlayerIds((prev) => {');
    expect(battle).toContain('const stillValid = new Set(Array.from(prev).filter((id) => {');
    expect(battle).toContain('return player ? isPlayerSelectable(player) : false;');
    expect(battle).toContain('}, [livePlayers, isPlayerSelectable]);');
  });

  it('adds a sticky footer with a live "X/Y joueurs sélectionnés" counter and a gated "Démarrer la Battle" button', () => {
    expect(battle).toContain('battleSelectionFooter');
    expect(battle).toContain('Sélectionne au moins 1 adversaire');
    expect(battle).toContain('joueurs au total');
    expect(battle).toContain('DÉMARRER');
    expect(battle).toContain('const canStartSelectedBattle = selectedLiveBattlePlayers.length >= 1 && creditReady && !insufficientForRoundCount(roundCount) && !startingGroupBattle;');
    expect(battle).toContain('battleStartButtonDisabled');
  });

  it('sends every selected player into the SAME shared arena instead of creating one arena per player', () => {
    // BUG évité : challenge() lisait buildingArenaId depuis la fermeture React
    // (figée au rendu) -- correct pour un tap utilisateur à la fois (un
    // re-rendu entre deux appuis), faux pour startSelectedBattle() qui
    // l'appelle plusieurs fois d'affilée SANS re-rendu entre les appels. Une
    // ref toujours à jour empêche de recréer une arène par joueur sélectionné.
    expect(battle).toContain('const buildingArenaIdRef = React.useRef<string | null>(null);');
    expect(battle).toContain('const setBuildingArena = React.useCallback((id: string | null) => {');
    expect(battle).toContain('buildingArenaIdRef.current = id;');
    expect(battle).toContain('let arenaId = buildingArenaIdRef.current;');
    expect(battle).toContain('for (const player of targets) {\n        if (await challenge(player)) sentCount += 1;\n      }');
    expect(battle).toContain('const finalArenaId = buildingArenaIdRef.current;');
    expect(battle).not.toContain('let arenaId = buildingArenaId;');
  });

  it('allows a classic 1v1 Battle with one selected opponent, while still supporting group selection', () => {
    expect(battle).toContain('if (targets.length < 1) return;');
    expect(battle).toContain('selectedLiveBattlePlayers.length >= 1');
  });

  it('scrolls the player list independently from the fixed header/filters and the fixed footer', () => {
    expect(battle).toContain('<ScrollView style={s.browseScroll} contentContainerStyle={s.browseScrollContent} showsVerticalScrollIndicator={false}>');
  });

  it('reuses the existing challenge()/arena service calls unchanged -- no new backend function introduced', () => {
    expect(battle).toContain('const created = await createKeepBattleArena(themeCode, roundCount, realThemes.length > 1 ? realThemes : undefined);');
    expect(battle).toContain('await sendBattleArenaChallenge(arenaId, player.profileId);');
    const startSelectedBattleBody = battle.slice(battle.indexOf('const startSelectedBattle = async () => {'), battle.indexOf('const startSelectedBattle = async () => {') + 700);
    expect(startSelectedBattleBody).not.toContain('createKeepBattleArena');
    expect(startSelectedBattleBody).not.toContain('sendBattleArenaChallenge');
  });
  it('shows unmistakable feedback after DÉMARRER sends an invitation', () => {
    expect(battle).toContain("'INVITATION ENVOYÉE'");
    expect(battle).toContain('EN ATTENTE DE RÉPONSE');
    expect(battle).toContain('arena.pendingInviteCount > 0');
    expect(battle).toContain('tu peux continuer à inviter d’autres joueurs');
  });

  it('uses a coherent Loki lobby hierarchy and fresh server credit state', () => {
    expect(battle).toContain('battleHero: {');
    expect(battle).toContain('battleSetupCard: {');
    expect(battle).toContain('battleModes: {');
    expect(battle).toContain('lobbySummary: {');
    expect(battle).toContain('const freshCredit = await loadMyKeepBattleCreditStatus().catch(() => myCreditStatus);');
    expect(battle).toContain('VÉRIFICATION…');
    expect(battle).toContain('FREE INSUFFISANTS');
  });

  it('never exposes an actionable Battle invite when the target lacks the current stake', () => {
    expect(battle).toContain('const opponentNeedsMoreFree = React.useCallback');
    expect(battle).toContain('const freshTarget = await loadLiveSoloPlayers(30, roundCount)');
    expect(battle).toContain('n’a que ${freshTarget.remainingFree} Free');
    expect(battle).toContain('Aucun adversaire avec assez de Free');
    expect(battle).toContain('Free · indisponible');
    expect(battle).toContain("targetShort ? `${p.remainingFree}/${stakeForRounds(roundCount)} FREE` : 'BATTLE'");
  });

  it('applies the same no-credit guard to player stats and arena invitations', () => {
    expect(battle).toContain('disabled={insufficientForOpponent(statsPlayer)}');
    expect(battle).toContain('targetShort = opponentNeedsMoreFree(player, arena.roundCount)');
    expect(battle).toContain('disabled={invited || blocked || targetShort || Boolean(arenaInviteBusyId)}');
    expect(battle).toContain('BATTLE_TARGET_NO_CREDIT');
  });

  it('asks Supabase for players who can afford the currently selected Battle format', () => {
    const live = readNormalized(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts');
    expect(live).toContain("p_round_count: Math.max(5, Math.min(Math.round(roundCount) || 8, 30))");
    expect(battle).toContain('loadLiveSoloPlayers(20, roundCount)');
    expect(battle).toContain('loadLiveSoloPlayers(30, arena.roundCount)');
  });

});
