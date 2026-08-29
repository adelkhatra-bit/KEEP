import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';
import {
  buildKeepBattleArenaInviteLink,
  joinKeepBattleArena,
  KeepBattleArenaLobby,
  KeepBattleArenaState,
  KeepBattleArenaWinner,
  KeepBattleTheme,
  loadKeepBattleArena,
  loadKeepBattleArenaLobby,
  loadKeepBattleArenaWinnerHistory,
  loadKeepBattleThemes,
  refreshKeepBattleCatalog,
  startKeepBattleArena,
  submitKeepBattleArenaQuizAnswer,
  subscribeKeepBattleArena,
} from '../services/keepBattleService';
import {
  KeepBattleOpenSalon,
  KeepBattleThemeLobby,
  loadBattleThemeLobby,
  loadOpenBattleSalons,
} from '../services/keepBattleSalonService';
import {
  KeepBattleSoloPack,
  loadKeepBattleSoloPack,
} from '../services/keepBattleExperienceService';
import { supabase } from '../services/supabaseClient';

type Props = {
  enabled: boolean;
  onOpenProfile: (username: string) => void;
  onRequireAccount?: () => void;
};

const FALLBACK_THEMES: KeepBattleTheme[] = [
  { code: 'MIX', label: 'Mix surprise' },
  { code: 'RAP_FR', label: 'Rap français' },
  { code: 'RAP_US', label: 'Rap US' },
  { code: 'FUNK', label: 'Funk' },
  { code: 'JAZZ', label: 'Jazz' },
  { code: 'DISCO', label: 'Disco' },
  { code: 'AFRO', label: 'Afro / Afrobeats' },
  { code: 'ELECTRO', label: 'Electro' },
  { code: 'POP', label: 'Pop' },
  { code: 'RNB', label: 'R&B' },
  { code: 'ROCK', label: 'Rock' },
  { code: 'LATINO', label: 'Latino' },
  { code: 'RAI', label: 'Raï / Maghreb' },
];

function formatSeconds(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

function battleError(rawValue: unknown, fallback: string) {
  const raw = String((rawValue as any)?.message || rawValue || '');
  if (raw.includes('MINIMUM_THREE_FREE')) return 'Il faut au moins 3 Free disponibles pour jouer avec d’autres personnes.';
  if (raw.includes('BATTLE_CATALOG_TOO_SMALL')) return 'Le catalogue musical du Battle est en cours de préparation. Réessaie dans quelques secondes.';
  if (raw.includes('AUTH_REQUIRED')) return 'Connecte ton compte KEEP pour jouer avec d’autres personnes.';
  return raw || fallback;
}

export default function KeepBattleArenaPanel({ enabled, onOpenProfile, onRequireAccount }: Props) {
  const [themes, setThemes] = React.useState<KeepBattleTheme[]>(FALLBACK_THEMES);
  const [themeCode, setThemeCode] = React.useState('MIX');
  const [salonThemeFilter, setSalonThemeFilter] = React.useState<string | null>(null);
  const [lobby, setLobby] = React.useState<KeepBattleArenaLobby | null>(null);
  const [themeLobby, setThemeLobby] = React.useState<KeepBattleThemeLobby[]>([]);
  const [openSalons, setOpenSalons] = React.useState<KeepBattleOpenSalon[]>([]);
  const [salonsLoading, setSalonsLoading] = React.useState(true);
  const [salonsError, setSalonsError] = React.useState('');
  const [busySalonId, setBusySalonId] = React.useState('');
  const [arena, setArena] = React.useState<KeepBattleArenaState | null>(null);
  const [winnerHistory, setWinnerHistory] = React.useState<KeepBattleArenaWinner[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [pendingAnswer, setPendingAnswer] = React.useState<string | null>(null);
  const [soundOn, setSoundOn] = React.useState(true);
  const [now, setNow] = React.useState(Date.now());
  const [soloPack, setSoloPack] = React.useState<KeepBattleSoloPack | null>(null);
  const [soloIndex, setSoloIndex] = React.useState(0);
  const [soloAnswer, setSoloAnswer] = React.useState<string | null>(null);
  const [soloScore, setSoloScore] = React.useState(0);
  const [soloBusy, setSoloBusy] = React.useState(false);
  const resultScale = React.useRef(new Animated.Value(1)).current;
  const resultShake = React.useRef(new Animated.Value(0)).current;

  const animateResult = React.useCallback((correct: boolean) => {
    resultScale.setValue(1);
    resultShake.setValue(0);
    if (correct) {
      Animated.sequence([
        Animated.timing(resultScale, { toValue: 1.14, duration: 160, useNativeDriver: true }),
        Animated.spring(resultScale, { toValue: 1, friction: 4, tension: 110, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.sequence([
      Animated.timing(resultShake, { toValue: -9, duration: 70, useNativeDriver: true }),
      Animated.timing(resultShake, { toValue: 9, duration: 70, useNativeDriver: true }),
      Animated.timing(resultShake, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(resultShake, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(resultShake, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  }, [resultScale, resultShake]);

  const refreshLobby = React.useCallback(async () => {
    try { setLobby(await loadKeepBattleArenaLobby()); } catch { }
  }, []);

  const refreshSalons = React.useCallback(async () => {
    setSalonsLoading(true);
    try {
      const [salons, themesSummary] = await Promise.all([
        loadOpenBattleSalons(salonThemeFilter),
        loadBattleThemeLobby(),
      ]);
      setOpenSalons(salons);
      setThemeLobby(themesSummary);
      setSalonsError('');
    } catch {
      setSalonsError('Impossible de charger les salons ouverts pour le moment.');
    } finally {
      setSalonsLoading(false);
    }
  }, [salonThemeFilter]);

  const refreshArena = React.useCallback(async () => {
    if (!arena?.id) return;
    try {
      const next = await loadKeepBattleArena(arena.id);
      setArena(next);
      if (next.round?.answered) setPendingAnswer(null);
    } catch { }
  }, [arena?.id]);

  React.useEffect(() => {
    let live = true;
    void loadKeepBattleThemes().then((rows) => { if (live && rows.length) setThemes(rows); }).catch(() => {});
    if (enabled) void refreshKeepBattleCatalog(24).catch(() => null);
    void refreshLobby();
    return () => { live = false; };
  }, [enabled, refreshLobby]);

  React.useEffect(() => {
    let live = true;
    const reload = async () => {
      if (!live) return;
      await refreshSalons();
    };
    void reload();
    const timer = setInterval(() => { void reload(); }, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [refreshSalons]);

  React.useEffect(() => {
    if (!arena?.id) return undefined;
    const unsubscribe = subscribeKeepBattleArena(arena.id, () => { void refreshArena(); });
    const timer = setInterval(() => { void refreshArena(); }, 450);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [arena?.id, refreshArena]);

  React.useEffect(() => {
    if (!arena?.id || !enabled) return;
    void loadKeepBattleArenaWinnerHistory(arena.id, 10).then(setWinnerHistory).catch(() => setWinnerHistory([]));
  }, [arena?.id, arena?.matchNo, arena?.lastWinner?.profileId, enabled]);

  React.useEffect(() => {
    if (arena?.status !== 'ACTIVE' || !arena.round) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [arena?.status, arena?.round?.position, arena?.matchNo]);

  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl || !soundOn) return;
    const phase = `${arena.id}:${arena.matchNo}:${round.position}:${round.revealed ? 'reveal' : 'listen'}`;
    const duration = round.revealed ? 1600 : Math.max(2500, Math.min(arena.roundDurationMs || 12000, 15000));
    void stopTrackPreview().then(() => playTrackPreviewSegment(`battle:${phase}`, round.previewUrl as string, 0, duration)).catch(() => {});
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.revealed, arena?.round?.previewUrl, arena?.roundDurationMs, soundOn]);

  React.useEffect(() => {
    const round = soloPack?.rounds?.[soloIndex];
    if (!round?.previewUrl || !soundOn) return;
    void stopTrackPreview().then(() => playTrackPreviewSegment(`battle:solo:${soloPack?.themeCode}:${soloIndex}`, round.previewUrl, 0, 12000)).catch(() => {});
  }, [soloPack, soloIndex, soundOn]);

  React.useEffect(() => {
    if (!soloPack || !soloAnswer) return undefined;
    const round = soloPack.rounds[soloIndex];
    animateResult(soloAnswer === round.correctAnswer);
    if (soloIndex >= soloPack.rounds.length - 1) return undefined;
    const timer = setTimeout(() => {
      setSoloIndex((value) => value + 1);
      setSoloAnswer(null);
    }, 1150);
    return () => clearTimeout(timer);
  }, [soloAnswer, soloIndex, soloPack, animateResult]);

  React.useEffect(() => {
    if (!arena?.round?.revealed || arena.round.myAnswer?.correct == null) return;
    animateResult(Boolean(arena.round.myAnswer.correct));
  }, [arena?.id, arena?.matchNo, arena?.round?.position, arena?.round?.revealed, arena?.round?.myAnswer?.correct, animateResult]);

  React.useEffect(() => () => { void stopTrackPreview(); }, []);

  const requireAccount = () => {
    Alert.alert('Compte KEEP requis', 'Le mode solo fonctionne sans compte. Connecte ton compte uniquement pour jouer avec d’autres personnes.', [
      { text: 'Jouer seul', style: 'cancel' },
      { text: 'Mon compte', onPress: onRequireAccount },
    ]);
  };

  const startSolo = async () => {
    if (soloBusy) return;
    setSoloBusy(true);
    try {
      const pack = await loadKeepBattleSoloPack(themeCode, 8);
      setSoloPack(pack);
      setSoloIndex(0);
      setSoloAnswer(null);
      setSoloScore(0);
    } catch (e: any) {
      Alert.alert('Jouer seul', battleError(e, 'Impossible de démarrer le jeu solo pour le moment.'));
    } finally {
      setSoloBusy(false);
    }
  };

  const answerSolo = (choice: string) => {
    const round = soloPack?.rounds?.[soloIndex];
    if (!round || soloAnswer) return;
    setSoloAnswer(choice);
    if (choice === round.correctAnswer) setSoloScore((value) => value + 1);
  };

  const shareSolo = async () => {
    const completed = soloIndex + (soloAnswer ? 1 : 0);
    await Share.share({
      message: `🎧 KEEP BATTLE — Je joue en solo sur ${themes.find((item) => item.code === soloPack?.themeCode)?.label || 'KEEP'}. Score ${soloScore}/${Math.max(1, completed)}. Viens tester ton oreille musicale sur KEEP !\nhttps://adelkhatra-bit.github.io/KEEP/`,
    }).catch(() => {});
  };

  const enterSalon = async (salon: KeepBattleOpenSalon) => {
    if (!enabled || !supabase) return requireAccount();
    if (busy || busySalonId) return;
    setBusySalonId(salon.id);
    try {
      const joined = await joinKeepBattleArena(salon.arenaCode);
      setArena(await loadKeepBattleArena(joined.id));
      await Promise.all([refreshLobby(), refreshSalons()]);
    } catch (e: any) {
      Alert.alert('Salon KEEP Battle', battleError(e, 'Impossible de rejoindre ce salon pour le moment.'));
    } finally {
      setBusySalonId('');
    }
  };

  const autoMatch = async () => {
    if (!enabled || !supabase) return requireAccount();
    if (busy) return;
    setBusy(true);
    try {
      await refreshKeepBattleCatalog(24).catch(() => null);
      const { data, error } = await supabase.rpc('keep_battle_arena_matchmake', { p_theme_code: themeCode });
      if (error) throw error;
      const id = String((data as any)?.id || '');
      if (!id) throw new Error('Arène introuvable.');
      setArena(await loadKeepBattleArena(id));
      await Promise.all([refreshLobby(), refreshSalons()]);
    } catch (e: any) {
      Alert.alert('Jouer avec d’autres', battleError(e, 'Impossible de rejoindre une arène pour le moment.'));
    } finally { setBusy(false); }
  };

  const shareArena = async () => {
    if (!arena) return;
    const link = buildKeepBattleArenaInviteLink(arena.arenaCode);
    await Share.share({ message: `🎧 KEEP BATTLE\nRejoins directement mon salon KEEP avec ce lien :\n${link}` }).catch(() => {});
  };

  const startArena = async () => {
    if (!arena || busy) return;
    setBusy(true);
    try { setArena(await startKeepBattleArena(arena.id)); }
    catch (e: any) { Alert.alert('Démarrer le Battle', e?.message || 'Il faut au moins 2 joueurs éligibles.'); }
    finally { setBusy(false); }
  };

  const answer = async (choice: string) => {
    if (!arena || arena.status !== 'ACTIVE' || arena.round?.answered || pendingAnswer || arena.round?.revealed) return;
    setPendingAnswer(choice);
    try { setArena(await submitKeepBattleArenaQuizAnswer(arena.id, choice)); }
    catch (e: any) {
      setPendingAnswer(null);
      Alert.alert('Réponse Battle', e?.message || 'La réponse n’a pas pu être enregistrée.');
    }
  };

  const activeTheme = themes.find((item) => item.code === themeCode)?.label || 'Mix surprise';

  if (soloPack) {
    const round = soloPack.rounds[soloIndex];
    const finished = Boolean(soloAnswer) && soloIndex >= soloPack.rounds.length - 1;
    const correct = soloAnswer === round.correctAnswer;
    return <View style={s.card}>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>KEEP BATTLE · SOLO</Text>
          <Text style={s.title}>Teste ton oreille musicale.</Text>
          <Text style={s.subtitle}>Tes propres playlists sont exclues. Une réponse suffit : KEEP passe automatiquement au morceau suivant.</Text>
        </View>
        <TouchableOpacity style={s.soundButton} onPress={() => setSoundOn((value) => !value)} accessibilityLabel={soundOn ? 'Couper le son' : 'Activer le son'}>
          <Text style={s.soundText}>{soundOn ? '🔊' : '🔇'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.soloScoreRow}>
        <Text style={s.soloScore}>SCORE {soloScore}/{soloPack.rounds.length}</Text>
        <Text style={s.soloProgress}>MORCEAU {soloIndex + 1}/{soloPack.rounds.length}</Text>
      </View>

      <View style={s.hiddenCover}>
        {round.artworkUrl && soloAnswer ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <Text style={s.question}>{soloAnswer ? '♫' : '?'}</Text>}
      </View>

      <Text style={s.listenText}>{soloAnswer ? `${round.artist} — ${round.title}` : 'Écoute. Qui est l’artiste ?'}</Text>
      <View style={s.choices}>
        {round.choices.map((choice) => {
          const selected = soloAnswer === choice;
          const right = Boolean(soloAnswer) && choice === round.correctAnswer;
          return <TouchableOpacity key={choice} style={[s.choice, selected && s.choiceSelected, right && s.choiceCorrect]} disabled={Boolean(soloAnswer)} onPress={() => answerSolo(choice)}>
            <Text style={s.choiceText} numberOfLines={2}>{choice}</Text>
          </TouchableOpacity>;
        })}
      </View>

      {soloAnswer ? <Animated.View style={[s.revealResult,{transform:[{scale:resultScale},{translateX:resultShake}]}]}>
        <Text style={correct ? s.correct : s.wrong}>{correct ? '✓ BONNE RÉPONSE' : `✕ PERDU · ${round.correctAnswer}`}</Text>
        <Text style={s.autoText}>{finished ? 'PARTIE TERMINÉE' : 'SUITE AUTOMATIQUE…'}</Text>
      </Animated.View> : null}

      <View style={s.verticalActions}>
        <TouchableOpacity style={s.secondaryButton} onPress={() => void shareSolo()}><Text style={s.secondaryButtonText}>PARTAGER · WHATSAPP / MESSAGES / AUTRES</Text></TouchableOpacity>
        {finished ? <TouchableOpacity style={s.primaryButton} onPress={() => void startSolo()}><Text style={s.primaryButtonText}>REJOUER</Text></TouchableOpacity> : null}
        <TouchableOpacity style={s.secondaryButton} onPress={() => { setSoloPack(null); setSoloAnswer(null); void stopTrackPreview(); }}><Text style={s.secondaryButtonText}>RETOUR AUX SALONS</Text></TouchableOpacity>
      </View>
    </View>;
  }

  if (arena) {
    const activePlayers = arena.seats?.length ?? 0;
    const isQueued = arena.me?.status === 'QUEUED';
    const jackpot = Math.max(0, (activePlayers - 1) * 3);
    const round = arena.round ?? null;
    const frozenMs = round?.myAnswer?.responseMs ?? null;
    const remainingMs = round?.closesAt ? Math.max(0, new Date(round.closesAt).getTime() - now) : (arena.roundDurationMs ?? 12000);
    const displayMs = frozenMs ?? remainingMs;
    const progress = Math.max(0, Math.min(1, remainingMs / Math.max(1, arena.roundDurationMs || 12000)));
    const topThree = (arena.leaderboard || []).slice(0,3);

    return <View style={s.card}>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>KEEP ARENA · {arena.themeCode}</Text>
          <Text style={s.title}>Salon multijoueur.</Text>
          <Text style={s.subtitle}>{activePlayers}/{arena.maxPlayers} joueurs · jackpot +{jackpot} Free · personne ne peut bloquer la manche.</Text>
        </View>
        <TouchableOpacity style={s.soundButton} onPress={() => setSoundOn((value) => !value)}><Text style={s.soundText}>{soundOn ? '🔊' : '🔇'}</Text></TouchableOpacity>
      </View>

      <View style={s.seats}>
        {arena.seats.slice(0, 10).map((seat) => <TouchableOpacity key={seat.profileId} style={s.seat} onPress={() => onOpenProfile(seat.username)}>
          <View style={s.avatarWrap}>{seat.avatarUrl ? <Image source={{ uri: seat.avatarUrl }} style={s.avatar} /> : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarLetter}>{seat.username.slice(0, 1).toUpperCase()}</Text></View>}</View>
          <Text style={s.seatName} numberOfLines={1}>@{seat.username}</Text>
        </TouchableOpacity>)}
      </View>

      {topThree.length ? <View style={s.leaderCard}>
        <Text style={s.leaderTitle}>CLASSEMENT EN DIRECT</Text>
        {topThree.map((entry,index)=><TouchableOpacity key={entry.profileId} style={s.leaderRow} onPress={()=>onOpenProfile(entry.username)}>
          <Text style={s.medal}>{index===0?'🥇':index===1?'🥈':'🥉'}</Text>
          <Text style={s.leaderName}>@{entry.username}</Text>
          <Text style={s.leaderScore}>{entry.score} pts</Text>
        </TouchableOpacity>)}
      </View> : null}

      {isQueued ? <View style={s.waitBox}><Text style={s.waitTitle}>Tu es dans la file d’attente</Text><Text style={s.waitText}>KEEP t’installe automatiquement dès qu’une place est disponible.</Text></View> : null}

      {arena.status === 'WAITING' && !isQueued ? <>
        <View style={s.waitBox}><Text style={s.waitTitle}>SALON PRÊT</Text><Text style={s.waitText}>{activePlayers < 2 ? 'Partage le lien : ton ami rejoint directement le salon, sans saisir de code.' : 'Vous pouvez démarrer.'}</Text></View>
        <View style={s.verticalActions}>
          <TouchableOpacity style={s.secondaryButton} onPress={() => void shareArena()}><Text style={s.secondaryButtonText}>INVITER / PARTAGER</Text></TouchableOpacity>
          <TouchableOpacity style={[s.primaryButton, activePlayers < 2 && s.disabled]} onPress={() => void startArena()} disabled={busy || activePlayers < 2}><Text style={s.primaryButtonText}>{busy ? '...' : 'DÉMARRER'}</Text></TouchableOpacity>
          <TouchableOpacity style={s.secondaryButton} onPress={() => { setArena(null); void refreshSalons(); }}><Text style={s.secondaryButtonText}>RETOUR AUX SALONS</Text></TouchableOpacity>
        </View>
      </> : null}

      {arena.status === 'ACTIVE' && round && !isQueued ? <View style={s.gameBox}>
        <View style={s.roundHeader}><Text style={s.roundLabel}>ROUND {arena.currentRound}/{arena.roundCount}</Text><Text style={s.timer}>{round.answered ? `🔒 ${formatSeconds(displayMs)}` : `◷ ${formatSeconds(displayMs)}`}</Text></View>
        <View style={s.timeTrack}><View style={[s.timeFill,{width:`${Math.round(progress*100)}%`}]} /></View>
        <Text style={s.deadlineText}>{round.answered ? 'Réponse verrouillée · passage automatique' : 'Réponds avant la fin du chrono · absence = 0 point'}</Text>
        <View style={s.hiddenCover}>
          {round.revealed && round.artworkUrl ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <Text style={s.question}>{round.revealed ? '♫' : '?'}</Text>}
        </View>
        <Text style={s.listenText}>{round.revealed ? `${round.artist || 'Artiste'} — ${round.title || 'Titre'}` : round.answered ? 'Réponse enregistrée · attends seulement le chrono ou les dernières réponses' : 'Écoute. Qui est l’artiste ?'}</Text>
        {!round.revealed ? <View style={s.choices}>{(round.choices ?? []).map((choice) => {
          const selected = round.myAnswer?.selectedAnswer === choice || pendingAnswer === choice;
          const locked = Boolean(round.answered || pendingAnswer);
          return <TouchableOpacity key={choice} style={[s.choice, selected && s.choiceSelected, locked && !selected && s.choiceLocked]} onPress={() => void answer(choice)} disabled={locked}>
            <Text style={s.choiceText} numberOfLines={2}>{choice}</Text>
          </TouchableOpacity>;
        })}</View> : <Animated.View style={[s.revealResult,{transform:[{scale:resultScale},{translateX:resultShake}]}]}><Text style={round.myAnswer?.correct ? s.correct : s.wrong}>{round.myAnswer?.correct ? `✓ GAGNÉ · +${round.myAnswer?.points ?? 0} pts` : '✕ PERDU · 0 point'}</Text><Text style={s.autoText}>PROCHAINE MANCHE AUTOMATIQUE…</Text></Animated.View>}
        {round.revealed && arena.roundWinner ? <TouchableOpacity style={s.roundWinner} onPress={()=>onOpenProfile(arena.roundWinner!.username)}><Text style={s.roundWinnerText}>⚡ PLUS RAPIDE : @{arena.roundWinner.username} · {formatSeconds(arena.roundWinner.responseMs)}</Text></TouchableOpacity> : null}
      </View> : null}

      {arena.lastWinner ? <TouchableOpacity style={s.championCard} onPress={()=>onOpenProfile(arena.lastWinner!.username)}>
        <Text style={s.championCrown}>👑</Text><View style={{flex:1}}><Text style={s.championLabel}>DERNIER GAGNANT</Text><Text style={s.championName}>@{arena.lastWinner.username}</Text></View><Text style={s.championScore}>{arena.lastWinner.score} pts</Text>
      </TouchableOpacity> : null}

      {winnerHistory.length ? <View style={s.historyCard}><Text style={s.leaderTitle}>PALMARÈS DU SALON</Text>{winnerHistory.slice(0,5).map((winner,index)=><TouchableOpacity key={`${winner.matchNo}-${winner.profileId}`} style={s.historyRow} onPress={()=>onOpenProfile(winner.username)}><Text style={s.historyRank}>#{index+1}</Text><Text style={s.leaderName}>@{winner.username}</Text><Text style={s.leaderScore}>{winner.score} pts</Text></TouchableOpacity>)}</View> : null}

      <View style={s.bottomRow}><TouchableOpacity onPress={() => { setArena(null); void refreshSalons(); }}><Text style={s.link}>RETOUR AUX SALONS</Text></TouchableOpacity><TouchableOpacity onPress={() => void shareArena()}><Text style={s.link}>PARTAGER</Text></TouchableOpacity></View>
    </View>;
  }

  const totalOpen = themeLobby.reduce((sum, item) => sum + item.openSalons, 0);
  const totalPlayers = themeLobby.reduce((sum, item) => sum + item.players, 0);

  return <View style={s.card}>
    <Text style={s.kicker}>KEEP BATTLE · SALONS UTILISATEURS</Text>
    <Text style={s.title}>Joue seul ou avec d’autres.</Text>
    <Text style={s.subtitle}>Aucun code à écrire. Tes playlists sont exclues des morceaux proposés. Tout se joue par boutons simples et passage automatique.</Text>

    <Text style={s.label}>CHOISIS TON STYLE MUSICAL</Text>
    <View style={s.themeWrap}>{themes.map((theme) => <TouchableOpacity key={theme.code} style={[s.themeChip, themeCode === theme.code && s.themeChipOn]} onPress={() => setThemeCode(theme.code)}><Text style={s.themeText}>{theme.label}</Text></TouchableOpacity>)}</View>

    <TouchableOpacity style={s.bigPlay} onPress={() => void startSolo()} disabled={soloBusy}><Text style={s.bigPlayText}>{soloBusy ? 'PRÉPARATION…' : '⚡ JOUER MAINTENANT'}</Text></TouchableOpacity>
    <Text style={s.playHint}>Solo immédiat · 0 Free · partage disponible pendant la partie.</Text>

    <TouchableOpacity style={s.multiPlay} onPress={() => void autoMatch()} disabled={busy || Boolean(busySalonId)}><Text style={s.multiPlayText}>{busy ? 'RECHERCHE DU SALON…' : 'JOUER AVEC D’AUTRES'}</Text></TouchableOpacity>
    <Text style={s.playHint}>Compte KEEP + 3 Free minimum. Si aucun salon n’existe, KEEP crée le tien automatiquement.</Text>

    <View style={s.separator}><View style={s.separatorLine}/><Text style={s.separatorText}>SALONS OUVERTS</Text><View style={s.separatorLine}/></View>
    <View style={s.salonSummary}>
      <Text style={s.salonSummaryText}>{totalOpen} salon{totalOpen > 1 ? 's' : ''}</Text>
      <Text style={s.salonSummaryText}>{totalPlayers} joueur{totalPlayers > 1 ? 's' : ''}</Text>
      <TouchableOpacity onPress={() => void refreshSalons()}><Text style={s.refreshText}>ACTUALISER</Text></TouchableOpacity>
    </View>

    <Text style={s.label}>FILTRER LES SALONS</Text>
    <View style={s.themeWrap}>
      <TouchableOpacity style={[s.themeChip, salonThemeFilter === null && s.themeChipOn]} onPress={() => setSalonThemeFilter(null)}><Text style={s.themeText}>Tous</Text></TouchableOpacity>
      {themes.map((theme) => {
        const summary = themeLobby.find((row) => row.code === theme.code);
        return <TouchableOpacity key={`salon-${theme.code}`} style={[s.themeChip, salonThemeFilter === theme.code && s.themeChipOn]} onPress={() => setSalonThemeFilter(theme.code)}><Text style={s.themeText}>{theme.label}{summary?.openSalons ? ` · ${summary.openSalons}` : ''}</Text></TouchableOpacity>;
      })}
    </View>

    <View style={s.salonList}>
      {salonsLoading && openSalons.length === 0 ? <View style={s.salonLoading}><ActivityIndicator color="#B693FF"/><Text style={s.salonMuted}>Recherche des salons ouverts…</Text></View> : null}
      {salonsError ? <View style={s.salonError}><Text style={s.salonErrorText}>{salonsError}</Text><TouchableOpacity onPress={() => void refreshSalons()}><Text style={s.refreshText}>RÉESSAYER</Text></TouchableOpacity></View> : null}
      {!salonsLoading && !salonsError && openSalons.length === 0 ? <View style={s.emptySalon}><Text style={s.emptySalonTitle}>Aucun salon ouvert.</Text><Text style={s.salonMuted}>Appuie sur “Jouer avec d’autres” : KEEP créera automatiquement le tien.</Text></View> : null}
      {openSalons.map((salon) => {
        const joining = busySalonId === salon.id;
        const full = salon.openSeats <= 0;
        return <View key={salon.id} style={s.salonCard}>
          <View style={s.salonTopRow}>
            <TouchableOpacity style={s.salonHost} onPress={() => onOpenProfile(salon.hostUsername)}>
              {salon.hostAvatarUrl ? <Image source={{ uri: salon.hostAvatarUrl }} style={s.salonAvatar}/> : <View style={[s.salonAvatar,s.avatarFallback]}><Text style={s.avatarLetter}>{salon.hostUsername.slice(0,1).toUpperCase()}</Text></View>}
              <View style={{flex:1}}><Text style={s.salonHostLabel}>CRÉÉ PAR</Text><Text style={s.salonHostName}>@{salon.hostUsername}</Text></View>
            </TouchableOpacity>
            <View style={s.statusPill}><Text style={s.statusText}>{salon.status === 'ACTIVE' ? 'EN COURS' : 'OUVERT'}</Text></View>
          </View>
          <View style={s.salonThemeRow}><Text style={s.salonTheme}>{salon.themeLabel}</Text><Text style={s.jackpot}>+{salon.jackpotFree} FREE</Text></View>
          <Text style={s.salonStats}>{salon.players}/{salon.maxPlayers} joueurs · {salon.openSeats} place{salon.openSeats > 1 ? 's' : ''} libre{salon.openSeats > 1 ? 's' : ''} · file {salon.queue}</Text>
          <TouchableOpacity style={[s.enterButton, joining && s.disabled]} onPress={() => void enterSalon(salon)} disabled={Boolean(busy || busySalonId)}><Text style={s.enterButtonText}>{joining ? 'ENTRÉE…' : full ? 'REJOINDRE LA FILE' : 'ENTRER DANS CE SALON'}</Text></TouchableOpacity>
        </View>;
      })}
    </View>

    <View style={s.lobbyLine}><Text style={s.lobbyText}>{lobby ? `${lobby.activePlayers} en arène · ${lobby.queuedPlayers} en attente` : 'Lobby en direct'}</Text><Text style={s.themeSelected}>{activeTheme}</Text></View>
  </View>;
}

const s = StyleSheet.create({
  card:{marginBottom:10,padding:14,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#5E4385'},
  kicker:{color:'#B693FF',fontSize:12,fontWeight:'900',letterSpacing:.8},title:{color:'#FFF',fontSize:20,fontWeight:'900',marginTop:4},subtitle:{color:'#FFF',fontSize:14,lineHeight:20,marginTop:5},
  headRow:{flexDirection:'row',alignItems:'center',gap:8},soundButton:{width:44,height:44,borderRadius:22,borderWidth:1,borderColor:'#6D5090',alignItems:'center',justifyContent:'center',backgroundColor:'#21182F'},soundText:{fontSize:19},
  label:{color:'#D9C8F7',fontSize:13,fontWeight:'900',marginTop:14,marginBottom:8},themeWrap:{flexDirection:'row',flexWrap:'wrap',gap:7},themeChip:{paddingHorizontal:10,paddingVertical:8,borderRadius:16,borderWidth:1,borderColor:'#493369',backgroundColor:'#21182F'},themeChipOn:{borderColor:'#B693FF',backgroundColor:'#5B3F8C'},themeText:{color:'#FFF',fontSize:12,fontWeight:'800'},
  bigPlay:{height:52,borderRadius:26,backgroundColor:'#714DAB',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:14},bigPlayText:{color:'#FFF',fontSize:16,fontWeight:'900'},
  multiPlay:{height:48,borderRadius:24,backgroundColor:'#21182F',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:12},multiPlayText:{color:'#FFF',fontSize:14,fontWeight:'900'},playHint:{color:'#FFF',fontSize:12,lineHeight:17,textAlign:'center',marginTop:6},
  separator:{flexDirection:'row',alignItems:'center',gap:8,marginVertical:16},separatorLine:{height:1,flex:1,backgroundColor:'#493369'},separatorText:{color:'#B693FF',fontSize:12,fontWeight:'900'},
  salonSummary:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9,paddingHorizontal:11,borderRadius:13,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},salonSummaryText:{color:'#FFF',fontSize:12,fontWeight:'800'},refreshText:{color:'#B693FF',fontSize:12,fontWeight:'900',marginLeft:'auto'},
  salonList:{gap:9,marginTop:10},salonLoading:{minHeight:74,alignItems:'center',justifyContent:'center',gap:7},salonMuted:{color:'#B693FF',fontSize:12,lineHeight:17},salonError:{padding:10,borderRadius:13,borderWidth:1,borderColor:'#8C455A',backgroundColor:'#29131C',flexDirection:'row',alignItems:'center',gap:8},salonErrorText:{flex:1,color:'#FFB6C5',fontSize:12},emptySalon:{padding:12,borderRadius:13,borderWidth:1,borderStyle:'dashed',borderColor:'#493369',alignItems:'center'},emptySalonTitle:{color:'#FFF',fontSize:14,fontWeight:'900',marginBottom:3},
  salonCard:{padding:11,borderRadius:15,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},salonTopRow:{flexDirection:'row',alignItems:'center',gap:8},salonHost:{flex:1,flexDirection:'row',alignItems:'center',gap:8},salonAvatar:{width:38,height:38,borderRadius:19},salonHostLabel:{color:'#B693FF',fontSize:11,fontWeight:'900'},salonHostName:{color:'#FFF',fontSize:14,fontWeight:'900'},statusPill:{paddingHorizontal:8,paddingVertical:5,borderRadius:11,backgroundColor:'#173023',borderWidth:1,borderColor:'#377A58'},statusText:{color:'#FFF',fontSize:11,fontWeight:'900'},salonThemeRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:8},salonTheme:{color:'#D9C8F7',fontSize:14,fontWeight:'900'},jackpot:{color:'#E5F266',fontSize:13,fontWeight:'900'},salonStats:{color:'#FFF',fontSize:12,marginTop:4},enterButton:{minHeight:42,paddingHorizontal:13,borderRadius:21,backgroundColor:'#714DAB',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:9},enterButtonText:{color:'#FFF',fontSize:13,fontWeight:'900'},
  lobbyLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:12},lobbyText:{color:'#FFF',fontSize:12},themeSelected:{color:'#7CF2B9',fontSize:12,fontWeight:'900'},
  seats:{flexDirection:'row',flexWrap:'wrap',marginTop:12,rowGap:10},seat:{width:'20%',alignItems:'center',paddingHorizontal:2},avatarWrap:{width:46,height:46,borderRadius:23,padding:2,borderWidth:1,borderColor:'#5E4385'},avatar:{width:'100%',height:'100%',borderRadius:22},avatarFallback:{backgroundColor:'#2A1D3C',alignItems:'center',justifyContent:'center'},avatarLetter:{color:'#FFF',fontSize:17,fontWeight:'900'},seatName:{color:'#FFF',fontSize:11,fontWeight:'900',marginTop:4,maxWidth:70},
  leaderCard:{marginTop:12,padding:11,borderRadius:14,backgroundColor:'#100B18',borderWidth:1,borderColor:'#6D5090'},leaderTitle:{color:'#B693FF',fontSize:12,fontWeight:'900',marginBottom:7},leaderRow:{flexDirection:'row',alignItems:'center',minHeight:34,gap:8},medal:{fontSize:18,width:26},leaderName:{flex:1,color:'#FFF',fontSize:13,fontWeight:'900'},leaderScore:{color:'#E5F266',fontSize:13,fontWeight:'900'},
  waitBox:{marginTop:12,padding:11,borderRadius:14,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},waitTitle:{color:'#B693FF',fontSize:14,fontWeight:'900'},waitText:{color:'#FFF',fontSize:13,lineHeight:18,marginTop:4},verticalActions:{gap:8,marginTop:10},secondaryButton:{width:'100%',minHeight:46,borderRadius:23,borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',paddingHorizontal:10},secondaryButtonText:{color:'#FFF',fontSize:12,fontWeight:'900',textAlign:'center'},primaryButton:{width:'100%',minHeight:46,borderRadius:23,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center',paddingHorizontal:10},primaryButtonText:{color:'#111',fontSize:13,fontWeight:'900',textAlign:'center'},disabled:{opacity:.45},
  gameBox:{marginTop:12,padding:11,borderRadius:16,backgroundColor:'#0F0A17',borderWidth:1,borderColor:'#5E4385'},roundHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},roundLabel:{color:'#B693FF',fontSize:13,fontWeight:'900'},timer:{color:'#FFF',fontSize:14,fontWeight:'900'},timeTrack:{height:7,borderRadius:4,backgroundColor:'#2A2037',overflow:'hidden',marginTop:8},timeFill:{height:'100%',backgroundColor:'#E5F266',borderRadius:4},deadlineText:{color:'#FFF',fontSize:12,lineHeight:17,marginTop:6,textAlign:'center'},
  hiddenCover:{height:190,marginTop:10,borderRadius:18,borderWidth:1,borderColor:'#6D5090',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',overflow:'hidden'},question:{color:'#FFF',fontSize:72,fontWeight:'900'},cover:{width:'100%',height:'100%'},listenText:{color:'#FFF',fontSize:14,fontWeight:'800',marginTop:8,textAlign:'center'},
  choices:{gap:8,marginTop:11},choice:{width:'100%',minHeight:50,borderRadius:14,borderWidth:1,borderColor:'#493369',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',paddingHorizontal:10,paddingVertical:8},choiceSelected:{borderColor:'#E5F266',backgroundColor:'#3A4020'},choiceCorrect:{borderColor:'#7CF2B9',backgroundColor:'#153828'},choiceLocked:{opacity:.42},choiceText:{color:'#FFF',fontSize:14,fontWeight:'900',textAlign:'center'},
  revealResult:{marginTop:10,padding:12,borderRadius:13,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},correct:{color:'#7CF2B9',fontSize:15,fontWeight:'900',textAlign:'center'},wrong:{color:'#FF829C',fontSize:15,fontWeight:'900',textAlign:'center'},autoText:{color:'#FFF',fontSize:11,fontWeight:'900',textAlign:'center',marginTop:4},roundWinner:{marginTop:8,padding:8,borderRadius:11,backgroundColor:'#251B10',borderWidth:1,borderColor:'#D6AA36'},roundWinnerText:{color:'#FFE191',fontSize:12,fontWeight:'900',textAlign:'center'},
  soloScoreRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12},soloScore:{color:'#E5F266',fontSize:14,fontWeight:'900'},soloProgress:{color:'#B693FF',fontSize:13,fontWeight:'900'},
  championCard:{flexDirection:'row',alignItems:'center',gap:10,marginTop:12,padding:12,borderRadius:15,backgroundColor:'#291E0D',borderWidth:1,borderColor:'#D6AA36'},championCrown:{fontSize:28},championLabel:{color:'#FFE191',fontSize:11,fontWeight:'900'},championName:{color:'#FFF',fontSize:15,fontWeight:'900',marginTop:2},championScore:{color:'#E5F266',fontSize:14,fontWeight:'900'},historyCard:{marginTop:10,padding:11,borderRadius:14,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},historyRow:{flexDirection:'row',alignItems:'center',minHeight:34,gap:8},historyRank:{width:28,color:'#B693FF',fontSize:12,fontWeight:'900'},
  bottomRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:11},link:{color:'#B693FF',fontSize:12,fontWeight:'900'},
});