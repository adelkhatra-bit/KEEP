import ChatDockHost from './ChatDockHost';
import KeepVisibilityChoiceModal, { KeepSuccessModal } from './KeepVisibilityChoiceModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import type { CanonicalTrack } from '@keep/music';
import SwipeDeck from './SwipeDeck';
import { isTrackPreviewActive, playTrackPreviewFromGesture, preloadTrackPreview, stopTrackPreview, stopTrackPreviewFast, toggleTrackPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { resolveTrackExternalDestination } from '../services/trackExternalLinkService';
import { checkOwnKeepLibrary } from '../services/connectedMusicLibrary';
import { recordProfileSwipeListen } from '../services/profileSwipeListenService';
import { colors } from '../theme/colors';

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
  backLabel?: string;
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
  backLabel,
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
  const currentSource = current ? sourceByTrack?.[current.id] : undefined;
  const currentSourceUsername = currentSource?.username || sourceUsername;
  const currentSourceProfileId = currentSource?.profileId || sourceProfileId;
  const resolvedBackLabel = backLabel || (loop ? 'REVENIR AU PROFIL' : 'REVENIR À LA SESSION');
  const currentAlreadyKept = !previewOnly && alreadyKeptState === 'yes';
  const fullTrackDestination = current ? resolveTrackExternalDestination(current) : null;
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
  }, [visible, loop, socialDiscoveryMode, initialTrackId]);

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

        await stopTrackPreview();
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
            void resolveTrackPreviewUrl(nextTrack)
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
            await stopTrackPreview();
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
              void resolveTrackPreviewUrl(nextTrack)
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
      if (result !== false) {
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
    if (!current || processing) return;
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

  const swipeHint = previewOnly
    ? '↑ suivant · ← passer · → garder'
    : currentAlreadyKept
      ? '↑ suivant · ← passer · déjà dans ta collection'
      : askVisibilityOnKeep
        ? '↑ suivant · ← passer · → garder puis choisir profil ou privé'
        : '↑ suivant · ← passer · → ajouter à ta collection';

  const controlsLocked = processing || preparingDeck || keepPromptOpen || !!keepSuccess || previewInfoOpen || alreadyKeepInfoOpen;
  const resolvedSubtitle = prefilterRemovedCount > 0
    ? `${subtitle ? `${subtitle} · ` : ''}${prefilterRemovedCount} déjà dans ta collection ignoré${prefilterRemovedCount > 1 ? 's' : ''}.`
    : subtitle;
  const resolvedEmptyTitle = socialDiscoveryMode && prefilterVerified && prefilterRemovedCount > 0
    ? prefilterRemovedCount >= tracksRef.current.length
      ? 'Tu as déjà tous les morceaux publics de ce profil dans ta collection.'
      : 'Tu as terminé toutes les nouvelles musiques de ce profil.'
    : emptyTitle;

  return <Modal visible={visible} animationType="slide" onRequestClose={() => { void close(); }} presentationStyle="fullScreen">
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.eyebrow}>Loki Music SWIPE</Text>
          <Text style={s.title}>{title}</Text>
          {resolvedSubtitle ? <Text style={s.subtitle}>{resolvedSubtitle}</Text> : null}
        </View>
        <TouchableOpacity style={s.close} onPress={() => { void close(); }} accessibilityLabel="Fermer le swipe"><Text style={s.closeText}>✕</Text></TouchableOpacity>
      </View>

      <View style={s.body}>
        {preparingDeck ? <View style={s.empty}><ActivityIndicator color={colors.primaryLight} size="large" /><Text style={s.emptyTitle}>Préparation des nouvelles musiques…</Text><Text style={s.preparingHint}>Loki Music prépare les extraits de ce profil.</Text></View> : !current ? <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.emptyTitle}>{resolvedEmptyTitle}</Text><TouchableOpacity style={s.backButton} onPress={() => { void close(); }}><Text style={s.backText}>{resolvedBackLabel}</Text></TouchableOpacity></View> : <>
          <View style={s.deckArea}>
            <SwipeDeck
              resetKey={`${current.id}-${index}`}
              enabled={!controlsLocked}
              onSwipeLeft={() => { void pass(); }}
              onSwipeRight={() => { void requestKeep(); }}
              onSwipeUp={() => {
                if (controlsLocked) return;
                actionInFlight.current = true;
                void advance().finally(() => { actionInFlight.current = false; });
              }}
              leftLabel="PASSER"
              rightLabel={currentAlreadyKept ? 'DÉJÀ' : 'GARDER'}
              upLabel="SUIVANT"
              hint={`↑ morceau suivant · ${swipeHint}`}
            >
              <View style={s.card}>
                {current.artworkUrl ? <Image source={{ uri: current.artworkUrl }} style={s.cover as any} resizeMode="cover" /> : <View style={[s.cover,s.coverFallback]}><Text style={s.coverK}>K</Text></View>}
                {currentSourceUsername ? <TouchableOpacity style={s.sourceOverlay} onPress={() => onOpenSourceProfile?.(currentSourceUsername.replace(/^@/, ''))} disabled={!onOpenSourceProfile} accessibilityLabel={`Découvert par ${currentSourceUsername.replace(/^@/, '')}. Ouvrir son profil`}><Text style={s.sourceOverlayText}>Découvert par @{currentSourceUsername.replace(/^@/, '')}</Text></TouchableOpacity> : null}
                <View style={s.gradientFake}>
                  <View style={s.autoRow}><View style={[s.dot,resolvedPreviewUrl ? s.dotOn : s.dotOff]} /><Text style={s.autoText}>{previewLabel}</Text></View>
                  {Platform.OS === 'web' && (autoplayBlocked || previewEnded) && resolvedPreviewUrl ? (
                    <TouchableOpacity style={s.manualPlayButton} onPress={() => { unlockWebAudioForGesture(); setPreviewEnded(false); void manualPlay(); }} accessibilityLabel={previewEnded ? "Réécouter l’extrait" : "Lancer l’extrait"}>
                      <Text style={s.manualPlayText}>{previewEnded ? '↻ RÉÉCOUTER' : '▶ ÉCOUTER L’EXTRAIT'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <Text style={s.trackTitle} numberOfLines={2}>{current.title}</Text>
                  <Text style={s.artist} numberOfLines={1}>{current.artist}</Text>
                  {current.album ? <Text style={s.album} numberOfLines={1}>{current.album}</Text> : null}
                </View>
              </View>
            </SwipeDeck>
          </View>


          {currentSourceUsername && onOpenSourceProfile ? <TouchableOpacity style={s.sourceProfileButton} onPress={() => onOpenSourceProfile(currentSourceUsername.replace(/^@/, ''))} accessibilityLabel={`Voir le profil du premier découvreur ${currentSourceUsername.replace(/^@/, '')}`}><Text style={s.sourceProfileButtonText}>◎ DÉCOUVERT PAR @{currentSourceUsername.replace(/^@/, '')} · VOIR / SUIVRE</Text></TouchableOpacity> : null}
          {fullTrackDestination ? <TouchableOpacity style={s.fullTrackButton} onPress={openFullTrack} accessibilityLabel={fullTrackDestination.label}><Text style={s.fullTrackButtonText}>↗ {fullTrackDestination.label}</Text></TouchableOpacity> : null}
                    <View style={s.decisionBand}>
            <View style={s.decisionRow}>
              <TouchableOpacity style={[s.decisionButton, s.passButton]} onPress={() => { void pass(); }} disabled={controlsLocked} accessibilityLabel="Passer cette musique">
                <Text style={s.passButtonText}>PASSER</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.decisionButton, s.backDecisionButton]} onPress={() => { void close(); }} disabled={controlsLocked} accessibilityLabel={resolvedBackLabel}>
                <Text style={s.backDecisionText}>‹ PROFIL</Text>
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
          continueLabel="CONTINUER"
          onContinue={continueAfterKeepSuccess}
        />
      ) : null}

      {!previewOnly ? <Modal visible={alreadyKeepInfoOpen} transparent animationType="fade" onRequestClose={closeAlreadyKeepInfo}>
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
            <TouchableOpacity style={s.alreadyKeepNext} onPress={() => { void continueAfterAlreadyKept(); }} accessibilityLabel="Passer au morceau suivant"><Text style={s.alreadyKeepNextText}>MORCEAU SUIVANT ›</Text></TouchableOpacity>
            <TouchableOpacity style={s.alreadyKeepStay} onPress={closeAlreadyKeepInfo}><Text style={s.alreadyKeepStayText}>RESTER SUR CE MORCEAU</Text></TouchableOpacity>
          </View>
        </View>
      </Modal> : null}

      {previewOnly ? <Modal visible={previewInfoOpen} transparent animationType="fade" onRequestClose={closePreviewInfo}>
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
            <TouchableOpacity style={s.ownerPreviewOk} onPress={closePreviewInfo}><Text style={s.ownerPreviewOkText}>COMPRIS</Text></TouchableOpacity>
            <Text style={s.ownerPreviewHint}>Cette fonction est destinée à tes abonnés.</Text>
          </View>
        </View>
      </Modal> : null}
    </SafeAreaView>
  <ChatDockHost active={visible} />
  </Modal>;
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#090610'},
  header:{minHeight:78,paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#241A32'},
  headerText:{flex:1,paddingRight:12},eyebrow:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:1.5},title:{color:'#F8F6FC',fontSize:20,fontWeight:'900',marginTop:2},subtitle:{color:'#FFFFFF',fontSize:12,marginTop:3},
  sourceIdentity:{marginTop:8,flexDirection:'row',alignItems:'center',gap:9,alignSelf:'flex-start',paddingVertical:6,paddingHorizontal:8,borderRadius:16,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},sourceIdentityBottom:{marginHorizontal:18,marginBottom:7,flexDirection:'row',alignItems:'center',gap:9,paddingVertical:6,paddingHorizontal:10,borderRadius:16,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},
  sourceAvatar:{width:30,height:30,borderRadius:15},sourceAvatarFallback:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.primaryLight},sourceAvatarText:{color:'#FFF',fontSize:12,fontWeight:'900'},sourceIdentityCopy:{minWidth:0},sourceIdentityKicker:{color:colors.textMutedGrey,fontSize:8,fontWeight:'900',letterSpacing:.7},sourceIdentityName:{color:'#FFF',fontSize:12,fontWeight:'900',marginTop:1},
  close:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#171020',borderWidth:1,borderColor:'#312348'},closeText:{color:'#FFF',fontSize:18,fontWeight:'900'},
  body:{flex:1,paddingHorizontal:18},deckArea:{flex:1,justifyContent:'center',paddingBottom:10},
  sourceOverlay:{position:'absolute',left:12,top:12,zIndex:4,minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:'rgba(4,3,10,.76)',borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},sourceOverlayText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  card:{height:500,maxHeight:'70%',borderRadius:28,overflow:'hidden',backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end'},
  cover:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},coverFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#241936'},coverK:{color:colors.primaryLight,fontSize:72,fontWeight:'900',letterSpacing:6},
  gradientFake:{padding:20,paddingTop:90,backgroundColor:'rgba(9,6,16,.68)'},autoRow:{flexDirection:'row',alignItems:'center',marginBottom:8},dot:{width:8,height:8,borderRadius:4,marginRight:6},dotOn:{backgroundColor:'#68F2B1'},dotOff:{backgroundColor:'#756B84'},autoText:{color:'#FFFFFF',fontSize:10,fontWeight:'800'},manualPlayButton:{alignSelf:'flex-start',minHeight:34,paddingHorizontal:14,borderRadius:17,backgroundColor:colors.keep,marginBottom:9},manualPlayText:{color:'#0B0E0B',fontSize:11,fontWeight:'900',lineHeight:34},trackTitle:{color:'#FFF',fontSize:28,lineHeight:32,fontWeight:'900'},artist:{color:'#F0EAF7',fontSize:16,fontWeight:'800',marginTop:6},album:{color:'#FFFFFF',fontSize:12,marginTop:3},
  sourceProfileButton:{minHeight:42,marginHorizontal:4,marginBottom:8,borderRadius:21,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center',paddingHorizontal:12},sourceProfileButtonText:{color:'#FFF',fontSize:11,fontWeight:'900',letterSpacing:.25,textAlign:'center'},
  fullTrackButton:{minHeight:40,marginHorizontal:4,marginBottom:8,borderRadius:20,borderWidth:1,borderColor:'#6E4BA3',backgroundColor:'#171020',alignItems:'center',justifyContent:'center',paddingHorizontal:12},fullTrackButtonText:{color:'#D8C5FF',fontSize:11,fontWeight:'900',letterSpacing:.35,textAlign:'center'},decisionBand:{marginHorizontal:-18,backgroundColor:'#050408',borderTopWidth:1,borderTopColor:'#211A2B',paddingHorizontal:18,paddingTop:10,paddingBottom:12},decisionRow:{flexDirection:'row',alignItems:'stretch',gap:7},decisionButton:{flex:1,minHeight:46,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:5,borderWidth:1},passButton:{backgroundColor:colors.pass,borderColor:colors.pass},passButtonText:{color:colors.white,fontSize:13,fontWeight:'900'},backDecisionButton:{backgroundColor:'#171020',borderColor:'#5B3F8C'},backDecisionText:{color:'#CDB7F4',fontSize:12,fontWeight:'900',textAlign:'center'},keepButton:{backgroundColor:colors.keep,borderColor:colors.keep},keepButtonText:{color:colors.black,fontSize:13,fontWeight:'900',textAlign:'center'},keepButtonAlready:{backgroundColor:'#27222E',borderColor:'#5C5468'},keepButtonTextAlready:{color:'#FFFFFF',fontSize:12},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:24},emptyIcon:{fontSize:48,color:colors.primaryLight},emptyTitle:{color:'#F8F6FC',fontSize:16,fontWeight:'900',marginTop:10,textAlign:'center'},preparingHint:{color:'#FFFFFF',fontSize:12,lineHeight:17,textAlign:'center',marginTop:7,maxWidth:300},backButton:{marginTop:18,minHeight:46,paddingHorizontal:22,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},backText:{color:'#FFF',fontWeight:'900',fontSize:13},
  keepOverlay:{flex:1,backgroundColor:'rgba(4,3,8,.82)',alignItems:'center',justifyContent:'center',paddingHorizontal:22},
  keepPromptCard:{width:'100%',maxWidth:390,borderRadius:26,backgroundColor:'#151020',borderWidth:1,borderColor:'#6E4BA3',padding:20,shadowColor:'#000',shadowOpacity:.42,shadowRadius:22,shadowOffset:{width:0,height:10},elevation:16},
  keepPromptEyebrow:{color:'#B79CFF',fontSize:11,fontWeight:'900',letterSpacing:1.3,textAlign:'center'},keepPromptTitle:{color:'#FFF',fontSize:22,fontWeight:'900',textAlign:'center',marginTop:6},keepPromptTrack:{color:'#D8CFE3',fontSize:12,fontWeight:'800',textAlign:'center',marginTop:5},keepPromptBody:{color:'#FFFFFF',fontSize:13,lineHeight:18,textAlign:'center',marginTop:10,marginBottom:14},
  keepCostNotice:{minHeight:58,borderRadius:16,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',paddingHorizontal:12,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10,marginBottom:6},keepCostNoticeIcon:{color:colors.keep,fontSize:20,fontWeight:'900'},keepCostNoticeCopy:{flex:1,minWidth:0},keepCostNoticeTitle:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:.9},keepCostNoticeText:{color:'#FFF',fontSize:11,lineHeight:15,fontWeight:'800',marginTop:2},
  keepSuccessCard:{width:'100%',maxWidth:356,borderRadius:26,borderWidth:1,borderColor:colors.keep,backgroundColor:'#151020',paddingHorizontal:20,paddingVertical:22,alignItems:'center',shadowColor:colors.keep,shadowOpacity:.24,shadowRadius:18,shadowOffset:{width:0,height:7},elevation:14},keepSuccessBadge:{width:50,height:50,borderRadius:25,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.12)',alignItems:'center',justifyContent:'center'},keepSuccessBadgeText:{color:colors.keep,fontSize:24,fontWeight:'900'},keepSuccessEyebrow:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.1,marginTop:12},keepSuccessTitle:{color:'#FFF',fontSize:20,fontWeight:'900',textAlign:'center',marginTop:5},keepSuccessTrack:{color:colors.textSecondary,fontSize:12,fontWeight:'800',textAlign:'center',marginTop:6},keepSuccessDebit:{minWidth:150,minHeight:58,borderRadius:18,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',alignItems:'center',justifyContent:'center',marginTop:16,paddingHorizontal:18},keepSuccessDebitAmount:{color:colors.keep,fontSize:22,fontWeight:'900'},keepSuccessDebitText:{color:'#FFF',fontSize:9,fontWeight:'800',letterSpacing:.5,marginTop:1},keepSuccessBody:{color:colors.textSecondary,fontSize:11,lineHeight:16,textAlign:'center',marginTop:12},keepSuccessButton:{width:'100%',minHeight:48,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:16},keepSuccessButtonText:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:.8},
  keepChoice:{minHeight:70,borderRadius:17,paddingHorizontal:15,paddingVertical:12,justifyContent:'center',marginTop:9,borderWidth:1},keepChoicePublic:{backgroundColor:'rgba(104,242,177,.12)',borderColor:'#68F2B1'},keepChoicePrivate:{backgroundColor:'#21182F',borderColor:'#5B3F8C'},keepChoicePublicTitle:{color:'#68F2B1',fontSize:13,fontWeight:'900'},keepChoicePrivateTitle:{color:'#D6C2FA',fontSize:13,fontWeight:'900'},keepChoiceText:{color:'#FFFFFF',fontSize:12,lineHeight:16,marginTop:3},
  keepCancel:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:12,borderRadius:14,borderWidth:1,borderColor:'#57313C',backgroundColor:'#1C1117'},keepCancelText:{color:'#FF8AA3',fontSize:12,fontWeight:'900'},keepCancelHint:{color:'#FFFFFF',fontSize:11,lineHeight:15,textAlign:'center',marginTop:7},
  ownerPreviewCard:{width:'100%',maxWidth:350,borderRadius:22,backgroundColor:'#151020',borderWidth:1,borderColor:'#6E4BA3',padding:18,shadowColor:'#000',shadowOpacity:.42,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:14},
  ownerPreviewEyebrow:{color:'#B79CFF',fontSize:11,fontWeight:'900',letterSpacing:1.2,textAlign:'center'},ownerPreviewTitle:{color:'#FFF',fontSize:19,fontWeight:'900',textAlign:'center',marginTop:5},ownerPreviewTrack:{color:'#D8CFE3',fontSize:12,fontWeight:'800',textAlign:'center',marginTop:5},ownerPreviewBody:{color:'#FFFFFF',fontSize:12,lineHeight:17,textAlign:'center',marginTop:9},ownerPreviewRule:{marginTop:12,borderRadius:14,backgroundColor:'rgba(104,242,177,.08)',borderWidth:1,borderColor:'rgba(104,242,177,.34)',padding:11},ownerPreviewRuleTitle:{color:'#68F2B1',fontSize:12,fontWeight:'900'},ownerPreviewRuleText:{color:'#FFFFFF',fontSize:11,lineHeight:16,marginTop:3},ownerPreviewOk:{minHeight:42,borderRadius:21,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:13},ownerPreviewOkText:{color:'#FFF',fontSize:12,fontWeight:'900'},ownerPreviewHint:{color:'#FFFFFF',fontSize:11,textAlign:'center',marginTop:7},
  alreadyKeepEyebrow:{color:'#FFFFFF',fontSize:11,fontWeight:'900',letterSpacing:1.2,textAlign:'center'},alreadyKeepRule:{marginTop:12,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#4A4254',padding:11},alreadyKeepRuleTitle:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},alreadyKeepNext:{minHeight:44,borderRadius:22,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',marginTop:13},alreadyKeepNextText:{color:'#FFF',fontSize:12,fontWeight:'900'},alreadyKeepStay:{minHeight:38,alignItems:'center',justifyContent:'center',marginTop:4},alreadyKeepStayText:{color:'#FFFFFF',fontSize:11,fontWeight:'800'},
});
