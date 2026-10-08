import React from 'react';
import { ActivityIndicator, Animated, Image, ImageBackground, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import PresenceDot from './PresenceDot';
import { playTrackPreviewSegment, preloadTrackPreviewSegment, discardPreloadedTrackPreview, scheduleTrackPreviewSegment, stopTrackPreview, stopTrackPreviewFast, unlockWebAudioForGesture } from '../services/audioPreviewService';

// Clé stable (sans compteur de tentative) identifiant l'extrait d'une manche
// solo -- utilisée à la fois par preloadTrackPreviewSegment (pendant la
// pause après réponse) et par le premier essai de lecture de la manche, pour
// que les deux se rencontrent et évitent un rechargement réseau redondant.
const soloRoundPreviewKey = (trackId: string, roundIndex: number) => `solo:${trackId}:${roundIndex}`;

function canLoadAuthenticatedBattleCredit(): boolean {
  const state = useUserStore.getState();
  return Boolean(state.user?.id && !state.isLocalGuest && !state.isDemoMode);
}

async function loadBattleCreditStatusIfAuthenticated(): Promise<KeepBattleCreditStatus | null> {
  if (!canLoadAuthenticatedBattleCredit()) return null;
  return loadMyKeepBattleCreditStatus().catch(() => null);
}
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { cancelAudioCapture } from '../services/micCapture';
import { acknowledgeKeepBattleArenaPresence, buildKeepBattleArenaInviteLink, cancelKeepBattleArenaRematch, createKeepBattleArena, joinKeepBattleArena, KeepBattleArenaSpectate, KeepBattleArenaState, KeepBattleArenaWinner, KeepBattleCreditStatus, KeepBattlePendingRematch, KeepBattlePlayerStats, KeepBattleRematchParticipant, KeepBattleSoloRank, KeepBattleTheme, leaveKeepBattleArena, loadKeepBattleArena, loadKeepBattleArenaRematchStatus, loadKeepBattleArenaWinnerHistory, estimateKeepBattleServerClockOffsetMs, keepBattleServerNowMs, loadKeepBattleGlobalLeaderboard, loadKeepBattlePlayerStats, loadKeepBattleThemes, loadMyActiveKeepBattleArena, loadMyKeepBattleCreditStatus, loadMyKeepBattleSoloRank, loadPendingArenaRematches, proposeKeepBattleArenaRematch, respondKeepBattleArenaRematch, spectateKeepBattleArena, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena, updateSoloPresenceTheme } from '../services/keepBattleService';
import { KeepBattleOpenSalon, loadOpenBattleSalons } from '../services/keepBattleSalonService';
import { formatCompactNumber } from '../utils/formatCompactNumber';
import { buyKeepBattleSoloPack, consumeKeepBattleSoloDailyStart, KeepBattleSoloPack, KeepBattleSoloPackOffer, KeepBattleSoloPacks, KeepBattleSoloRound, loadKeepBattleSoloDailyStatus, loadKeepBattleSoloPack, loadKeepBattleSoloPacks, loadMyFreeRechargeInfo } from '../services/keepBattleExperienceService';
import { composeBattleLine, answerVisualState, dedupeAnswerChoices, formatFreeRecharge, nextMonthlyFreeRecharge, sameAnswer, battleWinReason, SOLO_IDLE_AUTO_CLOSE_MS, soloIdleDetected, soloIdleNotice, soloCostNotice, arenaMissWarning, ABANDON_RANKING_NOTE, soloPlanRuleCopy, soloRechargeCopy, soloQuitNotice, soloQuotaCopy, soloEncouragement } from '../services/battleHomeInfo';
import MoreInfoLine from './MoreInfoLine';
import ContextHelpSheet from './ContextHelpSheet';
import LokiFinishBurst from './LokiFinishBurst';
import WinnerTrophy3D from './WinnerTrophy3D';
import FreeEarnHelp from './FreeEarnHelp';
import LokiMascotVoice from './LokiMascotVoice';
import { cancelBattleChallenge, heartbeatSoloBattle, KeepBattleIncomingChallenge, KeepBattleLivePlayer, KeepBattleOutgoingChallenge, leaveSoloBattle, loadIncomingBattleChallenges, loadLiveSoloPlayers, loadMyMatchPreferences, loadOutgoingBattleChallenges, reportSoloBattleResult, respondBattleChallenge, saveMyMatchPreferences, sendBattleArenaChallenge, sendBattleChallenge } from '../services/keepBattleLiveService';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUserStore } from '../store/useUserStore';
import { useBattleAvailabilityStore } from '../store/useBattleAvailabilityStore';
import { useGameSessionStore } from '../store/useGameSessionStore';
import { buildPublicProfileLink, shareBattleInvite, shareBattleResult, shareProfile } from '../services/sharingService';
import { KeepSession, SessionTrackEntry } from '../types';
import { supabase } from '../services/supabaseClient';
import ProfileCertificationBadge from './ProfileCertificationBadge';
import { robotSay } from '../services/robotCoachService';
import { ProfileCertificationTier } from '../services/publicProfileStateService';
import { colors } from '../theme/colors';
import KeepModal from './KeepModal';
import { activateBattleSoloRound, battlePreviewPositionMillis, loadBattlePreviewStartSec, reportBattleNoVoice } from '../services/keepBattleExperienceService';

const ROUND_MS = 10000;
const SOLO_SHOW_LIVE_PLAYERS = false;
const A11Y_TOUCH_HIT_SLOP = { top: 9, bottom: 9, left: 9, right: 9 } as const;
const SOLO_RESULT_HOLD_MS = 650;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const BATTLE_NETWORK_DEADLINE_MS = 8_000;
async function withBattleDeadline<T>(promise: Promise<T>, label: string, ms = BATTLE_NETWORK_DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`BATTLE_NETWORK_TIMEOUT:${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const initial = (name: string) => (name || 'K').replace(/^@/, '').slice(0, 1).toUpperCase();

// Adel (07/09/2026) : "pour huit musiques il perd trois Free, pour 15
// musiques plus il monte plus la mise est grosse" -- la mise suit le nombre
// de manches (miroir exact de public.keep_battle_stake_for_rounds côté
// serveur, seule source de vérité réelle : ceci ne sert qu'à l'aperçu
// instantané avant validation).
const stakeForRounds = (n: number) => Math.max(1, Math.ceil((3 * Math.max(1, n)) / 8));

// Adel (18/09/2026) : Calcul des Free gagnés en SOLO selon le nombre de bonnes réponses
// Formule: free_earned = floor(correct_answers / total * max_reward_for_pack_size)
// Max rewards: 8→3, 15→6, 20→8, 30→12
const maxRewardForRounds = (n: number): number => {
  if (n <= 8) return 3;
  if (n <= 15) return 6;
  if (n <= 20) return 8;
  return 12;
};
const freeEarnedForSoloScore = (correctAnswers: number, totalRounds: number): number => {
  if (totalRounds <= 0) return 0;
  // Adel (19/09/2026) : seul un score parfait (8/8) donne droit à des Free.
  // Toute autre score ne crédite rien, même 7/8.
  if (correctAnswers < totalRounds) return 0;
  const maxReward = maxRewardForRounds(totalRounds);
  return maxReward;
};
// Le serveur embarque désormais le montant exact requis dans le message
// d'erreur ("...REQUIRED:12") sans casser les anciens .includes() : on
// l'utilise pour un message précis, avec repli sur le calcul local.
const parseRequiredFree = (message: string, fallback: number) => {
  const match = /:(\d+)\s*$/.exec(message || '');
  return match ? Number(match[1]) : fallback;
};

// Adel (03/09/2026) : "rejeter le chronomètre pour dire dans combien de temps
// on pourra renvoyer une invite ... le système est collectif, pareil pour
// tout le monde" -- le serveur (keep_battle_challenge_send /
// keep_battle_arena_challenge_send) renvoie désormais l'instant exact de
// déblocage dans le message d'erreur ("...DECLINES:<epoch secondes>"). Deux
// petits helpers partagés, utilisés à l'identique sur les 3 écrans qui
// listent des joueurs à défier (solo mi-partie, "Joueurs disponibles",
// invitation à rejoindre une arène) -- même règle, même affichage partout,
// jamais une logique différente par écran.
function parseInviteBlockedUntilMs(message: string): number | null {
  const match = message.match(/BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const ms = Math.round(Number(match[1]) * 1000);
  return Number.isFinite(ms) && ms > Date.now() ? ms : null;
}
// Adel (04/09/2026) : "c'est toujours la même formulation perdu/gagné ...
// jamais le même résultat, encourage le gagnant, nargue gentiment le
// perdant" -- BUG RÉEL rapporté : le texte de fin de match était figé
// ("GAGNÉ"/"MATCH TERMINÉ"), toujours identique. Un petit pool de phrases
// par issue, choisi de façon déterministe à partir de l'id d'arène (stable
// pour CE match précis, donc pas de clignotement au re-render, mais
// différent d'un match à l'autre).
// Adel (29/09/2026) : la phrase d'ambiance doit suivre la VRAIE raison de la
// victoire (battleWinReason) : jamais « réflexes ultra rapides » pour un
// gagnant plus lent qui a gagné aux bonnes réponses.
const BATTLE_WIN_MESSAGES_SPEED = [
  'Réflexes ultra rapides, personne n’a pu suivre.',
  'Tu as trouvé la réponse avant la fin du refrain.',
  'Toujours un temps d’avance sur les autres.',
];
const BATTLE_WIN_MESSAGES_ACCURACY = [
  'Oreille en or, rien ne t’échappe !',
  'Instinct redoutable, tu domines ce Battle.',
  'Ton sens du rythme fait des ravages.',
  'Une oreille aussi affûtée, ça se respecte.',
  'Tu repars avec le trophée ET les Free.',
  'Performance solide, continue sur cette lancée.',
  'Personne ne t’a vu venir, GG !',
];
const BATTLE_LOSE_MESSAGES_SPEED = [
  'Ton adversaire a eu la détente plus rapide cette fois.',
  'Il t’a devancé d’une fraction de seconde, reviens plus affûté.',
  'L’oreille de ton adversaire était juste un poil plus rapide.',
  'Il t’a pris de vitesse, montre-lui que tu peux faire mieux.',
  'Serré ! Un peu plus de vitesse et c’est toi qui gagnes.',
];
const BATTLE_LOSE_MESSAGES_ACCURACY = [
  'Il a reconnu plus de morceaux que toi cette fois.',
  'Pas de chance, la prochaine manche est pour toi.',
  'Ce n’est que partie remise, prends ta revanche.',
  'Petite défaite, grande revanche à venir.',
  'Ça se joue à rien, retente ta chance tout de suite.',
];
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
type BattleResultMessageBucket = 'WIN_SPEED' | 'WIN_ACCURACY' | 'LOSE_SPEED' | 'LOSE_ACCURACY';
const BATTLE_RESULT_MESSAGE_USED: Record<BattleResultMessageBucket, Set<number>> = {
  WIN_SPEED: new Set<number>(),
  WIN_ACCURACY: new Set<number>(),
  LOSE_SPEED: new Set<number>(),
  LOSE_ACCURACY: new Set<number>(),
};
const BATTLE_RESULT_MESSAGE_LAST: Partial<Record<BattleResultMessageBucket, number>> = {};
const BATTLE_RESULT_MESSAGE_CACHE = new Map<string, string>();

function battleResultMessage(arenaId: string, matchNo: number, won: boolean, bySpeed: boolean, nobody = false): string {
  if (nobody) return composeBattleLine('NOBODY', `${arenaId}:${matchNo}`);
  const bucket: BattleResultMessageBucket = won
    ? (bySpeed ? 'WIN_SPEED' : 'WIN_ACCURACY')
    : (bySpeed ? 'LOSE_SPEED' : 'LOSE_ACCURACY');
  // Adel (05/10/2026) : phrases COMPOSÉES (ouverture + corps + conclusion) pour ne plus voir toujours les mêmes textes ; stable pour CE résultat.
  const cacheKey = `${arenaId}:${matchNo}:${bucket}`;
  const cached = BATTLE_RESULT_MESSAGE_CACHE.get(cacheKey);
  if (cached) return cached;
  const text = composeBattleLine(bucket, cacheKey);
  BATTLE_RESULT_MESSAGE_CACHE.set(cacheKey, text);
  if (BATTLE_RESULT_MESSAGE_CACHE.size > 160) {
    const oldest = BATTLE_RESULT_MESSAGE_CACHE.keys().next().value;
    if (oldest) BATTLE_RESULT_MESSAGE_CACHE.delete(oldest);
  }
  return text;
}
function formatInviteCooldown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Adel (02/09/2026) : "elargir un tres large culture musical" -- repli client
// aligné sur la table live keep_battle_themes (utilisée en priorité ; ce
// repli ne sert que si la requête réseau échoue au tout premier chargement).
const FALLBACK_THEMES: KeepBattleTheme[] = [
  { code: 'MIX', label: 'Mix' }, { code: 'RAP_FR', label: 'Rap FR' }, { code: 'RAP_US', label: 'Rap US' },
  { code: 'FUNK', label: 'Funk' }, { code: 'JAZZ', label: 'Jazz' }, { code: 'DISCO', label: 'Disco' },
  { code: 'AFRO', label: 'Afro' }, { code: 'CHANSON_FR', label: 'Chanson FR' }, { code: 'SOUL', label: 'Soul' },
  { code: 'REGGAE', label: 'Reggae' }, { code: 'ANNEES_80', label: 'Années 80' }, { code: 'ANNEES_90', label: 'Années 90' },
  { code: 'ELECTRO', label: 'Electro' }, { code: 'POP', label: 'Pop' }, { code: 'RNB', label: 'R&B' },
  { code: 'ROCK', label: 'Rock' }, { code: 'LATINO', label: 'Latino' }, { code: 'RAI', label: 'Raï' },
  { code: 'CLASSIQUE', label: 'Classique' }, { code: 'RUSSE', label: 'Russe' }, { code: 'TURC', label: 'Turc' },
  { code: 'KPOP', label: 'K-Pop' }, { code: 'ARABE', label: 'Arabe' }, { code: 'BRESIL', label: 'Brésil' },
  { code: 'INDE', label: 'Bollywood' }, { code: 'HOUSE', label: 'House' }, { code: 'REGGAETON', label: 'Reggaeton' },
  { code: 'AMAPIANO', label: 'Amapiano' }, { code: 'ALTERNATIVE', label: 'Alternative / Indie' },
  { code: 'COUNTRY', label: 'Country' }, { code: 'METAL', label: 'Metal' }, { code: 'SOUNDTRACK', label: 'Bandes originales' },
  { code: 'BLUES', label: 'Blues' },
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

// Adel (01/09/2026) : "enlève ton éclair, mets une animation à la place ...
// selon le score, une animation différente." Remplace l'icône figée par un
// léger balancement en boucle, sans changer la taille/l'espace occupé (donc
// sans reproduire le problème de boutons coupés en bas d'écran).

// Adel (02/09/2026) : "est-ce que tu peux défoncer l'image ... quand la
// réponse arrive il faut défoncer l'image de l'artiste" -- la jaquette
// apparaissait sans aucun mouvement au moment du résultat. Un zoom d'impact
// (part de plus grand que nature, retombe sec sur sa taille normale) au
// moment précis où elle s'affiche, dans les deux modes (solo et arène).
function RevealArtwork({ uri }: { uri: string }) {
  const punch = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    punch.setValue(0);
    Animated.spring(punch, { toValue: 1, friction: 4, tension: 130, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [uri]);
  const scale = punch.interpolate({ inputRange: [0, 1], outputRange: [1.45, 1] });
  return <Animated.Image source={{ uri }} style={[s.cover, { transform: [{ scale }] }]} />;
}

type Props = {
  enabled: boolean;
  // Adel (02/10/2026) : le Classement Battle quitte Soirées et vit ici, sous
  // le format (bouton « 🏆 CLASSEMENT »), ouvert par l'écran hôte.
  onOpenLeaderboard?: () => void;
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
  // 29/09/2026 : ouvre l'écran des formules depuis « Regagner des Free ».
  onOpenOffers?: () => void;
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

// Adel (02/09/2026) : "j'ai jamais fait d'invite ... nettoie la cage" -- bug
// réel trouvé : cette liste vivait dans un `useRef`, donc remise à zéro à
// CHAQUE montage du composant (fermer puis rouvrir Battle, ce qui arrive en
// permanence). Le serveur renvoie les défis envoyés sur une fenêtre de 10
// minutes (keep_battle_challenge_outgoing) -- avec un ref qui se vide à
// chaque remontage, un défi refusé il y a 3-8 minutes ressortait comme "tout
// juste refusé" au moindre retour sur l'écran Battle. Module-level (pas
// `useRef`) : survit aux montages/démontages du composant, ne se vide que
// sur un vrai rechargement de page, réglant le problème une fois pour toutes
// sans changer la logique existante (.add/.has/.clear() identiques).
const handledOutgoingIds = new Set<string>();
// Adel (03/09/2026) : "quand j'appuie sur la croix, ça revient
// automatiquement ici" -- garde SÉPARÉE de `handledOutgoingIds` ci-dessus et
// jamais vidée par `runStartSolo`/`openOnline` (qui vident bien
// `handledOutgoingIds` pour rejouer les alertes refus/expiration d'une
// nouvelle session -- ce vidage effacerait aussi la protection anti-
// réouverture si elle partageait le même Set, réexposant le bug dès qu'on
// relance "Jouer solo" ou "Battle en ligne" après avoir fermé une arène).
const autoJoinedChallengeIds = new Set<string>();

export default function KeepBattleMobileGameV3({ enabled, onOpenProfile, onRequireAccount, onExit, initialArenaId, onOpenSession, onOpenOffers, onOpenLeaderboard }: Props) {
  const [homeHelpOpen, setHomeHelpOpen] = React.useState(false);
  // Visuel de manche en ligne : sur téléphone il prend toute la hauteur
  // libre (réponses en bas, sous le pouce) ; sur ordinateur, plafonné.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDesktopBattle = windowWidth >= 900;
  // DESIGN UNIQUE : le gabarit validé sur iPhone est la source de vérité.
  // Desktop ne reçoit plus des dimensions de manche différentes : on garde
  // la même composition carrée/4 réponses et on centre simplement l'ensemble.
  const battleDesignWidth = Math.min(windowWidth, 430);
  const roundCardMinHeight = Math.max(520, Math.min(650, windowHeight - 124));
  const arenaVisualMax = Math.max(260, Math.min(battleDesignWidth - 10, roundCardMinHeight - 214));
  const soloRoundCardMinHeight = Math.max(500, Math.min(650, windowHeight - 248));
  const soloVisualMax = Math.max(260, Math.min(battleDesignWidth - 10, soloRoundCardMinHeight - 216));
  const [soloPlayersOpen, setSoloPlayersOpen] = React.useState(false);
  const [themes, setThemes] = React.useState<KeepBattleTheme[]>(FALLBACK_THEMES);
  const [themeCode, setThemeCode] = React.useState('MIX');
  // Adel (03/09/2026) : "pouvoir choisir 8, 15, 20 ou 30 morceaux avant de
  // démarrer, en plus du style musical" -- même mécanisme que le style :
  // choisi une fois avant de lancer, transmis au pack solo ou à l'invitation
  // (round_count voyage avec le défi jusqu'à la création de l'arène).
  const ROUND_COUNT_OPTIONS = [8, 15, 20, 30] as const;
  const [roundCount, setRoundCount] = React.useState<number>(8);
  // Adel (03/09/2026) : "je puisse sélectionner plusieurs styles ... et que
  // ça reste enregistré, visible par les autres quand je suis disponible" --
  // préférence DURABLE (plusieurs styles + nombre de morceaux), distincte du
  // style choisi pour UNE invite précise (toujours un seul, une arène n'a
  // qu'une colonne theme_code) : chargée une fois, modifiable via un
  // dérouleur (cases à cocher), sauvegardée côté serveur à chaque
  // changement, et affichée sur ma propre ligne pour les autres joueurs.
  const [myPreferredThemes, setMyPreferredThemes] = React.useState<string[]>(['MIX']);
  const [prefsPickerOpen, setPrefsPickerOpen] = React.useState(false);
  const [prefsSaving, setPrefsSaving] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    loadMyMatchPreferences().then((prefs) => {
      if (!live) return;
      setMyPreferredThemes(prefs.themeCodes);
      setRoundCount((current) => (current === 8 ? prefs.roundCount : current));
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  // Adel (03/09/2026) : "j'ai mis MES STYLES ACCEPTÉS en bas, pourquoi tu
  // laisses le sélecteur de style en haut, il sert à rien" -- il y avait deux
  // façons de choisir un style au même endroit (la rangée de pastilles STYLE
  // DU MATCH + le dérouleur MES STYLES ACCEPTÉS). Un seul suffit : le style
  // réellement utilisé pour un défi/un solo suit maintenant directement la
  // préférence enregistrée (un style précis si un seul est coché, Mix sinon),
  // la rangée de pastilles est supprimée sur "Joueurs disponibles" ET sur
  // l'accueil Battle (solo).
  // Adel (04/09/2026) : "si son style musical c'est funk etc. c'est lui qui
  // choisit ... ça a pas sélectionné le style musical que j'ai mis" -- BUG
  // RÉEL confirmé en base : avec plusieurs styles cochés dans MES STYLES
  // ACCEPTÉS (ex. Funk + Raï + Rap FR + Reggae + RnB), l'ancienne règle
  // ("un seul style coché sinon MIX") retombait TOUJOURS sur MIX dès qu'un
  // deuxième style était coché -- alors qu'accepter plusieurs styles pour
  // RECEVOIR un défi n'a rien à voir avec le style utilisé quand JE lance
  // moi-même une invite. Le premier style réel coché (ordre de sélection,
  // MIX ignoré s'il y en a un autre) fait foi pour mes propres invites ;
  // MIX ne reste le style envoyé que si rien d'autre n'est coché.
  React.useEffect(() => {
    const real = myPreferredThemes.filter((c) => c !== 'MIX');
    setThemeCode(real.length ? real[0] : 'MIX');
  }, [myPreferredThemes]);
  const toggleMyPreferredTheme = (code: string) => {
    setMyPreferredThemes((rows) => {
      if (code === 'MIX') return ['MIX'];
      const real = rows.filter((item) => item !== 'MIX');
      if (!real.includes(code) && real.length >= 3) {
        Alert.alert('3 styles maximum', 'Choisis jusqu’à 3 styles : le Solo et les Battles les mélangeront réellement pendant la partie.');
        return rows;
      }
      const has = rows.includes(code);
      const next = has ? real.filter((c) => c !== code) : [...real, code];
      return next.length ? next : ['MIX'];
    });
  };
  const confirmMyPreferences = () => {
    setPrefsPickerOpen(false);
    setPrefsSaving(true);
    saveMyMatchPreferences(myPreferredThemes, roundCount).catch(() => {}).finally(() => setPrefsSaving(false));
  };
  const [solo, setSolo] = React.useState<KeepBattleSoloPack | null>(null);
  const [soloIndex, setSoloIndex] = React.useState(0);
  const [soloAnswer, setSoloAnswer] = React.useState<string | null>(null);
  const [soloSelectedAnswer, setSoloSelectedAnswer] = React.useState<string | null>(null);
  const [soloScore, setSoloScore] = React.useState(0);
  const [previewStartSec, setPreviewStartSec] = React.useState(12);
  const [noVoiceBusy, setNoVoiceBusy] = React.useState(false);
  const noVoiceInFlight = React.useRef(false);
  const previewPosition = battlePreviewPositionMillis(previewStartSec);
  const [soloFinished, setSoloFinished] = React.useState(false);
  const [soloStartedAt, setSoloStartedAt] = React.useState(0);
  const [soloBefore, setSoloBefore] = React.useState<number | null>(null);
  const [soloAfter, setSoloAfter] = React.useState<number | null>(null);
  const [soloFreeEarned, setSoloFreeEarned] = React.useState(0);
  // Adel (28/09/2026) : FIXE ERR-BATTLE-SOLO-TIMEOUT-CREDIT-036
  // Tracker toutes les réponses (correct/incorrect/timeout) pour détecter
  // les parties "all-timeout" et éviter de débiter la mise quand l'utilisateur
  // n'a jamais interagi.
  const [soloResponses, setSoloResponses] = React.useState<string[]>([]);
  // Détection d'absence : après deux manches consécutives sans réponse, Loki
  // demande explicitement si le joueur est toujours présent. La fenêtre reste
  // 40 s avant arrêt automatique ; un simple « Je suis là ! » reprend la partie.
  const [idlePromptAt, setIdlePromptAt] = React.useState<number | null>(null);
  const [idleResumeIndex, setIdleResumeIndex] = React.useState(0);
  // Adel (20/09/2026) : BUG RÉEL rapporté ("41 → +3 → 41", le message
  // affichait un gain jamais réellement crédité). soloAfter est déjà
  // rechargé depuis le serveur (pas une estimation), mais rien ne
  // vérifiait que le solde avait VRAIMENT bougé du montant attendu avant
  // d'afficher "Tu as gagné" -- si record_completion/report_result
  // échouaient silencieusement (RLS, réseau...), le message mentait quand
  // même sur la foi du seul calcul local. Score parfait + crédit non
  // confirmé par le delta réel -> ce nouvel état pilote un message honnête
  // au lieu d'un faux "gagné".
  const [soloCreditPending, setSoloCreditPending] = React.useState(false);
  // Adel (02/09/2026) : "la première musique ça fonctionne, la deuxième ça
  // bloque, pas de son, et ça répond automatiquement tout seul" -- BUG RÉEL
  // confirmé en direct (instrumentation HTMLMediaElement.pause/play) : à
  // chaque avance de manche, DEUX effets React qui dépendent tous les deux de
  // soloIndex s'exécutent dans le même cycle de rendu. Le premier (démarrage
  // de la manche) remet audioReady/soloStartedAt à zéro via setState -- mais
  // le second (détection de timeout), déjà en file pour ce même cycle, a
  // capturé la valeur DE L'ANCIEN rendu (audioReady=true, soloStartedAt =
  // l'horodatage de la manche précédente, vieux de 10+ secondes). Son calcul
  // de temps restant tombe alors à 0 par erreur et déclenche un faux timeout
  // instantané -- qui coupe le son de la manche qui vient tout juste de
  // démarrer et répond "trop tard" à la place de l'utilisateur. Un ref
  // (toujours à jour de façon synchrone, contrairement à un state) permet à
  // l'effet de timeout de lire la VRAIE valeur courante au lieu de sa propre
  // fermeture obsolète.
  const soloStartedAtRef = React.useRef(0);
  // Le quota ne s'engage qu'après le premier extrait réellement joué.
  // Le token est aussi envoyé au serveur : même si React relance l'effet ou
  // si le réseau retry, une session ne peut jamais compter deux fois.
  const soloDailySessionTokenRef = React.useRef('');
  const soloDailyConsumedRef = React.useRef(false);
  // Une URL audio iOS morte ne doit jamais laisser les quatre réponses
  // bloquées. Une seule tentative de remplacement automatique par manche.
  const soloAudioReplacementRef = React.useRef(new Set<string>());
  const [soloDailyStarted, setSoloDailyStarted] = React.useState(false);
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
  // Adel (02/09/2026) : "chaque fois que je veux fermer ça revient toujours
  // là" -- l'écran de fin de match se rouvrait tout seul après un clic sur
  // × ou ‹. Cause : le sondage `refreshArena` toutes les 300ms peut avoir un
  // appel réseau déjà en vol au moment du clic ; sa résolution arrivait
  // APRÈS `setArena(null)` et réécrasait le null avec l'ancienne arène
  // terminée. Cette ref est la source de vérité "id d'arène actuellement
  // affiché" mise à jour de façon SYNCHRONE (pas via un effet, trop lent
  // face à un `.then()` déjà en attente) à chaque fermeture explicite ;
  // `refreshArena` compare sa réponse à cette ref avant de l'appliquer et
  // jette le résultat si l'utilisateur est déjà sorti entre-temps.
  const arenaIdLiveRef = React.useRef<string | null>(null);
  // Audit multi-agent 07/09/2026 : plusieurs handlers déclenchés par un tap
  // (openOnline, openPlayerStats...) appliquaient un setState après un await
  // sans vérifier que le composant est toujours monté (ex: l'utilisateur a
  // quitté l'onglet Soirées pendant l'appel réseau).
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => { mountedRef.current = false; }, []);
  const [arena, setArenaState] = React.useState<KeepBattleArenaState | null>(null);
  const [groupStandingsOpen, setGroupStandingsOpen] = React.useState(false);
  React.useEffect(() => { setGroupStandingsOpen(false); }, [arena?.id, arena?.matchNo, arena?.currentRound]);
  const setArena = React.useCallback((next: KeepBattleArenaState | null | ((prev: KeepBattleArenaState | null) => KeepBattleArenaState | null)) => {
    setArenaState((prev) => {
      const value = typeof next === 'function' ? (next as (p: KeepBattleArenaState | null) => KeepBattleArenaState | null)(prev) : next;
      arenaIdLiveRef.current = value?.id ?? null;
      return value;
    });
  }, []);
  const [livePlayers, setLivePlayers] = React.useState<KeepBattleLivePlayer[]>([]);
  // Adel (07/09/2026) : "à chaque fois qu'il y a le nom d'un utilisateur, je
  // veux la certification" -- y compris "Joueurs disponibles", pas seulement
  // le classement. Calculé en direct (jamais figé), même RPC que partout
  // ailleurs dans l'appli.
  const [livePlayerTiers, setLivePlayerTiers] = React.useState<Record<string, ProfileCertificationTier>>({});
  React.useEffect(() => {
    const ids = Array.from(new Set(livePlayers.map((p) => p.profileId).filter(Boolean)));
    if (!ids.length || !supabase) return;
    let live = true;
    Promise.resolve(supabase.rpc('keep_public_certification_tiers', { p_profile_ids: ids })).then(({ data }: any) => {
      if (!live || !Array.isArray(data)) return;
      setLivePlayerTiers((prev) => ({ ...prev, ...Object.fromEntries(data.map((r: any) => [String(r.profile_id), r.certification_tier as ProfileCertificationTier])) }));
    }).catch(() => {});
    return () => { live = false; };
  }, [livePlayers]);
  const [incoming, setIncoming] = React.useState<KeepBattleIncomingChallenge[]>([]);
  // Adel (03/09/2026) : "quand j'appuie sur revanche, pareil, ça me met une
  // invite fixe" -- même sondage que `incoming` (défi frais), pour les
  // membres qui n'ont pas l'arène ouverte (accueil Battle, "Joueurs
  // disponibles") : une revanche à laquelle je n'ai pas encore répondu.
  // Priorité au défi frais si les deux existaient en même temps (rare).
  const [pendingRematch, setPendingRematch] = React.useState<KeepBattlePendingRematch[]>([]);
  const [rematchBannerBusyId, setRematchBannerBusyId] = React.useState<string | null>(null);
  const [browseOnline, setBrowseOnline] = React.useState(false);
  // Adel (03/09/2026) : "un utilisateur pourra regarder le match en cours en
  // tant que visiteur ... et pouvoir dire je veux participer sans envoyer
  // d'invite, quand le match est terminé ça fera rentrer l'utilisateur" --
  // mode spectateur, inspiré des lives multi-invités (TikTok). openSalons
  // liste les matchs en direct ("Joueurs disponibles" -> MATCHS EN DIRECT) ;
  // spectating porte l'état en lecture seule d'UN match suivi, sondé comme
  // le reste de l'écran. Rejoindre ("+") réutilise joinKeepBattleArena, déjà
  // câblé côté serveur pour mettre en file d'attente (QUEUED) puis faire
  // entrer automatiquement au match suivant.
  const [openSalons, setOpenSalons] = React.useState<KeepBattleOpenSalon[]>([]);
  const [spectating, setSpectating] = React.useState<KeepBattleArenaSpectate | null>(null);
  // Adel (04/09/2026) : "les utilisateurs il faut qu'ils voient les Free
  // restant, leur crédit Free lors des matchs" -- solde visible pendant un
  // match (pas seulement sur son profil), même source unifiée que partout
  // ailleurs (keep_battle_credit_status -> remainingFree).
  const [myCreditStatus, setMyCreditStatus] = React.useState<KeepBattleCreditStatus | null>(null);
  // Adel (28/09/2026) : "je veux que on indique combien de solo par jour,
  // chaque utilisateur a droit de faire et que ça dise dans combien de temps
  // il faut que ce soit indiqué quelque part" -- statut quotidien chargé au
  // démarrage et à chaque retour sur l'écran Battle, affiché sous le bouton
  // SOLO avec le quota et le temps de renouvellement.
  const [soloDailyStatus, setSoloDailyStatus] = React.useState<{ plan?: string; limit: number | null; remaining: number | null; unlimited: boolean; resetsAt?: string | null } | null>(null);
  // Adel (02/10/2026) : packs de Solos (10 / 25…) achetés en Free quand les
  // Solos du jour sont épuisés ; ils s'ajoutent et ne se perdent pas.
  const [soloPacksOpen, setSoloPacksOpen] = React.useState(false);
  const [soloPacks, setSoloPacks] = React.useState<KeepBattleSoloPacks | null>(null);
  const [soloPackBusy, setSoloPackBusy] = React.useState<string | null>(null);
  const openSoloPacks = React.useCallback(async () => {
    try {
      const packs = await loadKeepBattleSoloPacks();
      if (!packs) {
        Alert.alert('Acheter des Solos', 'Les packs de Solos arrivent très bientôt. Le Battle en ligne reste disponible avec tes Free.');
        return;
      }
      setSoloPacks(packs);
      setSoloPacksOpen(true);
    } catch {
      Alert.alert('Acheter des Solos', 'Impossible de charger les packs pour le moment. Réessaie dans un instant.');
    }
  }, []);
  const soloExhausted = Boolean(soloQuotaCopy(soloDailyStatus)?.exhausted);
  // Robot coach (Adel, 05/10/2026) : plus de Solo -> le robot le dit de temps en temps (cooldown 6 h, 2 par jour), sans prise de tête.
  React.useEffect(() => { if (soloExhausted) void robotSay('NO_SOLO'); }, [soloExhausted]);
  React.useEffect(() => {
    if (!soloExhausted || soloPacks) return;
    let live = true;
    void loadKeepBattleSoloPacks().then((packs) => { if (live && packs) setSoloPacks(packs); }).catch(() => {});
    return () => { live = false; };
  }, [soloExhausted, soloPacks]);
  const buySoloPack = (pack: KeepBattleSoloPackOffer) => {
    if (soloPackBusy) return;
    Alert.alert(
      `${pack.solos} Solos`,
      `${pack.free} Free seront retirés une seule fois pour créditer ${pack.solos} Solos immédiatement. Chaque Solo acheté reste disponible jusqu’à utilisation. Quand le pack est épuisé, tu peux en racheter un.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: `ACHETER · ${pack.free} FREE`, onPress: () => {
          setSoloPackBusy(pack.code);
          void buyKeepBattleSoloPack(pack.code)
            .then(async (result) => {
              const [status, credit, packs] = await Promise.all([
                loadKeepBattleSoloDailyStatus().catch(() => null),
                loadBattleCreditStatusIfAuthenticated().catch(() => null),
                loadKeepBattleSoloPacks().catch(() => null),
              ]);
              if (status) setSoloDailyStatus(status);
              if (credit) setMyCreditStatus(credit);
              if (packs) setSoloPacks(packs);
              setSoloPacksOpen(false);
              Alert.alert('Pack Solo crédité', `+${result.solosAdded} Solos ajoutés immédiatement. Il te reste ${result.balance} Free.`);
            })
            .catch((e: any) => {
              const message = String(e?.message || '');
              Alert.alert('Acheter des Solos', message.includes('NOT_ENOUGH_FREE') ? `Il te faut ${pack.free} Free pour ce pack.` : 'L’achat n’a pas abouti. Aucun Free n’a été débité, réessaie dans un instant.');
            })
            .finally(() => setSoloPackBusy(null));
        } },
      ],
    );
  };
  // Adel (29/09/2026) : compteurs secondaires (Victoires, Matchs, Bonnes
  // rép., Abonnés) repliés derrière PLUS, comme sur le profil.
  const [statsExpanded, setStatsExpanded] = React.useState(false);
  const [freeRecharge, setFreeRecharge] = React.useState<string | null>(null);
  // Adel (19/09/2026) : "afficher les compteurs du joueur sur l'écran de
  // sélection BATTLE, entre le texte '10 secondes réelles...' et le bouton
  // 'JOUER SOLO'" -- ses stats (victoires, matchs, bonnes réponses, etc.)
  // chargées une fois au démarrage.
  const [myPlayerStats, setMyPlayerStats] = React.useState<KeepBattlePlayerStats | null>(null);
  // Adel (07/09/2026) : "un utilisateur a 4 Free et veut faire un 30 ... il
  // faut lui dire crédit insuffisant" -- jamais pour un CREATOR_PRO/VENUE_PRO
  // (hasPaidBattleAccess), qui joue sans jamais débiter de Free.
  const insufficientForRoundCount = React.useCallback((n: number) => (
    Boolean(myCreditStatus) && myCreditStatus!.hasPaidBattleAccess !== true && myCreditStatus!.remainingFree < stakeForRounds(n)
  ), [myCreditStatus]);
  // Adel (09/09/2026) : "j'ai envoye une invite a un utilisateur qui n'a pas
  // assez de Free, pourquoi il est visible ?" -- meme calcul que pour soi,
  // applique a l'adversaire de la liste "Joueurs disponibles" pour le nombre
  // de morceaux actuellement selectionne.
  const opponentNeedsMoreFree = React.useCallback((player: KeepBattleLivePlayer, rounds: number) => (
    player.hasPaidAccess !== true && player.remainingFree < stakeForRounds(rounds)
  ), []);
  const insufficientForOpponent = React.useCallback((player: KeepBattleLivePlayer) => (
    opponentNeedsMoreFree(player, roundCount)
  ), [opponentNeedsMoreFree, roundCount]);
  const [spectateJoinBusy, setSpectateJoinBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [soloSavePrompt, setSoloSavePrompt] = React.useState<{ costLine: string | null } | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [audioReady, setAudioReady] = React.useState(false);
  // Une panne audio TestFlight ne doit JAMAIS compter comme une réponse ni
  // faire avancer la partie. Ce nonce relance simplement la même manche
  // après une courte pause, jusqu'à ce qu'un extrait soit réellement audible.
  const [soloAudioRetryNonce, setSoloAudioRetryNonce] = React.useState(0);
  const [respondingChallengeId, setRespondingChallengeId] = React.useState<string | null>(null);
  const [incomingDecisionReady, setIncomingDecisionReady] = React.useState(false);
  React.useEffect(() => {
    setIncomingDecisionReady(false);
    if (!incoming[0]?.id) return undefined;
    const timer = setTimeout(() => setIncomingDecisionReady(true), 700);
    return () => clearTimeout(timer);
  }, [incoming[0]?.id]);
  const [arenaInviteOpen, setArenaInviteOpen] = React.useState(false);
  const [arenaInviteBusyId, setArenaInviteBusyId] = React.useState<string | null>(null);
  // Adel (02/09/2026) : "quand quelqu'un envoie une invite, il faut que le
  // bouton change de couleur pour ne pas pouvoir appuyer plusieurs fois tant
  // qu'il n'a pas la réponse" -- évite les doubles envois pendant l'aller-
  // retour réseau.
  const [challengeBusyId, setChallengeBusyId] = React.useState<string | null>(null);
  // Adel (04/09/2026) : "j'ai envoyé des invites, on voit pas le troisième
  // joueur ... j'ai juste à envoyer une invite comme ça je puisse en
  // envoyer plusieurs [dans le même match]" -- BUG RÉEL confirmé en base :
  // taper BATTLE sur 2 personnes différentes créait 2 matchs 1 contre 1
  // séparés, jamais un seul match à plusieurs -- "Joueurs disponibles"
  // n'a jamais regroupé plusieurs invites dans la même arène. Le premier
  // appui crée maintenant une arène de groupe ; tant qu'elle reste ouverte
  // (WAITING, pas encore pleine), les appuis suivants ajoutent la personne
  // dans CETTE MÊME arène au lieu d'en recréer une nouvelle.
  const [buildingArenaId, setBuildingArenaId] = React.useState<string | null>(null);
  // (21/09/2026) : la sélection multiple "Démarrer la Battle" appelle
  // `challenge()` plusieurs fois d'affilée pour le même salon en cours de
  // construction. `challenge()` lisait jusqu'ici `buildingArenaId` depuis
  // la fermeture React (figée au rendu), correct tant que chaque appui
  // venait d'un tap utilisateur séparé (un re-rendu entre deux), mais faux
  // en boucle programmatique : la 2e invite ne verrait pas encore l'arène
  // créée par la 1re et en recréerait une nouvelle -- exactement le bug
  // "un match par joueur" que ce système existant corrigeait déjà pour le
  // cas d'un tap à la fois. Une ref lue/écrite en même temps que le state
  // reste à jour de façon synchrone, y compris entre deux `await` sans
  // re-rendu entre les deux.
  const buildingArenaIdRef = React.useRef<string | null>(null);
  const setBuildingArena = React.useCallback((id: string | null) => {
    buildingArenaIdRef.current = id;
    setBuildingArenaId(id);
  }, []);
  // Adel (02/09/2026) : "que l'utilisateur sache qu'il y a une invite qui
  // est partie" -- le bouton BATTLE ne montrait "ENVOI…" que pendant la
  // requête elle-même (quelques centaines de ms), puis redevenait un simple
  // bouton BATTLE identique à avant, sans aucun signe que l'invite était
  // bien partie et en attente d'une réponse. Dérivé du même sondage outbox
  // déjà utilisé pour les alertes refusé/expiré -- aucune requête en plus.
  const [outgoingPendingTargetIds, setOutgoingPendingTargetIds] = React.useState<Set<string>>(new Set());
  const [outgoingPendingByTarget, setOutgoingPendingByTarget] = React.useState<Record<string, KeepBattleOutgoingChallenge>>({});
  const [cancelChallengeBusyId, setCancelChallengeBusyId] = React.useState<string | null>(null);
  // Adel (03/09/2026) : "l'utilisateur verra dans combien de minutes il
  // pourra renvoyer une invite" -- profileId -> instant exact de déblocage
  // (ms epoch), lu depuis le message d'erreur serveur. Rendu vivant via
  // `now`, qui tourne déjà toutes les 100ms sur cet écran (voir plus bas) :
  // pas de minuteur supplémentaire à gérer/nettoyer.
  const [inviteBlockedUntil, setInviteBlockedUntil] = React.useState<Record<string, number>>({});
  const [arenaInvitedIds, setArenaInvitedIds] = React.useState<string[]>([]);
  const [winnerHistory, setWinnerHistory] = React.useState<KeepBattleArenaWinner[]>([]);
  // Adel (02/09/2026) : "un endroit où l'utilisateur peut mettre son numéro
  // de classement avec son petit ... si il gagne, il aura pris quelque chose
  // sur son Design" -- petit badge de classement global à côté du joueur
  // dans "Joueurs disponibles", sans changer la mise en page existante.
  const [leaderboardRank, setLeaderboardRank] = React.useState<Record<string, number>>({});
  const [mySoloRank, setMySoloRank] = React.useState<KeepBattleSoloRank | null>(null);
  const [soloRankDelta, setSoloRankDelta] = React.useState(0);
  const arenaPlayedTracksRef = React.useRef<Map<string, ArenaPlayedTrack>>(new Map());
  const [arenaSessionId, setArenaSessionId] = React.useState<string | null>(null);
  const [rematchResponding, setRematchResponding] = React.useState(false);
  const [rematchParticipants, setRematchParticipants] = React.useState<KeepBattleRematchParticipant[]>([]);
  const [rematchCancelBusy, setRematchCancelBusy] = React.useState(false);
  const pulse = React.useRef(new Animated.Value(1)).current;
  const versusOpacity = React.useRef(new Animated.Value(0)).current;
  const versusScale = React.useRef(new Animated.Value(.72)).current;
  const celebrationOpacity = React.useRef(new Animated.Value(0)).current;
  const celebrationScale = React.useRef(new Animated.Value(.72)).current;
  // Adel (03/09/2026) : "la jauge animée qui épouse du côté du gagnant" --
  // la barre VS sautait instantanément à sa nouvelle largeur à chaque bonne
  // réponse au lieu de glisser vers le côté qui prend l'avantage, comme les
  // jauges de PK en direct (TikTok). Une seule valeur animée, réutilisée
  // pour l'arène en direct ET le mode spectateur.
  const powerShareAnim = React.useRef(new Animated.Value(50)).current;
  const arenaLeaderboardKey = arena ? (arena.leaderboard || []).map((l) => `${l.profileId}:${l.score}`).join(',') : '';
  React.useEffect(() => {
    if (!arena) return;
    const players = (arena.leaderboard?.length ? arena.leaderboard : arena.seats) || [];
    const teamA = players.filter((_, index) => index % 2 === 0);
    const teamB = players.filter((_, index) => index % 2 === 1);
    const scoreA = teamA.reduce((sum, player) => sum + Number((player as any)?.score || 0), 0);
    const scoreB = teamB.reduce((sum, player) => sum + Number((player as any)?.score || 0), 0);
    const sum = scoreA + scoreB;
    const share = sum === 0 ? 50 : Math.max(12, Math.min(88, (scoreA / sum) * 100));
    Animated.timing(powerShareAnim, { toValue: share, duration: 480, useNativeDriver: false }).start();
  }, [arenaLeaderboardKey, arena, powerShareAnim]);

  const celebrate = React.useCallback(() => {
    celebrationOpacity.setValue(0);
    celebrationScale.setValue(.72);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(celebrationOpacity, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(celebrationScale, { toValue: 1.08, friction: 4, tension: 90, useNativeDriver: Platform.OS !== 'web' }),
      ]),
      Animated.spring(celebrationScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [celebrationOpacity, celebrationScale]);

  // Adel (04/09/2026) : "il faudra vraiment marquer en gros les points
  // gagnés, un truc qui clignote comme une sorte de jackpot à la fin du
  // match" -- pulsation continue (couleur + léger zoom) tant que l'écran de
  // fin est affiché, en boucle, arrêtée proprement au démontage.
  const jackpotBlink = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(jackpotBlink, { toValue: 1, duration: 420, useNativeDriver: false }),
      Animated.timing(jackpotBlink, { toValue: 0, duration: 420, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [jackpotBlink]);
  const jackpotScoreStyle = {
    color: jackpotBlink.interpolate({ inputRange: [0, 1], outputRange: ['#E5F266', '#FFD84D'] }),
    transform: [{ scale: jackpotBlink.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
  };

  React.useEffect(() => { void loadKeepBattleThemes().then((rows) => rows.length && setThemes(rows)).catch(() => {}); }, []);
  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, []);
  // Adel (28/09/2026) : charger le statut quotidien SOLO au démarrage et
  // quand on revient sur l'écran (enabled change). Affichage en temps réel
  // via le minuteur `now` existant (toutes les 100ms).
  // Adel (29/09/2026) : le compteur « Solos : X / 10 » doit bouger dès qu'une
  // partie est lancée ou quittée -- il n'était relu qu'à l'ouverture de
  // l'écran. On le relit aussi à chaque retour à l'accueil Battle (solo null).
  React.useEffect(() => {
    if (!enabled || solo) return;
    let active = true;
    void loadKeepBattleSoloDailyStatus().then((status) => {
      if (active) setSoloDailyStatus(status);
      const profileId = useUserStore.getState().user?.id;
      if (!profileId) return;
      void loadMyFreeRechargeInfo(profileId, status.plan || 'FREE').then((info) => {
        if (active) setFreeRecharge(formatFreeRecharge(nextMonthlyFreeRecharge(info.profileCreatedAt), info.monthlyBonus));
      }).catch(() => {});
    }).catch(() => { if (active) setSoloDailyStatus(null); });
    return () => { active = false; };
  }, [enabled, solo]);
  // Adel (29/09/2026) : déclare un Solo EN COURS (pas l'accueil, pas l'écran
  // de fin) à la garde centrale de sortie, avec le message exact de débit ;
  // et arrête proprement le Solo si la sortie est confirmée depuis ailleurs
  // (barre d'onglets). Le Battle en ligne n'est pas concerné.
  const soloInProgress = Boolean(solo && !soloFinished);
  const onlineInProgress = Boolean(arena && arena.me?.status === 'ACTIVE' && (arena.status === 'WAITING' || arena.status === 'ACTIVE'));
  React.useEffect(() => {
    if (soloInProgress) {
      useGameSessionStore.getState().setGameInProgress(true, 'SOLO', soloQuitNotice(soloDailyStatus));
    } else if (onlineInProgress) {
      useGameSessionStore.getState().setGameInProgress(true, 'EN_LIGNE', 'Tu es engagé dans ce Battle. Pour sortir, utilise QUITTER LE BATTLE.', arena?.id);
    } else {
      useGameSessionStore.getState().clearGameSession();
    }
  }, [onlineInProgress, soloInProgress, soloDailyStatus]);
  // Ne pas oublier un Battle EN LIGNE lors d'un démontage accidentel
  // (changement d'onglet, retour système, reprise après background). Le siège
  // reste ACTIVE côté serveur : garder l'identité de l'arène permet au shell
  // global de remettre immédiatement le joueur dans le Battle. Le Solo garde
  // l'ancien nettoyage local.
  React.useEffect(() => () => {
    const game = useGameSessionStore.getState();
    if (game.gameMode !== 'EN_LIGNE') game.clearGameSession();
  }, []);
  const quitRequest = useGameSessionStore((st) => st.quitRequest);
  const handledQuitRequest = React.useRef(quitRequest);
  React.useEffect(() => {
    if (quitRequest === handledQuitRequest.current) return;
    handledQuitRequest.current = quitRequest;
    if (arena?.id && onlineInProgress) {
      const arenaId = arena.id;
      setArena(null);
      void stopTrackPreview();
      void leaveKeepBattleArena(arenaId).catch(() => {});
      return;
    }
    setSolo(null); void stopTrackPreview(); void leaveSoloBattle().catch(() => {});
  }, [arena?.id, onlineInProgress, quitRequest, setArena]);
  // Adel (02/09/2026) : "ici aussi tu peux mettre l'invite" -- signale à
  // GlobalNotificationBanner que l'écran Battle est réellement à l'écran
  // (pas juste "on est sur l'onglet Soirées"), pour qu'il ne masque son
  // bandeau que quand celui-ci prend vraiment le relais.
  React.useEffect(() => {
    useBattleAvailabilityStore.getState().setBattleScreenOpen(true);
    return () => useBattleAvailabilityStore.getState().setBattleScreenOpen(false);
  }, []);
  React.useEffect(() => () => { void stopTrackPreview(); discardPreloadedTrackPreview(); void leaveSoloBattle().catch(() => {}); }, []);

  const themeLabel = (code: string) => themes.find((t) => t.code === code)?.label || code;
  // Adel : "les boutons, il faut uniquement le nom de l'artiste" -- certains
  // morceaux (bandes originales, compilations) ont un crédit complet avec
  // une dizaine de featurings ("Lisa Gerrard, Gavin Greenaway, The Lyndhurst
  // Orchestra, ... & Hans Zimmer"), illisible sur un bouton de réponse.
  // Affichage uniquement : on coupe au premier séparateur de featuring, la
  // VALEUR envoyée à answerSolo/answerArena (donc la correction) reste le
  // texte complet, intact.
  // Adel (05/09/2026) : "c'est pas un nom ça, c'est pas possible que le nom
  // soit aussi long ... ça casse le Design ... robuste pour que plus ça ne
  // revienne" -- BUG RÉEL confirmé sur capture : "Darell/Nicky Jam/Ozuna/Nio
  // Garcia/Casper Mágico" (crédit posse-cut réel) traversait intact car "/"
  // n'était pas dans la liste de séparateurs. Ajout de "/", "+" et "vs" en
  // plus des séparateurs déjà gérés, PLUS un plafond de secours en
  // caractères : même un futur format de séparateur jamais vu ne pourra
  // plus jamais casser un bouton. Ne touche jamais à `choice`/`round.artist`
  // (la vraie valeur comparée pour la correction) -- uniquement l'affichage.
  const primaryArtistLabel = (full: string) => {
    const first = full.split(/\s*(?:,|&|\/|\+|\bfeat\.?\b|\bft\.?\b|\bx\b|\bet\b|\band\b|\bvs\.?\b)\s*/i)[0]?.trim() || full;
    return first.length > 28 ? `${first.slice(0, 26).trim()}…` : first;
  };
  // Toujours afficher 4 boutons quand le serveur fournit 4 choix distincts.
  // Certains crédits différents ont le même "premier artiste" après
  // raccourcissement (ex. "Reda Taliani & Mr" / "Reda Taliani"). Dans ce cas
  // seulement, on réaffiche une version compacte du crédit complet pour que
  // les deux boutons restent distincts et compréhensibles.
  const answerChoiceLabel = (choice: string, choices: string[]) => {
    const short = primaryArtistLabel(choice);
    const sameShort = choices.filter((item) => primaryArtistLabel(item).toLocaleLowerCase() === short.toLocaleLowerCase()).length;
    if (sameShort <= 1) return short;
    const full = String(choice || '').trim();
    return full.length > 30 ? `${full.slice(0, 28).trim()}…` : full;
  };
  // Statut quotidien SOLO : texte produit par soloQuotaCopy (battleHomeInfo).
  // Adel (02/09/2026) : "avoir vraiment une catégorie de joueurs" -- petit
  // repère visuel du palier (voir keep_battle_skill_tier côté serveur),
  // affiché là où on choisit un adversaire.
  const tierLabel = (tier?: string) => tier === 'EXPERT' ? '👑 Expert' : tier === 'CONFIRME' ? '⭐ Confirmé' : '🌱 Débutant';
  const animateResult = React.useCallback(() => {
    pulse.setValue(.96);
    Animated.spring(pulse, { toValue: 1, friction: 5, tension: 110, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [pulse]);
  const animateVersus = React.useCallback(() => {
    versusOpacity.setValue(0); versusScale.setValue(.72);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(versusOpacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(versusScale, { toValue: 1, friction: 4, tension: 95, useNativeDriver: Platform.OS !== 'web' }),
      ]),
      Animated.delay(1100),
      Animated.timing(versusOpacity, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [versusOpacity, versusScale]);

  // Adel (28/09/2026) : FIXE ERR-BATTLE-SOLO-TIMEOUT-CREDIT-036
  // Centraliser l'enregistrement des réponses solo pour détecter les
  // parties "all-timeout" et éviter le débit injustifié.
  const recordSoloAnswer = React.useCallback((response: string) => {
    setSoloAnswer(response);
    setSoloResponses((prev) => [...prev, response]);
  }, []);

  // Adel (04/09/2026) : "il faut que je revienne au moins quatre fois pour
  // qu'il arrête de me retourner dessus" -- BUG RÉEL confirmé en lisant le
  // code : `initialArenaId` vient du parent (PartiesScreen.pendingArenaId)
  // et n'est remis à zéro que par le bouton "Ouvrir le Salon" ou par
  // `onExit`/`onOpenSession` -- mais quitter UN salon depuis l'intérieur
  // (‹, QUITTER LE BATTLE) ne notifiait jamais le parent. Résultat : la
  // même valeur restait active et relançait ce même salon à chaque fois
  // que `enabled` redevenait vrai (retour sur l'onglet Soirées), quel que
  // soit le nombre de fois où l'utilisateur quittait. Un id déjà consommé
  // une fois ne relance plus jamais tout seul.
  const consumedInitialArenaIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!enabled || !initialArenaId || consumedInitialArenaIdRef.current === initialArenaId) return;
    consumedInitialArenaIdRef.current = initialArenaId;
    let active = true;
    void (async () => {
      try {
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        const loaded = await loadKeepBattleArena(initialArenaId);
        if (!active) return;
        setSolo(null); setBrowseOnline(false); setAudioReady(false); setArena(loaded);
        void useBattleAvailabilityStore.getState().autoEnable().catch(() => {});
        animateVersus();
      } catch {
        if (active) Alert.alert('Battle', 'Impossible d’ouvrir ce salon. L’invitation a peut-être expiré.');
      }
    })();
    return () => { active = false; };
  }, [enabled, initialArenaId]);

  // Adel (04/09/2026) : "lorsqu'un utilisateur sans faire exprès passe sur
  // une autre page, il faut que lorsqu'il revienne automatiquement si il
  // est dans le match, il revienne même s'il a loupé un ou deux morceaux"
  // -- BUG RÉEL : changer d'onglet démonte tout ce panneau (voir
  // PartiesScreen `battleOpen`), perdant l'état local `arena`. Au premier
  // rendu utile (pas de initialArenaId précis, pas déjà en arène), on
  // vérifie une seule fois côté serveur si un siège ACTIVE existe encore
  // dans une arène WAITING/ACTIVE -- si oui on reprend directement dedans.
  // Si l'utilisateur a quitté proprement (‹ / QUITTER LE BATTLE), son siège
  // n'est plus ACTIVE et rien ne se relance tout seul.
  const checkedActiveArenaRef = React.useRef(false);
  React.useEffect(() => {
    if (!enabled || initialArenaId || arena || checkedActiveArenaRef.current) return;
    checkedActiveArenaRef.current = true;
    void loadMyActiveKeepBattleArena().then((active) => {
      if (!active) return;
      setSolo(null); setBrowseOnline(false); setAudioReady(false); setArena(active);
    }).catch(() => {});
  }, [enabled, initialArenaId, arena]);

  const playVerified = React.useCallback(async (key: string, url?: string | null, duration = ROUND_MS, positionMillis = 0, maxAttempts = 2): Promise<boolean> => {
    if (!url) return false;
    for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
      // Adel (22/09/2026, audit latence) : le premier essai garde `key` tel
      // quel (sans suffixe) pour pouvoir correspondre à un préchargement
      // lancé pendant la pause précédente (voir preloadTrackPreviewSegment /
      // scheduleNextRoundPreload) -- latence quasi nulle si déjà prêt. Seules
      // les vraies tentatives de reprise (essai raté) changent de clé, pour
      // forcer un chargement frais.
      const attemptKey = attempt === 0 ? key : `${key}:retry${attempt}`;
      try {
        await playTrackPreviewSegment(attemptKey, url, positionMillis, duration, undefined, undefined, true);
        return true;
      } catch {
        await wait(220 + attempt * 180);
      }
    }
    return false;
  }, []);

  const shareInvite = React.useCallback(async () => {
    const username = useUserStore.getState().user?.username;
    const link = username ? buildPublicProfileLink(username) : 'https://adelkhatra-bit.github.io/KEEP/';
    await shareBattleInvite('Viens me défier sur Loki Music Battle ⚡\n10 secondes · 4 choix · gagne des Free', link);
  }, []);
  const shareArenaInvite = React.useCallback(async (state: KeepBattleArenaState) => {
    const link = buildKeepBattleArenaInviteLink(state.arenaCode);
    await shareBattleInvite(`Rejoins notre Loki Music Battle ⚡\n${state.seats.length} joueur${state.seats.length > 1 ? 's' : ''} déjà dans le groupe`, link);
  }, []);

  const refreshSocial = React.useCallback(async () => {
    if (!enabled || arena) return;
    try {
      const [players, inbox, outbox, pendingRematches, salons] = await Promise.all([
        loadLiveSoloPlayers(20, roundCount),
        loadIncomingBattleChallenges(),
        loadOutgoingBattleChallenges(),
        loadPendingArenaRematches().catch(() => []),
        browseOnline ? loadOpenBattleSalons().catch(() => []) : Promise.resolve<KeepBattleOpenSalon[]>([]),
      ]);
      setLivePlayers(players);
      setIncoming(inbox);
      if (browseOnline) setOpenSalons(salons);
      setPendingRematch(pendingRematches);
      const pendingOutgoing = outbox.filter((x) => x.status === 'PENDING');
      setOutgoingPendingTargetIds(new Set(pendingOutgoing.map((x) => x.targetId)));
      setOutgoingPendingByTarget(Object.fromEntries(pendingOutgoing.map((x) => [x.targetId, x])));
      // Adel (03/09/2026) : "quand j'appuie sur la croix, ça revient
      // automatiquement ici" -- vrai bug trouvé : keep_battle_challenge_outgoing
      // renvoie l'historique des 10 dernières minutes, donc le DÉFI ACCEPTÉ qui a
      // lancé CE match reste visible ici bien après la fin du match. Avant, ce
      // même défi accepté redéclenchait l'entrée dans l'arène à CHAQUE sondage
      // (toutes les 650ms) tant qu'il restait dans cette fenêtre de 10 minutes --
      // fermer l'arène remettait `arena` à null, le sondage suivant retrouvait
      // ce même défi toujours "ACCEPTED" et rouvrait la même arène aussitôt,
      // rendant × et QUITTER inopérants en pratique. Un défi accepté ne doit
      // faire entrer dans l'arène qu'UNE seule fois.
      // Une réponse sociale ne doit JAMAIS interrompre une partie en cours.
      // L'entrée dans l'arène acceptée est différée jusqu'à la fin du Solo.
      const accepted = !solo ? outbox.find((x) => x.status === 'ACCEPTED' && x.arenaId && !autoJoinedChallengeIds.has(x.id)) : undefined;
      if (accepted?.arenaId) {
        autoJoinedChallengeIds.add(accepted.id);
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        setSolo(null); setBrowseOnline(false); setAudioReady(false);
        setArena(await loadKeepBattleArena(accepted.arenaId));
        animateVersus();
        return;
      }
      // Adel (02/09/2026) : "sa aussi pas logique" -- un popup "invitation
      // expirée/refusée" surgissait EN PLEIN MILIEU d'une manche solo en
      // cours (question affichée, chrono qui tourne), puisque ce tick
      // tourne toutes les 650ms sans se soucier de ce que l'utilisateur est
      // en train de faire. On retarde l'alerte tant qu'une manche solo est
      // activement en attente de réponse ; elle s'affichera dès que la
      // manche est répondue/révélée (prochain tick, id pas encore marqué
      // "handled" donc toujours dans la liste).
      // Adel (03/09/2026) : "pas répondu à une requête, c'est pas la peine
      // de l'envoyer ... pas nécessaire, faut pas lui mettre en plein milieu
      // de son Battle" -- une simple absence de réponse (EXPIRED) n'est plus
      // signalée du tout : rien d'actionnable pour l'utilisateur, contrairement
      // à un refus explicite (DECLINED), qui reste affiché une seule fois
      // (handledOutgoingIds) et jamais pendant une manche solo en cours.
      // Refus/expiration = aucun popup ni notification supplémentaire.
      // Le bouton redevient simplement disponible. Les décisions vraiment
      // actionnables restent les invitations entrantes.
      for (const feedback of outbox.filter((x) => x.status === 'DECLINED' && !handledOutgoingIds.has(x.id))) {
        handledOutgoingIds.add(feedback.id);
      }
    } catch {}
  }, [enabled, solo, soloAnswer, browseOnline, animateVersus, shareInvite, roundCount]);

  const cancelOutgoingChallenge = React.useCallback(async (item: KeepBattleOutgoingChallenge) => {
    if (!item?.id || cancelChallengeBusyId) return;
    setCancelChallengeBusyId(item.id);
    try {
      await cancelBattleChallenge(item.id);
      setOutgoingPendingTargetIds((current) => {
        const next = new Set(current);
        next.delete(item.targetId);
        return next;
      });
      setOutgoingPendingByTarget((current) => {
        const next = { ...current };
        delete next[item.targetId];
        return next;
      });
      if (arena?.id) {
        const [outbox, freshArena] = await Promise.all([
          loadOutgoingBattleChallenges().catch(() => []),
          loadKeepBattleArena(arena.id).catch(() => null),
        ]);
        const pendingOutgoing = outbox.filter((x) => x.status === 'PENDING');
        setOutgoingPendingTargetIds(new Set(pendingOutgoing.map((x) => x.targetId)));
        setOutgoingPendingByTarget(Object.fromEntries(pendingOutgoing.map((x) => [x.targetId, x])));
        setArenaInvitedIds(pendingOutgoing.filter((x) => x.arenaId === arena.id).map((x) => x.targetId));
        if (freshArena) setArena(freshArena);
      } else {
        await refreshSocial();
      }
    } catch (error: any) {
      const message = String(error?.message || error || '');
      if (arena?.id) {
        const outbox = await loadOutgoingBattleChallenges().catch(() => []);
        const pendingOutgoing = outbox.filter((x) => x.status === 'PENDING');
        setOutgoingPendingTargetIds(new Set(pendingOutgoing.map((x) => x.targetId)));
        setOutgoingPendingByTarget(Object.fromEntries(pendingOutgoing.map((x) => [x.targetId, x])));
      } else {
        await refreshSocial();
      }
      if (message.includes('BATTLE_CHALLENGE_ALREADY_ACCEPTED')) {
        Alert.alert('Battle', `${item.username} a déjà accepté. Le Battle va s’ouvrir automatiquement.`);
      } else if (!message.includes('NOT_CANCELLABLE')) {
        Alert.alert('Battle', 'Impossible d’annuler cette invitation pour le moment.');
      }
    } finally {
      setCancelChallengeBusyId(null);
    }
  }, [arena?.id, cancelChallengeBusyId, refreshSocial]);

  const requestCancelOutgoingChallenge = React.useCallback((item: KeepBattleOutgoingChallenge) => {
    const remaining = Math.max(0, new Date(item.expiresAt).getTime() - Date.now());
    Alert.alert(
      'Annuler cette invitation ?',
      `L’invitation envoyée à ${item.username} expire dans ${formatInviteCooldown(remaining)}. Tu peux l’annuler maintenant tant qu’elle n’a pas été acceptée.`,
      [
        { text: 'GARDER', style: 'cancel' },
        { text: 'ANNULER L’INVITE', style: 'destructive', onPress: () => { void cancelOutgoingChallenge(item); } },
      ],
    );
  }, [cancelOutgoingChallenge]);

  React.useEffect(() => {
    if (!arena?.id || arena.status !== 'WAITING') return undefined;
    let alive = true;
    const syncWaitingInvites = async () => {
      const [outbox, freshArena] = await Promise.all([
        loadOutgoingBattleChallenges().catch(() => []),
        loadKeepBattleArena(arena.id).catch(() => null),
      ]);
      if (!alive) return;
      const pendingOutgoing = outbox.filter((x) => x.status === 'PENDING');
      setOutgoingPendingTargetIds(new Set(pendingOutgoing.map((x) => x.targetId)));
      setOutgoingPendingByTarget(Object.fromEntries(pendingOutgoing.map((x) => [x.targetId, x])));
      setArenaInvitedIds(pendingOutgoing.filter((x) => x.arenaId === arena.id).map((x) => x.targetId));
      if (freshArena) setArena(freshArena);
    };
    void syncWaitingInvites();
    // Les changements d'invitation arrivent déjà via Realtime. Ce polling
    // ne sert que de filet de cohérence pour l'arène WAITING : jamais < 5 s.
    const timer = setInterval(() => { void syncWaitingInvites(); }, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [arena?.id, arena?.status]);

  React.useEffect(() => {
    if (!solo || arena) return;
    // Server truth for opponent cards: keep the current SOLO round fresh.
    void updateSoloPresenceTheme(solo.themeCode, Math.min(soloIndex + 1, solo.rounds.length), solo.rounds.length).catch(() => {});
  }, [arena?.id, solo?.themeCode, soloIndex, solo?.rounds.length]);

  React.useEffect(() => {
    if (!enabled || arena) return undefined;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (solo) await heartbeatSoloBattle(solo.themeCode, soloIndex, solo.rounds.length).catch(() => {});
      await refreshSocial();
    };
    void tick();
    // Les invitations/revanches arrivent déjà par Realtime via
    // GlobalNotificationBanner. Le polling du lobby n'est qu'un filet de
    // cohérence (joueurs présents, outbox, salons) : 650 ms lançait jusqu'à
    // cinq RPC en parallèle ~92 fois/minute par appareil et pouvait saturer
    // Postgres/Auth. 5 s garde le lobby frais sans menacer la connexion.
    const id = setInterval(() => { void tick(); }, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [enabled, solo?.themeCode, Boolean(solo), browseOnline, arena?.id, refreshSocial]);

  // Adel (03/09/2026) : mode spectateur -- sondage dédié, indépendant du
  // reste de l'écran (aucun besoin de livePlayers/incoming pendant qu'on
  // suit un match en lecture seule). Cadence plus lente (1.5s) : un
  // spectateur ne répond à rien, pas besoin de la précision seconde près
  // utilisée pour le vrai jeu.
  React.useEffect(() => {
    if (!spectating) return undefined;
    let alive = true;
    const code = spectating.arenaCode;
    const tick = async () => {
      if (!alive) return;
      try {
        const next = await spectateKeepBattleArena(code);
        if (alive) setSpectating(next);
      } catch {
        if (alive) setSpectating(null);
      }
    };
    const id = setInterval(() => { void tick(); }, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [spectating?.arenaCode]);

  const startSpectating = async (salon: KeepBattleOpenSalon) => {
    try {
      setSpectating(await spectateKeepBattleArena(salon.arenaCode));
    } catch (e: any) {
      Alert.alert('Battle', String(e?.message || 'Ce match n’est plus disponible.'));
    }
  };

  const joinSpectatedMatch = async () => {
    if (!spectating || spectateJoinBusy) return;
    unlockWebAudioForGesture();
    setSpectateJoinBusy(true);
    try {
      const result = await joinKeepBattleArena(spectating.arenaCode);
      await stopTrackPreview();
      await leaveSoloBattle().catch(() => {});
      setSolo(null); setBrowseOnline(false); setAudioReady(false); setSpectating(null);
      setArena(await loadKeepBattleArena(result.id));
      if (result.myStatus === 'QUEUED') Alert.alert('Battle', 'Le match est en cours : tu entres automatiquement au prochain.');
    } catch (e: any) {
      const message = String(e?.message || e || '').replace(/\\n/g, ' ');
      if (message.includes('MINIMUM_THREE_FREE_REQUIRED')) notEnoughFreeAlert(`Il te faut au moins ${parseRequiredFree(message, stakeForRounds(spectating?.roundCount || roundCount))} Free pour rejoindre ce Battle`);
      else Alert.alert('Battle', 'Impossible de rejoindre ce Battle pour le moment.');
    } finally {
      setSpectateJoinBusy(false);
    }
  };

  // Battle audio owns the speaker while a match is active. If Écouter was
  // already using the microphone, suspend only the capture (never the session
  // or its detected tracks) so iOS cannot leave AVAudioSession in
  // PlayAndRecord/receiver routing while a preview is supposed to be audible.
  // Restore the exact same listening session automatically when Battle ends.
  const battlePausedListeningRef = React.useRef(false);
  React.useEffect(() => {
    const battleAudioActive = Boolean(solo || arena);
    const listening = useSessionStore.getState();
    if (battleAudioActive) {
      if (listening.isActive && !listening.micPaused && !battlePausedListeningRef.current) {
        battlePausedListeningRef.current = true;
        listening.pauseListening();
      }
      return undefined;
    }
    if (battlePausedListeningRef.current) {
      battlePausedListeningRef.current = false;
      const current = useSessionStore.getState();
      if (current.isActive && current.micPaused) current.resumeListening();
    }
    return undefined;
  }, [Boolean(solo), Boolean(arena)]);

  // Si l'écran Battle est démonté brutalement (navigation, OTA, retour
  // système), ne jamais laisser Écouter suspendu définitivement.
  React.useEffect(() => () => {
    if (!battlePausedListeningRef.current) return;
    battlePausedListeningRef.current = false;
    const current = useSessionStore.getState();
    if (current.isActive && current.micPaused) current.resumeListening();
  }, []);

  React.useEffect(() => {
    const round = solo?.rounds[soloIndex];
    if (!round) return undefined;
    let alive = true;
    answeredRoundRef.current = -1;
    soloStartedAtRef.current = 0; setSoloStartedAt(0); setAudioReady(false);
    // Charger le Free avant la partie SOLO (première manche uniquement)
    if (soloIndex === 0 && soloBefore === null) {
      void loadBattleCreditStatusIfAuthenticated().then((status) => {
        if (alive && status && 'remainingFree' in status) setSoloBefore(Number(status.remainingFree ?? 0));
      });
    }
    const start = async () => {
      // TestFlight/iOS : pauseListening() met l'UI en pause immédiatement mais
      // l'arrêt natif du micro est asynchrone. Attendre ici la libération réelle
      // d'Audio.Recording + AVAudioSession AVANT de lancer la preview évite une
      // course où le son démarre encore en mode PlayAndRecord/receiver et devient
      // inaudible alors que expo-av le considère comme "playing".
      await cancelAudioCapture().catch(() => {});
      if (!alive) return;

      void activateBattleSoloRound(solo?.reportToken, soloIndex + 1, round.trackId).catch(() => {});
      // TestFlight : ne jamais multiplier les retries natifs. Un premier essai,
      // puis une ré-résolution de l'URL ; si les deux échouent, on remplace le
      // morceau au lieu de laisser les quatre réponses désactivées.
      let url = round.previewUrl;
      for (let cycle = 0; alive && cycle < 2; cycle += 1) {
        const cycleKey = cycle === 0 ? soloRoundPreviewKey(round.trackId, soloIndex) : `solo:${round.trackId}:${soloIndex}:fresh`;
        const ok = await playVerified(cycleKey, url, ROUND_MS + 800, previewPosition, 1);
        if (!alive) return;
        if (ok) {
          if (soloIndex === 0 && !soloDailyConsumedRef.current) {
            soloDailyConsumedRef.current = true;
            try {
              const consumed = await consumeKeepBattleSoloDailyStart(soloDailySessionTokenRef.current);
              if (!alive) return;
              setSoloDailyStarted(true);
              setSoloDailyStatus(consumed);
            } catch (error) {
              soloDailyConsumedRef.current = false;
              if (!alive) return;
              setSoloDailyStarted(false);
              await stopTrackPreview().catch(() => {});
              setSolo(null);
              showSoloStartError(error);
              return;
            }
          }
          setAudioReady(true);
          soloStartedAtRef.current = Date.now();
          setSoloStartedAt(soloStartedAtRef.current);
          return;
        }
        if (cycle === 0) {
          try {
            const fresh = await resolveTrackPreviewUrl(
              { id: round.trackId, title: round.title, artist: round.artist, previewUrl: url } as any,
              { forceRefresh: true },
            );
            if (fresh) url = fresh;
          } catch {}
          await wait(250);
        }
      }
      if (!alive) return;

      const replacementKey = `${soloDailySessionTokenRef.current}:${soloIndex}`;
      if (!solo?.reportToken && !soloAudioReplacementRef.current.has(replacementKey)) {
        soloAudioReplacementRef.current.add(replacementKey);
        try {
          const replacementPack = await loadKeepBattleSoloPack('MIX', roundCount, myPreferredThemes);
          if (!alive) return;
          const alreadyUsed = new Set((solo?.rounds || []).slice(0, soloIndex + 1).map((item) => item.trackId));
          const replacement = replacementPack.rounds.find((item) => item.previewUrl && !alreadyUsed.has(item.trackId));
          if (replacement) {
            setSolo((previous) => previous ? {
              ...previous,
              rounds: previous.rounds.map((item, index) => index === soloIndex ? replacement : item),
            } : previous);
            return;
          }
        } catch {}
      }

      // Dernier filet iOS/TestFlight : une panne audio n'est PAS une
      // réponse du joueur et ne doit jamais faire passer à la manche suivante.
      // Tant que le son n'est pas confirmé, le chrono reste arrêté
      // (audioReady=false) et on relance LA MÊME manche automatiquement.
      console.warn(`[Battle SOLO] audio non confirmé manche ${soloIndex + 1}/${solo?.rounds.length} — retry même manche`);
      setAudioReady(false);
      soloStartedAtRef.current = 0;
      setSoloStartedAt(0);
      await wait(850);
      if (alive) setSoloAudioRetryNonce((value) => value + 1);
    };
    void start();
    return () => { alive = false; void stopTrackPreview(); };
  }, [solo?.themeCode, soloIndex, solo?.rounds[soloIndex]?.trackId, solo?.rounds[soloIndex]?.previewUrl, soloAudioRetryNonce, playVerified, recordSoloAnswer, animateResult, roundCount, myPreferredThemes, previewPosition]);

  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;
  const displayedSoloRemaining = soloRemaining;

  // BUG RÉEL (Adel, 02/09/2026 : "invitation expirée, il bloque, il faut
  // jamais que ça bloque comme ça, un utilisateur ne doit jamais rester
  // bloqué sur un popup") : le nettoyage d'une invitation expirée dépend du
  // prochain sondage serveur (toutes les 650ms) -- normalement rapide, mais
  // une seule requête réseau ratée/en retard suffit à laisser la bannière
  // "PAUSE" affichée avec un compte à rebours à 0s indéfiniment, la partie
  // solo restant figée tant que ce sondage n'a pas confirmé la disparition.
  // Filet de sécurité 100% local : dès que l'horloge locale (`now`, déjà
  // mise à jour toutes les 100ms) dépasse `expiresAt`, l'invitation est
  // retirée immédiatement sans attendre le serveur -- la partie ne peut
  // plus jamais rester en pause à cause d'une invitation qui a expiré.
  React.useEffect(() => {
    const item = incoming[0];
    if (!item) return;
    if (new Date(item.expiresAt).getTime() > now) return;
    setIncoming((rows) => rows.filter((x) => x.id !== item.id));
  }, [incoming, now]);

  // Les invitations restent en file d'attente pendant le Solo. Elles ne
  // mettent plus en pause la musique, le chrono ou les réponses.

  React.useEffect(() => {
    if (!solo || !audioReady || soloAnswer || noVoiceInFlight.current) return;
    // Adel (02/09/2026) : lit soloStartedAtRef (toujours à jour de façon
    // synchrone) plutôt que displayedSoloRemaining -- ce dernier peut encore
    // porter la valeur figée du rendu PRÉCÉDENT au moment précis où la manche
    // vient de changer (voir le commentaire sur soloStartedAtRef), ce qui
    // déclenchait un faux timeout instantané sur la manche qui vient de
    // démarrer. `now` reste en dépendance pour continuer à revérifier toutes
    // les ~100ms tant que la manche est réellement en cours.
    const startedAt = soloStartedAtRef.current;
    const remaining = startedAt ? Math.max(0, ROUND_MS - (Date.now() - startedAt)) : ROUND_MS;
    if (remaining > 0) return;
    if (answeredRoundRef.current === soloIndex) return; // un appui a déjà tranché ce round
    answeredRoundRef.current = soloIndex;
    recordSoloAnswer('__TIMEOUT__'); void stopTrackPreview(); animateResult();
  }, [solo, audioReady, soloAnswer, soloIndex, animateResult, recordSoloAnswer, now]);
  // Adel (05/10/2026) : « il faut que ce soit instantané » -- la manche N+1 est préchargée dès que la manche N JOUE (pas seulement après la réponse) :
  // le téléchargement a toute la durée de la manche pour se faire. Même clé que le préchargement après réponse (déjà-prêt = ignoré).
  React.useEffect(() => {
    if (!solo) return;
    // Première manche : l'extrait se télécharge pendant la préparation de la partie.
    if (!audioReady && soloIndex === 0 && !soloAnswer) {
      const first = solo.rounds[0];
      if (first?.previewUrl) void preloadTrackPreviewSegment(soloRoundPreviewKey(first.trackId, 0), first.previewUrl, previewPosition, true).catch(() => {});
      return;
    }
    if (!audioReady || soloAnswer) return;
    const nextRound = solo.rounds[soloIndex + 1];
    if (!nextRound?.previewUrl) return;
    void preloadTrackPreviewSegment(soloRoundPreviewKey(nextRound.trackId, soloIndex + 1), nextRound.previewUrl, previewPosition, true).catch(() => {});
  }, [solo, audioReady, soloIndex, previewPosition]);
  React.useEffect(() => {
    if (!solo || !soloAnswer) return undefined;
    // Une réponse coupe immédiatement l'extrait courant et préchauffe N+1
    // sans attendre stop/unload. Le nettoyage natif est best-effort en
    // arrière-plan : le délai visuel de résultat sert déjà de fenêtre de preload.
    if (soloIndex < solo.rounds.length - 1) {
      const nextRound = solo.rounds[soloIndex + 1];
      if (nextRound?.previewUrl) {
        stopTrackPreviewFast();
        void preloadTrackPreviewSegment(
          soloRoundPreviewKey(nextRound.trackId, soloIndex + 1),
          nextRound.previewUrl,
          previewPosition,
          true,
        ).catch(() => {});
      }
    }
    if (soloIndex >= solo.rounds.length - 1) {
      // Adel (28/09/2026) : FIXE ERR-BATTLE-SOLO-TIMEOUT-CREDIT-036
      // Détecter les parties où l'utilisateur n'a jamais interagi (tous les timeouts)
      // et éviter d'enregistrer ou débiter dans ce cas.
      const allTimeouts = soloResponses.length > 0 && soloResponses.every((r) => r === '__TIMEOUT__');

      const id = setTimeout(() => {
        if (saveSessionEnabled && !allTimeouts) {
          const session = buildBattleSession(solo, solo.rounds);
          useSessionHistoryStore.getState().addSession(session);
          setBattleSessionId(session.id);
        }

        // Si c'est un all-timeout, ne pas enregistrer/débiter -- la partie est annulée
        // sans interaction réelle.
        if (allTimeouts) {
          console.log('[SOLO] Partie annulée: tous les timeouts, pas de débit');
          setSoloFinished(true); celebrate();
          return;
        }

        // Adel (02/09/2026) : "un petit joueur devra monter sa note en solo"
        // -- seul moment où un score solo complet est connu ; alimente le
        // palier serveur utilisé pour bloquer un défi trop déséquilibré.
        // (19/09/2026) BUG CRITIQUE : l'ordre des appels RPC était inversé.
        // keep_battle_solo_report_result cherche une ligne dans
        // keep_battle_solo_history qui n'existe que si keep_battle_solo_record_completion
        // a déjà été appelé. Solution: enregistrer l'historique AVANT de créditer.
        // (19/09/2026) AUDIT: Ne jamais avaler les erreurs - elles doivent être visibles.
        (async () => {
          if (!canLoadAuthenticatedBattleCredit()) return;
          const freeEarned = freeEarnedForSoloScore(soloScore, solo.rounds.length);
          if (soloBefore !== null && supabase) {
            // Étape 1: enregistrer d'abord la ligne d'historique (le RPC de crédit la cherchera)
            const recordErr = await supabase.rpc('keep_battle_solo_record_completion', {
              p_theme_code: solo.themeCode,
              p_round_count: solo.rounds.length,
              p_correct_answers: soloScore,
              p_free_before: soloBefore,
              p_free_earned: freeEarned,
              p_free_after: soloBefore + freeEarned // valeur estimée avant vérification
            });
            if (recordErr?.error) console.error('[SOLO] record_completion failed:', recordErr.error);
          }
          // Étape 2: appeler le RPC qui crédite via keep_battle_solo_credit_events
          // (le RPC trouve maintenant la ligne historique)
          const reportErr = await reportSoloBattleResult(soloScore, solo.rounds.length).catch((e) => ({ error: e }));
          if (reportErr && 'error' in reportErr && reportErr.error) console.error('[SOLO] report_result failed:', reportErr.error);
          // Étape 3: charger le solde APRÈS que le crédit soit appliqué
          const status = await loadBattleCreditStatusIfAuthenticated();
          if (status && 'remainingFree' in status) {
            const freeAfter = Number(status.remainingFree ?? 0);
            setSoloAfter(freeAfter);
            // (20/09/2026) BUG RÉEL : n'annoncer "Tu as gagné" que si le
            // solde a RÉELLEMENT augmenté du montant attendu -- sinon le
            // message affichait un gain fantôme (ex: 41 → +3 → 41) quand
            // record_completion/report_result échouaient silencieusement
            // avant ce correctif. Le solde peut légitimement bouger pour
            // d'autres raisons pendant la partie (>=  au lieu de ===).
            const actuallyCredited = soloBefore !== null ? Math.max(0, freeAfter - soloBefore) : 0;
            const confirmed = freeEarned > 0 && actuallyCredited >= freeEarned;
            setSoloFreeEarned(confirmed ? freeEarned : 0);
            setSoloCreditPending(freeEarned > 0 && !confirmed);
            if (freeEarned > 0 && !confirmed) {
              console.error('[SOLO] credit mismatch: attendu', freeEarned, 'delta réel', actuallyCredited, 'before', soloBefore, 'after', freeAfter);
            }
          }
        })().catch((e) => {
          console.error('[SOLO] Unexpected error in SOLO credit flow:', e);
        });
        setSoloFinished(true); celebrate();
      }, 520);
      return () => clearTimeout(id);
    }
    // Après deux manches consécutives sans réponse, restaurer la sécurité
    // « Tu es toujours là ? » avant de continuer automatiquement.
    if (idlePromptAt !== null) return undefined;
    if (soloIdleDetected(soloResponses, idleResumeIndex)) {
      setIdlePromptAt(Date.now());
      return undefined;
    }
    const id = setTimeout(() => {
      // Transition immédiate : la manche suivante ne doit pas attendre
      // l'unload natif de la précédente. Le nettoyage continue en arrière-plan.
      stopTrackPreviewFast();
      setSoloIndex((v) => v + 1);
      setSoloAnswer(null);
      setSoloSelectedAnswer(null);
    }, SOLO_RESULT_HOLD_MS);
    return () => clearTimeout(id);
  }, [solo, soloAnswer, soloIndex, soloResponses, celebrate, saveSessionEnabled, soloStartedAt, idlePromptAt, idleResumeIndex]);

  React.useEffect(() => {
    if (idlePromptAt === null) return undefined;
    const id = setTimeout(() => {
      setIdlePromptAt(null);
      setSolo(null);
      void stopTrackPreview();
      void leaveSoloBattle().catch(() => {});
    }, SOLO_IDLE_AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [idlePromptAt]);
  React.useEffect(() => {
    if (!solo) {
      setIdlePromptAt(null);
      setIdleResumeIndex(0);
    }
  }, [solo]);

  // Battle en ligne : compte local des questions consécutives sans réponse
  // (miroir de consecutive_misses côté serveur, remis à zéro dès qu'on répond)
  // pour prévenir AVANT la 3e : « encore une et tu sors, −X Free ».
  const arenaMissRef = React.useRef<{ match: number; counted: Set<number>; streak: number }>({ match: -1, counted: new Set(), streak: 0 });
  const [arenaMissStreak, setArenaMissStreak] = React.useState(0);
  const [arenaIdlePromptAt, setArenaIdlePromptAt] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!arena || arena.status !== 'ACTIVE' || arena.me?.status !== 'ACTIVE') return;
    if (arenaMissRef.current.match !== arena.matchNo) {
      arenaMissRef.current = { match: arena.matchNo, counted: new Set(), streak: 0 };
      setArenaMissStreak(0);
    }
    const tracker = arenaMissRef.current;
    if (!arena.round?.revealed || tracker.counted.has(arena.currentRound)) return;
    tracker.counted.add(arena.currentRound);
    tracker.streak = arena.round.answered ? 0 : tracker.streak + 1;
    setArenaMissStreak(tracker.streak);
  }, [arena?.matchNo, arena?.currentRound, arena?.round?.revealed, arena?.round?.answered, arena?.status, arena?.me?.status]);

  React.useEffect(() => {
    if (!arena || arena.status !== 'ACTIVE' || arena.me?.status !== 'ACTIVE') {
      setArenaIdlePromptAt(null);
      return;
    }
    if (arenaMissStreak >= 2 && arenaIdlePromptAt === null) setArenaIdlePromptAt(Date.now());
    if (arenaMissStreak === 0 && arenaIdlePromptAt !== null) setArenaIdlePromptAt(null);
  }, [arena?.id, arena?.status, arena?.me?.status, arenaMissStreak, arenaIdlePromptAt]);

  React.useEffect(() => {
    if (arenaIdlePromptAt === null || !arena?.id || arena.status !== 'ACTIVE' || arena.me?.status !== 'ACTIVE') return undefined;
    const arenaId = arena.id;
    const id = setTimeout(() => {
      setArenaIdlePromptAt(null);
      void stopTrackPreview();
      void leaveKeepBattleArena(arenaId).catch(() => {});
      useGameSessionStore.getState().clearGameSession();
      setArena(null);
    }, SOLO_IDLE_AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [arenaIdlePromptAt, arena?.id, arena?.status, arena?.me?.status, setArena]);

  const refreshArena = React.useCallback(async () => {
    const requestedId = arena?.id;
    if (!requestedId) return;
    try {
      const result = await loadKeepBattleArena(requestedId);
      // L'utilisateur a peut-être fermé/quitté pendant l'appel réseau : ne
      // jamais réafficher une arène que l'écran actuel ne montre plus.
      if (arenaIdLiveRef.current !== requestedId) return;
      setArena(result);
    } catch {}
  }, [arena?.id]);
  React.useEffect(() => {
    if (!arena?.id) return undefined;
    const off = subscribeKeepBattleArena(arena.id, () => { void refreshArena(); });
    // Adel (28/09/2026) : Force aggressive polling for match results. If arena status
    // is WAITING but lastResult is missing, keep polling at high frequency (150ms) to catch
    // results when they populate from the server.
    const baseInterval = arena.status === 'WAITING' && !arena.lastResult ? 150 : 300;
    const id = setInterval(() => { void refreshArena(); }, baseInterval);
    // Adel (28/09/2026) : Debug logging to catch arena.lastResult population timing
    if (arena.status === 'WAITING') {
      console.log('[Battle] Arena WAITING state:', { arenaId: arena.id, matchNo: arena.matchNo, lastResult: arena.lastResult, interval: baseInterval, message: 'lastResult only populated on match > 1' });
    }
    return () => { off(); clearInterval(id); };
  }, [arena?.id, arena?.status, arena?.lastResult, refreshArena]);

  // Fin de Battle : la revanche est une demande explicite. Tant qu'aucun
  // joueur ne touche REVANCHE, rien ne redémarre. Quand une demande existe,
  // on affiche les vrais pseudos + leur réponse en direct et le décompte.
  React.useEffect(() => {
    if (!arena?.id || !arena.rematchDeadline) {
      setRematchParticipants([]);
      return undefined;
    }
    let live = true;
    const refreshRematchStatus = () => {
      void loadKeepBattleArenaRematchStatus(arena.id)
        .then((rows) => { if (live) setRematchParticipants(rows); })
        .catch(() => { if (live) setRematchParticipants([]); });
    };
    refreshRematchStatus();
    const id = setInterval(refreshRematchStatus, 800);
    return () => { live = false; clearInterval(id); };
  }, [arena?.id, arena?.rematchDeadline]);

  // Source unique des compteurs FREE affichés dans Battle.
  // Le serveur comptabilise déjà correctement les gains/pertes : le bug était
  // visuel, myPlayerStats n'était chargé qu'une fois au montage et pouvait
  // donc rester à 0 après un résultat. On rafraîchit solde + gagnés/perdus
  // ensemble, pour tous les comptes réels, sans toucher aux réglages individuels.
  const refreshMyFreeCounters = React.useCallback(async () => {
    const userState = useUserStore.getState();
    const userId = userState.user?.id;
    if (!userId || userState.isLocalGuest || userState.isDemoMode) {
      setMyCreditStatus(null);
      setMyPlayerStats(null);
      return;
    }
    const [credit, stats] = await Promise.all([
      loadBattleCreditStatusIfAuthenticated().catch(() => null),
      loadKeepBattlePlayerStats(userId).catch(() => null),
    ]);
    if (credit) setMyCreditStatus(credit);
    if (stats) setMyPlayerStats(stats);
  }, []);

  React.useEffect(() => {
    let live = true;
    const load = () => {
      if (!live) return;
      void refreshMyFreeCounters();
    };
    load();
    // Filet de sécurité pendant l'écran Battle : un crédit peut être appliqué
    // côté serveur après la dernière réponse ou à la fin d'un match distant.
    const id = setInterval(load, 3000);
    return () => { live = false; clearInterval(id); };
  }, [refreshMyFreeCounters]);

  // Rafraîchissement immédiat dès qu'un résultat Arena est reçu.
  React.useEffect(() => {
    if (!arena?.lastResult?.matchNo) return;
    void refreshMyFreeCounters();
  }, [arena?.lastResult?.matchNo, refreshMyFreeCounters]);

  const refreshMySoloRank = React.useCallback(async () => {
    const state = useUserStore.getState();
    if (!state.user?.id || state.isLocalGuest || state.isDemoMode) {
      setMySoloRank(null);
      return;
    }
    const next = await loadMyKeepBattleSoloRank().catch(() => null);
    if (!next) return;
    setMySoloRank((previous) => {
      if (previous?.rank && next.rank && next.rank < previous.rank) {
        setSoloRankDelta((current) => Math.max(current, previous.rank! - next.rank!));
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    void refreshMySoloRank();
    const id = setInterval(() => { void refreshMySoloRank(); }, 8000);
    return () => clearInterval(id);
  }, [refreshMySoloRank]);

  // Rafraîchissement immédiat à la fin d'un Solo, sans attendre le polling.
  React.useEffect(() => {
    if (!soloFinished) return;
    void refreshMyFreeCounters();
  }, [soloFinished, soloFreeEarned, soloCreditPending, refreshMyFreeCounters]);
  React.useEffect(() => {
    if (!soloFinished) return undefined;
    const id = setTimeout(() => { void refreshMySoloRank(); }, 900);
    return () => clearTimeout(id);
  }, [soloFinished, soloScore, refreshMySoloRank]);

  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl) return undefined;
    const previewUrl = round.previewUrl;
    let alive = true;
    setAudioReady(false);
    let confirmed = false;

    const run = async () => {
      const clockOffset = await estimateKeepBattleServerClockOffsetMs();
      if (!alive) return;
      const serverNow = () => keepBattleServerNowMs(clockOffset);
      const startsAt = round.startedAt ? new Date(round.startedAt).getTime() : serverNow();
      const closesAt = round.closesAt ? new Date(round.closesAt).getTime() : startsAt + ROUND_MS;
      const localTargetStart = startsAt - clockOffset;
      const duration = Math.max(1600, closesAt - startsAt + 500);

      try {
        await scheduleTrackPreviewSegment(
          `arena:${arena.id}:${arena.matchNo}:${round.position}`,
          previewUrl,
          previewPosition,
          duration,
          localTargetStart,
          (playing) => {
            if (alive && playing) {
              confirmed = true;
              setAudioReady(true);
            }
          },
          true,
        );
      } catch {
        if (!alive) return;
        const lateByMs = Math.max(0, serverNow() - startsAt);
        const ok = await playVerified(
          `arena-fallback:${arena.id}:${arena.matchNo}:${round.position}`,
          previewUrl,
          Math.max(700, closesAt - serverNow() + 500),
          battlePreviewPositionMillis(previewStartSec, lateByMs),
        );
        if (alive && ok) {
          confirmed = true;
          setAudioReady(true);
        }
      }

      // Même si un appareil rate le top départ, il reprend exactement au point
      // du morceau correspondant à l'horloge serveur. Aucun joueur ne repart
      // du début avec une fenêtre de réponse différente.
      if (!confirmed && alive) {
        const safetyDelay = Math.max(0, startsAt - serverNow()) + 350;
        await wait(safetyDelay);
        if (!alive || confirmed) return;
        const lateByMs = Math.max(0, serverNow() - startsAt);
        const ok = await playVerified(
          `arena-safety:${arena.id}:${arena.matchNo}:${round.position}`,
          previewUrl,
          Math.max(700, closesAt - serverNow() + 500),
          battlePreviewPositionMillis(previewStartSec, lateByMs),
        );
        if (alive && ok) {
          confirmed = true;
          setAudioReady(true);
        }
      }
    };

    void run();
    return () => { alive = false; void stopTrackPreview(); };
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.previewUrl, arena?.round?.startedAt, arena?.round?.closesAt, playVerified, previewPosition, previewStartSec]);
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
    // Adel (04/09/2026) : "on voit pas le troisieme joueur sur la jauge" --
    // BUG RÉEL confirmé en base : le match démarrait déjà 1,8s après le 2e
    // joueur, même avec une 3e invitation encore en attente de réponse --
    // cette personne n'avait alors plus aucune chance de rejoindre. Le
    // démarrage automatique attend maintenant que toutes les invitations en
    // cours pour cette arène soient résolues (acceptées, refusées ou
    // expirées), pas seulement qu'il y ait 2 joueurs.
    if (!arena || arena.status !== 'WAITING' || !arena.isHost || arena.lastResult || arena.seats.length < 2 || arena.pendingInviteCount > 0) return undefined;
    const id = setTimeout(() => { void startKeepBattleArena(arena.id).then((a) => { setArena(a); animateVersus(); }).catch(() => {}); }, 1800);
    return () => clearTimeout(id);
  }, [arena?.id, arena?.status, arena?.isHost, arena?.matchNo, arena?.seats.length, arena?.pendingInviteCount, animateVersus]);

  // Adel (04/09/2026) : l'overlay "⚡ BATTLE ⚡" (animateVersus) dépend d'un
  // minuteur JS (Animated.delay) qui peut se figer si l'onglet/l'écran passe
  // en arrière-plan (web mobile) pendant son affichage -- il restait alors
  // visible indéfiniment par-dessus l'écran suivant. On le remet à zéro à
  // chaque changement d'arène, avant tout nouvel appel éventuel à
  // animateVersus() pour cette arène.
  React.useEffect(() => {
    versusOpacity.setValue(0);
    versusScale.setValue(.72);
  }, [arena?.id, versusOpacity, versusScale]);

  // Adel (02/09/2026) : "le bug revient lorsque l'utilisateur ... est absent
  // ... il faut que ça revienne comme avant" -- ce minuteur automatique
  // (ajouté pour "si tout le monde a refusé la revanche, ne pas rester
  // coincé") utilisait exactement la même condition (lastResult présent +
  // moins de 2 joueurs actifs + pas de revanche en cours) qu'un GAGNANT PAR
  // FORFAIT AFK : dès qu'un adversaire absent se faisait éliminer, le
  // vainqueur se retrouvait seul avec un lastResult -- et se faisait éjecter
  // de son propre écran de victoire 1,6s plus tard, avant même de pouvoir
  // lire le score ou appuyer sur REVANCHE. Impossible de distinguer les deux
  // cas depuis le client. Retiré : ×, ‹ et REVANCHE sont déjà les bons
  // contrôles manuels ("je suis disponible, j'appuie et ça repart").

  const showSoloStartError = (error: unknown) => {
    const err = error as any;
    // Supabase/PostgREST can nest the database token in message/details/hint,
    // but on web it can also arrive as an object/stringified payload. Flatten
    // the whole error so an internal RPC code is never shown to the player.
    let serialized = '';
    try { serialized = JSON.stringify(error); } catch { serialized = String(error ?? ''); }
    const rawMessage = [err?.message, err?.details, err?.hint, err?.code, typeof error === 'string' ? error : '', serialized].filter(Boolean).join(' ');
    const compactMessage = rawMessage.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const soloLimitReached =
      compactMessage.includes('BATTLESOLODAILYLIMITREACHED') ||
      compactMessage.includes('SOLODAILYLIMITREACHED') ||
      (compactMessage.includes('DAILYLIMITREACHED') && compactMessage.includes('BATTLE'));
    if (soloLimitReached) {
      // Ne jamais exposer un code SQL/RPC brut à l'utilisateur. Le pré-contrôle
      // startSolo peut devenir périmé entre le tap et la consommation atomique,
      // donc cette garde serveur reste nécessaire mais doit produire le même UX.
      void loadKeepBattleSoloDailyStatus().then((status) => {
        const resetLabel = status.resetsAt ? new Date(status.resetsAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'demain';
        const limitLabel = status.limit != null && status.limit > 0 ? `${status.limit} parties Solo incluses` : 'ton quota Solo';
        Alert.alert('Solo terminé pour aujourd’hui', `Tu as utilisé ${limitLabel}. Retour automatique : ${resetLabel}. Le Battle en ligne reste disponible.`, [{ text: 'OK' }]);
      }).catch(() => Alert.alert('Solo terminé pour aujourd’hui', 'Ton quota Solo revient automatiquement demain. Le Battle en ligne reste disponible.', [{ text: 'OK' }]));
      return;
    }
    if (compactMessage.includes('BATTLECATALOGTOOSMALL') || compactMessage.includes('BATTLETHEMECATALOGTOOSMALL')) {
      Alert.alert('Solo indisponible pour ce style', 'Il n’y a pas encore assez de morceaux jouables dans ce style. Choisis un autre style ou MIX.');
      return;
    }
    if (compactMessage.includes('BATTLETHEMEUNAVAILABLE')) {
      Alert.alert('Style indisponible', 'Ce style n’est pas encore disponible en Solo. Choisis un autre style.');
      return;
    }
    if (compactMessage.includes('BATTLENETWORKTIMEOUT')) {
      Alert.alert(
        'Connexion trop lente',
        'Le Solo n’a pas répondu assez vite. Rien n’a été débité ni compté. Réessaie : l’écran ne restera plus bloqué.',
      );
      return;
    }
    Alert.alert('Solo indisponible', 'Impossible de préparer cette partie Solo pour le moment. Réessaie dans quelques instants.');
  };

  const runStartSolo = async (saveSession: boolean) => {
    if (busy) return;
    // Adel (03/09/2026) : "j'entends pas le son" -- vrai bug root-causé : les
    // manches de Battle démarrent TOUJOURS via un minuteur (jamais un vrai
    // tap), donc Safari iOS bloque silencieusement .play() si l'élément
    // audio partagé n'a jamais été débloqué par un vrai geste. Ce bouton
    // (via l'alerte "Sauvegarder ce Battle ?") est le dernier vrai tap avant
    // que des manches commencent à jouer du son tout seules.
    unlockWebAudioForGesture();
    const listeningBeforeSolo = useSessionStore.getState();
    if (listeningBeforeSolo.isActive && !listeningBeforeSolo.micPaused) {
      battlePausedListeningRef.current = true;
      listeningBeforeSolo.pauseListening();
      // Give iOS one short turn to release recording routing before creating
      // the Battle Sound. playVerified still keeps its own retries.
      await wait(180);
    }
    setBusy(true);
    try {
      // Adel (05/09/2026) : "comment ça se fait que sur toutes les manches il
      // m'a proposé un seul style musical en sachant que j'en ai coché
      // plusieurs" -- même bug que côté arène (challenge()) : myPreferredThemes
      // ne se rechargeait qu'une fois au montage de l'écran, jamais réactualisé
      // si les préférences avaient changé entretemps. On relit la valeur
      // fraîche côté serveur juste avant de démarrer le pack solo.
      const freshPrefs = await withBattleDeadline(loadMyMatchPreferences(), 'solo-preferences', 5_000).catch(() => null);
      const preferredThemes = freshPrefs?.themeCodes || myPreferredThemes;
      let pack: KeepBattleSoloPack;
      try {
        pack = await withBattleDeadline(
          loadKeepBattleSoloPack(themeCode, roundCount, preferredThemes),
          'solo-pack',
        );
      } catch (firstError: any) {
        let serialized = '';
        try { serialized = JSON.stringify(firstError); } catch { serialized = String(firstError ?? ''); }
        const compact = [firstError?.message, firstError?.details, firstError?.hint, firstError?.code, serialized]
          .filter(Boolean).join(' ').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const sparseTheme = compact.includes('BATTLECATALOGTOOSMALL')
          || compact.includes('BATTLETHEMECATALOGTOOSMALL')
          || compact.includes('BATTLETHEMEUNAVAILABLE');
        if (!sparseTheme) throw firstError;
        // SOLO doit rester jouable même si un style choisi manque de matière.
        // On retombe automatiquement sur MIX, sans toucher à la disponibilité
        // Battle en ligne ni aux préférences enregistrées de l'utilisateur.
        pack = await withBattleDeadline(
          loadKeepBattleSoloPack('MIX', roundCount, undefined),
          'solo-pack-mix',
        );
        setThemeCode('MIX');
        Alert.alert(
          'Solo lancé en MIX',
          'Ton style choisi n’avait pas assez de morceaux jouables. Loki a basculé automatiquement sur MIX pour ne pas bloquer ta partie.',
        );
      }
      soloDailySessionTokenRef.current = `solo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      soloDailyConsumedRef.current = false;
      soloAudioReplacementRef.current.clear();
      setSoloDailyStarted(false);
      answeredRoundRef.current = -1;
      setSaveSessionEnabled(saveSession);
      soloStartedAtRef.current = 0;
      setSoloPlayersOpen(false); setArena(null); setBrowseOnline(false); setSolo(pack); setSoloIndex(0); setSoloAnswer(null); setSoloScore(0); setSoloFinished(false); setSoloStartedAt(0); setSoloFreeEarned(0); setSoloCreditPending(false); setSoloResponses([]); setAudioReady(false); handledOutgoingIds.clear(); setBattleSessionId(null);
      // Adel (02/09/2026) : "lorsque j'appuie sur Battle seul ou Battle à
      // plusieurs, automatiquement ça m'active mon profil" -- entrer en
      // Battle (solo ou en ligne) montre déjà l'intention de jouer.
      void useBattleAvailabilityStore.getState().autoEnable().catch(() => {});
      // Adel (18/09/2026) : "Lorsqu'un utilisateur se connecte, il faut marquer
      // son style musical" -- met à jour presence_theme_code pour que les autres
      // joueurs voient quel style musical on joue, best-effort (ne bloque pas
      // le démarrage de la partie si ça échoue).
      void updateSoloPresenceTheme(themeCode, 0, pack.rounds.length).catch(() => {});
    } catch (e: any) {
      showSoloStartError(e);
    } finally { setBusy(false); }
  };

  // Adel (01/09/2026) : "souhaitez-vous ... enregistrer dans la session le
  // Battle musical, oui ou non" demandé avant CHAQUE partie -- plus de
  // sauvegarde automatique par défaut.
  const startSolo = async () => {
    if (busy) return;
    // Adel (08/09/2026) : "en mode démo ... il n'est pas possible de faire un
    // Battle ni appuyé dessus automatiquement, ça lui fait un popup" -- même
    // garde que "Battle en ligne" (openOnline ci-dessous), qui manquait ici :
    // un invité/démo pouvait lancer un Battle solo sans jamais être bloqué.
    if (!enabled) { onRequireAccount?.(); return; }
    setBusy(true);
    let dailyLimitReached = false;
    let insufficientCredit = false;
    try {
      const [status, freshCredit] = await withBattleDeadline(
        Promise.all([
          loadKeepBattleSoloDailyStatus(),
          loadBattleCreditStatusIfAuthenticated(),
        ]),
        'solo-precheck',
        6_000,
      );
      // DEFENSIVE: status peut être null si le RPC n'existe pas en base
      // ou si le réseau a échoué. Dans ce cas, laisser passer (serveur fera le contrôle).
      if (status && !status.unlimited && status.remaining != null && status.remaining <= 0) {
        dailyLimitReached = true;
        const resetLabel = status.resetsAt ? new Date(status.resetsAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'demain';
        Alert.alert(
          'Tes parties Solo du jour sont terminées',
          `Tu as joué tes ${status.limit ?? 0} parties incluses aujourd'hui. Prochain rechargement : ${resetLabel}. Le Battle en ligne reste disponible : choisis EN LIGNE pour jouer tout de suite.`,
          // Règles §9 : 3 boutons au maximum. « Jouer en BATTLE » est dans le texte.
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Acheter des Solos', onPress: () => { void openSoloPacks(); } },
            ...(onOpenOffers ? [{ text: 'Passer Premium', onPress: () => { onOpenOffers(); } }] : []),
          ],
        );
      }
      // Adel (28/09/2026) : Vérification proactive du Free avant de démarrer le Battle Solo.
      // CORRECTION (28/09/2026) : SOLO coûte 0 Free pour tous. Les utilisateurs sans Free
      // peuvent jouer et récupérer du crédit. EN LIGNE (multiplayer) coûte des Free et
      // nécessite une vérification. SOLO n'en a pas besoin puisque stakeFree=0 côté serveur.
      // Le serveur fera le contrôle final atomique au démarrage du pack.
    } catch {
      // Le serveur fera le contrôle atomique au démarrage : ne jamais bloquer
      // une partie uniquement parce que le pré-contrôle réseau a échoué.
    } finally {
      setBusy(false);
    }
    if (dailyLimitReached || insufficientCredit) return;
    // Adel (29/09/2026) : l'utilisateur doit savoir AVANT de jouer qu'une
    // partie Solo est comptée dès le départ (même s'il quitte en route).
    const costLine = soloCostNotice(soloDailyStatus);
    setSoloSavePrompt({ costLine });
  };

  const renderSoloSavePrompt = () => (
    <KeepModal
      visible={Boolean(soloSavePrompt)}
      transparent
      animationType="fade"
      onRequestClose={() => setSoloSavePrompt(null)}
    >
      <View style={s.soloSaveBackdrop} accessibilityViewIsModal>
        <View style={s.soloSaveCard}>
          <Text style={s.soloSaveEyebrow}>BATTLE SOLO</Text>
          <Text style={s.soloSaveTitle}>Sauvegarder ce Battle solo ?</Text>
          {soloSavePrompt?.costLine ? <Text style={s.soloSaveCost}>{soloSavePrompt.costLine}</Text> : null}
          <Text style={s.soloSaveBody}>
            JOUER lance ce Battle solo sans l’enregistrer. ENREGISTRER ajoute ses morceaux à Mes Sessions à la fin.
          </Text>
          <View style={s.soloSaveActions}>
            <TouchableOpacity
              style={[s.soloSaveButton, s.soloSaveCancel]}
              accessibilityRole="button"
              accessibilityLabel="Annuler le Battle solo"
              onPress={() => setSoloSavePrompt(null)}
            >
              <Text style={s.soloSaveCancelText}>ANNULER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.soloSaveButton, s.soloSavePlay]}
              accessibilityRole="button"
              accessibilityLabel="Jouer sans enregistrer"
              onPress={() => { setSoloSavePrompt(null); void runStartSolo(false); }}
            >
              <Text style={s.soloSavePlayText}>JOUER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.soloSaveButton, s.soloSaveKeep]}
              accessibilityRole="button"
              accessibilityLabel="Enregistrer ce Battle solo"
              onPress={() => { setSoloSavePrompt(null); void runStartSolo(true); }}
            >
              <Text style={s.soloSaveKeepText}>ENREGISTRER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeepModal>
  );

  const openOnline = async () => {
    if (!enabled) { onRequireAccount?.(); return; }
    setBusy(true);
    try {
      setBrowseOnline(true); setSolo(null); setArena(null); handledOutgoingIds.clear();
      void useBattleAvailabilityStore.getState().autoEnable().catch(() => {});
      loadKeepBattleGlobalLeaderboard(20).then((rows) => {
        const map: Record<string, number> = {};
        rows.forEach((row, index) => { map[row.profileId] = index + 1; });
        setLeaderboardRank(map);
      }).catch(() => {});
      const account = useUserStore.getState();
      const [players, credit] = await withBattleDeadline(
        Promise.all([
          loadLiveSoloPlayers(20, roundCount),
          account.user?.id && !account.isLocalGuest && !account.isDemoMode
            ? loadBattleCreditStatusIfAuthenticated()
            : Promise.resolve(null),
        ]),
        'online-lobby',
        7_000,
      );
      if (mountedRef.current) {
        setLivePlayers(players);
        if (credit) setMyCreditStatus(credit);
      }
    } catch { if (mountedRef.current) setLivePlayers([]); }
    finally { if (mountedRef.current) setBusy(false); }
  };

  // Adel (02/09/2026) : "c'est pas que je prenne des abonnements, c'est
  // surtout qu'ils partagent pour avoir des Free ... tu partages leurs
  // goûts musicaux afin de gagner une communauté" -- le but de ce message
  // est de faire grandir la communauté par le partage, pas de vendre
  // Premium ici. Un seul bouton d'action ("Partager") + Annuler, pour que
  // les deux tiennent proprement côte à côte au lieu de trois boutons mal
  // alignés.
  const notEnoughFreeAlert = (title: string) => {
    Alert.alert(
      title,
      'Partage ton profil à tes amis : plus ta communauté musicale grandit, plus tu gagnes de Free pour jouer. Tu peux aussi essayer un Battle EN LIGNE avec un ami.',
      [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Battle EN LIGNE', onPress: () => { void openOnline(); } },
        { text: 'Partager', onPress: () => { const username = useUserStore.getState().user?.username; if (username) void shareProfile(username); } },
      ],
    );
  };

  const challenge = async (player: KeepBattleLivePlayer): Promise<boolean> => {
    if (challengeBusyId) return false;
    const freshCredit = canLoadAuthenticatedBattleCredit()
      ? await loadBattleCreditStatusIfAuthenticated().then((value) => value ?? myCreditStatus)
      : myCreditStatus;
    if (freshCredit) setMyCreditStatus(freshCredit);
    const senderShort = freshCredit
      ? freshCredit.hasPaidBattleAccess !== true && freshCredit.remainingFree < stakeForRounds(roundCount)
      : insufficientForRoundCount(roundCount);
    if (senderShort) {
      notEnoughFreeAlert(`Il te faut au moins ${stakeForRounds(roundCount)} Free pour lancer un Battle de ${roundCount} morceaux`);
      return false;
    }
    const freshTarget = await loadLiveSoloPlayers(30, roundCount).then((rows) => rows.find((row) => row.profileId === player.profileId) || null).catch(() => player);
    if (!freshTarget) {
      Alert.alert('Battle', `${player.username} n’est plus disponible.`);
      void refreshSocial();
      return false;
    }
    if (insufficientForOpponent(freshTarget)) {
      Alert.alert('Battle', `${freshTarget.username} n’a que ${freshTarget.remainingFree} Free. Il en faut ${stakeForRounds(roundCount)} pour ce Battle de ${roundCount} morceaux.`);
      void refreshSocial();
      return false;
    }
    player = freshTarget;
    // Adel (03/09/2026) : "j'entends pas le son" -- le camp qui ENVOIE le
    // défi ne retape jamais rien au moment où l'autre accepte (détecté par
    // sondage, pas par un geste) -- ce tap "BATTLE"/"Défier" est son dernier
    // vrai geste avant que la manche démarre toute seule plus tard.
    unlockWebAudioForGesture();
    setChallengeBusyId(player.profileId);
    try {
      let arenaId = buildingArenaIdRef.current;
      // Un ancien salon WAITING peut avoir expiré pendant qu'on reste sur
      // l'écran. Ne jamais réutiliser indéfiniment un id périmé : c'était un
      // bouton "Démarrer la Battle" qui semblait mort après une première
      // tentative expirée.
      if (arenaId) {
        const existingArena = await loadKeepBattleArena(arenaId).catch(() => null);
        if (!existingArena || existingArena.status !== 'WAITING' || existingArena.openSeats <= 0) {
          setBuildingArena(null);
          arenaId = null;
        }
      }
      if (!arenaId) {
        // Adel (04/09/2026) : "si j'ai sélectionné cinq [styles] ... il faut
        // qu'il me mette un peu de tout, un mix de tout" -- même mécanisme
        // que loadKeepBattleSoloPack : themeCode reste l'étiquette
        // d'affichage, mais l'UNION réelle des styles acceptés part en
        // themeCodes pour que le serveur mixe vraiment tout, pas juste le
        // premier style.
        // Adel (05/09/2026) : "pourquoi ça ne tourne pas dans plusieurs
        // styles, pourquoi il en reste un par défaut" -- BUG RÉEL confirmé
        // en base sur floadelissa (9 styles cochés en base, mais ses
        // arènes créées ne portaient QUE CHANSON_FR, theme_codes=null) :
        // myPreferredThemes ne se rechargeait qu'une fois au montage de cet
        // écran, jamais réactualisé si les préférences avaient changé entre
        // temps (autre session, remontage tardif...). On relit la valeur
        // fraîche côté serveur juste avant de créer l'arène -- l'action a
        // un vrai coût en Free, elle ne doit jamais se baser sur un état
        // local potentiellement périmé.
        const freshPrefs = await loadMyMatchPreferences().catch(() => null);
        const realThemes = (freshPrefs?.themeCodes || myPreferredThemes).filter((c) => c !== 'MIX');
        const created = await createKeepBattleArena(themeCode, roundCount, realThemes.length > 1 ? realThemes : undefined);
        arenaId = created.id;
        setBuildingArena(arenaId);
      }
      await sendBattleArenaChallenge(arenaId, player.profileId);
      return true;
    } catch (e: any) {
      const message = String(e?.message || e || '');
      if (message.includes('BATTLE_CHALLENGER_NO_CREDIT') || message.includes('BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED')) notEnoughFreeAlert(`Il te faut au moins ${parseRequiredFree(message, stakeForRounds(roundCount))} Free pour lancer un Battle de ${roundCount} morceaux`);
      else if (message.includes('BATTLE_TARGET_NO_CREDIT')) Alert.alert('Battle', `${player.username} n’a pas assez de Free pour jouer ${roundCount} morceaux maintenant.`);
      else if (message.includes('BATTLE_ARENA_FULL')) Alert.alert('Battle', 'Ton groupe est déjà complet : 10 joueurs.');
      else if (message.includes('BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES')) {
        const until = parseInviteBlockedUntilMs(message);
        if (until) {
          setInviteBlockedUntil((rows) => ({ ...rows, [player.profileId]: until }));
          Alert.alert('Battle', `${player.username} a refusé plusieurs fois. Tu pourras réinviter dans ${formatInviteCooldown(until - Date.now())}.`);
        } else {
          Alert.alert('Battle', `${player.username} a refusé plusieurs fois. Réessaie un peu plus tard.`);
        }
      }
      else if (message.includes('BATTLE_SKILL_GAP_TOO_LARGE')) Alert.alert('Battle', `L’écart de niveau avec ${player.username} est trop grand. Enchaîne des parties solo pour monter de catégorie.`);
      else if (message.includes('BATTLE_DAILY_INVITE_LIMIT_REACHED')) Alert.alert('Battle', 'Tu as atteint le nombre d’invitations Battle autorisées aujourd’hui. Réessaie demain.');
      else Alert.alert('Battle', `${player.username} n’est plus disponible.`);
      void refreshSocial();
      return false;
    } finally {
      setChallengeBusyId(null);
    }
  };

  // Adel (21/09/2026) : refonte "Joueurs disponibles" -- sélection multiple
  // avec case à cocher + barre fixe "Démarrer la Battle" au lieu de taper
  // BATTLE joueur par joueur. Un joueur en crédit insuffisant, déjà invité
  // (sent) ou en cooldown de refus (blocked) n'est jamais sélectionnable :
  // mêmes règles d'éligibilité que le bouton BATTLE individuel qu'elle
  // remplace, jamais une seconde logique parallèle.
  const [selectedBattlePlayerIds, setSelectedBattlePlayerIds] = React.useState<Set<string>>(new Set());
  const [startingGroupBattle, setStartingGroupBattle] = React.useState(false);
  const [selectionRequired, setSelectionRequired] = React.useState(false);
  const startGlow = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(startGlow, { toValue: 1, duration: 650, useNativeDriver: false }),
      Animated.timing(startGlow, { toValue: 0, duration: 650, useNativeDriver: false }),
    ]));
    loop.start(); return () => loop.stop();
  }, [startGlow]);
  const isPlayerSelectable = React.useCallback((player: KeepBattleLivePlayer) => {
    if (insufficientForOpponent(player)) return false;
    if (outgoingPendingTargetIds.has(player.profileId)) return false;
    if ((inviteBlockedUntil[player.profileId] || 0) - now > 0) return false;
    return true;
  }, [insufficientForOpponent, outgoingPendingTargetIds, inviteBlockedUntil, now]);
  const toggleBattlePlayerSelection = (player: KeepBattleLivePlayer) => {
    if (!isPlayerSelectable(player)) return;
    setSelectedBattlePlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(player.profileId)) next.delete(player.profileId); else next.add(player.profileId);
      setSelectionRequired(false);
      return next;
    });
  };
  // Un changement de NOMBRE DE MORCEAUX (donc de mise Free requise, cf.
  // insufficientForOpponent) ou la disparition d'un joueur de la liste peut
  // rendre une sélection existante invalide -- jamais garder un joueur
  // sélectionné qui n'est plus réellement éligible.
  React.useEffect(() => {
    setSelectedBattlePlayerIds((prev) => {
      if (!prev.size) return prev;
      const stillValid = new Set(Array.from(prev).filter((id) => {
        const player = livePlayers.find((p) => p.profileId === id);
        return player ? isPlayerSelectable(player) : false;
      }));
      return stillValid.size === prev.size ? prev : stillValid;
    });
  }, [livePlayers, isPlayerSelectable]);
  const startSelectedBattle = async () => {
    if (startingGroupBattle || challengeBusyId) return;
    const targets = livePlayers.filter((p) => selectedBattlePlayerIds.has(p.profileId));
    if (targets.length < 1) { setSelectionRequired(true); return; }
    setSelectionRequired(false);
    setStartingGroupBattle(true);
    try {
      let sentCount = 0;
      for (const player of targets) {
        if (await challenge(player)) sentCount += 1;
      }
      if (sentCount < 1) return;
      setSelectedBattlePlayerIds(new Set());
      const finalArenaId = buildingArenaIdRef.current;
      if (finalArenaId) {
        const loaded = await loadKeepBattleArena(finalArenaId).catch(() => null);
        if (loaded) setArena(loaded);
      }
    } finally {
      setStartingGroupBattle(false);
    }
  };

  // Adel (02/09/2026) : "lorsque je clique sur l'utilisateur, essaye de
  // mettre un popup que je puisse voir son profil ou l'ajouter directement"
  // -- taper l'avatar/pseudo d'un joueur dans "Joueurs disponibles" ouvrait
  // directement son profil sans lui laisser le choix de défier depuis là.
  // Adel (03/09/2026) : "il attend une personne qui vient le défier ... un
  // peu son palmarès, il peut cliquer dessus et voir son palmarès, comme ça
  // il peut l'inviter" -- même pop-up de stats que le classement (Soirées),
  // ouvert directement depuis la liste "1 joueur disponible" / "Joueurs
  // disponibles", pour décider de défier en connaissance de cause.
  const [statsPlayer, setStatsPlayer] = React.useState<KeepBattleLivePlayer | null>(null);
  const [statsData, setStatsData] = React.useState<KeepBattlePlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const openPlayerStats = (player: KeepBattleLivePlayer) => {
    setStatsPlayer(player);
    setStatsData(null);
    setStatsLoading(true);
    loadKeepBattlePlayerStats(player.profileId)
      .then((data) => { if (mountedRef.current) setStatsData(data); })
      .catch(() => { if (mountedRef.current) setStatsData(null); })
      .finally(() => { if (mountedRef.current) setStatsLoading(false); });
  };

  // Adel (03/09/2026) : "trouve une solution déroulante pour le style du
  // match ... je clique dessus, je sélectionne, tu laisses un truc par
  // défaut et c'est terminé" -- un bouton résumé (au lieu de la rangée de
  // pastilles) qui ouvre un dérouleur à cases à cocher pour choisir
  // plusieurs styles à la fois.
  const myPreferredThemesLabel = () => {
    if (myPreferredThemes.length === 1 && myPreferredThemes[0] === 'MIX') return 'Mix (tout accepter)';
    return myPreferredThemes.map((code) => themeLabel(code)).join(', ');
  };
  const renderMyPreferencesPicker = () => (
    <>
      <TouchableOpacity style={s.prefsSummaryButton} onPress={() => setPrefsPickerOpen(true)} accessibilityRole="button" accessibilityLabel="Modifier mes styles Battle">
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.prefsSummaryLabel}>STYLES BATTLE · 3 MAX</Text>
          <Text numberOfLines={1} style={s.prefsSummaryValue}>{prefsSaving ? 'Enregistrement…' : myPreferredThemesLabel()}</Text>
          {myPreferredThemes.filter((c) => c !== 'MIX').length > 1 ? (
            <Text numberOfLines={1} style={s.prefsSummaryHint}>Mix aléatoire de tes styles sélectionnés</Text>
          ) : null}
        </View>
        {/* Adel (02/10/2026) : un joueur ne savait pas que la case était cliquable. */}
        <Text style={s.prefsEditPill}>MODIFIER ›</Text>
      </TouchableOpacity>
      <KeepModal visible={soloPacksOpen} transparent animationType="fade" onRequestClose={() => setSoloPacksOpen(false)}>
        <View style={s.statsBackdrop}>
          <View style={s.statsCard}>
            <TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.statsClose} onPress={() => setSoloPacksOpen(false)} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={s.statsCloseText}>×</Text></TouchableOpacity>
            <Text style={s.statsUsername}>Acheter des Solos</Text>
            <Text style={s.prefsPickerHint}>{soloRechargeCopy(soloPacks?.packs, soloDailyStatus).full}{soloPacks?.bonusRemaining ? ` Stock acheté restant : ${soloPacks.bonusRemaining} Solo${soloPacks.bonusRemaining > 1 ? 's' : ''}.` : ''}</Text>
            {(soloPacks?.packs ?? []).map((pack) => {
              const short = (soloPacks?.balance ?? 0) < pack.free;
              return (
                <TouchableOpacity key={pack.code} disabled={Boolean(soloPackBusy)} style={[s.soloPackRow, short && s.themeShort]} onPress={() => (short ? Alert.alert('Pas assez de Free', `Il te faut ${pack.free} Free, tu en as ${soloPacks?.balance ?? 0}. Gagne des Free en Solo ou en partageant, ou recharge tes Free.`, [{ text: 'OK', style: 'cancel' }, ...(onOpenOffers ? [{ text: 'Recharger mes Free', onPress: () => { setSoloPacksOpen(false); onOpenOffers(); } }] : [])]) : buySoloPack(pack))} accessibilityRole="button" accessibilityLabel={`${pack.solos} Solos pour ${pack.free} Free`}>
                  <Text style={s.soloPackSolos}>🎯 {pack.solos} Solos</Text>
                  <Text style={[s.soloPackPrice, short && s.themeTextShort]}>{soloPackBusy === pack.code ? '…' : `${pack.free} FREE`}</Text>
                </TouchableOpacity>
              );
            })}
            <Text style={s.soloPackBalance}>Ton solde : {soloPacks?.balance ?? 0} Free · Paiement par carte / Apple Pay : bientôt</Text>
          </View>
        </View>
      </KeepModal>
      <KeepModal visible={prefsPickerOpen} transparent animationType="fade" onRequestClose={() => setPrefsPickerOpen(false)}>
        <View style={s.statsBackdrop}>
          <View style={s.statsCard}>
            <TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.statsClose} onPress={() => setPrefsPickerOpen(false)} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={s.statsCloseText}>×</Text></TouchableOpacity>
            <Text style={s.statsUsername}>Styles Battle</Text>
            <Text style={s.prefsPickerHint}>Ton profil peut afficher tous tes styles musicaux. Ici seulement, choisis jusqu’à 3 styles acceptés pour les Battles. Mix remplace les styles précis.</Text>
            <ScrollView style={s.prefsPickerScroll}>
              {themes.map((t) => {
                const checked = myPreferredThemes.includes(t.code);
                return (
                  <TouchableOpacity key={t.code} style={s.prefsPickerRow} onPress={() => toggleMyPreferredTheme(t.code)}>
                    <Text style={[s.prefsPickerCheckbox, checked && s.prefsPickerCheckboxOn]}>{checked ? '✓' : ''}</Text>
                    <Text style={s.prefsPickerRowText}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={s.finishPrimary} onPress={confirmMyPreferences}><Text style={s.finishPrimaryText}>VALIDER</Text></TouchableOpacity>
          </View>
        </View>
      </KeepModal>
    </>
  );

  // Adel (03/09/2026) : "une fenêtre à droite, une fenêtre à gauche ... et si
  // ils sont plusieurs tu fais des petits carrés comme TikTok" -- une équipe
  // par colonne (gauche/droite), chaque joueur = un petit carré (avatar +
  // pseudo + score), au lieu de la simple liste de pastilles texte
  // précédente. Réutilisé tel quel par l'arène en direct ET par le mode
  // spectateur (mêmes carrés, données différentes). `plusTile` optionnel :
  // le "+" que voit un spectateur pour rejoindre le prochain match.
  // Adel (03/09/2026) : "regarde les petites fenêtres, c'est le nombre
  // d'abonnés, et au-dessus il y a la taille pour mettre l'image" -- capture
  // TikTok Live à l'appui : chaque tuile est l'AVATAR en plein cadre (pas un
  // petit cercle sur fond uni), un badge en haut à gauche (score, comme le
  // badge spectateurs TikTok), et le pseudo en légende tout en bas sur fond
  // sombre. Toujours compact (46x50) pour ne jamais repousser la question et
  // les réponses hors écran.
  const renderSquareTile = (player: { profileId: string; username: string; avatarUrl?: string | null; score: number }) => (
    <TouchableOpacity key={player.profileId} style={s.squareTile} onPress={() => onOpenProfile(player.username)}>
      {player.avatarUrl ? (
        <ImageBackground source={{ uri: player.avatarUrl }} style={s.squareTileFill} imageStyle={s.squareTileImage}>
          <View style={s.squareBadge}><Text style={s.squareBadgeText}>{player.score}</Text></View>
          <View style={s.squareCaption}><Text numberOfLines={1} style={s.squareCaptionText}>{player.username}</Text></View>
        </ImageBackground>
      ) : (
        <View style={[s.squareTileFill, s.squareTileFallback]}>
          <Text style={s.squareTileFallbackLetter}>{initial(player.username)}</Text>
          <View style={s.squareBadge}><Text style={s.squareBadgeText}>{player.score}</Text></View>
          <View style={s.squareCaption}><Text numberOfLines={1} style={s.squareCaptionText}>{player.username}</Text></View>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderTeamSquares = (
    teamA: Array<{ profileId: string; username: string; avatarUrl?: string | null; score: number }>,
    teamB: Array<{ profileId: string; username: string; avatarUrl?: string | null; score: number }>,
    plusTile?: { onPress: () => void; busy: boolean },
  ) => (
    <View style={s.squareGrid}>
      <View style={s.squareCol}>{teamA.map(renderSquareTile)}</View>
      <View style={s.squareCol}>
        {teamB.map(renderSquareTile)}
        {plusTile ? <TouchableOpacity disabled={plusTile.busy} style={[s.squareTile, s.squarePlus]} onPress={plusTile.onPress}>
          {plusTile.busy ? <ActivityIndicator color="#E5F266" size="small" /> : <Text style={s.squarePlusIcon}>+</Text>}
        </TouchableOpacity> : null}
      </View>
    </View>
  );

  const renderPlayerStatsModal = () => {
    if (!statsPlayer) return null;
    return (
      <KeepModal visible transparent animationType="fade" onRequestClose={() => setStatsPlayer(null)}>
        <View style={s.statsBackdrop}>
          <View style={s.statsCard}>
            <TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.statsClose} onPress={() => setStatsPlayer(null)} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={s.statsCloseText}>×</Text></TouchableOpacity>
            <Text style={s.statsUsername}>{statsPlayer.username}</Text>
            {statsLoading ? <ActivityIndicator color="#E5F266" /> : statsData ? (
              <>
                <View style={s.statsBigRow}>
                  <View style={s.statsBigItem}><Text style={s.statsBigValue}>{formatCompactNumber(statsData.wins)}</Text><Text style={s.statsBigLabel}>Victoires</Text></View>
                  <View style={s.statsBigItem}><Text style={s.statsBigValue}>{formatCompactNumber(statsData.matchesPlayed)}</Text><Text style={s.statsBigLabel}>Matchs</Text></View>
                  <View style={s.statsBigItem}><Text style={s.statsBigValue}>{formatCompactNumber(statsData.totalCorrect)}</Text><Text style={s.statsBigLabel}>Bonnes rép.</Text></View>
                </View>
                {/* Adel (04/09/2026) : "il faut mettre le nombre d'abonnés, le
                    nombre de Free qu'il a et le nombre de Free qu'il a gagné" */}
                <View style={s.statsSmallRow}>
                  <View style={s.statsSmallItem}><Text style={s.statsSmallValue}>👥 {formatCompactNumber(statsData.followers)}</Text><Text style={s.statsSmallLabel}>Abonnés</Text></View>
                  <View style={s.statsSmallItem}><Text style={s.statsSmallValue}>🎁 {formatCompactNumber(statsData.freeBalance)}</Text><Text style={s.statsSmallLabel}>Free restant</Text></View>
                  <View style={s.statsSmallItem}><Text style={s.statsSmallValue}>🏆 {formatCompactNumber(statsData.freeWon)}</Text><Text style={s.statsSmallLabel}>FREE gagnés aujourd’hui</Text></View>
                  <View style={s.statsSmallItem}><Text style={[s.statsSmallValue, s.statsSmallValueLost]}>↘ {formatCompactNumber(statsData.freeLost)}</Text><Text style={s.statsSmallLabel}>FREE perdus aujourd’hui</Text></View>
                </View>
                {statsData.avgResponseMs != null ? <Text style={s.statsAvg}>⚡ {(statsData.avgResponseMs / 1000).toFixed(1)}s de temps de réponse moyen</Text> : null}
                {statsData.topThemes.length ? (
                  <>
                    <Text style={s.statsSectionTitle}>STYLES OÙ IL EST IMBATTABLE</Text>
                    {statsData.topThemes.map((t) => (
                      <View key={t.themeCode} style={s.statsThemeRow}>
                        <Text style={s.statsThemeLabel}>🎯 {themeLabel(t.themeCode)}</Text>
                        <Text style={s.statsThemeValue}>{t.wins} victoire{t.wins > 1 ? 's' : ''} · {t.matches} match{t.matches > 1 ? 's' : ''}</Text>
                      </View>
                    ))}
                  </>
                ) : <Text style={s.statsThemeEmpty}>Pas encore assez de matchs pour dégager un style fort.</Text>}
              </>
            ) : <Text style={s.statsThemeEmpty}>Statistiques indisponibles pour le moment.</Text>}
            <View style={s.statsActionsRow}>
              <TouchableOpacity style={s.statsFollowButton} onPress={() => { onOpenProfile(statsPlayer.username); setStatsPlayer(null); }}><Text style={s.statsFollowButtonText}>VOIR PROFIL</Text></TouchableOpacity>
              <TouchableOpacity disabled={insufficientForOpponent(statsPlayer)} style={[s.statsProfileButtonSmall, insufficientForOpponent(statsPlayer) && s.statsChallengeDisabled]} onPress={() => { setStatsPlayer(null); void challenge(statsPlayer); }}>
                <Text style={[s.statsProfileButtonText, insufficientForOpponent(statsPlayer) && s.statsChallengeDisabledText]}>{insufficientForOpponent(statsPlayer) ? `${statsPlayer.remainingFree}/${stakeForRounds(roundCount)} FREE` : 'DÉFIER'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeepModal>
    );
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
    // Audit multi-agent 07/09/2026 : même garde que answerArena/refreshArena --
    // un jeton distinct posé avant le premier await ; n'importe quel setArena
    // entre-temps (fermeture, autre défi accepté) l'écrase et fait avorter
    // proprement l'application du résultat réseau tardif.
    const pendingToken = `PENDING_CHALLENGE:${item.id}`;
    if (accept) {
      unlockWebAudioForGesture();
      setAudioReady(false);
      void stopTrackPreview();
      arenaIdLiveRef.current = pendingToken;
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
        if (arenaIdLiveRef.current !== pendingToken) return;
        setArena(loadedArena);
        animateVersus();
      }
    } catch (e: any) {
      await refreshSocial();
      const message = String(e?.message || e || '');
      if (message.includes('BATTLE_CHALLENGER_NO_CREDIT')) Alert.alert('Battle', `${item.username} n’a plus les ${parseRequiredFree(message, stakeForRounds(item.roundCount))} Free nécessaires pour ${item.roundCount} morceaux. Le Battle ne peut pas démarrer.`);
      else if (message.includes('BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED')) notEnoughFreeAlert(`Il te faut au moins ${parseRequiredFree(message, stakeForRounds(item.roundCount))} Free pour accepter ce Battle de ${item.roundCount} morceaux`);
      else Alert.alert('Battle', 'Impossible de traiter cette invitation. Réessaie immédiatement.');
    } finally {
      setRespondingChallengeId(null);
    }
  };

  const requestBattleChallengeDecision = (item: KeepBattleIncomingChallenge, accept: boolean) => {
    if (accept) { void respond(item, true); return; }
    if (respondingChallengeId) return;
    Alert.alert(
      'Refuser ce Battle ?',
      `Confirme uniquement si tu veux réellement refuser l’invitation de ${item.username}.`,
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'REFUSER', style: 'destructive', onPress: () => { void respond(item, false); } },
      ],
    );
  };

  // Adel (03/09/2026) : "quand j'appuie sur revanche, pareil ça me met une
  // invite fixe ... et si il refuse ça me remet dans jouer en solo Battle en
  // ligne" -- même geste que `respond` (défi frais) mais pour une revanche
  // d'arène vue depuis en dehors de cette arène (accueil Battle, "Joueurs
  // disponibles"). Accepter charge et ouvre l'arène ; refuser reste
  // simplement là où l'utilisateur est déjà (accueil/solo/en ligne).
  const respondPendingRematch = async (item: KeepBattlePendingRematch, accept: boolean) => {
    if (rematchBannerBusyId) return;
    setRematchBannerBusyId(item.arenaId);
    // Audit multi-agent 07/09/2026 : même garde que respond().
    const pendingToken = `PENDING_REMATCH:${item.arenaId}`;
    if (accept) { unlockWebAudioForGesture(); arenaIdLiveRef.current = pendingToken; }
    try {
      const result = await respondKeepBattleArenaRematch(item.arenaId, accept);
      setPendingRematch((rows) => rows.filter((x) => x.arenaId !== item.arenaId));
      if (accept) {
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        setSolo(null); setBrowseOnline(false); setAudioReady(false);
        if (arenaIdLiveRef.current !== pendingToken) return;
        setArena(result);
        animateVersus();
      }
    } catch {
      setPendingRematch((rows) => rows.filter((x) => x.arenaId !== item.arenaId));
    } finally {
      setRematchBannerBusyId(null);
    }
  };

  const requestPendingRematchDecision = (item: KeepBattlePendingRematch, accept: boolean) => {
    if (accept) { void respondPendingRematch(item, true); return; }
    if (rematchBannerBusyId) return;
    Alert.alert(
      'Refuser la revanche ?',
      'Confirme uniquement si tu veux réellement refuser cette revanche.',
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'REFUSER', style: 'destructive', onPress: () => { void respondPendingRematch(item, false); } },
      ],
    );
  };

  const openArenaInviteList = async () => {
    if (!arena || arena.status !== 'WAITING' || arena.openSeats <= 0) return;
    setArenaInviteOpen(true);
    setBusy(true);
    try {
      const rows = await loadLiveSoloPlayers(30, arena.roundCount);
      const memberIds = new Set(arena.seats.map((seat) => seat.profileId));
      if (mountedRef.current) setLivePlayers(rows.filter((player) => !memberIds.has(player.profileId)));
    } catch {
      if (mountedRef.current) setLivePlayers([]);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const invitePlayerToArena = async (player: KeepBattleLivePlayer) => {
    if (!arena || arena.status !== 'WAITING' || arena.openSeats <= 0 || arenaInviteBusyId) return;
    setArenaInviteBusyId(player.profileId);
    try {
      const freshTarget = await loadLiveSoloPlayers(30, arena.roundCount).then((rows) => rows.find((row) => row.profileId === player.profileId) || null);
      if (!freshTarget) throw new Error('BATTLE_PLAYER_NOT_AVAILABLE');
      if (opponentNeedsMoreFree(freshTarget, arena.roundCount)) throw new Error(`BATTLE_TARGET_NO_CREDIT:${stakeForRounds(arena.roundCount)}`);
      player = freshTarget;
      const sent = await sendBattleArenaChallenge(arena.id, player.profileId);
      setArenaInvitedIds((rows) => rows.includes(player.profileId) ? rows : [...rows, player.profileId]);
      if (sent.id && sent.expiresAt) {
        const pendingItem: KeepBattleOutgoingChallenge = {
          id: sent.id,
          targetId: player.profileId,
          username: player.username,
          avatarUrl: player.avatarUrl,
          themeCode: arena.themeCode,
          status: 'PENDING',
          arenaId: arena.id,
          arenaCode: sent.arenaCode ?? arena.arenaCode,
          expiresAt: sent.expiresAt,
        };
        setOutgoingPendingTargetIds((rows) => new Set(rows).add(player.profileId));
        setOutgoingPendingByTarget((rows) => ({ ...rows, [player.profileId]: pendingItem }));
      }
    } catch (e: any) {
      const message = String(e?.message || e || '');
      if (message.includes('BATTLE_ARENA_FULL')) Alert.alert('Battle', 'Le groupe est déjà complet : 10 joueurs.');
      else if (message.includes('BATTLE_TARGET_NO_CREDIT')) Alert.alert('Battle', `${player.username} n’a pas les ${stakeForRounds(arena.roundCount)} Free nécessaires.`);
      else if (message.includes('BATTLE_ARENA_NOT_OPEN_FOR_INVITES')) Alert.alert('Battle', 'La prochaine partie a déjà démarré.');
      else if (message.includes('BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES')) {
        const until = parseInviteBlockedUntilMs(message);
        if (until) {
          setInviteBlockedUntil((rows) => ({ ...rows, [player.profileId]: until }));
          Alert.alert('Battle', `${player.username} a refusé plusieurs fois. Tu pourras réinviter dans ${formatInviteCooldown(until - Date.now())}.`);
        } else {
          Alert.alert('Battle', `${player.username} a refusé plusieurs fois. Réessaie un peu plus tard.`);
        }
      }
      else if (message.includes('BATTLE_SKILL_GAP_TOO_LARGE')) Alert.alert('Battle', `L’écart de niveau avec ${player.username} est trop grand. Enchaîne des parties solo pour monter de catégorie.`);
      else if (message.includes('BATTLE_DAILY_INVITE_LIMIT_REACHED')) Alert.alert('Battle', 'Tu as atteint le nombre d’invitations Battle autorisées aujourd’hui. Réessaie demain.');
      else Alert.alert('Battle', `${player.username} n’est plus disponible.`);
      const rows = await loadLiveSoloPlayers(30, arena.roundCount).catch(() => []);
      const memberIds = new Set(arena.seats.map((seat) => seat.profileId));
      setLivePlayers(rows.filter((candidate) => !memberIds.has(candidate.profileId)));
    } finally {
      setArenaInviteBusyId(null);
    }
  };

  const answerSolo = (choice: string) => {
    const round = solo?.rounds[soloIndex];
    if (!round || !audioReady || !soloStartedAt || soloAnswer || noVoiceInFlight.current) return;
    // Temps réel exact au moment de l'appui, pas le `now` d'état qui ne se
    // rafraîchit que toutes les 100ms -- une réponse tapée en vrai avant
    // l'échéance ne doit jamais être refusée à cause de ce retard d'affichage.
    if (Date.now() - soloStartedAt >= ROUND_MS) return;
    if (answeredRoundRef.current === soloIndex) return; // déjà tranché par le timeout
    answeredRoundRef.current = soloIndex;
    stopTrackPreviewFast();
    // Mobile/TestFlight : dès que le joueur a répondu, le morceau est tranché.
    // Couper immédiatement libère AVAudioSession et permet de précharger la
    // manche suivante pendant le court reveal, au lieu d'attendre la fin des
    // 10 secondes comme avant.
    const isCorrect = sameAnswer(choice, round.correctAnswer);
    setSoloSelectedAnswer(choice);
    recordSoloAnswer(isCorrect ? 'CORRECT' : 'INCORRECT');
    if (isCorrect) setSoloScore((v) => v + 1);
    animateResult();
  };

  const reportNoVoice = async () => {
    if (noVoiceInFlight.current) return;
    const currentSolo = solo?.rounds[soloIndex];
    const currentArena = arena?.round;
    if (solo ? (!currentSolo || soloAnswer || !audioReady) : (!arena || arena.status !== 'ACTIVE' || !currentArena || currentArena.revealed || currentArena.answered || pending)) return;
    noVoiceInFlight.current = true;
    setNoVoiceBusy(true);
    try {
      if (!canLoadAuthenticatedBattleCredit()) {
        // Démo : remplacer localement, sans signalement ni écriture serveur.
        if (solo && currentSolo) {
          const replacement = solo.rounds.find((item, index) => index > soloIndex && item.trackId !== currentSolo.trackId);
          if (replacement) {
            stopTrackPreviewFast();
            setSolo((previous) => previous ? { ...previous, rounds: previous.rounds.map((item, index) => index === soloIndex ? replacement : item) } : previous);
          }
        }
        return;
      }
      if (solo && currentSolo) await activateBattleSoloRound(solo.reportToken, soloIndex + 1, currentSolo.trackId);
      const result = await reportBattleNoVoice(solo && currentSolo ? {
        position: soloIndex + 1, reportToken: solo.reportToken, trackId: currentSolo.trackId,
      } : {
        arenaId: arena!.id, matchNo: arena!.matchNo, position: currentArena!.position, startedAt: currentArena!.startedAt,
      });
      stopTrackPreviewFast();
      if (solo && result?.round) {
        discardPreloadedTrackPreview();
        setSolo((previous) => previous ? { ...previous, rounds: previous.rounds.map((item, index) => index === soloIndex ? result.round : item) } : previous);
      } else if (arena && result?.id) setArena(result);
    } catch {
      Alert.alert('Pas de voix', 'Signalement indisponible. Réessaie.');
    } finally {
      noVoiceInFlight.current = false;
      setNoVoiceBusy(false);
    }
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

  // Adel (03/09/2026) : "quoi qu'il arrive, si j'appuie sur quitter ou sur la
  // croix, ça me remet sur jouer en solo / Battle en ligne" -- changement
  // explicite demandé par-dessus la règle du 02/09 (qui faisait sortir ×
  // complètement vers "Salon musical" via onExit) : × et "QUITTER LE
  // BATTLE" doivent maintenant amener au même endroit que ‹, l'accueil
  // INTERNE de Battle, jamais plus loin.
  const backToArenaHome = React.useCallback(() => {
    if (arena) {
      const stakeLoss = arena.status === 'ACTIVE' ? stakeForRounds(arena.roundCount) : 0;
      Alert.alert(
        'Êtes-vous sûr de sortir ?',
        arena.status === 'ACTIVE' ? `Si tu quittes maintenant, tu perds le Battle et ${stakeLoss} Free seront débités.` : 'Tu vas quitter ce Battle. Es-tu sûr ?',
        [
          { text: 'Non, continuer', style: 'cancel' },
          {
            text: 'Oui, je quitte',
            style: 'destructive',
            onPress: () => {
              void stopTrackPreview();
              const leavingArenaId = arenaIdLiveRef.current;
              if (leavingArenaId && !leavingArenaId.startsWith('PENDING_')) void leaveKeepBattleArena(leavingArenaId).catch(() => {});
              useGameSessionStore.getState().clearGameSession();
              setArenaIdlePromptAt(null);
              setArena(null);
            },
          },
        ],
      );
      return;
    }
    void stopTrackPreview();
    const activeArenaId = arenaIdLiveRef.current;
    if (activeArenaId && !activeArenaId.startsWith('PENDING_')) {
      void leaveKeepBattleArena(activeArenaId).catch(() => {});
      useGameSessionStore.getState().clearGameSession();
    }
    setArenaIdlePromptAt(null);
    setArena(null);
    setBuildingArena(null);
  }, [arena?.id]);

  // Adel (04/09/2026) : "je sais pas pourquoi le Battle ça me revient à chaque
  // fois ... 0 JOUEURS / Loki VS Loki" -- BUG RÉEL confirmé en base : une
  // fois un match terminé sans revanche, TOUS les sièges (hôte compris)
  // passent à ELIMINATED et l'arène reste WAITING pour toujours, orpheline.
  // Si le client reste pointé dessus (revanche refusée, navigation stagnante),
  // `seats` (filtré ACTIVE côté serveur) tombe à 0 et affiche ce salon fantôme
  // sans aucun joueur. Différent du bug AFK déjà retiré plus bas (qui éjectait
  // un VAINQUEUR SEUL, donc seats.length===1) : ici c'est bien 0/0, personne,
  // pas même l'hôte -- jamais vrai pour un salon fraîchement créé (l'hôte y
  // est toujours ACTIVE dès la création).
  React.useEffect(() => {
    if (!arena || arena.status !== 'WAITING' || arena.seats.length > 0) return;
    // Ne jamais appeler le handler utilisateur ici : il ouvre une confirmation
    // et peut transformer un simple état réseau transitoire en sortie serveur.
    // Une arène WAITING vide/ancienne est seulement détachée de l'écran.
    void stopTrackPreview();
    setArena(null);
    setBuildingArena(null);
  }, [arena?.id, arena?.status, arena?.seats.length, setArena]);

  const closeBattleArenaNow = React.useCallback(() => {
    void stopTrackPreview();
    // Adel (02/09/2026) : "je suis sorti du Battle ... il tourne encore" --
    // fermer l'écran doit prévenir le serveur (forfait si la partie était
    // active, sinon simple sortie du groupe) sinon le siège reste ACTIVE
    // pour toujours côté serveur.
    if (arena?.id) {
      void leaveKeepBattleArena(arena.id).catch(() => {});
      useGameSessionStore.getState().clearGameSession();
    }
    setArenaIdlePromptAt(null);
    // Adel (02/09/2026) : "il ne faut pas le désactiver automatique" quand
    // c'est une activation MANUELLE -- quitter complètement Battle éteint
    // la disponibilité seulement si elle a été activée automatiquement en
    // entrant (autoEnable) ; une activation manuelle depuis le Profil reste
    // active jusqu'à ce que l'utilisateur la désactive lui-même.
    void useBattleAvailabilityStore.getState().autoDisable().catch(() => {});
    setAudioReady(false);
    setPending(null);
    setArena(null);
    setBrowseOnline(false);
    setSolo(null);
    setBuildingArena(null);
  }, [arena?.id]);

  const closeBattleArena = React.useCallback(() => {
    // Match terminé / salon en attente : aucune pénalité, aucune confirmation
    // bloquante. Chacun est libre de repartir immédiatement où il veut.
    if (!arena || arena.status !== 'ACTIVE') {
      closeBattleArenaNow();
      return;
    }
    const stake = stakeForRounds(arena.roundCount);
    Alert.alert(
      'Quitter le Battle ?',
      `La partie est en cours. Si tu quittes maintenant, tu perds le Battle et ${stake} Free seront débités. ${ABANDON_RANKING_NOTE}`,
      [
        { text: 'RESTER', style: 'cancel' },
        { text: `QUITTER · -${stake} FREE`, style: 'destructive', onPress: closeBattleArenaNow },
      ],
      { cancelable: true },
    );
  }, [arena?.status, arena?.roundCount, closeBattleArenaNow]);

  const answerArena = async (choice: string) => {
    if (!arena || arena.status !== 'ACTIVE' || !audioReady || arena.round?.answered || arena.round?.revealed || pending || noVoiceInFlight.current) return;
    const startsAt = arena.round?.startedAt ? new Date(arena.round.startedAt).getTime() : 0;
    const closesAt = arena.round?.closesAt ? new Date(arena.round.closesAt).getTime() : 0;
    const sharedNow = keepBattleServerNowMs();
    if ((startsAt && sharedNow < startsAt) || (closesAt && sharedNow >= closesAt)) return;
    // Adel (02/09/2026) : "en attendant la réponse, tu laisses la musique" --
    // en arène, d'autres joueurs répondent peut-être encore : couper le son
    // dès QUE J'appuie serait déloyal pour eux. Le morceau s'arrête déjà tout
    // seul quand la manche est révélée pour tout le monde (voir l'effet sur
    // arena.round.revealed).
    // Audit multi-agent 07/09/2026 : régression du bug "ça revient toujours
    // là" (déjà corrigé sur refreshArena) par ce chemin-ci -- répondre puis
    // fermer avant la réponse réseau rouvrait l'arène quittée. Même garde.
    const requestedId = arena.id;
    setPending(choice);
    try {
      const result = await submitKeepBattleArenaQuizAnswer(requestedId, choice);
      if (arenaIdLiveRef.current !== requestedId) return;
      setArena(result);
    } catch {}
    finally { setPending(null); }
  };

  const Avatar = ({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) => url
    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}><Text style={s.avatarLetter}>{initial(name)}</Text></View>;

  React.useEffect(() => {
    if (solo || arena) return undefined;
    let alive = true;
    void loadBattlePreviewStartSec().then((value) => { if (alive) setPreviewStartSec(value); });
    return () => { alive = false; };
  }, [Boolean(solo), Boolean(arena)]);

  const noVoiceButton = <TouchableOpacity testID="battle-no-voice" accessibilityRole="button" accessibilityLabel="Pas de voix" disabled={noVoiceBusy} onPress={() => { void reportNoVoice(); }} style={[s.finishSecondary, { minHeight: 48 }]}><Text style={s.finishSecondaryText}>{noVoiceBusy ? '…' : 'Pas de voix'}</Text></TouchableOpacity>;

  if (solo) {
    const round = solo.rounds[soloIndex];
    const timeout = soloAnswer === '__TIMEOUT__';
    const answered = Boolean(soloAnswer);
    const correct = soloAnswer === 'CORRECT';
    const attempts = soloIndex + (answered ? 1 : 0);
    const errors = Math.max(0, attempts - soloScore);
    const remaining = Math.max(0, solo.rounds.length - attempts);
    const pct = audioReady ? (displayedSoloRemaining / ROUND_MS) * 100 : 100;
    if (soloFinished) {
      const perfect = soloScore === solo.rounds.length;
      return <View style={[s.root, isDesktopBattle && s.rootDesktop]}>
        <View style={s.header}><TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.back} onPress={() => { setSoloFinished(false); setSolo(null); void leaveSoloBattle().catch(() => {}); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>LOKI MUSIC · BATTLE</Text><Text style={s.title}>PARTIE TERMINÉE</Text></View><Text style={s.round}>{solo.rounds.length}/{solo.rounds.length}</Text></View>
        {/* Adel (02/09/2026) : "à l'étape huit pourquoi tu mets pas cette
            invitation ... la partie est terminée" -- vrai trou : incoming[0]
            continue d'être sondé même sur cet écran de fin de partie
            (aucune garde `soloFinished` dans la boucle de sondage), mais
            cet écran ne rendait jamais la bannière -- une invitation reçue
            pile à la fin de la partie 8/8 restait invisible. Même bloc que
            l'écran de jeu actif (et l'écran "Joueurs disponibles" un peu
            plus bas), pas de nouvelle logique. */}
        {!incoming[0] && pendingRematch[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><View style={{ flex: 1 }}><Text style={s.inviteQuestion}>🔁 Revanche avec {pendingRematch[0].participantUsernames.map((u) => `${u}`).join(', ') || 'le groupe'}. On repart ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(pendingRematch[0].themeCode)} · RÉPONSE OBLIGATOIRE</Text></View></View><View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.no, rematchBannerBusyId && s.actionDisabled]} onPress={() => requestPendingRematchDecision(pendingRematch[0], false)}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.yes, rematchBannerBusyId && s.actionDisabled]} onPress={() => requestPendingRematchDecision(pendingRematch[0], true)}><Text style={s.yesText}>{rematchBannerBusyId === pendingRematch[0].arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}
        {incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>{incoming[0].username}</Text> te défie sur un Battle. Tu acceptes ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {incoming[0].roundCount} morceaux · RÉPONSE OBLIGATOIRE</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={!incomingDecisionReady || Boolean(respondingChallengeId)} style={[s.no, (!incomingDecisionReady || respondingChallengeId) && s.actionDisabled]} onPress={() => requestBattleChallengeDecision(incoming[0], false)}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={!incomingDecisionReady || Boolean(respondingChallengeId)} style={[s.yes, (!incomingDecisionReady || respondingChallengeId) && s.actionDisabled]} onPress={() => requestBattleChallengeDecision(incoming[0], true)}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}
        {/* Adel (01/09/2026) : "les boutons sont trop serrés en bas ... remonte
            les boutons correctement qu'on puisse tout voir" -- avec 3-4 boutons
            de fin de partie, la hauteur totale dépassait l'écran sur certains
            téléphones et coupait le dernier bouton sous la barre d'onglets.
            ScrollView garantit que tout reste atteignable quelle que soit la
            taille de l'écran, au lieu de deviner une hauteur fixe. */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.finishScroll}>
          <Animated.View style={[s.finishHero, { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] }]}>
            <LokiFinishBurst tone={soloScore >= Math.ceil(solo.rounds.length / 2) ? 'win' : 'try'} />
            {/* Adel (29/09/2026) : Loki, dessin animé avec voix off selon le score. */}
            <LokiMascotVoice
              correct={soloScore}
              total={solo.rounds.length}
              allTimeouts={soloResponses.length > 0 && soloResponses.every((r) => r === '__TIMEOUT__')}
              messageSeed={soloDailySessionTokenRef.current || `solo:${solo.themeCode}:${solo.rounds.length}:${soloScore}`}
            />
            <Text style={s.finishTitle}>{perfect ? `PARFAIT · ${solo.rounds.length}/${solo.rounds.length}` : `${soloScore}/${solo.rounds.length}`}</Text>
            <Text style={s.finishSub}>Résultat final de cette partie</Text>
            <View style={s.finishScore}><Animated.Text style={[s.finishScoreBig, jackpotScoreStyle]}>{soloScore}</Animated.Text><Text style={s.finishScoreSlash}> / {solo.rounds.length}</Text></View>
            {soloFreeEarned > 0 ? (
              <Text style={s.finishReward}>🎁 +{soloFreeEarned} Free crédités{soloBefore !== null && soloAfter !== null ? ` (${soloBefore} → ${soloAfter})` : ''}</Text>
            ) : soloCreditPending ? (
              <Text style={s.finishReward}>🎁 Crédit Free en cours de confirmation.</Text>
            ) : (
              <Text style={s.finishReward}>🎁 Aucun Free crédité sur cette partie.</Text>
            )}
          </Animated.View>
          <Text style={s.finishQuestion}>Que souhaites-tu faire ?</Text>
          <TouchableOpacity style={s.finishPrimary} onPress={() => { setSoloFinished(false); setSolo(null); void startSolo(); }}><Text style={s.finishPrimaryText}>REFAIRE UNE PARTIE</Text></TouchableOpacity>
          {onOpenLeaderboard ? (
            <TouchableOpacity testID="solo-leaderboard-entry" style={s.finishSecondary} onPress={onOpenLeaderboard} accessibilityRole="button" accessibilityLabel="Ouvrir le classement depuis le Solo">
              <Text style={s.finishSecondaryText}>🏆 CLASSEMENT</Text>
            </TouchableOpacity>
          ) : null}
          {/* Adel (13/09/2026, viralité) : un score juste obtenu est le
              contenu le plus partageable de Loki -- jamais de sortie vers
              l'extérieur avant ce bouton, contrairement à INVITER UN AMI qui
              existait déjà. */}
          <TouchableOpacity style={s.finishSecondary} onPress={() => { void shareBattleResult(`${perfect ? 'PARFAIT · ' : ''}${soloScore}/${solo.rounds.length} sur ${themeLabel(solo.themeCode)}`); }}><Text style={s.finishSecondaryText}>↗ PARTAGER MON SCORE</Text></TouchableOpacity>
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
        </ScrollView>
      </View>;
    }
    return <View style={[s.root, isDesktopBattle && s.rootDesktop]}>
      <View style={s.playHeader}><TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Quitter le solo" style={s.playBack} onPress={() => {
        // Adel (29/09/2026) : quitter en cours de partie ne rend PAS le Solo
        // (compté au démarrage, côté serveur). On le dit avant de sortir.
        const quit = () => { setSolo(null); void stopTrackPreview(); void leaveSoloBattle().catch(() => {}); };
        Alert.alert('Quitter la partie ?', soloQuitNotice(soloDailyStatus), [
          { text: 'Continuer à jouer', style: 'cancel' },
          { text: 'Quitter', style: 'destructive', onPress: quit },
        ]);
      }}><Text style={s.playBackText}>‹</Text></TouchableOpacity><Text numberOfLines={1} style={s.playMode}>SOLO · {themeLabel(solo.rounds[soloIndex]?.themeCode || solo.themeCode)}</Text><Text style={s.playRound}>{soloIndex + 1}/{solo.rounds.length}</Text><Text style={s.playStake}>🎁 +{maxRewardForRounds(solo.rounds.length)}</Text></View>
      {/* Adel (02/09/2026) : "règle une fois pour toute ... je ne vois pas
          l'utilisateur entier" -- sans ScrollView, sur un écran/viewport
          court (barre d'adresse + barre d'onglets fixe du build web), le
          panneau "joueurs disponibles" tout en bas pouvait finir caché sans
          aucun moyen de le voir. Un ScrollView rend la carte + le panneau
          TOUJOURS atteignables quelle que soit la hauteur d'écran, au lieu
          de dépendre d'une marge fixe qui ne marche que sur certains
          appareils. */}
      {idlePromptAt !== null ? (
        <View style={s.idleOverlay} accessibilityViewIsModal>
          <View style={s.idleCard}>
            <Text style={s.idleEmoji}>😴</Text>
            <Text style={s.idleTitle}>Tu es toujours là ?</Text>
            <Text style={s.idleText}>{soloIdleNotice((idlePromptAt + SOLO_IDLE_AUTO_CLOSE_MS - now) / 1000, soloDailyStatus)}</Text>
            <View style={s.idleActions}>
              <TouchableOpacity
                style={s.idleStop}
                accessibilityRole="button"
                onPress={() => {
                  setIdlePromptAt(null);
                  setSolo(null);
                  void stopTrackPreview();
                  void leaveSoloBattle().catch(() => {});
                }}
              >
                <Text style={s.idleStopText}>Arrêter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.idleGo}
                accessibilityRole="button"
                onPress={() => {
                  unlockWebAudioForGesture();
                  setIdleResumeIndex(soloResponses.length);
                  setIdlePromptAt(null);
                }}
              >
                <Text style={s.idleGoText}>Je suis là !</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
      <ScrollView scrollEnabled bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={s.soloScroll}>
      <Animated.View style={[s.card, s.soloCardActive, { minHeight: soloRoundCardMinHeight }, { transform: [{ scale: pulse }] }]}>
        <View testID="battle-solo-artwork-square" style={[s.visual, s.soloVisual, { maxHeight: soloVisualMax, maxWidth: soloVisualMax }]}>{answered && round.artworkUrl ? <RevealArtwork uri={round.artworkUrl} /> : <EqualizerBars />}{!answered ? <><View pointerEvents="none" style={s.roundQuestionPillWrap}><Text style={s.roundQuestionPill}>QUI CHANTE ?</Text></View><View pointerEvents="none" style={s.roundEncouragementOverlay}><Text style={s.roundEncouragementText}>{soloIndex === 0 && !audioReady ? `🏁 Tu tentes l’aventure : trouve les ${solo.rounds.length} artistes pour gagner jusqu’à ${maxRewardForRounds(solo.rounds.length)} Free !` : soloEncouragement(soloIndex, solo.rounds.length)}</Text></View></> : null}{answered ? <View style={s.result}><Text style={correct ? s.good : s.bad}>{correct ? 'GAGNÉ !' : timeout ? 'OUPS · TROP TARD' : 'PERDU'}</Text><Text style={s.artist}>{round.artist}</Text></View> : null}</View>
        <View style={s.clockRow}><Text style={[s.clock, audioReady && soloRemaining < 2200 && s.clockHot]}>{audioReady ? `${(displayedSoloRemaining / 1000).toFixed(1)}s` : 'PRÊT'}</Text><Text style={s.clockHint}>{audioReady ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}</Text></View>
        {audioReady && !answered ? noVoiceButton : null}
        <View style={s.timeTrack}><View style={[s.timeFill, { width: `${pct}%` }]} /></View>
        {/* SOLO verrouillé : invitations et revanches restent en file serveur
            et sont proposées seulement après la partie. Aucun popup ne peut
            recouvrir les réponses ou modifier le chrono pendant une manche. */}
        {/* Adel (29/09/2026) : « quand j'appuie sur solo, il faut que
            l'utilisateur sache qu'il va tenter l'aventure pour gagner » +
            « chaque musique qui va défiler, un texte particulier… courage ».
            Avant le 1er son : le défi et le gain possible ; ensuite : un
            encouragement différent à chaque morceau. */}
        <View style={s.soloQuestionBlock}>
        <View testID="battle-solo-answers" style={[s.answers, s.soloAnswers, s.soloAnswersActive]}>{(() => { const answers = dedupeAnswerChoices(round.choices || [], round.correctAnswer, (value) => value); if (answers.length < 4) console.warn(`[Battle SOLO] ${answers.length} < 4 réponses à la manche ${soloIndex + 1}/${solo.rounds.length}`); return answers.map((choice, i) => { const label = answerChoiceLabel(choice, answers); const state = answerVisualState(choice, round.correctAnswer, soloSelectedAnswer, answered); return <TouchableOpacity key={choice} accessibilityState={{ selected: state !== 'idle' }} accessibilityLabel={state === 'correct' ? `${label}, bonne réponse` : state === 'wrong' ? `${label}, mauvaise réponse` : label} disabled={!audioReady || answered} onPress={() => answerSolo(choice)} style={[s.answer, state === 'correct' && s.answerCorrect, state === 'wrong' && s.answerWrong]}><Text style={[s.answerNo, state === 'correct' && s.answerNoCorrect, state === 'wrong' && s.answerNoWrong]}>{state === 'correct' ? '✓' : state === 'wrong' ? '✕' : i + 1}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[s.answerText, state === 'correct' && s.answerTextCorrect]}>{label}</Text></TouchableOpacity>; }); })()}</View>
        </View>
      </Animated.View>
      <View style={s.scoreLine}><Text style={s.score}>✓ {soloScore} · ✕ {errors}</Text><Text style={s.score}>{remaining} à jouer</Text></View>
      {/* Adel (02/09/2026) : "trouve une solution où il y a l'abonné
          l'utilisateur, il faut que ça soit tout visible correctement ...
          ne fais pas des gros textes, juste un bouton jaune Battle juste en
          face de l'invité" -- rangée compacte (avatar + pseudo + bouton),
          au lieu de cartes empilées verticalement dans un scroll horizontal
          qui poussait le bouton hors de l'écran visible. */}
      {/* Adel (05/10/2026) : pas besoin de voir les joueurs pendant un Solo -- un joueur en Solo n'est pas invitable ; l'invitation lui arrive à la fin de sa partie. */}
      {SOLO_SHOW_LIVE_PLAYERS && enabled ? <><TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: soloPlayersOpen }}
        accessibilityLabel={soloPlayersOpen ? "Masquer les joueurs en ligne" : "Voir les joueurs en ligne"}
        style={s.soloPlayersToggle}
        onPress={() => setSoloPlayersOpen((value) => !value)}
      ><View style={s.soloPlayersToggleLeft}><View style={s.dot} /><Text style={s.soloPlayersToggleText}>{(() => { const count = livePlayers.filter((p) => !insufficientForOpponent(p)).length; return count ? `${count} JOUEUR${count > 1 ? 'S' : ''} EN LIGNE` : 'JOUEURS EN LIGNE'; })()}</Text></View><Text style={s.soloPlayersToggleAction}>{soloPlayersOpen ? 'MASQUER' : 'VOIR'}</Text></TouchableOpacity>{soloPlayersOpen ? <View style={s.live}><View style={s.liveHeader}><View style={s.dot} /><Text style={s.liveTitle}>{(() => { const count = livePlayers.filter((p) => !insufficientForOpponent(p)).length; return count ? `${count} joueur${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}` : livePlayers.length ? 'Aucun adversaire avec assez de Free' : 'Tu es visible pour les Battles'; })()}</Text></View>{livePlayers.length ? <View style={s.liveList}>{livePlayers.slice(0, 3).map((p) => <View key={p.profileId} style={[s.liveRowCompact, insufficientForOpponent(p) && s.liveRowInsufficient]}><TouchableOpacity style={s.liveRowLeft} onPress={(event) => { event.stopPropagation(); openPlayerStats(p); }}><Avatar name={p.username} url={p.avatarUrl} size={32} /><PresenceDot online /><View style={s.liveRowIdentity}><Text numberOfLines={1} style={s.liveRowName}>{p.username}{p.skillTier ? ` · ${tierLabel(p.skillTier)}` : ''}</Text>{insufficientForOpponent(p) ? <Text style={s.liveRowCreditWarning}>🎁 ${p.remainingFree}/${stakeForRounds(roundCount)} Free · indisponible</Text> : null}</View></TouchableOpacity>{(() => {  const pendingInvite = outgoingPendingByTarget[p.profileId];  const sent = Boolean(pendingInvite);  const inviteRemaining = pendingInvite ? Math.max(0, new Date(pendingInvite.expiresAt).getTime() - now) : 0;  const cancelling = Boolean(pendingInvite && cancelChallengeBusyId === pendingInvite.id);  const blockedMs = (inviteBlockedUntil[p.profileId] || 0) - now;  const blocked = blockedMs > 0;  const selfShort = insufficientForRoundCount(roundCount);  const targetShort = insufficientForOpponent(p);  const creditBlocked = selfShort || targetShort;  return <TouchableOpacity    disabled={Boolean(challengeBusyId) || cancelling || blocked || creditBlocked}    style={[s.battleButton, challengeBusyId === p.profileId && s.battleButtonSending, sent && s.battleButtonSent, blocked && s.battleButtonBlocked, creditBlocked && s.battleButtonCreditBlocked, challengeBusyId && challengeBusyId !== p.profileId && s.actionDisabled]}    onPress={() => { if (pendingInvite) requestCancelOutgoingChallenge(pendingInvite); else void challenge(p); }}  ><Text style={[s.battleButtonText, sent && s.battleButtonSentText, blocked && s.battleButtonBlockedText, creditBlocked && s.battleButtonCreditBlockedText]}>    {challengeBusyId === p.profileId ? 'ENVOI…' : cancelling ? 'ANNULATION…' : blocked ? `⏳ ${formatInviteCooldown(blockedMs)}` : pendingInvite ? `ANNULER · ${formatInviteCooldown(inviteRemaining)}` : selfShort ? 'MES FREE INSUFF.' : targetShort ? `${p.remainingFree}/${stakeForRounds(roundCount)} FREE` : 'BATTLE'}  </Text></TouchableOpacity>;})()}</View>)}</View> : null}</View> : null}</> : null}
      </ScrollView>
      {renderPlayerStatsModal()}
    </View>;
  }

  if (spectating) {
    const specTeamA = spectating.seats.filter((_, index) => index % 2 === 0);
    const specTeamB = spectating.seats.filter((_, index) => index % 2 === 1);
    const canJoin = spectating.status !== 'CLOSED' && spectating.status !== 'EXPIRED';
    return <View style={[s.root, isDesktopBattle && s.rootDesktop]}>
      <View style={s.header}><TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.back} onPress={() => setSpectating(null)}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>LOKI MUSIC · BATTLE · SPECTATEUR</Text><Text style={s.title}>{themeLabel(spectating.themeCode)}</Text></View><Text style={s.round}>{spectating.currentRound || 0}/{spectating.roundCount}</Text></View>
      <ScrollView style={s.arenaScroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.arenaScrollContent}>
      {renderTeamSquares(specTeamA, specTeamB, canJoin ? { onPress: () => { void joinSpectatedMatch(); }, busy: spectateJoinBusy } : undefined)}
      <View style={s.waiting}>
        {spectating.status === 'WAITING' ? (
          <><Text style={s.trophy}>⚡</Text><Text style={s.winner}>EN ATTENTE</Text><Text style={s.waitText}>Le match n’a pas encore commencé.</Text></>
        ) : spectating.round?.revealed ? (
          <><Text style={s.trophy}>🎵</Text><Text style={s.winner}>{spectating.round.artist || '—'}</Text><Text style={s.waitText}>Manche {spectating.round.position} révélée.</Text></>
        ) : (
          <><EqualizerBars /><Text style={s.waitText}>Manche {spectating.round?.position || spectating.currentRound} en cours…</Text></>
        )}
      </View>
      </ScrollView>
    </View>;
  }

  if (arena) {
    const round = arena.round;
    const players = (arena.leaderboard?.length ? arena.leaderboard.map((l) => arena.seats.find((x) => x.profileId === l.profileId) || ({ ...l, avatarUrl: null } as any)) : arena.seats) || [];
    const startsAt = round?.startedAt ? new Date(round.startedAt).getTime() : 0;
    const closesAt = round?.closesAt ? new Date(round.closesAt).getTime() : 0;
    // BUG RÉEL (Adel, 02/09/2026 : "les musiques démarrent pas tout de suite
    // ... c'est une arnaque, le compteur est parti") : `ready` ne dépendait
    // que de l'horloge serveur partagée (startsAt), jamais de la
    // confirmation LOCALE que l'audio joue vraiment (`audioReady`). Sur un
    // réseau un peu lent, le chrono et la barre de progression démarraient
    // avant que le son ne soit audible. La fin de manche (closesAt) reste
    // sur l'horloge serveur -- indispensable pour rester synchronisé entre
    // joueurs -- seul l'AFFICHAGE (chrono, barre, boutons actifs) attend
    // maintenant aussi la confirmation audio locale.
    const sharedArenaNow = keepBattleServerNowMs();
    const ready = arena.status === 'ACTIVE' && (!startsAt || sharedArenaNow >= startsAt) && audioReady;
    const left = arena.status === 'ACTIVE' && closesAt ? Math.max(0, closesAt - Math.max(sharedArenaNow, startsAt || sharedArenaNow)) : ROUND_MS;
    const pct = Math.max(0, Math.min(100, (left / ROUND_MS) * 100));
    const first = players[0]; const second = players[1];
    // Adel (04/09/2026) : "la partie est individuelle mais on joue collectif
    // ... le seul problème c'est la jauge, on pourra intégrer le nom de la
    // personne" -- BUG DE DESIGN confirmé : au-delà de 2 joueurs, la jauge
    // séparait le groupe en "ÉQUIPE A/ÉQUIPE B" par simple alternance
    // d'index (1er+3e contre 2e+4e) -- un découpage arbitraire qui n'a
    // jamais correspondu à qui gagne vraiment dans un match individuel à
    // plusieurs. Gardé identique pour 2 joueurs (jauge VS classique) ;
    // remplacé par un mini-classement avec les vrais noms au-delà de 2.
    const teamA = players.filter((_, index) => index % 2 === 0);
    const teamB = players.filter((_, index) => index % 2 === 1);
    const teamAScore = teamA.reduce((sum, player) => sum + Number(player?.score || 0), 0);
    const teamBScore = teamB.reduce((sum, player) => sum + Number(player?.score || 0), 0);
    // Adel (04/09/2026) : "il faut trouver une solution pour qu'on puisse voir
    // les noms pour qu'on sache qui est qui dans le Battle" -- l'overlay
    // "⚡ BATTLE ⚡" à 3 joueurs et plus n'affichait qu'un compte ("3 JOUEURS"),
    // jamais qui participait réellement. Liste maintenant les vrais pseudos.
    const versusLabel = players.length > 2 ? players.map((p: any) => `${p.username}`).join(' · ') : `${first ? `$` : 'Loki Music'} VS ${second ? `$` : 'Loki Music'}`;
    const palmares = Array.from(winnerHistory.reduce((map, row) => {
      const current = map.get(row.profileId) || { ...row, wins: 0 };
      current.wins += 1;
      if (row.matchNo > current.matchNo) Object.assign(current, row, { wins: current.wins });
      map.set(row.profileId, current);
      return map;
    }, new Map<string, KeepBattleArenaWinner & { wins: number }>()).values()).sort((a, b) => b.wins - a.wins || b.matchNo - a.matchNo).slice(0, 3);
    if (arena.status === 'WAITING' && arena.lastResult) {
      const winner = arena.lastWinner;
      // Adel (05/10/2026) : « quand personne a gagné, personne a gagné » -- aucun vainqueur ou 0 point = pas de gagnant, ni trophée ni « remporte ».
      const nobodyWon = !winner || !(Number(winner.score) > 0);
      const myLastResult = arena.lastResult;
      // 01/10/2026 — règle produit verrouillée par Adel :
      // bonus uniquement en Battle multijoueur. Il faut un sans-faute N/N.
      // S'il y a plusieurs parfaits, UN SEUL bonus système est attribué :
      // celui dont le temps cumulé de réponse est le plus court.
      // Montant = mise réelle du format (8=>3, 15=>6, 20=>8, 30=>12 Free).
      const perfectBonusWinner = (arena.lastMatchResults || [])
        .filter((entry) => entry.correct === arena.roundCount)
        .sort((a, b) => a.responseMs - b.responseMs || a.placement - b.placement || a.profileId.localeCompare(b.profileId))[0] || null;
      const perfectBonusFree = perfectBonusWinner ? stakeForRounds(arena.roundCount) : 0;
      const perfectBonusIsMine = Boolean(perfectBonusWinner && perfectBonusWinner.profileId === arena.me?.profileId);
      const perfectBonusGlowStyle = {
        borderColor: jackpotBlink.interpolate({ inputRange: [0, 1], outputRange: [colors.keep, '#FFF4A8'] }),
        transform: [{ scale: jackpotBlink.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }],
      };
      const arenaTrackCount = arenaPlayedTracksRef.current.size;
      const rematchDeadline = arena.rematchDeadline;
      const rematchRemaining = rematchDeadline ? Math.max(0, Math.ceil((new Date(rematchDeadline).getTime() - now) / 1000)) : 0;
      const arenaMeRematchReady = arena.me?.rematchReady;
      const rematchAcceptedCount = rematchParticipants.filter((participant) => participant.rematchReady === true).length;
      const rematchWaitingCount = rematchParticipants.filter((participant) => participant.rematchReady == null).length;
      const rematchDeclinedCount = rematchParticipants.filter((participant) => participant.rematchReady === false).length;
      const rematchProposerIsMe = rematchParticipants.some((participant) => participant.isProposer && participant.isMe);
      const rematchOtherAcceptedCount = rematchParticipants.filter((participant) => !participant.isMe && participant.rematchReady === true).length;
      const canWithdrawRematch = Boolean(rematchDeadline) && rematchProposerIsMe && rematchOtherAcceptedCount === 0;
      // Adel (01/09/2026) : "à chaque fin de Battle ... le bouton en dessous
      // tout à la fin, souhaitez-vous enregistrer votre Battle" -- même esprit
      // Oui/Non que le solo, déclenché ici par le bouton plutôt qu'avant le
      // match (une arène a trop de points d'entrée -- matchmaking, invitation,
      // revanche -- pour demander proprement en amont).
      const rematchCost = stakeForRounds(arena.roundCount);
      const insufficientFreeForRematch = !myCreditStatus || myCreditStatus.remainingFree < rematchCost;
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
      return <View style={[s.root, isDesktopBattle && s.rootDesktop]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer le Battle" hitSlop={10} style={s.closeBattle} onPress={closeBattleArena}><Text style={s.closeBattleText}>×</Text></TouchableOpacity>
        <View style={s.header}><TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.back} onPress={backToArenaHome}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>LOKI MUSIC · BATTLE · FIN DU MATCH</Text><Text style={s.title}>{themeLabel(arena.themeCode)}</Text></View><Text style={s.round}>{arena.seats.length}J</Text></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.finishScroll}>
          {perfectBonusWinner ? (
            <Animated.View style={[s.perfectBonusCard, perfectBonusGlowStyle]}>
              <LokiFinishBurst tone="win" />
              <Animated.Text style={[s.perfectBonusSpark, jackpotScoreStyle]}>✦ 👑 PERFECT 👑 ✦</Animated.Text>
              <Text style={s.perfectBonusKicker}>SANS-FAUTE · LE PLUS RAPIDE</Text>
              <Text style={s.perfectBonusName}>@{perfectBonusWinner.username}</Text>
              <Text style={s.perfectBonusScore}>{arena.roundCount}/{arena.roundCount}</Text>
              <Animated.Text style={[s.perfectBonusAmount, jackpotScoreStyle]}>+{perfectBonusFree} FREE BONUS</Animated.Text>
              <Text style={s.perfectBonusHint}>{perfectBonusIsMine ? 'PERFECT + VITESSE : TU PRENDS LE BONUS LOKI' : 'Plusieurs sans-faute ? Seul le plus rapide prend le bonus.'}</Text>
            </Animated.View>
          ) : null}
          <Animated.View style={[s.finishHero, { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] }]}>
            {nobodyWon ? null : <LokiFinishBurst tone="win" />}
            {/* Adel (29/09/2026) : trophée 3D à la place de la photo ; il nargue le perdant. */}
            {nobodyWon ? <Text style={s.trophy}>🤝</Text> : <WinnerTrophy3D won={Boolean(arena.lastResult.won)} />}
            <Text style={s.finishTitle}>{nobodyWon ? 'PERSONNE N’A GAGNÉ' : `${winner!.username}`}</Text>
            <Text style={s.finishSub}>{nobodyWon ? 'Aucun point marqué : personne ne remporte ce Battle' : 'remporte ce Battle'}</Text>
            <View style={s.finishScore}><Animated.Text style={[s.finishScoreBig, jackpotScoreStyle]}>{winner?.score ?? arena.lastResult.score}</Animated.Text><Text style={s.finishScoreSlash}> pts</Text></View>
            {/* Adel (02/09/2026) : "@adel4A remporte ce Battle / -3 FREE"
                (rapporté comme un bug) -- le nom/score du haut sont ceux du
                VAINQUEUR, cette ligne est TOUJOURS le résultat du joueur qui
                regarde l'écran (arena.lastResult). Sans préfixe, "-3 FREE"
                juste sous le nom du gagnant lit comme une contradiction. */}
            <Text style={arena.lastResult.won ? s.finishWon : s.finishLost}>{arena.lastResult.won ? `TOI : +${arena.lastResult.creditDelta} FREE · GAGNÉ` : `TOI : ${arena.lastResult.creditDelta} FREE · MATCH TERMINÉ`}</Text>
            <LokiMascotVoice
              correct={arena.lastResult.won ? arena.roundCount : 0}
              total={arena.roundCount}
              textOverride={battleResultMessage(arena.id, arena.lastResult.matchNo, arena.lastResult.won, (battleWinReason(arena.lastMatchResults) || '').startsWith('⚡'), nobodyWon)}
              moodOverride={arena.lastResult.won ? 'party' : 'oops'}
              compact
            />
          </Animated.View>
          {/* Adel (03/09/2026) : "c'est à cet endroit-là qu'il faut rajouter
              un bouton accepte ou refuse pour la revanche" -- déplacé juste
              sous le score, premier élément visible sans défiler, au lieu
              d'être plus bas après CE MATCH/PALMARÈS où il pouvait passer
              inaperçu. Adel (02/09/2026) : "il faut que ça envoie un popup à
              tout le monde ... souhaitez-vous oui ou non, celui qui veut
              rentrer il rentre, celui qui veut arrêter il arrête" -- REVANCHE
              ne relance plus le match instantanément pour tout le groupe : ça
              propose, chacun répond, et seuls ceux qui ont dit oui rejouent. */}
          {rematchDeadline && arenaMeRematchReady !== true ? (
            <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}>
              <View style={s.inviteHead}>
                <View style={{ flex: 1 }}>
                  {/* Adel (03/09/2026) : "l'utilisateur, le pseudo, souhaite
                      prendre sa revanche. Acceptez-vous ?" -- même formulation
                      que partout ailleurs dans l'app pour une revanche (accueil
                      Battle, classement), au lieu d'un "Prêt pour la revanche ?"
                      générique sans nom. Le serveur n'expose pas qui a
                      spécifiquement proposé (rematchReady n'existe que sur
                      `me`) -- on nomme donc tous les autres membres du groupe,
                      identique au pop-up de stats et au bandeau du classement. */}
                  <Text style={s.inviteQuestion} numberOfLines={3}>🔁 {arena.seats.filter((seat) => seat.profileId !== arena.me?.profileId).map((seat) => `${seat.username}`).join(', ') || 'Le groupe'} souhaite prendre sa revanche. Acceptez-vous ?</Text>
                  <Text style={s.inviteLabel}>⚡ RÉPONSE OBLIGATOIRE</Text>
                </View>
              </View>
              <View style={s.inviteActions}>
                {/* Adel (02/09/2026) : "si je refuse, ça me remet en solo ou faire un
                  Battle" -- appuyer sur NON ne faisait que rafraîchir les
                  données de cette même arène (déjà déclinée serveur), sans
                  jamais quitter l'écran -- aucun bouton ne redirigeait nulle
                  part après un refus, seul un × ou ‹ séparé s'en sortait. Un
                  refus est déjà une sortie explicite : on quitte directement
                  vers l'accueil Battle, pas besoin d'un second geste. */}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={rematchResponding} style={[s.no, rematchResponding && s.actionDisabled]} onPress={() => {
                  if (rematchResponding) return;
                  Alert.alert(
                    'Refuser la revanche ?',
                    'Confirme uniquement si tu veux réellement refuser cette revanche.',
                    [
                      { text: 'ANNULER', style: 'cancel' },
                      {
                        text: 'REFUSER',
                        style: 'destructive',
                        onPress: () => {
                          setRematchResponding(true);
                          void respondKeepBattleArenaRematch(arena.id, false)
                            .then(() => { void stopTrackPreview(); setArena(null); })
                            .catch(() => {})
                            .finally(() => setRematchResponding(false));
                        },
                      },
                    ],
                  );
                }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={rematchResponding} style={[s.yes, rematchResponding && s.actionDisabled]} onPress={() => { unlockWebAudioForGesture(); setRematchResponding(true); void respondKeepBattleArenaRematch(arena.id, true).then(setArena).catch(() => {}).finally(() => setRematchResponding(false)); }}><Text style={s.yesText}>{rematchResponding ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity>
              </View>
            </Animated.View>
          ) : null}
          {rematchDeadline ? (
            <View style={s.rematchStatusCard}>
              <View style={s.rematchStatusHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rematchStatusTitle}>REVANCHE EN ATTENTE · RÉPONSE OBLIGATOIRE</Text>
                  <Text style={s.rematchStatusSummary}>{rematchAcceptedCount} accepté{rematchAcceptedCount > 1 ? 's' : ''} · {rematchWaitingCount} en attente{rematchDeclinedCount ? ` · ${rematchDeclinedCount} refus` : ''}</Text>
                </View>
                <Text style={s.rematchStatusClock}>ACCEPTER / REFUSER</Text>
              </View>
              <Text style={s.rematchStatusHint}>Le Battle attend les décisions explicites. Personne n’est sorti automatiquement par un compteur.</Text>
              <View style={s.rematchStatusList}>
                {rematchParticipants.length ? rematchParticipants.map((participant) => {
                  const label = participant.isProposer && participant.rematchReady === true ? 'DEMANDE ENVOYÉE' : participant.rematchReady === true ? '✓ ACCEPTÉ' : participant.rematchReady === false ? '× REFUSÉ / PARTI' : '… EN ATTENTE';
                  return <View key={participant.profileId} style={s.rematchStatusRow}><Text numberOfLines={1} style={s.rematchStatusName}>{participant.isMe ? 'Toi' : participant.username}</Text><Text style={[s.rematchStatusState, participant.rematchReady === true && s.rematchStatusAccepted, participant.rematchReady === false && s.rematchStatusDeclined]}>{label}</Text></View>;
                }) : <Text style={s.rematchStatusLoading}>Mise à jour des réponses…</Text>}
              </View>
              {canWithdrawRematch ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Retirer ma demande de revanche"
                  disabled={rematchCancelBusy}
                  style={[s.rematchWithdrawButton, rematchCancelBusy && s.actionDisabled]}
                  onPress={() => {
                    setRematchCancelBusy(true);
                    void cancelKeepBattleArenaRematch(arena.id).then((next) => {
                      setRematchParticipants([]);
                      setArena(next);
                    }).catch((error: any) => {
                      const message = String(error?.message || error || '');
                      if (message.includes('BATTLE_REMATCH_ALREADY_ACCEPTED')) Alert.alert('Revanche', 'Un joueur a déjà accepté. La demande ne peut plus être retirée.');
                      else Alert.alert('Revanche', 'Impossible de retirer la demande pour le moment.');
                    }).finally(() => setRematchCancelBusy(false));
                  }}
                >
                  <Text style={s.rematchWithdrawText}>{rematchCancelBusy ? 'RETRAIT…' : 'RETIRER MA DEMANDE'}</Text>
                </TouchableOpacity>
              ) : rematchProposerIsMe && rematchOtherAcceptedCount > 0 ? <Text style={s.rematchLockedHint}>Un joueur a déjà accepté : la revanche est engagée.</Text> : null}
            </View>
          ) : null}
          {/* Adel (02/09/2026) : "d'un côté les gagnants d'un côté les
              perdants, le nombre de secondes en tout petit ... pas besoin de
              mettre des photos, juste les trophées ... ça va inspirer TikTok
              pour les matchs" -- classement complet de CE match (pas le
              cumul multi-matchs de PALMARÈS ci-dessous), compact, sans avatar. */}
          {arena.lastMatchResults && arena.lastMatchResults.length > 0 ? (
            <View style={s.matchRanking}>
              <Text style={s.matchRankingTitle}>CE MATCH</Text>
              {/* Adel (29/09/2026) : « qu'on sache pourquoi on a gagné » -- une phrase, pas plus. */}
              {(() => { const reason = battleWinReason(arena.lastMatchResults); return reason ? <Text style={s.matchWinReason}>{reason}</Text> : null; })()}
              <View style={s.matchRankLegend}><Text style={[s.matchRankLegendText, { width: 70, textAlign: 'right' }]}>Points</Text><Text style={[s.matchRankLegendText, { width: 58, textAlign: 'center' }]}>✓ · ✕</Text><Text style={[s.matchRankLegendText, { width: 44, textAlign: 'right' }]}>Temps</Text></View>
              {arena.lastMatchResults.map((entry) => (
                <TouchableOpacity key={entry.profileId} accessibilityRole="button" onPress={() => onOpenProfile(entry.username)} style={[s.matchRankRow, entry.won ? s.matchRankRowWon : s.matchRankRowLost]}>
                  <Text style={s.matchRankTrophy}>{entry.placement === 1 ? '🏆' : entry.placement === 2 ? '🥈' : entry.placement === 3 ? '🥉' : entry.placement}</Text>
                  <Text numberOfLines={1} style={s.matchRankName}>{entry.username}</Text>
                  <Text style={s.matchRankScore}>{entry.score} pts</Text>
                  <Text style={s.matchRankCorrect}>✓{entry.correct}·✕{Math.max(0, arena.roundCount - entry.correct)}</Text>
                  <Text style={s.matchRankTime}>{(entry.responseMs / 1000).toFixed(1)}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {palmares.length ? <View style={s.palmares}><Text style={s.palmaresTitle}>PALMARÈS · TOP 3</Text>{palmares.map((entry, index) => <TouchableOpacity key={entry.profileId} accessibilityRole="button" onPress={() => onOpenProfile(entry.username)} style={s.palmaresRow}><Text style={s.palmaresRank}>{index + 1}</Text><Avatar name={entry.username} url={entry.avatarUrl} size={38} /><Text numberOfLines={1} style={s.palmaresName}>{entry.username}</Text><Text style={s.palmaresWins}>{entry.wins} victoire{entry.wins > 1 ? 's' : ''}</Text></TouchableOpacity>)}</View> : null}
          <Text style={s.finishQuestion}>Match terminé. Tu peux partir quand tu veux ou proposer une revanche.</Text>
          {/* Adel (02/09/2026) : "il faut que ça envoie un popup à tout le
              monde ... souhaitez-vous oui ou non, celui qui veut rentrer il
              rentre, celui qui veut arrêter il arrête" -- REVANCHE ne relance
              plus le match instantanément pour tout le groupe : ça propose,
              chacun répond, et seuls ceux qui ont dit oui rejouent. */}
          {!rematchDeadline ? (
            <TouchableOpacity disabled={busy || insufficientFreeForRematch} style={[s.finishPrimary, insufficientFreeForRematch && s.actionDisabled]} onPress={() => {
              if (insufficientFreeForRematch) {
                notEnoughFreeAlert(`Il te faut ${rematchCost} Free pour relancer ce Battle de ${arena.roundCount} morceaux. Solde actuel: ${myCreditStatus?.remainingFree ?? 0} Free`);
                return;
              }
              unlockWebAudioForGesture();
              setBusy(true);
              void proposeKeepBattleArenaRematch(arena.id).then(setArena).catch((e: any) => {
                const message = String(e?.message || e || '');
                if (message.includes('BATTLE_ARENA_FORBIDDEN')) Alert.alert('Battle', 'Tu ne fais plus partie de ce groupe. Rejoins un nouveau Battle.');
                else if (message.includes('BATTLE_REMATCH_ALREADY_PENDING')) Alert.alert('Revanche', 'Une demande de revanche est déjà en cours.');
                else if (message.includes('MINIMUM_THREE_FREE_REQUIRED')) notEnoughFreeAlert(`Il te faut au moins ${parseRequiredFree(message, stakeForRounds(arena.roundCount))} Free pour relancer ce Battle de ${arena.roundCount} morceaux`);
                else Alert.alert('Battle', 'Impossible de proposer une revanche pour le moment.');
              }).finally(() => setBusy(false));
            }}><Text style={s.finishPrimaryText}>{busy ? 'ENVOI…' : insufficientFreeForRematch ? 'INSUFFICIENT FREE' : 'REVANCHE'}</Text></TouchableOpacity>
          ) : null}
          {/* Adel (13/09/2026, viralité) : même bouton que la fin de partie
              solo -- un résultat de Battle en groupe (score, classement) est
              déjà le contenu le plus partageable de Loki. */}
          <TouchableOpacity style={s.finishSecondary} onPress={() => { void shareBattleResult(`${myLastResult.won ? 'GAGNÉ · ' : ''}${winner?.score ?? myLastResult.score} pts sur ${themeLabel(arena.themeCode)} · ${arena.seats.length}J`); }}><Text style={s.finishSecondaryText}>↗ PARTAGER MON RÉSULTAT</Text></TouchableOpacity>
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
          {arenaInviteOpen ? <View style={s.arenaInvitePanel}><Text style={s.arenaInviteTitle}>JOUEURS DISPONIBLES · GROUPE {arena.seats.length}/10</Text>{busy ? <ActivityIndicator color="#E5F266" /> : livePlayers.length ? <ScrollView style={s.arenaInviteScroll} contentContainerStyle={s.arenaInviteList}>{livePlayers.map((player) => { const pendingInvite = outgoingPendingByTarget[player.profileId]; const invited = Boolean(pendingInvite) || arenaInvitedIds.includes(player.profileId); const inviteRemaining = pendingInvite ? Math.max(0, new Date(pendingInvite.expiresAt).getTime() - now) : 0; const cancelling = Boolean(pendingInvite && cancelChallengeBusyId === pendingInvite.id); const blockedMs = (inviteBlockedUntil[player.profileId] || 0) - now; const blocked = blockedMs > 0; const targetShort = opponentNeedsMoreFree(player, arena.roundCount); return <View key={player.profileId} style={[s.arenaInviteRow, targetShort && s.liveRowInsufficient]}><TouchableOpacity onPress={() => onOpenProfile(player.username)}><Avatar name={player.username} url={player.avatarUrl} size={46} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={s.arenaInviteName}>{player.username}</Text><Text style={[s.arenaInviteMeta, targetShort && s.arenaInviteMetaShort]}>{pendingInvite ? `Invitation en attente · ${formatInviteCooldown(inviteRemaining)}` : targetShort ? `🎁 ${player.remainingFree}/${stakeForRounds(arena.roundCount)} Free · indisponible` : `● disponible · ${themeLabel(player.themeCode)}`}</Text></View><TouchableOpacity accessibilityRole="button" hitSlop={10} disabled={cancelling || blocked || targetShort || (invited && !pendingInvite) || Boolean(arenaInviteBusyId)} style={[s.arenaInviteButton, (blocked || targetShort || (invited && !pendingInvite)) && s.actionDisabled, targetShort && s.battleButtonCreditBlocked, pendingInvite && s.arenaInviteCancelButton]} onPress={() => { if (pendingInvite) requestCancelOutgoingChallenge(pendingInvite); else void invitePlayerToArena(player); }}><Text style={[s.arenaInviteButtonText, targetShort && s.battleButtonCreditBlockedText, pendingInvite && s.arenaInviteCancelText]}>{arenaInviteBusyId === player.profileId ? 'ENVOI…' : cancelling ? 'ANNULATION…' : blocked ? `⏳ ${formatInviteCooldown(blockedMs)}` : pendingInvite ? `ANNULER · ${formatInviteCooldown(inviteRemaining)}` : invited ? 'INVITÉ' : targetShort ? `${player.remainingFree}/${stakeForRounds(arena.roundCount)} FREE` : 'INVITER'}</Text></TouchableOpacity></View>; })}</ScrollView> : <Text style={s.arenaInviteEmpty}>Aucun autre joueur disponible pour le moment.</Text>}<TouchableOpacity style={s.arenaShareButton} onPress={() => { void shareArenaInvite(arena); }}><Text style={s.arenaShareButtonText}>INVITER UN AMI PAR LIEN</Text></TouchableOpacity></View> : null}
          {/* Adel (02/09/2026) : "quand j'appuie sur quitter, il faut que je
              quitte automatiquement et ça me remette sur soirée" -- QUITTER
              LE BATTLE ne devait ramener qu'à l'accueil Battle interne
              (JOUER SOLO / BATTLE EN LIGNE), pas sortir complètement comme le
              ×. Même comportement que closeBattleArena désormais. */}
          <TouchableOpacity style={s.finishSecondary} onPress={() => { setArenaInviteOpen(false); closeBattleArena(); }}><Text style={s.finishSecondaryText}>QUITTER LE BATTLE</Text></TouchableOpacity>
        </ScrollView>
      </View>;
    }
    if (arena.status === 'ACTIVE' && arena.me && arena.me.status !== 'ACTIVE') {
      const missedRematch = arena.me.status === 'ELIMINATED';
      return <View style={[s.root, isDesktopBattle && s.rootDesktop]}>
        <View style={s.header}><View style={s.headerMid}><Text style={s.kicker}>LOKI MUSIC · BATTLE</Text><Text style={s.title}>{missedRematch ? 'LE BATTLE EST PARTI' : 'EN ATTENTE'}</Text></View></View>
        <View style={s.waiting}>
          <View style={s.waitingPulse}><Text style={s.trophy}>{missedRematch ? '⏱' : '⚡'}</Text></View>
          <Text style={s.winner}>{missedRematch ? 'TU AS LOUPÉ CE TOUR' : 'TU REJOINS LA SUITE'}</Text>
          <Text style={s.waitText}>{missedRematch ? 'Désolé, le délai de réponse est terminé. Le Battle a démarré sans toi. Attends le prochain tour.' : 'Le Battle a déjà démarré. Ta place est gardée pour la suite.'}</Text>
          <TouchableOpacity style={s.finishSecondary} onPress={() => { void stopTrackPreview(); setArena(null); }} accessibilityRole="button" accessibilityLabel="Continuer ailleurs">
            <Text style={s.finishSecondaryText}>CONTINUER AILLEURS</Text>
          </TouchableOpacity>
        </View>
      </View>;
    }

    return <View style={[s.root, isDesktopBattle && s.rootDesktop]}>
      {/* Adel (03/09/2026) : "on est dans un Battle, pourquoi elle reste" --
          la croix de fermeture n'a plus lieu d'être une fois la manche
          lancée (WAITING/ACTIVE) ; sortir se fait via ‹ (backToArenaHome)
          ou "QUITTER LE BATTLE" sur l'écran de fin. Conservée uniquement là. */}
      <Animated.View pointerEvents="none" style={[s.versus, { opacity: versusOpacity, transform: [{ scale: versusScale }] }]}><Text style={s.versusText}>⚡ BATTLE ⚡</Text><Text style={s.versusNames} numberOfLines={2}>{versusLabel}</Text></Animated.View>
      <View style={s.playHeader}><TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Quitter le Battle" style={s.playBack} onPress={backToArenaHome}><Text style={s.playBackText}>‹</Text></TouchableOpacity><Text numberOfLines={1} style={s.playMode}>EN LIGNE · {arena.seats.length}J · {themeLabel(round?.themeCode || arena.themeCode)}</Text><Text style={s.playRound}>{arena.currentRound || 0}/{arena.roundCount}</Text><Text style={s.playStake}>🎁 {stakeForRounds(arena.roundCount)}</Text></View>
      {/* Adel (03/09/2026) : "on voit pas les titres en dessous, on voit pas
          la suite du bas" -- vrai bug : cet écran n'avait AUCUN scroll, donc
          dès que la grille d'équipes ajoutait ne serait-ce qu'une ligne de
          hauteur en plus, la question et les réponses 2/3 sortaient de
          l'écran sans aucun moyen d'y accéder. ScrollView de secours, en plus
          (pas à la place) du carré compact -- jamais plus de contenu
          totalement inatteignable pendant un chrono de quelques secondes. */}
      {/* Adel (02/10/2026) : « y a toute la place, descends les boutons et
          laisse un carré plus grand pour l'image » -- pendant la manche, le
          visuel prend toute la hauteur libre (carré au maximum) et pousse
          les réponses vers le bas ; jamais sous 118 px. */}
      {arenaIdlePromptAt !== null ? (
        <View style={s.idleOverlay} accessibilityViewIsModal>
          <View style={s.idleCard}>
            <Text style={s.idleEmoji}>😴</Text>
            <Text style={s.idleTitle}>Tu es toujours là ?</Text>
            <Text style={s.idleText}>
              {`Tu n’as répondu à aucune des 2 dernières manches. Sans réponse dans ${Math.max(0, Math.ceil((arenaIdlePromptAt + SOLO_IDLE_AUTO_CLOSE_MS - now) / 1000))} s, tu quittes le Battle et la règle d’abandon s’applique.`}
            </Text>
            <View style={s.idleActions}>
              <TouchableOpacity
                style={s.idleStop}
                accessibilityRole="button"
                onPress={() => {
                  const arenaId = arena.id;
                  setArenaIdlePromptAt(null);
                  void stopTrackPreview();
                  void leaveKeepBattleArena(arenaId).catch(() => {});
                  useGameSessionStore.getState().clearGameSession();
                  setArena(null);
                }}
              >
                <Text style={s.idleStopText}>Arrêter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.idleGo}
                accessibilityRole="button"
                onPress={() => {
                  unlockWebAudioForGesture();
                  const arenaId = arena.id;
                  void acknowledgeKeepBattleArenaPresence(arenaId)
                    .then(() => {
                      arenaMissRef.current.streak = 0;
                      setArenaMissStreak(0);
                      setArenaIdlePromptAt(null);
                      void refreshArena();
                    })
                    .catch(() => {});
                }}
              >
                <Text style={s.idleGoText}>Je suis là !</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
      <ScrollView scrollEnabled={arena.status !== "ACTIVE"} bounces={arena.status !== "ACTIVE"} style={s.arenaScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[s.arenaScrollContent, arena.status === 'ACTIVE' && round ? s.arenaScrollContentActive : null]}>
      {arena.status === "WAITING" && arena.matchNo > 0 && !arena.lastResult ? <View style={s.waiting}><View style={s.waitingPulse}><Text style={s.trophy}>🏆</Text></View><Text style={s.winner}>RÉSULTATS EN CHARGEMENT</Text><Text style={s.waitText}>Compilation de vos scores...</Text></View> : null}
      {arena.status === "WAITING" && (arena.matchNo === 0 || arena.lastResult) ? <View style={s.waiting}><View style={s.waitingPulse}><Text style={s.trophy}>⚡</Text></View><Text style={s.winner}>{arena.seats.length < 2 ? (arena.pendingInviteCount > 0 ? "INVITATION ENVOYÉE" : "EN ATTENTE") : "JOUEURS EN SYNCHRONISATION"}</Text><Text style={s.waitText}>{arena.seats.length >= 2 ? "Tout le monde est prêt. Le même extrait démarre pour tous." : arena.pendingInviteCount > 0 ? `${arena.pendingInviteCount} réponse${arena.pendingInviteCount > 1 ? "s" : ""} en attente · tu peux continuer à inviter d’autres joueurs.` : "Invite un adversaire ou partage le lien pour démarrer."}</Text>{arena.pendingInviteCount > 0 ? <View style={s.waitingStatusPill}><Text style={s.waitingStatusText}>EN ATTENTE DE RÉPONSE</Text></View> : null}</View> : null}
      {arena.status === 'WAITING' ? Object.values(outgoingPendingByTarget).filter((item) => item.arenaId === arena.id && new Date(item.expiresAt).getTime() > now).map((item) => { const inviteRemaining = Math.max(0, new Date(item.expiresAt).getTime() - now); const cancelling = cancelChallengeBusyId === item.id; return <View key={item.id} style={s.pendingArenaInvite}><View style={{ flex: 1 }}><Text style={s.pendingArenaInviteName}>@{item.username} · EN ATTENTE</Text><Text style={s.pendingArenaInviteMeta}>Réponse possible encore {formatInviteCooldown(inviteRemaining)}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Annuler l’invitation envoyée à ${item.username}`} disabled={cancelling} style={[s.pendingArenaInviteCancel, cancelling && s.actionDisabled]} onPress={() => requestCancelOutgoingChallenge(item)}><Text style={s.pendingArenaInviteCancelText}>{cancelling ? 'ANNULATION…' : 'ANNULER'}</Text></TouchableOpacity></View>; }) : null}
      {arena.status === 'ACTIVE' && round ? <><Animated.View style={[s.card, s.arenaCardActive, { minHeight: roundCardMinHeight }, { transform: [{ scale: pulse }] }]}><View testID="battle-round-visual" style={[s.visual, s.arenaVisualActive, { maxHeight: arenaVisualMax, maxWidth: arenaVisualMax }]}>{round.revealed && round.artworkUrl ? <RevealArtwork uri={round.artworkUrl} /> : <EqualizerBars />}{!round.revealed ? <View pointerEvents="none" style={s.roundQuestionPillWrap}><Text style={s.roundQuestionPill}>QUI CHANTE ?</Text></View> : null}{!round.revealed ? <View pointerEvents="none" style={s.roundEncouragementOverlay}><Text style={s.roundEncouragementText}>{soloEncouragement(Math.max(0, (arena.currentRound || 1) - 1), arena.roundCount)}</Text></View> : null}{round.revealed ? <View style={s.result}><Text style={round.myAnswer?.correct ? s.good : s.bad}>{round.myAnswer?.correct ? 'GAGNÉ !' : round.answered ? 'PERDU' : 'OUPS · TROP TARD'}</Text><Text style={s.artist}>{round.artist || ''}</Text>{arena.roundWinner ? <Text style={s.roundWinner}>⚡ @{arena.roundWinner.username} gagne la manche en {(arena.roundWinner.responseMs / 1000).toFixed(1)}s</Text> : !round.myAnswer?.correct ? <Text testID="battle-round-no-winner" style={s.roundNoWinner}>😶 PERSONNE N’A TROUVÉ · aucun point sur cette manche</Text> : null}</View> : null}</View>
      <View style={s.clockRow}><Text style={[s.clock, ready && left < 2200 && s.clockHot]}>{ready ? `${(left / 1000).toFixed(1)}s` : 'PRÊT'}</Text></View><View style={s.timeTrack}><View style={[s.timeFill, { width: `${ready ? pct : 100}%` }]} /></View>
      {false ? <View style={s.duel}><View style={s.duelNames}><TouchableOpacity style={{ flex: 1 }} onPress={() => {}}><Text style={s.duelName}>{first.username}</Text><Text style={s.duelPoints}></Text></TouchableOpacity><View style={s.duelCenter}><Text style={s.duelScore}>VS</Text><Text style={s.duelTimer}>{`${Math.ceil(left / 1000)}s`}</Text></View><TouchableOpacity style={{ flex: 1 }} onPress={() => {}}><Text style={[s.duelName, { textAlign: 'right' }]}>{second.username}</Text><Text style={[s.duelPoints, { textAlign: 'right' }]}></Text></TouchableOpacity></View><View style={s.power}><Animated.View style={[s.powerLeft, { width: powerShareAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} /><View style={s.powerMiddle} /><View style={s.powerRight} /></View></View> : null}

      {/* Adel (02/09/2026) : "on a pas le même principe pour la mauvaise
          réponse qu'on ne la voit pas en rouge et en vert" -- en arène,
          révéler la manche cachait complètement les boutons de réponse au
          lieu de les surligner comme en solo (answerCorrect/answerWrong).
          Même principe visuel dans les deux modes désormais : les boutons
          restent affichés, désactivés, avec le vert sur la bonne réponse et
          le rouge sur mon mauvais choix. */}
      {/* Adel (03/09/2026) : "chaque utilisateur voit tout de suite s'il a
          gagné ou pas ... la musique se termine à la durée du temps" -- même
          principe que le solo (vert/rouge dès la réponse), mais SEULEMENT
          sur mon propre choix : round.artist reste caché aux autres joueurs
          jusqu'à round.revealed (anti-triche), donc on ne dévoile jamais
          lequel des 2 autres choix était le bon avant l'heure -- juste "j'ai
          eu bon" ou "j'ai eu faux" sur le bouton que j'ai pressé, sans
          attendre la fin de manche partagée. Le chrono/la musique continuent
          leur cours normal, inchangés. */}
      {/* Adel (05/09/2026) : quatre réponses alignées en solo et en ligne.
          Le serveur complète chaque manche avec un quatrième artiste réel ;
          les quatre boutons conservent la grille 2 × 2 existante. */}
      {ready && !round.answered && !round.revealed && left > 0 ? noVoiceButton : null}
      {!round.answered && arenaMissWarning(arenaMissStreak, stakeForRounds(arena.roundCount)) ? <Text style={s.arenaMissWarn} accessibilityRole="alert">{arenaMissWarning(arenaMissStreak, stakeForRounds(arena.roundCount))}</Text> : null}<View style={[s.answers, s.arenaAnswersActive]}>{(() => { const answers = dedupeAnswerChoices(round.choices || [], round.artist || '', (value) => value); if (answers.length < 4) console.warn(`[Battle ARENA] ${answers.length} < 4 réponses à la manche ${arena.currentRound}/${arena.roundCount}`); return answers.map((choice, i) => { const label = answerChoiceLabel(choice, answers); const state = answerVisualState(choice, round.artist || '', round.myAnswer?.selectedAnswer ?? null, Boolean(round.myAnswer)); return <TouchableOpacity key={choice} accessibilityLabel={state === 'correct' ? `${label}, bonne réponse` : state === 'wrong' ? `${label}, mauvaise réponse` : label} disabled={Boolean(!ready || round.answered || round.revealed || pending || noVoiceBusy || left <= 0)} onPress={() => { void answerArena(choice); }} style={[s.answer, (round.myAnswer?.selectedAnswer === choice || pending === choice) && !round.myAnswer && s.answerSelected, state === 'correct' && s.answerCorrect, state === 'wrong' && s.answerWrong]}><Text style={[s.answerNo, state === 'correct' && s.answerNoCorrect, state === 'wrong' && s.answerNoWrong]}>{state === 'correct' ? '✓' : state === 'wrong' ? '✕' : i + 1}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[s.answerText, state === 'correct' && s.answerTextCorrect]}>{label}</Text>{choice === round.myAnswer?.selectedAnswer && round.myAnswer?.responseMs != null ? <Text style={s.answerTime}>{(round.myAnswer.responseMs / 1000).toFixed(1)}s</Text> : null}</TouchableOpacity>; }); })()}</View>
      {arena.status !== 'ACTIVE' && players.length > 2 ? <View style={s.groupStandings}><TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: groupStandingsOpen }} style={s.groupStandingsToggle} onPress={() => setGroupStandingsOpen((v) => !v)}><Text style={s.groupStandingsTitle}>{players.length} JOUEURS · PRÊT</Text><Text style={s.groupStandingsChevron}>{groupStandingsOpen ? '⌃' : '⌄'}</Text></TouchableOpacity>{groupStandingsOpen ? (() => { const top = players.slice(0, 5); const meId = arena.me?.profileId; const meVisible = !meId || top.some((p) => p.profileId === meId); const mePlayer = meId ? players.find((p) => p.profileId === meId) : null; const visible = meVisible || !mePlayer ? top : [...top, mePlayer]; const hidden = players.length - visible.length; return <>{visible.map((player) => { const rank = players.findIndex((p) => p.profileId === player.profileId); return <TouchableOpacity key={player.profileId} style={[s.groupStandingRow, rank === 0 && s.groupStandingRowLead]} onPress={() => onOpenProfile(player.username)}><Text style={s.groupStandingRank}>{rank === 0 ? '👑' : `#${rank + 1}`}</Text><Text style={s.groupStandingName} numberOfLines={1}>{player.username}</Text><Text style={s.groupStandingScore}>{Number(player?.score || 0)} pts</Text></TouchableOpacity>; })}{hidden > 0 ? <Text style={s.groupStandingsMore}>+{hidden} autre{hidden > 1 ? 's' : ''}</Text> : null}</> })() : null}</View> : null}
      </Animated.View></> : null}
      </ScrollView>
    </View>;
  }

  if (browseOnline) {
    const browseChallengeRemaining = incoming[0] ? Math.max(0, Math.ceil((new Date(incoming[0].expiresAt).getTime() - now) / 1000)) : 0;
    // (21/09/2026) refonte sélection multiple : compteur et bouton de la
    // barre fixe -- au moins 1 adversaire sélectionné (le joueur connecté
    // est déjà le 2e participant du Battle) ET soi-même avec assez de Free
    // pour le nombre de morceaux choisi (même règle que le message
    // d'avertissement déjà affiché sous le sélecteur de morceaux).
    const eligiblePlayerCount = livePlayers.filter(isPlayerSelectable).length;
    const selectedLiveBattlePlayers = livePlayers.filter((player) => selectedBattlePlayerIds.has(player.profileId) && isPlayerSelectable(player));
    const creditReady = Boolean(myCreditStatus);
    const canStartSelectedBattle = selectedLiveBattlePlayers.length >= 1 && creditReady && !insufficientForRoundCount(roundCount) && !startingGroupBattle;
    return <View style={[s.root, isDesktopBattle && s.rootDesktop]}>
      {renderPlayerStatsModal()}
      <View style={s.header}><TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.back} onPress={() => setBrowseOnline(false)}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>LOKI MUSIC · BATTLE</Text><Text style={s.title}>Choisis tes adversaires</Text></View><View style={s.headerCreditPill}><Text style={s.headerCreditText}>🎁 {myCreditStatus?.remainingFree ?? '…'}</Text></View></View>
      <View style={s.lobbySummary}>
        <View style={s.lobbySummaryItem}><Text style={s.lobbySummaryValue}>{roundCount}</Text><Text style={s.lobbySummaryLabel}>MORCEAUX</Text></View>
        <View style={s.lobbySummaryDivider}/>
        <View style={s.lobbySummaryItem}><Text style={s.lobbySummaryValue}>{stakeForRounds(roundCount)}</Text><Text style={s.lobbySummaryLabel}>FREE / JOUEUR</Text></View>
        <View style={s.lobbySummaryDivider}/>
        <View style={s.lobbySummaryItem}><Text style={s.lobbySummaryValue}>{selectedLiveBattlePlayers.length + 1}</Text><Text style={s.lobbySummaryLabel}>JOUEURS</Text></View>
      </View>
      {/* Adel (04/09/2026) : "j'ai juste à envoyer une invite comme ça je
          puisse en envoyer plusieurs" -- BUG RÉEL : chaque appui sur BATTLE
          créait son propre match 1 contre 1 séparé, jamais un seul match à
          plusieurs. Le premier appui crée maintenant un salon de groupe ;
          ce bandeau reste affiché pour continuer à inviter d'autres joueurs
          de cette même liste avant de rejoindre le salon. */}
      {buildingArenaId ? <TouchableOpacity style={s.buildingArenaBanner} onPress={() => { void loadKeepBattleArena(buildingArenaId).then(setArena).catch(() => {}); }} accessibilityRole="button"><Text style={s.buildingArenaBannerText}>⚡ Salon en préparation · continue d’inviter ci-dessous, puis appuie ici pour le rejoindre</Text></TouchableOpacity> : null}
      {!incoming[0] && pendingRematch[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><View style={{ flex: 1 }}><Text style={s.inviteQuestion}>🔁 Revanche avec {pendingRematch[0].participantUsernames.map((u) => `${u}`).join(', ') || 'le groupe'}. On repart ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(pendingRematch[0].themeCode)} · RÉPONSE OBLIGATOIRE</Text></View></View><View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.no, rematchBannerBusyId && s.actionDisabled]} onPress={() => requestPendingRematchDecision(pendingRematch[0], false)}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.yes, rematchBannerBusyId && s.actionDisabled]} onPress={() => requestPendingRematchDecision(pendingRematch[0], true)}><Text style={s.yesText}>{rematchBannerBusyId === pendingRematch[0].arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>{incoming[0].username}</Text> te défie sur un Battle. Tu acceptes ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {incoming[0].roundCount} morceaux · RÉPONSE OBLIGATOIRE</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={!incomingDecisionReady || Boolean(respondingChallengeId)} style={[s.no, (!incomingDecisionReady || respondingChallengeId) && s.actionDisabled]} onPress={() => requestBattleChallengeDecision(incoming[0], false)}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={!incomingDecisionReady || Boolean(respondingChallengeId)} style={[s.yes, (!incomingDecisionReady || respondingChallengeId) && s.actionDisabled]} onPress={() => requestBattleChallengeDecision(incoming[0], true)}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}<Text style={s.section}>NOMBRE DE MORCEAUX</Text>{/* Adel (29/09/2026) : « pourquoi tu n'utilises pas la longueur complète ». 4 choix égaux sur toute la largeur. */}<View style={s.roundChipRow}>{ROUND_COUNT_OPTIONS.map((n) => { const short = insufficientForRoundCount(n); return <TouchableOpacity key={n} onPress={() => setRoundCount(n)} style={[s.theme, s.roundChip, n === roundCount && s.themeOn, short && s.themeShort]} accessibilityRole="button" accessibilityState={{ selected: n === roundCount }} accessibilityLabel={`${n} morceaux, Battle en ligne ${stakeForRounds(n)} Free`}><Text style={[s.themeText, n === roundCount && s.themeTextOn, short && s.themeTextShort]}>{n}</Text><Text style={[s.themeStake, n === roundCount && s.themeStakeOn, short && s.themeTextShort]}>🎁{stakeForRounds(n)}</Text></TouchableOpacity>; })}</View><Text style={s.perfectRuleHint}>👑 SANS-FAUTE {roundCount}/{roundCount} = +{stakeForRounds(roundCount)} FREE BONUS POUR CHAQUE JOUEUR PARFAIT</Text>{insufficientForRoundCount(roundCount) ? <MoreInfoLine tone="warn" icon="⚠" short="Free insuffisants" full={`Pour ${roundCount} morceaux il te faut ${stakeForRounds(roundCount)} Free, tu en as ${myCreditStatus?.remainingFree ?? 0}. Le Solo reste gratuit et te fait gagner des Free.`} /> : null}{renderMyPreferencesPicker()}
      {/* Adel (03/09/2026) : "un utilisateur pourra regarder le match en
          cours en tant que visiteur" -- keep_battle_open_salons existait déjà
          côté serveur (jamais branché à aucun écran) : liste les matchs
          WAITING/ACTIVE que n'importe qui peut suivre en spectateur. */}
      {openSalons.length ? <View style={s.liveMatches}><Text style={s.section}>MATCHS EN DIRECT</Text>{openSalons.map((salon) => <TouchableOpacity key={salon.id} style={s.liveMatchRow} onPress={() => { void startSpectating(salon); }}><PresenceDot online /><View style={{ flex: 1 }}><Text style={s.liveMatchTheme}>⚡ {salon.themeLabel} · {salon.players}/{salon.maxPlayers} joueurs</Text><Text style={s.liveMatchHost}>{salon.hostUsername}{salon.queue > 0 ? ` · ${salon.queue} en file` : ''}</Text></View><Text style={s.liveMatchWatch}>REGARDER ›</Text></TouchableOpacity>)}</View> : null}
      <ScrollView style={s.browseScroll} contentContainerStyle={s.browseScrollContent} showsVerticalScrollIndicator={false}>
      {busy ? <ActivityIndicator color="#E5F266" /> : livePlayers.length ? <View style={s.browseList}>{livePlayers.map((p) => {
        const rank = leaderboardRank[p.profileId];
        const rankBadge = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank ? `#${rank}` : null;
        const preferredLabel = p.preferredThemeCodes.length === 1 && p.preferredThemeCodes[0] === 'MIX' ? 'Mix' : p.preferredThemeCodes.map((c) => themeLabel(c)).join(', ');
        const short = insufficientForOpponent(p);
        const pendingInvite = outgoingPendingByTarget[p.profileId];
        const sent = Boolean(pendingInvite);
        const inviteRemaining = pendingInvite ? Math.max(0, new Date(pendingInvite.expiresAt).getTime() - now) : 0;
        const cancelling = Boolean(pendingInvite && cancelChallengeBusyId === pendingInvite.id);
        const blockedMs = (inviteBlockedUntil[p.profileId] || 0) - now;
        const blocked = blockedMs > 0;
        const sending = challengeBusyId === p.profileId;
        const selectable = isPlayerSelectable(p);
        const selected = selectedBattlePlayerIds.has(p.profileId);
        // (21/09/2026) : le bouton BATTLE par joueur devient un badge de
        // statut en lecture seule -- l'action de lancement passe par la
        // case à cocher + la barre fixe "Démarrer la Battle" ci-dessous.
        const soloRemaining = Number(p.soloRoundRemaining ?? 0);
        const inSolo = soloRemaining > 0;
        const approxSeconds = soloRemaining * Math.ceil((ROUND_MS + 800) / 1000);
        const waitLabel = approxSeconds >= 60 ? `~${Math.ceil(approxSeconds / 60)} min` : `~${approxSeconds}s`;
        const statusLabel = sending ? 'Envoi…' : blocked ? `Bloqué ${formatInviteCooldown(blockedMs)}` : pendingInvite ? `ANNULER · ${formatInviteCooldown(inviteRemaining)}` : short ? 'Crédits insuffisants' : inSolo ? `SOLO · ${soloRemaining} restant${soloRemaining > 1 ? 's' : ''} · ${waitLabel}` : 'Disponible';
        return <TouchableOpacity key={p.profileId} accessibilityRole={sent ? 'button' : 'checkbox'} accessibilityState={{ checked: selected, disabled: !selectable && !sent }} disabled={!selectable && !sent} activeOpacity={0.82} onPress={() => { if (pendingInvite) requestCancelOutgoingChallenge(pendingInvite); else toggleBattlePlayerSelection(p); }} style={[s.browsePlayer, selected && s.browsePlayerSelected, short && s.browsePlayerIneligible]}>
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled: !selectable }}
            accessibilityLabel={`Sélectionner ${p.username} pour la Battle${short ? ', crédits insuffisants' : ''}`}
            disabled={!selectable}
            hitSlop={8}
            style={[s.battleCheckbox, selected && s.battleCheckboxOn, !selectable && s.battleCheckboxDisabled]}
            onPress={(event) => { event.stopPropagation(); toggleBattlePlayerSelection(p); }}
          >
            {selected ? <Text style={s.battleCheckboxMark}>✓</Text> : null}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openPlayerStats(p)}><Avatar name={p.username} url={p.avatarUrl} size={48} /><View style={s.browseAvatarDot}><PresenceDot online /></View></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={(event) => { event.stopPropagation(); openPlayerStats(p); }} style={s.browseNameRow}><Text style={s.browseName}>{p.username}</Text>{livePlayerTiers[p.profileId] ? <ProfileCertificationBadge tier={livePlayerTiers[p.profileId]} compact /> : null}{rankBadge ? <Text style={s.browseRankBadge}>{rankBadge}</Text> : null}<Text style={s.browseChevron}>›</Text></TouchableOpacity>
            {/* Adel (09/09/2026) : "j'ai envoye une invite a un utilisateur qui n'a pas assez de Free, pourquoi il est visible ?" -- averti ici, avant meme de cocher la case. */}
            <Text style={[s.browseMeta, short && s.browseMetaShort]}>{short ? `🎁 Pas assez de Free (${p.remainingFree}/${stakeForRounds(roundCount)})` : inSolo ? `🎧 Partie en cours · invitation après le Solo` : `🎯 Accepte : ${preferredLabel} · ${p.preferredRoundCount} morceaux`}</Text>
          </View>
          <TouchableOpacity disabled={!pendingInvite || cancelling} onPress={(event) => { event.stopPropagation(); if (pendingInvite) requestCancelOutgoingChallenge(pendingInvite); }} style={[s.battleStatusBadge, (short || blocked) && s.battleStatusBadgeMuted, pendingInvite && s.battleStatusBadgeCancel]}><Text style={[s.battleStatusBadgeText, (short || blocked) && s.battleStatusBadgeTextMuted, pendingInvite && s.battleStatusBadgeCancelText]}>{cancelling ? 'ANNULATION…' : statusLabel}</Text></TouchableOpacity>
        </TouchableOpacity>;
      })}</View> : <View style={s.waiting}><Text style={s.trophy}>♫</Text><Text style={s.winner}>Aucun joueur solo visible</Text><Text style={s.waitText}>La liste se rafraîchit automatiquement.</Text><TouchableOpacity style={s.shareButton} onPress={() => { void shareInvite(); }}><Text style={s.shareButtonText}>INVITER UN AMI</Text></TouchableOpacity></View>}
      </ScrollView>
      {/* Adel (21/09/2026) : barre fixe "Démarrer la Battle" -- remplace le
          tap BATTLE joueur par joueur par une sélection groupée explicite.
          Réutilise le même `challenge()` (donc la même arène partagée, cf.
          buildingArenaIdRef) que l'ancien flux un-par-un : aucune nouvelle
          logique métier, uniquement l'UI de déclenchement qui change. */}
      <View style={s.battleSelectionFooter}>
        <View style={s.battleSelectionCopy}>
          <Text style={[s.battleSelectionCount, selectionRequired && { color: colors.danger }] }>{selectedLiveBattlePlayers.length ? `${selectedLiveBattlePlayers.length} adversaire${selectedLiveBattlePlayers.length > 1 ? 's' : ''} · ${selectedLiveBattlePlayers.length + 1} joueurs au total` : selectionRequired ? '⚠ SÉLECTIONNE AU MOINS 1 JOUEUR' : 'Sélectionne au moins 1 adversaire'}</Text>
          <Text style={s.battleSelectionHint}>{eligiblePlayerCount} joueur{eligiblePlayerCount > 1 ? 's' : ''} disponible{eligiblePlayerCount > 1 ? 's' : ''} · mise {stakeForRounds(roundCount)} Free chacun</Text>
        </View>
        <Animated.View style={[s.battleStartGlow, { borderColor: startGlow.interpolate({ inputRange: [0, 1], outputRange: [colors.primary, colors.primaryLight] }), opacity: startGlow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Démarrer la Battle avec les joueurs sélectionnés"
            accessibilityState={{ disabled: !creditReady || insufficientForRoundCount(roundCount) }}
            disabled={Boolean(startingGroupBattle || challengeBusyId || !creditReady || insufficientForRoundCount(roundCount))}
            style={[s.battleStartButton, selectionRequired && { borderColor: colors.danger }, (!creditReady || insufficientForRoundCount(roundCount)) && s.battleStartButtonDisabled]}
            onPress={() => { void startSelectedBattle(); }}
          >
            <Text style={[s.battleStartButtonText, (!creditReady || insufficientForRoundCount(roundCount)) && s.battleStartButtonTextDisabled]}>{startingGroupBattle ? 'DÉMARRAGE…' : !creditReady ? 'VÉRIFICATION…' : insufficientForRoundCount(roundCount) ? 'FREE INSUFFISANTS' : 'DÉMARRER'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>;
  }

  // Adel (02/09/2026) : "il faut la rajouter qu'on soit pas obligé de
  // cliquer sur Battle en ligne pour voir l'invite" -- l'écran d'accueil de
  // Battle (avant tout choix Solo/En ligne) ne rendait jamais la bannière
  // d'invite entrante, alors que le solo, l'écran de fin et "Joueurs
  // disponibles" le font tous. Même bloc, mêmes handlers `respond`.
  const homeChallengeRemaining = incoming[0] ? Math.max(0, Math.ceil((new Date(incoming[0].expiresAt).getTime() - now) / 1000)) : 0;
  // Adel (23/09/2026) : "le bouton du bas est pas visible" -- l'accueil du
  // Battle etait le seul ecran rendu sans ScrollView, donc sur un viewport
  // court le bouton "BATTLE EN LIGNE" passait sous la barre d'onglets. Meme
  // patron de secours que solo/arene/browse/finish : tout reste atteignable.
  return <View style={[s.root, isDesktopBattle && s.rootDesktop]}>{renderSoloSavePrompt()}<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.homeScroll}><View style={s.home}><TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.homeBack} onPress={onExit}><Text style={s.homeBackText}>‹</Text></TouchableOpacity>
      {/* Adel (08/09/2026) : "mettre un ? avec un popup pour expliquer
          l'avantage de jouer en solo, l'avantage de jouer en Battle en ligne
          ... plus ils vont pouvoir remporter des Free, ces Free vont servir
          à intégrer des artistes sur leur profil" -- pourquoi jouer, pas
          seulement comment. */}
      <TouchableOpacity hitSlop={A11Y_TOUCH_HIT_SLOP} style={s.homeHelp} accessibilityRole="button" accessibilityLabel="Tout comprendre sur Loki Music Battle" onPress={() => setHomeHelpOpen(true)}><Text style={s.homeHelpText}>?</Text></TouchableOpacity>
      <ContextHelpSheet
        visible={homeHelpOpen}
        title="Tout comprendre sur Battle"
        intro="Solo et Battle en ligne sont deux jeux différents. Voici la règle simple."
        steps={[
          { title: 'Solo = tu joues seul', text: 'Choisis tes styles et 8, 15, 20 ou 30 morceaux. Le Solo ne demande pas de mise FREE et peut te faire gagner des FREE.' },
          { title: 'Battle = tu défies quelqu’un', text: 'Tu joues contre un ou plusieurs utilisateurs. Une mise FREE peut être engagée selon le nombre de morceaux.' },
          { title: 'Tes styles Battle/Solo', text: 'Ces styles servent au jeu uniquement. Ils restent séparés de tes goûts musicaux Loki Pulse.' },
          { title: 'Gagnés et perdus aujourd’hui', text: 'Les compteurs affichent seulement la journée Battle en cours, de 02:00 à 01:59 le lendemain.' },
          { title: 'À quoi servent les FREE ?', text: 'Ils servent notamment à garder des morceaux dans ton profil et à certaines actions Battle. L’écoute seule reste gratuite.' },
          { title: 'Invitations', text: 'Quand quelqu’un te défie, tu peux accepter ou refuser. Tu peux aussi couper Battle depuis ton profil si tu ne veux plus recevoir de défis.' },
        ]}
        onClose={() => setHomeHelpOpen(false)}
      />
      <View style={s.battleHeroCompact}>
        <Text style={s.homeSub}>⚡ Écoute · réponds · affronte</Text>
      </View></View>{myPlayerStats || myCreditStatus ? (
        // Adel (29/09/2026) : « les compteurs le plus important, c'est les
        // Free restants, les Free gagnés et les Free perdus ; tout le reste,
        // un petit hamburger comme pour le profil ». Les 3 compteurs Free
        // restent visibles ; Victoires / Matchs / Bonnes rép. / Abonnés se
        // déplient avec PLUS.
        <View style={s.playerStatsContainer}>
          <View style={s.playerStatsBigRow}>
            <View style={[s.playerStatsBigItem, s.freeStatMain]}>
              <Text style={[s.playerStatsBigValue, s.freeStatValueMain]}>{myCreditStatus?.remainingFree ?? myPlayerStats?.freeBalance ?? 0}</Text>
              <Text style={s.playerStatsBigLabel}>Free restants</Text>
            </View>
            <View style={s.playerStatsBigItem}>
              <Text style={[s.playerStatsBigValue, s.freeStatWon]}>+{myPlayerStats?.freeWon ?? 0}</Text>
              <Text style={s.playerStatsBigLabel}>FREE gagnés aujourd’hui</Text>
            </View>
            <View style={s.playerStatsBigItem}>
              <Text style={[s.playerStatsBigValue, s.freeStatLost]}>−{myPlayerStats?.freeLost ?? 0}</Text>
              <Text style={s.playerStatsBigLabel}>FREE perdus aujourd’hui</Text>
            </View>
            <TouchableOpacity style={s.statsMore} accessibilityRole="button" accessibilityLabel={statsExpanded ? 'Masquer les autres compteurs' : 'Afficher les autres compteurs'} accessibilityState={{ expanded: statsExpanded }} hitSlop={8} onPress={() => setStatsExpanded((v) => !v)}>
              <Text style={s.statsMoreIcon}>{statsExpanded ? '✕' : '☰'}</Text>
              <Text style={s.statsMoreText}>{statsExpanded ? 'MOINS' : 'PLUS'}</Text>
            </TouchableOpacity>
          </View>
          {/* Adel (29/09/2026) : « un bouton c'est un bouton, une info c'est une
              info ». Toutes les infos de quota vivent ici, au-dessus des
              boutons : recharge Free, Solos restants, règle par profil. */}
          <Text style={s.dailyFreeReset}>JOURNÉE BATTLE · RESET 02:00</Text>
          <View style={s.quotaInfo}>
            {/* 29/09/2026 : une seule ligne sous les compteurs, Solos à gauche,
                recharge des Free à droite (« en face de prochaine recharge »). */}
            <View style={s.quotaRow}>
              {(() => { const q = soloQuotaCopy(soloDailyStatus); return q ? <View style={s.quotaCell}><Text style={[s.soloQuotaText, q.exhausted && s.soloQuotaExhausted]} numberOfLines={1}>🎯 {q.headline}</Text><Text style={s.quotaSub} numberOfLines={1}>{q.detail}</Text></View> : null; })()}
              {freeRecharge ? <View style={s.quotaCell}><Text style={s.freeRechargeText} numberOfLines={1}>🔄 {freeRecharge}</Text><Text style={s.quotaSub} numberOfLines={1}>prochain crédit de Free</Text></View> : null}
            </View>
{soloQuotaCopy(soloDailyStatus)?.exhausted ? (
              <TouchableOpacity style={s.soloPackEntry} onPress={() => { void openSoloPacks(); }} accessibilityRole="button" accessibilityLabel="Acheter des Solos">
                <Text style={s.soloPackEntryText}>＋ ACHETER DES SOLOS</Text>
                <Text style={s.soloPackEntryHint}>{soloRechargeCopy(soloPacks?.packs, soloDailyStatus).hint}</Text>
              </TouchableOpacity>
            ) : null}
            {soloQuotaCopy(soloDailyStatus)?.exhausted ? (() => { const info = soloRechargeCopy(soloPacks?.packs, soloDailyStatus); return <MoreInfoLine icon="ⓘ" short={info.short} full={info.full} />; })() : null}
            {(() => { const rule = soloPlanRuleCopy(soloDailyStatus, soloPacks?.bonusRemaining ?? 0); return rule ? <MoreInfoLine icon="ⓘ" short={rule.short} full={rule.full} /> : null; })()}
            <FreeEarnHelp highlight={insufficientForRoundCount(roundCount)} onShare={() => { void shareInvite(); }} onSolo={() => { void startSolo(); }} onOffers={onOpenOffers} />
          </View>
          {statsExpanded && myPlayerStats ? (
            <View>
              <View style={s.playerStatsSmallRow}>
                <View style={s.playerStatsSmallItem}><Text style={s.playerStatsSmallValue}>{myPlayerStats.wins}</Text><Text style={s.playerStatsSmallLabel}>Victoires</Text></View>
                <View style={s.playerStatsSmallItem}><Text style={s.playerStatsSmallValue}>{myPlayerStats.matchesPlayed}</Text><Text style={s.playerStatsSmallLabel}>Matchs</Text></View>
                <View style={s.playerStatsSmallItem}><Text style={s.playerStatsSmallValue}>{myPlayerStats.totalCorrect}</Text><Text style={s.playerStatsSmallLabel}>Bonnes rép.</Text></View>
                <View style={s.playerStatsSmallItem}><Text style={s.playerStatsSmallValue}>{myPlayerStats.followers}</Text><Text style={s.playerStatsSmallLabel}>Abonnés</Text></View>
              </View>
              <View style={s.abandonStatsRow}>
                <View style={s.abandonStatsItem}><Text style={s.abandonStatsValue}>{myPlayerStats.soloAbandons ?? mySoloRank?.abandons ?? 0}</Text><Text style={s.abandonStatsLabel}>Abandons Solo</Text></View>
                <View style={s.abandonStatsItem}><Text style={s.abandonStatsValue}>{myPlayerStats.battleAbandons ?? 0}</Text><Text style={s.abandonStatsLabel}>Abandons Battle</Text></View>
                <View style={s.abandonStatsItem}><Text style={s.abandonStatsValue}>{myPlayerStats.abandons ?? ((myPlayerStats.soloAbandons ?? 0) + (myPlayerStats.battleAbandons ?? 0))}</Text><Text style={s.abandonStatsLabel}>Total</Text></View>
              </View>
              {onOpenLeaderboard ? (
                <TouchableOpacity testID="solo-leaderboard-more" style={s.rankingMoreAction} onPress={() => { setSoloRankDelta(0); onOpenLeaderboard(); }} accessibilityRole="button" accessibilityLabel="Ouvrir le classement Solo depuis Plus">
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rankingMoreTitle}>🏆 CLASSEMENT SOLO</Text>
                    <Text style={s.rankingMoreMeta}>{mySoloRank?.rank ? '#' + mySoloRank.rank + (mySoloRank.totalPlayers ? ' sur ' + mySoloRank.totalPlayers : '') : 'Voir le classement des utilisateurs'}</Text>
                  </View>
                  {soloRankDelta > 0 ? <View style={s.rankingMoreDelta}><Text style={s.rankingMoreDeltaText}>↑{soloRankDelta}</Text></View> : null}
                  <Text style={s.rankingMoreChevron}>›</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}{!incoming[0] && pendingRematch[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><View style={{ flex: 1 }}><Text style={s.inviteQuestion}>🔁 Revanche avec {pendingRematch[0].participantUsernames.map((u) => `${u}`).join(', ') || 'le groupe'}. On repart ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(pendingRematch[0].themeCode)} · RÉPONSE OBLIGATOIRE</Text></View></View><View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.no, rematchBannerBusyId && s.actionDisabled]} onPress={() => requestPendingRematchDecision(pendingRematch[0], false)}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.yes, rematchBannerBusyId && s.actionDisabled]} onPress={() => requestPendingRematchDecision(pendingRematch[0], true)}><Text style={s.yesText}>{rematchBannerBusyId === pendingRematch[0].arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>{incoming[0].username}</Text> te défie sur un Battle. Tu acceptes ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {incoming[0].roundCount} morceaux · RÉPONSE OBLIGATOIRE</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={!incomingDecisionReady || Boolean(respondingChallengeId)} style={[s.no, (!incomingDecisionReady || respondingChallengeId) && s.actionDisabled]} onPress={() => requestBattleChallengeDecision(incoming[0], false)}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={!incomingDecisionReady || Boolean(respondingChallengeId)} style={[s.yes, (!incomingDecisionReady || respondingChallengeId) && s.actionDisabled]} onPress={() => requestBattleChallengeDecision(incoming[0], true)}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}<View style={s.battleSetupCard}>
        <View style={s.battleSetupHeader}><View style={s.battleSetupHeaderCopy}><Text style={s.battleSetupEyebrow}>FORMAT DU BATTLE</Text><Text style={s.battleSetupTitle}>{roundCount} morceaux · Solo gratuit · Battle {stakeForRounds(roundCount)} Free</Text></View><Text style={s.battleSetupBadge} numberOfLines={1}>10 s / titre</Text></View>
        <Text style={s.section}>NOMBRE DE MORCEAUX</Text>
        {/* Adel (29/09/2026) : « pourquoi tu n'utilises pas la longueur complète ». 4 choix égaux sur toute la largeur. */}<View style={s.roundChipRow}>{ROUND_COUNT_OPTIONS.map((n) => { const short = insufficientForRoundCount(n); return <TouchableOpacity key={n} onPress={() => setRoundCount(n)} style={[s.theme, s.roundChip, n === roundCount && s.themeOn, short && s.themeShort]} accessibilityRole="button" accessibilityState={{ selected: n === roundCount }} accessibilityLabel={`${n} morceaux, Battle en ligne ${stakeForRounds(n)} Free`}><Text style={[s.themeText, n === roundCount && s.themeTextOn, short && s.themeTextShort]}>{n}</Text><Text style={[s.themeStake, n === roundCount && s.themeStakeOn, short && s.themeTextShort]}>{stakeForRounds(n)} Free</Text></TouchableOpacity>; })}</View>
        {insufficientForRoundCount(roundCount) ? <MoreInfoLine tone="warn" icon="⚠" short="Free insuffisants" full={`Pour un Battle en ligne de ${roundCount} morceaux il faut ${stakeForRounds(roundCount)} Free, tu en as ${myCreditStatus?.remainingFree ?? 0}. Le Solo reste gratuit et te fait gagner des Free.`} /> : null}
        {renderMyPreferencesPicker()}
      </View>
      {/* Adel (29/09/2026) : « le bouton Solo est trop petit… l'utilisateur
          doit comprendre qu'il a un nombre limité de solos selon sa formule »
          + « plutôt Battle qu'en ligne ». Deux grandes cartes empilées : le
          quota Solo et sa recharge sont écrits dans le bouton lui-même. */}
      <View style={s.battleModes}>
        {/* Adel (29/09/2026) : « pourquoi l'un sur l'autre… une couleur
            différente ». Deux cartes jumelles côte à côte, même couleur :
            seul le contenu change (icône, promesse, quota / mise). */}
        {/* Boutons purs : icône + un mot. Les infos sont au-dessus. */}
        <TouchableOpacity style={[s.modeCard, soloDailyStatus && !soloDailyStatus.unlimited && (soloDailyStatus.remaining ?? 1) <= 0 && s.modeCardExhausted]} disabled={busy} onPress={() => { void startSolo(); }} accessibilityRole="button" accessibilityLabel="Jouer en solo">
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={s.modeIconText}>◎</Text><Text style={s.modeTitle}>SOLO</Text></>}
        </TouchableOpacity>
        <TouchableOpacity style={[s.modeCard, insufficientForRoundCount(roundCount) && s.modeCardExhausted]} disabled={busy} onPress={() => { void openOnline(); }} accessibilityRole="button" accessibilityLabel="Jouer en ligne">
          <Text style={s.modeIconText}>⚡</Text><Text style={s.modeTitle}>EN LIGNE</Text>
        </TouchableOpacity>
      </View></ScrollView></View>;
}

const s = StyleSheet.create({
  root: { width: '100%', flex: 1, paddingBottom: 0, position: 'relative' },
  rootDesktop: { maxWidth: 430, alignSelf: 'center' },
  soloSaveBackdrop: { flex: 1, backgroundColor: 'rgba(5,4,10,.76)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  soloSaveCard: { width: '100%', maxWidth: 390, borderRadius: 24, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.backgroundElevated, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 14 },
  soloSaveEyebrow: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textAlign: 'center' },
  soloSaveTitle: { color: colors.textPrimary, fontSize: 20, lineHeight: 25, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  soloSaveCost: { color: colors.success, fontSize: 12, lineHeight: 17, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  soloSaveBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  soloSaveActions: { flexDirection: 'row', alignItems: 'stretch', gap: 6, marginTop: 16 },
  soloSaveButton: { flex: 1, minWidth: 0, minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  soloSaveCancel: { backgroundColor: colors.backgroundCard, borderColor: colors.border },
  soloSavePlay: { backgroundColor: '#1B1422', borderColor: colors.primaryLight },
  soloSaveKeep: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  soloSaveCancelText: { color: colors.textMutedGrey, fontSize: 10, fontWeight: '900' },
  soloSavePlayText: { color: colors.textPrimary, fontSize: 11, fontWeight: '900' },
  soloSaveKeepText: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: .1 },
  matchContextBar: { minHeight: 32, marginBottom: 5, paddingHorizontal: 9, borderRadius: 12, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchContextMode: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: .7 },
  matchContextText: { flex: 1, color: colors.textMutedGrey, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  matchContextStake: { color: colors.success, fontSize: 11, fontWeight: '900' },
  battleHero: { minHeight: 76, marginHorizontal: 42, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  battleHeroCompact:{marginHorizontal:42,minHeight:30,alignItems:'center',justifyContent:'center',position:'relative'},
  soloLeaderboardMini:{position:'absolute',right:-38,top:-2,minHeight:28,minWidth:54,paddingHorizontal:7,borderRadius:14,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  soloLeaderboardMiniText:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.2},
  soloLeaderboardDelta:{position:'absolute',right:-5,top:-7,minWidth:20,height:18,paddingHorizontal:4,borderRadius:9,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center'},
  soloLeaderboardDeltaText:{color:'#08110F',fontSize:9,fontWeight:'900'},

  battleHeroMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(124,92,252,.18)', borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  battleHeroCopy: { flex: 1, minWidth: 0 },
  homeCreditPill: { minHeight: 30, paddingHorizontal: 9, borderRadius: 15, backgroundColor: 'rgba(45,225,194,.10)', borderWidth: 1, borderColor: 'rgba(45,225,194,.45)', alignItems: 'center', justifyContent: 'center' },
  homeCreditText: { color: colors.success, fontSize: 11, fontWeight: '900' },
  battleSetupCard: { marginTop: 8, padding: 12, borderRadius: 22, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  battleSetupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  battleSetupEyebrow: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  battleSetupHeaderCopy: { flex: 1, minWidth: 0 },
  battleSetupTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '900', marginTop: 3 },
  battleSetupBadge: { flexShrink: 0, color: colors.textMutedGrey, fontSize: 11, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  battleModes: { gap: 10, marginTop: 12, flexDirection: 'row', alignItems: 'stretch' },
  modeCard: { flex: 1, minWidth: 0, minHeight: 64, borderRadius: 20, backgroundColor: colors.backgroundCard, borderWidth: 1.5, borderColor: colors.primary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  quotaInfo: { marginTop: 2, gap: 2, alignItems: 'center' },
  quotaRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  quotaCell: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 6, borderRadius: 12, backgroundColor: '#1B1422' },
  quotaSub: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '700', marginTop: 1 },
  soloQuotaText: { color: colors.success, fontSize: 12, lineHeight: 16, fontWeight: '900', textAlign: 'center' },
  modeCardExhausted: { borderColor: colors.border, opacity: .85 },
  modeTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: .6 },
  soloQuotaExhausted: { color: colors.warning },
  statsMore: { width: 58, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#1B1422' },
  statsMoreIcon: { color: colors.primaryLight, fontSize: 16, fontWeight: '900' },
  statsMoreText: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '900', marginTop: 2 },
  freeStatMain: { borderWidth: 1, borderColor: 'rgba(45,225,194,.45)', backgroundColor: 'rgba(45,225,194,.08)' },
  freeStatValueMain: { color: colors.success, fontSize: 22 },
  freeStatWon: { color: colors.success },
  freeStatLost: { color: colors.danger },
  freeRechargeText: { color: colors.textPrimary, fontSize: 12, lineHeight: 16, fontWeight: '900', textAlign: 'center' },
  modeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeIconText: { color: colors.primaryLight, fontSize: 20, fontWeight: '900' },
  headerCreditPill: { minWidth: 48, minHeight: 30, borderRadius: 15, paddingHorizontal: 8, backgroundColor: 'rgba(45,225,194,.10)', borderWidth: 1, borderColor: 'rgba(45,225,194,.38)', alignItems: 'center', justifyContent: 'center' },
  headerCreditText: { color: colors.success, fontSize: 11, fontWeight: '900' },
  lobbySummary: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 16, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  lobbySummaryItem: { flex: 1, alignItems: 'center' },
  lobbySummaryValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  lobbySummaryLabel: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '900', letterSpacing: .7, marginTop: 2, textAlign: 'center' },
  lobbySummaryDivider: { width: 1, height: 26, backgroundColor: colors.border },
  battleSelectionCopy: { flex: 1, minWidth: 0 },
  battleSelectionHint: { color: colors.textMutedGrey, fontSize: 11, lineHeight: 13, fontWeight: '700', marginTop: 3 },
  statsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: 18 }, statsCard: { width: '100%', maxWidth: 400, borderRadius: 26, padding: 20, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369' }, statsClose: { position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: '#1F1830', alignItems: 'center', justifyContent: 'center', zIndex: 2 }, statsCloseText: { color: '#FFF', fontSize: 20, lineHeight: 22, fontWeight: '700' }, statsUsername: { color: '#FFF', fontSize: 20, fontWeight: '900', marginBottom: 14, paddingRight: 40 }, statsBigRow: { flexDirection: 'row', gap: 8 }, statsBigItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: '#1B1422' }, statsBigValue: { color: '#E5F266', fontSize: 22, fontWeight: '900' }, statsBigLabel: { color: '#B79CFF', fontSize: 11, fontWeight: '800', marginTop: 2, textAlign: 'center' }, statsSmallRow: { flexDirection: 'row', gap: 6, marginTop: 6 }, statsSmallItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 12, backgroundColor: '#17121D' }, statsSmallValue: { color: '#FFF', fontSize: 13, fontWeight: '900' }, statsSmallValueLost: { color: colors.danger }, statsSmallLabel: { color: '#8F879D', fontSize: 11, fontWeight: '800', marginTop: 1, textAlign: 'center' }, statsAvg: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 12 }, statsSectionTitle: { color: '#E5F266', fontSize: 11, fontWeight: '900', letterSpacing: .8, marginTop: 20, marginBottom: 8 }, statsThemeRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#1B1422', marginBottom: 6 }, statsThemeLabel: { color: '#FFF', fontSize: 12, fontWeight: '900' }, statsThemeValue: { color: '#B79CFF', fontSize: 11, fontWeight: '800' }, statsThemeEmpty: { color: '#B79CFF', fontSize: 12, lineHeight: 16, fontWeight: '700' }, statsActionsRow: { flexDirection: 'row', gap: 8, marginTop: 18 }, statsFollowButton: { flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }, statsFollowButtonText: { color: '#C4B5FD', fontSize: 11, fontWeight: '900' }, statsProfileButtonSmall: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }, statsProfileButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' }, statsChallengeDisabled: { opacity: 0.5 }, statsChallengeDisabledText: { color: colors.warning },
  playerStatsContainer: { marginVertical: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: '#17121D', borderWidth: 1, borderColor: '#30273A' }, playerStatsBigRow: { flexDirection: 'row', gap: 6, marginBottom: 8 }, playerStatsBigItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: '#1B1422' }, playerStatsBigValue: { color: colors.primaryLight, fontSize: 18, fontWeight: '900' }, playerStatsBigLabel: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '800', marginTop: 2, textAlign: 'center' }, playerStatsSmallRow: { flexDirection: 'row', gap: 5 }, playerStatsSmallItem: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: '#1B1422' }, playerStatsSmallValue: { color: '#FFF', fontSize: 12, fontWeight: '900' }, playerStatsSmallLabel: { color: '#8F879D', fontSize: 11, fontWeight: '800', marginTop: 1, textAlign: 'center' },
  abandonStatsRow: { flexDirection: 'row', gap: 5, marginTop: 6 }, abandonStatsItem: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: '#1B1422', borderWidth: 1, borderColor: colors.border }, abandonStatsValue: { color: colors.warning, fontSize: 12, fontWeight: '900' }, abandonStatsLabel: { color: '#8F879D', fontSize: 10, fontWeight: '800', marginTop: 1, textAlign: 'center' }, rankingMoreAction: { minHeight: 48, marginTop: 7, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'rgba(124,92,252,.10)', flexDirection: 'row', alignItems: 'center', gap: 8 }, rankingMoreTitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: .5 }, rankingMoreMeta: { color: colors.textMutedGrey, fontSize: 10, fontWeight: '800', marginTop: 2 }, rankingMoreDelta: { minWidth: 24, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: colors.keep, alignItems: 'center', justifyContent: 'center' }, rankingMoreDeltaText: { color: '#08110F', fontSize: 10, fontWeight: '900' }, rankingMoreChevron: { color: colors.primaryLight, fontSize: 20, fontWeight: '900' },
  dailyFreeReset:{color:colors.textMuted,fontSize:9,fontWeight:'900',letterSpacing:.7,textAlign:'center',marginTop:6},
  soloPackEntry: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: 'rgba(124,92,252,.14)', alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingVertical: 6 }, soloPackEntryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: .4 }, soloPackEntryHint: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '700', marginTop: 1 }, soloPackRow: { minHeight: 54, borderRadius: 16, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: colors.backgroundElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 10 }, soloPackSolos: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' }, soloPackPrice: { color: '#FFFFFF', backgroundColor: colors.primary, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, fontSize: 13, fontWeight: '900' }, soloPackBalance: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  prefsEditPill: { color: '#FFFFFF', backgroundColor: colors.primary, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: '900', letterSpacing: .4 }, leaderboardEntry: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.warning, backgroundColor: 'rgba(255,180,84,.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 10 }, leaderboardEntryText: { color: colors.warning, fontSize: 13, fontWeight: '900', letterSpacing: .5 }, leaderboardEntryHint: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '700' },
  prefsSummaryButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#17121D', borderWidth: 1, borderColor: '#30273A', marginBottom: 10 }, prefsSummaryLabel: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: .8 }, prefsSummaryValue: { color: '#FFF', fontSize: 13, fontWeight: '800', marginTop: 2 }, prefsSummaryHint: { color: colors.success, fontSize: 11, fontWeight: '800', marginTop: 3 }, prefsSummaryChevron: { color: '#8F879D', fontSize: 20, fontWeight: '900' }, prefsPickerHint: { color: '#B79CFF', fontSize: 12, lineHeight: 16, fontWeight: '700', marginBottom: 12 }, prefsPickerScroll: { maxHeight: 320, marginBottom: 14 }, prefsPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42, paddingHorizontal: 4 }, prefsPickerCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, textAlign: 'center', lineHeight: 19, color: '#17130B', fontSize: 13, fontWeight: '900' }, prefsPickerCheckboxOn: { backgroundColor: colors.primary, borderColor: colors.primaryLight }, prefsPickerRowText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  arenaInvitePanel: { maxHeight: 290, marginBottom: 8, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: '#4A3C55', backgroundColor: '#120E17' }, arenaInviteTitle: { color: '#E5F266', fontSize: 12, fontWeight: '900', marginBottom: 8 }, arenaInviteScroll: { maxHeight: 190 }, arenaInviteList: { gap: 7 }, arenaInviteRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 7, borderRadius: 15, backgroundColor: '#1B1422' }, arenaInviteName: { color: '#FFF', fontSize: 14, fontWeight: '900' }, arenaInviteMeta: { color: colors.success, fontSize: 11, fontWeight: '800', marginTop: 2 }, arenaInviteMetaShort: { color: colors.danger }, arenaInviteButton: { minWidth: 94, minHeight: 52, paddingHorizontal: 13, borderRadius: 26, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, arenaInviteButtonText: { color: '#17130B', fontSize: 12, fontWeight: '900' }, arenaInviteEmpty: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 14 }, arenaShareButton: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: '#4A3C55', alignItems: 'center', justifyContent: 'center', marginTop: 8 }, arenaShareButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  perfectBonusCard: { marginTop: 10, marginBottom: 2, borderRadius: 26, borderWidth: 2, backgroundColor: '#17130B', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, paddingHorizontal: 18, overflow: 'hidden' },
  perfectBonusSpark: { color: '#FFF4A8', fontSize: 25, fontWeight: '900', letterSpacing: 5 },
  perfectBonusKicker: { color: colors.keep, fontSize: 12, lineHeight: 17, fontWeight: '900', letterSpacing: 1.2, marginTop: 7, textAlign: 'center' },
  perfectBonusName: { color: '#FFF', fontSize: 22, lineHeight: 27, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  perfectBonusScore: { color: '#FFF4A8', fontSize: 34, lineHeight: 38, fontWeight: '900', marginTop: 7 },
  perfectBonusAmount: { color: colors.keep, fontSize: 19, lineHeight: 24, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  perfectBonusHint: { color: '#FFF', fontSize: 11, lineHeight: 16, fontWeight: '800', marginTop: 7, textAlign: 'center' },
  closeBattle: { position: 'absolute', top: 0, right: 0, zIndex: 60, width: 48, height: 48, borderRadius: 24, backgroundColor: '#17121D', borderWidth: 1, borderColor: '#51445E', alignItems: 'center', justifyContent: 'center' }, closeBattleText: { color: '#FFF', fontSize: 30, lineHeight: 32, fontWeight: '700', marginTop: -2 }, finishScroll: { paddingBottom: 18 }, finishHero: { marginTop: 10, borderRadius: 24, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 20, overflow: 'hidden' }, finishSessionHint: { color: colors.textMutedGrey, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 3, marginBottom: 7 }, finishTitle: { color: '#FFF', fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 5 }, finishSub: { color: colors.textMutedGrey, fontSize: 12, lineHeight: 17, fontWeight: '800', textAlign: 'center', marginTop: 5, maxWidth: 280 }, finishScore: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }, finishScoreBig: { color: colors.primaryLight, fontSize: 38, lineHeight: 42, fontWeight: '900' }, finishScoreSlash: { color: '#FFF', fontSize: 15, fontWeight: '900' }, finishReward: { color: colors.success, fontSize: 13, fontWeight: '900', marginTop: 10 }, finishWon: { color: colors.success, fontSize: 12, fontWeight: '900', marginTop: 7 }, finishLost: { color: colors.danger, fontSize: 12, fontWeight: '900', marginTop: 7 }, finishTaunt: { color: '#FFF', fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center', marginTop: 6, paddingHorizontal: 12 }, finishQuestion: { color: '#FFF', textAlign: 'center', fontSize: 12, lineHeight: 17, fontWeight: '900', marginVertical: 9 },
  rematchStatusCard: { marginTop: 10, marginBottom: 8, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.backgroundCard },
  rematchStatusHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rematchStatusTitle: { color: '#FFF', fontSize: 13, fontWeight: '900', letterSpacing: .4 },
  rematchStatusSummary: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '800', marginTop: 3 },
  rematchStatusClock: { color: colors.primaryLight, fontSize: 13, fontWeight: '900' },
  rematchStatusHint: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 8 },
  rematchStatusList: { gap: 6 },
  rematchStatusRow: { minHeight: 34, borderRadius: 11, backgroundColor: colors.backgroundElevated, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rematchStatusName: { flex: 1, color: '#FFF', fontSize: 12, fontWeight: '900' },
  rematchStatusState: { color: colors.primaryLight, fontSize: 10, fontWeight: '900' },
  rematchStatusAccepted: { color: colors.success },
  rematchStatusDeclined: { color: colors.danger },
  rematchStatusLoading: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '800', paddingVertical: 6 },
  rematchWithdrawButton: { minHeight: 44, marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  rematchWithdrawText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  rematchLockedHint: { color: colors.success, fontSize: 11, lineHeight: 16, fontWeight: '800', textAlign: 'center', marginTop: 9 },
  matchRanking: { marginTop: 10, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, gap: 5 }, matchRankingTitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: .8, marginBottom: 2 }, matchWinReason: { color: colors.success, fontSize: 12, lineHeight: 16, fontWeight: '900', marginBottom: 6 }, matchRankLegend: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 9, marginBottom: 2 }, matchRankLegendText: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '800' }, matchRankRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, borderRadius: 12, backgroundColor: '#1B1422' }, matchRankRowWon: { borderWidth: 1, borderColor: '#38D990' }, matchRankRowLost: { opacity: .88 }, matchRankTrophy: { width: 20, textAlign: 'center', fontSize: 13, color: '#FFF', fontWeight: '900' }, matchRankName: { flex: 1, color: '#FFF', fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' }, matchRankScore: { width: 70, textAlign: 'right', color: colors.success, fontSize: 11, fontWeight: '900' }, matchRankCorrect: { width: 58, textAlign: 'center', color: '#B79CFF', fontSize: 11, fontWeight: '800' }, matchRankTime: { width: 44, color: '#FFF', fontSize: 11, fontWeight: '800', textAlign: 'right' },
  palmares: { marginTop: 10, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard }, palmaresTitle: { color: colors.primaryLight, fontSize: 13, lineHeight: 18, fontWeight: '900', letterSpacing: .7, marginBottom: 7 }, palmaresRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9 }, palmaresRank: { width: 24, color: colors.primaryLight, fontSize: 18, fontWeight: '900' }, palmaresName: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '900', textDecorationLine: 'underline' }, palmaresWins: { color: '#FFF', fontSize: 11, fontWeight: '800' }, finishPrimary: { minHeight: 50, borderRadius: 18, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, finishPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, finishSecondary: { minHeight: 46, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center', marginBottom: 7 }, finishSecondaryText: { color: '#FFF', fontSize: 11, fontWeight: '900' }, home: { alignItems: 'stretch', paddingTop: 6, paddingBottom: 8, position: 'relative' }, homeBack: { position: 'absolute', left: 0, top: 9, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', zIndex: 3 }, homeBackText: { color: '#FFF', fontSize: 23, lineHeight: 25 }, homeHelp: { position: 'absolute', right: 0, top: 9, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 3 }, homeHelpText: { color: colors.primaryLight, fontSize: 15, fontWeight: '900' }, homeIcon: { fontSize: 20 }, homeTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: .5 }, homeSub: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '700', marginTop: 3 }, section: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 7 }, roundChipRow: { flexDirection: 'row', gap: 8, width: '100%' }, perfectRuleHint: { color: colors.keep, fontSize: 11, lineHeight: 16, fontWeight: '900', textAlign: 'center', marginTop: 3, marginBottom: 5 }, roundChip: { flex: 1, minWidth: 0, paddingHorizontal: 4 }, theme: { height: 48, minHeight: 48, minWidth: 64, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, themeOn: { backgroundColor: colors.primary, borderColor: colors.primaryLight }, themeShort: { borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,.07)' }, themeText: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' }, themeTextOn: { color: '#FFFFFF' }, themeTextShort: { color: '#FF6C8C' }, themeStake: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '800', marginTop: 2 }, themeStakeOn: { color: '#EEE9FF' }, playHeader: { minHeight: 38, marginBottom: 5, paddingHorizontal: 5, borderRadius: 14, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 7 }, playBack: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, playBackText: { color: '#FFF', fontSize: 23, lineHeight: 25 }, playMode: { flex: 1, color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: .5 }, playRound: { color: colors.textPrimary, fontSize: 11, fontWeight: '900' }, playStake: { color: colors.success, fontSize: 11, fontWeight: '900' }, header: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 }, back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, backText: { color: '#FFF', fontSize: 24, lineHeight: 26 }, headerMid: { flex: 1, alignItems: 'center' }, kicker: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: '#FFF', fontSize: 15, fontWeight: '900' }, round: { width: 36, textAlign: 'right', color: '#FFF', fontSize: 11, fontWeight: '900' }, clockRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 }, clock: { color: '#FFF', fontSize: 19, fontWeight: '900' }, clockHot: { color: colors.danger }, clockHint: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '900', letterSpacing: .8 }, timeTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.backgroundElevated, marginTop: 3, marginBottom: 5 }, timeFill: { height: '100%', backgroundColor: colors.primary }, card: { borderRadius: 20, padding: 7, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border }, /* Pas de hauteur fixe : react-native-web ignore `height: undefined` des styles suivants et gardait 118 px (jaquette écrasée sur ordinateur, gros trou dessous). Le carré vient de aspectRatio:1 + maxWidth/maxHeight. */
  visual: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center', position: 'relative' }, soloVisual: { height: undefined, width: '100%', aspectRatio: 1, alignSelf: 'center', flexGrow: 0, flexShrink: 0, minHeight: 0 }, cover: { width: '100%', height: '100%' }, music: { color: '#FFF', fontSize: 68, fontWeight: '900' }, result: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,6,10,.72)', alignItems: 'center', justifyContent: 'center', padding: 14 }, good: { color: colors.success, fontSize: 26, fontWeight: '900' }, bad: { color: colors.danger, fontSize: 23, fontWeight: '900' }, artist: { color: '#FFF', fontSize: 19, fontWeight: '900', textAlign: 'center', marginTop: 5 }, roundWinner: { color: colors.warning, fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 9 }, question: { color: colors.textPrimary, fontSize: 14, lineHeight: 18, fontWeight: '900', letterSpacing: .5, textAlign: 'center', marginTop: 6 }, soloQuestion: { marginTop: 8 }, answers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 }, soloAnswers: { marginTop: 10, paddingBottom: 0 }, answer: { width: '48%', height: 54, borderRadius: 14, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 8 }, answerFull: { width: '100%' }, answerTextCenter: { textAlign: 'center' }, answerSelected: { borderWidth: 2, borderColor: colors.primaryLight, backgroundColor: 'rgba(124,92,252,.18)' }, soloIntro: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '900', textAlign: 'center', marginTop: 8, paddingHorizontal: 8 }, arenaMissWarn: { color: '#FFFFFF', backgroundColor: 'rgba(255,92,114,.18)', borderWidth: 1, borderColor: colors.danger, borderRadius: 12, overflow: 'hidden', paddingVertical: 6, paddingHorizontal: 10, fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center', marginTop: 6 }, soloEncourage: { color: colors.warning, fontSize: 14, lineHeight: 20, fontWeight: '900', textAlign: 'center', marginTop: 8, paddingHorizontal: 6 }, roundQuestionPillWrap: { position: 'absolute', left: 8, right: 8, top: 10, alignItems: 'center', zIndex: 3 },
  roundQuestionPill: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center', backgroundColor: 'rgba(10,7,16,.78)', borderWidth: 1, borderColor: 'rgba(124,92,252,.8)', borderRadius: 14, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 6 },
  roundEncouragementOverlay: { position: 'absolute', left: 8, right: 8, bottom: 8, alignItems: 'center', zIndex: 3 }, roundEncouragementText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900', textAlign: 'center', backgroundColor: 'rgba(10,7,16,.78)', borderWidth: 1, borderColor: 'rgba(229,242,102,.55)', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 }, idleOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: 'rgba(8,6,12,.82)', alignItems: 'center', justifyContent: 'center', padding: 20 }, idleCard: { width: '100%', maxWidth: 380, borderRadius: 22, padding: 20, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' }, idleEmoji: { fontSize: 44 }, idleTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', marginTop: 6 }, idleText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 }, idleActions: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' }, idleStop: { flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, idleStopText: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' }, idleGo: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, idleGoText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, answerCorrect: { borderWidth: 2, borderColor: colors.success, backgroundColor: colors.success }, answerWrong: { borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.danger }, answerNoCorrect: { borderColor: '#0B1F1B', backgroundColor: '#0B1F1B', color: colors.success }, answerNoWrong: { borderColor: '#FFFFFF', backgroundColor: 'rgba(0,0,0,.25)', color: '#FFFFFF' }, answerTextCorrect: { color: '#0B1F1B' }, answerNo: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.primaryLight, backgroundColor: colors.backgroundElevated, color: '#FFF', textAlign: 'center', lineHeight: 23, fontSize: 13, fontWeight: '900', alignSelf: 'center' }, answerText: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '900' }, answerTime: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' }, scoreLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 15, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border }, score: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' }, // Adel (02/09/2026) : "on voit bien le bouton en bas" -- le panneau "joueurs
  // disponibles" est poussé tout en bas par marginTop:'auto', mais rien ne
  // l'empêchait de finir pile derrière la barre d'onglets fixe (68px +
  // paddingBottom 8, voir Navigation.tsx) sur le build web, coupant
  // l'avatar/bouton BATTLE de la dernière ligne. marginBottom réserve cette
  // hauteur sans toucher au Design de la barre d'onglets elle-même.
  soloScroll: { flexGrow: 1, paddingBottom: 0 },
  homeScroll: { flexGrow: 1, paddingBottom: 48 },
  soloPlayersToggle: { minHeight: 42, marginTop: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  soloPlayersToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 },
  soloPlayersToggleText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  soloPlayersToggleAction: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },
  live: { marginTop: 8, padding: 10, borderRadius: 18, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border }, liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }, liveTitle: { color: '#FFF', fontSize: 12, fontWeight: '900' }, liveList: { gap: 6, paddingTop: 7 }, liveRowCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 46, paddingHorizontal: 9, borderRadius: 15, backgroundColor: colors.backgroundCard }, liveRowInsufficient: { borderWidth: 1, borderColor: 'rgba(255,92,114,.45)', backgroundColor: 'rgba(255,92,114,.06)' }, liveRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }, liveRowIdentity: { flex: 1, minWidth: 0 }, liveRowName: { color: '#FFF', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' }, liveRowCreditWarning: { color: colors.danger, fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 2 }, avatarFallback: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: '#FFF', fontSize: 16, fontWeight: '900' }, username: { color: '#FFF', fontSize: 11, fontWeight: '800', marginTop: 3, maxWidth: 70 }, battleButton: { minHeight: 28, paddingHorizontal: 9, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, battleButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, battleButtonSending: { backgroundColor: colors.primaryDark, opacity: .85 }, battleButtonSent: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.success }, battleButtonSentText: { color: colors.success }, battleButtonBlocked: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.danger }, battleButtonBlockedText: { color: colors.danger }, invite: { marginTop: 10, minHeight: 132, paddingHorizontal: 16, paddingVertical: 15, borderRadius: 22, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.backgroundCard, justifyContent: 'center' }, inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, inviteActions: { flexDirection: 'row', gap: 12, width: '100%' }, inviteLabel: { color: colors.primaryLight, fontSize: 12, lineHeight: 18, fontWeight: '900', marginTop: 5 }, inviteName: { color: '#FFF', fontSize: 17, lineHeight: 22, fontWeight: '900' }, inviteQuestion: { color: colors.textPrimary, fontSize: 15, lineHeight: 21, fontWeight: '800' }, inviteConnecting: { color: colors.primaryLight, fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: .5 }, no: { flex: 1, minHeight: 52, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 16, fontWeight: '900' }, yes: { flex: 1, minHeight: 52, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, actionDisabled: { opacity: .62 }, versus: { position: 'absolute', zIndex: 20, left: 16, right: 16, top: 120, padding: 16, borderRadius: 22, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' }, versusText: { color: colors.primaryLight, fontSize: 25, fontWeight: '900' }, versusNames: { color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 5 }, duel: { marginBottom: 8, padding: 10, borderRadius: 16, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border }, duelNames: { flexDirection: 'row', alignItems: 'center' }, duelName: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' }, duelScore: { color: colors.primaryLight, fontSize: 14, fontWeight: '900' }, duelCenter: { minWidth: 46, alignItems: 'center', justifyContent: 'center' }, duelTimer: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '900', marginTop: 2 }, duelPoints: { color: colors.success, fontSize: 13, fontWeight: '900', marginTop: 3 }, teamMembers: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }, teamChip: { paddingHorizontal: 6, minHeight: 22, borderRadius: 11, backgroundColor: '#1D1625', alignItems: 'center', justifyContent: 'center' }, teamChipText: { color: '#FFF', fontSize: 11, fontWeight: '800' }, power: { height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.backgroundElevated, flexDirection: 'row', position: 'relative', marginTop: 9 }, powerLeft: { height: '100%', backgroundColor: colors.primary }, powerRight: { flex: 1, height: '100%', backgroundColor: colors.success }, powerMiddle: { position: 'absolute', zIndex: 3, left: '50%', width: 2, height: '100%', backgroundColor: colors.textPrimary }, waiting: { padding: 16, borderRadius: 22, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }, waitingPulse: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(124,92,252,.16)', borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, waitingStatusPill: { marginTop: 10, minHeight: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(124,92,252,.14)', borderWidth: 1, borderColor: colors.primary }, waitingStatusText: { color: colors.primaryLight, fontSize: 11, lineHeight: 26, fontWeight: '900', letterSpacing: .8 }, trophy: { fontSize: 34 }, winner: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 3 }, waitText: { color: colors.textMutedGrey, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 7 }, browseText: { color: colors.textMutedGrey, fontSize: 12, lineHeight: 17, marginBottom: 10 }, browseList: { gap: 7 }, browsePlayer: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, paddingHorizontal: 10, paddingVertical: 10 }, browseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, browseName: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' }, browseChevron: { color: colors.textMutedGrey, fontSize: 16, fontWeight: '900' }, browseAvatarDot: { position: 'absolute', right: -1, bottom: -1 }, browseRankBadge: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' }, browseMeta: { color: colors.success, fontSize: 11, fontWeight: '800', marginTop: 3 }, browseMetaShort: { color: colors.danger }, browseBattle: { minHeight: 34, borderRadius: 17, backgroundColor: colors.primary, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, browseBattleText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, shareButton: { minHeight: 40, borderRadius: 20, backgroundColor: colors.primary, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, shareButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  battleButtonCreditBlocked: { opacity: .58, borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,0.10)' },
  battleButtonCreditBlockedText: { color: colors.danger },
  // (21/09/2026) refonte "Joueurs disponibles" -- sélection multiple + barre
  // fixe. Design System KEEP : violet = action principale, gris = secondaire
  // ou désactivé, jamais de couleur seule pour un statut (texte toujours présent).
  browseScroll: { flex: 1 }, browseScrollContent: { paddingBottom: 92 },
  browsePlayerSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: `${colors.primary}1A` },
  browsePlayerIneligible: { opacity: 0.5 },
  battleCheckbox: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  battleCheckboxOn: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  battleCheckboxDisabled: { opacity: 0.4 },
  battleCheckboxMark: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  battleStatusBadge: { minHeight: 28, paddingHorizontal: 9, borderRadius: 14, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  battleStatusBadgeText: { color: colors.textPrimary, fontSize: 11, fontWeight: '800' },
  battleStatusBadgeCancel: { borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,.10)' },
  battleStatusBadgeCancelText: { color: colors.danger },
  pendingArenaInvite: { minHeight: 58, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 15, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.backgroundCard },
  pendingArenaInviteName: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  pendingArenaInviteMeta: { color: colors.textMutedGrey, fontSize: 10, fontWeight: '800', marginTop: 2 },
  pendingArenaInviteCancel: { minHeight: 34, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,.08)', alignItems: 'center', justifyContent: 'center' },
  pendingArenaInviteCancelText: { color: colors.danger, fontSize: 10, fontWeight: '900' },
  arenaInviteCancelButton: { borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,.08)' },
  arenaInviteCancelText: { color: colors.danger },
  battleStatusBadgeMuted: { opacity: 0.75 },
  battleStatusBadgeTextMuted: { color: colors.textMuted },
  battleSelectionFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, backgroundColor: colors.backgroundElevated, borderTopWidth: 1, borderTopColor: colors.border },
  battleSelectionCount: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  battleStartGlow: { borderWidth: 2, borderRadius: 20, padding: 2 },
  battleStartButton: { minHeight: 46, minWidth: 112, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  battleStartButtonDisabled: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, opacity: .72 },
  battleStartButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  battleStartButtonTextDisabled: { color: colors.textMuted },
  arenaScroll: { flex: 1 },
  arenaScrollContent: { paddingBottom: 96 },
  arenaScrollContentActive: { flexGrow: 1, paddingBottom: 0 },
  // Battle/Solo actif : même gabarit strict. La jaquette reste carrée,
  // centrée et la plus grande possible ; les quatre réponses descendent
  // ensuite au bas du bloc, juste au-dessus de la navigation.
  arenaCardActive: { flexGrow: 1, justifyContent: 'flex-start', paddingHorizontal: 3, paddingTop: 3, paddingBottom: 0 },
  soloCardActive: { flexGrow: 1, justifyContent: 'flex-start', paddingHorizontal: 3, paddingTop: 3, paddingBottom: 0 },
  soloQuestionBlock: { marginTop: 'auto', paddingTop: 8 },
  soloAnswersActive: { marginTop: 8, paddingTop: 0, paddingBottom: 0 },
  arenaVisualActive: { width: '100%', aspectRatio: 1, height: undefined, alignSelf: 'center', flexGrow: 0, flexShrink: 0, minHeight: 0 },
  arenaAnswersActive: { marginTop: 'auto', paddingTop: 8, paddingBottom: 0 },
  roundNoWinner: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '900', textAlign: 'center', marginTop: 9 },
  squareGrid: { flexDirection: 'row', gap: 6, marginTop: 6 }, squareCol: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  squareTile: { width: 56, height: 64, borderRadius: 13, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard },
  squareTileFill: { flex: 1, justifyContent: 'space-between' }, squareTileImage: { resizeMode: 'cover' },
  squareTileFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' }, squareTileFallbackLetter: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  squareBadge: { alignSelf: 'flex-start', margin: 3, minWidth: 18, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, squareBadgeText: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },
  squareCaption: { paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,.6)' }, squareCaptionText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  squarePlus: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.backgroundCard }, squarePlusIcon: { color: colors.primaryLight, fontSize: 20, fontWeight: '900', lineHeight: 22 },
  creditBadgeRow: { alignItems: 'center', marginBottom: 6 }, creditBadgeText: { color: colors.success, fontSize: 11, fontWeight: '900', backgroundColor: 'rgba(45,225,194,.10)', borderWidth: 1, borderColor: 'rgba(45,225,194,.35)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 13, overflow: 'hidden' },
  groupStandings: { marginTop: 8, marginBottom: 8, padding: 10, borderRadius: 16, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, gap: 6 }, groupStandingsTitle: { flex: 1, color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: .6, textAlign: 'center' }, groupStandingsToggle: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, groupStandingsChevron: { width: 24, color: colors.primaryLight, fontSize: 16, fontWeight: '900', textAlign: 'center' }, groupStandingRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.backgroundElevated }, groupStandingRowLead: { borderWidth: 1, borderColor: colors.primaryLight }, groupStandingRank: { width: 26, textAlign: 'center', fontSize: 13, fontWeight: '900', color: '#FFF' }, groupStandingName: { flex: 1, color: '#FFF', fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' }, groupStandingScore: { color: colors.success, fontSize: 12, fontWeight: '900' }, groupStandingsMore: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  buildingArenaBanner: { minHeight: 44, borderRadius: 16, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.backgroundCard, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, alignItems: 'center', justifyContent: 'center' }, buildingArenaBannerText: { color: colors.primaryLight, fontSize: 11, lineHeight: 15, fontWeight: '900', textAlign: 'center' },
  liveMatches: { marginBottom: 12, gap: 6 }, liveMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, paddingHorizontal: 12 }, liveMatchTheme: { color: '#FFF', fontSize: 12, fontWeight: '900' }, liveMatchHost: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '700', marginTop: 2 }, liveMatchWatch: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },

});
