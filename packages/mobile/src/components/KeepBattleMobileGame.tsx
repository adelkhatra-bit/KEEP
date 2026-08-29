import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';
import {
  buildKeepBattleArenaInviteLink,
  KeepBattleArenaState,
  KeepBattleTheme,
  loadKeepBattleArena,
  loadKeepBattleThemes,
  startKeepBattleArena,
  submitKeepBattleArenaQuizAnswer,
  subscribeKeepBattleArena,
} from '../services/keepBattleService';
import { KeepBattleSoloPack, loadKeepBattleSoloPack } from '../services/keepBattleExperienceService';
import {
  heartbeatSoloBattle,
  KeepBattleIncomingChallenge,
  KeepBattleLivePlayer,
  KeepBattleOutgoingChallenge,
  leaveSoloBattle,
  loadIncomingBattleChallenges,
  loadLiveSoloPlayers,
  loadOutgoingBattleChallenges,
  respondBattleChallenge,
  sendBattleChallenge,
} from '../services/keepBattleLiveService';
import { supabase } from '../services/supabaseClient';

type Props = {
  enabled: boolean;
  onOpenProfile: (username: string) => void;
  onRequireAccount?: () => void;
};

const FALLBACK_THEMES: KeepBattleTheme[] = [
  { code: 'MIX', label: 'Mix' },
  { code: 'RAP_FR', label: 'Rap FR' },
  { code: 'RAP_US', label: 'Rap US' },
  { code: 'FUNK', label: 'Funk' },
  { code: 'DISCO', label: 'Disco' },
  { code: 'AFRO', label: 'Afro' },
  { code: 'ELECTRO', label: 'Electro' },
  { code: 'POP', label: 'Pop' },
  { code: 'RNB', label: 'R&B' },
  { code: 'ROCK', label: 'Rock' },
  { code: 'LATINO', label: 'Latino' },
  { code: 'RAI', label: 'Raï' },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function displayTheme(themes: KeepBattleTheme[], code: string) {
  return themes.find((item) => item.code === code)?.label || code;
}

function initials(username: string) {
  return (username || 'K').replace(/^@/, '').slice(0, 1).toUpperCase();
}

export default function KeepBattleMobileGame({ enabled, onOpenProfile, onRequireAccount }: Props) {
  const [themes, setThemes] = React.useState<KeepBattleTheme[]>(FALLBACK_THEMES);
  const [themeCode, setThemeCode] = React.useState('MIX');
  const [solo, setSolo] = React.useState<KeepBattleSoloPack | null>(null);
  const [soloIndex, setSoloIndex] = React.useState(0);
  const [soloAnswer, setSoloAnswer] = React.useState<string | null>(null);
  const [soloScore, setSoloScore] = React.useState(0);
  const [arena, setArena] = React.useState<KeepBattleArenaState | null>(null);
  const [pendingAnswer, setPendingAnswer] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [soundOn, setSoundOn] = React.useState(true);
  const [audioPlaying, setAudioPlaying] = React.useState(false);
  const [audioError, setAudioError] = React.useState(false);
  const [livePlayers, setLivePlayers] = React.useState<KeepBattleLivePlayer[]>([]);
  const [incoming, setIncoming] = React.useState<KeepBattleIncomingChallenge[]>([]);
  const [outgoing, setOutgoing] = React.useState<KeepBattleOutgoingChallenge | null>(null);
  const [now, setNow] = React.useState(Date.now());

  const cardX = React.useRef(new Animated.Value(0)).current;
  const cardScale = React.useRef(new Animated.Value(1)).current;
  const resultOpacity = React.useRef(new Animated.Value(0)).current;
  const celebrationScale = React.useRef(new Animated.Value(.65)).current;

  React.useEffect(() => {
    let mounted = true;
    void loadKeepBattleThemes().then((rows) => { if (mounted && rows.length) setThemes(rows); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const animateResult = React.useCallback((correct: boolean) => {
    resultOpacity.setValue(0);
    cardScale.setValue(1);
    Animated.parallel([
      Animated.timing(resultOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(cardScale, { toValue: correct ? 1.035 : .985, duration: 110, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
      ]),
    ]).start();
  }, [cardScale, resultOpacity]);

  const animateNext = React.useCallback(() => {
    Animated.sequence([
      Animated.timing(cardX, { toValue: -46, duration: 120, useNativeDriver: true }),
      Animated.timing(cardX, { toValue: 34, duration: 1, useNativeDriver: true }),
      Animated.spring(cardX, { toValue: 0, friction: 7, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [cardX]);

  const animatePerfect = React.useCallback(() => {
    celebrationScale.setValue(.65);
    Animated.sequence([
      Animated.spring(celebrationScale, { toValue: 1.12, friction: 3, tension: 95, useNativeDriver: true }),
      Animated.spring(celebrationScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
    ]).start();
  }, [celebrationScale]);

  const playAudio = React.useCallback(async (key: string, url: string, duration = 12000) => {
    if (!soundOn || !url) return;
    setAudioError(false);
    setAudioPlaying(false);
    try {
      await playTrackPreviewSegment(key, url, 0, duration, setAudioPlaying);
      await sleep(220);
      setAudioPlaying(true);
    } catch {
      await sleep(250);
      try {
        await playTrackPreviewSegment(`${key}:retry`, url, 0, duration, setAudioPlaying);
        await sleep(220);
        setAudioPlaying(true);
      } catch {
        setAudioPlaying(false);
        setAudioError(true);
      }
    }
  }, [soundOn]);

  const refreshSocial = React.useCallback(async () => {
    if (!enabled || !solo) return;
    try {
      const [players, inbox, outbox] = await Promise.all([
        loadLiveSoloPlayers(12),
        loadIncomingBattleChallenges(),
        loadOutgoingBattleChallenges(),
      ]);
      setLivePlayers(players);
      setIncoming(inbox);
      const latest = outbox[0] || null;
      setOutgoing(latest && ['PENDING', 'ACCEPTED'].includes(latest.status) ? latest : null);
      if (latest?.status === 'ACCEPTED' && latest.arenaId) {
        const nextArena = await loadKeepBattleArena(latest.arenaId);
        setSolo(null);
        setSoloAnswer(null);
        setArena(nextArena);
        await leaveSoloBattle().catch(() => {});
      }
    } catch {}
  }, [enabled, solo]);

  React.useEffect(() => {
    if (!enabled || !solo || arena) return undefined;
    let live = true;
    const heartbeat = async () => {
      if (!live) return;
      await heartbeatSoloBattle(solo.themeCode).catch(() => {});
      await refreshSocial();
    };
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
      void leaveSoloBattle().catch(() => {});
    };
  }, [enabled, solo?.themeCode, arena?.id, refreshSocial]);

  React.useEffect(() => {
    const round = solo?.rounds?.[soloIndex];
    if (!round?.previewUrl || !soundOn) return;
    const timer = setTimeout(() => void playAudio(`battle:solo:${round.trackId}:${soloIndex}`, round.previewUrl, 12000), 90);
    return () => clearTimeout(timer);
  }, [solo?.themeCode, soloIndex, soundOn, playAudio]);

  React.useEffect(() => {
    if (!solo || !soloAnswer) return undefined;
    const round = solo.rounds[soloIndex];
    const correct = soloAnswer === round.correctAnswer;
    const last = soloIndex >= solo.rounds.length - 1;
    animateResult(correct);
    if (last) {
      const finalScore = soloScore + (correct ? 1 : 0);
      if (finalScore === solo.rounds.length) animatePerfect();
      return undefined;
    }
    const timer = setTimeout(() => {
      animateNext();
      resultOpacity.setValue(0);
      setSoloIndex((value) => value + 1);
      setSoloAnswer(null);
      setAudioError(false);
    }, 950);
    return () => clearTimeout(timer);
  }, [soloAnswer, soloIndex, solo, soloScore, animateResult, animateNext, animatePerfect, resultOpacity]);

  const refreshArena = React.useCallback(async () => {
    if (!arena?.id) return;
    try {
      const next = await loadKeepBattleArena(arena.id);
      setArena(next);
      if (next.round?.answered) setPendingAnswer(null);
    } catch {}
  }, [arena?.id]);

  React.useEffect(() => {
    if (!arena?.id) return undefined;
    const unsubscribe = subscribeKeepBattleArena(arena.id, () => void refreshArena());
    const timer = setInterval(() => void refreshArena(), 420);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [arena?.id, refreshArena]);

  React.useEffect(() => {
    if (arena?.status !== 'ACTIVE' || !arena.round) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [arena?.status, arena?.round?.position, arena?.matchNo]);

  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl || !soundOn) return;
    const timer = setTimeout(() => void playAudio(`battle:arena:${arena.id}:${arena.matchNo}:${round.position}`, round.previewUrl as string, Math.min(15000, arena.roundDurationMs || 12000)), 80);
    return () => clearTimeout(timer);
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.previewUrl, arena?.roundDurationMs, soundOn, playAudio]);

  React.useEffect(() => {
    if (!arena?.round?.revealed || arena.round.myAnswer?.correct == null) return;
    animateResult(Boolean(arena.round.myAnswer.correct));
  }, [arena?.id, arena?.matchNo, arena?.round?.position, arena?.round?.revealed, arena?.round?.myAnswer?.correct, animateResult]);

  React.useEffect(() => {
    if (!arena || arena.status !== 'WAITING' || !arena.isHost || arena.matchNo <= 1) return undefined;
    const count = arena.seats.filter((seat) => seat.profileId && seat.placement == null).length || arena.seats.length;
    if (count < 2) return undefined;
    const timer = setTimeout(() => {
      void startKeepBattleArena(arena.id).then(setArena).catch(() => {});
    }, 6500);
    return () => clearTimeout(timer);
  }, [arena?.id, arena?.status, arena?.isHost, arena?.matchNo, arena?.seats?.length]);

  React.useEffect(() => () => {
    void stopTrackPreview();
    void leaveSoloBattle().catch(() => {});
  }, []);

  const startSolo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pack = await loadKeepBattleSoloPack(themeCode, 8);
      setArena(null);
      setSolo(pack);
      setSoloIndex(0);
      setSoloAnswer(null);
      setSoloScore(0);
      setOutgoing(null);
      resultOpacity.setValue(0);
    } catch (error: any) {
      Alert.alert('KEEP Battle', String(error?.message || 'Impossible de démarrer.'));
    } finally { setBusy(false); }
  };

  const startOnline = async () => {
    if (!enabled || !supabase) {
      onRequireAccount?.();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('keep_battle_arena_matchmake', { p_theme_code: themeCode });
      if (error) throw error;
      const id = String((data as any)?.id || '');
      if (!id) throw new Error('BATTLE_ARENA_NOT_FOUND');
      setSolo(null);
      await leaveSoloBattle().catch(() => {});
      setArena(await loadKeepBattleArena(id));
    } catch (error: any) {
      Alert.alert('KEEP Battle', String(error?.message || 'Impossible de rejoindre un salon.'));
    } finally { setBusy(false); }
  };

  const answerSolo = (choice: string) => {
    const round = solo?.rounds?.[soloIndex];
    if (!round || soloAnswer) return;
    const correct = choice === round.correctAnswer;
    setSoloAnswer(choice);
    if (correct) setSoloScore((value) => value + 1);
  };

  const answerArena = async (choice: string) => {
    if (!arena || arena.status !== 'ACTIVE' || arena.round?.answered || arena.round?.revealed || pendingAnswer) return;
    setPendingAnswer(choice);
    try { setArena(await submitKeepBattleArenaQuizAnswer(arena.id, choice)); }
    catch { setPendingAnswer(null); }
  };

  const challenge = async (player: KeepBattleLivePlayer) => {
    if (!enabled) return onRequireAccount?.();
    try {
      const sent = await sendBattleChallenge(player.profileId, solo?.themeCode || themeCode);
      setOutgoing({
        id: sent.id,
        targetId: player.profileId,
        username: player.username,
        avatarUrl: player.avatarUrl,
        themeCode: solo?.themeCode || themeCode,
        status: 'PENDING',
        expiresAt: sent.expiresAt || new Date(Date.now() + 45000).toISOString(),
      });
    } catch {
      Alert.alert('Battle', `@${player.username} n’est plus disponible.`);
      await refreshSocial();
    }
  };

  const respondIncoming = async (item: KeepBattleIncomingChallenge, accept: boolean) => {
    try {
      const result = await respondBattleChallenge(item.id, accept);
      setIncoming((rows) => rows.filter((row) => row.id !== item.id));
      if (accept && result.arenaId) {
        setSolo(null);
        setSoloAnswer(null);
        await leaveSoloBattle().catch(() => {});
        setArena(await loadKeepBattleArena(result.arenaId));
      }
    } catch (error: any) {
      Alert.alert('Battle', String(error?.message || 'Invitation expirée.'));
      await refreshSocial();
    }
  };

  const shareArena = async () => {
    if (!arena) return;
    await Share.share({ message: `⚡ KEEP BATTLE — rejoins notre groupe :\n${buildKeepBattleArenaInviteLink(arena.arenaCode)}` }).catch(() => {});
  };

  const retryAudio = () => {
    const soloRound = solo?.rounds?.[soloIndex];
    if (soloRound?.previewUrl) void playAudio(`battle:retry:${soloRound.trackId}:${Date.now()}`, soloRound.previewUrl, 12000);
    const arenaRound = arena?.round;
    if (arenaRound?.previewUrl) void playAudio(`battle:arena:retry:${arena?.id}:${Date.now()}`, arenaRound.previewUrl, 12000);
  };

  const SoundButton = () => <TouchableOpacity style={s.sound} onPress={() => setSoundOn((value) => !value)} accessibilityLabel={soundOn ? 'Couper le son' : 'Activer le son'}><Text style={s.soundText}>{soundOn ? '🔊' : '🔇'}</Text></TouchableOpacity>;

  const LiveStrip = () => {
    if (!enabled || !solo) return null;
    return <View style={s.liveBox}>
      <View style={s.liveHead}><View style={s.liveDot}/><Text style={s.liveTitle}>{livePlayers.length ? `${livePlayers.length} joueur${livePlayers.length > 1 ? 's' : ''} dispo` : 'Tu es visible pour un Battle'}</Text></View>
      {livePlayers.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveScroll}>
        {livePlayers.map((player) => <View key={player.profileId} style={s.livePlayer}>
          <TouchableOpacity onPress={() => onOpenProfile(player.username)} style={s.avatarButton}>
            {player.avatarUrl ? <Image source={{uri:player.avatarUrl}} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarLetter}>{initials(player.username)}</Text></View>}
            <View style={s.onlineBadge}/>
          </TouchableOpacity>
          <Text style={s.liveName} numberOfLines={1}>@{player.username}</Text>
          <TouchableOpacity style={s.challengeButton} onPress={() => void challenge(player)}><Text style={s.challengeText}>BATTLE ?</Text></TouchableOpacity>
        </View>)}
      </ScrollView> : <Text style={s.liveHint}>Continue à jouer : dès qu’un autre joueur solo apparaît, tu peux l’inviter.</Text>}
      {outgoing?.status === 'PENDING' ? <View style={s.outgoing}><ActivityIndicator size="small" color="#E5F266"/><Text style={s.outgoingText}>Invitation envoyée à @{outgoing.username}</Text></View> : null}
    </View>;
  };

  const ChallengeOverlay = () => {
    const item = incoming[0];
    if (!item) return null;
    return <View style={s.challengeOverlay}>
      <View style={s.challengeIdentity}>
        {item.avatarUrl ? <Image source={{uri:item.avatarUrl}} style={s.challengeAvatar}/> : <View style={[s.challengeAvatar,s.avatarFallback]}><Text style={s.avatarLetter}>{initials(item.username)}</Text></View>}
        <View style={{flex:1}}><Text style={s.challengeKicker}>⚡ BATTLE ?</Text><Text style={s.challengeName}>@{item.username}</Text><Text style={s.challengeTheme}>{displayTheme(themes,item.themeCode)}</Text></View>
      </View>
      <View style={s.challengeActions}>
        <TouchableOpacity style={s.decline} onPress={() => void respondIncoming(item,false)}><Text style={s.declineText}>PAS MAINTENANT</Text></TouchableOpacity>
        <TouchableOpacity style={s.accept} onPress={() => void respondIncoming(item,true)}><Text style={s.acceptText}>J’ACCEPTE</Text></TouchableOpacity>
      </View>
    </View>;
  };

  if (solo) {
    const round = solo.rounds[soloIndex];
    const answered = Boolean(soloAnswer);
    const correct = soloAnswer === round.correctAnswer;
    const finished = answered && soloIndex === solo.rounds.length - 1;
    const perfect = finished && soloScore === solo.rounds.length;
    return <View style={s.screen}>
      <View style={s.gameHeader}>
        <TouchableOpacity style={s.backCircle} onPress={() => { setSolo(null); setSoloAnswer(null); void stopTrackPreview(); void leaveSoloBattle().catch(() => {}); }}><Text style={s.backText}>‹</Text></TouchableOpacity>
        <View style={s.headerCenter}><Text style={s.headerKicker}>KEEP BATTLE</Text><Text style={s.headerTitle}>{displayTheme(themes,solo.themeCode)}</Text></View>
        <SoundButton/>
      </View>
      <View style={s.scoreBar}><Text style={s.scoreText}>{soloScore} pts</Text><Text style={s.roundText}>{soloIndex+1}/{solo.rounds.length}</Text></View>
      <Animated.View style={[s.gameCard,{transform:[{translateX:cardX},{scale:cardScale}]}]}>
        <View style={s.artwork}>
          {answered && round.artworkUrl ? <Image source={{uri:round.artworkUrl}} style={s.cover}/> : <View style={s.mystery}><Text style={s.note}>♫</Text><Text style={s.listenNow}>{audioPlaying ? 'ÉCOUTE' : 'KEEP BATTLE'}</Text></View>}
          {answered ? <Animated.View style={[s.resultLayer,{opacity:resultOpacity}]}><Text style={correct?s.resultWin:s.resultLose}>{correct?'BIEN JOUÉ !':'RATÉ !'}</Text><Text style={s.resultArtist}>{round.artist}</Text><Text style={s.resultTrack}>{round.title}</Text></Animated.View> : null}
          {audioError ? <TouchableOpacity style={s.retryFloat} onPress={retryAudio}><Text style={s.retryFloatText}>🔊 RELANCER</Text></TouchableOpacity> : null}
        </View>
        <Text style={s.questionLabel}>{answered ? 'Prochain morceau…' : 'Qui chante ?'}</Text>
        <View style={s.answers}>{round.choices.slice(0,3).map((choice,index) => {
          const selected = soloAnswer === choice;
          const right = answered && choice === round.correctAnswer;
          return <TouchableOpacity key={`${choice}-${index}`} style={[s.answer,selected&&s.answerSelected,right&&s.answerRight]} disabled={answered} onPress={() => answerSolo(choice)}><Text style={s.answerIndex}>{index+1}</Text><Text style={s.answerText} numberOfLines={1}>{choice}</Text></TouchableOpacity>;
        })}</View>
      </Animated.View>
      {perfect ? <Animated.View style={[s.perfect,{transform:[{scale:celebrationScale}]}]}><Text style={s.perfectEmoji}>🎆 👑 🎆</Text><Text style={s.perfectTitle}>8 SUR 8</Text><Text style={s.perfectSub}>PERFECT BATTLE</Text></Animated.View> : null}
      {finished ? <View style={s.finishedActions}><TouchableOpacity style={s.primary} onPress={() => void startSolo()}><Text style={s.primaryText}>REJOUER</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={() => void startOnline()}><Text style={s.secondaryText}>PASSER EN BATTLE</Text></TouchableOpacity></View> : null}
      <LiveStrip/>
      <ChallengeOverlay/>
    </View>;
  }

  if (arena) {
    const round = arena.round;
    const players = arena.seats || [];
    const remainingMs = round?.closesAt ? Math.max(0,new Date(round.closesAt).getTime()-now) : arena.roundDurationMs;
    const seconds = Math.max(0,remainingMs/1000).toFixed(1);
    const winner = arena.lastWinner;
    return <View style={s.screen}>
      <View style={s.gameHeader}>
        <TouchableOpacity style={s.backCircle} onPress={() => { setArena(null); void stopTrackPreview(); }}><Text style={s.backText}>‹</Text></TouchableOpacity>
        <View style={s.headerCenter}><Text style={s.headerKicker}>KEEP BATTLE · {players.length} JOUEURS</Text><Text style={s.headerTitle}>{displayTheme(themes,arena.themeCode)}</Text></View>
        <SoundButton/>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.arenaPlayers}>
        {players.map((seat,index) => <TouchableOpacity key={seat.profileId} style={s.arenaPlayer} onPress={() => onOpenProfile(seat.username)}>
          <View style={[s.rankCircle,index===0&&s.rankCircleFirst]}><Text style={s.rankText}>{index+1}</Text></View>
          {seat.avatarUrl ? <Image source={{uri:seat.avatarUrl}} style={s.arenaAvatar}/> : <View style={[s.arenaAvatar,s.avatarFallback]}><Text style={s.avatarLetter}>{initials(seat.username)}</Text></View>}
          <Text style={s.arenaName} numberOfLines={1}>@{seat.username}</Text><Text style={s.arenaScore}>{seat.score} pts</Text>
        </TouchableOpacity>)}
      </ScrollView>

      {arena.status === 'WAITING' ? <View style={s.waitingCard}>
        {winner ? <View style={s.winnerHero}><Text style={s.winnerEmoji}>🏆</Text><Text style={s.winnerLabel}>VAINQUEUR DU BATTLE</Text><Text style={s.winnerName}>@{winner.username}</Text><Text style={s.winnerScore}>{winner.score} pts</Text></View> : <><Text style={s.waitingEmoji}>⚡</Text><Text style={s.waitingTitle}>{players.length < 2 ? 'INVITE QUELQU’UN' : 'LE GROUPE EST PRÊT'}</Text></>}
        <Text style={s.waitingText}>{arena.matchNo > 1 ? 'Le groupe reste ensemble. De nouveaux joueurs peuvent rejoindre avant le prochain Battle.' : 'Le salon peut grandir : 2, 3, 4 joueurs et plus.'}</Text>
        {arena.matchNo > 1 && arena.isHost && players.length >= 2 ? <Text style={s.autoRestart}>Prochain Battle automatique dans quelques secondes…</Text> : null}
        <TouchableOpacity style={s.primary} onPress={() => void shareArena()}><Text style={s.primaryText}>INVITER UN JOUEUR</Text></TouchableOpacity>
        {players.length >= 2 ? <TouchableOpacity style={s.secondary} onPress={() => void startKeepBattleArena(arena.id).then(setArena).catch((e:any)=>Alert.alert('Battle',String(e?.message||'Impossible de démarrer.')))}><Text style={s.secondaryText}>DÉMARRER MAINTENANT</Text></TouchableOpacity> : null}
      </View> : null}

      {arena.status === 'ACTIVE' && round ? <>
        <View style={s.timerRow}><Text style={s.timerRound}>ROUND {arena.currentRound}/{arena.roundCount}</Text><Text style={s.timerText}>{round.answered?'🔒 ':''}{seconds}s</Text></View>
        <Animated.View style={[s.gameCard,{transform:[{scale:cardScale}]}]}>
          <View style={s.artwork}>
            {round.revealed && round.artworkUrl ? <Image source={{uri:round.artworkUrl}} style={s.cover}/> : <View style={s.mystery}><Text style={s.note}>♫</Text><Text style={s.listenNow}>{audioPlaying?'ÉCOUTE':'KEEP BATTLE'}</Text></View>}
            {round.revealed ? <Animated.View style={[s.resultLayer,{opacity:resultOpacity}]}><Text style={round.myAnswer?.correct?s.resultWin:s.resultLose}>{round.myAnswer?.correct?'GAGNÉ !':'PERDU'}</Text><Text style={s.resultArtist}>{round.artist||'Artiste'}</Text>{arena.roundWinner?<Text style={s.roundWinner}>⚡ @{arena.roundWinner.username} remporte la manche</Text>:null}</Animated.View> : null}
            {audioError ? <TouchableOpacity style={s.retryFloat} onPress={retryAudio}><Text style={s.retryFloatText}>🔊 RELANCER</Text></TouchableOpacity> : null}
          </View>
          <Text style={s.questionLabel}>{round.revealed?'Manche suivante…':round.answered?'Réponse verrouillée':'Qui chante ?'}</Text>
          {!round.revealed ? <View style={s.answers}>{(round.choices||[]).slice(0,3).map((choice,index)=>{const selected=round.myAnswer?.selectedAnswer===choice||pendingAnswer===choice;const locked=Boolean(round.answered||pendingAnswer);return <TouchableOpacity key={`${choice}-${index}`} style={[s.answer,selected&&s.answerSelected,locked&&!selected&&s.answerLocked]} disabled={locked} onPress={()=>void answerArena(choice)}><Text style={s.answerIndex}>{index+1}</Text><Text style={s.answerText} numberOfLines={1}>{choice}</Text></TouchableOpacity>;})}</View>:null}
        </Animated.View>
      </> : null}
    </View>;
  }

  return <View style={s.screen}>
    <View style={s.homeHero}><Text style={s.homeBolt}>⚡</Text><Text style={s.homeTitle}>KEEP BATTLE</Text><Text style={s.homeSub}>Écoute. Choisis. Gagne.</Text></View>
    <Text style={s.sectionLabel}>STYLE</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeRow}>{themes.map((theme)=><TouchableOpacity key={theme.code} style={[s.themeChip,themeCode===theme.code&&s.themeChipOn]} onPress={()=>setThemeCode(theme.code)}><Text style={[s.themeText,themeCode===theme.code&&s.themeTextOn]}>{theme.label}</Text></TouchableOpacity>)}</ScrollView>
    <TouchableOpacity style={s.heroPlay} onPress={() => void startSolo()} disabled={busy}><Text style={s.heroPlayIcon}>▶</Text><View style={{flex:1}}><Text style={s.heroPlayTitle}>{busy?'PRÉPARATION…':'JOUER SOLO'}</Text><Text style={s.heroPlaySub}>8 morceaux · 3 choix · gratuit</Text></View></TouchableOpacity>
    <TouchableOpacity style={s.onlinePlay} onPress={() => void startOnline()} disabled={busy}><View style={s.onlineIcon}><View style={s.liveDot}/><Text style={s.onlinePeople}>♟♟</Text></View><View style={{flex:1}}><Text style={s.onlineTitle}>BATTLE EN LIGNE</Text><Text style={s.onlineSub}>Rejoins un groupe ou crée le tien</Text></View><Text style={s.chevron}>›</Text></TouchableOpacity>
    <View style={s.infoMini}><Text style={s.infoMiniText}>Quand tu joues solo avec ton compte, les autres joueurs solo peuvent te proposer un Battle. Si tu acceptes, vous passez automatiquement dans le même salon.</Text></View>
  </View>;
}

const s = StyleSheet.create({
  screen:{width:'100%',paddingBottom:10},
  homeHero:{alignItems:'center',paddingVertical:18},homeBolt:{fontSize:34},homeTitle:{color:'#FFF',fontSize:31,fontWeight:'900',letterSpacing:-1},homeSub:{color:'#B9ABC9',fontSize:14,fontWeight:'700',marginTop:3},
  sectionLabel:{color:'#8E7CA3',fontSize:11,fontWeight:'900',letterSpacing:1.2,marginBottom:8},themeRow:{gap:7,paddingRight:18},themeChip:{minHeight:38,paddingHorizontal:14,borderRadius:19,backgroundColor:'#17111F',borderWidth:1,borderColor:'#2E243A',alignItems:'center',justifyContent:'center'},themeChipOn:{backgroundColor:'#FFF',borderColor:'#FFF'},themeText:{color:'#C8BBD6',fontSize:12,fontWeight:'800'},themeTextOn:{color:'#120D18'},
  heroPlay:{minHeight:82,borderRadius:24,backgroundColor:'#8B5CF6',marginTop:18,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:15},heroPlayIcon:{color:'#FFF',fontSize:25},heroPlayTitle:{color:'#FFF',fontSize:19,fontWeight:'900'},heroPlaySub:{color:'#EEE8FF',fontSize:12,fontWeight:'700',marginTop:2},
  onlinePlay:{minHeight:76,borderRadius:22,backgroundColor:'#141019',borderWidth:1,borderColor:'#30263B',marginTop:10,paddingHorizontal:15,flexDirection:'row',alignItems:'center',gap:12},onlineIcon:{width:44,height:44,borderRadius:22,backgroundColor:'#21192C',alignItems:'center',justifyContent:'center'},onlinePeople:{color:'#FFF',fontSize:14},onlineTitle:{color:'#FFF',fontSize:15,fontWeight:'900'},onlineSub:{color:'#AFA1BF',fontSize:12,fontWeight:'700',marginTop:2},chevron:{color:'#BCA8D4',fontSize:28},infoMini:{marginTop:14,padding:12,borderRadius:16,backgroundColor:'#100D14'},infoMiniText:{color:'#9E90AE',fontSize:11,lineHeight:16,textAlign:'center',fontWeight:'700'},
  gameHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10},backCircle:{width:42,height:42,borderRadius:21,backgroundColor:'#17111F',borderWidth:1,borderColor:'#30263B',alignItems:'center',justifyContent:'center'},backText:{color:'#FFF',fontSize:31,lineHeight:32,marginTop:-2},headerCenter:{flex:1,alignItems:'center'},headerKicker:{color:'#9D8AAD',fontSize:10,fontWeight:'900',letterSpacing:1},headerTitle:{color:'#FFF',fontSize:17,fontWeight:'900',marginTop:1},sound:{width:42,height:42,borderRadius:21,backgroundColor:'#17111F',borderWidth:1,borderColor:'#30263B',alignItems:'center',justifyContent:'center'},soundText:{fontSize:17},
  scoreBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8,paddingHorizontal:3},scoreText:{color:'#E5F266',fontSize:14,fontWeight:'900'},roundText:{color:'#AFA1BF',fontSize:12,fontWeight:'900'},
  gameCard:{backgroundColor:'#120E17',borderRadius:28,padding:10,borderWidth:1,borderColor:'#2F253A'},artwork:{height:292,borderRadius:22,overflow:'hidden',backgroundColor:'#1D1626',position:'relative'},cover:{width:'100%',height:'100%'},mystery:{flex:1,alignItems:'center',justifyContent:'center'},note:{fontSize:76,color:'#FFF',fontWeight:'900'},listenNow:{color:'#CDBCE0',fontSize:12,fontWeight:'900',letterSpacing:2,marginTop:4},resultLayer:{position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:'rgba(10,7,13,.70)',alignItems:'center',justifyContent:'center',padding:20},resultWin:{color:'#8CFFC4',fontSize:33,fontWeight:'900'},resultLose:{color:'#FF7795',fontSize:33,fontWeight:'900'},resultArtist:{color:'#FFF',fontSize:21,fontWeight:'900',marginTop:7,textAlign:'center'},resultTrack:{color:'#D2C6DD',fontSize:13,fontWeight:'700',marginTop:3,textAlign:'center'},roundWinner:{color:'#FFE191',fontSize:13,fontWeight:'900',marginTop:14,textAlign:'center'},retryFloat:{position:'absolute',right:10,bottom:10,minHeight:34,paddingHorizontal:11,borderRadius:17,backgroundColor:'rgba(10,7,13,.90)',borderWidth:1,borderColor:'#FF7795',alignItems:'center',justifyContent:'center'},retryFloatText:{color:'#FFF',fontSize:10,fontWeight:'900'},questionLabel:{color:'#FFF',fontSize:15,fontWeight:'900',textAlign:'center',marginTop:11},answers:{gap:8,marginTop:10},answer:{minHeight:53,borderRadius:17,backgroundColor:'#1C1525',borderWidth:1,borderColor:'#33283F',paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:10},answerSelected:{borderColor:'#E5F266',backgroundColor:'#30351C'},answerRight:{borderColor:'#72EEAD',backgroundColor:'#123423'},answerLocked:{opacity:.42},answerIndex:{width:26,height:26,borderRadius:13,backgroundColor:'#2A2134',color:'#FFF',fontSize:12,fontWeight:'900',textAlign:'center',lineHeight:26},answerText:{flex:1,color:'#FFF',fontSize:14,fontWeight:'900'},
  liveBox:{marginTop:12,padding:11,borderRadius:20,backgroundColor:'#100D14',borderWidth:1,borderColor:'#26202F'},liveHead:{flexDirection:'row',alignItems:'center',gap:7},liveDot:{width:8,height:8,borderRadius:4,backgroundColor:'#72EEAD'},liveTitle:{color:'#FFF',fontSize:12,fontWeight:'900'},liveScroll:{gap:12,paddingTop:11,paddingRight:8},livePlayer:{width:76,alignItems:'center'},avatarButton:{position:'relative'},avatar:{width:50,height:50,borderRadius:25},avatarFallback:{backgroundColor:'#2A2134',alignItems:'center',justifyContent:'center'},avatarLetter:{color:'#FFF',fontSize:17,fontWeight:'900'},onlineBadge:{position:'absolute',right:0,bottom:1,width:12,height:12,borderRadius:6,backgroundColor:'#72EEAD',borderWidth:2,borderColor:'#100D14'},liveName:{color:'#D8CDE2',fontSize:10,fontWeight:'800',marginTop:5,maxWidth:74},challengeButton:{marginTop:5,minHeight:28,paddingHorizontal:8,borderRadius:14,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},challengeText:{color:'#FFF',fontSize:9,fontWeight:'900'},liveHint:{color:'#8E809D',fontSize:11,lineHeight:16,textAlign:'center',paddingVertical:10},outgoing:{marginTop:10,padding:9,borderRadius:14,backgroundColor:'#1D1725',flexDirection:'row',alignItems:'center',gap:8},outgoingText:{color:'#FFF',fontSize:11,fontWeight:'800'},
  challengeOverlay:{marginTop:10,padding:13,borderRadius:22,backgroundColor:'#241631',borderWidth:1,borderColor:'#8B5CF6'},challengeIdentity:{flexDirection:'row',alignItems:'center',gap:11},challengeAvatar:{width:52,height:52,borderRadius:26},challengeKicker:{color:'#E5F266',fontSize:11,fontWeight:'900'},challengeName:{color:'#FFF',fontSize:17,fontWeight:'900',marginTop:1},challengeTheme:{color:'#BBAACB',fontSize:11,fontWeight:'700',marginTop:2},challengeActions:{flexDirection:'row',gap:8,marginTop:11},decline:{flex:1,minHeight:42,borderRadius:21,borderWidth:1,borderColor:'#493A58',alignItems:'center',justifyContent:'center'},declineText:{color:'#D9CDDF',fontSize:10,fontWeight:'900'},accept:{flex:1,minHeight:42,borderRadius:21,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center'},acceptText:{color:'#15100C',fontSize:11,fontWeight:'900'},
  perfect:{marginTop:10,padding:14,borderRadius:22,backgroundColor:'#2A200C',borderWidth:1,borderColor:'#D6AA36',alignItems:'center'},perfectEmoji:{fontSize:27},perfectTitle:{color:'#FFE191',fontSize:28,fontWeight:'900',marginTop:4},perfectSub:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:1.4,marginTop:2},finishedActions:{gap:8,marginTop:10},primary:{minHeight:50,borderRadius:25,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center',marginTop:10},primaryText:{color:'#17130B',fontSize:13,fontWeight:'900'},secondary:{minHeight:48,borderRadius:24,backgroundColor:'#17111F',borderWidth:1,borderColor:'#3B2E48',alignItems:'center',justifyContent:'center',marginTop:8},secondaryText:{color:'#FFF',fontSize:12,fontWeight:'900'},
  arenaPlayers:{gap:12,paddingBottom:10,paddingRight:14},arenaPlayer:{width:74,alignItems:'center',position:'relative'},rankCircle:{position:'absolute',zIndex:2,left:2,top:0,width:20,height:20,borderRadius:10,backgroundColor:'#31283B',alignItems:'center',justifyContent:'center'},rankCircleFirst:{backgroundColor:'#D6AA36'},rankText:{color:'#FFF',fontSize:9,fontWeight:'900'},arenaAvatar:{width:52,height:52,borderRadius:26},arenaName:{color:'#FFF',fontSize:10,fontWeight:'800',marginTop:5,maxWidth:72},arenaScore:{color:'#E5F266',fontSize:10,fontWeight:'900',marginTop:1},timerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:7},timerRound:{color:'#AD9ABB',fontSize:11,fontWeight:'900'},timerText:{color:'#FFF',fontSize:14,fontWeight:'900'},waitingCard:{padding:18,borderRadius:26,backgroundColor:'#120E17',borderWidth:1,borderColor:'#2F253A',alignItems:'center'},waitingEmoji:{fontSize:36},waitingTitle:{color:'#FFF',fontSize:20,fontWeight:'900',marginTop:4},waitingText:{color:'#AFA1BF',fontSize:12,lineHeight:18,textAlign:'center',marginTop:7},autoRestart:{color:'#E5F266',fontSize:11,fontWeight:'900',textAlign:'center',marginTop:9},winnerHero:{alignItems:'center'},winnerEmoji:{fontSize:42},winnerLabel:{color:'#FFE191',fontSize:11,fontWeight:'900',letterSpacing:1,marginTop:4},winnerName:{color:'#FFF',fontSize:24,fontWeight:'900',marginTop:3},winnerScore:{color:'#E5F266',fontSize:14,fontWeight:'900',marginTop:2},
});
