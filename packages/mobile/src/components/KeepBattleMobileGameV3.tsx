import React from 'react';
import { ActivityIndicator, Animated, Image, ImageBackground, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import PresenceDot from './PresenceDot';
import { playTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { buildKeepBattleArenaInviteLink, createKeepBattleArena, joinKeepBattleArena, KeepBattleArenaSpectate, KeepBattleArenaState, KeepBattleArenaWinner, KeepBattleCreditStatus, KeepBattlePendingRematch, KeepBattlePlayerStats, KeepBattleTheme, leaveKeepBattleArena, loadKeepBattleArena, loadKeepBattleArenaWinnerHistory, loadKeepBattleGlobalLeaderboard, loadKeepBattlePlayerStats, loadKeepBattleThemes, loadMyActiveKeepBattleArena, loadMyKeepBattleCreditStatus, loadPendingArenaRematches, proposeKeepBattleArenaRematch, respondKeepBattleArenaRematch, spectateKeepBattleArena, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena } from '../services/keepBattleService';
import { KeepBattleOpenSalon, loadOpenBattleSalons } from '../services/keepBattleSalonService';
import { formatCompactNumber } from '../utils/formatCompactNumber';
import { KeepBattleSoloPack, KeepBattleSoloRound, loadKeepBattleSoloPack } from '../services/keepBattleExperienceService';
import { heartbeatSoloBattle, KeepBattleIncomingChallenge, KeepBattleLivePlayer, leaveSoloBattle, loadIncomingBattleChallenges, loadLiveSoloPlayers, loadMyMatchPreferences, loadOutgoingBattleChallenges, reportSoloBattleResult, respondBattleChallenge, saveMyMatchPreferences, sendBattleArenaChallenge, sendBattleChallenge } from '../services/keepBattleLiveService';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useUserStore } from '../store/useUserStore';
import { useBattleAvailabilityStore } from '../store/useBattleAvailabilityStore';
import { shareProfile } from '../services/sharingService';
import { KeepSession, SessionTrackEntry } from '../types';

const ROUND_MS = 10000;
const KEEP_BATTLE_SHARE = 'https://adelkhatra-bit.github.io/KEEP/share-profile/';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const initial = (name: string) => (name || 'K').replace(/^@/, '').slice(0, 1).toUpperCase();

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
const BATTLE_WIN_MESSAGES = [
  'Oreille en or, rien ne t’échappe !',
  'Réflexes ultra rapides, personne n’a pu suivre.',
  'Tu as trouvé la réponse avant la fin du refrain.',
  'Instinct redoutable, tu domines ce Battle.',
  'Ton sens du rythme fait des ravages.',
  'Toujours un temps d’avance sur les autres.',
  'Une oreille aussi affûtée, ça se respecte.',
  'Tu repars avec le trophée ET les Free.',
  'Performance solide, continue sur cette lancée.',
  'Personne ne t’a vu venir, GG !',
];
const BATTLE_LOSE_MESSAGES = [
  'Ton adversaire a eu la détente plus rapide cette fois.',
  'Il t’a devancé d’une fraction de seconde, reviens plus affûté.',
  'Pas de chance, la prochaine manche est pour toi.',
  'L’oreille de ton adversaire était juste un poil plus rapide.',
  'Ce n’est que partie remise, prends ta revanche.',
  'Il t’a pris de vitesse, montre-lui que tu peux faire mieux.',
  'Petite défaite, grande revanche à venir.',
  'Ton adversaire a eu le bon tempo au bon moment.',
  'Serré ! Un peu plus de vitesse et c’est toi qui gagnes.',
  'Ça se joue à rien, retente ta chance tout de suite.',
];
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function battleResultMessage(arenaId: string, won: boolean): string {
  const pool = won ? BATTLE_WIN_MESSAGES : BATTLE_LOSE_MESSAGES;
  return pool[hashSeed(`${arenaId}:${won ? 'W' : 'L'}`) % pool.length];
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
  { code: 'INDE', label: 'Bollywood' },
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
function ResultIcon({ icon, big }: { icon: string; big?: boolean }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 480, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const rotate = pulse.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '5deg'] });
  return <Animated.Text style={[s.finishTrophy, big && s.finishTrophyBig, { transform: [{ scale }, { rotate }] }]}>{icon}</Animated.Text>;
}

// Adel (02/09/2026) : "est-ce que tu peux défoncer l'image ... quand la
// réponse arrive il faut défoncer l'image de l'artiste" -- la jaquette
// apparaissait sans aucun mouvement au moment du résultat. Un zoom d'impact
// (part de plus grand que nature, retombe sec sur sa taille normale) au
// moment précis où elle s'affiche, dans les deux modes (solo et arène).
function RevealArtwork({ uri }: { uri: string }) {
  const punch = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    punch.setValue(0);
    Animated.spring(punch, { toValue: 1, friction: 4, tension: 130, useNativeDriver: true }).start();
  }, [uri]);
  const scale = punch.interpolate({ inputRange: [0, 1], outputRange: [1.45, 1] });
  return <Animated.Image source={{ uri }} style={[s.cover, { transform: [{ scale }] }]} />;
}

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

export default function KeepBattleMobileGameV3({ enabled, onOpenProfile, onRequireAccount, onExit, initialArenaId, onOpenSession }: Props) {
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
      const has = rows.includes(code);
      const next = has ? rows.filter((c) => c !== code) : [...rows, code];
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
  const [soloScore, setSoloScore] = React.useState(0);
  const [soloFinished, setSoloFinished] = React.useState(false);
  const [soloStartedAt, setSoloStartedAt] = React.useState(0);
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
  const [arena, setArenaState] = React.useState<KeepBattleArenaState | null>(null);
  const setArena = React.useCallback((next: KeepBattleArenaState | null | ((prev: KeepBattleArenaState | null) => KeepBattleArenaState | null)) => {
    setArenaState((prev) => {
      const value = typeof next === 'function' ? (next as (p: KeepBattleArenaState | null) => KeepBattleArenaState | null)(prev) : next;
      arenaIdLiveRef.current = value?.id ?? null;
      return value;
    });
  }, []);
  const [livePlayers, setLivePlayers] = React.useState<KeepBattleLivePlayer[]>([]);
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
  const [spectateJoinBusy, setSpectateJoinBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [audioReady, setAudioReady] = React.useState(false);
  const [respondingChallengeId, setRespondingChallengeId] = React.useState<string | null>(null);
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
  // Adel (02/09/2026) : "que l'utilisateur sache qu'il y a une invite qui
  // est partie" -- le bouton BATTLE ne montrait "ENVOI…" que pendant la
  // requête elle-même (quelques centaines de ms), puis redevenait un simple
  // bouton BATTLE identique à avant, sans aucun signe que l'invite était
  // bien partie et en attente d'une réponse. Dérivé du même sondage outbox
  // déjà utilisé pour les alertes refusé/expiré -- aucune requête en plus.
  const [outgoingPendingTargetIds, setOutgoingPendingTargetIds] = React.useState<Set<string>>(new Set());
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
  const arenaPlayedTracksRef = React.useRef<Map<string, ArenaPlayedTrack>>(new Map());
  const [arenaSessionId, setArenaSessionId] = React.useState<string | null>(null);
  const [rematchResponding, setRematchResponding] = React.useState(false);
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
        Animated.timing(celebrationOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(celebrationScale, { toValue: 1.08, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
      Animated.spring(celebrationScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
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
  // Adel (02/09/2026) : "ici aussi tu peux mettre l'invite" -- signale à
  // GlobalNotificationBanner que l'écran Battle est réellement à l'écran
  // (pas juste "on est sur l'onglet Soirées"), pour qu'il ne masque son
  // bandeau que quand celui-ci prend vraiment le relais.
  React.useEffect(() => {
    useBattleAvailabilityStore.getState().setBattleScreenOpen(true);
    return () => useBattleAvailabilityStore.getState().setBattleScreenOpen(false);
  }, []);
  React.useEffect(() => () => { void stopTrackPreview(); void leaveSoloBattle().catch(() => {}); }, []);

  const themeLabel = (code: string) => themes.find((t) => t.code === code)?.label || code;
  // Adel : "les boutons, il faut uniquement le nom de l'artiste" -- certains
  // morceaux (bandes originales, compilations) ont un crédit complet avec
  // une dizaine de featurings ("Lisa Gerrard, Gavin Greenaway, The Lyndhurst
  // Orchestra, ... & Hans Zimmer"), illisible sur un bouton de réponse.
  // Affichage uniquement : on coupe au premier séparateur de featuring, la
  // VALEUR envoyée à answerSolo/answerArena (donc la correction) reste le
  // texte complet, intact.
  const primaryArtistLabel = (full: string) => full.split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bx\b|\bet\b|\band\b)\s*/i)[0]?.trim() || full;
  // Adel (02/09/2026) : "avoir vraiment une catégorie de joueurs" -- petit
  // repère visuel du palier (voir keep_battle_skill_tier côté serveur),
  // affiché là où on choisit un adversaire.
  const tierLabel = (tier?: string) => tier === 'EXPERT' ? '👑 Expert' : tier === 'CONFIRME' ? '⭐ Confirmé' : '🌱 Débutant';
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
      const [players, inbox, outbox, pendingRematches, salons] = await Promise.all([
        loadLiveSoloPlayers(20),
        loadIncomingBattleChallenges(),
        loadOutgoingBattleChallenges(),
        loadPendingArenaRematches().catch(() => []),
        browseOnline ? loadOpenBattleSalons().catch(() => []) : Promise.resolve<KeepBattleOpenSalon[]>([]),
      ]);
      setLivePlayers(players);
      setIncoming(inbox);
      if (browseOnline) setOpenSalons(salons);
      setPendingRematch(pendingRematches);
      setOutgoingPendingTargetIds(new Set(outbox.filter((x) => x.status === 'PENDING').map((x) => x.targetId)));
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
      const accepted = outbox.find((x) => x.status === 'ACCEPTED' && x.arenaId && !autoJoinedChallengeIds.has(x.id));
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
      const freshFeedback = outbox.filter((x) => x.status === 'DECLINED' && !handledOutgoingIds.has(x.id));
      const soloRoundInProgress = Boolean(solo) && !soloAnswer;
      if (!soloRoundInProgress) {
        for (const feedback of freshFeedback) {
          handledOutgoingIds.add(feedback.id);
          Alert.alert(
            'Battle refusé',
            `@${feedback.username} a refusé le Battle. Invite un autre joueur ou partage Loki à un ami.`,
            [{ text: 'Continuer', style: 'cancel' }, { text: 'Inviter un ami', onPress: () => { void shareInvite(); } }],
          );
        }
      }
    } catch {}
  }, [enabled, solo, soloAnswer, browseOnline, animateVersus, shareInvite]);

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
      const message = String(e?.message || e || '');
      if (message.includes('MINIMUM_THREE_FREE_REQUIRED')) notEnoughFreeAlert('Il te faut au moins 3 Free pour rejoindre un Battle');
      else Alert.alert('Battle', 'Impossible de rejoindre ce Battle pour le moment.');
    } finally {
      setSpectateJoinBusy(false);
    }
  };

  React.useEffect(() => {
    const round = solo?.rounds[soloIndex];
    if (!round || incoming[0] || pausedSoloRemaining !== null) return undefined;
    let alive = true;
    answeredRoundRef.current = -1;
    soloStartedAtRef.current = 0; setSoloStartedAt(0); setAudioReady(false);
    const start = async () => {
      while (alive) {
        const ok = await playVerified(`solo:${round.trackId}:${soloIndex}`, round.previewUrl, ROUND_MS + 800);
        if (!alive) return;
        if (ok) {
          setAudioReady(true);
          soloStartedAtRef.current = Date.now(); setSoloStartedAt(soloStartedAtRef.current);
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
      soloStartedAtRef.current = 0; setSoloStartedAt(0);
      setAudioReady(false);
      let alive = true;
      void (async () => {
        while (alive) {
          const ok = await playVerified(`solo-resume:${round.trackId}:${soloIndex}`, round.previewUrl, savedRemaining + 800);
          if (!alive) return;
          if (ok) {
            setAudioReady(true);
            soloStartedAtRef.current = Date.now() - (ROUND_MS - savedRemaining); setSoloStartedAt(soloStartedAtRef.current);
            return;
          }
          await wait(500);
        }
      })();
      return () => { alive = false; };
    }
  }, [solo, soloIndex, soloAnswer, activeIncomingId, pausedSoloRemaining, audioReady, soloStartedAt, playVerified]);

  React.useEffect(() => {
    if (!solo || activeIncomingId || !audioReady || soloAnswer) return;
    // Adel (02/09/2026) : lit soloStartedAtRef (toujours à jour de façon
    // synchrone) plutôt que displayedSoloRemaining -- ce dernier peut encore
    // porter la valeur figée du rendu PRÉCÉDENT au moment précis où la manche
    // vient de changer (voir le commentaire sur soloStartedAtRef), ce qui
    // déclenchait un faux timeout instantané sur la manche qui vient de
    // démarrer. `now` reste en dépendance pour continuer à revérifier toutes
    // les ~100ms tant que la manche est réellement en cours.
    const startedAt = soloStartedAtRef.current;
    const remaining = pausedSoloRemaining ?? (startedAt ? Math.max(0, ROUND_MS - (Date.now() - startedAt)) : ROUND_MS);
    if (remaining > 0) return;
    if (answeredRoundRef.current === soloIndex) return; // un appui a déjà tranché ce round
    answeredRoundRef.current = soloIndex;
    setSoloAnswer('__TIMEOUT__'); void stopTrackPreview(); animateResult();
  }, [solo, activeIncomingId, audioReady, soloAnswer, soloIndex, animateResult, now, pausedSoloRemaining]);
  React.useEffect(() => {
    if (!solo || !soloAnswer) return undefined;
    if (soloIndex >= solo.rounds.length - 1) {
      const id = setTimeout(() => {
        if (saveSessionEnabled) {
          const session = buildBattleSession(solo, solo.rounds);
          useSessionHistoryStore.getState().addSession(session);
          setBattleSessionId(session.id);
        }
        // Adel (02/09/2026) : "un petit joueur devra monter sa note en solo"
        // -- seul moment où un score solo complet est connu ; alimente le
        // palier serveur utilisé pour bloquer un défi trop déséquilibré.
        void reportSoloBattleResult(soloScore, solo.rounds.length).catch(() => {});
        setSoloFinished(true); celebrate();
      }, 520);
      return () => clearTimeout(id);
    }
    // Adel (01/09/2026) : "on a même pas eu le temps de voir la jaquette" --
    // 360ms ne laissait pas le temps de voir la pochette + le résultat
    // (GAGNÉ/PERDU) qui s'affichent au moment même de la réponse. 1800ms
    // reprend la même pause déjà utilisée ailleurs dans ce fichier pour un
    // temps de lecture du résultat.
    // Adel (02/09/2026) : "essaye de ralentir la cadence pour que
    // l'utilisateur puisse voir s'il a eu la bonne réponse ou pas" -- 1800ms
    // ne laissait pas assez de temps de lecture du résultat + bonne réponse
    // avant d'enchaîner sur la manche suivante.
    // Adel (02/09/2026) : "il faut qu'un utilisateur ... puisse écouter la
    // musique jusqu'à la fin même s'il a été très rapide pour répondre" --
    // démarrer la manche suivante coupe forcément l'extrait en cours (un
    // seul lecteur audio partagé). Sans ce correctif, répondre à 1s dans une
    // manche de 10s ne laissait entendre que ~3.8s de musique au lieu des
    // ~10.8s prévues. On attend maintenant le plus long entre la pause de
    // lecture du résultat (2800ms) et le temps réel restant avant la fin
    // naturelle de l'extrait.
    const naturalRemaining = soloStartedAt ? (soloStartedAt + ROUND_MS + 800) - Date.now() : 0;
    const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, Math.max(2800, naturalRemaining));
    return () => clearTimeout(id);
  }, [solo, soloAnswer, soloIndex, celebrate, saveSessionEnabled, soloStartedAt]);

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
    const id = setInterval(() => { void refreshArena(); }, 300);
    return () => { off(); clearInterval(id); };
  }, [arena?.id, refreshArena]);

  React.useEffect(() => {
    if (!arena?.id) { setMyCreditStatus(null); return undefined; }
    let live = true;
    const load = () => { loadMyKeepBattleCreditStatus().then((v) => { if (live) setMyCreditStatus(v); }).catch(() => {}); };
    load();
    const id = setInterval(load, 4000);
    return () => { live = false; clearInterval(id); };
  }, [arena?.id]);

  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl) return undefined;
    const previewUrl = round.previewUrl;
    let alive = true;
    setAudioReady(false);
    let confirmed = false;
    const run = async () => {
      const startsAt = round.startedAt ? new Date(round.startedAt).getTime() : Date.now();
      const closesAt = round.closesAt ? new Date(round.closesAt).getTime() : startsAt + ROUND_MS;
      const duration = Math.max(1600, closesAt - startsAt + 500);
      try {
        await scheduleTrackPreviewSegment(`arena:${arena.id}:${arena.matchNo}:${round.position}`, previewUrl, 0, duration, startsAt, (playing) => {
          if (alive && playing) { confirmed = true; setAudioReady(true); }
        });
      } catch {
        if (!alive) return;
        const ok = await playVerified(`arena-fallback:${arena.id}:${arena.matchNo}:${round.position}`, previewUrl, Math.max(1600, closesAt - Date.now() + 500));
        if (alive && ok) { confirmed = true; setAudioReady(true); }
      }
      // Adel (02/09/2026) : "il y a du son uniquement sur la première dans
      // les Battle [à plusieurs]" -- scheduleTrackPreviewSegment programme sa
      // lecture réelle via un setTimeout interne séparé et résout sa propre
      // promesse dès l'enregistrement, avant même d'avoir tenté de jouer :
      // si ce setTimeout ne se déclenche jamais proprement (dérive d'horloge,
      // manche déjà changée, latence de sondage), rien ne le signale --
      // aucune exception, juste un silence permanent pour cette manche.
      // Filet de sécurité robuste : si la confirmation de lecture n'est
      // jamais arrivée un peu après l'instant de départ prévu, on force un
      // vrai essai vérifié (le même mécanisme fiable que le mode solo)
      // plutôt que de laisser la manche bloquée sur "SON EN CHARGEMENT".
      if (!confirmed && alive) {
        const safetyDelay = Math.max(0, startsAt - Date.now()) + 1200;
        await wait(safetyDelay);
        if (!alive || confirmed) return;
        const ok = await playVerified(`arena-safety:${arena.id}:${arena.matchNo}:${round.position}`, previewUrl, Math.max(1600, closesAt - Date.now() + 500));
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

  const runStartSolo = async (saveSession: boolean) => {
    if (busy) return;
    // Adel (03/09/2026) : "j'entends pas le son" -- vrai bug root-causé : les
    // manches de Battle démarrent TOUJOURS via un minuteur (jamais un vrai
    // tap), donc Safari iOS bloque silencieusement .play() si l'élément
    // audio partagé n'a jamais été débloqué par un vrai geste. Ce bouton
    // (via l'alerte "Sauvegarder ce Battle ?") est le dernier vrai tap avant
    // que des manches commencent à jouer du son tout seules.
    unlockWebAudioForGesture();
    setBusy(true);
    try {
      const pack = await loadKeepBattleSoloPack(themeCode, roundCount, myPreferredThemes);
      answeredRoundRef.current = -1;
      setSaveSessionEnabled(saveSession);
      soloStartedAtRef.current = 0;
      setArena(null); setBrowseOnline(false); setSolo(pack); setSoloIndex(0); setSoloAnswer(null); setSoloScore(0); setSoloFinished(false); setSoloStartedAt(0); setAudioReady(false); handledOutgoingIds.clear(); setBattleSessionId(null);
      // Adel (02/09/2026) : "lorsque j'appuie sur Battle seul ou Battle à
      // plusieurs, automatiquement ça m'active mon profil" -- entrer en
      // Battle (solo ou en ligne) montre déjà l'intention de jouer.
      void useBattleAvailabilityStore.getState().autoEnable().catch(() => {});
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
      setBrowseOnline(true); setSolo(null); setArena(null); handledOutgoingIds.clear();
      void useBattleAvailabilityStore.getState().autoEnable().catch(() => {});
      loadKeepBattleGlobalLeaderboard(20).then((rows) => {
        const map: Record<string, number> = {};
        rows.forEach((row, index) => { map[row.profileId] = index + 1; });
        setLeaderboardRank(map);
      }).catch(() => {});
      setLivePlayers(await loadLiveSoloPlayers(20));
    } catch { setLivePlayers([]); }
    finally { setBusy(false); }
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
      'Partage ton profil à tes amis : plus ta communauté musicale grandit, plus tu gagnes de Free pour jouer.',
      [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Partager', onPress: () => { const username = useUserStore.getState().user?.username; if (username) void shareProfile(username); } },
      ],
    );
  };

  const challenge = async (player: KeepBattleLivePlayer) => {
    if (challengeBusyId) return;
    // Adel (03/09/2026) : "j'entends pas le son" -- le camp qui ENVOIE le
    // défi ne retape jamais rien au moment où l'autre accepte (détecté par
    // sondage, pas par un geste) -- ce tap "BATTLE"/"Défier" est son dernier
    // vrai geste avant que la manche démarre toute seule plus tard.
    unlockWebAudioForGesture();
    setChallengeBusyId(player.profileId);
    try {
      let arenaId = buildingArenaId;
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
        setBuildingArenaId(arenaId);
      }
      await sendBattleArenaChallenge(arenaId, player.profileId);
    } catch (e: any) {
      const message = String(e?.message || e || '');
      if (message.includes('BATTLE_CHALLENGER_NO_CREDIT') || message.includes('BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED')) notEnoughFreeAlert('Il te faut au moins 3 Free pour lancer un Battle');
      else if (message.includes('BATTLE_TARGET_NO_CREDIT')) Alert.alert('Battle', `@${player.username} n’a pas assez de Free pour jouer maintenant.`);
      else if (message.includes('BATTLE_ARENA_FULL')) Alert.alert('Battle', 'Ton groupe est déjà complet : 10 joueurs.');
      else if (message.includes('BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES')) {
        const until = parseInviteBlockedUntilMs(message);
        if (until) {
          setInviteBlockedUntil((rows) => ({ ...rows, [player.profileId]: until }));
          Alert.alert('Battle', `@${player.username} a refusé plusieurs fois. Tu pourras réinviter dans ${formatInviteCooldown(until - Date.now())}.`);
        } else {
          Alert.alert('Battle', `@${player.username} a refusé plusieurs fois. Réessaie un peu plus tard.`);
        }
      }
      else if (message.includes('BATTLE_SKILL_GAP_TOO_LARGE')) Alert.alert('Battle', `L’écart de niveau avec @${player.username} est trop grand. Enchaîne des parties solo pour monter de catégorie.`);
      else if (message.includes('BATTLE_DAILY_INVITE_LIMIT_REACHED')) Alert.alert('Battle', 'Tu as atteint le nombre d’invitations Battle autorisées aujourd’hui. Réessaie demain.');
      else Alert.alert('Battle', `@${player.username} n’est plus disponible.`);
      void refreshSocial();
    } finally {
      setChallengeBusyId(null);
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
    loadKeepBattlePlayerStats(player.profileId).then(setStatsData).catch(() => setStatsData(null)).finally(() => setStatsLoading(false));
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
      <TouchableOpacity style={s.prefsSummaryButton} onPress={() => setPrefsPickerOpen(true)}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.prefsSummaryLabel}>MES STYLES ACCEPTÉS</Text>
          <Text numberOfLines={1} style={s.prefsSummaryValue}>{prefsSaving ? 'Enregistrement…' : myPreferredThemesLabel()}</Text>
          {myPreferredThemes.filter((c) => c !== 'MIX').length > 1 ? (
            <Text numberOfLines={1} style={s.prefsSummaryHint}>Tes invites utilisent : {themeLabel(themeCode)}</Text>
          ) : null}
        </View>
        <Text style={s.prefsSummaryChevron}>›</Text>
      </TouchableOpacity>
      <Modal visible={prefsPickerOpen} transparent animationType="fade" onRequestClose={() => setPrefsPickerOpen(false)}>
        <View style={s.statsBackdrop}>
          <View style={s.statsCard}>
            <TouchableOpacity style={s.statsClose} onPress={() => setPrefsPickerOpen(false)} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={s.statsCloseText}>×</Text></TouchableOpacity>
            <Text style={s.statsUsername}>Styles acceptés</Text>
            <Text style={s.prefsPickerHint}>Coche un ou plusieurs styles. Les autres joueurs les verront quand tu es disponible.</Text>
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
      </Modal>
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
          <View style={s.squareCaption}><Text numberOfLines={1} style={s.squareCaptionText}>@{player.username}</Text></View>
        </ImageBackground>
      ) : (
        <View style={[s.squareTileFill, s.squareTileFallback]}>
          <Text style={s.squareTileFallbackLetter}>{initial(player.username)}</Text>
          <View style={s.squareBadge}><Text style={s.squareBadgeText}>{player.score}</Text></View>
          <View style={s.squareCaption}><Text numberOfLines={1} style={s.squareCaptionText}>@{player.username}</Text></View>
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
      <Modal visible transparent animationType="fade" onRequestClose={() => setStatsPlayer(null)}>
        <View style={s.statsBackdrop}>
          <View style={s.statsCard}>
            <TouchableOpacity style={s.statsClose} onPress={() => setStatsPlayer(null)} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={s.statsCloseText}>×</Text></TouchableOpacity>
            <Text style={s.statsUsername}>@{statsPlayer.username}</Text>
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
                  <View style={s.statsSmallItem}><Text style={s.statsSmallValue}>🏆 {formatCompactNumber(statsData.freeWon)}</Text><Text style={s.statsSmallLabel}>Free gagné</Text></View>
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
              <TouchableOpacity style={s.statsProfileButtonSmall} onPress={() => { setStatsPlayer(null); void challenge(statsPlayer); }}><Text style={s.statsProfileButtonText}>DÉFIER</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    if (accept) {
      unlockWebAudioForGesture();
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
      else if (message.includes('BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED')) notEnoughFreeAlert('Il te faut au moins 3 Free pour accepter ce Battle');
      else Alert.alert('Battle', 'Impossible de traiter cette invitation. Réessaie immédiatement.');
    } finally {
      setRespondingChallengeId(null);
    }
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
    if (accept) unlockWebAudioForGesture();
    try {
      const result = await respondKeepBattleArenaRematch(item.arenaId, accept);
      setPendingRematch((rows) => rows.filter((x) => x.arenaId !== item.arenaId));
      if (accept) {
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        setSolo(null); setBrowseOnline(false); setAudioReady(false);
        setArena(result);
        animateVersus();
      }
    } catch {
      setPendingRematch((rows) => rows.filter((x) => x.arenaId !== item.arenaId));
    } finally {
      setRematchBannerBusyId(null);
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
      else if (message.includes('BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES')) {
        const until = parseInviteBlockedUntilMs(message);
        if (until) {
          setInviteBlockedUntil((rows) => ({ ...rows, [player.profileId]: until }));
          Alert.alert('Battle', `@${player.username} a refusé plusieurs fois. Tu pourras réinviter dans ${formatInviteCooldown(until - Date.now())}.`);
        } else {
          Alert.alert('Battle', `@${player.username} a refusé plusieurs fois. Réessaie un peu plus tard.`);
        }
      }
      else if (message.includes('BATTLE_SKILL_GAP_TOO_LARGE')) Alert.alert('Battle', `L’écart de niveau avec @${player.username} est trop grand. Enchaîne des parties solo pour monter de catégorie.`);
      else if (message.includes('BATTLE_DAILY_INVITE_LIMIT_REACHED')) Alert.alert('Battle', 'Tu as atteint le nombre d’invitations Battle autorisées aujourd’hui. Réessaie demain.');
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
    // Adel (02/09/2026) : "en attendant la réponse, tu laisses la musique" --
    // répondre ne doit pas couper l'extrait avant l'heure : le morceau
    // s'arrête déjà tout seul à la fin naturelle de la manche (timeout ou
    // reveal, voir plus bas).
    setSoloAnswer(choice);
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

  // Adel (03/09/2026) : "quoi qu'il arrive, si j'appuie sur quitter ou sur la
  // croix, ça me remet sur jouer en solo / Battle en ligne" -- changement
  // explicite demandé par-dessus la règle du 02/09 (qui faisait sortir ×
  // complètement vers "Salon musical" via onExit) : × et "QUITTER LE
  // BATTLE" doivent maintenant amener au même endroit que ‹, l'accueil
  // INTERNE de Battle, jamais plus loin.
  const backToArenaHome = React.useCallback(() => {
    void stopTrackPreview();
    if (arena?.id) void leaveKeepBattleArena(arena.id).catch(() => {});
    setArena(null);
    setBuildingArenaId(null);
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
    backToArenaHome();
  }, [arena, backToArenaHome]);

  const closeBattleArena = React.useCallback(() => {
    void stopTrackPreview();
    // Adel (02/09/2026) : "je suis sorti du Battle ... il tourne encore" --
    // fermer l'écran doit prévenir le serveur (forfait si la partie était
    // active, sinon simple sortie du groupe) sinon le siège reste ACTIVE
    // pour toujours côté serveur.
    if (arena?.id) void leaveKeepBattleArena(arena.id).catch(() => {});
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
    setBuildingArenaId(null);
  }, [arena?.id]);

  const answerArena = async (choice: string) => {
    if (!arena || arena.status !== 'ACTIVE' || arena.round?.answered || arena.round?.revealed || pending) return;
    const startsAt = arena.round?.startedAt ? new Date(arena.round.startedAt).getTime() : 0;
    const closesAt = arena.round?.closesAt ? new Date(arena.round.closesAt).getTime() : 0;
    if ((startsAt && Date.now() < startsAt) || (closesAt && Date.now() >= closesAt)) return;
    // Adel (02/09/2026) : "en attendant la réponse, tu laisses la musique" --
    // en arène, d'autres joueurs répondent peut-être encore : couper le son
    // dès QUE J'appuie serait déloyal pour eux. Le morceau s'arrête déjà tout
    // seul quand la manche est révélée pour tout le monde (voir l'effet sur
    // arena.round.revealed).
    setPending(choice);
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
      return <View style={s.root}>
        <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setSoloFinished(false); setSolo(null); void leaveSoloBattle().catch(() => {}); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE</Text><Text style={s.title}>PARTIE TERMINÉE</Text></View><Text style={s.round}>{solo.rounds.length}/{solo.rounds.length}</Text></View>
        {/* Adel (02/09/2026) : "à l'étape huit pourquoi tu mets pas cette
            invitation ... la partie est terminée" -- vrai trou : incoming[0]
            continue d'être sondé même sur cet écran de fin de partie
            (aucune garde `soloFinished` dans la boucle de sondage), mais
            cet écran ne rendait jamais la bannière -- une invitation reçue
            pile à la fin de la partie 8/8 restait invisible. Même bloc que
            l'écran de jeu actif (et l'écran "Joueurs disponibles" un peu
            plus bas), pas de nouvelle logique. */}
        {!incoming[0] && pendingRematch[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><View style={{ flex: 1 }}><Text style={s.inviteQuestion}>🔁 Revanche proposée avec {pendingRematch[0].participantUsernames.map((u) => `@${u}`).join(', ') || 'le groupe'}. Tu peux te rattraper ! Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(pendingRematch[0].themeCode)} · {Math.max(0, Math.ceil((new Date(pendingRematch[0].rematchDeadline).getTime() - now) / 1000))}s pour répondre</Text></View></View><View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.no, rematchBannerBusyId && s.actionDisabled]} onPress={() => { void respondPendingRematch(pendingRematch[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.yes, rematchBannerBusyId && s.actionDisabled]} onPress={() => { void respondPendingRematch(pendingRematch[0], true); }}><Text style={s.yesText}>{rematchBannerBusyId === pendingRematch[0].arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}
        {incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {incoming[0].roundCount} morceaux · {challengeRemaining}s</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}
        {/* Adel (01/09/2026) : "les boutons sont trop serrés en bas ... remonte
            les boutons correctement qu'on puisse tout voir" -- avec 3-4 boutons
            de fin de partie, la hauteur totale dépassait l'écran sur certains
            téléphones et coupait le dernier bouton sous la barre d'onglets.
            ScrollView garantit que tout reste atteignable quelle que soit la
            taille de l'écran, au lieu de deviner une hauteur fixe. */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.finishScroll}>
          <Animated.View style={[s.finishHero, { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] }]}>
            <Text style={s.finishSpark}>✦ ⚡ ✦</Text>
            <ResultIcon icon={perfect ? '👑' : soloScore >= 6 ? '🏆' : soloScore >= 4 ? '🎯' : '💪'} big={perfect} />
            <Text style={s.finishTitle}>{perfect ? `PARFAIT · ${solo.rounds.length}/${solo.rounds.length}` : `${soloScore}/${solo.rounds.length}`}</Text>
            <Text style={s.finishSub}>{perfect ? 'Aucune erreur. Loki BATTLE MASTER.' : soloScore >= 6 ? 'Très gros score.' : soloScore >= 4 ? 'Bien joué. Tu peux faire mieux.' : 'Repars immédiatement pour prendre ta revanche.'}</Text>
            <View style={s.finishScore}><Animated.Text style={[s.finishScoreBig, jackpotScoreStyle]}>{soloScore}</Animated.Text><Text style={s.finishScoreSlash}> / {solo.rounds.length}</Text></View>
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
        </ScrollView>
      </View>;
    }
    return <View style={s.root}>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={() => { setSolo(null); void stopTrackPreview(); void leaveSoloBattle().catch(() => {}); }}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE</Text><Text style={s.title}>{themeLabel(solo.themeCode)}</Text></View><Text style={s.round}>{soloIndex + 1}/{solo.rounds.length}</Text></View>
      {/* Adel (02/09/2026) : "règle une fois pour toute ... je ne vois pas
          l'utilisateur entier" -- sans ScrollView, sur un écran/viewport
          court (barre d'adresse + barre d'onglets fixe du build web), le
          panneau "joueurs disponibles" tout en bas pouvait finir caché sans
          aucun moyen de le voir. Un ScrollView rend la carte + le panneau
          TOUJOURS atteignables quelle que soit la hauteur d'écran, au lieu
          de dépendre d'une marge fixe qui ne marche que sur certains
          appareils. */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.soloScroll}>
      <View style={s.clockRow}><Text style={[s.clock, audioReady && soloRemaining < 2200 && s.clockHot]}>{incoming[0] ? 'PAUSE' : audioReady ? `${(displayedSoloRemaining / 1000).toFixed(1)}s` : 'PRÊT'}</Text><Text style={s.clockHint}>{incoming[0] ? 'INVITATION BATTLE' : audioReady ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}</Text></View>
      <View style={s.timeTrack}><View style={[s.timeFill, { width: `${pct}%` }]} /></View>
      <Animated.View style={[s.card, { transform: [{ scale: pulse }] }]}>
        <View style={s.visual}>{answered && round.artworkUrl ? <RevealArtwork uri={round.artworkUrl} /> : <EqualizerBars />}{answered ? <View style={s.result}><Text style={correct ? s.good : s.bad}>{correct ? 'GAGNÉ !' : timeout ? 'OUPS · TROP TARD' : 'PERDU'}</Text><Text style={s.artist}>{round.artist}</Text></View> : null}</View>
        {!incoming[0] && pendingRematch[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><View style={{ flex: 1 }}><Text style={s.inviteQuestion}>🔁 Revanche proposée avec {pendingRematch[0].participantUsernames.map((u) => `@${u}`).join(', ') || 'le groupe'}. Tu peux te rattraper ! Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(pendingRematch[0].themeCode)} · {Math.max(0, Math.ceil((new Date(pendingRematch[0].rematchDeadline).getTime() - now) / 1000))}s pour répondre</Text></View></View><View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.no, rematchBannerBusyId && s.actionDisabled]} onPress={() => { void respondPendingRematch(pendingRematch[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.yes, rematchBannerBusyId && s.actionDisabled]} onPress={() => { void respondPendingRematch(pendingRematch[0], true); }}><Text style={s.yesText}>{rematchBannerBusyId === pendingRematch[0].arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}
        {incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {incoming[0].roundCount} morceaux · {challengeRemaining}s</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}
        <Text style={s.question}>Qui chante ?</Text>
        <View style={s.answers}>{round.choices.slice(0, 3).map((choice, i) => <TouchableOpacity key={choice} disabled={!audioReady || answered || Boolean(incoming[0]) || pausedSoloRemaining !== null} onPress={() => answerSolo(choice)} style={[s.answer, i === 2 && s.answerFull, answered && choice === round.correctAnswer && s.answerCorrect, answered && choice === soloAnswer && choice !== round.correctAnswer && s.answerWrong]}><Text style={s.answerNo}>{i + 1}</Text><Text numberOfLines={3} style={s.answerText}>{primaryArtistLabel(choice)}</Text></TouchableOpacity>)}</View>
      </Animated.View>
      <View style={s.scoreLine}><Text style={s.score}>✓ {soloScore} · ✕ {errors}</Text><Text style={s.score}>{remaining} à jouer</Text></View>
      {/* Adel (02/09/2026) : "trouve une solution où il y a l'abonné
          l'utilisateur, il faut que ça soit tout visible correctement ...
          ne fais pas des gros textes, juste un bouton jaune Battle juste en
          face de l'invité" -- rangée compacte (avatar + pseudo + bouton),
          au lieu de cartes empilées verticalement dans un scroll horizontal
          qui poussait le bouton hors de l'écran visible. */}
      {enabled ? <View style={s.live}><View style={s.liveHeader}><View style={s.dot} /><Text style={s.liveTitle}>{livePlayers.length ? `${livePlayers.length} joueur${livePlayers.length > 1 ? 's' : ''} disponible${livePlayers.length > 1 ? 's' : ''}` : 'Tu es visible pour les Battles'}</Text></View>{livePlayers.length ? <View style={s.liveList}>{livePlayers.slice(0, 3).map((p) => <View key={p.profileId} style={s.liveRowCompact}><TouchableOpacity style={s.liveRowLeft} onPress={() => openPlayerStats(p)}><Avatar name={p.username} url={p.avatarUrl} size={32} /><PresenceDot online /><Text numberOfLines={1} style={s.liveRowName}>@{p.username}{p.skillTier ? ` · ${tierLabel(p.skillTier)}` : ''}</Text></TouchableOpacity>{(() => { const sent = outgoingPendingTargetIds.has(p.profileId); const blockedMs = (inviteBlockedUntil[p.profileId] || 0) - now; const blocked = blockedMs > 0; return <TouchableOpacity disabled={Boolean(challengeBusyId) || sent || blocked} style={[s.battleButton, challengeBusyId === p.profileId && s.battleButtonSending, sent && s.battleButtonSent, blocked && s.battleButtonBlocked, challengeBusyId && challengeBusyId !== p.profileId && s.actionDisabled]} onPress={() => { void challenge(p); }}><Text style={[s.battleButtonText, sent && s.battleButtonSentText, blocked && s.battleButtonBlockedText]}>{challengeBusyId === p.profileId ? 'ENVOI…' : blocked ? `⏳ ${formatInviteCooldown(blockedMs)}` : sent ? 'ENVOYÉ ✓' : 'BATTLE'}</Text></TouchableOpacity>; })()}</View>)}</View> : null}</View> : null}
      </ScrollView>
      {renderPlayerStatsModal()}
    </View>;
  }

  if (spectating) {
    const specTeamA = spectating.seats.filter((_, index) => index % 2 === 0);
    const specTeamB = spectating.seats.filter((_, index) => index % 2 === 1);
    const canJoin = spectating.status !== 'CLOSED' && spectating.status !== 'EXPIRED';
    return <View style={s.root}>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={() => setSpectating(null)}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE · SPECTATEUR</Text><Text style={s.title}>{themeLabel(spectating.themeCode)}</Text></View><Text style={s.round}>{spectating.currentRound || 0}/{spectating.roundCount}</Text></View>
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
    const ready = arena.status === 'ACTIVE' && (!startsAt || now >= startsAt) && audioReady;
    const left = arena.status === 'ACTIVE' && closesAt ? Math.max(0, closesAt - Math.max(now, startsAt || now)) : ROUND_MS;
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
    const versusLabel = players.length > 2 ? players.map((p: any) => `@${p.username}`).join(' · ') : `${first ? `@${first.username}` : 'Loki'} VS ${second ? `@${second.username}` : 'Loki'}`;
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
      const rematchDeadline = arena.rematchDeadline;
      const rematchRemaining = rematchDeadline ? Math.max(0, Math.ceil((new Date(rematchDeadline).getTime() - now) / 1000)) : 0;
      const arenaMeRematchReady = arena.me?.rematchReady;
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
        <View style={s.header}><TouchableOpacity style={s.back} onPress={backToArenaHome}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE · FIN DU MATCH</Text><Text style={s.title}>{themeLabel(arena.themeCode)}</Text></View><Text style={s.round}>{arena.seats.length}J</Text></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.finishScroll}>
          <Animated.View style={[s.finishHero, { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] }]}>
            <Text style={s.finishSpark}>✦ 👑 ✦</Text>
            {winner ? <Avatar name={winner.username} url={winner.avatarUrl} size={72} /> : <ResultIcon icon="🏆" />}
            <Text style={s.finishTitle}>{winner ? `@${winner.username}` : 'BATTLE TERMINÉ'}</Text>
            <Text style={s.finishSub}>{winner ? 'remporte ce Battle' : 'Résultat enregistré'}</Text>
            <View style={s.finishScore}><Animated.Text style={[s.finishScoreBig, jackpotScoreStyle]}>{winner?.score ?? arena.lastResult.score}</Animated.Text><Text style={s.finishScoreSlash}> pts</Text></View>
            {/* Adel (02/09/2026) : "@adel4A remporte ce Battle / -3 FREE"
                (rapporté comme un bug) -- le nom/score du haut sont ceux du
                VAINQUEUR, cette ligne est TOUJOURS le résultat du joueur qui
                regarde l'écran (arena.lastResult). Sans préfixe, "-3 FREE"
                juste sous le nom du gagnant lit comme une contradiction. */}
            <Text style={arena.lastResult.won ? s.finishWon : s.finishLost}>{arena.lastResult.won ? `TOI : +${arena.lastResult.creditDelta} FREE · GAGNÉ` : `TOI : ${arena.lastResult.creditDelta} FREE · MATCH TERMINÉ`}</Text>
            <Text style={s.finishTaunt}>{battleResultMessage(arena.id, arena.lastResult.won)}</Text>
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
                  <Text style={s.inviteQuestion}>🔁 {arena.seats.filter((seat) => seat.profileId !== arena.me?.profileId).map((seat) => `@${seat.username}`).join(', ') || 'Le groupe'} souhaite prendre sa revanche. Acceptez-vous ?</Text>
                  <Text style={s.inviteLabel}>⚡ {rematchRemaining}s pour répondre</Text>
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
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={rematchResponding} style={[s.no, rematchResponding && s.actionDisabled]} onPress={() => { setRematchResponding(true); void respondKeepBattleArenaRematch(arena.id, false).then(() => { void stopTrackPreview(); setArena(null); }).catch(() => {}).finally(() => setRematchResponding(false)); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={rematchResponding} style={[s.yes, rematchResponding && s.actionDisabled]} onPress={() => { unlockWebAudioForGesture(); setRematchResponding(true); void respondKeepBattleArenaRematch(arena.id, true).then(setArena).catch(() => {}).finally(() => setRematchResponding(false)); }}><Text style={s.yesText}>{rematchResponding ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity>
              </View>
            </Animated.View>
          ) : null}
          {/* Adel (02/09/2026) : "d'un côté les gagnants d'un côté les
              perdants, le nombre de secondes en tout petit ... pas besoin de
              mettre des photos, juste les trophées ... ça va inspirer TikTok
              pour les matchs" -- classement complet de CE match (pas le
              cumul multi-matchs de PALMARÈS ci-dessous), compact, sans avatar. */}
          {arena.lastMatchResults && arena.lastMatchResults.length > 0 ? (
            <View style={s.matchRanking}>
              <Text style={s.matchRankingTitle}>CE MATCH</Text>
              {arena.lastMatchResults.map((entry) => (
                <TouchableOpacity key={entry.profileId} accessibilityRole="button" onPress={() => onOpenProfile(entry.username)} style={[s.matchRankRow, entry.won ? s.matchRankRowWon : s.matchRankRowLost]}>
                  <Text style={s.matchRankTrophy}>{entry.placement === 1 ? '🏆' : entry.placement === 2 ? '🥈' : entry.placement === 3 ? '🥉' : entry.placement}</Text>
                  <Text numberOfLines={1} style={s.matchRankName}>@{entry.username}</Text>
                  <Text style={s.matchRankScore}>{entry.score} pts</Text>
                  <Text style={s.matchRankCorrect}>✓{entry.correct}·✕{Math.max(0, arena.roundCount - entry.correct)}</Text>
                  <Text style={s.matchRankTime}>{(entry.responseMs / 1000).toFixed(1)}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {palmares.length ? <View style={s.palmares}><Text style={s.palmaresTitle}>PALMARÈS · TOP 3</Text>{palmares.map((entry, index) => <TouchableOpacity key={entry.profileId} accessibilityRole="button" onPress={() => onOpenProfile(entry.username)} style={s.palmaresRow}><Text style={s.palmaresRank}>{index + 1}</Text><Avatar name={entry.username} url={entry.avatarUrl} size={38} /><Text numberOfLines={1} style={s.palmaresName}>@{entry.username}</Text><Text style={s.palmaresWins}>{entry.wins} victoire{entry.wins > 1 ? 's' : ''}</Text></TouchableOpacity>)}</View> : null}
          <Text style={s.finishQuestion}>Le groupe reste ensemble. Et maintenant ?</Text>
          {/* Adel (02/09/2026) : "il faut que ça envoie un popup à tout le
              monde ... souhaitez-vous oui ou non, celui qui veut rentrer il
              rentre, celui qui veut arrêter il arrête" -- REVANCHE ne relance
              plus le match instantanément pour tout le groupe : ça propose,
              chacun répond, et seuls ceux qui ont dit oui rejouent. */}
          {rematchDeadline && arenaMeRematchReady !== true ? null : (
            <TouchableOpacity disabled={busy || Boolean(rematchDeadline)} style={s.finishPrimary} onPress={() => {
              unlockWebAudioForGesture();
              setBusy(true);
              void proposeKeepBattleArenaRematch(arena.id).then(setArena).catch((e: any) => {
                // Adel (02/09/2026) : "Battle / BATTLE_ARENA_FORBIDDEN" -- un
                // code d'erreur brut s'affichait tel quel au lieu d'un
                // message compréhensible.
                const message = String(e?.message || e || '');
                if (message.includes('BATTLE_ARENA_FORBIDDEN')) Alert.alert('Battle', 'Tu ne fais plus partie de ce groupe. Rejoins un nouveau Battle.');
                else if (message.includes('MINIMUM_THREE_FREE_REQUIRED')) notEnoughFreeAlert('Il te faut au moins 3 Free pour relancer un Battle');
                else Alert.alert('Battle', 'Impossible de proposer une revanche pour le moment.');
              }).finally(() => setBusy(false));
            }}><Text style={s.finishPrimaryText}>{busy ? 'PRÉPARATION…' : rematchDeadline ? `EN ATTENTE DES AUTRES · ${rematchRemaining}s` : 'REVANCHE'}</Text></TouchableOpacity>
          )}
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
          {arenaInviteOpen ? <View style={s.arenaInvitePanel}><Text style={s.arenaInviteTitle}>JOUEURS DISPONIBLES · GROUPE {arena.seats.length}/10</Text>{busy ? <ActivityIndicator color="#E5F266" /> : livePlayers.length ? <ScrollView style={s.arenaInviteScroll} contentContainerStyle={s.arenaInviteList}>{livePlayers.map((player) => { const invited = arenaInvitedIds.includes(player.profileId); const blockedMs = (inviteBlockedUntil[player.profileId] || 0) - now; const blocked = blockedMs > 0; return <View key={player.profileId} style={s.arenaInviteRow}><TouchableOpacity onPress={() => onOpenProfile(player.username)}><Avatar name={player.username} url={player.avatarUrl} size={46} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={s.arenaInviteName}>@{player.username}</Text><Text style={s.arenaInviteMeta}>● disponible · {themeLabel(player.themeCode)}</Text></View><TouchableOpacity accessibilityRole="button" hitSlop={10} disabled={invited || blocked || Boolean(arenaInviteBusyId)} style={[s.arenaInviteButton, (invited || blocked) && s.actionDisabled]} onPress={() => { void invitePlayerToArena(player); }}><Text style={s.arenaInviteButtonText}>{arenaInviteBusyId === player.profileId ? 'ENVOI…' : blocked ? `⏳ ${formatInviteCooldown(blockedMs)}` : invited ? 'INVITÉ' : 'INVITER'}</Text></TouchableOpacity></View>; })}</ScrollView> : <Text style={s.arenaInviteEmpty}>Aucun autre joueur disponible pour le moment.</Text>}<TouchableOpacity style={s.arenaShareButton} onPress={() => { void shareArenaInvite(arena); }}><Text style={s.arenaShareButtonText}>INVITER UN AMI PAR LIEN</Text></TouchableOpacity></View> : null}
          {/* Adel (02/09/2026) : "quand j'appuie sur quitter, il faut que je
              quitte automatiquement et ça me remette sur soirée" -- QUITTER
              LE BATTLE ne devait ramener qu'à l'accueil Battle interne
              (JOUER SOLO / BATTLE EN LIGNE), pas sortir complètement comme le
              ×. Même comportement que closeBattleArena désormais. */}
          <TouchableOpacity style={s.finishSecondary} onPress={() => { setArenaInviteOpen(false); closeBattleArena(); }}><Text style={s.finishSecondaryText}>QUITTER LE BATTLE</Text></TouchableOpacity>
        </ScrollView>
      </View>;
    }
    return <View style={s.root}>
      {/* Adel (03/09/2026) : "on est dans un Battle, pourquoi elle reste" --
          la croix de fermeture n'a plus lieu d'être une fois la manche
          lancée (WAITING/ACTIVE) ; sortir se fait via ‹ (backToArenaHome)
          ou "QUITTER LE BATTLE" sur l'écran de fin. Conservée uniquement là. */}
      <Animated.View pointerEvents="none" style={[s.versus, { opacity: versusOpacity, transform: [{ scale: versusScale }] }]}><Text style={s.versusText}>⚡ BATTLE ⚡</Text><Text style={s.versusNames}>{versusLabel}</Text></Animated.View>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={backToArenaHome}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE · {arena.seats.length} JOUEURS</Text><Text style={s.title}>{themeLabel(arena.themeCode)}</Text></View><Text style={s.round}>{arena.currentRound || 0}/{arena.roundCount}</Text></View>
      {myCreditStatus ? <View style={s.creditBadgeRow}><Text style={s.creditBadgeText}>🎁 {formatCompactNumber(myCreditStatus.remainingFree)} Free restant</Text></View> : null}
      {/* Adel (03/09/2026) : "on voit pas les titres en dessous, on voit pas
          la suite du bas" -- vrai bug : cet écran n'avait AUCUN scroll, donc
          dès que la grille d'équipes ajoutait ne serait-ce qu'une ligne de
          hauteur en plus, la question et les réponses 2/3 sortaient de
          l'écran sans aucun moyen d'y accéder. ScrollView de secours, en plus
          (pas à la place) du carré compact -- jamais plus de contenu
          totalement inatteignable pendant un chrono de quelques secondes. */}
      <ScrollView style={s.arenaScroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.arenaScrollContent}>
      {first && second && players.length === 2 ? <View style={s.duel}><View style={s.duelNames}><TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenProfile(first.username)}><Text style={s.duelName}>@{first.username}</Text><Text style={s.duelPoints}>{teamAScore} pts</Text></TouchableOpacity><View style={s.duelCenter}><Text style={s.duelScore}>VS</Text><Text style={s.duelTimer}>{arena.status === 'ACTIVE' ? `${Math.ceil(left / 1000)}s` : 'PRÊT'}</Text></View><TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenProfile(second.username)}><Text style={[s.duelName, { textAlign: 'right' }]}>@{second.username}</Text><Text style={[s.duelPoints, { textAlign: 'right' }]}>{teamBScore} pts</Text></TouchableOpacity></View><View style={s.power}><Animated.View style={[s.powerLeft, { width: powerShareAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} /><View style={s.powerMiddle} /><View style={s.powerRight} /></View></View> : null}
      {arena.status === 'WAITING' ? <View style={s.waiting}><Text style={s.trophy}>⚡</Text><Text style={s.winner}>{arena.seats.length < 2 ? 'EN ATTENTE' : 'JOUEURS EN SYNCHRONISATION'}</Text><Text style={s.waitText}>{arena.seats.length >= 2 ? 'Tous les joueurs entrent dans la même partie. Le morceau démarre sur le même chrono.' : 'En attente d’un adversaire.'}</Text></View> : null}
      {arena.status === 'ACTIVE' && round ? <><View style={s.clockRow}><Text style={[s.clock, ready && left < 2200 && s.clockHot]}>{ready ? `${(left / 1000).toFixed(1)}s` : 'PRÊT'}</Text><Text style={s.clockHint}>{round.answered ? 'RÉPONSE ENREGISTRÉE' : ready ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}</Text></View><View style={s.timeTrack}><View style={[s.timeFill, { width: `${ready ? pct : 100}%` }]} /></View><Animated.View style={[s.card, { transform: [{ scale: pulse }] }]}><View style={s.visual}>{round.revealed && round.artworkUrl ? <RevealArtwork uri={round.artworkUrl} /> : <EqualizerBars />}{round.revealed ? <View style={s.result}><Text style={round.myAnswer?.correct ? s.good : s.bad}>{round.myAnswer?.correct ? 'GAGNÉ !' : round.answered ? 'PERDU' : 'OUPS · TROP TARD'}</Text><Text style={s.artist}>{round.artist || ''}</Text>{arena.roundWinner ? <Text style={s.roundWinner}>⚡ @{arena.roundWinner.username} gagne la manche en {(arena.roundWinner.responseMs / 1000).toFixed(1)}s</Text> : null}</View> : null}</View>
      {/* Adel (04/09/2026) : "tu les mets juste en dessous entre qui chante
          et la jaquette" -- au-delà de 2 joueurs, le mini-classement se
          place maintenant entre la jaquette/l'égaliseur et la question,
          plus au-dessus de tout l'écran. Toujours un nom sous l'autre
          (haut en bas), jamais en grille -- seule sa position a changé. */}
      {/* Adel (05/09/2026) : "si par exemple demain on est 10, comment t'as
          prévu, est-ce qu'on va être obligé de Swiper" -- pendant une
          manche chronométrée, afficher les 10 joueurs forcerait un scroll
          pour voir la question/les réponses. Le direct se limite aux 5
          premiers + ma propre ligne si je suis classé plus bas (jamais
          invisible à mes propres yeux) ; le classement complet reste
          disponible sur l'écran d'attente et de fin de match, pas sous
          pression du chrono. */}
      {players.length > 2 ? <View style={s.groupStandings}><Text style={s.groupStandingsTitle}>{players.length} JOUEURS · {arena.status === 'ACTIVE' ? `${Math.ceil(left / 1000)}s` : 'PRÊT'}</Text>{(() => {
        const top = players.slice(0, 5);
        const meId = arena.me?.profileId;
        const meVisible = !meId || top.some((p) => p.profileId === meId);
        const mePlayer = meId ? players.find((p) => p.profileId === meId) : null;
        const visible = meVisible || !mePlayer ? top : [...top, mePlayer];
        const hidden = players.length - visible.length;
        return <>
          {visible.map((player) => {
            const rank = players.findIndex((p) => p.profileId === player.profileId);
            return <TouchableOpacity key={player.profileId} style={[s.groupStandingRow, rank === 0 && s.groupStandingRowLead]} onPress={() => onOpenProfile(player.username)}><Text style={s.groupStandingRank}>{rank === 0 ? '👑' : `#${rank + 1}`}</Text><Text style={s.groupStandingName} numberOfLines={1}>@{player.username}</Text><Text style={s.groupStandingScore}>{Number(player?.score || 0)} pts</Text></TouchableOpacity>;
          })}
          {hidden > 0 ? <Text style={s.groupStandingsMore}>+{hidden} autre{hidden > 1 ? 's' : ''}</Text> : null}
        </>;
      })()}</View> : null}
      <Text style={s.question}>Qui chante ?</Text>
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
      {/* Adel (05/09/2026) : "pourquoi il y a un vide sur le bouton" -- BUG
          RÉEL confirmé sur capture : avec exactement 3 choix (toujours le
          cas en Battle) et une grille 2 colonnes, le 3e bouton se retrouvait
          seul sur sa ligne, laissant un vide béant à droite. Le 3e (dernier)
          choix prend maintenant toute la largeur de sa ligne au lieu de
          rester à 48%. */}
      <View style={s.answers}>{(round.choices || []).slice(0, 3).map((choice, i) => <TouchableOpacity key={choice} disabled={Boolean(!ready || round.answered || round.revealed || pending || left <= 0)} onPress={() => { void answerArena(choice); }} style={[s.answer, i === 2 && s.answerFull, (round.myAnswer?.selectedAnswer === choice || pending === choice) && !round.myAnswer && s.answerSelected, Boolean(round.myAnswer) && choice === round.artist && s.answerCorrect, round.myAnswer?.selectedAnswer === choice && choice !== round.artist && s.answerWrong]}><Text style={s.answerNo}>{i + 1}</Text><Text numberOfLines={3} style={s.answerText}>{primaryArtistLabel(choice)}</Text>{choice === round.myAnswer?.selectedAnswer && round.myAnswer?.responseMs != null ? <Text style={s.answerTime}>{(round.myAnswer.responseMs / 1000).toFixed(1)}s</Text> : null}</TouchableOpacity>)}</View></Animated.View></> : null}
      </ScrollView>
    </View>;
  }

  if (browseOnline) {
    const browseChallengeRemaining = incoming[0] ? Math.max(0, Math.ceil((new Date(incoming[0].expiresAt).getTime() - now) / 1000)) : 0;
    return <View style={s.root}>
      {renderPlayerStatsModal()}
      <View style={s.header}><TouchableOpacity style={s.back} onPress={() => setBrowseOnline(false)}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>Loki BATTLE</Text><Text style={s.title}>Joueurs disponibles</Text></View><View style={{ width: 36 }} /></View>
      {/* Adel (04/09/2026) : "j'ai juste à envoyer une invite comme ça je
          puisse en envoyer plusieurs" -- BUG RÉEL : chaque appui sur BATTLE
          créait son propre match 1 contre 1 séparé, jamais un seul match à
          plusieurs. Le premier appui crée maintenant un salon de groupe ;
          ce bandeau reste affiché pour continuer à inviter d'autres joueurs
          de cette même liste avant de rejoindre le salon. */}
      {buildingArenaId ? <TouchableOpacity style={s.buildingArenaBanner} onPress={() => { void loadKeepBattleArena(buildingArenaId).then(setArena).catch(() => {}); }} accessibilityRole="button"><Text style={s.buildingArenaBannerText}>⚡ Salon en préparation · continue d’inviter ci-dessous, puis appuie ici pour le rejoindre</Text></TouchableOpacity> : null}
      {!incoming[0] && pendingRematch[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><View style={{ flex: 1 }}><Text style={s.inviteQuestion}>🔁 Revanche proposée avec {pendingRematch[0].participantUsernames.map((u) => `@${u}`).join(', ') || 'le groupe'}. Tu peux te rattraper ! Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(pendingRematch[0].themeCode)} · {Math.max(0, Math.ceil((new Date(pendingRematch[0].rematchDeadline).getTime() - now) / 1000))}s pour répondre</Text></View></View><View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.no, rematchBannerBusyId && s.actionDisabled]} onPress={() => { void respondPendingRematch(pendingRematch[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.yes, rematchBannerBusyId && s.actionDisabled]} onPress={() => { void respondPendingRematch(pendingRematch[0], true); }}><Text style={s.yesText}>{rematchBannerBusyId === pendingRematch[0].arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {incoming[0].roundCount} morceaux · {browseChallengeRemaining}s</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}<Text style={s.section}>NOMBRE DE MORCEAUX</Text><ScrollView horizontal style={s.themeScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeRow}>{ROUND_COUNT_OPTIONS.map((n) => <TouchableOpacity key={n} onPress={() => setRoundCount(n)} style={[s.theme, n === roundCount && s.themeOn]}><Text style={[s.themeText, n === roundCount && s.themeTextOn]}>{n}</Text></TouchableOpacity>)}</ScrollView>{renderMyPreferencesPicker()}
      {/* Adel (03/09/2026) : "un utilisateur pourra regarder le match en
          cours en tant que visiteur" -- keep_battle_open_salons existait déjà
          côté serveur (jamais branché à aucun écran) : liste les matchs
          WAITING/ACTIVE que n'importe qui peut suivre en spectateur. */}
      {openSalons.length ? <View style={s.liveMatches}><Text style={s.section}>MATCHS EN DIRECT</Text>{openSalons.map((salon) => <TouchableOpacity key={salon.id} style={s.liveMatchRow} onPress={() => { void startSpectating(salon); }}><PresenceDot online /><View style={{ flex: 1 }}><Text style={s.liveMatchTheme}>⚡ {salon.themeLabel} · {salon.players}/{salon.maxPlayers} joueurs</Text><Text style={s.liveMatchHost}>@{salon.hostUsername}{salon.queue > 0 ? ` · ${salon.queue} en file` : ''}</Text></View><Text style={s.liveMatchWatch}>REGARDER ›</Text></TouchableOpacity>)}</View> : null}
      {busy ? <ActivityIndicator color="#E5F266" /> : livePlayers.length ? <View style={s.browseList}>{livePlayers.map((p) => { const rank = leaderboardRank[p.profileId]; const rankBadge = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank ? `#${rank}` : null; const preferredLabel = p.preferredThemeCodes.length === 1 && p.preferredThemeCodes[0] === 'MIX' ? 'Mix' : p.preferredThemeCodes.map((c) => themeLabel(c)).join(', '); return <View key={p.profileId} style={s.browsePlayer}><TouchableOpacity onPress={() => openPlayerStats(p)}><Avatar name={p.username} url={p.avatarUrl} size={48} /><View style={s.browseAvatarDot}><PresenceDot online /></View></TouchableOpacity><View style={{ flex: 1 }}><TouchableOpacity onPress={() => openPlayerStats(p)} style={s.browseNameRow}><Text style={s.browseName}>@{p.username}</Text>{rankBadge ? <Text style={s.browseRankBadge}>{rankBadge}</Text> : null}<Text style={s.browseChevron}>›</Text></TouchableOpacity><Text style={s.browseMeta}>🎯 Accepte : {preferredLabel} · {p.preferredRoundCount} morceaux</Text></View>{(() => { const sent = outgoingPendingTargetIds.has(p.profileId); const blockedMs = (inviteBlockedUntil[p.profileId] || 0) - now; const blocked = blockedMs > 0; return <TouchableOpacity disabled={Boolean(challengeBusyId) || sent || blocked} style={[s.browseBattle, challengeBusyId === p.profileId && s.battleButtonSending, sent && s.battleButtonSent, blocked && s.battleButtonBlocked, challengeBusyId && challengeBusyId !== p.profileId && s.actionDisabled]} onPress={() => { void challenge(p); }}><Text style={[s.browseBattleText, sent && s.battleButtonSentText, blocked && s.battleButtonBlockedText]}>{challengeBusyId === p.profileId ? 'ENVOI…' : blocked ? `⏳ ${formatInviteCooldown(blockedMs)}` : sent ? 'ENVOYÉ ✓' : `BATTLE · ${themeLabel(themeCode)} · ${roundCount}`}</Text></TouchableOpacity>; })()}</View>; })}</View> : <View style={s.waiting}><Text style={s.trophy}>♫</Text><Text style={s.winner}>Aucun joueur solo visible</Text><Text style={s.waitText}>La liste se rafraîchit automatiquement.</Text><TouchableOpacity style={s.shareButton} onPress={() => { void shareInvite(); }}><Text style={s.shareButtonText}>INVITER UN AMI</Text></TouchableOpacity></View>}</View>;
  }

  // Adel (02/09/2026) : "il faut la rajouter qu'on soit pas obligé de
  // cliquer sur Battle en ligne pour voir l'invite" -- l'écran d'accueil de
  // Battle (avant tout choix Solo/En ligne) ne rendait jamais la bannière
  // d'invite entrante, alors que le solo, l'écran de fin et "Joueurs
  // disponibles" le font tous. Même bloc, mêmes handlers `respond`.
  const homeChallengeRemaining = incoming[0] ? Math.max(0, Math.ceil((new Date(incoming[0].expiresAt).getTime() - now) / 1000)) : 0;
  return <View style={s.root}><View style={s.home}><TouchableOpacity style={s.homeBack} onPress={onExit}><Text style={s.homeBackText}>‹</Text></TouchableOpacity><Text style={s.homeIcon}>⚡</Text><Text style={s.homeTitle}>Loki BATTLE</Text><Text style={s.homeSub}>10 secondes réelles d’écoute · 3 choix · aucun swipe</Text></View>{!incoming[0] && pendingRematch[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><View style={{ flex: 1 }}><Text style={s.inviteQuestion}>🔁 Revanche proposée avec {pendingRematch[0].participantUsernames.map((u) => `@${u}`).join(', ') || 'le groupe'}. Tu peux te rattraper ! Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(pendingRematch[0].themeCode)} · {Math.max(0, Math.ceil((new Date(pendingRematch[0].rematchDeadline).getTime() - now) / 1000))}s pour répondre</Text></View></View><View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.no, rematchBannerBusyId && s.actionDisabled]} onPress={() => { void respondPendingRematch(pendingRematch[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" hitSlop={10} disabled={Boolean(rematchBannerBusyId)} style={[s.yes, rematchBannerBusyId && s.actionDisabled]} onPress={() => { void respondPendingRematch(pendingRematch[0], true); }}><Text style={s.yesText}>{rematchBannerBusyId === pendingRematch[0].arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {incoming[0].roundCount} morceaux · {homeChallengeRemaining}s</Text></View></View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" hitSlop={10} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}<Text style={s.section}>NOMBRE DE MORCEAUX</Text><ScrollView horizontal style={s.themeScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeRow}>{ROUND_COUNT_OPTIONS.map((n) => <TouchableOpacity key={n} onPress={() => setRoundCount(n)} style={[s.theme, n === roundCount && s.themeOn]}><Text style={[s.themeText, n === roundCount && s.themeTextOn]}>{n}</Text></TouchableOpacity>)}</ScrollView>{renderMyPreferencesPicker()}<TouchableOpacity style={s.mainButton} disabled={busy} onPress={() => { void startSolo(); }}>{busy ? <ActivityIndicator color="#15110B" /> : <><Text style={s.mainButtonText}>JOUER SOLO</Text><Text style={s.mainButtonSub}>Le chrono attend que le son démarre</Text></>}</TouchableOpacity><TouchableOpacity style={s.onlineButton} disabled={busy} onPress={() => { void openOnline(); }}><Text style={s.onlineTitle}>BATTLE EN LIGNE</Text><Text style={s.onlineSub}>Voir les joueurs qui jouent déjà en solo</Text></TouchableOpacity></View>;
}

const s = StyleSheet.create({
  root: { width: '100%', flex: 1, paddingBottom: 4, position: 'relative' },
  statsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: 18 }, statsCard: { width: '100%', maxWidth: 400, borderRadius: 26, padding: 20, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369' }, statsClose: { position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: '#1F1830', alignItems: 'center', justifyContent: 'center', zIndex: 2 }, statsCloseText: { color: '#FFF', fontSize: 20, lineHeight: 22, fontWeight: '700' }, statsUsername: { color: '#FFF', fontSize: 20, fontWeight: '900', marginBottom: 14, paddingRight: 40 }, statsBigRow: { flexDirection: 'row', gap: 8 }, statsBigItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: '#1B1422' }, statsBigValue: { color: '#E5F266', fontSize: 22, fontWeight: '900' }, statsBigLabel: { color: '#B79CFF', fontSize: 11, fontWeight: '800', marginTop: 2, textAlign: 'center' }, statsSmallRow: { flexDirection: 'row', gap: 6, marginTop: 6 }, statsSmallItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 12, backgroundColor: '#17121D' }, statsSmallValue: { color: '#FFF', fontSize: 13, fontWeight: '900' }, statsSmallLabel: { color: '#8F879D', fontSize: 11, fontWeight: '800', marginTop: 1, textAlign: 'center' }, statsAvg: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 12 }, statsSectionTitle: { color: '#E5F266', fontSize: 11, fontWeight: '900', letterSpacing: .8, marginTop: 20, marginBottom: 8 }, statsThemeRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#1B1422', marginBottom: 6 }, statsThemeLabel: { color: '#FFF', fontSize: 12, fontWeight: '900' }, statsThemeValue: { color: '#B79CFF', fontSize: 11, fontWeight: '800' }, statsThemeEmpty: { color: '#B79CFF', fontSize: 12, lineHeight: 16, fontWeight: '700' }, statsActionsRow: { flexDirection: 'row', gap: 8, marginTop: 18 }, statsFollowButton: { flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }, statsFollowButtonText: { color: '#8B5CF6', fontSize: 11, fontWeight: '900' }, statsProfileButtonSmall: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }, statsProfileButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  prefsSummaryButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#17121D', borderWidth: 1, borderColor: '#30273A', marginBottom: 10 }, prefsSummaryLabel: { color: '#E5F266', fontSize: 11, fontWeight: '900', letterSpacing: .8 }, prefsSummaryValue: { color: '#FFF', fontSize: 13, fontWeight: '800', marginTop: 2 }, prefsSummaryHint: { color: '#75E6AA', fontSize: 11, fontWeight: '800', marginTop: 3 }, prefsSummaryChevron: { color: '#8F879D', fontSize: 20, fontWeight: '900' }, prefsPickerHint: { color: '#B79CFF', fontSize: 12, lineHeight: 16, fontWeight: '700', marginBottom: 12 }, prefsPickerScroll: { maxHeight: 320, marginBottom: 14 }, prefsPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42, paddingHorizontal: 4 }, prefsPickerCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#8B5CF6', textAlign: 'center', lineHeight: 19, color: '#17130B', fontSize: 13, fontWeight: '900' }, prefsPickerCheckboxOn: { backgroundColor: '#E5F266', borderColor: '#E5F266' }, prefsPickerRowText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  arenaInvitePanel: { maxHeight: 290, marginBottom: 8, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: '#4A3C55', backgroundColor: '#120E17' }, arenaInviteTitle: { color: '#E5F266', fontSize: 12, fontWeight: '900', marginBottom: 8 }, arenaInviteScroll: { maxHeight: 190 }, arenaInviteList: { gap: 7 }, arenaInviteRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 7, borderRadius: 15, backgroundColor: '#1B1422' }, arenaInviteName: { color: '#FFF', fontSize: 14, fontWeight: '900' }, arenaInviteMeta: { color: '#75E6AA', fontSize: 11, fontWeight: '800', marginTop: 2 }, arenaInviteButton: { minWidth: 94, minHeight: 52, paddingHorizontal: 13, borderRadius: 26, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, arenaInviteButtonText: { color: '#17130B', fontSize: 12, fontWeight: '900' }, arenaInviteEmpty: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 14 }, arenaShareButton: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: '#4A3C55', alignItems: 'center', justifyContent: 'center', marginTop: 8 }, arenaShareButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' }, closeBattle: { position: 'absolute', top: 0, right: 0, zIndex: 60, width: 48, height: 48, borderRadius: 24, backgroundColor: '#17121D', borderWidth: 1, borderColor: '#51445E', alignItems: 'center', justifyContent: 'center' }, closeBattleText: { color: '#FFF', fontSize: 30, lineHeight: 32, fontWeight: '700', marginTop: -2 }, finishScroll: { paddingBottom: 18 }, finishHero: { marginTop: 10, borderRadius: 24, borderWidth: 1, borderColor: '#5A476B', backgroundColor: '#17101F', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 20, overflow: 'hidden' }, finishSpark: { color: '#E5F266', fontSize: 18, fontWeight: '900', letterSpacing: 4 }, finishTrophy: { fontSize: 52, marginTop: 4 }, finishTrophyBig: { fontSize: 62 }, finishSessionHint: { color: '#B79CFF', fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 2, marginBottom: 6 }, finishTitle: { color: '#FFF', fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 5 }, finishSub: { color: '#FFF', fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center', marginTop: 5, maxWidth: 280 }, finishScore: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }, finishScoreBig: { color: '#E5F266', fontSize: 38, lineHeight: 42, fontWeight: '900' }, finishScoreSlash: { color: '#FFF', fontSize: 15, fontWeight: '900' }, finishWon: { color: '#7FF2B7', fontSize: 12, fontWeight: '900', marginTop: 7 }, finishLost: { color: '#FFB3C3', fontSize: 12, fontWeight: '900', marginTop: 7 }, finishTaunt: { color: '#FFF', fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center', marginTop: 6, paddingHorizontal: 12 }, finishQuestion: { color: '#FFF', textAlign: 'center', fontSize: 12, fontWeight: '900', marginVertical: 9 }, matchRanking: { marginTop: 10, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: '#40334B', backgroundColor: '#120E17', gap: 5 }, matchRankingTitle: { color: '#E5F266', fontSize: 11, fontWeight: '900', letterSpacing: .8, marginBottom: 2 }, matchRankRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, borderRadius: 12, backgroundColor: '#1B1422' }, matchRankRowWon: { borderWidth: 1, borderColor: '#38D990' }, matchRankRowLost: { opacity: .88 }, matchRankTrophy: { width: 20, textAlign: 'center', fontSize: 13, color: '#FFF', fontWeight: '900' }, matchRankName: { flex: 1, color: '#FFF', fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' }, matchRankScore: { color: '#E5F266', fontSize: 11, fontWeight: '900' }, matchRankCorrect: { color: '#B79CFF', fontSize: 11, fontWeight: '800' }, matchRankTime: { color: '#FFF', fontSize: 11, fontWeight: '800', minWidth: 32, textAlign: 'right' },
  palmares: { marginTop: 10, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: '#40334B', backgroundColor: '#120E17' }, palmaresTitle: { color: '#E5F266', fontSize: 13, lineHeight: 18, fontWeight: '900', letterSpacing: .7, marginBottom: 7 }, palmaresRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9 }, palmaresRank: { width: 24, color: '#E5F266', fontSize: 18, fontWeight: '900' }, palmaresName: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '900', textDecorationLine: 'underline' }, palmaresWins: { color: '#FFF', fontSize: 11, fontWeight: '800' }, finishPrimary: { minHeight: 46, borderRadius: 23, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }, finishPrimaryText: { color: '#17130B', fontSize: 12, fontWeight: '900' }, finishSecondary: { minHeight: 42, borderRadius: 21, borderWidth: 1.5, borderColor: '#6E5A94', backgroundColor: '#18121F', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }, finishSecondaryText: { color: '#FFF', fontSize: 11, fontWeight: '900' }, home: { alignItems: 'center', paddingVertical: 10, position: 'relative' }, homeBack: { position: 'absolute', left: 0, top: 5, width: 30, height: 30, borderRadius: 15, backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center' }, homeBackText: { color: '#FFF', fontSize: 23, lineHeight: 25 }, homeIcon: { fontSize: 28 }, homeTitle: { color: '#FFF', fontSize: 24, fontWeight: '900' }, homeSub: { color: '#FFF', fontSize: 11, fontWeight: '700', marginTop: 2 }, section: { color: '#E5F266', fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 5 }, themeScroll: { flexGrow: 0, flexShrink: 0, height: 38, maxHeight: 38 }, themeRow: { gap: 6, paddingRight: 12, alignItems: 'center' }, theme: { height: 32, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#30273A', backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, themeOn: { backgroundColor: '#FFF', borderColor: '#FFF' }, themeText: { color: '#FFF', fontSize: 11, fontWeight: '800' }, themeTextOn: { color: '#120E16' }, mainButton: { minHeight: 54, borderRadius: 25, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', marginTop: 14 }, mainButtonText: { color: '#17130B', fontSize: 14, fontWeight: '900' }, mainButtonSub: { color: '#494D22', fontSize: 11, fontWeight: '800', marginTop: 2 }, onlineButton: { minHeight: 58, borderRadius: 20, backgroundColor: '#18121F', borderWidth: 1, borderColor: '#31263B', alignItems: 'center', justifyContent: 'center', marginTop: 9 }, onlineTitle: { color: '#FFF', fontSize: 13, fontWeight: '900' }, onlineSub: { color: '#FFF', fontSize: 11, fontWeight: '700', marginTop: 2 }, header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 }, back: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#17121D', alignItems: 'center', justifyContent: 'center' }, backText: { color: '#FFF', fontSize: 24, lineHeight: 26 }, headerMid: { flex: 1, alignItems: 'center' }, kicker: { color: '#E5F266', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFF', fontSize: 15, fontWeight: '900' }, round: { width: 36, textAlign: 'right', color: '#FFF', fontSize: 11, fontWeight: '900' }, clockRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 }, clock: { color: '#FFF', fontSize: 25, fontWeight: '900' }, clockHot: { color: '#FF6687' }, clockHint: { color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: .8 }, timeTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#211A29', marginVertical: 5 }, timeFill: { height: '100%', backgroundColor: '#E5F266' }, card: { borderRadius: 22, padding: 7, backgroundColor: '#120E17', borderWidth: 1, borderColor: '#30263A' }, visual: { height: 120, borderRadius: 17, overflow: 'hidden', backgroundColor: '#21192A', alignItems: 'center', justifyContent: 'center', position: 'relative' }, cover: { width: '100%', height: '100%' }, music: { color: '#FFF', fontSize: 68, fontWeight: '900' }, result: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,6,10,.72)', alignItems: 'center', justifyContent: 'center', padding: 14 }, good: { color: '#7FF2B7', fontSize: 26, fontWeight: '900' }, bad: { color: '#FF6C8C', fontSize: 23, fontWeight: '900' }, artist: { color: '#FFF', fontSize: 19, fontWeight: '900', textAlign: 'center', marginTop: 5 }, roundWinner: { color: '#FFE193', fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 9 }, question: { color: '#FFF', fontSize: 15, fontWeight: '900', textAlign: 'center', marginTop: 7 }, answers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }, answer: { width: '48.2%', minHeight: 58, borderRadius: 14, backgroundColor: '#1D1625', borderWidth: 1, borderColor: '#342A40', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 7 }, answerFull: { width: '100%' }, answerSelected: { borderColor: '#E5F266', backgroundColor: '#30351B' }, answerCorrect: { borderColor: '#69E5A4' }, answerWrong: { borderColor: '#FF6C8C', backgroundColor: '#3A1B22' }, answerNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2B2235', color: '#FFF', textAlign: 'center', lineHeight: 26, fontSize: 13, fontWeight: '900' }, answerText: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '900' }, answerTime: { color: '#E5F266', fontSize: 11, fontWeight: '900' }, scoreLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 3 }, score: { color: '#FFF', fontSize: 13, fontWeight: '800' }, // Adel (02/09/2026) : "on voit bien le bouton en bas" -- le panneau "joueurs
  // disponibles" est poussé tout en bas par marginTop:'auto', mais rien ne
  // l'empêchait de finir pile derrière la barre d'onglets fixe (68px +
  // paddingBottom 8, voir Navigation.tsx) sur le build web, coupant
  // l'avatar/bouton BATTLE de la dernière ligne. marginBottom réserve cette
  // hauteur sans toucher au Design de la barre d'onglets elle-même.
  soloScroll: { flexGrow: 1, paddingBottom: 24 },
  live: { marginTop: 14, padding: 7, borderRadius: 16, backgroundColor: '#100D14' }, liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6EE8A7' }, liveTitle: { color: '#FFF', fontSize: 12, fontWeight: '900' }, liveList: { gap: 6, paddingTop: 7 }, liveRowCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40, paddingHorizontal: 7, borderRadius: 14, backgroundColor: '#18131F' }, liveRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }, liveRowName: { flex: 1, color: '#FFF', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' }, avatarFallback: { backgroundColor: '#2B2235', alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: '#FFF', fontSize: 16, fontWeight: '900' }, username: { color: '#FFF', fontSize: 11, fontWeight: '800', marginTop: 3, maxWidth: 70 }, battleButton: { minHeight: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', marginTop: 4 }, battleButtonText: { color: '#17130B', fontSize: 11, fontWeight: '900' }, battleButtonSending: { backgroundColor: '#8A7E4A', opacity: .85 }, battleButtonSent: { backgroundColor: '#1B1422', borderWidth: 1, borderColor: '#6EE8A7' }, battleButtonSentText: { color: '#6EE8A7' }, battleButtonBlocked: { backgroundColor: '#1B1422', borderWidth: 1, borderColor: '#FF5F83' }, battleButtonBlockedText: { color: '#FF5F83' }, invite: { marginTop: 10, minHeight: 142, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 24, borderWidth: 3, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center' }, inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, inviteActions: { flexDirection: 'row', gap: 12, width: '100%' }, inviteLabel: { color: '#E5F266', fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 4 }, inviteName: { color: '#FFF', fontSize: 17, lineHeight: 22, fontWeight: '900' }, inviteQuestion: { color: '#F3EDF7', fontSize: 16, lineHeight: 22, fontWeight: '800' }, inviteConnecting: { color: '#E5F266', fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: .5 }, no: { flex: 1, minHeight: 64, paddingHorizontal: 16, borderRadius: 32, borderWidth: 3, borderColor: '#8A7795', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 16, fontWeight: '900' }, yes: { flex: 1, minHeight: 64, paddingHorizontal: 16, borderRadius: 32, borderWidth: 3, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 16, fontWeight: '900' }, actionDisabled: { opacity: .62 }, versus: { position: 'absolute', zIndex: 20, left: 16, right: 16, top: 120, padding: 18, borderRadius: 24, backgroundColor: '#22152D', borderWidth: 1, borderColor: '#8B5CF6', alignItems: 'center' }, versusText: { color: '#E5F266', fontSize: 25, fontWeight: '900' }, versusNames: { color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 5 }, duel: { marginBottom: 6 }, duelNames: { flexDirection: 'row', alignItems: 'center' }, duelName: { color: '#FFF', fontSize: 13, fontWeight: '900' }, duelScore: { color: '#E5F266', fontSize: 15, fontWeight: '900' }, duelCenter: { minWidth: 46, alignItems: 'center', justifyContent: 'center' }, duelTimer: { color: '#FFF', fontSize: 11, fontWeight: '900', marginTop: 2 }, duelPoints: { color: '#FFF', fontSize: 13, fontWeight: '900', marginTop: 3 }, teamMembers: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }, teamChip: { paddingHorizontal: 6, minHeight: 22, borderRadius: 11, backgroundColor: '#1D1625', alignItems: 'center', justifyContent: 'center' }, teamChipText: { color: '#FFF', fontSize: 11, fontWeight: '800' }, power: { height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2032', flexDirection: 'row', position: 'relative', marginTop: 7 }, powerLeft: { height: '100%', backgroundColor: '#8B5CF6' }, powerRight: { flex: 1, height: '100%', backgroundColor: '#E14E78' }, powerMiddle: { position: 'absolute', zIndex: 3, left: '50%', width: 2, height: '100%', backgroundColor: '#FFF' }, waiting: { padding: 14, borderRadius: 21, backgroundColor: '#120E17', borderWidth: 1, borderColor: '#30263A', alignItems: 'center' }, trophy: { fontSize: 34 }, winner: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 3 }, waitText: { color: '#FFF', fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 6 }, browseText: { color: '#FFF', fontSize: 11, lineHeight: 16, marginBottom: 10 }, browseList: { gap: 7 }, browsePlayer: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 17, borderWidth: 1, borderColor: '#30273A', backgroundColor: '#151020', padding: 9 }, browseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, browseName: { color: '#FFF', fontSize: 13, fontWeight: '900', textDecorationLine: 'underline' }, browseChevron: { color: '#8F879D', fontSize: 16, fontWeight: '900' }, browseAvatarDot: { position: 'absolute', right: -1, bottom: -1 }, browseRankBadge: { color: '#E5F266', fontSize: 12, fontWeight: '900' }, browseMeta: { color: '#6EE8A7', fontSize: 11, fontWeight: '800', marginTop: 2 }, browseBattle: { minHeight: 34, borderRadius: 17, backgroundColor: '#E5F266', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, browseBattleText: { color: '#17130B', fontSize: 11, fontWeight: '900' }, shareButton: { minHeight: 40, borderRadius: 20, backgroundColor: '#8B5CF6', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, shareButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  arenaScroll: { flex: 1 }, arenaScrollContent: { paddingBottom: 24 },
  squareGrid: { flexDirection: 'row', gap: 6, marginTop: 6 }, squareCol: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  squareTile: { width: 56, height: 64, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#30273A', backgroundColor: '#17121D' },
  squareTileFill: { flex: 1, justifyContent: 'space-between' }, squareTileImage: { resizeMode: 'cover' },
  squareTileFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' }, squareTileFallbackLetter: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  squareBadge: { alignSelf: 'flex-start', margin: 3, minWidth: 18, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center' }, squareBadgeText: { color: '#E5F266', fontSize: 11, fontWeight: '900' },
  squareCaption: { paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,.6)' }, squareCaptionText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  squarePlus: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#8B5CF6', backgroundColor: '#1B1422' }, squarePlusIcon: { color: '#8B5CF6', fontSize: 20, fontWeight: '900', lineHeight: 22 },
  creditBadgeRow: { alignItems: 'center', marginBottom: 6 }, creditBadgeText: { color: '#E5F266', fontSize: 11, fontWeight: '900', backgroundColor: '#1B1422', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  groupStandings: { marginBottom: 6, padding: 8, borderRadius: 16, backgroundColor: '#120E17', borderWidth: 1, borderColor: '#30263A', gap: 5 }, groupStandingsTitle: { color: '#E5F266', fontSize: 11, fontWeight: '900', letterSpacing: .6, marginBottom: 2, textAlign: 'center' }, groupStandingRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#1B1422' }, groupStandingRowLead: { borderWidth: 1, borderColor: '#E5F266' }, groupStandingRank: { width: 26, textAlign: 'center', fontSize: 13, fontWeight: '900', color: '#FFF' }, groupStandingName: { flex: 1, color: '#FFF', fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' }, groupStandingScore: { color: '#E5F266', fontSize: 12, fontWeight: '900' }, groupStandingsMore: { color: '#8F879D', fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  buildingArenaBanner: { minHeight: 44, borderRadius: 16, borderWidth: 1, borderColor: '#E5F266', backgroundColor: '#22201A', paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, alignItems: 'center', justifyContent: 'center' }, buildingArenaBannerText: { color: '#E5F266', fontSize: 11, lineHeight: 15, fontWeight: '900', textAlign: 'center' },
  liveMatches: { marginBottom: 12, gap: 6 }, liveMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: '#30273A', backgroundColor: '#151020', paddingHorizontal: 12 }, liveMatchTheme: { color: '#FFF', fontSize: 12, fontWeight: '900' }, liveMatchHost: { color: '#B79CFF', fontSize: 11, fontWeight: '700', marginTop: 2 }, liveMatchWatch: { color: '#E5F266', fontSize: 11, fontWeight: '900' },
});
