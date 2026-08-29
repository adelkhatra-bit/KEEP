from pathlib import Path

p = Path("packages/mobile/src/components/KeepBattleMobileGameV3.tsx")
s = p.read_text()

old_import = "import { KeepBattleArenaState, KeepBattleTheme, loadKeepBattleArena, loadKeepBattleThemes, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena } from '../services/keepBattleService';"
new_import = "import { buildKeepBattleArenaInviteLink, KeepBattleArenaState, KeepBattleTheme, loadKeepBattleArena, loadKeepBattleThemes, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena } from '../services/keepBattleService';"
if old_import in s:
    s = s.replace(old_import, new_import)

s = s.replace(
    "  const [soloScore, setSoloScore] = React.useState(0);",
    "  const [soloScore, setSoloScore] = React.useState(0);\n  const [soloFinished, setSoloFinished] = React.useState(false);"
)
s = s.replace(
    "  const versusScale = React.useRef(new Animated.Value(.72)).current;",
    "  const versusScale = React.useRef(new Animated.Value(.72)).current;\n  const celebrationOpacity = React.useRef(new Animated.Value(0)).current;\n  const celebrationScale = React.useRef(new Animated.Value(.72)).current;"
)

theme_effect = "  React.useEffect(() => { void loadKeepBattleThemes().then((rows) => rows.length && setThemes(rows)).catch(() => {}); }, []);"
celebrate = """  const celebrate = React.useCallback(() => {
    celebrationOpacity.setValue(0);
    celebrationScale.setValue(.72);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(celebrationOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(celebrationScale, { toValue: 1.08, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
      Animated.spring(celebrationScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [celebrationOpacity, celebrationScale]);

"""
if "const celebrate = React.useCallback" not in s:
    if theme_effect not in s:
        raise SystemExit("theme effect marker missing")
    s = s.replace(theme_effect, celebrate + theme_effect)

old_solo_effect = """  React.useEffect(() => {
    if (!solo || !soloAnswer || soloIndex >= solo.rounds.length - 1) return undefined;
    const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 950);
    return () => clearTimeout(id);
  }, [solo, soloAnswer, soloIndex]);"""
new_solo_effect = """  React.useEffect(() => {
    if (!solo || !soloAnswer) return undefined;
    if (soloIndex >= solo.rounds.length - 1) {
      const id = setTimeout(() => { setSoloFinished(true); celebrate(); }, 950);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 950);
    return () => clearTimeout(id);
  }, [solo, soloAnswer, soloIndex, celebrate]);"""
if old_solo_effect in s:
    s = s.replace(old_solo_effect, new_solo_effect)
elif "setSoloFinished(true); celebrate()" not in s:
    raise SystemExit("solo end effect marker missing")

s = s.replace(
    "setArena(null); setBrowseOnline(false); setSolo(pack); setSoloIndex(0); setSoloAnswer(null); setSoloScore(0); setSoloStartedAt(0); setAudioReady(false); setHandledOutgoingId('');",
    "setArena(null); setBrowseOnline(false); setSolo(pack); setSoloIndex(0); setSoloAnswer(null); setSoloScore(0); setSoloFinished(false); setSoloStartedAt(0); setAudioReady(false); setHandledOutgoingId('');"
)

share_marker = """  const shareInvite = React.useCallback(async () => {
    await Share.share({ message: `Viens me défier sur KEEP Battle ⚡\\n10 secondes · 3 choix · gagne des Free\\n${KEEP_BATTLE_SHARE}` });
  }, []);"""
share_arena = """
  const shareArenaInvite = React.useCallback(async (state: KeepBattleArenaState) => {
    const link = buildKeepBattleArenaInviteLink(state.arenaCode);
    await Share.share({ message: `Rejoins notre KEEP Battle ⚡\\n${state.seats.length} joueur${state.seats.length > 1 ? 's' : ''} déjà dans le groupe\\n${link}` });
  }, []);"""
if "const shareArenaInvite = React.useCallback" not in s:
    if share_marker not in s:
        raise SystemExit("share marker missing")
    s = s.replace(share_marker, share_marker + share_arena)

s = s.replace(
    "if (!arena || arena.status !== 'WAITING' || !arena.isHost || arena.seats.length < 2) return undefined;",
    "if (!arena || arena.status !== 'WAITING' || !arena.isHost || arena.lastResult || arena.seats.length < 2) return undefined;"
)

result_effect = "  React.useEffect(() => { if (arena?.round?.revealed) { void stopTrackPreview(); animateResult(); } }, [arena?.round?.revealed, arena?.round?.position, arena?.matchNo, animateResult]);"
end_effect = """  React.useEffect(() => {
    if (arena?.status === 'WAITING' && arena.lastResult) celebrate();
  }, [arena?.status, arena?.lastResult?.matchNo, celebrate]);
"""
if "arena.lastResult) celebrate()" not in s:
    if result_effect not in s:
        raise SystemExit("arena result effect marker missing")
    s = s.replace(result_effect, result_effect + "\n" + end_effect)

solo_marker = "    const pct = audioReady ? (soloRemaining / ROUND_MS) * 100 : 100;\n    return <View style={s.root}>"
solo_screen = """    const pct = audioReady ? (soloRemaining / ROUND_MS) * 100 : 100;
    if (soloFinished) {
      const perfect = soloScore === solo.rounds.length;
      return <View style={s.root}>
        <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setSoloFinished(false); setSolo(null); void leaveSoloBattle().catch(() => {}); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE</Text><Text style={s.title}>PARTIE TERMINÉE</Text></View><Text style={s.round}>8/8</Text></View>
        <Animated.View style={[s.finishHero, { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] }]}>
          <Text style={s.finishSpark}>✦ ⚡ ✦</Text>
          <Text style={s.finishTrophy}>{perfect ? '👑' : soloScore >= 6 ? '🏆' : '⚡'}</Text>
          <Text style={s.finishTitle}>{perfect ? 'PARFAIT · 8/8' : `${soloScore}/8`}</Text>
          <Text style={s.finishSub}>{perfect ? 'Aucune erreur. KEEP BATTLE MASTER.' : soloScore >= 6 ? 'Très gros score.' : soloScore >= 4 ? 'Bien joué. Tu peux faire mieux.' : 'Repars immédiatement pour prendre ta revanche.'}</Text>
          <View style={s.finishScore}><Text style={s.finishScoreBig}>{soloScore}</Text><Text style={s.finishScoreSlash}> / 8</Text></View>
        </Animated.View>
        <Text style={s.finishQuestion}>Que souhaites-tu faire ?</Text>
        <TouchableOpacity style={s.finishPrimary} onPress={() => { setSoloFinished(false); setSolo(null); void startSolo(); }}><Text style={s.finishPrimaryText}>REFAIRE UNE PARTIE</Text></TouchableOpacity>
        {enabled ? <TouchableOpacity style={s.finishSecondary} onPress={() => { setSoloFinished(false); void openOnline(); }}><Text style={s.finishSecondaryText}>DÉFIER UN JOUEUR</Text></TouchableOpacity> : null}
        <TouchableOpacity style={s.finishSecondary} onPress={() => { void shareInvite(); }}><Text style={s.finishSecondaryText}>INVITER UN AMI</Text></TouchableOpacity>
      </View>;
    }
    return <View style={s.root}>"""
if "PARFAIT · 8/8" not in s:
    if solo_marker not in s:
        raise SystemExit("solo screen marker missing")
    s = s.replace(solo_marker, solo_screen, 1)

arena_marker = "    const versusLabel = players.length > 2 ? `ÉQUIPE A (${teamA.length}) VS ÉQUIPE B (${teamB.length})` : `${first ? `@${first.username}` : 'KEEP'} VS ${second ? `@${second.username}` : 'KEEP'}`;\n    return <View style={s.root}>"
arena_screen = """    const versusLabel = players.length > 2 ? `ÉQUIPE A (${teamA.length}) VS ÉQUIPE B (${teamB.length})` : `${first ? `@${first.username}` : 'KEEP'} VS ${second ? `@${second.username}` : 'KEEP'}`;
    if (arena.status === 'WAITING' && arena.lastResult) {
      const winner = arena.lastWinner;
      return <View style={s.root}>
        <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setArena(null); void stopTrackPreview(); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE · FIN DU MATCH</Text><Text style={s.title}>{themeLabel(arena.themeCode)}</Text></View><Text style={s.round}>{arena.seats.length}J</Text></View>
        <Animated.View style={[s.finishHero, { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] }]}>
          <Text style={s.finishSpark}>✦ 👑 ✦</Text>
          {winner ? <Avatar name={winner.username} url={winner.avatarUrl} size={72} /> : <Text style={s.finishTrophy}>🏆</Text>}
          <Text style={s.finishTitle}>{winner ? `@${winner.username}` : 'BATTLE TERMINÉ'}</Text>
          <Text style={s.finishSub}>{winner ? 'remporte ce Battle' : 'Résultat enregistré'}</Text>
          <View style={s.finishScore}><Text style={s.finishScoreBig}>{arena.lastResult.score}</Text><Text style={s.finishScoreSlash}> pts</Text></View>
          <Text style={arena.lastResult.won ? s.finishWon : s.finishLost}>{arena.lastResult.won ? `+${arena.lastResult.creditDelta} FREE · GAGNÉ` : `${arena.lastResult.creditDelta} FREE · MATCH TERMINÉ`}</Text>
        </Animated.View>
        <Text style={s.finishQuestion}>Le groupe reste ensemble. Et maintenant ?</Text>
        <TouchableOpacity disabled={busy} style={s.finishPrimary} onPress={() => { setBusy(true); void startKeepBattleArena(arena.id).then((next) => { setArena(next); animateVersus(); }).catch((e: any) => Alert.alert('Battle', String(e?.message || 'Impossible de relancer.'))).finally(() => setBusy(false)); }}><Text style={s.finishPrimaryText}>{busy ? 'PRÉPARATION…' : 'REVANCHE'}</Text></TouchableOpacity>
        {arena.openSeats > 0 ? <TouchableOpacity style={s.finishSecondary} onPress={() => { void shareArenaInvite(arena); }}><Text style={s.finishSecondaryText}>AJOUTER UN JOUEUR · {arena.openSeats} PLACE{arena.openSeats > 1 ? 'S' : ''}</Text></TouchableOpacity> : null}
        <TouchableOpacity style={s.finishSecondary} onPress={() => { setArena(null); void stopTrackPreview(); }}><Text style={s.finishSecondaryText}>QUITTER LE BATTLE</Text></TouchableOpacity>
      </View>;
    }
    return <View style={s.root}>"""
if "KEEP BATTLE · FIN DU MATCH" not in s:
    if arena_marker not in s:
        raise SystemExit("arena screen marker missing")
    s = s.replace(arena_marker, arena_screen, 1)

style_marker = "  root: { width: '100%', flex: 1, paddingBottom: 4 },"
finish_styles = """  root: { width: '100%', flex: 1, paddingBottom: 4 }, finishHero: { minHeight: 300, marginTop: 14, borderRadius: 28, borderWidth: 1, borderColor: '#5A476B', backgroundColor: '#17101F', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden' }, finishSpark: { color: '#E5F266', fontSize: 22, fontWeight: '900', letterSpacing: 5 }, finishTrophy: { fontSize: 72, marginTop: 8 }, finishTitle: { color: '#FFF', fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 8 }, finishSub: { color: '#FFF', fontSize: 12, lineHeight: 17, fontWeight: '800', textAlign: 'center', marginTop: 7, maxWidth: 280 }, finishScore: { flexDirection: 'row', alignItems: 'baseline', marginTop: 13 }, finishScoreBig: { color: '#E5F266', fontSize: 54, lineHeight: 58, fontWeight: '900' }, finishScoreSlash: { color: '#FFF', fontSize: 18, fontWeight: '900' }, finishWon: { color: '#7FF2B7', fontSize: 12, fontWeight: '900', marginTop: 7 }, finishLost: { color: '#FFB3C3', fontSize: 12, fontWeight: '900', marginTop: 7 }, finishQuestion: { color: '#FFF', textAlign: 'center', fontSize: 12, fontWeight: '900', marginVertical: 12 }, finishPrimary: { minHeight: 50, borderRadius: 25, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }, finishPrimaryText: { color: '#17130B', fontSize: 12, fontWeight: '900' }, finishSecondary: { minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: '#40334B', backgroundColor: '#18121F', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }, finishSecondaryText: { color: '#FFF', fontSize: 11, fontWeight: '900' },"""
if "finishHero:" not in s:
    if style_marker not in s:
        raise SystemExit("style marker missing")
    s = s.replace(style_marker, finish_styles, 1)

p.write_text(s)

test = Path("packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts")
t = test.read_text()
before = "  it('keeps the horizontal music-style selector compact on 390x844', () => {"
extra = """  it('shows a complete 8-round endgame with replay and challenge choices', () => {
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
  });

"""
if "shows a complete 8-round endgame" not in t:
    if before not in t:
        raise SystemExit("test marker missing")
    t = t.replace(before, extra + before, 1)
    test.write_text(t)
