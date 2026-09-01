import React from 'react';
import { ActivityIndicator, Animated, Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { playTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';
import { buildKeepBattleArenaInviteLink, KeepBattleArenaState, KeepBattleArenaWinner, KeepBattleTheme, loadKeepBattleArena, loadKeepBattleArenaWinnerHistory, loadKeepBattleThemes, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena } from '../services/keepBattleService';
import { KeepBattleSoloPack, KeepBattleSoloRound, loadKeepBattleSoloPack } from '../services/keepBattleExperienceService';
import { heartbeatSoloBattle, KeepBattleIncomingChallenge, KeepBattleLivePlayer, leaveSoloBattle, loadIncomingBattleChallenges, loadLiveSoloPlayers, loadOutgoingBattleChallenges, respondBattleChallenge, sendBattleArenaChallenge, sendBattleChallenge } from '../services/keepBattleLiveService';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { KeepSession, SessionTrackEntry } from '../types';

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

// Adel (01/09/2026) : "un truc plus propre" à la place de la note ♫ fixe
// pendant que le son joue -- barres d'égaliseur animées, chacune sur son
// propre cycle pour ne pas bouger à l'unisson.
const EQUALIZER_BAR_COUNT = 5;
// Adel (01/09/2026) : "t'aurais pu faire un truc un peu mieux en couleur" --
// une couleur par barre plutôt qu'une teinte plate, en reprenant la palette
// déjà utilisée ailleurs dans ce même écran Battle (lime, violet, vert, rose).
const EQUALIZER_COLORS = ['#E5F266', '#8B5CF6', '#69E5A4', '#FF6C8C', '#5CA8FC'];
function EqualizerBars() {
  const values = React.useRef(Array.from({ length: EQUALIZER_BAR_COUNT }, () => new Animated.Value(0.3))).current;

  React.useEffect(() => {
    const loops = values.map((value, i) => Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 320 + i * 60, useNativeDriver: false, delay: i * 90 }),
        Animated.timing(value, { toValue: 0.25, duration: 320 + i * 60, useNativeDriver: false }),
      ]),
    ));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values]);

  return (
    <View style={eqStyles.row}>
      {values.map((value, i) => (
        <Animated.View
          key={i}
          style={[eqStyles.bar, { backgroundColor: EQUALIZER_COLORS[i % EQUALIZER_COLORS.length], height: value.interpolate({ inputRange: [0, 1], outputRange: [10, 60] }) }]}
        />
      ))}
    </View>
  );
}
const eqStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 },
  bar: { width: 8, borderRadius: 4 },
});

// Adel (01/09/2026) : "quand on tombe sur le 8, je veux une animation de fou,
// une explosion pour un champion" -- explosion de confettis en pur Animated
// (aucune dépendance externe) déclenchée uniquement sur un 8/8 parfait.
const CONFETTI_COLORS = ['#E5F266', '#8B5CF6', '#69E5A4', '#FF6C8C', '#5CA8FC', '#FFD166', '#FF8FE0'];
const CONFETTI_COUNT = 22;
function ConfettiBurst({ active }: { active: boolean }) {
  const particles = React.useRef(Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    anim: new Animated.Value(0),
    angle: (i / CONFETTI_COUNT) * Math.PI * 2 + (i % 2 ? 0.22 : -0.14),
    distance: 95 + (i % 5) * 24,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 7 + (i % 4) * 3,
    spin: (i % 2 ? 1 : -1) * (260 + i * 14),
  }))).current;

  React.useEffect(() => {
    if (!active) return;
    particles.forEach((p) => p.anim.setValue(0));
    Animated.stagger(12, particles.map((p) => Animated.timing(p.anim, { toValue: 1, duration: 1150 + (p.distance % 5) * 45, useNativeDriver: true }))).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;
  return (
    <View pointerEvents="none" style={confettiStyles.layer}>
      {particles.map((p, i) => {
        const translateX = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.distance] });
        const translateY = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.distance - 40] });
        const rotate = p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] });
        const scale = p.anim.interpolate({ inputRange: [0, .15, 1], outputRange: [0, 1, .8] });
        const opacity = p.anim.interpolate({ inputRange: [0, .7, 1], outputRange: [1, 1, 0] });
        return <Animated.View key={i} style={[confettiStyles.particle, { backgroundColor: p.color, width: p.size, height: p.size, opacity, transform: [{ translateX }, { translateY }, { rotate }, { scale }] }]} />;
      })}
    </View>
  );
}
const confettiStyles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  particle: { position: 'absolute', borderRadius: 3 },
});

// Adel (01/09/2026) : "selon la note obtenue, mets-lui un logo avec un :-),
// une petite animation ... selon le degré qu'il a gagné" -- un petit smiley
// qui rebondit en boucle, choisi selon le palier de score, à côté du message
// déjà affiché (qui variait déjà par palier, mais sans réaction visuelle).
function FinishFace({ face }: { face: string }) {
  const bounce = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bounce]);
  const translateY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const scale = bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  return <Animated.Text style={[finishFaceStyles.face, { transform: [{ translateY }, { scale }] }]}>{face}</Animated.Text>;
}
const finishFaceStyles = StyleSheet.create({ face: { fontSize: 38, textAlign: 'center', marginTop: 4 } });

type Props = {
  enabled: boolean;
  onOpenProfile: (username: string) => void;
  onRequireAccount?: () => void;
  onExit?: () => void;
  initialArenaId?: string | null;
  // Adel (01/09/2026) : "transférer en session un dossier complet ... tu mets
  // que c'est les coups du Battle, comme ça il pourra les effacer ou les
  // conserver" -- à la fin d'une partie solo, les 8 morceaux joués sont
  // transférés dans Mes Sessions (même écran GARDER/PASSER/SWIPER que pour
  // une écoute classique). Optionnel : sans navigation fournie, le bouton
  // reste caché plutôt que de planter.
  onOpenSession?: (sessionId: string) => void;
};

function buildBattleSession(pack: KeepBattleSoloPack, rounds: KeepBattleSoloRound[]): KeepSession {
  const now = new Date();
  const tracks: SessionTrackEntry[] = rounds.map((round, index) => ({
    id: `battle-${pack.themeCode}-${now.getTime()}-${index}`,
    track: {
      id: round.trackId,
      title: round.title || round.correctAnswer,
      artist: round.artist,
      artworkUrl: round.artworkUrl || undefined,
      previewUrl: round.previewUrl,
      providerIds: {},
    },
    recommendations: [],
    status: 'pending',
    detectedAt: now.toISOString(),
  }));
  return {
    id: `battle-${pack.themeCode}-${now.getTime()}`,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
    title: `Coups du Battle · ${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`,
    tracks,
  };
}

type ArenaPlayedTrack = { title: string; artist: string; artworkUrl?: string | null; previewUrl: string };

// Adel (01/09/2026) : "à la fin de la partie qu'elle soit gagnante ou
// perdante, il faut qu'il ait la possibilité de l'envoyer dans sa session" --
// même destination (Mes Sessions) que le mode solo, mais pour le Battle en
// ligne/groupe : un bouton direct sur l'écran de fin de match, alimenté par
// les morceaux réellement révélés pendant CE salon (accumulés round par
// round, l'état de l'arène n'expose que le round courant).
function buildArenaSession(tracksPlayed: ArenaPlayedTrack[]): KeepSession {
  const now = new Date();
  const tracks: SessionTrackEntry[] = tracksPlayed.map((t, index) => ({
    id: `battle-arena-${now.getTime()}-${index}`,
    track: {
      id: `battle-arena-${now.getTime()}-${index}`,
      title: t.title,
      artist: t.artist,
      artworkUrl: t.artworkUrl || undefined,
      previewUrl: t.previewUrl,
      providerIds: {},
    },
    recommendations: [],
    status: 'pending',
    detectedAt: now.toISOString(),
  }));
  return {
    id: `battle-arena-${now.getTime()}`,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
    title: `Coups du Battle · ${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`,
    tracks,
  };
}

export default function KeepBattleMobileGameV3({ enabled, onOpenProfile, onRequireAccount, onExit, initialArenaId, onOpenSession }: Props) {
  const [themes, setThemes] = React.useState<KeepBattleTheme[]>(FALLBACK_THEMES);
  const [themeCode, setThemeCode] = React.useState('MIX');
  const [solo, setSolo] = React.useState<KeepBattleSoloPack | null>(null);
  const [soloIndex, setSoloIndex] = React.useState(0);
  const [soloAnswer, setSoloAnswer] = React.useState<string | null>(null);
  const [soloScore, setSoloScore] = React.useState(0);
  const [soloFinished, setSoloFinished] = React.useState(false);
  const [soloStartedAt, setSoloStartedAt] = React.useState(0);
  const [pausedSoloRemaining, setPausedSoloRemaining] = React.useState<number | null>(null);
  const [battleSessionId, setBattleSessionId] = React.useState<string | null>(null);
  // Adel (01/09/2026) : "je veux pas que ça se fasse par défaut ... je veux
  // un bouton, souhaitez-vous ... avant qu'un Battle commence" -- le transfert
  // vers Mes Sessions n'est plus automatique, il dépend du choix Oui/Non
  // demandé au lancement de CHAQUE partie solo.
  const [saveSessionEnabled, setSaveSessionEnabled] = React.useState(false);
  // BUG RÉEL (Adel, 01/09/2026 : "si tu appuies et tu tombes sur la bonne
  // réponse à la dernière seconde, ça saute une étape, 8/8 est quasi
  // impossible") : le compte à rebours affiché (`now`) n'avance que toutes
  // les 100ms, donc un appui juste avant l'échéance pouvait courir en
  // parallèle de l'effet d'auto-timeout sans qu'aucun des deux ne "voie"
  // l'autre avant de committer son propre setSoloAnswer -- risque de
  // verdict incohérent tout près du buzzer. Un verrou synchrone (ref, pas un
  // state) par round élimine la question d'ordre : le premier code qui
  // s'exécute gagne, l'autre est un no-op garanti.
  const answeredRoundRef = React.useRef(-1);
  const [arena, setArena] = React.useState<KeepBattleArenaState | null>(null);
  const [livePlayers, setLivePlayers] = React.useState<KeepBattleLivePlayer[]>([]);
  const [incoming, setIncoming] = React.useState<KeepBattleIncomingChallenge[]>([]);
  const [browseOnline, setBrowseOnline] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [audioReady, setAudioReady] = React.useState(false);
  const [handledOutgoingId, setHandledOutgoingId] = React.useState('');
  const [respondingChallengeId, setRespondingChallengeId] = React.useState<string | null>(null);
  const [arenaInviteOpen, setArenaInviteOpen] = React.useState(false);
  const [arenaInviteBusyId, setArenaInviteBusyId] = React.useState<string | null>(null);
  const [arenaInvitedIds, setArenaInvitedIds] = React.useState<string[]>([]);
  const [winnerHistory, setWinnerHistory] = React.useState<KeepBattleArenaWinner[]>([]);
  const arenaPlayedTracksRef = React.useRef<Map<string, ArenaPlayedTrack>>(new Map());
  const [arenaSessionId, setArenaSessionId] = React.useState<string | null>(null);
  const pulse = React.useRef(new Animated.Value(1)).current;
  const versusOpacity = React.useRef(new Animated.Value(0)).current;
  const versusScale = React.useRef(new Animated.Value(.72)).current;
  const celebrationOpacity = React.useRef(new Animated.Value(0)).current;
  const celebrationScale = React.useRef(new Animated.Value(.72)).current;

  const celebrate = React.useCallback(() => {
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

  React.useEffect(() => {
    if (!enabled || !initialArenaId) return;
    let active = true;
    void (async () => {
      try {
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        const loaded = await loadKeepBattleArena(initialArenaId);
        if (!active) return;
        setSolo(null); setBrowseOnline(false); setAudioReady(false); setArena(loaded);
        animateVersus();
      } catch {
        if (active) Alert.alert('Battle', 'Impossible d’ouvrir ce salon. L’invitation a peut-être expiré.');
      }
    })();
    return () => { active = false; };
  }, [enabled, initialArenaId]);

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
    await Share.share({ message: `Viens me défier sur Loki Battle ⚡\n10 secondes · 3 choix · gagne des Free\n${KEEP_BATTLE_SHARE}` });
  }, []);
  const shareArenaInvite = React.useCallback(async (state: KeepBattleArenaState) => {
    const link = buildKeepBattleArenaInviteLink(state.arenaCode);
    await Share.share({ message: `Rejoins notre Loki Battle ⚡\n${state.seats.length} joueur${state.seats.length > 1 ? 's' : ''} déjà dans le groupe\n${link}` });
  }, []);

  const refreshSocial = React.useCallback(async () => {
    if (!enabled || arena) return;
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
            ? `@${feedback.username} a refusé le Battle. Invite un autre joueur ou partage Loki à un ami.`
            : `@${feedback.username} n’a pas répondu à temps. Invite un autre joueur ou partage Loki à un ami.`,
          [{ text: 'Continuer', style: 'cancel' }, { text: 'Inviter un ami', onPress: () => { void shareInvite(); } }],
        );
      }
    } catch {}
  }, [enabled, solo, browseOnline, handledOutgoingId, animateVersus, shareInvite]);

  React.useEffect(() => {
    if (!enabled || arena) return undefined;
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
    if (!round || incoming[0] || pausedSoloRemaining !== null) return undefined;
    let alive = true;
    answeredRoundRef.current = -1;
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
  }, [solo?.themeCode, soloIndex, playVerified, incoming[0]?.id, pausedSoloRemaining]);

  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;
  const displayedSoloRemaining = pausedSoloRemaining ?? soloRemaining;
  const activeIncomingId = incoming[0]?.id || '';

  React.useEffect(() => {
    if (!solo) return;
    if (activeIncomingId && pausedSoloRemaining === null && !soloAnswer) {
      setPausedSoloRemaining(soloStartedAt ? Math.max(0, ROUND_MS - (Date.now() - soloStartedAt)) : ROUND_MS);
      setAudioReady(false);
      void stopTrackPreview();
      return;
    }
    if (!activeIncomingId && pausedSoloRemaining !== null && !soloAnswer) {
      const round = solo.rounds[soloIndex];
      const savedRemaining = pausedSoloRemaining;
      setPausedSoloRemaining(null);
      setSoloStartedAt(0);
      setAudioReady(false);
      let alive = true;
      void (async () => {
        while (alive) {
          const ok = await playVerified(`solo-resume:${round.trackId}:${soloIndex}`, round.previewUrl, savedRemaining + 800);
          if (!alive) return;
          if (ok) {
            setAudioReady(true);
            setSoloStartedAt(Date.now() - (ROUND_MS - savedRemaining));
            return;
          }
          await wait(500);
        }
      })();
      return () => { alive = false; };
    }
  }, [solo, soloIndex, soloAnswer, activeIncomingId, pausedSoloRemaining, audioReady, soloStartedAt, playVerified]);

  React.useEffect(() => {
    if (!solo || activeIncomingId || !audioReady || soloAnswer || displayedSoloRemaining > 0) return;
    if (answeredRoundRef.current === soloIndex) return; // un appui a déjà tranché ce round
    answeredRoundRef.current = soloIndex;
    setSoloAnswer('__TIMEOUT__'); void stopTrackPreview(); animateResult();
  }, [solo, activeIncomingId, audioReady, soloAnswer, displayedSoloRemaining, soloIndex, animateResult]);
  React.useEffect(() => {
    if (!solo || !soloAnswer) return undefined;
    if (soloIndex >= solo.rounds.length - 1) {
      const id = setTimeout(() => {
        if (saveSessionEnabled) {
          const session = buildBattleSession(solo, solo.rounds);
          useSessionHistoryStore.getState().addSession(session);
          setBattleSessionId(session.id);
        }
        setSoloFinished(true); celebrate();
      }, 520);
      return () => clearTimeout(id);
    }
    // Adel (01/09/2026) : "on a même pas eu le temps de voir la jaquette" --
    // 360ms ne laissait pas le temps de voir la pochette + le résultat
    // (GAGNÉ/PERDU) qui s'affichent au moment même de la réponse. 1800ms
    // reprend la même pause déjà utilisée ailleurs dans ce fichier pour un
    // temps de lecture du résultat.
    const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 1800);
    return () => clearTimeout(id);
  }, [solo, soloAnswer, soloIndex, celebrate, saveSessionEnabled]);

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
    const previewUrl = round.previewUrl;
    let alive = true;
    setAudioReady(false);
    const run = async () => {
      const startsAt = round.startedAt ? new Date(round.startedAt).getTime() : Date.now();
      const closesAt = round.closesAt ? new Date(round.closesAt).getTime() : startsAt + ROUND_MS;
      const duration = Math.max(1600, closesAt - startsAt + 500);
      try {
        await scheduleTrackPreviewSegment(`arena:${arena.id}:${arena.matchNo}:${round.position}`, previewUrl, 0, duration, startsAt, (playing) => {
          if (alive && playing) setAudioReady(true);
        });
      } catch {
        if (!alive) return;
        const ok = await playVerified(`arena-fallback:${arena.id}:${arena.matchNo}:${round.position}`, previewUrl, Math.max(1600, closesAt - Date.now() + 500));
        if (alive && ok) setAudioReady(true);
      }
    };
    void run();
    return () => { alive = false; void stopTrackPreview(); };
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.previewUrl, arena?.round?.startedAt, arena?.round?.closesAt, playVerified]);
  React.useEffect(() => {
    if (!arena?.round?.revealed) return;
    void stopTrackPreview(); animateResult();
    const round = arena.round;
    if (round?.previewUrl) {
      arenaPlayedTracksRef.current.set(`${arena.matchNo}-${round.position}`, {
        title: round.title || round.artist || 'Morceau Battle',
        artist: round.artist || '',
        artworkUrl: round.artworkUrl,
        previewUrl: round.previewUrl,
      });
    }
  }, [arena?.round?.revealed, arena?.round?.position, arena?.matchNo, animateResult]);
  React.useEffect(() => {
    arenaPlayedTracksRef.current = new Map();
    setArenaSessionId(null);
  }, [arena?.id]);
  React.useEffect(() => {
    if (arena?.status === 'WAITING' && arena.lastResult) celebrate();
  }, [arena?.status, arena?.lastResult?.matchNo, celebrate]);
  React.useEffect(() => {
    if (!arena?.id || !arena.lastResult) return;
    void loadKeepBattleArenaWinnerHistory(arena.id, 20).then(setWinnerHistory).catch(() => setWinnerHistory([]));
  }, [arena?.id, arena?.lastResult?.matchNo]);

  React.useEffect(() => {
    if (!arena || arena.status !== 'WAITING' || !arena.isHost || arena.lastResult || arena.seats.length < 2) return undefined;
    const id = setTimeout(() => { void startKeepBattleArena(arena.id).then((a) => { setArena(a); animateVersus(); }).catch(() => {}); }, 1800);
    return () => clearTimeout(id);
  }, [arena?.id, arena?.status, arena?.isHost, arena?.matchNo, arena?.seats.length, animateVersus]);

  const runStartSolo = async (saveSession: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const pack = await loadKeepBattleSoloPack(themeCode, 8);
      answeredRoundRef.current = -1;
      setSaveSessionEnabled(saveSession);
      setArena(null); setBrowseOnline(false); setSolo(pack); setSoloIndex(0); setSoloAnswer(null); setSoloScore(0); setSoloFinished(false); setSoloStartedAt(0); setAudioReady(false); setHandledOutgoingId(''); setBattleSessionId(null);
    } catch (e: any) { Alert.alert('Loki Battle', String(e?.message || 'Impossible de démarrer.')); }
    finally { setBusy(false); }
  };

  // Adel (01/09/2026) : "souhaitez-vous ... enregistrer dans la session le
  // Battle musical, oui ou non" demandé avant CHAQUE partie -- plus de
  // sauvegarde automatique par défaut.
  const startSolo = () => {
    if (busy) return;
    Alert.alert(
      'Sauvegarder ce Battle ?',
      'Veux-tu retrouver les morceaux de cette partie dans Mes Sessions à la fin (les garder, les réécouter ou les effacer) ?',
      [
        { text: 'Non merci', style: 'cancel', onPress: () => { void runStartSolo(false); } },
        { text: 'Oui, enregistrer', onPress: () => { void runStartSolo(true); } },
      ],
    );
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
      await sendBattleChallenge(player.profileId, themeCode);
      setHandledOutgoingId('');
    } catch (e: any) {
      const message = String(e?.message || e || '');
      if (message.includes('BATTLE_CHALLENGER_NO_CREDIT')) Alert.alert('Battle', 'Il te faut au moins 3 Free pour lancer un Battle.');
      else if (message.includes('BATTLE_TARGET_NO_CREDIT')) Alert.alert('Battle', `@${player.username} n’a pas assez de Free pour jouer maintenant.`);
      else Alert.alert('Battle', `@${player.username} n’est plus disponible.`);
      void refreshSocial();
    }
  };

  const loadArenaAfterAccept = async (arenaId: string) => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return await loadKeepBattleArena(arenaId); }
      catch (error) { lastError = error; await wait(180 + attempt * 140); }
    }
    throw lastError || new Error('BATTLE_ARENA_LOAD_FAILED');
  };

  const respond = async (item: KeepBattleIncomingChallenge, accept: boolean) => {
    if (respondingChallengeId) return;
    setRespondingChallengeId(item.id);
    if (accept) {
      setAudioReady(false);
      void stopTrackPreview();
    } else {
      setIncoming((rows) => rows.filter((x) => x.id !== item.id));
    }
    try {
      const response = await respondBattleChallenge(item.id, accept);
      if (accept) {
        if (!response.arenaId) throw new Error('BATTLE_ACCEPTED_WITHOUT_ARENA');
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        setSolo(null); setBrowseOnline(false); setAudioReady(false);
        const loadedArena = response.arenaState || await loadArenaAfterAccept(response.arenaId);
        setIncoming((rows) => rows.filter((x) => x.id !== item.id));
        setArena(loadedArena);
        animateVersus();
      }
    } catch (e: any) {
      await refreshSocial();
      const message = String(e?.message || e || '');
      if (message.includes('BATTLE_CHALLENGER_NO_CREDIT')) Alert.alert('Battle', `@${item.username} n’a plus les 3 Free nécessaires. Le Battle ne peut pas démarrer.`);
      else if (message.includes('BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED')) Alert.alert('Battle', 'Il te faut au moins 3 Free pour accepter ce Battle.');
      else Alert.alert('Battle', 'Impossible de traiter cette invitation. Réessaie immédiatement.');
    } finally {
      setRespondingChallengeId(null);
    }
  };

  const openArenaInviteList = async () => {
    if (!arena || arena.status !== 'WAITING' || arena.openSeats <= 0) return;
    setArenaInviteOpen(true);
    setBusy(true);
    try {
      const rows = await loadLiveSoloPlayers(30);
      const memberIds = new Set(arena.seats.map((seat) => seat.profileId));
      setLivePlayers(rows.filter((player) => !memberIds.has(player.profileId)));
    } catch {
      setLivePlayers([]);
    } finally {
      setBusy(false);
    }
  };

  const invitePlayerToArena = async (player: KeepBattleLivePlayer) => {
    if (!arena || arena.status !== 'WAITING' || arena.openSeats <= 0 || arenaInviteBusyId) return;
    setArenaInviteBusyId(player.profileId);
    try {
      await sendBattleArenaChallenge(arena.id, player.profileId);
      setArenaInvitedIds((rows) => rows.includes(player.profileId) ? rows : [...rows, player.profileId]);
    } catch (e: any) {
      const message = String(e?.message || e || '');
      if (message.includes('BATTLE_ARENA_FULL')) Alert.alert('Battle', 'Le groupe est déjà complet : 10 joueurs.');
      else if (message.includes('BATTLE_TARGET_NO_CREDIT')) Alert.alert('Battle', `@${player.username} n’a pas les 3 Free nécessaires.`);
      else if (message.includes('BATTLE_ARENA_NOT_OPEN_FOR_INVITES')) Alert.alert('Battle', 'La prochaine partie a déjà démarré.');
      else Alert.alert('Battle', `@${player.username} n’est plus disponible.`);
      const rows = await loadLiveSoloPlayers(30).catch(() => []);
      const memberIds = new Set(arena.seats.map((seat) => seat.profileId));
      setLivePlayers(rows.filter((candidate) => !memberIds.has(candidate.profileId)));
    } finally {
      setArenaInviteBusyId(null);
    }
  };

  const answerSolo = (choice: string) => {
    const round = solo?.rounds[soloIndex];
    if (!round || !audioReady || !soloStartedAt || soloAnswer) return;
    // Temps réel exact au moment de l'appui, pas le `now` d'état qui ne se
    // rafraîchit que toutes les 100ms -- une réponse tapée en vrai avant
    // l'échéance ne doit jamais être refusée à cause de ce retard d'affichage.
    if (Date.now() - soloStartedAt >= ROUND_MS) return;
    if (answeredRoundRef.current === soloIndex) return; // déjà tranché par le timeout
    answeredRoundRef.current = soloIndex;
    void stopTrackPreview(); setSoloAnswer(choice);
    if (choice === round.correctAnswer) setSoloScore((v) => v + 1);
    animateResult();
  };

  // Adel (01/09/2026) : "même si l'utilisateur a mis non pour l'enregistrement
  // du Battle, mets-lui quand même le bouton ... à la fin. Et quand il
  // souhaite oui, tu ouvres un popup et tu le rediriges automatiquement sur
  // la session." Le pré-choix (avant la partie) ne fait plus QUE décider si
  // c'est déjà sauvegardé en arrivant sur cet écran -- le bouton de fin, lui,
  // propose TOUJOURS de sauvegarder si ce n'est pas encore fait, et un "Oui"
  // ici ouvre directement Mes Sessions au lieu de laisser appuyer une 2e fois.
  const offerSoloSession = () => {
    if (!solo) return;
    Alert.alert(
      'Enregistrer ce Battle ?',
      'Les 8 morceaux de cette partie peuvent rejoindre Mes Sessions pour les réécouter et décider plus tard de les garder ou de les effacer.',
      [
        { text: 'Non merci', style: 'cancel' },
        { text: 'Oui, enregistrer', onPress: () => {
          const session = buildBattleSession(solo, solo.rounds);
          useSessionHistoryStore.getState().addSession(session);
          setBattleSessionId(session.id);
          onOpenSession?.(session.id);
        } },
      ],
    );
  };

  const closeBattleArena = React.useCallback(() => {
    void stopTrackPreview();
    setAudioReady(false);
    setPending(null);
    setArena(null);
    setBrowseOnline(false);
    setSolo(null);
    if (onExit) onExit();
  }, [onExit]);

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
    const pct = audioReady && !incoming[0] ? (displayedSoloRemaining / ROUND_MS) * 100 : 100;
    if (soloFinished) {
      const perfect = soloScore === solo.rounds.length;
      const finishFace = perfect ? '🤩' : soloScore >= 6 ? '😄' : soloScore >= 4 ? '🙂' : '😅';
      return <View style={s.root}>
        <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setSoloFinished(false); setSolo(null); void leaveSoloBattle().catch(() => {}); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE</Text><Text style={s.title}>PARTIE TERMINÉE</Text></View><Text style={s.round}>8/8</Text></View>
        <Animated.View style={[s.finishHero, { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] }]}>
          <ConfettiBurst active={perfect} />
          <Text style={s.finishSpark}>✦ ⚡ ✦</Text>
          <Text style={[s.finishTrophy, perfect && s.finishTrophyBig]}>{perfect ? '👑' : soloScore >= 6 ? '🏆' : '⚡'}</Text>
          <Text style={s.finishTitle}>{perfect ? 'PARFAIT · 8/8' : `${soloScore}/8`}</Text>
          <Text style={s.finishSub}>{perfect ? 'Aucune erreur. Loki BATTLE MASTER.' : soloScore >= 6 ? 'Très gros score.' : soloScore >= 4 ? 'Bien joué. Tu peux faire mieux.' : 'Repars immédiatement pour prendre ta revanche.'}</Text>
          <FinishFace face={finishFace} />
          <View style={s.finishScore}><Text style={s.finishScoreBig}>{soloScore}</Text><Text style={s.finishScoreSlash}> / 8</Text></View>
        </Animated.View>
        <Text style={s.finishQuestion}>Que souhaites-tu faire ?</Text>
        <TouchableOpacity style={s.finishPrimary} onPress={() => { setSoloFinished(false); setSolo(null); void startSolo(); }}><Text style={s.finishPrimaryText}>REFAIRE UNE PARTIE</Text></TouchableOpacity>
        {enabled ? <TouchableOpacity style={s.finishSecondary} onPress={() => { setSoloFinished(false); void openOnline(); }}><Text style={s.finishSecondaryText}>DÉFIER UN JOUEUR</Text></TouchableOpacity> : null}
        {onOpenSession ? (
          battleSessionId ? (
            <TouchableOpacity style={s.finishSecondary} onPress={() => onOpenSession(battleSessionId)}>
              <Text style={s.finishSecondaryText}>🎧 VOIR CES MORCEAUX DANS MA SESSION</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.finishSecondary} onPress={offerSoloSession}>
              <Text style={s.finishSecondaryText}>🎧 ENREGISTRER CE BATTLE DANS MA SESSION</Text>
            </TouchableOpacity>
          )
        ) : null}
        <TouchableOpacity style={s.finishSecondary} onPress={() => { void shareInvite(); }}><Text style={s.finishSecondaryText}>INVITER UN AMI</Text></TouchableOpacity>
        {battleSessionId ? <Text style={s.finishSessionHint}>Les morceaux de cette partie t’attendent dans Mes Sessions -- garde-les ou efface-les, comme tu veux.</Text> : null}
      </View>;
    }
    return <View style={s.root}>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setSolo(null); void stopTrackPreview(); void leaveSoloBattle().catch(() => {}); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE</Text><Text style={s.title}>{themeLabel(solo.themeCode)}</Text></View><Text style={s.round}>{soloIndex + 1}/8</Text></View>
      <View style={s.clockRow}><Text style={[s.clock, audioReady && soloRemaining < 2200 && s.clockHot]}>{incoming[0] ? 'PAUSE' : audioReady ? `${(displayedSoloRemaining / 1000).toFixed(1)}s` : 'PRÊT'}</Text><Text style={s.clockHint}>{incoming[0] ? 'INVITATION BATTLE' : audioReady ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}</Text></View>
      <View style={s.timeTrack}><View style={[s.timeFill, { width: `${pct}%` }]} /></View>
      <Animated.View style={[s.card, { transform: [{ scale: pulse }] }]}>
        <View style={s.visual}>{answered && round.artworkUrl ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <EqualizerBars />}{answered ? <View style={s.result}><Text style={correct ? s.good : s.bad}>{correct ? 'GAGNÉ !' : timeout ? 'OUPS · TROP TARD' : 'PERDU'}</Text><Text style={s.artist}>{round.artist}</Text></View> : null}</View>
        {incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {challengeRemaining}s</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}
        <Text style={s.question}>Qui chante ?</Text>
        <View style={s.answers}>{round.choices.slice(0, 3).map((choice, i) => <TouchableOpacity key={choice} disabled={!audioReady || answered || Boolean(incoming[0]) || pausedSoloRemaining !== null} onPress={() => answerSolo(choice)} style={[s.answer, answered && choice === round.correctAnswer && s.answerCorrect, answered && choice === soloAnswer && choice !== round.correctAnswer && s.answerWrong]}><Text style={s.answerNo}>{i + 1}</Text><Text style={s.answerText}>{choice}</Text></TouchableOpacity>)}</View>
      </Animated.View>
      <View style={s.scoreLine}><Text style={s.score}>✓ {soloScore} · ✕ {errors}</Text><Text style={s.score}>{remaining} à jouer</Text></View>
      {enabled ? <View style={s.live}><View style={s.liveHeader}><View style={s.dot} /><Text style={s.liveTitle}>{livePlayers.length ? `${livePlayers.length} joueur${livePlayers.length > 1 ? 's' : ''} disponible${livePlayers.length > 1 ? 's' : ''}` : 'Tu es visible pour les Battles'}</Text></View>{livePlayers.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveRow}>{livePlayers.map((p) => <View key={p.profileId} style={s.livePlayer}><TouchableOpacity onPress={() => onOpenProfile(p.username)}><Avatar name={p.username} url={p.avatarUrl} /></TouchableOpacity><Text numberOfLines={1} style={s.username}>@{p.username}</Text><TouchableOpacity style={s.battleButton} onPress={() => { void challenge(p); }}><Text style={s.battleButtonText}>BATTLE ?</Text></TouchableOpacity></View>)}</ScrollView> : null}</View> : null}
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
    const teamA = players.filter((_, index) => index % 2 === 0);
    const teamB = players.filter((_, index) => index % 2 === 1);
    const teamAScore = teamA.reduce((sum, player) => sum + Number(player?.score || 0), 0);
    const teamBScore = teamB.reduce((sum, player) => sum + Number(player?.score || 0), 0);
    const teamTotal = Math.max(1, teamAScore + teamBScore);
    const leftShare = Math.max(12, Math.min(88, (teamAScore / teamTotal) * 100));
    const versusLabel = players.length > 2 ? `ÉQUIPE A (${teamA.length}) VS ÉQUIPE B (${teamB.length})` : `${first ? `@${first.username}` : 'Loki'} VS ${second ? `@${second.username}` : 'Loki'}`;
    const palmares = Array.from(winnerHistory.reduce((map, row) => {
      const current = map.get(row.profileId) || { ...row, wins: 0 };
      current.wins += 1;
      if (row.matchNo > current.matchNo) Object.assign(current, row, { wins: current.wins });
      map.set(row.profileId, current);
      return map;
    }, new Map<string, KeepBattleArenaWinner & { wins: number }>()).values()).sort((a, b) => b.wins - a.wins || b.matchNo - a.matchNo).slice(0, 3);
    if (arena.status === 'WAITING' && arena.lastResult) {
      const winner = arena.lastWinner;
      const arenaTrackCount = arenaPlayedTracksRef.current.size;
      // Adel (01/09/2026) : "à chaque fin de Battle ... le bouton en dessous
      // tout à la fin, souhaitez-vous enregistrer votre Battle" -- même esprit
      // Oui/Non que le solo, déclenché ici par le bouton plutôt qu'avant le
      // match (une arène a trop de points d'entrée -- matchmaking, invitation,
      // revanche -- pour demander proprement en amont).
      const offerArenaSession = () => {
        if (!arenaTrackCount) return;
        Alert.alert(
          'Enregistrer ce Battle ?',
          `Les ${arenaTrackCount} morceaux de ce Battle peuvent rejoindre Mes Sessions pour les réécouter et décider plus tard de les garder ou de les effacer.`,
          [
            { text: 'Non merci', style: 'cancel' },
            { text: 'Oui, enregistrer', onPress: () => {
              const session = buildArenaSession(Array.from(arenaPlayedTracksRef.current.values()));
              useSessionHistoryStore.getState().addSession(session);
              setArenaSessionId(session.id);
              onOpenSession?.(session.id);
            } },
          ],
        );
      };
      return <View style={s.root}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer le Battle" hitSlop={10} style={s.closeBattle} onPress={closeBattleArena}><Text style={s.closeBattleText}>×</Text></TouchableOpacity>
        <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setArena(null); void stopTrackPreview(); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE · FIN DU MATCH</Text><Text style={s.title}>{themeLabel(arena.themeCode)}</Text></View><Text style={s.round}>{arena.seats.length}J</Text></View>
        <Animated.View style={[s.finishHero, { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] }]}>
          <Text style={s.finishSpark}>✦ 👑 ✦</Text>
          {winner ? <Avatar name={winner.username} url={winner.avatarUrl} size={72} /> : <Text style={s.finishTrophy}>🏆</Text>}
          <Text style={s.finishTitle}>{winner ? `@${winner.username}` : 'BATTLE TERMINÉ'}</Text>
          <Text style={s.finishSub}>{winner ? 'remporte ce Battle' : 'Résultat enregistré'}</Text>
          <View style={s.finishScore}><Text style={s.finishScoreBig}>{winner?.score ?? arena.lastResult.score}</Text><Text style={s.finishScoreSlash}> pts</Text></View>
          <Text style={arena.lastResult.won ? s.finishWon : s.finishLost}>{arena.lastResult.won ? `+${arena.lastResult.creditDelta} FREE · GAGNÉ` : `${arena.lastResult.creditDelta} FREE · MATCH TERMINÉ`}</Text>
        </Animated.View>
        {palmares.length ? <View style={s.palmares}><Text style={s.palmaresTitle}>PALMARÈS · TOP 3</Text>{palmares.map((entry, index) => <TouchableOpacity key={entry.profileId} accessibilityRole="button" onPress={() => onOpenProfile(entry.username)} style={s.palmaresRow}><Text style={s.palmaresRank}>{index + 1}</Text><Avatar name={entry.username} url={entry.avatarUrl} size={38} /><Text numberOfLines={1} style={s.palmaresName}>@{entry.username}</Text><Text style={s.palmaresWins}>{entry.wins} victoire{entry.wins > 1 ? 's' : ''}</Text></TouchableOpacity>)}</View> : null}
        <Text style={s.finishQuestion}>Le groupe reste ensemble. Et maintenant ?</Text>
        <TouchableOpacity disabled={busy} style={s.finishPrimary} onPress={() => { setBusy(true); void startKeepBattleArena(arena.id).then((next) => { setArena(next); animateVersus(); }).catch((e: any) => Alert.alert('Battle', String(e?.message || 'Impossible de relancer.'))).finally(() => setBusy(false)); }}><Text style={s.finishPrimaryText}>{busy ? 'PRÉPARATION…' : 'REVANCHE'}</Text></TouchableOpacity>
        {arenaTrackCount > 0 ? (
          arenaSessionId ? (
            <TouchableOpacity style={s.finishSecondary} onPress={() => onOpenSession?.(arenaSessionId)}>
              <Text style={s.finishSecondaryText}>🎧 VOIR CES MORCEAUX DANS MA SESSION</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.finishSecondary} onPress={offerArenaSession}>
              <Text style={s.finishSecondaryText}>🎧 ENREGISTRER CE BATTLE DANS MA SESSION</Text>
            </TouchableOpacity>
          )
        ) : null}
        {arena.openSeats > 0 ? <TouchableOpacity style={s.finishSecondary} onPress={() => { if (arenaInviteOpen) setArenaInviteOpen(false); else void openArenaInviteList(); }}><Text style={s.finishSecondaryText}>{arenaInviteOpen ? 'FERMER LES INVITATIONS' : `AJOUTER UN JOUEUR · ${arena.openSeats} PLACE${arena.openSeats > 1 ? 'S' : ''}`}</Text></TouchableOpacity> : null}
        {arenaInviteOpen ? <View style={s.arenaInvitePanel}><Text style={s.arenaInviteTitle}>JOUEURS DISPONIBLES · GROUPE {arena.seats.length}/10</Text>{busy ? <ActivityIndicator color="#E5F266" /> : livePlayers.length ? <ScrollView style={s.arenaInviteScroll} contentContainerStyle={s.arenaInviteList}>{livePlayers.map((player) => { const invited = arenaInvitedIds.includes(player.profileId); return <View key={player.profileId} style={s.arenaInviteRow}><TouchableOpacity onPress={() => onOpenProfile(player.username)}><Avatar name={player.username} url={player.avatarUrl} size={46} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={s.arenaInviteName}>@{player.username}</Text><Text style={s.arenaInviteMeta}>● disponible · {themeLabel(player.themeCode)}</Text></View><TouchableOpacity accessibilityRole="button" hitSlop={10} disabled={invited || Boolean(arenaInviteBusyId)} style={[s.arenaInviteButton, invited && s.actionDisabled]} onPress={() => { void invitePlayerToArena(player); }}><Text style={s.arenaInviteButtonText}>{arenaInviteBusyId === player.profileId ? 'ENVOI…' : invited ? 'INVITÉ' : 'INVITER'}</Text></TouchableOpacity></View>; })}</ScrollView> : <Text style={s.arenaInviteEmpty}>Aucun autre joueur disponible pour le moment.</Text>}<TouchableOpacity style={s.arenaShareButton} onPress={() => { void shareArenaInvite(arena); }}><Text style={s.arenaShareButtonText}>INVITER UN AMI PAR LIEN</Text></TouchableOpacity></View> : null}
        <TouchableOpacity style={s.finishSecondary} onPress={() => { setArenaInviteOpen(false); setArena(null); void stopTrackPreview(); }}><Text style={s.finishSecondaryText}>QUITTER LE BATTLE</Text></TouchableOpacity>
      </View>;
    }
    return <View style={s.root}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer le Battle" hitSlop={10} style={s.closeBattle} onPress={closeBattleArena}><Text style={s.closeBattleText}>×</Text></TouchableOpacity>
      <Animated.View pointerEvents="none" style={[s.versus, { opacity: versusOpacity, transform: [{ scale: versusScale }] }]}><Text style={s.versusText}>⚡ BATTLE ⚡</Text><Text style={s.versusNames}>{versusLabel}</Text></Animated.View>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setArena(null); void stopTrackPreview(); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE · {arena.seats.length} JOUEURS</Text><Text style={s.title}>{themeLabel(arena.themeCode)}</Text></View><Text style={s.round}>{arena.currentRound || 0}/{arena.roundCount}</Text></View>
      {first && second ? <View style={s.duel}><View style={s.duelNames}><TouchableOpacity style={{ flex: 1 }} onPress={() => players.length === 2 && onOpenProfile(first.username)}><Text style={s.duelName}>{players.length === 2 ? `@${first.username}` : `ÉQUIPE A · ${teamA.length}`}</Text><Text style={s.duelPoints}>{teamAScore} pts</Text></TouchableOpacity><View style={s.duelCenter}><Text style={s.duelScore}>VS</Text><Text style={s.duelTimer}>{arena.status === 'ACTIVE' ? `${Math.ceil(left / 1000)}s` : 'PRÊT'}</Text></View><TouchableOpacity style={{ flex: 1 }} onPress={() => players.length === 2 && onOpenProfile(second.username)}><Text style={[s.duelName, { textAlign: 'right' }]}>{players.length === 2 ? `@${second.username}` : `ÉQUIPE B · ${teamB.length}`}</Text><Text style={[s.duelPoints, { textAlign: 'right' }]}>{teamBScore} pts</Text></TouchableOpacity></View><View style={s.power}><View style={[s.powerLeft, { width: `${leftShare}%` }]} /><View style={s.powerMiddle} /><View style={s.powerRight} /></View>{players.length > 2 ? <View style={s.teamMembers}>{players.map((player, index) => <TouchableOpacity key={player.profileId} style={s.teamChip} onPress={() => onOpenProfile(player.username)}><Text style={s.teamChipText}>{index % 2 === 0 ? 'A' : 'B'} · @{player.username}</Text></TouchableOpacity>)}</View> : null}</View> : null}
      {arena.status === 'WAITING' ? <View style={s.waiting}><Text style={s.trophy}>⚡</Text><Text style={s.winner}>{arena.seats.length < 2 ? 'EN ATTENTE' : 'JOUEURS EN SYNCHRONISATION'}</Text><Text style={s.waitText}>{arena.seats.length >= 2 ? 'Tous les joueurs entrent dans la même partie. Le morceau démarre sur le même chrono.' : 'En attente d’un adversaire.'}</Text></View> : null}
      {arena.status === 'ACTIVE' && round ? <><View style={s.clockRow}><Text style={[s.clock, ready && left < 2200 && s.clockHot]}>{ready ? `${(left / 1000).toFixed(1)}s` : 'PRÊT'}</Text><Text style={s.clockHint}>{round.answered ? 'RÉPONSE ENREGISTRÉE' : ready ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}</Text></View><View style={s.timeTrack}><View style={[s.timeFill, { width: `${ready ? pct : 100}%` }]} /></View><Animated.View style={[s.card, { transform: [{ scale: pulse }] }]}><View style={s.visual}>{round.revealed && round.artworkUrl ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <EqualizerBars />}{round.revealed ? <View style={s.result}><Text style={round.myAnswer?.correct ? s.good : s.bad}>{round.myAnswer?.correct ? 'GAGNÉ !' : round.answered ? 'PERDU' : 'OUPS · TROP TARD'}</Text><Text style={s.artist}>{round.artist || ''}</Text>{arena.roundWinner ? <Text style={s.roundWinner}>⚡ @{arena.roundWinner.username} gagne la manche</Text> : null}</View> : null}</View><Text style={s.question}>Qui chante ?</Text>{!round.revealed ? <View style={s.answers}>{(round.choices || []).slice(0, 3).map((choice, i) => <TouchableOpacity key={choice} disabled={Boolean(!ready || round.answered || pending || left <= 0)} onPress={() => { void answerArena(choice); }} style={[s.answer, (round.myAnswer?.selectedAnswer === choice || pending === choice) && s.answerSelected]}><Text style={s.answerNo}>{i + 1}</Text><Text style={s.answerText}>{choice}</Text></TouchableOpacity>)}</View> : null}</Animated.View></> : null}
    </View>;
  }

  if (browseOnline) {
    const browseChallengeRemaining = incoming[0] ? Math.max(0, Math.ceil((new Date(incoming[0].expiresAt).getTime() - now) / 1000)) : 0;
    return <View style={s.root}><View style={s.header}><TouchableOpacity style={s.back} onPress={() => setBrowseOnline(false)}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE</Text><Text style={s.title}>Joueurs disponibles</Text></View><View style={{ width: 36 }} /></View>{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {browseChallengeRemaining}s</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}<Text style={s.browseText}>Choisis d’abord le style du match. Le joueur invité verra ce style avant d’accepter ou refuser.</Text><Text style={s.section}>STYLE DU MATCH</Text><ScrollView horizontal style={s.themeScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeRow}>{themes.map((t) => <TouchableOpacity key={t.code} onPress={() => setThemeCode(t.code)} style={[s.theme, t.code === themeCode && s.themeOn]}><Text style={[s.themeText, t.code === themeCode && s.themeTextOn]}>{t.label}</Text></TouchableOpacity>)}</ScrollView>{busy ? <ActivityIndicator color="#E5F266" /> : livePlayers.length ? <View style={s.browseList}>{livePlayers.map((p) => <View key={p.profileId} style={s.browsePlayer}><TouchableOpacity onPress={() => onOpenProfile(p.username)}><Avatar name={p.username} url={p.avatarUrl} size={48} /></TouchableOpacity><View style={{ flex: 1 }}><TouchableOpacity onPress={() => onOpenProfile(p.username)}><Text style={s.browseName}>@{p.username}</Text></TouchableOpacity><Text style={s.browseMeta}>● joue en solo · {themeLabel(p.themeCode)}</Text></View><TouchableOpacity style={s.browseBattle} onPress={() => { void challenge(p); }}><Text style={s.browseBattleText}>BATTLE · {themeLabel(themeCode)}</Text></TouchableOpacity></View>)}</View> : <View style={s.waiting}><Text style={s.trophy}>♫</Text><Text style={s.winner}>Aucun joueur solo visible</Text><Text style={s.waitText}>La liste se rafraîchit automatiquement.</Text><TouchableOpacity style={s.shareButton} onPress={() => { void shareInvite(); }}><Text style={s.shareButtonText}>INVITER UN AMI</Text></TouchableOpacity></View>}</View>;
  }

  return <View style={s.root}><View style={s.home}><TouchableOpacity style={s.homeBack} onPress={onExit}><Text style={s.homeBackText}>‹</Text></TouchableOpacity><Text style={s.homeIcon}>⚡</Text><Text style={s.homeTitle}>Loki BATTLE</Text><Text style={s.homeSub}>10 secondes réelles d’écoute · 3 choix · aucun swipe</Text></View><Text style={s.section}>STYLE</Text><ScrollView horizontal style={s.themeScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeRow}>{themes.map((t) => <TouchableOpacity key={t.code} onPress={() => setThemeCode(t.code)} style={[s.theme, t.code === themeCode && s.themeOn]}><Text style={[s.themeText, t.code === themeCode && s.themeTextOn]}>{t.label}</Text></TouchableOpacity>)}</ScrollView><TouchableOpacity style={s.mainButton} disabled={busy} onPress={() => { void startSolo(); }}>{busy ? <ActivityIndicator color="#15110B" /> : <><Text style={s.mainButtonText}>JOUER SOLO</Text><Text style={s.mainButtonSub}>Le chrono attend que le son démarre</Text></>}</TouchableOpacity><TouchableOpacity style={s.onlineButton} disabled={busy} onPress={() => { void openOnline(); }}><Text style={s.onlineTitle}>BATTLE EN LIGNE</Text><Text style={s.onlineSub}>Voir les joueurs qui jouent déjà en solo</Text></TouchableOpacity></View>;
}

const s = StyleSheet.create({
  root: { width: '100%', flex: 1, paddingBottom: 4, position: 'relative' }, arenaInvitePanel: { maxHeight: 290, marginBottom: 8, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: '#4A3C55', backgroundColor: '#120E17' }, arenaInviteTitle: { color: '#E5F266', fontSize: 12, fontWeight: '900', marginBottom: 8 }, arenaInviteScroll: { maxHeight: 190 }, arenaInviteList: { gap: 7 }, arenaInviteRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 7, borderRadius: 15, backgroundColor: '#1B1422' }, arenaInviteName: { color: '#FFF', fontSize: 14, fontWeight: '900' }, arenaInviteMeta: { color: '#75E6AA', fontSize: 10, fontWeight: '800', marginTop: 2 }, arenaInviteButton: { minWidth: 94, minHeight: 52, paddingHorizontal: 13, borderRadius: 26, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, arenaInviteButtonText: { color: '#17130B', fontSize: 12, fontWeight: '900' }, arenaInviteEmpty: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 14 }, arenaShareButton: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: '#4A3C55', alignItems: 'center', justifyContent: 'center', marginTop: 8 }, arenaShareButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' }, closeBattle: { position: 'absolute', top: 0, right: 0, zIndex: 60, width: 48, height: 48, borderRadius: 24, backgroundColor: '#17121D', borderWidth: 1, borderColor: '#51445E', alignItems: 'center', justifyContent: 'center' }, closeBattleText: { color: '#FFF', fontSize: 30, lineHeight: 32, fontWeight: '700', marginTop: -2 }, finishHero: { minHeight: 300, marginTop: 14, borderRadius: 28, borderWidth: 1, borderColor: '#5A476B', backgroundColor: '#17101F', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden' }, finishSpark: { color: '#E5F266', fontSize: 22, fontWeight: '900', letterSpacing: 5 }, finishTrophy: { fontSize: 72, marginTop: 8 }, finishTrophyBig: { fontSize: 84 }, finishSessionHint: { color: '#B79CFF', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 2, marginBottom: 6 }, finishTitle: { color: '#FFF', fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 8 }, finishSub: { color: '#FFF', fontSize: 12, lineHeight: 17, fontWeight: '800', textAlign: 'center', marginTop: 7, maxWidth: 280 }, finishScore: { flexDirection: 'row', alignItems: 'baseline', marginTop: 13 }, finishScoreBig: { color: '#E5F266', fontSize: 54, lineHeight: 58, fontWeight: '900' }, finishScoreSlash: { color: '#FFF', fontSize: 18, fontWeight: '900' }, finishWon: { color: '#7FF2B7', fontSize: 12, fontWeight: '900', marginTop: 7 }, finishLost: { color: '#FFB3C3', fontSize: 12, fontWeight: '900', marginTop: 7 }, finishQuestion: { color: '#FFF', textAlign: 'center', fontSize: 12, fontWeight: '900', marginVertical: 12 }, palmares: { marginTop: 10, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: '#40334B', backgroundColor: '#120E17' }, palmaresTitle: { color: '#E5F266', fontSize: 13, lineHeight: 18, fontWeight: '900', letterSpacing: .7, marginBottom: 7 }, palmaresRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9 }, palmaresRank: { width: 24, color: '#E5F266', fontSize: 18, fontWeight: '900' }, palmaresName: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '900' }, palmaresWins: { color: '#FFF', fontSize: 11, fontWeight: '800' }, finishPrimary: { minHeight: 50, borderRadius: 25, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }, finishPrimaryText: { color: '#17130B', fontSize: 12, fontWeight: '900' }, finishSecondary: { minHeight: 46, borderRadius: 23, borderWidth: 1.5, borderColor: '#6E5A94', backgroundColor: '#18121F', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }, finishSecondaryText: { color: '#FFF', fontSize: 11, fontWeight: '900' }, home: { alignItems: 'center', paddingVertical: 10, position: 'relative' }, homeBack: { position: 'absolute', left: 0, top: 5, width: 30, height: 30, borderRadius: 15, backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center' }, homeBackText: { color: '#FFF', fontSize: 23, lineHeight: 25 }, homeIcon: { fontSize: 28 }, homeTitle: { color: '#FFF', fontSize: 24, fontWeight: '900' }, homeSub: { color: '#FFF', fontSize: 10, fontWeight: '700', marginTop: 2 }, section: { color: '#E5F266', fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 5 }, themeScroll: { flexGrow: 0, flexShrink: 0, height: 38, maxHeight: 38 }, themeRow: { gap: 6, paddingRight: 12, alignItems: 'center' }, theme: { height: 32, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#30273A', backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, themeOn: { backgroundColor: '#FFF', borderColor: '#FFF' }, themeText: { color: '#FFF', fontSize: 11, fontWeight: '800' }, themeTextOn: { color: '#120E16' }, mainButton: { minHeight: 54, borderRadius: 25, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', marginTop: 14 }, mainButtonText: { color: '#17130B', fontSize: 14, fontWeight: '900' }, mainButtonSub: { color: '#494D22', fontSize: 9, fontWeight: '800', marginTop: 2 }, onlineButton: { minHeight: 58, borderRadius: 20, backgroundColor: '#18121F', borderWidth: 1, borderColor: '#31263B', alignItems: 'center', justifyContent: 'center', marginTop: 9 }, onlineTitle: { color: '#FFF', fontSize: 13, fontWeight: '900' }, onlineSub: { color: '#FFF', fontSize: 10, fontWeight: '700', marginTop: 2 }, header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 }, back: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center' }, backText: { color: '#FFF', fontSize: 24, lineHeight: 26 }, headerMid: { flex: 1, alignItems: 'center' }, kicker: { color: '#E5F266', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFF', fontSize: 15, fontWeight: '900' }, round: { width: 36, textAlign: 'right', color: '#FFF', fontSize: 11, fontWeight: '900' }, clockRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 }, clock: { color: '#FFF', fontSize: 25, fontWeight: '900' }, clockHot: { color: '#FF6687' }, clockHint: { color: '#FFF', fontSize: 8, fontWeight: '900', letterSpacing: .8 }, timeTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#211A29', marginVertical: 5 }, timeFill: { height: '100%', backgroundColor: '#E5F266' }, card: { borderRadius: 22, padding: 7, backgroundColor: '#120E17', borderWidth: 1, borderColor: '#30263A' }, visual: { height: 205, borderRadius: 17, overflow: 'hidden', backgroundColor: '#21192A', alignItems: 'center', justifyContent: 'center', position: 'relative' }, cover: { width: '100%', height: '100%' }, music: { color: '#FFF', fontSize: 68, fontWeight: '900' }, result: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,6,10,.72)', alignItems: 'center', justifyContent: 'center', padding: 14 }, good: { color: '#7FF2B7', fontSize: 26, fontWeight: '900' }, bad: { color: '#FF6C8C', fontSize: 23, fontWeight: '900' }, artist: { color: '#FFF', fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 5 }, roundWinner: { color: '#FFE193', fontSize: 10, fontWeight: '900', textAlign: 'center', marginTop: 9 }, question: { color: '#FFF', fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 7 }, answers: { gap: 6, marginTop: 6 }, answer: { minHeight: 60, borderRadius: 15, backgroundColor: '#1D1625', borderWidth: 1, borderColor: '#342A40', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9 }, answerSelected: { borderColor: '#E5F266', backgroundColor: '#30351B' }, answerCorrect: { borderColor: '#69E5A4' }, answerWrong: { borderColor: '#FF6C8C', backgroundColor: '#3A1B22' }, answerNo: { width: 29, height: 29, borderRadius: 14.5, backgroundColor: '#2B2235', color: '#FFF', textAlign: 'center', lineHeight: 29, fontSize: 13, fontWeight: '900' }, answerText: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '900' }, scoreLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 3 }, score: { color: '#FFF', fontSize: 13, fontWeight: '800' }, live: { marginTop: 'auto', padding: 7, borderRadius: 16, backgroundColor: '#100D14' }, liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6EE8A7' }, liveTitle: { color: '#FFF', fontSize: 12, fontWeight: '900' }, liveRow: { gap: 10, paddingTop: 7 }, livePlayer: { width: 70, alignItems: 'center' }, avatarFallback: { backgroundColor: '#2B2235', alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: '#FFF', fontSize: 16, fontWeight: '900' }, username: { color: '#FFF', fontSize: 9, fontWeight: '800', marginTop: 3, maxWidth: 70 }, battleButton: { minHeight: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center', marginTop: 4 }, battleButtonText: { color: '#FFF', fontSize: 8, fontWeight: '900' }, invite: { marginTop: 10, minHeight: 142, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 24, borderWidth: 3, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center' }, inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, inviteActions: { flexDirection: 'row', gap: 12, width: '100%' }, inviteLabel: { color: '#E5F266', fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 4 }, inviteName: { color: '#FFF', fontSize: 17, lineHeight: 22, fontWeight: '900' }, inviteQuestion: { color: '#F3EDF7', fontSize: 16, lineHeight: 22, fontWeight: '800' }, inviteConnecting: { color: '#E5F266', fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: .5 }, no: { flex: 1, minHeight: 64, paddingHorizontal: 16, borderRadius: 32, borderWidth: 3, borderColor: '#8A7795', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 16, fontWeight: '900' }, yes: { flex: 1, minHeight: 64, paddingHorizontal: 16, borderRadius: 32, borderWidth: 3, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 16, fontWeight: '900' }, actionDisabled: { opacity: .62 }, versus: { position: 'absolute', zIndex: 20, left: 16, right: 16, top: 120, padding: 18, borderRadius: 24, backgroundColor: '#22152D', borderWidth: 1, borderColor: '#8B5CF6', alignItems: 'center' }, versusText: { color: '#E5F266', fontSize: 25, fontWeight: '900' }, versusNames: { color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 5 }, duel: { marginBottom: 6 }, duelNames: { flexDirection: 'row', alignItems: 'center' }, duelName: { color: '#FFF', fontSize: 13, fontWeight: '900' }, duelScore: { color: '#E5F266', fontSize: 15, fontWeight: '900' }, duelCenter: { minWidth: 46, alignItems: 'center', justifyContent: 'center' }, duelTimer: { color: '#FFF', fontSize: 11, fontWeight: '900', marginTop: 2 }, duelPoints: { color: '#FFF', fontSize: 13, fontWeight: '900', marginTop: 3 }, teamMembers: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }, teamChip: { paddingHorizontal: 6, minHeight: 22, borderRadius: 11, backgroundColor: '#1D1625', alignItems: 'center', justifyContent: 'center' }, teamChipText: { color: '#FFF', fontSize: 8, fontWeight: '800' }, power: { height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2032', flexDirection: 'row', position: 'relative', marginTop: 7 }, powerLeft: { height: '100%', backgroundColor: '#8B5CF6' }, powerRight: { flex: 1, height: '100%', backgroundColor: '#E14E78' }, powerMiddle: { position: 'absolute', zIndex: 3, left: '50%', width: 2, height: '100%', backgroundColor: '#FFF' }, waiting: { padding: 14, borderRadius: 21, backgroundColor: '#120E17', borderWidth: 1, borderColor: '#30263A', alignItems: 'center' }, trophy: { fontSize: 34 }, winner: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 3 }, waitText: { color: '#FFF', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 6 }, browseText: { color: '#FFF', fontSize: 11, lineHeight: 16, marginBottom: 10 }, browseList: { gap: 7 }, browsePlayer: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 17, borderWidth: 1, borderColor: '#30273A', backgroundColor: '#151020', padding: 9 }, browseName: { color: '#FFF', fontSize: 13, fontWeight: '900' }, browseMeta: { color: '#6EE8A7', fontSize: 9, fontWeight: '800', marginTop: 2 }, browseBattle: { minHeight: 34, borderRadius: 17, backgroundColor: '#8B5CF6', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, browseBattleText: { color: '#FFF', fontSize: 9, fontWeight: '900' }, shareButton: { minHeight: 40, borderRadius: 20, backgroundColor: '#8B5CF6', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, shareButtonText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
});
