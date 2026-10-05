import { resolveKeptTrackId } from '../services/keepTrackAction';
import { reportAutoDiagnostic } from '../services/problemReportService';
import ChatDockHost from './ChatDockHost';
import KeepVisibilityChoiceModal, { KeepSuccessModal } from './KeepVisibilityChoiceModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import type { CanonicalTrack } from '@keep/music';
import SwipeDeck from './SwipeDeck';
import { loadFirstDiscoveryOrigins, type TrackOrigin } from '../services/trackOriginService';
import MysteryArtwork from './MysteryArtwork';
import { isSaleStoryTrack, loadMyStoryTrackIds, notifyOwnStoryChanged, pinStoryTrack } from '../services/musicStoriesService';
import { loadMyOfferedTrackIds } from '../services/playlistSaleService';
import { formatStoryAge } from '../services/storyActivity';
import { persistOwnTrackVisibility } from '../services/keepVisibilityService';
import { isTrackPreviewActive, playTrackPreviewFromGesture, preloadTrackPreview, stopTrackPreview, stopTrackPreviewFast, toggleTrackPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { resolveTrackExternalDestination } from '../services/trackExternalLinkService';
import { checkOwnKeepLibrary } from '../services/connectedMusicLibrary';
import { recordProfileSwipeListen } from '../services/profileSwipeListenService';
import { colors } from '../theme/colors';
import { minTouchTarget } from '../theme/spacing';
import KeepModal from './KeepModal';

function shuffle<T>(input: T[]): T[] {
  const next = [...input];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

type KeepVisibilityChoice = 'PUBLIC' | 'PRIVATE';
type AlreadyKeptState = 'checking' | 'yes' | 'no';

type Props = {
  visible: boolean;
  tracks: CanonicalTrack[];
  /** When opened from a tapped rail/card, keep that exact track first instead of shuffling it away. */
  initialTrackId?: string | null;
  title?: string;
  subtitle?: string;
  sourceUsername?: string;
  sourceAvatarUrl?: string | null;
  sourceProfileId?: string;
  /** Attribution canonique par morceau : premier utilisateur qui l'a découvert via Écouter. */
  sourceByTrack?: Record<string, { profileId?: string; username?: string; avatarUrl?: string | null }>;
  emptyTitle?: string;
  /** Petit badge (ex. certification) affiché à droite du titre, sans jamais le masquer. */
  titleBadge?: React.ReactNode;
  /** Contenu proposé quand il n'y a plus de morceau (ex. story suivante) ; s'affiche sous le titre de fin. */
  endExtra?: React.ReactNode;
  /** Appelé une fois quand le dernier morceau a été vu (file terminée) : enchaînement automatique vers la story suivante. */
  onFinished?: () => void;
  /** Change quand une AUTRE file (autre story) remplace la précédente sans fermer la fenêtre : la file est préparée à nouveau. */
  resetKey?: string | null;
  /** Toucher le titre (« Story de @x ») ouvre la fiche du membre, comme sur Instagram. */
  onTitlePress?: () => void;
  /** Date d'ajout de chaque musique de la story : affiche « ajoutée il y a … · encore visible … ». */
  trackAddedAt?: Record<string, string>;
  backLabel?: string;
  /** Affiche « Ajouter à ma story » même dans un aperçu de profil (previewOnly). */
  allowStoryAdd?: boolean;
  /** Ligne sous le sous-titre (ex. compteur de vues de la story). */
  headerExtra?: React.ReactNode;
  /** Panneau plein cadre par-dessus le Swipe (ex. liste des spectateurs). */
  overlay?: React.ReactNode;
  loop?: boolean;
  askVisibilityOnKeep?: boolean;
  previewOnly?: boolean;
  // Un compte peut être requis pour finaliser l'action, mais ce verrou ne doit
  // jamais court-circuiter le choix Public/Privé : la confirmation de visibilité
  // reste toujours affichée avant toute tentative de GARDER.
  requiresAccount?: boolean;
  /** Message explicite de coût affiché avant de confirmer GARDER. */
  keepCostNotice?: string;
  /** Montant réellement débité après un GARDER réussi. Active la confirmation post-débit. */
  keepDebitAmount?: number;
  onClose: () => void;
  onKeep?: (track: CanonicalTrack, visibility: KeepVisibilityChoice) => boolean | void | Promise<boolean | void>;
  onPass?: (track: CanonicalTrack) => boolean | void | Promise<boolean | void>;
  /** Pour les flux de découverte non destructifs (ex. Loki Pulse) : affiche le
   * morceau suivant immédiatement et persiste PASSER en arrière-plan. */
  optimisticPass?: boolean;
  onOpenSourceProfile?: (username: string) => void;
};

export default function MusicSwipeDeckModal({
  visible,
  tracks,
  initialTrackId,
  title = 'Découverte musicale',
  subtitle,
  sourceUsername,
  sourceAvatarUrl,
  sourceProfileId,
  sourceByTrack,
  emptyTitle = 'Aucun morceau à découvrir.',
  titleBadge,
  endExtra,
  onFinished,
  resetKey,
  onTitlePress,
  trackAddedAt,
  backLabel,
  allowStoryAdd = false,
  headerExtra,
  overlay,
  loop = true,
  askVisibilityOnKeep = false,
  previewOnly = false,
  requiresAccount = false,
  keepCostNotice,
  keepDebitAmount,
  onClose,
  onKeep,
  onPass,
  optimisticPass = false,
  onOpenSourceProfile,
}: Props) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [deckTracks, setDeckTracks] = useState<CanonicalTrack[]>([]);
  const [processing, setProcessing] = useState(false);
  const [preparingDeck, setPreparingDeck] = useState(false);
  const [prefilterRemovedCount, setPrefilterRemovedCount] = useState(0);
  const [prefilterVerified, setPrefilterVerified] = useState(false);
  const [keepPromptOpen, setKeepPromptOpen] = useState(false);
  const [keepSuccess, setKeepSuccess] = useState<{ title: string; artist: string; visibility: KeepVisibilityChoice } | null>(null);
  const [previewInfoOpen, setPreviewInfoOpen] = useState(false);
  const [alreadyKeepInfoOpen, setAlreadyKeepInfoOpen] = useState(false);
  const [alreadyKeptState, setAlreadyKeptState] = useState<AlreadyKeptState>('checking');
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string | null>(null);
  const [previewResolving, setPreviewResolving] = useState(false);
  // BUG RÉEL (Adel, 01/09/2026 : "je les swipe pour les écouter, les
  // musiques ne partent pas") : la lecture automatique part d'un effet
  // asynchrone (résolution d'URL puis .play()), donc sur web elle perd le
  // geste utilisateur d'origine et le navigateur peut bloquer .play() --
  // l'ancien code traitait ce rejet exactement comme "aucun extrait trouvé"
  // et affichait "indisponible" sur un morceau pourtant lisible. On distingue
  // maintenant "pas d'extrait" de "extrait trouvé mais lecture auto bloquée",
  // avec un vrai bouton pour relancer via un tap direct (jamais bloqué).
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [previewEnded, setPreviewEnded] = useState(false);
  const actionInFlight = useRef(false);
  const playbackGeneration = useRef(0);
  const endAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVisible = useRef(false);
  const tracksRef = useRef(tracks);
  const preparedTracksRef = useRef<CanonicalTrack[]>(tracks);
  tracksRef.current = tracks;
  const current = deckTracks[index];
  // Adel (05/10/2026) : « à chaque fois que je swipe ça passe automatiquement à l'autre utilisateur » -- la file terminée prévient le parent une seule fois par ouverture.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const finishedRound = useRef(-1);
  useEffect(() => {
    if (!visible || preparingDeck || current || !deckTracks.length || finishedRound.current === round) return undefined;
    finishedRound.current = round;
    const timer = setTimeout(() => { onFinishedRef.current?.(); }, 450);
    return () => clearTimeout(timer);
  }, [visible, preparingDeck, current, deckTracks.length, round]);
  // ERR-FIRST-DISCOVERER-097 : « Découvert par » = toujours le PREMIER découvreur (serveur), jamais le propriétaire du profil ouvert.
  const [firstOrigins, setFirstOrigins] = useState<Record<string, TrackOrigin>>({});
  const deckTrackIdsKey = deckTracks.map((track) => track.id).join(',');
  useEffect(() => {
    let live = true;
    if (!visible || !deckTracks.length) return undefined;
    void loadFirstDiscoveryOrigins(deckTracks.map((track) => track.id)).then((origins) => { if (live) setFirstOrigins(origins); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, deckTrackIdsKey]);
  const canonicalOrigin = current ? firstOrigins[current.id] : undefined;
  const currentSource = canonicalOrigin
    ? { ...(current ? sourceByTrack?.[current.id] : undefined), profileId: canonicalOrigin.profileId, username: canonicalOrigin.username }
    : (current ? sourceByTrack?.[current.id] : undefined);
  const currentSourceUsername = currentSource?.username || sourceUsername;
  const currentSourceProfileId = currentSource?.profileId || sourceProfileId;
  const resolvedBackLabel = backLabel || (loop ? 'REVENIR AU PROFIL' : 'REVENIR À LA SESSION');
  const currentAlreadyKept = !previewOnly && alreadyKeptState === 'yes';
  const fullTrackDestination = current ? resolveTrackExternalDestination(current) : null;
  // Adel (05/10/2026) : « déloyal » -- l'écoute complète d'une musique d'un autre membre n'est offerte qu'après l'avoir gardée (FREE payés) ; sinon on écouterait tout gratuitement puis on la prendrait avec l'écoute.
  const fullListenLocked = !previewOnly && (askVisibilityOnKeep || Boolean(currentSourceUsername)) && !currentAlreadyKept;
  // Adel (05/10/2026) : bouton « Ajouter à ma story » pendant un swipe (mon profil ou celui d'un autre membre). Il faut avoir gardé le morceau en Public (vérifié aussi côté serveur).
  // Anti-doublon : on connaît les musiques déjà dans MA story ; celle-ci est alors grisée « déjà dans ta story ».
  const [storyIds, setStoryIds] = useState<Set<string>>(new Set());
  const [storyIdsReady, setStoryIdsReady] = useState(false);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    if (!visible) return undefined;
    setStoryIdsReady(false);
    // Adel (05/10/2026) : le bouton « Patiente… » tant que la vérification n'est pas finie (sinon « déjà en story » apparaissait une minute après l'ajout).
    void loadMyStoryTrackIds().then((ids) => { if (live) { setStoryIds(ids); setStoryIdsReady(true); } }).catch(() => { if (live) setStoryIdsReady(true); });
    // Musiques en vente : le système les masque seul dans la story ; on prévient l'utilisateur au lieu d'un ajout silencieux.
    void loadMyOfferedTrackIds().then((map) => { if (live) setOfferedIds(new Set(Object.keys(map))); }).catch(() => {});
    setJustAdded(new Set());
    return () => { live = false; };
  }, [visible]);
  const storyAddContext = Boolean(current) && !isSaleStoryTrack(current) && (allowStoryAdd || (!previewOnly && Boolean(askVisibilityOnKeep || currentSourceUsername)));
  const currentOffered = Boolean(current && offeredIds.has(current.id));
  const canAddToStory = storyAddContext;
  const justAddedNow = Boolean(current && justAdded.has(current.id));
  // Aperçu propriétaire = exactement ce que voient les abonnés : une musique de MA boutique y est masquée (animation « pochette mystère »), jamais en clair.
  const ownerMasked = Boolean(previewOnly && currentOffered && current && !isSaleStoryTrack(current));
  const alreadyInStory = Boolean(current && storyIds.has(current.id));
  // Gardé en Privé puis « mettre en story » : on le rend public (le serveur l'exige) puis on l'épingle.
  const makeKeptPublicAndStory = async () => {
    const track = current;
    if (!track) return;
    try {
      await persistOwnTrackVisibility(track, 'PUBLIC');
      await pinStoryTrack(resolveKeptTrackId(track.id));
      setStoryIds((previous) => new Set(previous).add(track.id));
      setJustAdded((previous) => new Set(previous).add(track.id));
      setKeepSuccess((previous) => (previous ? { ...previous, visibility: 'PUBLIC' } : previous));
    } catch {
      Alert.alert('Ajout impossible', 'La musique n’a pas pu être rendue publique pour le moment. Réessaie dans un instant.', [{ text: 'OK', style: 'cancel' }]);
    }
  };
  const addCurrentToStory = async () => {
    if (!current) return;
    if (alreadyInStory && justAddedNow) return;
    if (alreadyInStory) {
      Alert.alert('Elle y était déjà', `« ${current.title} » a été ajoutée à ta story plus tôt : elle y reste visible 24 h après son ajout. Pas de doublon.`, [{ text: 'OK', style: 'cancel' }]);
      return;
    }
    if (!previewOnly && !currentAlreadyKept) {
      // Adel (05/10/2026) : « il a appuyé sur partager en story et rien ne s'est passé » -- au lieu d'un refus, UN seul geste :
      // garder en Public (coût FREE annoncé) puis mettre en story ; le créateur d'origine reste identifié.
      const toKeep = current;
      Alert.alert(
        'Garder en public et mettre en story ?',
        `« ${toKeep.title} » sera gardée en Public sur ton profil${keepDebitAmount ? ` (${keepDebitAmount} FREE débité${keepDebitAmount > 1 ? 's' : ''})` : ''} puis ajoutée à ta story pendant 24 h. Son créateur reste identifié.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Oui, garder et partager', onPress: () => { void confirmKeep('PUBLIC'); } },
        ],
      );
      return;
    }
    // Adel (05/10/2026) : « êtes-vous sûr de la mettre en story ? » -- un seul tap ne publie jamais sans confirmation.
    const track = current;
    Alert.alert(
      'Mettre en story ?',
      `« ${track.title} » sera visible pendant 24 heures dans ta story : tes abonnés pourront l’écouter.${currentOffered ? ' Elle est en vente : jaquette et nom de l’artiste restent masqués.' : ''}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Oui, mettre en story', onPress: () => { void pinCurrentToStory(track); } },
      ],
    );
  };
  const pinCurrentToStory = async (current: CanonicalTrack) => {
    try {
      await pinStoryTrack(resolveKeptTrackId(current.id));
      setStoryIds((previous) => new Set(previous).add(current.id));
      // Confirmation affichée DANS la fenêtre (une alerte native peut ne pas s'afficher au-dessus d'une fenêtre déjà ouverte).
      setJustAdded((previous) => new Set(previous).add(current.id));
    } catch (error: any) {
      reportAutoDiagnostic('STORY_PIN_FAILED', error);
      // Gardée en Privé : le serveur exige un GARDER public -> on la rend publique (gratuit) puis on l'épingle.
      if (String(error?.message ?? error).includes('STORY_PIN_REQUIRES_PUBLIC_KEEP')) { void makeKeptPublicAndStory(); return; }
      Alert.alert('Ajout impossible', 'Seules les musiques gardées en Public peuvent aller en story. Si tu l’as gardée en Privé, repasse-la en Public depuis ton profil.', [{ text: 'OK', style: 'cancel' }]);
    }
  };
  // Bouton « story » : allumé tant qu'on peut ajouter, vert + message de félicitations juste après, gris « déjà » seulement ensuite.
  const renderStoryAdd = (kind: 'main' | 'popup') => {
    if (!canAddToStory) return null;
    const popup = kind === 'popup';
    const buttonStyle = popup ? s.ownerStoryButton : s.addStoryButton;
    const textStyle = popup ? s.ownerStoryButtonText : s.addStoryText;
    const checking = !storyIdsReady && !justAddedNow;
    const label = checking ? '⏳ PATIENTE… VÉRIFICATION DE TA STORY' : justAddedNow ? '✓ EN STORY · 24 H' : alreadyInStory ? '✓ DÉJÀ EN STORY (AJOUTÉE PLUS TÔT)' : (currentOffered ? '＋ METTRE EN STORY (MASQUÉE)' : popup ? '＋ METTRE EN STORY' : '＋ AJOUTER À MA STORY');
    return <View>
      <TouchableOpacity disabled={checking} style={[buttonStyle, checking ? s.addStoryButtonDone : justAddedNow ? s.addStoryButtonJust : alreadyInStory ? s.addStoryButtonDone : s.addStoryButtonLit]} onPress={() => { void addCurrentToStory(); }} accessibilityRole="button" accessibilityLabel={checking ? 'Vérification de ta story en cours' : alreadyInStory ? 'Déjà dans ma story' : 'Ajouter ce morceau à ma story'} testID={popup ? 'deck-info-add-story' : 'deck-add-story'}>
        <Text style={[textStyle, (alreadyInStory || checking) && !justAddedNow && s.addStoryTextDone, justAddedNow && s.addStoryTextJust]}>{label}</Text>
      </TouchableOpacity>
      {currentOffered && !justAddedNow ? <Text style={s.storySaleNote2} testID="deck-story-sale-note">{alreadyInStory ? '🏷 En vente : elle est déjà dans ta story, jaquette et artiste masqués.' : '🏷 Cette musique est en vente : dans ta story, la jaquette et le nom de l’artiste restent masqués.'}</Text> : null}
      {justAddedNow ? <Text style={s.storyCongrats} testID="deck-story-congrats">🎉 Tu viens de l’ajouter à ta story : elle sera visible pendant 24 heures. Ta photo s’allume sur ton profil.</Text> : null}
    </View>;
  };
  const openFullTrack = useCallback(() => {
    if (!fullTrackDestination) return;
    void stopTrackPreview();
    void Linking.openURL(fullTrackDestination.url).catch(() => {
      Alert.alert('Lecture', 'Impossible d’ouvrir cette destination pour le moment.');
    });
  }, [fullTrackDestination?.url]);
  // Le Swipe social boucle par défaut et demande Public/Privé. Tous les
  // morceaux publics restent écoutables, même déjà présents chez le visiteur.
  const socialDiscoveryMode = !previewOnly && askVisibilityOnKeep && loop;

  const lastResetKey = useRef<string | null>(resetKey ?? null);
  const advanceIndex = useCallback(() => {
    setIndex((currentIndex) => {
      if (currentIndex + 1 >= deckTracks.length) {
        // Découverte sociale = un seul passage des nouveautés. Une fois la file
        // terminée, on ne rejoue jamais les mêmes extraits dans la même visite.
        if (socialDiscoveryMode) return deckTracks.length;
        if (loop) {
          const nextRound = shuffle(preparedTracksRef.current);
          setDeckTracks(nextRound);
          setRound((value) => value + 1);
          return nextRound.length ? 0 : nextRound.length;
        }
        return deckTracks.length;
      }
      return currentIndex + 1;
    });
  }, [deckTracks.length, loop, socialDiscoveryMode]);

  useEffect(() => {
    let alive = true;
    if (!visible) {
      wasVisible.current = false;
      setPreparingDeck(false);
      return () => { alive = false; };
    }
    if (resetKey !== lastResetKey.current) { lastResetKey.current = resetKey ?? null; wasVisible.current = false; }
    if (wasVisible.current) return () => { alive = false; };
    wasVisible.current = true;
    setPreparingDeck(true);
    actionInFlight.current = false;
    setKeepPromptOpen(false);
    setKeepSuccess(null);
    setPreviewInfoOpen(false);
    setAlreadyKeepInfoOpen(false);
    setIndex(0);
    setPrefilterRemovedCount(0);
    setPrefilterVerified(false);

    const prepare = async () => {
      const inputTracks = [...tracksRef.current];

      // Règle produit 24/09/2026 : un morceau déjà présent chez l'auditeur
      // reste écoutable. On ne retire donc PLUS rien de la file sociale.
      // La détection anti-doublon reste faite morceau par morceau via
      // checkOwnKeepLibrary() : le CTA devient "DÉJÀ" mais l'audio continue.
      const requestedTrackId = String(initialTrackId || '').trim();
      const requestedTrack = requestedTrackId
        ? inputTracks.find((track) => track.id === requestedTrackId)
        : undefined;
      const remainingTracks = requestedTrack
        ? inputTracks.filter((track) => track.id !== requestedTrack.id)
        : inputTracks;
      const prepared = requestedTrack
        ? [requestedTrack, ...(loop ? shuffle(remainingTracks) : remainingTracks)]
        : (loop ? shuffle(inputTracks) : inputTracks);

      preparedTracksRef.current = prepared;
      setPrefilterRemovedCount(0);
      setPrefilterVerified(false);
      setDeckTracks(prepared);
      setRound((value) => value + 1);
      setPreparingDeck(false);
    };

    void prepare();
    return () => { alive = false; };
  }, [visible, loop, socialDiscoveryMode, initialTrackId, resetKey]);

  useEffect(() => {
    let alive = true;
    setAlreadyKeepInfoOpen(false);
    if (!visible || !current || previewOnly) {
      setAlreadyKeptState(previewOnly ? 'yes' : 'no');
      return () => { alive = false; };
    }

    setAlreadyKeptState('checking');
    void checkOwnKeepLibrary(current)
      .then((result) => {
        if (!alive) return;
        setAlreadyKeptState(result?.exists ? 'yes' : 'no');
      })
      .catch(() => {
        if (alive) setAlreadyKeptState('no');
      });

    return () => { alive = false; };
  }, [visible, previewOnly, current?.id, current?.isrc, current?.title, current?.artist]);

  useEffect(() => {
    let alive = true;
    const generation = ++playbackGeneration.current;
    const playbackKey = current ? `swipe-${current.id}-${index}` : null;
    setKeepPromptOpen(false);
    setPreviewInfoOpen(false);
    setAutoplayBlocked(false);
    setPreviewEnded(false);
    setResolvedPreviewUrl(current?.previewUrl?.trim() || null);

    if (!visible || preparingDeck || !current) {
      setPreviewResolving(false);
      void stopTrackPreview();
      return () => { alive = false; };
    }

    setPreviewResolving(!current.previewUrl?.trim());
    void resolveTrackPreviewUrl(current)
      .then(async (previewUrl) => {
        if (!alive) return;
        setPreviewResolving(false);
        setResolvedPreviewUrl(previewUrl);

        // IMPORTANT TestFlight : ne jamais précharger N+1 AVANT de lancer N.
        // Le lecteur natif sérialise ses opérations ; un preload réseau/décodage
        // placé ici pouvait monopoliser la file et donner l'impression qu'il
        // fallait toucher le petit bouton vert pour entendre la carte courante.
        // On démarre d'abord le morceau visible, puis seulement ensuite N+1.
        const nextTrack = deckTracks[index + 1];
        const nextPreviewPromise: Promise<string | null> = nextTrack
          ? resolveTrackPreviewUrl(nextTrack).catch(() => null)
          : Promise.resolve(null);

        stopTrackPreviewFast();
        if (!alive || playbackGeneration.current !== generation || !previewUrl || !playbackKey) return;
        try {
          // Un double passage d'effet (StrictMode/re-render) ne doit jamais
          // transformer l'autoplay en "toggle off" sur la carte courante.
          if (isTrackPreviewActive(playbackKey)) return;
          await toggleTrackPreview(
            playbackKey,
            previewUrl,
            (playing) => {
              if (playing && currentSourceProfileId) {
                void recordProfileSwipeListen(currentSourceProfileId, current.id);
              }
            },
            () => {
              if (!alive || playbackGeneration.current !== generation || actionInFlight.current) return;
              setPreviewEnded(true);
              // Loki Pulse / Swipe : l'écoute est un flux automatique.
              // La fin de l'extrait doit toujours amener le morceau suivant
              // quand la file boucle. PASSER/GARDER restent disponibles pendant
              // l'extrait, mais aucun tap sur le bouton vert n'est requis.
              // Tous les écrans Swipe / aperçu forment une file audio :
              // avancer automatiquement tant qu'il reste une carte. "loop"
              // décide seulement si l'on recommence une nouvelle boucle après
              // la dernière carte, pas si N doit avancer vers N+1.
              if (index + 1 < deckTracks.length || loop) advanceIndex();
            },
          );
          // Le morceau visible est maintenant réellement parti : on peut
          // préparer le suivant sans retarder l'autoplay courant.
          if (nextTrack) {
            void nextPreviewPromise
              .then((nextUrl) => nextUrl ? preloadTrackPreview(nextUrl) : undefined)
              .catch(() => {});
          }
        } catch {
          // Une URL de preview persistée peut expirer côté catalogue. Avant de
          // conclure à un blocage autoplay, on force UNE résolution fraîche et
          // on rejoue la même carte. Cela évite le Swipe silencieux après
          // plusieurs jours sans avoir à recharger toute l'application.
          try {
            const refreshedUrl = await resolveTrackPreviewUrl(current, { forceRefresh: true });
            if (!alive || playbackGeneration.current !== generation || !refreshedUrl || !playbackKey) {
              if (alive) setAutoplayBlocked(true);
              return;
            }
            setResolvedPreviewUrl(refreshedUrl);
            stopTrackPreviewFast();
            await toggleTrackPreview(
              playbackKey,
              refreshedUrl,
              (playing) => {
                if (playing && currentSourceProfileId) {
                  void recordProfileSwipeListen(currentSourceProfileId, current.id);
                }
              },
              () => {
                if (!alive || playbackGeneration.current !== generation || actionInFlight.current) return;
                setPreviewEnded(true);
                if (index + 1 < deckTracks.length || loop) advanceIndex();
              },
            );
            if (nextTrack) {
              void nextPreviewPromise
              .then((nextUrl) => nextUrl ? preloadTrackPreview(nextUrl) : undefined)
                .catch(() => {});
            }
            if (alive) setAutoplayBlocked(false);
          } catch {
            if (!alive) return;
            if (Platform.OS !== 'web') {
              // TestFlight/iOS : aucun geste utilisateur n'est requis pour
              // jouer un son dans l'app native. Une erreur ici est transitoire
              // (session audio, décodage, URL catalogue). On retente plusieurs
              // fois automatiquement au lieu d'afficher un bouton ÉCOUTER.
              let recovered = false;
              for (let retry = 0; retry < 3 && alive && !recovered; retry += 1) {
                await new Promise((resolve) => setTimeout(resolve, 180 + retry * 180));
                if (!alive || playbackGeneration.current !== generation) return;
                try {
                  if (isTrackPreviewActive(playbackKey)) { recovered = true; break; }
                  const retryUrl = await resolveTrackPreviewUrl(current, { forceRefresh: true });
                  if (!retryUrl) continue;
                  setResolvedPreviewUrl(retryUrl);
                  await stopTrackPreview();
                  await toggleTrackPreview(
                    playbackKey,
                    retryUrl,
                    (playing) => {
                      if (playing && currentSourceProfileId) {
                        void recordProfileSwipeListen(currentSourceProfileId, current.id);
                      }
                    },
                    () => {
                      if (!alive || playbackGeneration.current !== generation || actionInFlight.current) return;
                      setPreviewEnded(true);
                      if (index + 1 < deckTracks.length || loop) advanceIndex();
                    },
                  );
                  recovered = true;
                } catch {}
              }
              if (recovered) {
                setAutoplayBlocked(false);
                setPreviewEnded(false);
                return;
              }
              // Journal automatique (Adel 05/10/2026 : « la musique ne part pas ») : on garde le code d'échec et l'hôte de l'extrait, jamais l'URL.
              reportAutoDiagnostic('PREVIEW_PLAY_FAILED', `${isSaleStoryTrack(current) ? 'sale' : 'track'} host=${String(current?.previewUrl ?? '').replace(/^https?:\/\//, '').split('/')[0] || 'none'}`);
              // Dans un flux automatique, un extrait réellement illisible ne
              // doit jamais bloquer l'utilisateur sur une carte silencieuse.
              setAutoplayBlocked(false);
              if ((index + 1 < deckTracks.length || loop) && !actionInFlight.current) {
                endAdvanceTimer.current = setTimeout(() => {
                  endAdvanceTimer.current = null;
                  if (alive && !actionInFlight.current) advanceIndex();
                }, 220);
              } else {
                setResolvedPreviewUrl(null);
              }
              return;
            }
            // Web uniquement : Safari/Chrome peuvent imposer un geste.
            if (alive) setAutoplayBlocked(true);
          }
        }
      })
      .catch(() => {
        if (!alive) return;
        setPreviewResolving(false);
        setResolvedPreviewUrl(null);
      });

    return () => {
      alive = false;
      if (endAdvanceTimer.current) {
        clearTimeout(endAdvanceTimer.current);
        endAdvanceTimer.current = null;
      }
      if (playbackGeneration.current === generation) playbackGeneration.current += 1;
      // Ne coupe l'audio que lorsqu'on quitte réellement cette carte / ce modal.
      // Un simple changement de callback ou de métadonnée ne doit jamais
      // interrompre l'écoute d'un autre compte en plein extrait.
      if (playbackKey && (!visible || current?.id !== deckTracks[index]?.id)) void stopTrackPreview(playbackKey);
    };
  }, [visible, preparingDeck, current?.id, current?.previewUrl, index]);

  const manualPlay = async () => {
    if (!current || !resolvedPreviewUrl) return;
    try {
      await playTrackPreviewFromGesture(
        `swipe-${current.id}-${index}`,
        resolvedPreviewUrl,
        (playing) => {
          if (playing && currentSourceProfileId) {
            void recordProfileSwipeListen(currentSourceProfileId, current.id);
          }
        },
        () => {
          setPreviewEnded(true);
          if (socialDiscoveryMode) {
            if (endAdvanceTimer.current) clearTimeout(endAdvanceTimer.current);
            endAdvanceTimer.current = setTimeout(() => {
              endAdvanceTimer.current = null;
              if (!actionInFlight.current) advanceIndex();
            }, 120);
          } else if (!actionInFlight.current && (index + 1 < deckTracks.length || loop)) {
            advanceIndex();
          }
        },
      );
      setAutoplayBlocked(false);
      setPreviewEnded(false);
    } catch {
      // Le tap manuel est notre dernier filet de sécurité : si l'URL mémorisée
      // a expiré, on la remplace immédiatement par une URL catalogue fraîche
      // et on rejoue sans demander un deuxième tap.
      try {
        const refreshedUrl = await resolveTrackPreviewUrl(current, { forceRefresh: true });
        if (!refreshedUrl) throw new Error('NO_REFRESHED_PREVIEW');
        setResolvedPreviewUrl(refreshedUrl);
        await stopTrackPreview();
        await toggleTrackPreview(
          `swipe-${current.id}-${index}`,
          refreshedUrl,
          (playing) => {
            if (playing && currentSourceProfileId) {
              void recordProfileSwipeListen(currentSourceProfileId, current.id);
            }
          },
          () => {
            setPreviewEnded(true);
            if (!actionInFlight.current && (index + 1 < deckTracks.length || loop)) {
              if (endAdvanceTimer.current) clearTimeout(endAdvanceTimer.current);
              endAdvanceTimer.current = setTimeout(() => {
                endAdvanceTimer.current = null;
                if (!actionInFlight.current) advanceIndex();
              }, 120);
            }
          },
        );
        setAutoplayBlocked(false);
        setPreviewEnded(false);
      } catch {
        setAutoplayBlocked(true);
      }
    }
  };

  const advance = async () => {
    if (endAdvanceTimer.current) {
      clearTimeout(endAdvanceTimer.current);
      endAdvanceTimer.current = null;
    }
    playbackGeneration.current += 1;
    // Réponse instantanée Mobile/Web : la carte change sans attendre le
    // stop/unload natif. L'ancien extrait est coupé immédiatement et son
    // nettoyage continue en arrière-plan.
    stopTrackPreviewFast();
    advanceIndex();
  };

  const confirmKeep = async (visibility: KeepVisibilityChoice) => {
    if (!current || processing) return;
    const keptTrack = current;
    setKeepPromptOpen(false);
    setProcessing(true);
    actionInFlight.current = true;
    try {
      const result = await onKeep?.(keptTrack, visibility);
      if (result === false && !isSaleStoryTrack(keptTrack)) reportAutoDiagnostic('KEEP_NOT_CONFIRMED', visibility);
      if (result !== false) {
        // GARDER en Public = nouvelle musique dans ma story : le cercle de ma photo doit s'allumer tout de suite.
        if (visibility === 'PUBLIC') {
          notifyOwnStoryChanged();
          // Adel (05/10/2026) : « il a gardé en public mais son cercle ne s'est pas allumé » -- un morceau DÉJÀ gardé auparavant garde son
          // ancienne date et n'entrait donc jamais en story. On l'épingle aussi (date = maintenant) ; sans effet si déjà en story.
          if (!isSaleStoryTrack(keptTrack)) void pinStoryTrack(resolveKeptTrackId(keptTrack.id)).catch(() => {}).finally(() => notifyOwnStoryChanged());
        }
        if (keepDebitAmount != null && keepDebitAmount > 0) {
          setKeepSuccess({ title: keptTrack.title, artist: keptTrack.artist, visibility });
          return;
        }
        await advance();
      }
    } finally {
      actionInFlight.current = false;
      setProcessing(false);
    }
  };

  const continueAfterKeepSuccess = async () => {
    if (!keepSuccess) return;
    setKeepSuccess(null);
    actionInFlight.current = true;
    try { await advance(); }
    finally { actionInFlight.current = false; }
  };

  const showAlreadyKept = () => {
    actionInFlight.current = true;
    setKeepPromptOpen(false);
    setAlreadyKeepInfoOpen(true);
  };

  const requestKeep = async () => {
    if (!current || processing) return;
    if (previewOnly) {
      actionInFlight.current = true;
      setPreviewInfoOpen(true);
      return;
    }

    if (currentAlreadyKept) {
      showAlreadyKept();
      return;
    }

    // Si l'utilisateur touche GARDER avant la fin du contrôle asynchrone,
    // on refait une vérification synchrone du scénario critique. Un doublon ne
    // peut donc jamais atteindre le choix Public/Privé ni onKeep().
    if (alreadyKeptState === 'checking' && !requiresAccount) {
      setProcessing(true);
      actionInFlight.current = true;
      try {
        const result = await checkOwnKeepLibrary(current).catch(() => null);
        if (result?.exists) {
          setAlreadyKeptState('yes');
          setProcessing(false);
          showAlreadyKept();
          return;
        }
        setAlreadyKeptState('no');
      } finally {
        setProcessing(false);
        actionInFlight.current = false;
      }
    }

    // Règle produit 24/09/2026 : aucune décision de visibilité implicite.
    // Même en démo/invité, on demande d'abord Public ou Privé. Si un compte
    // réel est ensuite nécessaire, le parent ouvre le parcours compte APRÈS
    // ce choix, sans avoir sauvegardé quoi que ce soit.
    if (askVisibilityOnKeep) {
      actionInFlight.current = true;
      setKeepPromptOpen(true);
      return;
    }

    if (requiresAccount) {
      actionInFlight.current = true;
      setProcessing(true);
      try { await onKeep?.(current, 'PRIVATE'); }
      finally { actionInFlight.current = false; setProcessing(false); }
      return;
    }

    void confirmKeep('PRIVATE');
  };

  const cancelKeep = () => {
    setKeepPromptOpen(false);
    actionInFlight.current = false;
  };

  const closePreviewInfo = () => {
    setPreviewInfoOpen(false);
    actionInFlight.current = false;
  };

  const closeAlreadyKeepInfo = () => {
    setAlreadyKeepInfoOpen(false);
    actionInFlight.current = false;
  };

  const continueAfterAlreadyKept = async () => {
    setAlreadyKeepInfoOpen(false);
    actionInFlight.current = true;
    try { await advance(); }
    finally { actionInFlight.current = false; }
  };

  const pass = async () => {
    if (!current || processing || actionInFlight.current) return;
    const passedTrack = current;
    setKeepPromptOpen(false);
    setPreviewInfoOpen(false);
    setAlreadyKeepInfoOpen(false);

    // Loki Pulse : PASSER ne supprime pas une donnée critique. Sur mobile,
    // attendre le réseau avant de changer de carte donnait l'impression que
    // le bouton ne répondait pas. On coupe l'ancien son et avance d'abord,
    // puis on persiste le masquage en arrière-plan.
    if (optimisticPass) {
      actionInFlight.current = true;
      setProcessing(true);
      try {
        await advance();
        void Promise.resolve(onPass?.(passedTrack)).catch(() => {});
      } finally {
        actionInFlight.current = false;
        setProcessing(false);
      }
      return;
    }

    actionInFlight.current = true;
    setProcessing(true);
    try {
      const result = await onPass?.(passedTrack);
      if (result !== false) await advance();
    } finally {
      actionInFlight.current = false;
      setProcessing(false);
    }
  };

  const close = async () => {
    setKeepPromptOpen(false);
    setPreviewInfoOpen(false);
    setAlreadyKeepInfoOpen(false);
    actionInFlight.current = true;
    try {
      await stopTrackPreview();
      onClose();
    } finally {
      actionInFlight.current = false;
    }
  };

  const previewLabel = previewResolving
    ? 'Recherche de l’extrait…'
    : !resolvedPreviewUrl
      ? 'Extrait indisponible'
      : autoplayBlocked
        ? 'Appuie ci-dessous pour écouter'
        : previewEnded
          ? 'Extrait terminé · tu peux réécouter'
          : 'Lecture automatique';

  // Petits écrans (hauteur < 640) : on compacte pour que RIEN ne se recouvre (une seule ligne de slogan, carte plus basse).
  const { height: windowHeight } = useWindowDimensions();
  const compactDeck = windowHeight < 640;
  const swipeHint = previewOnly
    ? '↑ morceau suivant · ← passer · → garder'
    : currentAlreadyKept
      ? '↑ morceau suivant · ← passer · déjà dans ta collection'
      : askVisibilityOnKeep
        ? '↑ morceau suivant · ← passer · → garder (profil ou privé)'
        : '↑ morceau suivant · ← passer · → ajouter à ta collection';

  const controlsLocked = processing || preparingDeck || keepPromptOpen || !!keepSuccess || previewInfoOpen || alreadyKeepInfoOpen;
  const storyAgeLine = current && trackAddedAt ? formatStoryAge(trackAddedAt[current.id]) : null;
  const resolvedSubtitle = prefilterRemovedCount > 0
    ? `${subtitle ? `${subtitle} · ` : ''}${prefilterRemovedCount} déjà dans ta collection ignoré${prefilterRemovedCount > 1 ? 's' : ''}.`
    : subtitle;
  const resolvedEmptyTitle = socialDiscoveryMode && prefilterVerified && prefilterRemovedCount > 0
    ? prefilterRemovedCount >= tracksRef.current.length
      ? 'Tu as déjà tous les morceaux publics de ce profil dans ta collection.'
      : 'Tu as terminé toutes les nouvelles musiques de ce profil.'
    : emptyTitle;

  return <KeepModal visible={visible} animationType="slide" onRequestClose={() => { void close(); }} presentationStyle="fullScreen">
    <View style={s.outer}>
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.eyebrow}>Loki Music SWIPE</Text>
          <View style={s.titleRow}>{onTitlePress ? <TouchableOpacity onPress={onTitlePress} accessibilityRole="button" accessibilityLabel={`Voir la fiche : ${title}`} testID="deck-title-profile" style={{ flexShrink: 1 }}><Text style={[s.title,{flexShrink:1}]} numberOfLines={1}>{title} ›</Text></TouchableOpacity> : <Text style={[s.title,{flexShrink:1}]} numberOfLines={1}>{title}</Text>}{titleBadge ? <View style={s.titleBadge}>{titleBadge}</View> : null}</View>
          {resolvedSubtitle ? <Text style={s.subtitle}>{resolvedSubtitle}</Text> : null}
          {storyAgeLine ? <Text style={s.storyAge} testID="deck-story-age">⏱ {storyAgeLine}</Text> : null}
          {headerExtra ? <View style={compactDeck ? s.headerExtraCompact : null}>{headerExtra}</View> : null}
        </View>
        <TouchableOpacity style={s.close} onPress={() => { void close(); }} accessibilityLabel="Fermer le swipe"><Text style={s.closeText}>✕</Text></TouchableOpacity>
      </View>

      <View style={s.body}>
        {preparingDeck ? <View style={s.empty}><ActivityIndicator color={colors.primaryLight} size="large" /><Text style={s.emptyTitle}>Préparation des nouvelles musiques…</Text><Text style={s.preparingHint}>Loki Music prépare les extraits de ce profil.</Text></View> : !current ? <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.emptyTitle}>{resolvedEmptyTitle}</Text>{endExtra}<TouchableOpacity style={s.backButton} onPress={() => { void close(); }}><Text style={s.backText}>{resolvedBackLabel}</Text></TouchableOpacity></View> : <>
          <View style={s.deckArea}>
            <SwipeDeck
              resetKey={`${current.id}-${index}`}
              enabled={!controlsLocked}
              onSwipeLeft={() => { void pass(); }}
              onSwipeRight={() => { void requestKeep(); }}
              onSwipeUp={() => {
                if (controlsLocked || actionInFlight.current) return;
                actionInFlight.current = true;
                void advance().finally(() => { actionInFlight.current = false; });
              }}
              leftLabel="PASSER"
              rightLabel={currentAlreadyKept ? 'DÉJÀ' : 'GARDER'}
              upLabel="SUIVANT"
              hint={swipeHint}
              fill
            >
              <View style={[s.card, compactDeck && s.cardCompact]}>
                {ownerMasked ? <View style={[s.cover,s.coverFallback]}><MysteryArtwork caption="Titre masqué · aperçu de tes abonnés" /></View> : current.artworkUrl ? <Image source={{ uri: current.artworkUrl }} style={s.cover as any} resizeMode="cover" /> : <View style={[s.cover,s.coverFallback]}>{isSaleStoryTrack(current) ? <MysteryArtwork caption="Titre masqué · garde pour révéler" /> : <Text style={s.coverK}>K</Text>}</View>}
                {currentSourceUsername ? <TouchableOpacity style={s.sourceOverlay} onPress={() => onOpenSourceProfile?.(currentSourceUsername.replace(/^@/, ''))} disabled={!onOpenSourceProfile} accessibilityLabel={`Découvert par ${currentSourceUsername.replace(/^@/, '')}. Ouvrir son profil`}><Text style={s.sourceOverlayText}>Découvert par @{currentSourceUsername.replace(/^@/, '')}</Text></TouchableOpacity> : null}
                <View style={[s.gradientFake, compactDeck && s.gradientCompact]}>
                  <View style={s.autoRow}><View style={[s.dot,resolvedPreviewUrl ? s.dotOn : s.dotOff]} /><Text style={s.autoText}>{previewLabel}</Text></View>
                  {Platform.OS === 'web' && (autoplayBlocked || previewEnded) && resolvedPreviewUrl ? (
                    <TouchableOpacity style={s.manualPlayButton} onPress={() => { unlockWebAudioForGesture(); setPreviewEnded(false); void manualPlay(); }} accessibilityLabel={previewEnded ? "Réécouter l’extrait" : "Lancer l’extrait"}>
                      <Text style={s.manualPlayText}>{previewEnded ? '↻ RÉÉCOUTER' : '▶ ÉCOUTER L’EXTRAIT'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <Text style={s.trackTitle} numberOfLines={2}>{ownerMasked ? 'Musique en vente' : current.title}</Text>
                  <Text style={s.artist} numberOfLines={1}>{ownerMasked ? 'Ta boutique' : current.artist}</Text>
                  {current.album && !ownerMasked ? <Text style={s.album} numberOfLines={1}>{current.album}</Text> : null}
                </View>
              </View>
            </SwipeDeck>
          </View>


          {currentSourceUsername && onOpenSourceProfile ? <TouchableOpacity style={s.sourceProfileButton} onPress={() => onOpenSourceProfile(currentSourceUsername.replace(/^@/, ''))} accessibilityLabel={`Voir le profil du premier découvreur ${currentSourceUsername.replace(/^@/, '')}`}><Text style={s.sourceProfileButtonText}>◎ DÉCOUVERT PAR @{currentSourceUsername.replace(/^@/, '')} · VOIR / SUIVRE</Text></TouchableOpacity> : null}
          {renderStoryAdd('main')}
          {fullTrackDestination && fullListenLocked ? <Text style={s.fullTrackLocked} accessibilityLabel="Écoute complète disponible après GARDER">🔒 Écoute complète disponible après GARDER</Text> : null}
          {fullTrackDestination && !fullListenLocked ? <TouchableOpacity style={s.fullTrackButton} onPress={openFullTrack} accessibilityLabel={fullTrackDestination.label}><Text style={s.fullTrackButtonText}>↗ {fullTrackDestination.label}</Text></TouchableOpacity> : null}
                    <View style={s.decisionBand}>
            <View style={s.decisionRow}>
              <TouchableOpacity style={[s.decisionButton, s.passButton]} onPress={() => { void pass(); }} disabled={controlsLocked} accessibilityLabel="Passer cette musique">
                <Text style={s.passButtonText}>PASSER</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.decisionButton, s.backDecisionButton]} onPress={() => { void close(); }} disabled={controlsLocked} accessibilityLabel="Arrêter l’écoute et revenir">
                <Text style={s.backDecisionText}>ARRÊTER</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.decisionButton, s.keepButton, currentAlreadyKept && s.keepButtonAlready]}
                onPress={() => { void requestKeep(); }}
                disabled={controlsLocked}
                accessibilityLabel={currentAlreadyKept ? 'Déjà dans ta collection' : 'Garder cette musique'}
              >
                {processing ? <ActivityIndicator color={currentAlreadyKept ? '#B9B0C3' : colors.black} size="small" /> : <Text style={[s.keepButtonText, currentAlreadyKept && s.keepButtonTextAlready]}>{currentAlreadyKept ? '✓ DÉJÀ' : '♡ GARDER'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </>}
      </View>

      {!previewOnly ? (
        <KeepVisibilityChoiceModal
          visible={keepPromptOpen}
          title="Garder ce morceau"
          trackLabel={current ? `${current.title} · ${current.artist}` : null}
          costFree={keepDebitAmount}
          busy={processing}
          onPublic={() => { void confirmKeep('PUBLIC'); }}
          onPrivate={() => { void confirmKeep('PRIVATE'); }}
          onCancel={cancelKeep}
        />
      ) : null}

      {!previewOnly ? (
        <KeepSuccessModal
          visible={!!keepSuccess}
          trackLabel={keepSuccess ? `${keepSuccess.title} · ${keepSuccess.artist}` : null}
          costFree={keepDebitAmount}
          visibility={keepSuccess?.visibility}
          onMakePublicStory={() => { void makeKeptPublicAndStory(); }}
          continueLabel="CONTINUER"
          onContinue={continueAfterKeepSuccess}
        />
      ) : null}

      {!previewOnly ? <KeepModal visible={alreadyKeepInfoOpen} transparent animationType="fade" onRequestClose={closeAlreadyKeepInfo}>
        <View style={s.keepOverlay}>
          <View style={s.ownerPreviewCard}>
            <Text style={s.alreadyKeepEyebrow}>DOUBLON BLOQUÉ</Text>
            <Text style={s.ownerPreviewTitle}>Déjà dans ta collection</Text>
            <Text style={s.ownerPreviewTrack} numberOfLines={2}>{current?.title} · {current?.artist}</Text>
            <Text style={s.ownerPreviewBody}>Tu as déjà gardé ce morceau. Loki Music ne le rajoute pas une deuxième fois et n’ouvre pas le choix Public/Privé.</Text>
            <View style={s.alreadyKeepRule}>
              <Text style={s.alreadyKeepRuleTitle}>Aucune action supplémentaire</Text>
              <Text style={s.ownerPreviewRuleText}>Ton morceau existant reste exactement comme il est dans ta collection.</Text>
            </View>
            {renderStoryAdd('popup')}
            <TouchableOpacity style={s.alreadyKeepNext} onPress={() => { void continueAfterAlreadyKept(); }} accessibilityLabel="Passer au morceau suivant"><Text style={s.alreadyKeepNextText}>MORCEAU SUIVANT ›</Text></TouchableOpacity>
            <TouchableOpacity style={s.alreadyKeepStay} onPress={closeAlreadyKeepInfo}><Text style={s.alreadyKeepStayText}>RESTER SUR CE MORCEAU</Text></TouchableOpacity>
          </View>
        </View>
      </KeepModal> : null}

      {previewOnly ? <KeepModal visible={previewInfoOpen} transparent animationType="fade" onRequestClose={closePreviewInfo}>
        <View style={s.keepOverlay}>
          <View style={s.ownerPreviewCard}>
            <Text style={s.ownerPreviewEyebrow}>APERÇU DE TON PROFIL</Text>
            <Text style={s.ownerPreviewTitle}>Déjà dans ta collection</Text>
            <Text style={s.ownerPreviewTrack} numberOfLines={2}>{current?.title} · {current?.artist}</Text>
            <Text style={s.ownerPreviewBody}>Tu possèdes déjà ce morceau. Le bouton GARDER est ici pour te montrer exactement ce que verront tes abonnés.</Text>
            <View style={s.ownerPreviewRule}>
              <Text style={s.ownerPreviewRuleTitle}>Pour un abonné</Text>
              <Text style={s.ownerPreviewRuleText}>GARDER ajoute le morceau à sa collection, puis il choisit « Visible sur mon profil » ou « Garder en privé ».</Text>
            </View>
            {renderStoryAdd('popup')}
            <TouchableOpacity style={s.ownerPreviewOk} onPress={closePreviewInfo}><Text style={s.ownerPreviewOkText}>COMPRIS</Text></TouchableOpacity>
            <Text style={s.ownerPreviewHint}>Cette fonction est destinée à tes abonnés.</Text>
          </View>
        </View>
      </KeepModal> : null}
      {overlay ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>{overlay}</View> : null}
    </SafeAreaView>
    </View>
  <ChatDockHost active={visible} />
  </KeepModal>;
}

const s = StyleSheet.create({
  outer:{flex:1,backgroundColor:'#090610',alignItems:'center'},
  container:{flex:1,width:'100%',maxWidth:520,backgroundColor:'#090610'},
  header:{minHeight:92,paddingHorizontal:18,paddingVertical:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#241A32'},
  headerText:{flex:1,paddingRight:12},eyebrow:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:1.5},title:{color:'#F8F6FC',fontSize:20,fontWeight:'900',marginTop:2},subtitle:{color:'#FFFFFF',fontSize:14,lineHeight:20,marginTop:6,paddingBottom:2},
  sourceIdentity:{marginTop:8,flexDirection:'row',alignItems:'center',gap:9,alignSelf:'flex-start',paddingVertical:6,paddingHorizontal:8,borderRadius:16,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},sourceIdentityBottom:{marginHorizontal:18,marginBottom:7,flexDirection:'row',alignItems:'center',gap:9,paddingVertical:6,paddingHorizontal:10,borderRadius:16,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},
  sourceAvatar:{width:30,height:30,borderRadius:15},sourceAvatarFallback:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.primaryLight},sourceAvatarText:{color:'#FFF',fontSize:12,fontWeight:'900'},sourceIdentityCopy:{minWidth:0},sourceIdentityKicker:{color:colors.textMutedGrey,fontSize:8,fontWeight:'900',letterSpacing:.7},sourceIdentityName:{color:'#FFF',fontSize:12,fontWeight:'900',marginTop:1},
  close:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#171020',borderWidth:1,borderColor:'#312348'},closeText:{color:'#FFF',fontSize:18,fontWeight:'900'},
  body:{flex:1,paddingHorizontal:18,paddingTop:16},deckArea:{flex:1,minHeight:0,paddingTop:8,paddingBottom:12},
  sourceOverlay:{position:'absolute',left:12,top:12,zIndex:4,minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:'rgba(4,3,10,.76)',borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},sourceOverlayText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  card:{flex:1,minHeight:200,maxHeight:560,borderRadius:28,overflow:'hidden',backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end'},
  cover:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},coverFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#241936'},coverK:{color:colors.primaryLight,fontSize:72,fontWeight:'900',letterSpacing:6},
  gradientFake:{padding:20,paddingTop:90,backgroundColor:'rgba(9,6,16,.68)'},autoRow:{flexDirection:'row',alignItems:'center',marginBottom:8},dot:{width:8,height:8,borderRadius:4,marginRight:6},dotOn:{backgroundColor:'#68F2B1'},dotOff:{backgroundColor:'#756B84'},autoText:{color:'#FFFFFF',fontSize:10,fontWeight:'800'},manualPlayButton:{alignSelf:'flex-start',minHeight:minTouchTarget,paddingHorizontal:14,borderRadius:17,backgroundColor:colors.keep,marginBottom:9},manualPlayText:{color:'#0B0E0B',fontSize:11,fontWeight:'900',lineHeight:34},trackTitle:{color:'#FFF',fontSize:28,lineHeight:32,fontWeight:'900'},artist:{color:'#F0EAF7',fontSize:16,fontWeight:'800',marginTop:6},album:{color:'#FFFFFF',fontSize:12,marginTop:3},
  sourceProfileButton:{minHeight:minTouchTarget,marginHorizontal:4,marginBottom:8,borderRadius:21,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center',paddingHorizontal:12},sourceProfileButtonText:{color:'#FFF',fontSize:11,fontWeight:'900',letterSpacing:.25,textAlign:'center'},
  deckHint:{marginTop:14,marginBottom:6,paddingHorizontal:6,color:'#FFFFFF',fontSize:13,lineHeight:19,fontWeight:'800',textAlign:'center'},
  addStoryButton:{minHeight:minTouchTarget,marginHorizontal:4,marginBottom:8,borderRadius:20,borderWidth:1,borderColor:'#7C5CFC',backgroundColor:'#1B1230',alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  addStoryButtonLit:{borderColor:'#B79CFF',backgroundColor:'#7C5CFC'},
  addStoryButtonJust:{borderColor:'#68F2B1',backgroundColor:'#12B76A'},
  addStoryTextJust:{color:'#04170E'},
  storyCongrats:{color:'#68F2B1',fontSize:13,lineHeight:18,fontWeight:'800',textAlign:'center',marginHorizontal:6,marginBottom:8,marginTop:-2},
  storySaleNote2:{color:'#FFB020',fontSize:12,lineHeight:17,fontWeight:'800',textAlign:'center',marginHorizontal:6,marginBottom:8,marginTop:-2},
  storySaleNote:{marginHorizontal:4,marginBottom:8,marginTop:6,borderRadius:14,borderWidth:1,borderColor:'#FFB020',backgroundColor:'rgba(255,176,32,.10)',padding:10},
  storySaleNoteTitle:{color:'#FFB020',fontSize:12,fontWeight:'900',textAlign:'center'},
  storySaleNoteText:{color:'#FFFFFF',fontSize:13,lineHeight:18,textAlign:'center',marginTop:3},
  addStoryButtonDone:{borderColor:'#5C5468',backgroundColor:'#27222E'},
  addStoryTextDone:{color:'#E6E0EE'},
  addStoryText:{color:'#FFFFFF',fontSize:13,fontWeight:'900',letterSpacing:.5,textAlign:'center'},
  headerExtraCompact:{maxHeight:24,overflow:'hidden'},
  cardCompact:{minHeight:120},
  gradientCompact:{paddingTop:12,paddingBottom:12},
  fullTrackLocked:{color:'#FFFFFF',fontSize:13,lineHeight:18,fontWeight:'800',textAlign:'center',marginHorizontal:4,marginBottom:12,paddingVertical:6},
  fullTrackButton:{minHeight:minTouchTarget,marginHorizontal:4,marginBottom:8,borderRadius:20,borderWidth:1,borderColor:'#6E4BA3',backgroundColor:'#171020',alignItems:'center',justifyContent:'center',paddingHorizontal:12},fullTrackButtonText:{color:'#D8C5FF',fontSize:11,fontWeight:'900',letterSpacing:.35,textAlign:'center'},decisionBand:{marginHorizontal:-18,backgroundColor:'#050408',borderTopWidth:1,borderTopColor:'#211A2B',paddingHorizontal:18,paddingTop:10,paddingBottom:12},decisionRow:{flexDirection:'row',alignItems:'stretch',gap:7},decisionButton:{flex:1,minHeight:minTouchTarget,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:5,borderWidth:1},passButton:{backgroundColor:colors.pass,borderColor:colors.pass},passButtonText:{color:colors.white,fontSize:13,fontWeight:'900'},backDecisionButton:{backgroundColor:'#171020',borderColor:'#5B3F8C'},backDecisionText:{color:'#CDB7F4',fontSize:12,fontWeight:'900',textAlign:'center'},keepButton:{backgroundColor:colors.keep,borderColor:colors.keep},keepButtonText:{color:colors.black,fontSize:13,fontWeight:'900',textAlign:'center'},keepButtonAlready:{backgroundColor:'#27222E',borderColor:'#5C5468'},keepButtonTextAlready:{color:'#FFFFFF',fontSize:12},
  storyAge:{color:'#2DE1C2',fontSize:13,lineHeight:18,fontWeight:'800',marginTop:4},
  titleRow:{flexDirection:'row',alignItems:'center',minWidth:0},titleBadge:{marginLeft:8,flexShrink:0},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:24},emptyIcon:{fontSize:48,color:colors.primaryLight},emptyTitle:{color:'#F8F6FC',fontSize:16,fontWeight:'900',marginTop:10,textAlign:'center'},preparingHint:{color:'#FFFFFF',fontSize:12,lineHeight:17,textAlign:'center',marginTop:7,maxWidth:300},backButton:{marginTop:18,minHeight:minTouchTarget,paddingHorizontal:22,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},backText:{color:'#FFF',fontWeight:'900',fontSize:13},
  keepOverlay:{flex:1,backgroundColor:'rgba(4,3,8,.82)',alignItems:'center',justifyContent:'center',paddingHorizontal:22},
  keepPromptCard:{width:'100%',maxWidth:390,borderRadius:26,backgroundColor:'#151020',borderWidth:1,borderColor:'#6E4BA3',padding:20,shadowColor:'#000',shadowOpacity:.42,shadowRadius:22,shadowOffset:{width:0,height:10},elevation:16},
  keepPromptEyebrow:{color:'#B79CFF',fontSize:11,fontWeight:'900',letterSpacing:1.3,textAlign:'center'},keepPromptTitle:{color:'#FFF',fontSize:22,fontWeight:'900',textAlign:'center',marginTop:6},keepPromptTrack:{color:'#D8CFE3',fontSize:12,fontWeight:'800',textAlign:'center',marginTop:5},keepPromptBody:{color:'#FFFFFF',fontSize:13,lineHeight:18,textAlign:'center',marginTop:10,marginBottom:14},
  keepCostNotice:{minHeight:58,borderRadius:16,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',paddingHorizontal:12,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10,marginBottom:6},keepCostNoticeIcon:{color:colors.keep,fontSize:20,fontWeight:'900'},keepCostNoticeCopy:{flex:1,minWidth:0},keepCostNoticeTitle:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:.9},keepCostNoticeText:{color:'#FFF',fontSize:11,lineHeight:15,fontWeight:'800',marginTop:2},
  keepSuccessCard:{width:'100%',maxWidth:356,borderRadius:26,borderWidth:1,borderColor:colors.keep,backgroundColor:'#151020',paddingHorizontal:20,paddingVertical:22,alignItems:'center',shadowColor:colors.keep,shadowOpacity:.24,shadowRadius:18,shadowOffset:{width:0,height:7},elevation:14},keepSuccessBadge:{width:50,height:50,borderRadius:25,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.12)',alignItems:'center',justifyContent:'center'},keepSuccessBadgeText:{color:colors.keep,fontSize:24,fontWeight:'900'},keepSuccessEyebrow:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.1,marginTop:12},keepSuccessTitle:{color:'#FFF',fontSize:20,fontWeight:'900',textAlign:'center',marginTop:5},keepSuccessTrack:{color:colors.textSecondary,fontSize:12,fontWeight:'800',textAlign:'center',marginTop:6},keepSuccessDebit:{minWidth:150,minHeight:58,borderRadius:18,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',alignItems:'center',justifyContent:'center',marginTop:16,paddingHorizontal:18},keepSuccessDebitAmount:{color:colors.keep,fontSize:22,fontWeight:'900'},keepSuccessDebitText:{color:'#FFF',fontSize:9,fontWeight:'800',letterSpacing:.5,marginTop:1},keepSuccessBody:{color:colors.textSecondary,fontSize:11,lineHeight:16,textAlign:'center',marginTop:12},keepSuccessButton:{width:'100%',minHeight:48,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:16},keepSuccessButtonText:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:.8},
  keepChoice:{minHeight:70,borderRadius:17,paddingHorizontal:15,paddingVertical:12,justifyContent:'center',marginTop:9,borderWidth:1},keepChoicePublic:{backgroundColor:'rgba(104,242,177,.12)',borderColor:'#68F2B1'},keepChoicePrivate:{backgroundColor:'#21182F',borderColor:'#5B3F8C'},keepChoicePublicTitle:{color:'#68F2B1',fontSize:13,fontWeight:'900'},keepChoicePrivateTitle:{color:'#D6C2FA',fontSize:13,fontWeight:'900'},keepChoiceText:{color:'#FFFFFF',fontSize:12,lineHeight:16,marginTop:3},
  keepCancel:{minHeight:minTouchTarget,alignItems:'center',justifyContent:'center',marginTop:12,borderRadius:14,borderWidth:1,borderColor:'#57313C',backgroundColor:'#1C1117'},keepCancelText:{color:'#FF8AA3',fontSize:12,fontWeight:'900'},keepCancelHint:{color:'#FFFFFF',fontSize:11,lineHeight:15,textAlign:'center',marginTop:7},
  ownerPreviewCard:{width:'100%',maxWidth:350,borderRadius:22,backgroundColor:'#151020',borderWidth:1,borderColor:'#6E4BA3',padding:18,shadowColor:'#000',shadowOpacity:.42,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:14},
  ownerPreviewEyebrow:{color:'#B79CFF',fontSize:11,fontWeight:'900',letterSpacing:1.2,textAlign:'center'},ownerPreviewTitle:{color:'#FFF',fontSize:19,fontWeight:'900',textAlign:'center',marginTop:5},ownerPreviewTrack:{color:'#D8CFE3',fontSize:14,fontWeight:'800',textAlign:'center',marginTop:5},ownerPreviewBody:{color:'#FFFFFF',fontSize:14,lineHeight:20,textAlign:'center',marginTop:9},ownerPreviewRule:{marginTop:12,borderRadius:14,backgroundColor:'rgba(104,242,177,.08)',borderWidth:1,borderColor:'rgba(104,242,177,.34)',padding:11},ownerPreviewRuleTitle:{color:'#68F2B1',fontSize:12,fontWeight:'900'},ownerPreviewRuleText:{color:'#FFFFFF',fontSize:13,lineHeight:18,marginTop:3},ownerStoryButton:{minHeight:minTouchTarget,borderRadius:21,borderWidth:1,borderColor:'#7C5CFC',backgroundColor:'#1B1230',alignItems:'center',justifyContent:'center',marginTop:13,paddingHorizontal:12},ownerStoryButtonText:{color:'#FFFFFF',fontSize:13,fontWeight:'900',letterSpacing:.5,textAlign:'center'},ownerPreviewOk:{minHeight:minTouchTarget,borderRadius:21,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:13},ownerPreviewOkText:{color:'#FFF',fontSize:13,fontWeight:'900'},ownerPreviewHint:{color:'#FFFFFF',fontSize:13,textAlign:'center',marginTop:7},
  alreadyKeepEyebrow:{color:'#FFFFFF',fontSize:11,fontWeight:'900',letterSpacing:1.2,textAlign:'center'},alreadyKeepRule:{marginTop:12,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#4A4254',padding:11},alreadyKeepRuleTitle:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},alreadyKeepNext:{minHeight:minTouchTarget,borderRadius:22,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',marginTop:13},alreadyKeepNextText:{color:'#FFF',fontSize:12,fontWeight:'900'},alreadyKeepStay:{minHeight:minTouchTarget,alignItems:'center',justifyContent:'center',marginTop:4},alreadyKeepStayText:{color:'#FFFFFF',fontSize:11,fontWeight:'800'},
});
