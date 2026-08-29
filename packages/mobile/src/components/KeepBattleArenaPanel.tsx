import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';
import {
  buildKeepBattleArenaInviteLink,
  joinKeepBattleArena,
  KeepBattleArenaLobby,
  KeepBattleArenaState,
  KeepBattleTheme,
  loadKeepBattleArena,
  loadKeepBattleArenaLobby,
  loadKeepBattleThemes,
  refreshKeepBattleCatalog,
  startKeepBattleArena,
  submitKeepBattleArenaQuizAnswer,
  subscribeKeepBattleArena,
} from '../services/keepBattleService';
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
  { code: 'AFRO', label: 'Afro' },
  { code: 'ELECTRO', label: 'Electro' },
  { code: 'POP', label: 'Pop' },
  { code: 'RNB', label: 'R&B' },
  { code: 'ROCK', label: 'Rock' },
  { code: 'LATINO', label: 'Latino' },
  { code: 'RAI', label: 'Raï' },
];

function formatSeconds(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(2)} s`;
}

export default function KeepBattleArenaPanel({ enabled, onOpenProfile, onRequireAccount }: Props) {
  const [themes, setThemes] = React.useState<KeepBattleTheme[]>(FALLBACK_THEMES);
  const [themeCode, setThemeCode] = React.useState('MIX');
  const [lobby, setLobby] = React.useState<KeepBattleArenaLobby | null>(null);
  const [arena, setArena] = React.useState<KeepBattleArenaState | null>(null);
  const [joinCode, setJoinCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [pendingAnswer, setPendingAnswer] = React.useState<string | null>(null);
  const [soundOn, setSoundOn] = React.useState(true);
  const [now, setNow] = React.useState(Date.now());
  const reveal = React.useRef(new Animated.Value(0)).current;
  const spinner = React.useRef(new Animated.Value(0)).current;
  const audioPhaseRef = React.useRef('');

  const refreshLobby = React.useCallback(async () => {
    try { setLobby(await loadKeepBattleArenaLobby()); } catch { }
  }, []);

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
    if (!arena?.id) return undefined;
    const unsubscribe = subscribeKeepBattleArena(arena.id, () => { void refreshArena(); });
    const timer = setInterval(() => { void refreshArena(); }, 650);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [arena?.id, refreshArena]);

  React.useEffect(() => {
    if (arena?.status !== 'ACTIVE' || !arena.round) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [arena?.status, arena?.round?.position, arena?.matchNo]);

  React.useEffect(() => {
    if (!arena?.round || arena.round.revealed) {
      spinner.stopAnimation();
      return undefined;
    }
    spinner.setValue(0);
    const loop = Animated.loop(Animated.timing(spinner, { toValue: 1, duration: 1300, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [arena?.round?.position, arena?.round?.revealed, arena?.matchNo, spinner]);

  React.useEffect(() => {
    if (!arena?.round?.revealed) { reveal.setValue(0); return; }
    reveal.setValue(0);
    Animated.spring(reveal, { toValue: 1, friction: 7, tension: 52, useNativeDriver: true }).start();
  }, [arena?.round?.revealed, arena?.round?.position, arena?.matchNo, reveal]);

  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl || !soundOn) {
      if (!soundOn) void stopTrackPreview();
      return;
    }
    const phase = `${arena.id}:${arena.matchNo}:${round.position}:${round.revealed ? 'reveal' : 'listen'}`;
    if (audioPhaseRef.current === phase) return;
    audioPhaseRef.current = phase;
    const duration = round.revealed ? 3800 : Math.max(2500, Math.min(arena.roundDurationMs || 12000, 15000));
    void stopTrackPreview()
      .then(() => playTrackPreviewSegment(`battle:${phase}`, round.previewUrl as string, 0, duration))
      .catch(() => {});
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.revealed, arena?.round?.previewUrl, arena?.roundDurationMs, soundOn]);

  React.useEffect(() => () => { void stopTrackPreview(); }, []);

  const requireAccount = () => {
    Alert.alert('Compte KEEP requis', 'Crée ou connecte ton compte KEEP pour entrer dans un Battle.', [
      { text: 'Plus tard', style: 'cancel' },
      { text: 'Mon compte', onPress: onRequireAccount },
    ]);
  };

  const autoMatch = async () => {
    if (!enabled || !supabase) return requireAccount();
    setBusy(true);
    try {
      // Le Salon utilise une réserve musicale centrale : un joueur peut entrer
      // même avec zéro morceau personnel. Tant que la réserve grandit, KEEP la
      // complète automatiquement avant le matchmaking, sans clé payante.
      await refreshKeepBattleCatalog(24).catch(() => null);
      const { data, error } = await supabase.rpc('keep_battle_arena_matchmake', { p_theme_code: themeCode });
      if (error) throw error;
      const id = String((data as any)?.id || '');
      if (!id) throw new Error('Arène introuvable.');
      setArena(await loadKeepBattleArena(id));
      await refreshLobby();
    } catch (e: any) {
      const raw = String(e?.message || '');
      const msg = raw.includes('MINIMUM_THREE_FREE')
        ? 'Il faut au moins 3 Free disponibles pour entrer dans une arène.'
        : raw || 'Impossible de rejoindre une arène pour le moment.';
      Alert.alert('KEEP BATTLE', msg);
    } finally { setBusy(false); }
  };

  const joinByCode = async () => {
    if (!enabled) return requireAccount();
    if (!joinCode.trim()) return Alert.alert('Code Battle', 'Entre le code reçu de ton ami.');
    setBusy(true);
    try {
      const joined = await joinKeepBattleArena(joinCode);
      setArena(await loadKeepBattleArena(joined.id));
      setJoinCode('');
      await refreshLobby();
    } catch (e: any) {
      const raw = String(e?.message || '');
      const msg = raw.includes('MINIMUM_THREE_FREE') ? 'Il faut au moins 3 Free disponibles pour rejoindre ce Battle.' : raw || 'Ce code n’est pas disponible.';
      Alert.alert('Code Battle', msg);
    } finally { setBusy(false); }
  };

  const shareArena = async () => {
    if (!arena) return;
    const link = buildKeepBattleArenaInviteLink(arena.arenaCode);
    await Share.share({ message: `🎧 KEEP BATTLE\nInvite tes amis. Plus l’arène se remplit, plus le jackpot Free monte.\nCode ${arena.arenaCode}\n${link}` }).catch(() => {});
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

  const round = arena?.round ?? null;
  const frozenMs = round?.myAnswer?.responseMs ?? null;
  const remainingMs = round?.closesAt ? Math.max(0, new Date(round.closesAt).getTime() - now) : (arena?.roundDurationMs ?? 12000);
  const displayMs = frozenMs ?? remainingMs;
  const rotation = spinner.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const revealRotation = reveal.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] });
  const revealScale = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const activeTheme = themes.find((item) => item.code === themeCode)?.label || 'Mix surprise';

  if (arena) {
    const activePlayers = arena.seats?.length ?? 0;
    const isQueued = arena.me?.status === 'QUEUED';
    const jackpot = Math.max(0, (activePlayers - 1) * 3);
    return <View style={s.card}>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>KEEP ARENA · {arena.themeCode}</Text>
          <Text style={s.title}>Entre dans l’arène. Garde ta place.</Text>
          <Text style={s.subtitle}>{activePlayers}/{arena.maxPlayers} joueurs · jackpot actuel +{jackpot} Free · file {arena.queue}</Text>
        </View>
        <TouchableOpacity style={s.soundButton} onPress={() => setSoundOn((value) => !value)} accessibilityLabel={soundOn ? 'Couper le son du Battle' : 'Activer le son du Battle'}>
          <Text style={s.soundText}>{soundOn ? '🔊' : '🔇'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.seats}>
        {arena.seats.slice(0, 10).map((seat, index) => <TouchableOpacity key={seat.profileId} style={s.seat} onPress={() => onOpenProfile(seat.username)} accessibilityLabel={`Voir le profil de ${seat.username}`}>
          <View style={[s.avatarWrap, index === 0 && s.leaderAvatar]}>
            {seat.avatarUrl ? <Image source={{ uri: seat.avatarUrl }} style={s.avatar} /> : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarLetter}>{seat.username.slice(0, 1).toUpperCase()}</Text></View>}
          </View>
          <Text style={s.seatName} numberOfLines={1}>@{seat.username}</Text>
          <Text style={s.seatMeta}>{seat.followers} abo.</Text>
          <Text style={s.seatGenre} numberOfLines={1}>{seat.favoriteGenres?.[0] || seat.favoriteArtists?.[0] || 'Music DNA'}</Text>
        </TouchableOpacity>)}
        {Array.from({ length: Math.max(0, 10 - activePlayers) }).map((_, index) => <View key={`empty-${index}`} style={[s.seat, s.emptySeat]}><View style={[s.avatar, s.emptyAvatar]}><Text style={s.emptyPlus}>＋</Text></View><Text style={s.emptyText}>LIBRE</Text></View>)}
      </View>

      {isQueued ? <View style={s.queueBox}><Text style={s.queueTitle}>⏳ Tu es dans la file d’attente</Text><Text style={s.queueText}>Dès qu’une place se libère, KEEP vérifie tes 3 Free et t’installe automatiquement.</Text></View> : null}

      {arena.status === 'WAITING' && !isQueued ? <>
        <View style={s.waitBox}><Text style={s.waitTitle}>ARÈNE #{arena.arenaCode}</Text><Text style={s.waitText}>{activePlayers < 2 ? 'Invite un ami ou attends un autre joueur.' : `Un seul gagnant prendra 3 Free à chacun des ${Math.max(0, activePlayers - 1)} autres joueurs.`}</Text></View>
        <View style={s.rowButtons}>
          <TouchableOpacity style={s.secondaryButton} onPress={shareArena}><Text style={s.secondaryButtonText}>INVITER UN AMI</Text></TouchableOpacity>
          <TouchableOpacity style={[s.primaryButton, activePlayers < 2 && s.disabled]} onPress={startArena} disabled={busy || activePlayers < 2}><Text style={s.primaryButtonText}>{busy ? '...' : 'DÉMARRER'}</Text></TouchableOpacity>
        </View>
      </> : null}

      {arena.status === 'ACTIVE' && round && !isQueued ? <View style={s.gameBox}>
        <View style={s.roundHeader}><Text style={s.roundLabel}>ROUND {arena.currentRound}/{arena.roundCount}</Text><Text style={[s.timer, round.answered && s.timerLocked]}>{round.answered ? `🔒 ${formatSeconds(displayMs)}` : `◷ ${formatSeconds(displayMs)}`}</Text></View>

        {!round.revealed ? <View style={s.hiddenCover}>
          <Animated.View style={[s.spinnerRing, { transform: [{ rotate: rotation }] }]} />
          <Text style={s.question}>?</Text>
          <Text style={s.listenText}>{round.answered ? 'Réponse verrouillée · attends les autres' : 'Écoute. Qui est l’artiste ?'}</Text>
        </View> : <Animated.View style={[s.revealCard, { opacity: reveal, transform: [{ perspective: 700 }, { rotateY: revealRotation }, { scale: revealScale }] }]}>
          {round.artworkUrl ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <View style={[s.cover, s.avatarFallback]}><Text style={s.question}>♫</Text></View>}
          <View style={s.revealText}><Text style={s.artist}>{round.artist || 'Artiste'}</Text><Text style={s.trackTitle}>{round.title || 'Titre'}</Text>
            {arena.roundWinner ? <Text style={s.roundWinner}>⚡ {arena.roundWinner.username} · {formatSeconds(arena.roundWinner.responseMs)}</Text> : <Text style={s.roundWinner}>Aucune bonne réponse sur ce round.</Text>}
          </View>
        </Animated.View>}

        {!round.revealed ? <View style={s.choices}>{(round.choices ?? []).map((choice) => {
          const selected = round.myAnswer?.selectedAnswer === choice || pendingAnswer === choice;
          const locked = Boolean(round.answered || pendingAnswer);
          return <TouchableOpacity key={choice} style={[s.choice, selected && s.choiceSelected, locked && !selected && s.choiceLocked]} onPress={() => void answer(choice)} disabled={locked}>
            <Text style={[s.choiceText, selected && s.choiceTextSelected]} numberOfLines={1}>{choice}</Text>
          </TouchableOpacity>;
        })}</View> : <View style={s.revealResult}>
          <Text style={round.myAnswer?.correct ? s.correct : s.wrong}>{round.myAnswer?.correct ? `✓ BONNE RÉPONSE · +${round.myAnswer?.points ?? 0} pts` : '✕ MAUVAISE RÉPONSE'}</Text>
          <Text style={s.revealHint}>Le morceau repart pendant la révélation. Le classement privilégie les bonnes réponses, puis la vitesse.</Text>
        </View>}
      </View> : null}

      <View style={s.bottomRow}><TouchableOpacity onPress={() => setArena(null)}><Text style={s.link}>QUITTER L’ÉCRAN</Text></TouchableOpacity><TouchableOpacity onPress={shareArena}><Text style={s.link}>PARTAGER LE BATTLE</Text></TouchableOpacity></View>
    </View>;
  }

  return <View style={s.card}>
    <Text style={s.kicker}>KEEP BATTLE</Text>
    <Text style={s.title}>Tu reconnais la musique avant les autres ?</Text>
    <Text style={s.subtitle}>Choisis ton style. Il faut au moins 3 Free. Un seul gagnant prend 3 Free à chaque perdant.</Text>
    <View style={s.rulesStrip}><Text style={s.ruleText}>10 joueurs max</Text><Text style={s.ruleText}>Réponse verrouillée</Text><Text style={s.ruleText}>Bon + rapide = devant</Text></View>

    <Text style={s.label}>CHOISIS TON STYLE MUSICAL</Text>
    <View style={s.themeWrap}>{themes.map((theme) => <TouchableOpacity key={theme.code} style={[s.themeChip, themeCode === theme.code && s.themeChipOn]} onPress={() => setThemeCode(theme.code)}><Text style={[s.themeText, themeCode === theme.code && s.themeTextOn]}>{theme.label}</Text></TouchableOpacity>)}</View>

    <View style={s.lobbyLine}><Text style={s.lobbyText}>{lobby ? `${lobby.activePlayers} joueur${lobby.activePlayers > 1 ? 's' : ''} en arène · ${lobby.queuedPlayers} en attente` : 'Lobby en direct'}</Text><Text style={s.themeSelected}>{activeTheme}</Text></View>
    <TouchableOpacity style={s.bigPlay} onPress={() => void autoMatch()} disabled={busy}><Text style={s.bigPlayText}>{busy ? 'RECHERCHE…' : '⚡ JOUER MAINTENANT'}</Text></TouchableOpacity>
    <Text style={s.inviteSlogan}>Invite tes amis. Plus l’arène se remplit, plus le jackpot Free monte.</Text>

    <View style={s.joinRow}><TextInput style={s.codeInput} value={joinCode} onChangeText={setJoinCode} autoCapitalize="characters" placeholder="CODE D’UN AMI" placeholderTextColor={colors.textMuted} maxLength={12}/><TouchableOpacity style={s.joinButton} onPress={() => void joinByCode()} disabled={busy}><Text style={s.joinButtonText}>REJOINDRE</Text></TouchableOpacity></View>
  </View>;
}

const s = StyleSheet.create({
  card:{marginBottom:10,padding:12,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#5E4385'},
  kicker:{color:'#B693FF',fontSize:9,fontWeight:'900',letterSpacing:1},title:{color:'#FFF',fontSize:18,fontWeight:'900',marginTop:3},subtitle:{color:'#FFF',fontSize:10,lineHeight:15,marginTop:4},
  headRow:{flexDirection:'row',alignItems:'center',gap:8},soundButton:{width:38,height:38,borderRadius:19,borderWidth:1,borderColor:'#6D5090',alignItems:'center',justifyContent:'center',backgroundColor:'#21182F'},soundText:{fontSize:17},
  rulesStrip:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:8},ruleText:{color:'#7CF2B9',fontSize:8,fontWeight:'900',paddingHorizontal:7,paddingVertical:4,borderRadius:12,backgroundColor:'#10251B',borderWidth:1,borderColor:'#2C8A60'},
  label:{color:'#D9C8F7',fontSize:9,fontWeight:'900',marginTop:11,marginBottom:6},themeWrap:{flexDirection:'row',flexWrap:'wrap',gap:5},themeChip:{paddingHorizontal:8,paddingVertical:6,borderRadius:14,borderWidth:1,borderColor:'#493369',backgroundColor:'#21182F'},themeChipOn:{borderColor:'#B693FF',backgroundColor:'#5B3F8C'},themeText:{color:'#FFF',fontSize:8,fontWeight:'800'},themeTextOn:{color:'#FFF'},
  lobbyLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6,marginTop:9},lobbyText:{color:'#FFF',fontSize:9},themeSelected:{color:'#7CF2B9',fontSize:8,fontWeight:'900'},bigPlay:{height:44,borderRadius:22,backgroundColor:'#714DAB',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:9},bigPlayText:{color:'#FFF',fontSize:12,fontWeight:'900'},inviteSlogan:{color:'#FFF',fontSize:9,textAlign:'center',marginTop:6,fontWeight:'800'},
  joinRow:{flexDirection:'row',gap:6,marginTop:9},codeInput:{flex:1,height:38,borderWidth:1,borderColor:'#493369',borderRadius:19,paddingHorizontal:12,color:'#FFF',fontSize:10,fontWeight:'800',backgroundColor:'#100B18'},joinButton:{height:38,paddingHorizontal:12,borderRadius:19,backgroundColor:'#21182F',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center'},joinButtonText:{color:'#FFF',fontSize:9,fontWeight:'900'},
  seats:{flexDirection:'row',flexWrap:'wrap',marginTop:10,rowGap:8},seat:{width:'20%',alignItems:'center',paddingHorizontal:2},avatarWrap:{width:43,height:43,borderRadius:22,padding:2,borderWidth:1,borderColor:'#5E4385'},leaderAvatar:{borderColor:'#F1D86B',borderWidth:2},avatar:{width:'100%',height:'100%',borderRadius:21},avatarFallback:{backgroundColor:'#2A1D3C',alignItems:'center',justifyContent:'center'},avatarLetter:{color:'#FFF',fontSize:16,fontWeight:'900'},seatName:{color:'#FFF',fontSize:7.5,fontWeight:'900',marginTop:3,maxWidth:62},seatMeta:{color:'#B693FF',fontSize:6.5,fontWeight:'800',marginTop:1},seatGenre:{color:'#FFF',fontSize:6.5,marginTop:1,maxWidth:62},emptySeat:{opacity:.45},emptyAvatar:{width:43,height:43,borderRadius:22,borderWidth:1,borderStyle:'dashed',borderColor:'#6D5090',alignItems:'center',justifyContent:'center'},emptyPlus:{color:'#B693FF',fontSize:20},emptyText:{color:'#FFF',fontSize:6.5,fontWeight:'900',marginTop:3},
  queueBox:{marginTop:10,padding:10,borderRadius:14,backgroundColor:'#1D1920',borderWidth:1,borderColor:'#B693FF'},queueTitle:{color:'#FFF',fontSize:11,fontWeight:'900'},queueText:{color:'#FFF',fontSize:9,lineHeight:13,marginTop:3},
  waitBox:{marginTop:10,padding:9,borderRadius:14,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},waitTitle:{color:'#B693FF',fontSize:10,fontWeight:'900'},waitText:{color:'#FFF',fontSize:9,lineHeight:13,marginTop:3},rowButtons:{flexDirection:'row',gap:7,marginTop:8},secondaryButton:{flex:1,height:38,borderRadius:19,borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center'},secondaryButtonText:{color:'#FFF',fontSize:9,fontWeight:'900'},primaryButton:{flex:1,height:38,borderRadius:19,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center'},primaryButtonText:{color:'#111',fontSize:9,fontWeight:'900'},disabled:{opacity:.45},
  gameBox:{marginTop:10,padding:10,borderRadius:16,backgroundColor:'#0F0A17',borderWidth:1,borderColor:'#5E4385'},roundHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},roundLabel:{color:'#B693FF',fontSize:9,fontWeight:'900'},timer:{color:'#FFF',fontSize:11,fontWeight:'900'},timerLocked:{color:'#7CF2B9'},
  hiddenCover:{height:170,marginTop:8,borderRadius:18,borderWidth:1,borderColor:'#6D5090',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',overflow:'hidden'},spinnerRing:{position:'absolute',width:116,height:116,borderRadius:58,borderWidth:3,borderColor:'#B693FF',borderTopColor:'#E5F266'},question:{color:'#FFF',fontSize:68,fontWeight:'900'},listenText:{color:'#FFF',fontSize:10,fontWeight:'800',marginTop:3},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:9},choice:{width:'48.7%',minHeight:42,borderRadius:13,borderWidth:1,borderColor:'#493369',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',paddingHorizontal:7},choiceSelected:{borderColor:'#E5F266',backgroundColor:'#3A4020'},choiceLocked:{opacity:.38},choiceText:{color:'#FFF',fontSize:9,fontWeight:'900',textAlign:'center'},choiceTextSelected:{color:'#FFF'},
  revealCard:{marginTop:8,borderRadius:18,overflow:'hidden',borderWidth:1,borderColor:'#B693FF',backgroundColor:'#21182F'},cover:{width:'100%',height:170},revealText:{padding:9},artist:{color:'#FFF',fontSize:18,fontWeight:'900'},trackTitle:{color:'#FFF',fontSize:10,marginTop:2},roundWinner:{color:'#E5F266',fontSize:10,fontWeight:'900',marginTop:5},revealResult:{marginTop:8,padding:9,borderRadius:13,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},correct:{color:'#7CF2B9',fontSize:11,fontWeight:'900',textAlign:'center'},wrong:{color:'#FF829C',fontSize:11,fontWeight:'900',textAlign:'center'},revealHint:{color:'#FFF',fontSize:8,lineHeight:12,textAlign:'center',marginTop:4},
  bottomRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:9},link:{color:'#B693FF',fontSize:8,fontWeight:'900'},
});