import React from 'react';
import { ActivityIndicator, Alert, Animated, Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';
import { KeepBattleArenaState, KeepBattleTheme, loadKeepBattleArena, loadKeepBattleThemes, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena } from '../services/keepBattleService';
import { KeepBattleSoloPack, loadKeepBattleSoloPack } from '../services/keepBattleExperienceService';
import { heartbeatSoloBattle, KeepBattleIncomingChallenge, KeepBattleLivePlayer, leaveSoloBattle, loadIncomingBattleChallenges, loadLiveSoloPlayers, loadOutgoingBattleChallenges, respondBattleChallenge, sendBattleChallenge } from '../services/keepBattleLiveService';

const ROUND_MS = 10000;
const KEEP_BATTLE_SHARE = 'https://adelkhatra-bit.github.io/KEEP/share-profile/';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const initial = (name: string) => (name || 'K').replace(/^@/, '').slice(0, 1).toUpperCase();

const FALLBACK_THEMES: KeepBattleTheme[] = [
  { code: 'MIX', label: 'Mix' }, { code: 'RAP_FR', label: 'Rap FR' }, { code: 'RAP_US', label: 'Rap US' },
  { code: 'FUNK', label: 'Funk' }, { code: 'DISCO', label: 'Disco' }, { code: 'AFRO', label: 'Afro' },
  { code: 'ELECTRO', label: 'Electro' }, { code: 'POP', label: 'Pop' }, { code: 'RNB', label: 'R&B' },
  { code: 'ROCK', label: 'Rock' }, { code: 'LATINO', label: 'Latino' }, { code: 'RAI', label: 'Raï' },
];

type Props = {
  enabled: boolean;
  onOpenProfile: (username: string) => void;
  onRequireAccount?: () => void;
  onExit?: () => void;
};

export default function KeepBattleMobileGameV3({ enabled, onOpenProfile, onRequireAccount, onExit }: Props) {
  const [themes, setThemes] = React.useState<KeepBattleTheme[]>(FALLBACK_THEMES);
  const [themeCode, setThemeCode] = React.useState('MIX');
  const [solo, setSolo] = React.useState<KeepBattleSoloPack | null>(null);
  const [soloIndex, setSoloIndex] = React.useState(0);
  const [soloAnswer, setSoloAnswer] = React.useState<string | null>(null);
  const [soloScore, setSoloScore] = React.useState(0);
  const [soloStartedAt, setSoloStartedAt] = React.useState(0);
  const [arena, setArena] = React.useState<KeepBattleArenaState | null>(null);
  const [livePlayers, setLivePlayers] = React.useState<KeepBattleLivePlayer[]>([]);
  const [incoming, setIncoming] = React.useState<KeepBattleIncomingChallenge[]>([]);
  const [browseOnline, setBrowseOnline] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [audioReady, setAudioReady] = React.useState(false);
  const [handledOutgoingId, setHandledOutgoingId] = React.useState('');
  const pulse = React.useRef(new Animated.Value(1)).current;
  const versusOpacity = React.useRef(new Animated.Value(0)).current;
  const versusScale = React.useRef(new Animated.Value(.72)).current;

  React.useEffect(() => { void loadKeepBattleThemes().then((rows) => rows.length && setThemes(rows)).catch(() => {}); }, []);
  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, []);
  React.useEffect(() => () => { void stopTrackPreview(); void leaveSoloBattle().catch(() => {}); }, []);

  const themeLabel = (code: string) => themes.find((t) => t.code === code)?.label || code;
  const animateResult = React.useCallback(() => {
    pulse.setValue(.96);
    Animated.spring(pulse, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }).start();
  }, [pulse]);
  const animateVersus = React.useCallback(() => {
    versusOpacity.setValue(0); versusScale.setValue(.72);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(versusOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(versusScale, { toValue: 1, friction: 4, tension: 95, useNativeDriver: true }),
      ]),
      Animated.delay(1100),
      Animated.timing(versusOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [versusOpacity, versusScale]);

  const playVerified = React.useCallback(async (key: string, url?: string | null, duration = ROUND_MS): Promise<boolean> => {
    if (!url) return false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await playTrackPreviewSegment(`${key}:${attempt}`, url, 0, duration);
        return true;
      } catch {
        await wait(220 + attempt * 180);
      }
    }
    return false;
  }, []);

  const shareInvite = React.useCallback(async () => {
    await Share.share({ message: `Viens me défier sur KEEP Battle ⚡\n10 secondes · 3 choix · gagne des Free\n${KEEP_BATTLE_SHARE}` });
  }, []);

  const refreshSocial = React.useCallback(async () => {
    if (!enabled || (!solo && !browseOnline)) return;
    try {
      const [players, inbox, outbox] = await Promise.all([
        loadLiveSoloPlayers(20),
        loadIncomingBattleChallenges(),
        loadOutgoingBattleChallenges(),
      ]);
      setLivePlayers(players);
      setIncoming(inbox);
      const accepted = outbox.find((x) => x.status === 'ACCEPTED' && x.arenaId);
      if (accepted?.arenaId) {
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        setSolo(null); setBrowseOnline(false); setAudioReady(false);
        setArena(await loadKeepBattleArena(accepted.arenaId));
        animateVersus();
        return;
      }
      const feedback = outbox.find((x) => (x.status === 'DECLINED' || x.status === 'EXPIRED') && x.id !== handledOutgoingId);
      if (feedback) {
        setHandledOutgoingId(feedback.id);
        Alert.alert(
          feedback.status === 'DECLINED' ? 'Battle refusé' : 'Invitation expirée',
          feedback.status === 'DECLINED'
            ? `@${feedback.username} a refusé le Battle. Invite un autre joueur ou partage KEEP à un ami.`
            : `@${feedback.username} n’a pas répondu à temps. Invite un autre joueur ou partage KEEP à un ami.`,
          [{ text: 'Continuer', style: 'cancel' }, { text: 'Inviter un ami', onPress: () => { void shareInvite(); } }],
        );
      }
    } catch {}
  }, [enabled, solo, browseOnline, handledOutgoingId, animateVersus, shareInvite]);

  React.useEffect(() => {
    if (!enabled || (!solo && !browseOnline) || arena) return undefined;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (solo) await heartbeatSoloBattle(solo.themeCode).catch(() => {});
      await refreshSocial();
    };
    void tick();
    const id = setInterval(() => { void tick(); }, 650);
    return () => { alive = false; clearInterval(id); };
  }, [enabled, solo?.themeCode, Boolean(solo), browseOnline, arena?.id, refreshSocial]);

  React.useEffect(() => {
    const round = solo?.rounds[soloIndex];
    if (!round) return undefined;
    let alive = true;
    setSoloStartedAt(0); setAudioReady(false);
    const start = async () => {
      while (alive) {
        const ok = await playVerified(`solo:${round.trackId}:${soloIndex}`, round.previewUrl, ROUND_MS + 800);
        if (!alive) return;
        if (ok) {
          setAudioReady(true);
          setSoloStartedAt(Date.now());
          return;
        }
        await wait(650);
      }
    };
    void start();
    return () => { alive = false; void stopTrackPreview(); };
  }, [solo?.themeCode, soloIndex, playVerified]);

  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;
  React.useEffect(() => {
    if (!solo || !audioReady || soloAnswer || soloRemaining > 0) return;
    setSoloAnswer('__TIMEOUT__'); void stopTrackPreview(); animateResult();
  }, [solo, audioReady, soloAnswer, soloRemaining, animateResult]);
  React.useEffect(() => {
    if (!solo || !soloAnswer || soloIndex >= solo.rounds.length - 1) return undefined;
    const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 950);
    return () => clearTimeout(id);
  }, [solo, soloAnswer, soloIndex]);

  const refreshArena = React.useCallback(async () => {
    if (!arena?.id) return;
    try { setArena(await loadKeepBattleArena(arena.id)); } catch {}
  }, [arena?.id]);
  React.useEffect(() => {
    if (!arena?.id) return undefined;
    const off = subscribeKeepBattleArena(arena.id, () => { void refreshArena(); });
    const id = setInterval(() => { void refreshArena(); }, 300);
    return () => { off(); clearInterval(id); };
  }, [arena?.id, refreshArena]);

  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl) return undefined;
    let alive = true;
    setAudioReady(false);
    const run = async () => {
      const closesAt = round.closesAt ? new Date(round.closesAt).getTime() : Date.now() + ROUND_MS;
      const duration = Math.max(1600, closesAt - Date.now() + 500);
      const ok = await playVerified(`arena:${arena.id}:${arena.matchNo}:${round.position}`, round.previewUrl, duration);
      if (alive && ok) setAudioReady(true);
    };
    void run();
    return () => { alive = false; };
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.previewUrl, arena?.round?.closesAt, playVerified]);
  React.useEffect(() => { if (arena?.round?.revealed) { void stopTrackPreview(); animateResult(); } }, [arena?.round?.revealed, arena?.round?.position, arena?.matchNo, animateResult]);
  React.useEffect(() => {
    if (!arena || arena.status !== 'WAITING' || !arena.isHost || arena.seats.length < 2) return undefined;
    const id = setTimeout(() => { void startKeepBattleArena(arena.id).then((a) => { setArena(a); animateVersus(); }).catch(() => {}); }, 1800);
    return () => clearTimeout(id);
  }, [arena?.id, arena?.status, arena?.isHost, arena?.matchNo, arena?.seats.length, animateVersus]);

  const startSolo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pack = await loadKeepBattleSoloPack(themeCode, 8);
      setArena(null); setBrowseOnline(false); setSolo(pack); setSoloIndex(0); setSoloAnswer(null); setSoloScore(0); setSoloStartedAt(0); setAudioReady(false); setHandledOutgoingId('');
    } catch (e: any) { Alert.alert('KEEP Battle', String(e?.message || 'Impossible de démarrer.')); }
    finally { setBusy(false); }
  };

  const openOnline = async () => {
    if (!enabled) { onRequireAccount?.(); return; }
    setBusy(true);
    try {
      setBrowseOnline(true); setSolo(null); setArena(null); setHandledOutgoingId('');
      setLivePlayers(await loadLiveSoloPlayers(20));
    } catch { setLivePlayers([]); }
    finally { setBusy(false); }
  };

  const challenge = async (player: KeepBattleLivePlayer) => {
    try {
      await sendBattleChallenge(player.profileId, solo?.themeCode || themeCode);
      setHandledOutgoingId('');
      Alert.alert('Défi envoyé', `@${player.username} reçoit maintenant ta demande Battle.`);
    } catch {
      Alert.alert('Battle', `@${player.username} n’est plus disponible.`);
      void refreshSocial();
    }
  };

  const respond = async (item: KeepBattleIncomingChallenge, accept: boolean) => {
    try {
      const response = await respondBattleChallenge(item.id, accept);
      setIncoming((rows) => rows.filter((x) => x.id !== item.id));
      if (accept && response.arenaId) {
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        setSolo(null); setAudioReady(false);
        setArena(await loadKeepBattleArena(response.arenaId));
        animateVersus();
      }
    } catch { Alert.alert('Battle', 'Cette invitation a expiré.'); }
  };

  const answerSolo = (choice: string) => {
    const round = solo?.rounds[soloIndex];
    if (!round || !audioReady || !soloStartedAt || soloAnswer || soloRemaining <= 0) return;
    void stopTrackPreview(); setSoloAnswer(choice);
    if (choice === round.correctAnswer) setSoloScore((v) => v + 1);
    animateResult();
  };

  const answerArena = async (choice: string) => {
    if (!arena || arena.status !== 'ACTIVE' || arena.round?.answered || arena.round?.revealed || pending) return;
    const startsAt = arena.round?.startedAt ? new Date(arena.round.startedAt).getTime() : 0;
    const closesAt = arena.round?.closesAt ? new Date(arena.round.closesAt).getTime() : 0;
    if ((startsAt && Date.now() < startsAt) || (closesAt && Date.now() >= closesAt)) return;
    void stopTrackPreview(); setPending(choice);
    try { setArena(await submitKeepBattleArenaQuizAnswer(arena.id, choice)); } catch {}
    finally { setPending(null); }
  };

  const Avatar = ({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) => url
    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}><Text style={s.avatarLetter}>{initial(name)}</Text></View>;

  if (solo) {
    const round = solo.rounds[soloIndex];
    const timeout = soloAnswer === '__TIMEOUT__';
    const answered = Boolean(soloAnswer);
    const correct = !timeout && soloAnswer === round.correctAnswer;
    const attempts = soloIndex + (answered ? 1 : 0);
    const errors = Math.max(0, attempts - soloScore);
    const remaining = Math.max(0, solo.rounds.length - attempts);
    const challengeRemaining = incoming[0] ? Math.max(0, Math.ceil((new Date(incoming[0].expiresAt).getTime() - now) / 1000)) : 0;
    const pct = audioReady ? (soloRemaining / ROUND_MS) * 100 : 100;
    return <View style={s.root}>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setSolo(null); void stopTrackPreview(); void leaveSoloBattle().catch(() => {}); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE</Text><Text style={s.title}>{themeLabel(solo.themeCode)}</Text></View><Text style={s.round}>{soloIndex + 1}/8</Text></View>
      <View style={s.clockRow}><Text style={[s.clock, audioReady && soloRemaining < 2200 && s.clockHot]}>{audioReady ? `${(soloRemaining / 1000).toFixed(1)}s` : 'PRÊT'}</Text><Text style={s.clockHint}>{audioReady ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}</Text></View>
      <View style={s.timeTrack}><View style={[s.timeFill, { width: `${pct}%` }]} /></View>
      <Animated.View style={[s.card, { transform: [{ scale: pulse }] }]}>
        <View style={s.visual}>{answered && round.artworkUrl ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <Text style={s.music}>♫</Text>}{answered ? <View style={s.result}><Text style={correct ? s.good : s.bad}>{correct ? 'GAGNÉ !' : timeout ? 'OUPS · TROP TARD' : 'PERDU'}</Text><Text style={s.artist}>{round.artist}</Text></View> : null}</View>
        <Text style={s.question}>Qui chante ?</Text>
        <View style={s.answers}>{round.choices.slice(0, 3).map((choice, i) => <TouchableOpacity key={choice} disabled={!audioReady || answered} onPress={() => answerSolo(choice)} style={[s.answer, answered && choice === round.correctAnswer && s.answerCorrect]}><Text style={s.answerNo}>{i + 1}</Text><Text style={s.answerText}>{choice}</Text></TouchableOpacity>)}</View>
      </Animated.View>
      <View style={s.scoreLine}><Text style={s.score}>✓ {soloScore} · ✕ {errors}</Text><Text style={s.score}>{remaining} à jouer</Text></View>
      {enabled ? <View style={s.live}><View style={s.liveHeader}><View style={s.dot} /><Text style={s.liveTitle}>{livePlayers.length ? `${livePlayers.length} joueur${livePlayers.length > 1 ? 's' : ''} disponible${livePlayers.length > 1 ? 's' : ''}` : 'Tu es visible pour les Battles'}</Text></View>{livePlayers.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveRow}>{livePlayers.map((p) => <View key={p.profileId} style={s.livePlayer}><TouchableOpacity onPress={() => onOpenProfile(p.username)}><Avatar name={p.username} url={p.avatarUrl} /></TouchableOpacity><Text numberOfLines={1} style={s.username}>@{p.username}</Text><TouchableOpacity style={s.battleButton} onPress={() => { void challenge(p); }}><Text style={s.battleButtonText}>BATTLE ?</Text></TouchableOpacity></View>)}</ScrollView> : null}</View> : null}
      {incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteTop}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={54} /><View style={{ flex: 1 }}><Text style={s.inviteLabel}>⚡ DÉFI EN DIRECT · {challengeRemaining}s</Text><TouchableOpacity onPress={() => onOpenProfile(incoming[0].username)}><Text style={s.inviteName}>@{incoming[0].username}</Text></TouchableOpacity><Text style={s.inviteQuestion}>Souhaites-tu faire un Battle et gagner des Free ?</Text></View></View><View style={s.inviteActions}><TouchableOpacity style={s.no} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>NON</Text></TouchableOpacity><TouchableOpacity style={s.yes} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>OUI · BATTLE</Text></TouchableOpacity></View></Animated.View> : null}
    </View>;
  }

  if (arena) {
    const round = arena.round;
    const players = (arena.leaderboard?.length ? arena.leaderboard.map((l) => arena.seats.find((x) => x.profileId === l.profileId) || ({ ...l, avatarUrl: null } as any)) : arena.seats) || [];
    const startsAt = round?.startedAt ? new Date(round.startedAt).getTime() : 0;
    const closesAt = round?.closesAt ? new Date(round.closesAt).getTime() : 0;
    const ready = arena.status === 'ACTIVE' && (!startsAt || now >= startsAt);
    const left = arena.status === 'ACTIVE' && closesAt ? Math.max(0, closesAt - Math.max(now, startsAt || now)) : ROUND_MS;
    const pct = Math.max(0, Math.min(100, (left / ROUND_MS) * 100));
    const first = players[0]; const second = players[1];
    const total = Math.max(1, (first?.score || 0) + (second?.score || 0));
    const leftShare = players.length === 2 ? Math.max(12, Math.min(88, ((first?.score || 0) / total) * 100)) : 50;
    return <View style={s.root}>
      <Animated.View pointerEvents="none" style={[s.versus, { opacity: versusOpacity, transform: [{ scale: versusScale }] }]}><Text style={s.versusText}>⚡ BATTLE ⚡</Text><Text style={s.versusNames}>{first ? `@${first.username}` : 'KEEP'} VS {second ? `@${second.username}` : 'KEEP'}</Text></Animated.View>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setArena(null); void stopTrackPreview(); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE · {arena.seats.length} JOUEURS</Text><Text style={s.title}>{themeLabel(arena.themeCode)}</Text></View><Text style={s.round}>{arena.currentRound || 0}/{arena.roundCount}</Text></View>
      {first && second ? <View style={s.duel}><View style={s.duelNames}><TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenProfile(first.username)}><Text style={s.duelName}>@{first.username}</Text></TouchableOpacity><Text style={s.duelScore}>{first.score} — {second.score}</Text><TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenProfile(second.username)}><Text style={[s.duelName, { textAlign: 'right' }]}>@{second.username}</Text></TouchableOpacity></View><View style={s.power}><View style={[s.powerLeft, { width: `${leftShare}%` }]} /><View style={s.powerMiddle} /><View style={s.powerRight} /></View></View> : null}
      {arena.status === 'WAITING' ? <View style={s.waiting}><Text style={s.trophy}>⚡</Text><Text style={s.winner}>{arena.seats.length < 2 ? 'EN ATTENTE' : 'DUEL EN SYNCHRONISATION'}</Text><Text style={s.waitText}>{arena.seats.length >= 2 ? 'Les deux joueurs entrent ensemble. Le morceau est préchargé avant le chrono.' : 'En attente d’un adversaire.'}</Text></View> : null}
      {arena.status === 'ACTIVE' && round ? <><View style={s.clockRow}><Text style={[s.clock, ready && left < 2200 && s.clockHot]}>{ready ? `${(left / 1000).toFixed(1)}s` : 'PRÊT'}</Text><Text style={s.clockHint}>{round.answered ? 'RÉPONSE ENREGISTRÉE' : ready ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}</Text></View><View style={s.timeTrack}><View style={[s.timeFill, { width: `${ready ? pct : 100}%` }]} /></View><Animated.View style={[s.card, { transform: [{ scale: pulse }] }]}><View style={s.visual}>{round.revealed && round.artworkUrl ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <Text style={s.music}>♫</Text>}{round.revealed ? <View style={s.result}><Text style={round.myAnswer?.correct ? s.good : s.bad}>{round.myAnswer?.correct ? 'GAGNÉ !' : round.answered ? 'PERDU' : 'OUPS · TROP TARD'}</Text><Text style={s.artist}>{round.artist || ''}</Text>{arena.roundWinner ? <Text style={s.roundWinner}>⚡ @{arena.roundWinner.username} gagne la manche</Text> : null}</View> : null}</View><Text style={s.question}>Qui chante ?</Text>{!round.revealed ? <View style={s.answers}>{(round.choices || []).slice(0, 3).map((choice, i) => <TouchableOpacity key={choice} disabled={Boolean(!ready || round.answered || pending || left <= 0)} onPress={() => { void answerArena(choice); }} style={[s.answer, (round.myAnswer?.selectedAnswer === choice || pending === choice) && s.answerSelected]}><Text style={s.answerNo}>{i + 1}</Text><Text style={s.answerText}>{choice}</Text></TouchableOpacity>)}</View> : null}</Animated.View></> : null}
    </View>;
  }

  if (browseOnline) {
    return <View style={s.root}><View style={s.header}><TouchableOpacity style={s.back} onPress={() => setBrowseOnline(false)}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE</Text><Text style={s.title}>Joueurs disponibles</Text></View><View style={{ width: 36 }} /></View><Text style={s.browseText}>Les utilisateurs actuellement en solo apparaissent ici. Choisis un joueur et envoie-lui un défi.</Text>{busy ? <ActivityIndicator color="#E5F266" /> : livePlayers.length ? <View style={s.browseList}>{livePlayers.map((p) => <View key={p.profileId} style={s.browsePlayer}><TouchableOpacity onPress={() => onOpenProfile(p.username)}><Avatar name={p.username} url={p.avatarUrl} size={48} /></TouchableOpacity><View style={{ flex: 1 }}><TouchableOpacity onPress={() => onOpenProfile(p.username)}><Text style={s.browseName}>@{p.username}</Text></TouchableOpacity><Text style={s.browseMeta}>● joue en solo · {themeLabel(p.themeCode)}</Text></View><TouchableOpacity style={s.browseBattle} onPress={() => { void challenge(p); }}><Text style={s.browseBattleText}>BATTLE ?</Text></TouchableOpacity></View>)}</View> : <View style={s.waiting}><Text style={s.trophy}>♫</Text><Text style={s.winner}>Aucun joueur solo visible</Text><Text style={s.waitText}>La liste se rafraîchit automatiquement.</Text><TouchableOpacity style={s.shareButton} onPress={() => { void shareInvite(); }}><Text style={s.shareButtonText}>INVITER UN AMI</Text></TouchableOpacity></View>}</View>;
  }

  return <View style={s.root}><View style={s.home}><TouchableOpacity style={s.homeBack} onPress={onExit}><Text style={s.homeBackText}>‹</Text></TouchableOpacity><Text style={s.homeIcon}>⚡</Text><Text style={s.homeTitle}>KEEP BATTLE</Text><Text style={s.homeSub}>10 secondes réelles d’écoute · 3 choix · aucun swipe</Text></View><Text style={s.section}>STYLE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeRow}>{themes.map((t) => <TouchableOpacity key={t.code} onPress={() => setThemeCode(t.code)} style={[s.theme, t.code === themeCode && s.themeOn]}><Text style={[s.themeText, t.code === themeCode && s.themeTextOn]}>{t.label}</Text></TouchableOpacity>)}</ScrollView><TouchableOpacity style={s.mainButton} disabled={busy} onPress={() => { void startSolo(); }}>{busy ? <ActivityIndicator color="#15110B" /> : <><Text style={s.mainButtonText}>JOUER SOLO</Text><Text style={s.mainButtonSub}>Le chrono attend que le son démarre</Text></>}</TouchableOpacity><TouchableOpacity style={s.onlineButton} disabled={busy} onPress={() => { void openOnline(); }}><Text style={s.onlineTitle}>BATTLE EN LIGNE</Text><Text style={s.onlineSub}>Voir les joueurs qui jouent déjà en solo</Text></TouchableOpacity></View>;
}

const s = StyleSheet.create({
  root: { width: '100%', flex: 1, paddingBottom: 4 }, home: { alignItems: 'center', paddingVertical: 10, position: 'relative' }, homeBack: { position: 'absolute', left: 0, top: 5, width: 30, height: 30, borderRadius: 15, backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center' }, homeBackText: { color: '#FFF', fontSize: 23, lineHeight: 25 }, homeIcon: { fontSize: 28 }, homeTitle: { color: '#FFF', fontSize: 24, fontWeight: '900' }, homeSub: { color: '#FFF', fontSize: 10, fontWeight: '700', marginTop: 2 }, section: { color: '#E5F266', fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 6 }, themeRow: { gap: 6, paddingRight: 12 }, theme: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: '#30273A', backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center' }, themeOn: { backgroundColor: '#FFF', borderColor: '#FFF' }, themeText: { color: '#FFF', fontSize: 11, fontWeight: '800' }, themeTextOn: { color: '#120E16' }, mainButton: { minHeight: 54, borderRadius: 25, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', marginTop: 14 }, mainButtonText: { color: '#17130B', fontSize: 14, fontWeight: '900' }, mainButtonSub: { color: '#494D22', fontSize: 9, fontWeight: '800', marginTop: 2 }, onlineButton: { minHeight: 58, borderRadius: 20, backgroundColor: '#18121F', borderWidth: 1, borderColor: '#31263B', alignItems: 'center', justifyContent: 'center', marginTop: 9 }, onlineTitle: { color: '#FFF', fontSize: 13, fontWeight: '900' }, onlineSub: { color: '#FFF', fontSize: 10, fontWeight: '700', marginTop: 2 }, header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 }, back: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center' }, backText: { color: '#FFF', fontSize: 24, lineHeight: 26 }, headerMid: { flex: 1, alignItems: 'center' }, kicker: { color: '#E5F266', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFF', fontSize: 15, fontWeight: '900' }, round: { width: 36, textAlign: 'right', color: '#FFF', fontSize: 11, fontWeight: '900' }, clockRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 }, clock: { color: '#FFF', fontSize: 25, fontWeight: '900' }, clockHot: { color: '#FF6687' }, clockHint: { color: '#FFF', fontSize: 8, fontWeight: '900', letterSpacing: .8 }, timeTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#211A29', marginVertical: 5 }, timeFill: { height: '100%', backgroundColor: '#E5F266' }, card: { borderRadius: 22, padding: 7, backgroundColor: '#120E17', borderWidth: 1, borderColor: '#30263A' }, visual: { height: 205, borderRadius: 17, overflow: 'hidden', backgroundColor: '#21192A', alignItems: 'center', justifyContent: 'center', position: 'relative' }, cover: { width: '100%', height: '100%' }, music: { color: '#FFF', fontSize: 68, fontWeight: '900' }, result: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,6,10,.72)', alignItems: 'center', justifyContent: 'center', padding: 14 }, good: { color: '#7FF2B7', fontSize: 26, fontWeight: '900' }, bad: { color: '#FF6C8C', fontSize: 23, fontWeight: '900' }, artist: { color: '#FFF', fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 5 }, roundWinner: { color: '#FFE193', fontSize: 10, fontWeight: '900', textAlign: 'center', marginTop: 9 }, question: { color: '#FFF', fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 7 }, answers: { gap: 6, marginTop: 6 }, answer: { minHeight: 46, borderRadius: 14, backgroundColor: '#1D1625', borderWidth: 1, borderColor: '#342A40', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 }, answerSelected: { borderColor: '#E5F266', backgroundColor: '#30351B' }, answerCorrect: { borderColor: '#69E5A4' }, answerNo: { width: 23, height: 23, borderRadius: 12, backgroundColor: '#2B2235', color: '#FFF', textAlign: 'center', lineHeight: 23, fontSize: 10, fontWeight: '900' }, answerText: { flex: 1, color: '#FFF', fontSize: 13, fontWeight: '900' }, scoreLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 3 }, score: { color: '#FFF', fontSize: 10, fontWeight: '800' }, live: { marginTop: 7, padding: 7, borderRadius: 16, backgroundColor: '#100D14' }, liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6EE8A7' }, liveTitle: { color: '#FFF', fontSize: 10, fontWeight: '900' }, liveRow: { gap: 10, paddingTop: 7 }, livePlayer: { width: 70, alignItems: 'center' }, avatarFallback: { backgroundColor: '#2B2235', alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: '#FFF', fontSize: 16, fontWeight: '900' }, username: { color: '#FFF', fontSize: 9, fontWeight: '800', marginTop: 3, maxWidth: 70 }, battleButton: { minHeight: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center', marginTop: 4 }, battleButtonText: { color: '#FFF', fontSize: 8, fontWeight: '900' }, invite: { position: 'absolute', zIndex: 30, left: 6, right: 6, top: 65, padding: 12, borderRadius: 20, backgroundColor: 'rgba(36,23,48,.98)', borderWidth: 1.5, borderColor: '#E5F266', elevation: 12 }, inviteTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, inviteLabel: { color: '#E5F266', fontSize: 9, fontWeight: '900' }, inviteName: { color: '#FFF', fontSize: 16, fontWeight: '900', marginTop: 1 }, inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 15, fontWeight: '800', marginTop: 4 }, inviteActions: { flexDirection: 'row', gap: 7, marginTop: 10 }, no: { flex: 1, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: '#4B3C57', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 10, fontWeight: '900' }, yes: { flex: 1, minHeight: 40, borderRadius: 20, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 10, fontWeight: '900' }, versus: { position: 'absolute', zIndex: 20, left: 16, right: 16, top: 120, padding: 18, borderRadius: 24, backgroundColor: '#22152D', borderWidth: 1, borderColor: '#8B5CF6', alignItems: 'center' }, versusText: { color: '#E5F266', fontSize: 25, fontWeight: '900' }, versusNames: { color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 5 }, duel: { marginBottom: 6 }, duelNames: { flexDirection: 'row', alignItems: 'center' }, duelName: { color: '#FFF', fontSize: 10, fontWeight: '900' }, duelScore: { color: '#E5F266', fontSize: 12, fontWeight: '900' }, power: { height: 13, borderRadius: 7, overflow: 'hidden', backgroundColor: '#2A2032', flexDirection: 'row', position: 'relative', marginTop: 5 }, powerLeft: { height: '100%', backgroundColor: '#8B5CF6' }, powerRight: { flex: 1, height: '100%', backgroundColor: '#E14E78' }, powerMiddle: { position: 'absolute', zIndex: 3, left: '50%', width: 2, height: '100%', backgroundColor: '#FFF' }, waiting: { padding: 14, borderRadius: 21, backgroundColor: '#120E17', borderWidth: 1, borderColor: '#30263A', alignItems: 'center' }, trophy: { fontSize: 34 }, winner: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 3 }, waitText: { color: '#FFF', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 6 }, browseText: { color: '#FFF', fontSize: 11, lineHeight: 16, marginBottom: 10 }, browseList: { gap: 7 }, browsePlayer: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 17, borderWidth: 1, borderColor: '#30273A', backgroundColor: '#151020', padding: 9 }, browseName: { color: '#FFF', fontSize: 13, fontWeight: '900' }, browseMeta: { color: '#6EE8A7', fontSize: 9, fontWeight: '800', marginTop: 2 }, browseBattle: { minHeight: 34, borderRadius: 17, backgroundColor: '#8B5CF6', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, browseBattleText: { color: '#FFF', fontSize: 9, fontWeight: '900' }, shareButton: { minHeight: 40, borderRadius: 20, backgroundColor: '#8B5CF6', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, shareButtonText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
});
