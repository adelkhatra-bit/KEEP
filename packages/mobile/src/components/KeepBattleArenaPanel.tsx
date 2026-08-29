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
import { KeepBattleSoloPack, loadKeepBattleSoloPack } from '../services/keepBattleExperienceService';
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
  if (raw.includes('BATTLE_CATALOG_TOO_SMALL')) return 'Le catalogue musical du Battle est en cours de préparation.';
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
  const [audioPlaying, setAudioPlaying] = React.useState(false);
  const [audioError, setAudioError] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const [soloPack, setSoloPack] = React.useState<KeepBattleSoloPack | null>(null);
  const [soloIndex, setSoloIndex] = React.useState(0);
  const [soloAnswer, setSoloAnswer] = React.useState<string | null>(null);
  const [soloScore, setSoloScore] = React.useState(0);
  const [soloBusy, setSoloBusy] = React.useState(false);

  const resultScale = React.useRef(new Animated.Value(1)).current;
  const resultShake = React.useRef(new Animated.Value(0)).current;
  const cardX = React.useRef(new Animated.Value(0)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const perfectScale = React.useRef(new Animated.Value(.7)).current;

  const animateResult = React.useCallback((correct: boolean) => {
    overlayOpacity.setValue(0);
    resultScale.setValue(1);
    resultShake.setValue(0);
    Animated.timing(overlayOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    if (correct) {
      Animated.sequence([
        Animated.timing(resultScale, { toValue: 1.08, duration: 140, useNativeDriver: true }),
        Animated.spring(resultScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(resultShake, { toValue: -9, duration: 60, useNativeDriver: true }),
        Animated.timing(resultShake, { toValue: 9, duration: 60, useNativeDriver: true }),
        Animated.timing(resultShake, { toValue: -5, duration: 55, useNativeDriver: true }),
        Animated.timing(resultShake, { toValue: 5, duration: 55, useNativeDriver: true }),
        Animated.timing(resultShake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [overlayOpacity, resultScale, resultShake]);

  const animateNextCard = React.useCallback(() => {
    Animated.sequence([
      Animated.timing(cardX, { toValue: -34, duration: 110, useNativeDriver: true }),
      Animated.timing(cardX, { toValue: 30, duration: 1, useNativeDriver: true }),
      Animated.spring(cardX, { toValue: 0, friction: 7, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [cardX]);

  const animatePerfect = React.useCallback(() => {
    perfectScale.setValue(.7);
    Animated.sequence([
      Animated.spring(perfectScale, { toValue: 1.18, friction: 3, tension: 100, useNativeDriver: true }),
      Animated.spring(perfectScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [perfectScale]);

  const playBattleAudio = React.useCallback(async (key: string, previewUrl: string, duration: number) => {
    if (!soundOn || !previewUrl) return;
    setAudioError(false);
    setAudioPlaying(false);
    try {
      await stopTrackPreview();
      await playTrackPreviewSegment(key, previewUrl, 0, duration, setAudioPlaying);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 180));
      try {
        await playTrackPreviewSegment(`${key}:retry`, previewUrl, 0, duration, setAudioPlaying);
      } catch {
        setAudioPlaying(false);
        setAudioError(true);
      }
    }
  }, [soundOn]);

  const refreshLobby = React.useCallback(async () => {
    try { setLobby(await loadKeepBattleArenaLobby()); } catch {}
  }, []);

  const refreshSalons = React.useCallback(async () => {
    setSalonsLoading(true);
    try {
      const [salons, summary] = await Promise.all([loadOpenBattleSalons(salonThemeFilter), loadBattleThemeLobby()]);
      setOpenSalons(salons);
      setThemeLobby(summary);
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
    } catch {}
  }, [arena?.id]);

  React.useEffect(() => {
    let live = true;
    void loadKeepBattleThemes().then((rows) => { if (live && rows.length) setThemes(rows); }).catch(() => {});
    if (enabled) void refreshKeepBattleCatalog(48).catch(() => null);
    void refreshLobby();
    return () => { live = false; };
  }, [enabled, refreshLobby]);

  React.useEffect(() => {
    let live = true;
    const reload = async () => { if (live) await refreshSalons(); };
    void reload();
    const timer = setInterval(() => void reload(), 5000);
    return () => { live = false; clearInterval(timer); };
  }, [refreshSalons]);

  React.useEffect(() => {
    if (!arena?.id) return undefined;
    const unsubscribe = subscribeKeepBattleArena(arena.id, () => void refreshArena());
    const timer = setInterval(() => void refreshArena(), 450);
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
    const round = soloPack?.rounds?.[soloIndex];
    if (!round?.previewUrl || !soundOn) return;
    void playBattleAudio(`battle:solo:${soloPack?.themeCode}:${soloIndex}`, round.previewUrl, 12000);
  }, [soloPack?.themeCode, soloPack?.rounds, soloIndex, soundOn, playBattleAudio]);

  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl || !soundOn) return;
    const phase = round.revealed ? 'reveal' : 'listen';
    const duration = round.revealed ? 1500 : Math.max(2500, Math.min(arena.roundDurationMs || 12000, 15000));
    void playBattleAudio(`battle:${arena.id}:${arena.matchNo}:${round.position}:${phase}`, round.previewUrl, duration);
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.revealed, arena?.round?.previewUrl, arena?.roundDurationMs, soundOn, playBattleAudio]);

  React.useEffect(() => {
    if (!soloPack || !soloAnswer) return undefined;
    const round = soloPack.rounds[soloIndex];
    const correct = soloAnswer === round.correctAnswer;
    const finalRound = soloIndex >= soloPack.rounds.length - 1;
    animateResult(correct);
    if (finalRound) {
      if (correct && soloScore === soloPack.rounds.length) animatePerfect();
      return undefined;
    }
    const timer = setTimeout(() => {
      animateNextCard();
      overlayOpacity.setValue(0);
      setSoloIndex((value) => value + 1);
      setSoloAnswer(null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [soloAnswer, soloIndex, soloPack, soloScore, animateResult, animateNextCard, animatePerfect, overlayOpacity]);

  React.useEffect(() => {
    if (!arena?.round?.revealed || arena.round.myAnswer?.correct == null) return;
    animateResult(Boolean(arena.round.myAnswer.correct));
  }, [arena?.id, arena?.matchNo, arena?.round?.position, arena?.round?.revealed, arena?.round?.myAnswer?.correct, animateResult]);

  React.useEffect(() => () => { void stopTrackPreview(); }, []);

  const requireAccount = () => Alert.alert('Compte KEEP requis', 'Le solo fonctionne sans compte. Connecte-toi uniquement pour jouer avec d’autres personnes.', [
    { text: 'Jouer seul', style: 'cancel' }, { text: 'Mon compte', onPress: onRequireAccount },
  ]);

  const startSolo = async () => {
    if (soloBusy) return;
    setSoloBusy(true);
    try {
      const pack = await loadKeepBattleSoloPack(themeCode, 8);
      setSoloPack(pack);
      setSoloIndex(0);
      setSoloAnswer(null);
      setSoloScore(0);
      setAudioError(false);
      overlayOpacity.setValue(0);
    } catch (e: any) {
      Alert.alert('Jouer seul', battleError(e, 'Impossible de démarrer le jeu solo.'));
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
    await Share.share({ message: `🎧 KEEP BATTLE — Score ${soloScore}/${Math.max(1, completed)} sur ${themes.find((t) => t.code === soloPack?.themeCode)?.label || 'KEEP'}. Viens jouer !\nhttps://adelkhatra-bit.github.io/KEEP/` }).catch(() => {});
  };

  const retrySoloAudio = () => {
    const round = soloPack?.rounds?.[soloIndex];
    if (round?.previewUrl) void playBattleAudio(`battle:solo:retry:${soloIndex}`, round.previewUrl, 12000);
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
      Alert.alert('Salon KEEP Battle', battleError(e, 'Impossible de rejoindre ce salon.'));
    } finally { setBusySalonId(''); }
  };

  const autoMatch = async () => {
    if (!enabled || !supabase) return requireAccount();
    if (busy) return;
    setBusy(true);
    try {
      await refreshKeepBattleCatalog(48).catch(() => null);
      const { data, error } = await supabase.rpc('keep_battle_arena_matchmake', { p_theme_code: themeCode });
      if (error) throw error;
      const id = String((data as any)?.id || '');
      if (!id) throw new Error('Arène introuvable.');
      setArena(await loadKeepBattleArena(id));
      await Promise.all([refreshLobby(), refreshSalons()]);
    } catch (e: any) {
      Alert.alert('Jouer avec d’autres', battleError(e, 'Impossible de rejoindre une arène.'));
    } finally { setBusy(false); }
  };

  const shareArena = async () => {
    if (!arena) return;
    const link = buildKeepBattleArenaInviteLink(arena.arenaCode);
    await Share.share({ message: `🎧 KEEP BATTLE\nRejoins mon salon :\n${link}` }).catch(() => {});
  };

  const startArena = async () => {
    if (!arena || busy) return;
    setBusy(true);
    try { setArena(await startKeepBattleArena(arena.id)); }
    catch (e: any) { Alert.alert('Démarrer le Battle', e?.message || 'Il faut au moins 2 joueurs.'); }
    finally { setBusy(false); }
  };

  const answer = async (choice: string) => {
    if (!arena || arena.status !== 'ACTIVE' || arena.round?.answered || pendingAnswer || arena.round?.revealed) return;
    setPendingAnswer(choice);
    try { setArena(await submitKeepBattleArenaQuizAnswer(arena.id, choice)); }
    catch (e: any) {
      setPendingAnswer(null);
      Alert.alert('Réponse Battle', e?.message || 'Réponse non enregistrée.');
    }
  };

  const activeTheme = themes.find((item) => item.code === themeCode)?.label || 'Mix surprise';

  if (soloPack) {
    const round = soloPack.rounds[soloIndex];
    const finished = Boolean(soloAnswer) && soloIndex >= soloPack.rounds.length - 1;
    const correct = soloAnswer === round.correctAnswer;
    const perfect = finished && soloScore === soloPack.rounds.length;

    return <View style={s.card}>
      <View style={s.headRow}>
        <View style={{flex:1}}><Text style={s.kicker}>KEEP BATTLE · {soloPack.themeCode}</Text><Text style={s.title}>Même sensation que Swype.</Text><Text style={s.subtitle}>Carte unique · 3 réponses · aucun geste obligatoire · suite automatique.</Text></View>
        <TouchableOpacity style={s.soundButton} onPress={() => setSoundOn((v) => !v)}><Text style={s.soundText}>{soundOn ? '🔊' : '🔇'}</Text></TouchableOpacity>
      </View>
      <View style={s.scoreRow}><Text style={s.score}>SCORE {soloScore}/{soloPack.rounds.length}</Text><Text style={s.progress}>CARTE {soloIndex + 1}/{soloPack.rounds.length}</Text></View>

      <Animated.View style={[s.swypeShell,{transform:[{translateX:cardX}]}]}>
        <Animated.View style={[s.musicCard,{transform:[{scale:resultScale},{translateX:resultShake}]}]}>
          <View style={s.imageArea}>
            {round.artworkUrl && soloAnswer ? <Image source={{uri:round.artworkUrl}} style={s.cover}/> : <Text style={s.question}>?</Text>}
            <View style={s.topBadge}><Text style={s.topBadgeText}>{audioPlaying ? '♫ EN COURS' : 'KEEP BATTLE'}</Text></View>
            {soloAnswer ? <Animated.View style={[s.resultOverlay,{opacity:overlayOpacity}]}>
              <Text style={correct ? s.overlayWin : s.overlayLose}>{correct ? 'GAGNÉ' : 'PERDU'}</Text>
              <Text style={s.overlayArtist}>{round.artist}</Text>
              <Text style={s.overlayTrack}>{round.title}</Text>
            </Animated.View> : null}
          </View>
          <Text style={s.listen}>{soloAnswer ? `${round.artist} — ${round.title}` : 'Écoute et choisis l’artiste'}</Text>
          {audioError ? <TouchableOpacity style={s.audioRetry} onPress={retrySoloAudio}><Text style={s.audioRetryText}>🔊 RELANCER LE SON</Text></TouchableOpacity> : null}
          <View style={s.choices}>{round.choices.slice(0,3).map((choice) => {
            const selected = soloAnswer === choice;
            const right = Boolean(soloAnswer) && choice === round.correctAnswer;
            return <TouchableOpacity key={choice} style={[s.choice,selected&&s.choiceSelected,right&&s.choiceCorrect]} disabled={Boolean(soloAnswer)} onPress={() => answerSolo(choice)}><Text style={s.choiceText} numberOfLines={1}>{choice}</Text></TouchableOpacity>;
          })}</View>
        </Animated.View>
      </Animated.View>

      {perfect ? <Animated.View style={[s.perfectCard,{transform:[{scale:perfectScale}]}]}><Text style={s.fireworks}>🎆 ✨ 🎇 ✨ 🎆</Text><Text style={s.perfectTitle}>PARFAIT · 8/8</Text><Text style={s.perfectText}>👑 CHAMPION KEEP</Text><Text style={s.fireworks}>🎇 🎉 🏆 🎉 🎇</Text></Animated.View> : null}
      <Text style={s.autoText}>{finished ? 'PARTIE TERMINÉE' : soloAnswer ? 'CARTE SUIVANTE AUTOMATIQUE…' : 'La musique continue pendant ta réponse.'}</Text>
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
    const jackpot = Math.max(0,(activePlayers-1)*3);
    const round = arena.round ?? null;
    const frozenMs = round?.myAnswer?.responseMs ?? null;
    const remainingMs = round?.closesAt ? Math.max(0,new Date(round.closesAt).getTime()-now) : (arena.roundDurationMs ?? 12000);
    const displayMs = frozenMs ?? remainingMs;
    const progress = Math.max(0,Math.min(1,remainingMs/Math.max(1,arena.roundDurationMs||12000)));
    const topThree = (arena.leaderboard||[]).slice(0,3);

    return <View style={s.card}>
      <View style={s.headRow}><View style={{flex:1}}><Text style={s.kicker}>KEEP ARENA · {arena.themeCode}</Text><Text style={s.title}>Battle multijoueur.</Text><Text style={s.subtitle}>{activePlayers}/{arena.maxPlayers} joueurs · jackpot +{jackpot} Free.</Text></View><TouchableOpacity style={s.soundButton} onPress={()=>setSoundOn(v=>!v)}><Text style={s.soundText}>{soundOn?'🔊':'🔇'}</Text></TouchableOpacity></View>

      {topThree.length ? <View style={s.leaderCard}><Text style={s.leaderTitle}>CLASSEMENT EN DIRECT</Text>{topThree.map((entry,index)=><TouchableOpacity key={entry.profileId} style={s.leaderRow} onPress={()=>onOpenProfile(entry.username)}><Text style={s.medal}>{index===0?'🥇':index===1?'🥈':'🥉'}</Text><Text style={s.leaderName}>@{entry.username}</Text><Text style={s.leaderScore}>{entry.score} pts</Text></TouchableOpacity>)}</View> : null}

      {isQueued ? <View style={s.waitBox}><Text style={s.waitTitle}>File d’attente</Text><Text style={s.waitText}>KEEP t’installe automatiquement dès qu’une place se libère.</Text></View> : null}

      {arena.status==='WAITING'&&!isQueued ? <><View style={s.waitBox}><Text style={s.waitTitle}>SALON PRÊT</Text><Text style={s.waitText}>{activePlayers<2?'Partage le lien : aucun code à saisir.':'Vous pouvez démarrer.'}</Text></View><View style={s.verticalActions}><TouchableOpacity style={s.secondaryButton} onPress={()=>void shareArena()}><Text style={s.secondaryButtonText}>INVITER / PARTAGER</Text></TouchableOpacity><TouchableOpacity style={[s.primaryButton,activePlayers<2&&s.disabled]} onPress={()=>void startArena()} disabled={busy||activePlayers<2}><Text style={s.primaryButtonText}>{busy?'...':'DÉMARRER'}</Text></TouchableOpacity><TouchableOpacity style={s.secondaryButton} onPress={()=>{setArena(null);void refreshSalons();}}><Text style={s.secondaryButtonText}>RETOUR AUX SALONS</Text></TouchableOpacity></View></> : null}

      {arena.status==='ACTIVE'&&round&&!isQueued ? <Animated.View style={[s.musicCard,{transform:[{translateX:cardX}]}]}>
        <View style={s.roundHeader}><Text style={s.roundLabel}>ROUND {arena.currentRound}/{arena.roundCount}</Text><Text style={s.timer}>{round.answered?`🔒 ${formatSeconds(displayMs)}`:`◷ ${formatSeconds(displayMs)}`}</Text></View>
        <View style={s.timeTrack}><View style={[s.timeFill,{width:`${Math.round(progress*100)}%`}]}/></View>
        <View style={s.imageArea}>
          {round.revealed&&round.artworkUrl?<Image source={{uri:round.artworkUrl}} style={s.cover}/>:<Text style={s.question}>?</Text>}
          <View style={s.topBadge}><Text style={s.topBadgeText}>{audioPlaying?'♫ EN COURS':'KEEP BATTLE'}</Text></View>
          {round.revealed ? <Animated.View style={[s.resultOverlay,{opacity:overlayOpacity}]}>
            <Text style={round.myAnswer?.correct?s.overlayWin:s.overlayLose}>{round.myAnswer?.correct?'GAGNÉ':'PERDU'}</Text>
            <Text style={s.overlayArtist}>{round.artist||'Artiste'}</Text>
            {arena.roundWinner ? <Text style={s.winnerOnImage}>🏆 @{arena.roundWinner.username} gagne la manche</Text> : null}
          </Animated.View> : null}
        </View>
        <Text style={s.listen}>{round.revealed?`${round.artist||'Artiste'} — ${round.title||'Titre'}`:round.answered?'Réponse verrouillée · suite automatique':'Écoute et choisis l’artiste'}</Text>
        {!round.revealed ? <View style={s.choices}>{(round.choices??[]).slice(0,3).map((choice)=>{const selected=round.myAnswer?.selectedAnswer===choice||pendingAnswer===choice;const locked=Boolean(round.answered||pendingAnswer);return <TouchableOpacity key={choice} style={[s.choice,selected&&s.choiceSelected,locked&&!selected&&s.choiceLocked]} onPress={()=>void answer(choice)} disabled={locked}><Text style={s.choiceText} numberOfLines={1}>{choice}</Text></TouchableOpacity>;})}</View> : null}
      </Animated.View> : null}

      {arena.lastWinner ? <TouchableOpacity style={s.championCard} onPress={()=>onOpenProfile(arena.lastWinner!.username)}><Text style={s.championCrown}>👑</Text><View style={{flex:1}}><Text style={s.championLabel}>VAINQUEUR DU BATTLE</Text><Text style={s.championName}>@{arena.lastWinner.username}</Text></View><Text style={s.championScore}>{arena.lastWinner.score} pts</Text></TouchableOpacity> : null}
      {winnerHistory.length ? <View style={s.historyCard}><Text style={s.leaderTitle}>PALMARÈS</Text>{winnerHistory.slice(0,5).map((winner,index)=><TouchableOpacity key={`${winner.matchNo}-${winner.profileId}`} style={s.historyRow} onPress={()=>onOpenProfile(winner.username)}><Text style={s.historyRank}>#{index+1}</Text><Text style={s.leaderName}>@{winner.username}</Text><Text style={s.leaderScore}>{winner.score} pts</Text></TouchableOpacity>)}</View> : null}
      <View style={s.verticalActions}><TouchableOpacity style={s.secondaryButton} onPress={()=>void shareArena()}><Text style={s.secondaryButtonText}>PARTAGER</Text></TouchableOpacity><TouchableOpacity style={s.secondaryButton} onPress={()=>{setArena(null);void refreshSalons();}}><Text style={s.secondaryButtonText}>RETOUR AUX SALONS</Text></TouchableOpacity></View>
    </View>;
  }

  const totalOpen=themeLobby.reduce((sum,item)=>sum+item.openSalons,0);
  const totalPlayers=themeLobby.reduce((sum,item)=>sum+item.players,0);
  return <View style={s.card}>
    <Text style={s.kicker}>KEEP BATTLE · SALONS UTILISATEURS</Text><Text style={s.title}>Joue seul ou avec d’autres.</Text><Text style={s.subtitle}>Aucun code à écrire. Tes playlists sont exclues des morceaux proposés.</Text>
    <Text style={s.label}>CHOISIS TON STYLE MUSICAL</Text><View style={s.themeWrap}>{themes.map((theme)=><TouchableOpacity key={theme.code} style={[s.themeChip,themeCode===theme.code&&s.themeChipOn]} onPress={()=>setThemeCode(theme.code)}><Text style={s.themeText}>{theme.label}</Text></TouchableOpacity>)}</View>
    <TouchableOpacity style={s.bigPlay} onPress={()=>void startSolo()} disabled={soloBusy}><Text style={s.bigPlayText}>{soloBusy?'PRÉPARATION…':'⚡ JOUER MAINTENANT'}</Text></TouchableOpacity><Text style={s.playHint}>Solo immédiat · 3 réponses par carte · suite automatique.</Text>
    <TouchableOpacity style={s.multiPlay} onPress={()=>void autoMatch()} disabled={busy||Boolean(busySalonId)}><Text style={s.multiPlayText}>{busy?'RECHERCHE DU SALON…':'JOUER AVEC D’AUTRES'}</Text></TouchableOpacity>
    <View style={s.separator}><View style={s.separatorLine}/><Text style={s.separatorText}>SALONS OUVERTS</Text><View style={s.separatorLine}/></View>
    <View style={s.salonSummary}><Text style={s.salonSummaryText}>{totalOpen} salon{totalOpen>1?'s':''}</Text><Text style={s.salonSummaryText}>{totalPlayers} joueur{totalPlayers>1?'s':''}</Text><TouchableOpacity onPress={()=>void refreshSalons()}><Text style={s.refreshText}>ACTUALISER</Text></TouchableOpacity></View>
    <Text style={s.label}>FILTRER</Text><View style={s.themeWrap}><TouchableOpacity style={[s.themeChip,salonThemeFilter===null&&s.themeChipOn]} onPress={()=>setSalonThemeFilter(null)}><Text style={s.themeText}>Tous</Text></TouchableOpacity>{themes.map((theme)=><TouchableOpacity key={`filter-${theme.code}`} style={[s.themeChip,salonThemeFilter===theme.code&&s.themeChipOn]} onPress={()=>setSalonThemeFilter(theme.code)}><Text style={s.themeText}>{theme.label}</Text></TouchableOpacity>)}</View>
    <View style={s.salonList}>{salonsLoading&&openSalons.length===0?<ActivityIndicator color="#B693FF"/>:null}{salonsError?<Text style={s.errorText}>{salonsError}</Text>:null}{!salonsLoading&&!salonsError&&openSalons.length===0?<Text style={s.emptyText}>Aucun salon ouvert. KEEP créera automatiquement le tien.</Text>:null}{openSalons.map((salon)=><View key={salon.id} style={s.salonCard}><View style={s.salonTop}><Text style={s.salonHost}>@{salon.hostUsername}</Text><Text style={s.salonTheme}>{salon.themeLabel}</Text></View><Text style={s.salonStats}>{salon.players}/{salon.maxPlayers} joueurs · +{salon.jackpotFree} Free</Text><TouchableOpacity style={s.enterButton} onPress={()=>void enterSalon(salon)} disabled={Boolean(busy||busySalonId)}><Text style={s.enterText}>{busySalonId===salon.id?'ENTRÉE…':'ENTRER DANS CE SALON'}</Text></TouchableOpacity></View>)}</View>
    <View style={s.lobbyLine}><Text style={s.lobbyText}>{lobby?`${lobby.activePlayers} en arène · ${lobby.queuedPlayers} en attente`:'Lobby en direct'}</Text><Text style={s.themeSelected}>{activeTheme}</Text></View>
  </View>;
}

const s=StyleSheet.create({
  card:{marginBottom:10,padding:14,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#5E4385'},kicker:{color:'#B693FF',fontSize:12,fontWeight:'900',letterSpacing:.8},title:{color:'#FFF',fontSize:20,fontWeight:'900',marginTop:4},subtitle:{color:'#FFF',fontSize:14,lineHeight:20,marginTop:5},headRow:{flexDirection:'row',alignItems:'center',gap:8},soundButton:{width:44,height:44,borderRadius:22,borderWidth:1,borderColor:'#6D5090',alignItems:'center',justifyContent:'center',backgroundColor:'#21182F'},soundText:{fontSize:19},
  scoreRow:{flexDirection:'row',justifyContent:'space-between',marginTop:12},score:{color:'#E5F266',fontSize:14,fontWeight:'900'},progress:{color:'#B693FF',fontSize:13,fontWeight:'900'},swypeShell:{marginTop:10},musicCard:{borderRadius:26,padding:12,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},imageArea:{height:300,borderRadius:22,overflow:'hidden',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',position:'relative'},cover:{width:'100%',height:'100%'},question:{color:'#FFF',fontSize:92,fontWeight:'900'},topBadge:{position:'absolute',top:14,left:14,paddingHorizontal:10,paddingVertical:6,borderRadius:10,borderWidth:2,borderColor:'#B693FF',backgroundColor:'rgba(9,6,16,.72)'},topBadgeText:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:.8},resultOverlay:{position:'absolute',left:12,right:12,bottom:12,padding:14,borderRadius:16,backgroundColor:'rgba(9,6,16,.90)',borderWidth:1,borderColor:'#6D5090'},overlayWin:{color:'#7CF2B9',fontSize:26,fontWeight:'900'},overlayLose:{color:'#FF829C',fontSize:26,fontWeight:'900'},overlayArtist:{color:'#FFF',fontSize:18,fontWeight:'900',marginTop:3},overlayTrack:{color:'#FFF',fontSize:13,fontWeight:'700',marginTop:2},winnerOnImage:{color:'#FFE191',fontSize:13,fontWeight:'900',marginTop:7},listen:{color:'#FFF',fontSize:15,fontWeight:'900',marginTop:10,textAlign:'center'},
  choices:{gap:8,marginTop:12},choice:{width:'100%',minHeight:54,borderRadius:16,borderWidth:1,borderColor:'#493369',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',paddingHorizontal:12},choiceSelected:{borderColor:'#E5F266',backgroundColor:'#3A4020'},choiceCorrect:{borderColor:'#7CF2B9',backgroundColor:'#153828'},choiceLocked:{opacity:.42},choiceText:{color:'#FFF',fontSize:15,fontWeight:'900',textAlign:'center'},audioRetry:{marginTop:8,minHeight:42,borderRadius:21,borderWidth:1,borderColor:'#FF829C',alignItems:'center',justifyContent:'center'},audioRetryText:{color:'#FFF',fontSize:12,fontWeight:'900'},autoText:{color:'#FFF',fontSize:12,fontWeight:'900',textAlign:'center',marginTop:9},perfectCard:{marginTop:12,padding:16,borderRadius:18,borderWidth:2,borderColor:'#D6AA36',backgroundColor:'#291E0D',alignItems:'center'},fireworks:{fontSize:24},perfectTitle:{color:'#FFE191',fontSize:26,fontWeight:'900',marginTop:5},perfectText:{color:'#FFF',fontSize:15,fontWeight:'900',marginVertical:5},
  verticalActions:{gap:8,marginTop:10},secondaryButton:{width:'100%',minHeight:46,borderRadius:23,borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',paddingHorizontal:10},secondaryButtonText:{color:'#FFF',fontSize:12,fontWeight:'900',textAlign:'center'},primaryButton:{width:'100%',minHeight:46,borderRadius:23,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center'},primaryButtonText:{color:'#111',fontSize:13,fontWeight:'900'},disabled:{opacity:.45},
  roundHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},roundLabel:{color:'#B693FF',fontSize:13,fontWeight:'900'},timer:{color:'#FFF',fontSize:14,fontWeight:'900'},timeTrack:{height:7,borderRadius:4,backgroundColor:'#2A2037',overflow:'hidden',marginTop:8},timeFill:{height:'100%',backgroundColor:'#E5F266'},leaderCard:{marginTop:12,padding:11,borderRadius:14,backgroundColor:'#100B18',borderWidth:1,borderColor:'#6D5090'},leaderTitle:{color:'#B693FF',fontSize:12,fontWeight:'900',marginBottom:7},leaderRow:{flexDirection:'row',alignItems:'center',minHeight:34,gap:8},medal:{fontSize:18,width:26},leaderName:{flex:1,color:'#FFF',fontSize:13,fontWeight:'900'},leaderScore:{color:'#E5F266',fontSize:13,fontWeight:'900'},waitBox:{marginTop:12,padding:11,borderRadius:14,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},waitTitle:{color:'#B693FF',fontSize:14,fontWeight:'900'},waitText:{color:'#FFF',fontSize:13,lineHeight:18,marginTop:4},
  championCard:{flexDirection:'row',alignItems:'center',gap:10,marginTop:12,padding:12,borderRadius:15,backgroundColor:'#291E0D',borderWidth:1,borderColor:'#D6AA36'},championCrown:{fontSize:28},championLabel:{color:'#FFE191',fontSize:11,fontWeight:'900'},championName:{color:'#FFF',fontSize:15,fontWeight:'900',marginTop:2},championScore:{color:'#E5F266',fontSize:14,fontWeight:'900'},historyCard:{marginTop:10,padding:11,borderRadius:14,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},historyRow:{flexDirection:'row',alignItems:'center',minHeight:34,gap:8},historyRank:{width:28,color:'#B693FF',fontSize:12,fontWeight:'900'},
  label:{color:'#D9C8F7',fontSize:13,fontWeight:'900',marginTop:14,marginBottom:8},themeWrap:{flexDirection:'row',flexWrap:'wrap',gap:7},themeChip:{paddingHorizontal:10,paddingVertical:8,borderRadius:16,borderWidth:1,borderColor:'#493369',backgroundColor:'#21182F'},themeChipOn:{borderColor:'#B693FF',backgroundColor:'#5B3F8C'},themeText:{color:'#FFF',fontSize:12,fontWeight:'800'},bigPlay:{height:52,borderRadius:26,backgroundColor:'#714DAB',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:14},bigPlayText:{color:'#FFF',fontSize:16,fontWeight:'900'},multiPlay:{height:48,borderRadius:24,backgroundColor:'#21182F',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:12},multiPlayText:{color:'#FFF',fontSize:14,fontWeight:'900'},playHint:{color:'#FFF',fontSize:12,textAlign:'center',marginTop:6},separator:{flexDirection:'row',alignItems:'center',gap:8,marginVertical:16},separatorLine:{height:1,flex:1,backgroundColor:'#493369'},separatorText:{color:'#B693FF',fontSize:12,fontWeight:'900'},salonSummary:{flexDirection:'row',alignItems:'center',gap:10,padding:10,borderRadius:13,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},salonSummaryText:{color:'#FFF',fontSize:12,fontWeight:'800'},refreshText:{color:'#B693FF',fontSize:12,fontWeight:'900',marginLeft:'auto'},salonList:{gap:9,marginTop:10},salonCard:{padding:11,borderRadius:15,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},salonTop:{flexDirection:'row',justifyContent:'space-between'},salonHost:{color:'#FFF',fontSize:14,fontWeight:'900'},salonTheme:{color:'#D9C8F7',fontSize:13,fontWeight:'900'},salonStats:{color:'#FFF',fontSize:12,marginTop:5},enterButton:{minHeight:42,borderRadius:21,backgroundColor:'#714DAB',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:9},enterText:{color:'#FFF',fontSize:13,fontWeight:'900'},errorText:{color:'#FF829C',fontSize:12},emptyText:{color:'#FFF',fontSize:12,textAlign:'center',paddingVertical:12},lobbyLine:{flexDirection:'row',justifyContent:'space-between',marginTop:12},lobbyText:{color:'#FFF',fontSize:12},themeSelected:{color:'#7CF2B9',fontSize:12,fontWeight:'900'},
});